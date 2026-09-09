/**
 * Deterministic nutrition scoring from the declared numbers.
 *
 * The ingredients path fixed its scoring by matching a curated rule table
 * against the label text (see ingredientRules.ts). A nutrition table has no
 * substances to match — it has quantities — so the equivalent fix here is to
 * score those quantities against published thresholds instead of trusting
 * whatever severity the model attached to each row.
 *
 * The thresholds follow the UK FSA front-of-pack bands (the "traffic light"
 * scheme) for solids, with one deliberate departure: beverages are scored on
 * a much harsher sugar scale, closer to how Nutri-Score treats drinks. FSA
 * per-100ml bands call a full-sugar cola "amber", which would have handed it
 * a score in the high eighties — the exact verdict this whole change exists
 * to stop the app from giving.
 */

export type NutrientKey =
  | "sugars"
  | "saturates"
  | "salt"
  | "fibre"
  | "protein";

export interface NutrientReading {
  key: NutrientKey;
  /** Grams per 100 g (solids) or per 100 ml (drinks). */
  gramsPer100: number;
  /** The raw declared string, for the explanation shown to the user. */
  declared: string;
}

export interface NutritionPenalty {
  key: NutrientKey;
  points: number;
  title: string;
  explanation: string;
}

export interface NutritionBonus {
  label: string;
  points: number;
}

/**
 * Ordered worst-first: the first band whose `above` the value exceeds wins.
 * A band list always ends at -1 so any non-negative value matches something.
 */
type Band = { above: number; points: number; label: string };

const SUGARS_DRINK: Band[] = [
  { above: 12, points: 60, label: "Πολύ υψηλά σάκχαρα για ρόφημα" },
  { above: 9, points: 55, label: "Πολύ υψηλά σάκχαρα για ρόφημα" },
  { above: 6, points: 40, label: "Υψηλά σάκχαρα για ρόφημα" },
  { above: 3, points: 28, label: "Αυξημένα σάκχαρα για ρόφημα" },
  { above: 0, points: 15, label: "Περιέχει ελεύθερα σάκχαρα" },
  { above: -1, points: 0, label: "Χωρίς σάκχαρα" },
];

const SUGARS_SOLID: Band[] = [
  { above: 22.5, points: 30, label: "Πολύ υψηλά σάκχαρα" },
  { above: 15, points: 20, label: "Υψηλά σάκχαρα" },
  { above: 10, points: 12, label: "Αυξημένα σάκχαρα" },
  { above: 5, points: 6, label: "Μέτρια σάκχαρα" },
  { above: -1, points: 0, label: "Χαμηλά σάκχαρα" },
];

const SATURATES_DRINK: Band[] = [
  { above: 2.5, points: 25, label: "Υψηλά κορεσμένα λιπαρά" },
  { above: 1.5, points: 15, label: "Αυξημένα κορεσμένα λιπαρά" },
  { above: 0.75, points: 8, label: "Μέτρια κορεσμένα λιπαρά" },
  { above: -1, points: 0, label: "Χαμηλά κορεσμένα λιπαρά" },
];

const SATURATES_SOLID: Band[] = [
  { above: 5, points: 25, label: "Υψηλά κορεσμένα λιπαρά" },
  { above: 3, points: 15, label: "Αυξημένα κορεσμένα λιπαρά" },
  { above: 1.5, points: 8, label: "Μέτρια κορεσμένα λιπαρά" },
  { above: -1, points: 0, label: "Χαμηλά κορεσμένα λιπαρά" },
];

const SALT: Band[] = [
  { above: 1.5, points: 20, label: "Υψηλή περιεκτικότητα σε αλάτι" },
  { above: 0.9, points: 12, label: "Αυξημένο αλάτι" },
  { above: 0.3, points: 5, label: "Μέτριο αλάτι" },
  { above: -1, points: 0, label: "Χαμηλό αλάτι" },
];

function bandFor(bands: Band[], value: number): Band {
  return (
    bands.find((band) => value > band.above) ??
    bands[bands.length - 1]
  );
}

const NUTRIENT_PATTERNS: Array<[NutrientKey, RegExp]> = [
  // Saturates before sugars/fat: "saturated fat" and "κορεσμένα λιπαρά" must
  // not be read as plain fat, and the sugar row on a Greek label often reads
  // "εκ των οποίων σάκχαρα" directly under it.
  [
    "saturates",
    /(saturat|κορεσμ)/i,
  ],
  ["sugars", /(sugar|σακχαρ|σάκχαρ|ζάχαρ|ζαχαρ)/i],
  ["salt", /(salt|sodium|αλάτι|αλατι|νάτριο|νατριο)/i],
  ["fibre", /(fibre|fiber|ίνες|ινες|εδώδιμες)/i],
  ["protein", /(protein|πρωτε)/i],
];

