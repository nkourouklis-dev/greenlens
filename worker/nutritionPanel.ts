/**
 * Reads the declared per-100 quantities out of a nutrition table that sits
 * on the *same photo* as an ingredient list ("mixed" labels).
 *
 * Why this exists: the ingredients path used to judge sugar and salt from
 * the mere presence of the words in the list — a curated rule charging a
 * fixed penalty for "Ζάχαρη" wherever it appears. The nutrition path already
 * does better, scoring the printed quantities against published bands (see
 * nutritionThresholds.ts). When both are on the label, the numbers are
 * simply the better evidence, so they have to reach the ingredients scorer.
 *
 * Deterministic on purpose. The alternative — a second AI call on the
 * nutrition block — would add latency to every mixed scan and, worse, make
 * the score irreproducible: the PIM recompute (rescore.ts) runs without any
 * model, so anything only the model could see would make an admin save
 * disagree with the scan it saved. Everything here is a pure function of the
 * OCR text, and the readings it returns are persisted with the analysis.
 *
 * Azure OCR reads a printed table *column by column*, so a row arrives as a
 * name line followed by one line per column:
 *
 *     Αλάτι
 *     0,91g      <- per 100 g
 *     0,27g      <- per 30 g portion
 *     0,42g      <- per portion with milk
 *
 * The first amount of a run is therefore the per-100 column, which is the
 * one the thresholds are defined against. Row-oriented tables ("Αλάτι 0,91
 * g") are handled by the same walk.
 */

import {
  isBeverageTable,
  type NutrientKey,
  type NutrientReading,
} from "./nutritionThresholds";

export interface NutritionPanel {
  /** Per-100 readings for the nutrients the thresholds score. */
  readings: NutrientReading[];
  /** Declared per 100 ml — sugars are banded far more harshly. */
  isBeverage: boolean;
}

/**
 * The panel carries more than the scored nutrients: total fat and
 * carbohydrate are read purely so the plausibility checks below have
 * something to cross-check the rest against.
 */
type PanelKey = NutrientKey | "fat" | "carbohydrate";

/**
 * Ordered most-specific-first, and matched in this order: "εκ των οποίων
 * κορεσμένα" must not read as plain fat, and "εκ των οποίων σάκχαρα" must
 * not read as carbohydrate.
 */
const PANEL_PATTERNS: Array<[PanelKey, RegExp]> = [
  ["saturates", /(saturat|κορεσμ)/i],
  ["sugars", /(sugar|σακχαρ|σάκχαρ|ζάχαρ|ζαχαρ)/i],
  ["fibre", /(fibre|fiber|ίνες|ινες|εδώδιμ|εδωδιμ)/i],
  ["protein", /(protein|πρωτε)/i],
  ["salt", /(salt|sodium|αλάτι|αλατι|νάτριο|νατριο)/i],
  ["fat", /(λιπαρ|λίπ|\bfats?\b)/i],
  ["carbohydrate", /(υδαταν|υδατάν|carbohydrate|carbs?\b)/i],
];

function keyForName(name: string): PanelKey | null {
  for (const [key, pattern] of PANEL_PATTERNS) {
    if (pattern.test(name)) {
      return key;
    }
  }

  return null;
}

const AMOUNT_PATTERN =
  /(\d+(?:[.,]\d+)?)\s*(kj|kcal|mg|µg|μg|mcg|g|γρ)\b/gi;

const GRAMS_PER_UNIT: Record<string, number> = {
  g: 1,
  γρ: 1,
  mg: 0.001,
  µg: 0.000001,
  μg: 0.000001,
  mcg: 0.000001,
};

interface Amount {
  /** Grams, or null for an energy amount (kJ/kcal). */
  grams: number | null;
  /** Set only for a kcal amount; kJ is tracked separately, see below. */
  kcal: number | null;
  /** Set only for a kJ amount. */
  kilojoules: number | null;
  /** The amount exactly as printed, for the user-facing explanation. */
  declared: string;
}

function parseAmounts(line: string): {
  amounts: Amount[];
  head: string;
} {
  const amounts: Amount[] = [];

  AMOUNT_PATTERN.lastIndex = 0;

  let head = line;
  let match: RegExpExecArray | null;

  while ((match = AMOUNT_PATTERN.exec(line)) !== null) {
    if (amounts.length === 0) {
      head = line.slice(0, match.index);
    }

    const value = Number(match[1].replace(",", "."));

    if (!Number.isFinite(value) || value < 0) {
      continue;
    }

    const unit = match[2].toLowerCase();
    const perGram = GRAMS_PER_UNIT[unit];

    amounts.push({
      grams: perGram === undefined ? null : value * perGram,
      kcal: unit === "kcal" ? value : null,
      kilojoules: unit === "kj" ? value : null,
      declared: match[0].trim(),
    });
  }

  return { amounts, head: head.trim() };
}

/**
 * A nutrient name printed to the left of (or above) its numbers. Rejects
 * anything that reads like prose or like an ingredient list — a comma is
 * the giveaway for the latter, since EU ingredient lists are
 * comma-separated and a nutrient name never is.
 */
