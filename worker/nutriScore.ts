/**
 * Nutri-Score, updated (2023) algorithm.
 *
 * Every threshold below is transcribed from the official Santé publique
 * France documents, not from memory:
 *
 *  [SpF-2022]  "Update of the Nutri-Score algorithm — Update report from the
 *              Scientific Committee of the Nutri-Score 2022" (voted 29 June
 *              2022). General foods §1.1–1.4, fats/oils/nuts/seeds §2.2–2.4.
 *              https://www.santepubliquefrance.fr/sites/default/files/rdd/document/2022-main%20algorithm%20report%20update_FINAL.pdf
 *  [SpF-2023]  "Update of the Nutri-Score algorithm for beverages — Second
 *              update report from the Scientific Committee of the Nutri-Score
 *              V2-2023" (voted 1 February 2023), "Points allocation" and
 *              "Final Nutri-Score thresholds" annex.
 *              https://www.santepubliquefrance.fr/sites/default/files/rdd/document/Update%20report%20beverages_31%2001%202023-VOTED.pdf
 *  [SpF-FAQ]   "NUTRI-SCORE Questions & Réponses" (FAQ-updatedAlgo-FR_V11),
 *              "Méthode de calcul pour la version actualisée", tables 5–10 —
 *              the consolidated tables, used to cross-check the two reports.
 *              https://www.santepubliquefrance.fr/sites/default/files/rdd/document/FAQ-updatedAlgo-FR_V11.pdf
 *
 * Conventions taken from those documents: a nutrient earns a point for every
 * threshold its value is strictly *above* (">"), except the saturates/lipids
 * ratio, which is expressed as "<" bounds. Values are per 100 g (or 100 ml
 * for beverages). No rounding rules are required by the updated algorithm.
 *
 * Deliberately not here: alcoholic drinks above 1.2 % vol are outside the
 * official scope [SpF-2023 "Definition of beverages included"]. We still
 * run the beverage grid over their table so the product gets a nutrition
 * figure, and charge alcohol separately and visibly (alcohol.ts).
 *
 * Missing data is never invented. See `computeNutriScore`.
 */

export type NutriScoreCategory =
  | "general"
  | "cheese"
  | "red_meat"
  | "fats_oils_nuts_seeds"
  | "beverage"
  | "water";

export type NutriGrade = "A" | "B" | "C" | "D" | "E";

/** Per-100 g (or 100 ml) inputs. `null` means "not known", never "zero". */
export interface NutriScoreInput {
  category: NutriScoreCategory;
  energyKj: number | null;
  saturates: number | null;
  sugars: number | null;
  salt: number | null;
  /** Total fat: only the fats category needs it (saturates/lipids ratio). */
  fat: number | null;
  /**
   * Total carbohydrate. Never scored, but sugars are a part of it, which
   * bounds sugars when they were not declared separately.
   */
  carbohydrate: number | null;
  fibre: number | null;
  protein: number | null;
  /** Fruit, vegetables and legumes, % of the product. */
  fruitVegLegumesPct: number | null;
  /** Beverages only. null = not known, treated as absent and said so. */
  nonNutritiveSweetener: boolean | null;
}

export interface NutriScoreComponent {
  key:
    | "energy"
    | "energy_from_saturates"
    | "sugars"
    | "saturates"
    | "saturates_ratio"
    | "salt"
    | "sweeteners"
    | "protein"
    | "fibre"
    | "fruit_veg_legumes";
  side: "negative" | "positive";
  /** The value the points were given for, or null when it was not known. */
  value: number | null;
  points: number;
  /** False for a positive component the final formula leaves out. */
  counted: boolean;
}

export type MissingNutrient =
  | "energy"
  | "saturates"
  | "sugars"
  | "salt"
  | "fat";

export type UncreditedNutrient =
  | "fibre"
  | "protein"
  | "fruit_veg_legumes"
  | "sweeteners";

export type NutriScoreResult =
  | {
      computable: true;
      category: NutriScoreCategory;
      /** The final Nutri-Score value (negative points − positive points). */
      points: number | null;
      grade: NutriGrade;
      negativePoints: number;
      positivePoints: number;
      components: NutriScoreComponent[];
      /**
       * Favourable nutrients that were not declared. They add no points —
       * the algorithm never credits what it cannot see — and the caller is
       * expected to say so.
       */
      uncredited: UncreditedNutrient[];
      /** True when sugars were bounded by carbohydrate instead of read. */
      sugarsBoundedByCarbohydrate: boolean;
    }
  | {
      computable: false;
      category: NutriScoreCategory;
      /** What has to be known, and is not, before a grade can be given. */
      missing: MissingNutrient[];
    };

