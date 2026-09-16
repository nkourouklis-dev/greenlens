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

import { alcoholKcalPer100ml, detectAlcohol } from "./alcohol";
import {
  isBeverageTable,
  parseDeclaredNumber,
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

/**
 * The number part tolerates the ways OCR mangles a decimal: a space either
 * side of the separator ("0, 5g") and a letter O — Latin or Greek — standing
 * in for a leading zero ("O,5g"). parseDeclaredNumber turns what it matched
 * into a value and repairs a lost separator ("05g" is 0,5 g).
 */
const AMOUNT_PATTERN =
  /((?:\d+|[OoΟο](?=\s?[.,]\s?\d))(?:\s?[.,]\s?\d+)?)\s*(kj|kcal|mg|µg|μg|mcg|g|γρ)(?![\p{L}])/giu;

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

    const unit = match[2].toLowerCase();

    // Energy is legitimately a whole number with no decimal ("172kJ"), so
    // only masses get the lost-separator repair.
    const parsed = parseDeclaredNumber(match[1], {
      repairLeadingZero: unit !== "kj" && unit !== "kcal",
    });

    if (parsed === null) {
      continue;
    }

    const value = parsed.value;
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

/**
 * A line holding nothing but a number — no unit, no percent sign.
 *
 * The per-100 column is the one printed first, and it is also the one whose
 * unit OCR most often drops, because it sits hard against the column rule:
 * "ΛΙΠΑΡΑ/FAT / 13,7 / 6,8g / 9,7%" is 13,7 g per 100 g and 6,8 g per
 * 50 g bar. Skipping the unitless value and taking the next one that
 * carries a "g" silently scored the *portion* as though it were per 100 g —
 * halving sugars from 33,7 to 16,8 with nothing to show anything was wrong.
 *
 * A trailing asterisk is allowed because reference-intake columns carry one,
 * and those are excluded anyway: they are only ever read as the value
 * immediately preceding a run of real amounts.
 */
const BARE_NUMBER = /^((?:\d+|[OoΟο](?=\s?[.,]\s?\d))(?:\s?[.,]\s?\d+)?)\s*\*?$/u;

function bareNumberOf(line: string): number | null {
  const match = BARE_NUMBER.exec(line);

  if (!match) {
    return null;
  }

  return parseDeclaredNumber(match[1])?.value ?? null;
}

function readPanelValues(rawText: string): {
  values: Map<PanelKey, PanelValue>;
  energyKcal: number | null;
} {
  const values = new Map<PanelKey, PanelValue>();

  let kcal: number | null = null;
  let kilojoules: number | null = null;
  let pending: string[] = [];

  // The unitless value on the line immediately above a run of amounts —
  // the per-100 column whose "g" the OCR dropped. See BARE_NUMBER.
  let pendingBare: number | null = null;

  for (const rawLine of rawText.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (line.length === 0) {
      continue;
    }

    const bare = bareNumberOf(line);

    if (bare !== null) {
      pendingBare = bare;
      continue;
    }

    const { amounts, head } = parseAmounts(line);

    if (amounts.length === 0) {
      pendingBare = null;

      if (/\p{L}/u.test(line)) {
        pending.push(line);
      }

      continue;
    }

    const printedName = isNameFragment(head)
      ? head
      : pending.slice(-MAX_NAME_LINES).join(" ");

    // When OCR interleaves the ingredient list with the table, the row name
    // arrives glued to the end of a line of ingredients: "cake (egg, wheat
    // flour Πρωτεΐνες/Protein". Read whole, that line matches "sugar" from
    // earlier in the list and the protein row is lost (Kri Kri High Protein,
    // 5202234632322). Only then is the name retried from what follows the
    // last separator — never in place of a name that already worked.
    const printedKey = keyForName(printedName);

    const tailName = (head || pending[pending.length - 1] || "")
      .split(/[,;()[\]]/)
      .pop()
      ?.trim() ?? "";

    const name =
      (printedKey === null || values.has(printedKey)) &&
      isNameFragment(tailName) &&
      keyForName(tailName) !== null
        ? tailName
        : printedName;

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

    const bareBefore = pendingBare;

    pendingBare = null;

    if (key === null || values.has(key)) {
      continue;
    }

    // The per-100 column is printed first (see the file comment), so the
    // first mass amount of the run is the one the thresholds want.
    const mass = amounts.find((amount) => amount.grams !== null);

    if (!mass || mass.grams === null) {
      continue;
    }

    // ...unless an even earlier column was printed without its unit, in
    // which case *that* is the per-100 value and this one is the portion.
    // Only trusted when it is at least as large, since every per-portion
    // column on a real label is a fraction of the per-100 one — that keeps
    // a stray reference-intake percentage from being read as a quantity.
    const perHundred =
      bareBefore !== null && bareBefore >= mass.grams
        ? { grams: bareBefore, declared: `${bareBefore} g` }
        : { grams: mass.grams, declared: mass.declared };

    // Sodium is declared as an alternative to salt, never in addition;
    // EU labelling converts one to the other at this ratio.
    const isSodium = /(sodium|νάτριο|νατριο)/i.test(name);

    values.set(key, {
      grams:
        key === "salt" && isSodium
          ? perHundred.grams * 2.5
          : perHundred.grams,
      declared: perHundred.declared,
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
  /**
   * Energy from ethanol, which a declared kcal figure includes and the
   * macronutrients below cannot account for. Without it every beer and wine
   * failed this check — Kaiser pilsner declares 41 kcal against 13 kcal of
   * carbohydrate and protein — and its table was silently thrown away.
   */
  alcoholKcal = 0,
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
      2 * (fibre?.grams ?? 0) +
      alcoholKcal;

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
/**
 * Nutrients that only ever earn a bonus. One of these being misread cannot
 * make a product look better than it is by more than its bonus, so it is
 * the one kind of reading a failed table may shed and still be scored.
 */
const BONUS_ONLY_KEYS: PanelKey[] = ["protein", "fibre"];

/**
 * The value a misread of `grams` most plausibly came from: a lost decimal
 * separator (÷10, ÷100) or a stray leading digit ("40,5" for "0,5", which is
 * what Azure returned for Kaiser's protein).
 */
function misreadCandidates(grams: number): number[] {
  const text = String(grams);

  const withoutLeadingDigit =
    text.length > 1 ? Number(text.slice(1)) : NaN;

  return [grams / 10, grams / 100, withoutLeadingDigit].filter(
    (value) => Number.isFinite(value) && value >= 0,
  );
}

/**
 * When a table fails its checks, finds the single bonus-only reading whose
 * misread explains the failure. Returns that key only if exactly one such
 * nutrient does — two candidates means the failure is not understood, and a
 * table that is not understood is not scored.
 */
function bonusReadingToDiscard(
  values: Map<PanelKey, PanelValue>,
  energyKcal: number | null,
  alcoholKcal: number,
): PanelKey | null {
  const explaining = BONUS_ONLY_KEYS.filter((key) => {
    const value = values.get(key);

    if (!value) {
      return false;
    }

    return misreadCandidates(value.grams).some((grams) => {
      const trial = new Map(values);

      trial.set(key, { grams, declared: value.declared });

      return isPlausible(trial, energyKcal, alcoholKcal);
    });
  });

  return explaining.length === 1 ? explaining[0] : null;
}

/**
 * Per-100 values no real label of that kind declares. Not rejected on their
 * own — a stock cube really is half salt — but logged, so a pattern of
 * misreads shows up in the worker logs instead of hiding inside scores.
 */
function suspiciousValues(
  values: Map<PanelKey, PanelValue>,
  isBeverage: boolean,
): string[] {
  const limits: Partial<Record<PanelKey, number>> = isBeverage
    ? { sugars: 15, protein: 10, salt: 1, saturates: 5, fat: 10 }
    : { salt: 10 };

  const warnings: string[] = [];

  for (const [key, limit] of Object.entries(limits) as Array<
    [PanelKey, number]
  >) {
    const value = values.get(key);

    if (value && value.grams > limit) {
      warnings.push(
        `${key} ${value.declared} exceeds ${limit} g per 100 ${isBeverage ? "ml" : "g"}`,
      );
    }
  }

  return warnings;
}

export interface NutritionPanelRead {
  /** The scoreable panel, or null when none passed the checks. */
  panel: NutritionPanel | null;
  /**
   * True when the text carries a nutrition table at all, whether or not it
   * could be trusted. `tableDetected && panel === null` is exactly the case
   * the user must be told about: a table was there and was not used.
   */
  tableDetected: boolean;
  /** Readings dropped as misreads so that the rest could be scored. */
  discarded: PanelKey[];
  /** Implausible-looking values, for the logs. */
  warnings: string[];
  /** Every per-100 value read, in grams, before any check — for the logs. */
  values: Partial<Record<PanelKey, number>>;
  energyKcal: number | null;
}

/**
 * Turns a set of per-100 quantities into a scoreable panel. The single gate
 * every source of quantities goes through, so a number from Open Food Facts
 * is trusted exactly as far as one read off a photo — no further.
 */
function buildPanel(
  values: Map<PanelKey, PanelValue>,
  energyKcal: number | null,
  isBeverage: boolean,
  alcoholKcal = 0,
): NutritionPanelRead {
  const warnings = suspiciousValues(values, isBeverage);

  const read = {
    values: Object.fromEntries(
      [...values].map(([key, value]) => [key, value.grams]),
    ) as Partial<Record<PanelKey, number>>,
    energyKcal,
  };

  // Three of the rows every EU table carries, or two beside an energy
  // figure, is a table — however badly it was read.
  const tableDetected =
    values.size >= 3 || (values.size >= 2 && energyKcal !== null);

  const discarded: PanelKey[] = [];

  if (!isPlausible(values, energyKcal, alcoholKcal)) {
    const misread = bonusReadingToDiscard(values, energyKcal, alcoholKcal);

    if (misread === null) {
      return { panel: null, tableDetected, discarded, warnings, ...read };
    }

    discarded.push(misread);
  }

  const readings: NutrientReading[] = [];

  for (const key of SCORED_KEYS) {
    const value = values.get(key);

    if (value && !discarded.includes(key)) {
      readings.push({
        key,
        gramsPer100: value.grams,
        declared: value.declared,
      });
    }
  }

  return {
    panel: readings.length > 0 ? { readings, isBeverage } : null,
    tableDetected,
    discarded,
    warnings,
    ...read,
  };
}

/**
 * Everything known about the nutrition table in a piece of label text: the
 * scoreable panel if there is one, and whether a table was there at all.
 *
 * `abv` is the product's declared alcohol strength when it was read from a
 * different photo; by default it is looked for in the same text.
 */
export function inspectNutritionPanel(
  rawText: string,
  options?: { abv?: number | null },
): NutritionPanelRead {
  const abv =
    options?.abv !== undefined
      ? options.abv
      : (detectAlcohol([rawText])?.abv ?? null);

  const alcoholKcal = abv === null ? 0 : alcoholKcalPer100ml(abv);

  const isBeverage = isBeverageTable(rawText);

  const walked = readPanelValues(rawText);

  const read = buildPanel(
    walked.values,
    walked.energyKcal,
    isBeverage,
    alcoholKcal,
  );

  if (read.panel !== null) {
    return read;
  }

  // Second reading, only for a table the walk could not make sense of. It
  // still has to pass every plausibility check, so a wrong pairing is
  // rejected exactly as a wrong walk is.
  const ordered = readPanelValuesInOrder(rawText);

  if (ordered === null) {
    return read;
  }

  const reread = buildPanel(
    ordered.values,
    ordered.energyKcal,
    isBeverage,
    alcoholKcal,
  );

  return reread.panel !== null
    ? reread
    : { ...read, tableDetected: read.tableDetected || reread.tableDetected };
}

const ENERGY_NAME = /(ενεργει|ενέργει|energy)/iu;

/**
 * Pairs a table's row names with its values *by position* rather than by
 * adjacency.
 *
 * On a curved can the value column sits half a line below the names, and
 * Azure then emits every value one row late (Kaiser pilsner 330 ml,
 * 5201309103040):
 *
 *     ΛΙΠΑΡΑ:                 <- followed by the energy
 *     172kJ/41kcal
 *     ΕΚ ΤΩΝ ΟΠΟΙΩΝ ΚΟΡΕΣΜΕΝΑ:  <- followed by the fat
 *     0g
 *
 * The walk above pairs each value with the name just before it, reads
 * "sugars 2,8 g in 0 g of carbohydrate", and the plausibility check rightly
 * rejects the table. But the *order* of names and of values is intact, so
 * when there are exactly as many values as names they can be zipped.
 *
 * Returns null when the counts differ — a multi-column table (per 100 g,
 * per portion) has more values than names and is the walk's job.
 */
function readPanelValuesInOrder(rawText: string): {
  values: Map<PanelKey, PanelValue>;
  energyKcal: number | null;
} | null {
  const lines = rawText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const start = lines.findIndex(
    (line) => ENERGY_NAME.test(line) && parseAmounts(line).amounts.length === 0,
  );

  if (start === -1) {
    return null;
  }

  const names: Array<PanelKey | "energy"> = [];

  const amountsInOrder: Amount[][] = [];

  for (const line of lines.slice(start)) {
    const { amounts, head } = parseAmounts(line);

    if (amounts.length === 0) {
      if (!isNameFragment(line)) {
        continue;
      }

      const key = ENERGY_NAME.test(line) ? "energy" : keyForName(line);

      if (key !== null) {
        names.push(key);
      }

      continue;
    }

    // A value line carries nothing but amounts (and perhaps a "<").
    if (/\p{L}{2,}/u.test(head)) {
      return null;
    }

    const previous = amountsInOrder[amountsInOrder.length - 1];

    // "172kJ" and "41kcal" on two lines are one energy value.
    const continuesEnergy =
      previous !== undefined &&
      previous.every((amount) => amount.kilojoules !== null) &&
      amounts.every((amount) => amount.kcal !== null);

    if (continuesEnergy) {
      previous.push(...amounts);
    } else {
      amountsInOrder.push(amounts);
    }
  }

  if (names.length < 4 || names.length !== amountsInOrder.length) {
    return null;
  }

  const values = new Map<PanelKey, PanelValue>();

  let energyKcal: number | null = null;

  names.forEach((key, index) => {
    const amounts = amountsInOrder[index];

    if (key === "energy") {
      const kcal = amounts.find((amount) => amount.kcal !== null)?.kcal;
      const kj = amounts.find((amount) => amount.kilojoules !== null)
        ?.kilojoules;

      energyKcal = kcal ?? (kj == null ? null : kj / 4.184);

      return;
    }

    const mass = amounts.find((amount) => amount.grams !== null);

    if (mass && mass.grams !== null && !values.has(key)) {
      values.set(key, { grams: mass.grams, declared: mass.declared });
    }
  });

  return { values, energyKcal };
}

/**
 * The declared per-100 quantities of a nutrition table, or null when no
 * table could be read from the text or the numbers read from it are not
 * believable.
 */
export function readNutritionPanel(
  rawText: string,
  options?: { abv?: number | null },
): NutritionPanel | null {
  return inspectNutritionPanel(rawText, options).panel;
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

  // OFF stores alcohol as % vol under this key.
  const abv = numberAt(source, "alcohol_100g");

  return buildPanel(
    values,
    energyKcal,
    isBeverage,
    abv === null ? 0 : alcoholKcalPer100ml(abv),
  ).panel;
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
