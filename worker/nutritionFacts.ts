/**
 * Per-100 nutrition facts, from wherever they came, in the one shape the
 * Nutri-Score reads.
 *
 * Two sources, in this order of trust:
 *   1. "label"          — read off the pack in the user's hand (OCR, through
 *                         the strict reader in nutritionPanel.ts);
 *   2. "openfoodfacts"  — the `nutriments` of the barcode's Open Food Facts
 *                         record, which is crowd-sourced and is held to the
 *                         same physical-plausibility checks.
 * A whole source wins or loses: values are never mixed field by field across
 * sources, because two sources disagreeing on a figure means one of them is
 * wrong and there is no telling which.
 *
 * `null` always means "not known". A missing field is never filled in.
 */

import type { NutriScoreCategory, NutriScoreInput } from "./nutriScore";
import type { NutritionPanel } from "./nutritionPanel";

export type NutritionSource = "label" | "openfoodfacts";

export interface NutritionFacts {
  energyKj: number | null;
  fat: number | null;
  saturates: number | null;
  carbohydrate: number | null;
  sugars: number | null;
  fibre: number | null;
  protein: number | null;
  salt: number | null;
  /** Fruit, vegetables and legumes, % — Open Food Facts' estimate only. */
  fruitVegLegumesPct: number | null;
  /** Declared per 100 ml instead of per 100 g. */
  isBeverage: boolean;
  /** % vol when the record declares alcohol. */
  abv: number | null;
}

export interface NutritionEvidence {
  source: NutritionSource;
  facts: NutritionFacts;
  /** Open Food Facts `categories_tags`, for the Nutri-Score category. */
  categoryTags: string[];
}

/** EU energy conversion: 1 kcal = 4.184 kJ. */
const KJ_PER_KCAL = 4.184;

/** EU 1169/2011 conversion between sodium and salt. */
const SALT_PER_SODIUM = 2.5;

export const NUTRITION_FACT_KEYS = [
  "energyKj",
  "fat",
  "saturates",
  "carbohydrate",
  "sugars",
  "fibre",
  "protein",
  "salt",
  "fruitVegLegumesPct",
] as const;