/** Number of thresholds `value` is strictly above. */
function pointsAbove(value: number, thresholds: readonly number[]): number {
  let points = 0;

  for (const threshold of thresholds) {
    if (value > threshold) {
      points += 1;
    }
  }

  return points;
}

/** Step list: `start`, `start + step`, … `count` entries. */
function steps(start: number, step: number, count: number): number[] {
  return Array.from({ length: count }, (_, index) => start + step * index);
}

// --- General foods [SpF-2022 §1.1–1.2; SpF-FAQ tables 5–6] -----------------

/** kJ/100 g: 0–10 points, 335 kJ per point. */
const ENERGY_KJ = steps(335, 335, 10);
/** g/100 g: 0–10 points, 1 g per point. */
const SATURATES = steps(1, 1, 10);
/** g/100 g of sugars: 0–15 points. */
const SUGARS = [3.4, 6.8, 10, 14, 17, 20, 24, 27, 31, 34, 37, 41, 44, 48, 51];
/** g/100 g of salt: 0–20 points, 0.2 g per point. */
const SALT = steps(0.2, 0.2, 20).map((value) => Math.round(value * 10) / 10);
/** g/100 g of protein: 0–7 points. */
const PROTEIN = [2.4, 4.8, 7.2, 9.6, 12, 14, 17];
/** g/100 g of fibre: 0–5 points. */
const FIBRE = [3.0, 4.1, 5.2, 6.3, 7.4];

/** Fruit, vegetables, legumes %: >40 → 1, >60 → 2, >80 → 5. */
function fruitVegPoints(percent: number): number {
  return percent > 80 ? 5 : percent > 60 ? 2 : percent > 40 ? 1 : 0;
}

// --- Fats, oils, nuts and seeds [SpF-2022 §2.2–2.3; SpF-FAQ tables 7–8] -----

/** Energy from saturates, kJ/100 g: 0–10 points, 120 kJ per point. */
const ENERGY_FROM_SATURATES = steps(120, 120, 10);
/** kJ of energy per gram of saturated fat used by the fats table. */
const KJ_PER_GRAM_SATURATES = 37;
/** Saturates / total lipids, %: bounds "<10" … "<64", 64 and above = 10. */
const SATURATES_RATIO_BOUNDS = [10, 16, 22, 28, 34, 40, 46, 52, 58, 64];

// --- Beverages [SpF-2023 "Points allocation"; SpF-FAQ tables 9–10] ----------

/** kJ/100 ml: 0–10 points. */
const BEVERAGE_ENERGY_KJ = [30, 90, 150, 210, 240, 270, 300, 330, 360, 390];
/** g/100 ml of sugars: 0–10 points. */
const BEVERAGE_SUGARS = [0.5, 2, 3.5, 5, 6, 7, 8, 9, 10, 11];
/** g/100 ml of saturates: 0–10 points. */
const BEVERAGE_SATURATES = steps(1, 1, 10);
/** g/100 ml of protein: 0–7 points. */
const BEVERAGE_PROTEIN = [1.2, 1.5, 1.8, 2.1, 2.4, 2.7, 3.0];
/** Beverage fruit/veg/legumes %: >40 → 2, >60 → 4, >80 → 6. */
function beverageFruitVegPoints(percent: number): number {
  return percent > 80 ? 6 : percent > 60 ? 4 : percent > 40 ? 2 : 0;
}
/** Non-nutritive sweeteners present: +4 [SpF-2023, unfavourable table]. */
const SWEETENER_POINTS = 4;

/** Protein is capped at 2 points for red meat [SpF-2022 §1.2]. */
const RED_MEAT_MAX_PROTEIN_POINTS = 2;

/** N at or above which protein stops counting: general foods [SpF-2022 §1.3]. */
const PROTEIN_CUTOFF_GENERAL = 11;
/** The same cut-off for fats, oils, nuts and seeds [SpF-2022 §2.4]. */
const PROTEIN_CUTOFF_FATS = 7;

// --- Final classes ----------------------------------------------------------

/**
 * Upper bound of each class, in Nutri-Score points; E is everything above.
 * General foods [SpF-2022 §1.4]: A ≤ 0, B 1–2, C 3–10, D 11–18, E ≥ 19.
 * Fats, oils, nuts, seeds [SpF-2022 §2.4.3]: A ≤ −6, B −5–2, C 3–10,
 * D 11–18, E ≥ 19. Beverages [SpF-2023 "Final Nutri-Score thresholds"]:
 * B ≤ 2, C 3–6, D 7–9, E ≥ 10 — and A is water only.
 */