function isNameFragment(text: string): boolean {
  return (
    text.length > 0 &&
    text.length <= 40 &&
    !text.includes(",") &&
    /\p{L}{2,}/u.test(text)
  );
}

/**
 * How many preceding name lines a column-split row may be built from: "εκ
 * των οποίων" + "κορεσμένα" needs two, and taking more starts swallowing
 * unrelated label text that happens to sit above the table.
 */
const MAX_NAME_LINES = 2;

interface PanelValue {
  grams: number;
  declared: string;
}

function readPanelValues(rawText: string): {
  values: Map<PanelKey, PanelValue>;
  energyKcal: number | null;
} {
  const values = new Map<PanelKey, PanelValue>();

  let kcal: number | null = null;
  let kilojoules: number | null = null;
  let pending: string[] = [];

  for (const rawLine of rawText.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (line.length === 0) {
      continue;
    }

    const { amounts, head } = parseAmounts(line);

    if (amounts.length === 0) {
      if (/\p{L}/u.test(line)) {
        pending.push(line);
      }

      continue;
    }

    const name = isNameFragment(head)
      ? head
      : pending.slice(-MAX_NAME_LINES).join(" ");

    pending = [];

    // Energy is read from whichever row carries it, without needing its
    // name matched: OCR often drops "Ενέργεια" onto a line of its own and
    // then interleaves unrelated packaging words between the kJ and the
    // kcal columns, so the unit rather than the row name identifies it.
    // Both columns are per-100 first, so the first of each unit wins.
    for (const amount of amounts) {
      if (amount.kcal !== null && kcal === null) {
        kcal = amount.kcal;
      }

      if (amount.kilojoules !== null && kilojoules === null) {
        kilojoules = amount.kilojoules;
      }
    }

    const key = keyForName(name);

    if (key === null || values.has(key)) {
      continue;
    }

    // The per-100 column is printed first (see the file comment), so the
    // first mass amount of the run is the one the thresholds want.
    const mass = amounts.find((amount) => amount.grams !== null);

    if (!mass || mass.grams === null) {
      continue;
    }

    // Sodium is declared as an alternative to salt, never in addition;
    // EU labelling converts one to the other at this ratio.
    const isSodium = /(sodium|νάτριο|νατριο)/i.test(name);

    values.set(key, {
      grams:
        key === "salt" && isSodium
          ? mass.grams * 2.5
          : mass.grams,
      declared: mass.declared,
    });
  }

  // kcal is what the cross-check below is expressed in, so a declared kcal
  // is used as printed and the kJ column only stands in when there isn't
  // one. Deliberately not averaged: two figures that disagree mean one of
  // them was misread, and the check is there to catch exactly that.
  return {
    values,
    energyKcal:
      kcal ?? (kilojoules === null ? null : kilojoules / 4.184),
  };
}

/**
 * Everything the per-100 numbers must satisfy before a single point is
 * charged for them. OCR silently loses decimal separators — a label reading
 * "0,91 g" of salt has been stored as "91g" — and a quantity that wrong
 * would move a score by two bands, so a table failing any check is
 * discarded whole and the score falls back on the ingredient rules.
 */
const MAX_GRAMS_PER_100 = 100;
const MAX_MACRO_SUM = 105;
const ENERGY_TOLERANCE_KCAL = 25;
const ENERGY_TOLERANCE_RATIO = 0.2;

function isPlausible(
  values: Map<PanelKey, PanelValue>,
  energyKcal: number | null,
): boolean {
  const fat = values.get("fat");
  const carbohydrate = values.get("carbohydrate");
  const protein = values.get("protein");

  // EU 1169/2011 makes energy, fat, saturates, carbohydrate, sugars,
  // protein and salt mandatory, so a table missing the three totals is not
  // a table that was read correctly — and without them there is nothing to
  // cross-check the rest against.
  if (!fat || !carbohydrate || !protein) {
    return false;
  }

  for (const value of values.values()) {
    if (value.grams > MAX_GRAMS_PER_100) {
      return false;
    }
  }

  const fibre = values.get("fibre");
  const salt = values.get("salt");
  const sugars = values.get("sugars");
  const saturates = values.get("saturates");

  const macroSum =
    fat.grams +
    carbohydrate.grams +
    protein.grams +
    (fibre?.grams ?? 0) +
    (salt?.grams ?? 0);

  if (macroSum > MAX_MACRO_SUM) {
    return false;
  }

  // A part can never exceed its whole. The half-gram slack absorbs the
  // rounding EU labels are allowed to print.
  if (sugars && sugars.grams > carbohydrate.grams + 0.5) {
    return false;
  }

  if (saturates && saturates.grams > fat.grams + 0.5) {
    return false;
  }

  if (energyKcal !== null) {
    // Atwater factors, with fibre at the 2 kcal/g the EU assigns it.
    const computed =
      4 * protein.grams +
      4 * carbohydrate.grams +
      9 * fat.grams +
      2 * (fibre?.grams ?? 0);

    const tolerance = Math.max(
      ENERGY_TOLERANCE_KCAL,
      computed * ENERGY_TOLERANCE_RATIO,
    );

    if (Math.abs(energyKcal - computed) > tolerance) {
      return false;
    }
  }

  return true;
}

