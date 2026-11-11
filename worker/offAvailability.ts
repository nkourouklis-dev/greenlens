import { extractIngredientText } from "./ingredientText";
import type { BarcodeProductResult } from "./productLookup";

/**
 * What an Open Food Facts / Open Beauty Facts record can stand in for.
 *
 * Pure and conservative: anything missing, garbled or filled with placeholder
 * zeros counts as NOT present, so the app falls back to photographing the
 * label exactly as it always did. It never invents a value.
 */
export interface DataAvailability {
  /** A usable ingredient list is on record. */
  ingredients: boolean;
  /** A complete, plausible per-100 table is on record (foods only). */
  nutrition: boolean;
  /** OFF computed a Nutri-Score letter for it. */
  nutriScore: boolean;
  /** Which service holds the record; null when neither knows the barcode. */
  source: BarcodeProductResult["source"];
}

export const NO_AVAILABILITY: DataAvailability = {
  ingredients: false,
  nutrition: false,
  nutriScore: false,
  source: null,
};

const MIN_INGREDIENT_CHARS = 8;
const MAX_INGREDIENT_CHARS = 4000;

/** Whether an OFF ingredient string is a real list the pipeline can parse. */
export function hasUsableIngredients(text: string | null | undefined): boolean {
  if (typeof text !== "string") {
    return false;
  }

  const trimmed = text.trim();

  if (
    trimmed.length < MIN_INGREDIENT_CHARS ||
    trimmed.length > MAX_INGREDIENT_CHARS
  ) {
    return false;
  }

  // Needs actual words, not a bare number or punctuation left by an import.
  if (!/\p{L}{3,}/u.test(trimmed)) {
    return false;
  }

  // The same validator the OCR path runs, fed an OCR-trusted confidence:
  // OFF text has no OCR noise, only the question of whether it is a list.
  return extractIngredientText(trimmed, 0.95).isValid;
}

/**
 * Energy plus fat, saturates, sugars, salt and protein, all numbers, and not
 * a table of placeholders. `nutritionFacts` already passed the physical
 * plausibility checks when the record was read (productLookup.ts).
 */
export function hasCompleteNutrition(
  facts: BarcodeProductResult["nutritionFacts"],
): boolean {
  if (facts === null || typeof facts !== "object") {
    return false;
  }

  const required = [
    facts.energyKj,
    facts.fat,
    facts.saturates,
    facts.sugars,
    facts.salt,
    facts.protein,
  ];

  if (
    !required.every(
      (value) => typeof value === "number" && Number.isFinite(value) && value >= 0,
    )
  ) {
    return false;
  }

  // A zero-filled import (every field 0) is a placeholder, not a measurement;
  // so is a table where energy is 0 yet something has mass.
  const numbers = required as number[];
  const allZero = numbers.every((value) => value === 0);
  const energyZeroButMass =
    facts.energyKj === 0 && numbers.slice(1).some((value) => value > 0);

  return !allZero && !energyZeroButMass;
}

export function dataAvailability(
  result: BarcodeProductResult | null | undefined,
): DataAvailability {
  if (!result || result.source === null) {
    return NO_AVAILABILITY;
  }

  const ingredients = hasUsableIngredients(result.ingredientsText);

  return {
    ingredients,
    // Open Beauty Facts has no nutrition; never report it for cosmetics.
    nutrition:
      result.source === "openfoodfacts" &&
      hasCompleteNutrition(result.nutritionFacts),
    nutriScore:
      result.source === "openfoodfacts" &&
      typeof result.nutriscoreGrade === "string",
    source: result.source,
  };
}

/**
 * Whether the result can be built straight from the record, with no photo:
 * a food needs both halves, a cosmetic only its ingredient list.
 */
export function canSkipAllPhotos(availability: DataAvailability): boolean {
  if (availability.source === "openbeautyfacts") {
    return availability.ingredients;
  }

  return (
    availability.source === "openfoodfacts" &&
    availability.ingredients &&
    availability.nutrition
  );
}