const CLASS_UPPER_BOUNDS: Record<
  Exclude<NutriScoreCategory, "water">,
  Array<[NutriGrade, number]>
> = {
  general: [["A", 0], ["B", 2], ["C", 10], ["D", 18]],
  cheese: [["A", 0], ["B", 2], ["C", 10], ["D", 18]],
  red_meat: [["A", 0], ["B", 2], ["C", 10], ["D", 18]],
  fats_oils_nuts_seeds: [["A", -6], ["B", 2], ["C", 10], ["D", 18]],
  beverage: [["B", 2], ["C", 6], ["D", 9]],
};

export function gradeForPoints(
  category: Exclude<NutriScoreCategory, "water">,
  points: number,
): NutriGrade {
  for (const [grade, upperBound] of CLASS_UPPER_BOUNDS[category]) {
    if (points <= upperBound) {
      return grade;
    }
  }

  return "E";
}

/**
 * What each nutrient's points are, once the value is known. Split out so the
 * bounded-sugars check can ask "what would 0 g and what would the ceiling
 * score?" with the same code.
 */
function sugarsPoints(category: NutriScoreCategory, sugars: number): number {
  return category === "beverage"
    ? pointsAbove(sugars, BEVERAGE_SUGARS)
    : pointsAbove(sugars, SUGARS);
}

/**
 * Computes the Nutri-Score, or says exactly what is missing.
 *
 * Partial data, explicitly:
 *  - The unfavourable nutrients the category needs (energy or saturates/fat,
 *    saturates, sugars, salt) must be known. Without them a grade would be a
 *    guess in the flattering direction, so the result is `computable: false`
 *    and names what is missing.
 *  - The one exception is sugars: they are a part of the carbohydrate, so
 *    when only carbohydrate is known, sugars lie between 0 and that figure.
 *    If 0 and the ceiling earn the same points the answer is determinate and
 *    is used (a butter with 0.4 g of carbohydrate cannot have 3.4 g of
 *    sugar); if they differ it is not, and sugars are reported missing.
 *  - The favourable nutrients (fibre, protein, fruit/veg/legumes) may be
 *    unknown: they add no points and are listed in `uncredited`. Sweeteners
 *    on a beverage are treated the same way.
 */