const SCORED_KEYS: NutrientKey[] = [
  "sugars",
  "saturates",
  "salt",
  "fibre",
  "protein",
];

/**
 * Turns a set of per-100 quantities into a scoreable panel, or null when
 * they fail the plausibility checks. The single gate every source of
 * quantities goes through, so a number from Open Food Facts is trusted
 * exactly as far as one read off a photo — no further.
 */
function buildPanel(
  values: Map<PanelKey, PanelValue>,
  energyKcal: number | null,
  isBeverage: boolean,
): NutritionPanel | null {
  if (!isPlausible(values, energyKcal)) {
    return null;
  }

  const readings: NutrientReading[] = [];

  for (const key of SCORED_KEYS) {
    const value = values.get(key);

    if (value) {
      readings.push({
        key,
        gramsPer100: value.grams,
        declared: value.declared,
      });
    }
  }

  return readings.length > 0 ? { readings, isBeverage } : null;
}

/**
 * The declared per-100 quantities of a nutrition table printed on the same
 * label as an ingredient list, or null when no table could be read from the
 * text or the numbers read from it are not believable.
 */
export function readNutritionPanel(
  rawText: string,
): NutritionPanel | null {
  const { values, energyKcal } = readPanelValues(rawText);

  return buildPanel(values, energyKcal, isBeverageTable(rawText));
}

/** The Open Food Facts `nutriments` keys for each quantity we score. */
const OFF_FIELDS: Array<[PanelKey, string]> = [
  ["sugars", "sugars_100g"],
  ["saturates", "saturated-fat_100g"],
  ["salt", "salt_100g"],
  ["fibre", "fiber_100g"],
  ["protein", "proteins_100g"],
  ["fat", "fat_100g"],
  ["carbohydrate", "carbohydrates_100g"],
];

function numberAt(
  source: Record<string, unknown>,
  field: string,
): number | null {
  const value = source[field];

  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : NaN;

  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

/**
 * The same panel, built from an Open Food Facts product record instead of
 * from the photo. Used only when the photo did not yield a table of its
 * own: a label in the hand beats a crowd-sourced record of it, and a
 * community edit should not be able to change a score that a legible
 * photograph already answered.
 *
 * Runs through the identical plausibility gate. OFF is crowd-sourced and
 * carries its own share of misplaced decimal points, so "someone typed it
 * into a database" is not better evidence than "OCR read it off the pack" —
 * just different evidence, available when the other is missing.
 */
export function panelFromOpenFoodFacts(
  nutriments: unknown,
  isBeverage: boolean,
): NutritionPanel | null {
  if (typeof nutriments !== "object" || nutriments === null) {
    return null;
  }

  const source = nutriments as Record<string, unknown>;

  const values = new Map<PanelKey, PanelValue>();

  for (const [key, field] of OFF_FIELDS) {
    const grams = numberAt(source, field);

    if (grams !== null) {
      // OFF normalises everything to grams per 100 g/ml, so the declared
      // string is reconstructed rather than quoted from a label.
      values.set(key, {
        grams,
        declared: `${Math.round(grams * 100) / 100} g`,
      });
    }
  }

  const energyKcal = numberAt(source, "energy-kcal_100g");

  return buildPanel(values, energyKcal, isBeverage);
}

const SCORED_KEY_SET = new Set<string>(SCORED_KEYS);

/**
 * Reads back a panel persisted on a stored analysis. The PIM posts the whole
 * analysis envelope straight from the edit form, so this arrives as unknown
 * JSON and has to be validated the same way every other stored field is
 * (see validateVerifiedAnalysisResult). Anything malformed is dropped rather
 * than half-trusted: the score then falls back to the ingredient rules,
 * which is the behaviour for a label with no table at all.
 */
export function parseNutritionPanel(
  value: unknown,
): NutritionPanel | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const candidate = value as Record<string, unknown>;

  if (!Array.isArray(candidate.readings)) {
    return null;
  }

  const readings: NutrientReading[] = [];

  for (const entry of candidate.readings) {
    if (typeof entry !== "object" || entry === null) {
      return null;
    }

    const reading = entry as Record<string, unknown>;

    if (
      typeof reading.key !== "string" ||
      !SCORED_KEY_SET.has(reading.key) ||
      typeof reading.gramsPer100 !== "number" ||
      !Number.isFinite(reading.gramsPer100) ||
      reading.gramsPer100 < 0 ||
      reading.gramsPer100 > MAX_GRAMS_PER_100 ||
      typeof reading.declared !== "string"
    ) {
      return null;
    }

    readings.push({
      key: reading.key as NutrientKey,
      gramsPer100: reading.gramsPer100,
      declared: reading.declared,
    });
  }

  return readings.length > 0
    ? { readings, isBeverage: candidate.isBeverage === true }
    : null;
}
