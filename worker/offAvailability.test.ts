import assert from "node:assert/strict";
import test from "node:test";
import {
  canSkipAllPhotos,
  dataAvailability,
  hasCompleteNutrition,
  hasUsableIngredients,
} from "./offAvailability";
import type { NutritionFacts } from "./nutritionFacts";
import type { BarcodeProductResult } from "./productLookup";

const FULL_FACTS: NutritionFacts = {
  energyKj: 1800,
  fat: 20,
  saturates: 5,
  carbohydrate: 55,
  sugars: 12,
  fibre: 4,
  protein: 7,
  salt: 0.8,
  fruitVegLegumesPct: null,
  isBeverage: false,
  abv: null,
};

const GOOD_INGREDIENTS =
  "Αλεύρι σίτου, ζάχαρη, φυτικό λάδι (ηλιέλαιο), αλάτι, μαγιά";

function record(
  overrides: Partial<BarcodeProductResult>,
): BarcodeProductResult {
  return {
    productName: "Μπισκότα",
    brand: "Μάρκα",
    netContent: null,
    nutritionPanel: null,
    nutritionFacts: FULL_FACTS,
    categoryTags: [],
    ingredientsText: GOOD_INGREDIENTS,
    nutriscoreGrade: "c",
    confidence: 0.98,
    source: "openfoodfacts",
    ...overrides,
  };
}

test("a complete food record has everything", () => {
  const availability = dataAvailability(record({}));

  assert.deepEqual(availability, {
    ingredients: true,
    nutrition: true,
    nutriScore: true,
    source: "openfoodfacts",
  });
  assert.equal(canSkipAllPhotos(availability), true);
});

test("ingredients only: photos are still needed for the table", () => {
  const availability = dataAvailability(record({ nutritionFacts: null }));

  assert.equal(availability.ingredients, true);
  assert.equal(availability.nutrition, false);
  assert.equal(canSkipAllPhotos(availability), false);
});

test("nutrition only: the ingredient photo is still needed", () => {
  const availability = dataAvailability(record({ ingredientsText: null }));

  assert.equal(availability.ingredients, false);
  assert.equal(availability.nutrition, true);
  assert.equal(canSkipAllPhotos(availability), false);
});

test("a record cached before ingredient text was kept has none", () => {
  const legacy = record({});
  delete legacy.ingredientsText;

  assert.equal(dataAvailability(legacy).ingredients, false);
});

test("not found or an OFF error gives nothing", () => {
  assert.equal(
    canSkipAllPhotos(dataAvailability(record({ source: null }))),
    false,
  );
  assert.equal(canSkipAllPhotos(dataAvailability(null)), false);
  assert.equal(canSkipAllPhotos(dataAvailability(undefined)), false);
});

test("a truncated list or an OFF 'to be completed' flag is not trusted", () => {
  // The real Nutella record read "sugar, palm oil".
  assert.equal(hasUsableIngredients("sugar, palm oil"), false);
  assert.equal(
    hasUsableIngredients("Αλεύρι (σίτου, βρώμης), ζάχαρη, αλάτι"),
    true,
    "separators inside parentheses are one item",
  );

  assert.equal(
    dataAvailability(
      record({
        offStates: { ingredientsToBeCompleted: true, nutritionToBeCompleted: false },
      }),
    ).ingredients,
    false,
  );
  assert.equal(
    dataAvailability(
      record({
        offStates: { ingredientsToBeCompleted: false, nutritionToBeCompleted: true },
      }),
    ).nutrition,
    false,
  );
});

test("garbage ingredient strings are not a list", () => {
  for (const text of ["", "   ", "-", "123", "n/a", ".,;", null, undefined]) {
    assert.equal(hasUsableIngredients(text), false, String(text));
  }

  assert.equal(hasUsableIngredients("x".repeat(5000)), false);
  assert.equal(hasUsableIngredients(GOOD_INGREDIENTS), true);
});

test("zero-filled and partial tables are placeholders, not nutrition", () => {
  assert.equal(
    hasCompleteNutrition({
      ...FULL_FACTS,
      energyKj: 0,
      fat: 0,
      saturates: 0,
      sugars: 0,
      salt: 0,
      protein: 0,
    }),
    false,
  );
  assert.equal(
    hasCompleteNutrition({ ...FULL_FACTS, energyKj: 0 }),
    false,
  );

  for (const missing of ["fat", "saturates", "sugars", "salt", "protein", "energyKj"] as const) {
    assert.equal(
      hasCompleteNutrition({ ...FULL_FACTS, [missing]: null }),
      false,
      missing,
    );
  }

  assert.equal(hasCompleteNutrition(null), false);
  assert.equal(hasCompleteNutrition({ ...FULL_FACTS, fat: Number.NaN }), false);
});

test("a cosmetic skips on its ingredient list alone, never on nutrition", () => {
  const availability = dataAvailability(
    record({
      source: "openbeautyfacts",
      nutritionFacts: FULL_FACTS,
      nutriscoreGrade: "a",
      ingredientsText: "Aqua, Glycerin, Parfum, Sodium Benzoate",
    }),
  );

  assert.equal(availability.nutrition, false);
  assert.equal(availability.nutriScore, false);
  assert.equal(canSkipAllPhotos(availability), true);

  assert.equal(
    canSkipAllPhotos(
      dataAvailability(
        record({ source: "openbeautyfacts", ingredientsText: null }),
      ),
    ),
    false,
  );
});

test("Nutri-Score is reported only when OFF graded the product", () => {
  assert.equal(
    dataAvailability(record({ nutriscoreGrade: null })).nutriScore,
    false,
  );
});