function finiteNonNegative(value: unknown): number | null {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim() !== ""
        ? Number(value)
        : NaN;

  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

/**
 * Reads an Open Food Facts `nutriments` object. Returns null when it holds
 * none of the fields we score. Sodium stands in for salt only when salt
 * itself is absent, and kcal for kJ only when kJ is.
 */
export function factsFromOpenFoodFacts(
  nutriments: unknown,
  isBeverage: boolean,
): NutritionFacts | null {
  if (typeof nutriments !== "object" || nutriments === null) {
    return null;
  }

  const source = nutriments as Record<string, unknown>;

  const kj =
    finiteNonNegative(source["energy-kj_100g"]) ??
    finiteNonNegative(source["energy_100g"]);

  const kcal = finiteNonNegative(source["energy-kcal_100g"]);

  const sodium = finiteNonNegative(source["sodium_100g"]);

  const facts: NutritionFacts = {
    energyKj: kj ?? (kcal === null ? null : kcal * KJ_PER_KCAL),
    fat: finiteNonNegative(source["fat_100g"]),
    saturates: finiteNonNegative(source["saturated-fat_100g"]),
    carbohydrate: finiteNonNegative(source["carbohydrates_100g"]),
    sugars: finiteNonNegative(source["sugars_100g"]),
    fibre: finiteNonNegative(source["fiber_100g"]),
    protein: finiteNonNegative(source["proteins_100g"]),
    salt:
      finiteNonNegative(source["salt_100g"]) ??
      (sodium === null ? null : sodium * SALT_PER_SODIUM),
    fruitVegLegumesPct: finiteNonNegative(
      source["fruits-vegetables-legumes-estimate-from-ingredients_100g"],
    ),
    isBeverage,
    abv: finiteNonNegative(source["alcohol_100g"]),
  };

  const hasAnything = NUTRITION_FACT_KEYS.some(
    (key) => key !== "fruitVegLegumesPct" && facts[key] !== null,
  );

  return hasAnything ? facts : null;
}

/** Facts from a table read off the label (nutritionPanel.ts). */
export function factsFromPanel(panel: NutritionPanel): NutritionFacts {
  const gramsOf = (key: string): number | null =>
    panel.readings.find((reading) => reading.key === key)?.gramsPer100 ??
    null;

  return {
    energyKj:
      typeof panel.energyKcal === "number"
        ? panel.energyKcal * KJ_PER_KCAL
        : null,
    fat: panel.fat ?? null,
    saturates: gramsOf("saturates"),
    carbohydrate: panel.carbohydrate ?? null,
    sugars: gramsOf("sugars"),
    fibre: gramsOf("fibre"),
    protein: gramsOf("protein"),
    salt: gramsOf("salt"),
    fruitVegLegumesPct: null,
    isBeverage: panel.isBeverage,
    abv: null,
  };
}

/** Per-100 tolerances, the same ones the label reader applies. */
const MAX_PER_100 = 100;
const MAX_MACRO_SUM = 105;
const ENERGY_TOLERANCE_KCAL = 25;
const ENERGY_TOLERANCE_RATIO = 0.2;
const ETHANOL_KCAL_PER_GRAM = 7;
const ETHANOL_GRAMS_PER_ML = 0.789;

/**
 * What is physically impossible in a per-100 set, tolerant of missing
 * values (only what is present is checked). An empty list means "nothing
 * contradicts itself"; anything else means the data is not to be trusted and
 * the caller must discard the whole set.
 *
 *  - no value outside 0–100 g;
 *  - a part is never larger than its whole: sugars ≤ carbohydrate,
 *    saturates ≤ fat (half a gram of slack for label rounding);
 *  - fat + carbohydrate + protein + fibre + salt ≤ 105 g;
 *  - when fat, carbohydrate and protein are all known, the declared energy
 *    agrees with the Atwater sum (plus the ethanol's energy for a drink).
 *
 * This is the "reject values that are physically impossible per 100 g" gate
 * for Open Food Facts data; it is what turns a misplaced decimal ("5" for
 * 0.5) from a silently wrong grade into a discarded set.
 */
export function physicalViolations(facts: NutritionFacts): string[] {
  const violations: string[] = [];

  for (const key of NUTRITION_FACT_KEYS) {
    const value = facts[key];

    if (key === "energyKj" || value === null) {
      continue;
    }

    if (value > MAX_PER_100) {
      violations.push(`${key} ${value} exceeds ${MAX_PER_100} g per 100`);
    }
  }

  if (
    facts.sugars !== null &&
    facts.carbohydrate !== null &&
    facts.sugars > facts.carbohydrate + 0.5
  ) {
    violations.push("sugars exceed carbohydrate");
  }

  if (
    facts.saturates !== null &&
    facts.fat !== null &&
    facts.saturates > facts.fat + 0.5
  ) {
    violations.push("saturates exceed fat");
  }

  const macroSum =
    (facts.fat ?? 0) +
    (facts.carbohydrate ?? 0) +
    (facts.protein ?? 0) +
    (facts.fibre ?? 0) +
    (facts.salt ?? 0);

  if (macroSum > MAX_MACRO_SUM) {
    violations.push(`macronutrients sum to ${macroSum} g per 100`);
  }

  if (
    facts.energyKj !== null &&
    facts.fat !== null &&
    facts.carbohydrate !== null &&
    facts.protein !== null
  ) {
    const computedKcal =
      4 * facts.protein +
      4 * facts.carbohydrate +
      9 * facts.fat +
      2 * (facts.fibre ?? 0);

    const alcoholKcal =
      facts.abv === null
        ? 0
        : facts.abv * ETHANOL_GRAMS_PER_ML * ETHANOL_KCAL_PER_GRAM;

    const expectedKcal = computedKcal + alcoholKcal;

    const tolerance = Math.max(
      ENERGY_TOLERANCE_KCAL,
      expectedKcal * ENERGY_TOLERANCE_RATIO,
    );

    if (Math.abs(facts.energyKj / KJ_PER_KCAL - expectedKcal) > tolerance) {
      violations.push("energy disagrees with the macronutrients");
    }
  }

  return violations;
}

// --- Nutri-Score category ----------------------------------------------------

/**
 * Open Food Facts category tags that make a product fall under each special
 * Nutri-Score rule. Matched as whole tags. Sources for what the categories
 * contain: SpF-2022 §2.1 (fats, oils, nuts, seeds: "fats and oils from plant
 * or animal sources, including cream, margarines, butters and oils", plus
 * nuts and seeds) and SpF-2023 §1.2 (beverages).
 */
const FATS_TAGS = new Set([
  "en:fats",
  "en:vegetable-fats",
  "en:animal-fats",
  "en:vegetable-oils",
  "en:oils-and-fats",
  "en:vegetable-oils-and-fats",
  "en:butters",
  "en:margarines",
  "en:creams",
  "en:milkfat",
  "en:nuts",
  "en:seeds",
  "en:olive-oils",
]);

const CHEESE_TAGS = new Set(["en:cheeses"]);

const RED_MEAT_TAGS = new Set([
  "en:beef",
  "en:beef-and-its-products",
  "en:pork",
  "en:pork-and-its-products",
  "en:lamb",
  "en:veal",
  "en:red-meats",
  "en:game-meat",
]);

const WATER_TAGS = new Set(["en:waters", "en:spring-waters", "en:mineral-waters"]);

/** A water that is sweetened or flavoured is a drink like any other. */
const SWEETENED_WATER_TAGS = new Set([
  "en:flavoured-waters",
  "en:sweetened-beverages",
]);

/**
 * Sweetened, flavoured and alcoholic drinks are all "beverages" for the
 * algorithm; plain waters are the one A. Exactly matched, never by suffix —
 * "en:plant-based-foods-and-beverages" holds breakfast cereal.
 */
const BEVERAGE_TAGS = new Set([
  "en:beverages",
  "en:sodas",
  "en:juices",
  "en:fruit-juices",
  "en:nectars",
  "en:juices-and-nectars",
  "en:plant-based-beverages",
  "en:dairy-drinks",
  "en:iced-teas",
  "en:energy-drinks",
  "en:sweetened-beverages",
  "en:alcoholic-beverages",
  "en:beers",
  "en:wines",
  "en:milks",
]);

export function detectNutriScoreCategory(
  categoryTags: string[],
  isBeverage: boolean,
): NutriScoreCategory {
  const tags = new Set(categoryTags.map((tag) => tag.trim().toLowerCase()));

  const has = (set: Set<string>) => [...tags].some((tag) => set.has(tag));

  if (has(WATER_TAGS) && !has(SWEETENED_WATER_TAGS)) {
    return "water";
  }

  if (isBeverage || has(BEVERAGE_TAGS)) {
    return "beverage";
  }

  if (has(CHEESE_TAGS)) {
    return "cheese";
  }

  if (has(FATS_TAGS)) {
    return "fats_oils_nuts_seeds";
  }

  if (has(RED_MEAT_TAGS)) {
    return "red_meat";
  }

  return "general";
}

/** Everything the Nutri-Score needs, from evidence plus what the ingredients say. */
export function nutriScoreInputFor(
  evidence: NutritionEvidence,
  options?: { nonNutritiveSweetener?: boolean | null },
): NutriScoreInput {
  const { facts } = evidence;

  return {
    category: detectNutriScoreCategory(evidence.categoryTags, facts.isBeverage),
    energyKj: facts.energyKj,
    saturates: facts.saturates,
    sugars: facts.sugars,
    salt: facts.salt,
    fat: facts.fat,
    carbohydrate: facts.carbohydrate,
    fibre: facts.fibre,
    protein: facts.protein,
    fruitVegLegumesPct: facts.fruitVegLegumesPct,
    nonNutritiveSweetener: options?.nonNutritiveSweetener ?? null,
  };
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

/**
 * Reads evidence persisted on a stored analysis. The PIM posts the whole
 * envelope back, so this is validated like every other stored field:
 * anything malformed is dropped rather than half-trusted.
 */
export function parseNutritionEvidence(value: unknown): NutritionEvidence | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const candidate = value as Record<string, unknown>;

  if (candidate.source !== "label" && candidate.source !== "openfoodfacts") {
    return null;
  }

  const rawFacts = candidate.facts;

  if (typeof rawFacts !== "object" || rawFacts === null) {
    return null;
  }

  const record = rawFacts as Record<string, unknown>;

  const facts: NutritionFacts = {
    energyKj: numberOrNull(record.energyKj),
    fat: numberOrNull(record.fat),
    saturates: numberOrNull(record.saturates),
    carbohydrate: numberOrNull(record.carbohydrate),
    sugars: numberOrNull(record.sugars),
    fibre: numberOrNull(record.fibre),
    protein: numberOrNull(record.protein),
    salt: numberOrNull(record.salt),
    fruitVegLegumesPct: numberOrNull(record.fruitVegLegumesPct),
    isBeverage: record.isBeverage === true,
    abv: numberOrNull(record.abv),
  };

  if (physicalViolations(facts).length > 0) {
    return null;
  }

  return {
    source: candidate.source,
    facts,
    categoryTags: Array.isArray(candidate.categoryTags)
      ? candidate.categoryTags.filter(
          (tag): tag is string => typeof tag === "string",
        )
      : [],
  };
}