export function computeNutriScore(input: NutriScoreInput): NutriScoreResult {
  const { category } = input;

  if (category === "water") {
    return {
      computable: true,
      category,
      points: null,
      grade: "A",
      negativePoints: 0,
      positivePoints: 0,
      components: [],
      uncredited: [],
      sugarsBoundedByCarbohydrate: false,
    };
  }

  const isFats = category === "fats_oils_nuts_seeds";
  const isBeverage = category === "beverage";

  const missing: MissingNutrient[] = [];

  if (!isFats && input.energyKj === null) {
    missing.push("energy");
  }

  if (input.saturates === null) {
    missing.push("saturates");
  }

  if (isFats && input.fat === null) {
    missing.push("fat");
  }

  if (input.salt === null) {
    missing.push("salt");
  }

  let sugars = input.sugars;
  let sugarsBounded = false;

  if (sugars === null && input.carbohydrate !== null) {
    const atZero = sugarsPoints(category, 0);
    const atCeiling = sugarsPoints(category, input.carbohydrate);

    if (atZero === atCeiling) {
      sugars = 0;
      sugarsBounded = true;
    }
  }

  if (sugars === null) {
    missing.push("sugars");
  }

  if (
    missing.length > 0 ||
    input.saturates === null ||
    input.salt === null ||
    sugars === null
  ) {
    return { computable: false, category, missing };
  }

  const components: NutriScoreComponent[] = [];

  const negative = (
    key: NutriScoreComponent["key"],
    value: number | null,
    points: number,
  ) => components.push({ key, side: "negative", value, points, counted: true });

  if (isFats) {
    const saturatedEnergy = input.saturates * KJ_PER_GRAM_SATURATES;

    negative(
      "energy_from_saturates",
      saturatedEnergy,
      pointsAbove(saturatedEnergy, ENERGY_FROM_SATURATES),
    );

    // fat is known: checked above. A ratio over 100 % would be a misread.
    const fat = input.fat as number;

    const ratio = fat > 0 ? Math.min(100, (input.saturates / fat) * 100) : 0;

    negative(
      "saturates_ratio",
      ratio,
      SATURATES_RATIO_BOUNDS.filter((bound) => ratio >= bound).length,
    );
  } else if (isBeverage) {
    negative(
      "energy",
      input.energyKj,
      pointsAbove(input.energyKj as number, BEVERAGE_ENERGY_KJ),
    );

    negative(
      "saturates",
      input.saturates,
      pointsAbove(input.saturates, BEVERAGE_SATURATES),
    );
  } else {
    negative(
      "energy",
      input.energyKj,
      pointsAbove(input.energyKj as number, ENERGY_KJ),
    );

    negative(
      "saturates",
      input.saturates,
      pointsAbove(input.saturates, SATURATES),
    );
  }

  negative("sugars", input.sugars ?? sugars, sugarsPoints(category, sugars));
  negative("salt", input.salt, pointsAbove(input.salt, SALT));

  if (isBeverage && input.nonNutritiveSweetener === true) {
    negative("sweeteners", null, SWEETENER_POINTS);
  }

  const negativePoints = components.reduce(
    (total, component) => total + component.points,
    0,
  );

  const uncredited: UncreditedNutrient[] = [];

  const positive = (
    key: NutriScoreComponent["key"],
    value: number | null,
    points: number,
    counted = true,
  ) => components.push({ key, side: "positive", value, points, counted });

  let proteinPoints = 0;

  if (input.protein === null) {
    uncredited.push("protein");
  } else {
    proteinPoints = isBeverage
      ? pointsAbove(input.protein, BEVERAGE_PROTEIN)
      : pointsAbove(input.protein, PROTEIN);

    if (category === "red_meat") {
      proteinPoints = Math.min(proteinPoints, RED_MEAT_MAX_PROTEIN_POINTS);
    }
  }

  let fibrePoints = 0;

  if (input.fibre === null) {
    uncredited.push("fibre");
  } else {
    fibrePoints = pointsAbove(input.fibre, FIBRE);
  }

  let fruitVegPointsEarned = 0;

  if (input.fruitVegLegumesPct === null) {
    uncredited.push("fruit_veg_legumes");
  } else {
    fruitVegPointsEarned = isBeverage
      ? beverageFruitVegPoints(input.fruitVegLegumesPct)
      : fruitVegPoints(input.fruitVegLegumesPct);
  }

  if (isBeverage && input.nonNutritiveSweetener === null) {
    uncredited.push("sweeteners");
  }

  // Which favourable components enter the final formula [SpF-2022 §1.3, §2.4;
  // SpF-2023 §1.3]. Cheese and beverages always subtract all of them; the
  // other foods drop protein once the unfavourable side is high enough.
  const proteinCutoff = isFats ? PROTEIN_CUTOFF_FATS : PROTEIN_CUTOFF_GENERAL;

  const proteinCounts =
    isBeverage || category === "cheese" || negativePoints < proteinCutoff;

  positive("protein", input.protein, proteinPoints, proteinCounts);
  positive("fibre", input.fibre, fibrePoints);
  positive("fruit_veg_legumes", input.fruitVegLegumesPct, fruitVegPointsEarned);

  const positivePoints =
    (proteinCounts ? proteinPoints : 0) + fibrePoints + fruitVegPointsEarned;

  const points = negativePoints - positivePoints;

  return {
    computable: true,
    category,
    points,
    grade: gradeForPoints(category, points),
    negativePoints,
    positivePoints,
    components,
    uncredited,
    sugarsBoundedByCarbohydrate: sugarsBounded,
  };
}

/**
 * The single place a Nutri-Score class becomes a 0–100 score.
 *
 * Each class maps to the middle of the verdict band of the same rank, so a
 * Nutri-Score class and the app's verdict never disagree:
 *
 *   A → 92  (excellent, 85–100)      D → 40  (attention,  30–49)
 *   B → 77  (good,      70–84)       E → 15  (high attention, 0–29)
 *   C → 60  (moderate,  50–69)
 *
 * A fixed value per class, not an interpolation inside it: the official
 * class edges are the only defensible breakpoints, and inventing edges for
 * the open-ended A and E classes would be tuning by another name.
 */
export const NUTRI_SCORE_TO_100: Record<NutriGrade, number> = {
  A: 92,
  B: 77,
  C: 60,
  D: 40,
  E: 15,
};

export function nutriScoreTo100(grade: NutriGrade): number {
  return NUTRI_SCORE_TO_100[grade];
}