function keyForNutrient(name: string): NutrientKey | null {
  for (const [key, pattern] of NUTRIENT_PATTERNS) {
    if (pattern.test(name)) {
      return key;
    }
  }

  return null;
}

/**
 * Pulls a quantity in grams out of a declared amount such as "10,6 g",
 * "0.5g / 100ml" or "285 mg". Greek labels use a decimal comma, and sodium
 * is often declared in milligrams, so both are handled here rather than
 * being left to trip the caller.
 */
export function parseAmountGrams(
  amount: string,
): number | null {
  const match = /(-?\d+(?:[.,]\d+)?)\s*(mg|g|γρ|mγ)?/i.exec(
    amount,
  );

  if (!match) {
    return null;
  }

  const value = Number(match[1].replace(",", "."));

  if (!Number.isFinite(value) || value < 0) {
    return null;
  }

  return /^mg$/i.test(match[2] ?? "")
    ? value / 1000
    : value;
}

/**
 * A nutrition table declared per 100 ml is a drink. Checked against the raw
 * panel text rather than guessed from the product name, because the unit is
 * printed right there in the column header the numbers belong to.
 */
export function isBeverageTable(text: string): boolean {
  return /100\s*(ml|μl|χλστ)/i.test(text);
}

export function readNutrients(
  findings: Array<{
    nutrient: string;
    normalizedName: string;
    amount: string | null;
  }>,
): NutrientReading[] {
  const readings = new Map<NutrientKey, NutrientReading>();

  for (const finding of findings) {
    if (finding.amount === null) {
      continue;
    }

    const key = keyForNutrient(
      `${finding.nutrient} ${finding.normalizedName}`,
    );

    if (key === null) {
      continue;
    }

    const grams = parseAmountGrams(finding.amount);

    if (grams === null) {
      continue;
    }

    // Sodium is declared as an alternative to salt, not in addition to it;
    // EU labelling converts one to the other at this ratio.
    const isSodium = /(sodium|νάτριο|νατριο)/i.test(
      `${finding.nutrient} ${finding.normalizedName}`,
    );

    const normalized =
      key === "salt" && isSodium ? grams * 2.5 : grams;

    // The panel can list the same nutrient twice (per 100 g and per
    // portion). The per-100 column is what the thresholds are defined
    // against, and it is the one printed first, so the first reading wins.
    if (!readings.has(key)) {
      readings.set(key, {
        key,
        gramsPer100: normalized,
        declared: finding.amount,
      });
    }
  }

  return [...readings.values()];
}

export function penaltiesFor(
  readings: NutrientReading[],
  isBeverage: boolean,
): NutritionPenalty[] {
  const penalties: NutritionPenalty[] = [];

  for (const reading of readings) {
    let bands: Band[] | null = null;

    if (reading.key === "sugars") {
      bands = isBeverage ? SUGARS_DRINK : SUGARS_SOLID;
    } else if (reading.key === "saturates") {
      bands = isBeverage
        ? SATURATES_DRINK
        : SATURATES_SOLID;
    } else if (reading.key === "salt") {
      bands = SALT;
    }

    if (bands === null) {
      continue;
    }

    const band = bandFor(bands, reading.gramsPer100);

    if (band.points === 0) {
      continue;
    }

    penalties.push({
      key: reading.key,
      points: band.points,
      title: band.label,
      explanation: `${reading.declared} ανά ${isBeverage ? "100 ml" : "100 g"}`,
    });
  }

  return penalties.sort(
    (left, right) => right.points - left.points,
  );
}

export function bonusesFor(
  readings: NutrientReading[],
): NutritionBonus[] {
  const bonuses: NutritionBonus[] = [];

  const fibre = readings.find(
    (reading) => reading.key === "fibre",
  );

  if (fibre && fibre.gramsPer100 >= 6) {
    bonuses.push({
      label: "Υψηλή περιεκτικότητα σε φυτικές ίνες",
      points: 6,
    });
  } else if (fibre && fibre.gramsPer100 >= 3) {
    bonuses.push({
      label: "Πηγή φυτικών ινών",
      points: 3,
    });
  }

  const protein = readings.find(
    (reading) => reading.key === "protein",
  );

  if (protein && protein.gramsPer100 >= 10) {
    bonuses.push({
      label: "Υψηλή περιεκτικότητα σε πρωτεΐνη",
      points: 4,
    });
  } else if (protein && protein.gramsPer100 >= 5) {
    bonuses.push({
      label: "Πηγή πρωτεΐνης",
      points: 2,
    });
  }

  return bonuses;
}
