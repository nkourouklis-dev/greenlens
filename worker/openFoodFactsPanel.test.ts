import assert from "node:assert/strict";
import test from "node:test";
import { panelFromOpenFoodFacts } from "./nutritionPanel";
import { isBeverageProduct } from "./productLookup";
import { penaltiesFor } from "./nutritionThresholds";

/**
 * Quantities taken from an Open Food Facts record instead of from the
 * photo, for the common case where a label shows only its ingredient list
 * and crops the nutrition table out.
 *
 * These are the real `nutriments` of barcode 7613287308870 — the same
 * product the OCR path reads in mixedLabelScoring.test.ts, so the two
 * sources can be held to the same answer.
 */
const NESTLE_NUTRIMENTS = {
  "energy-kcal_100g": 395.156150414276,
  "energy-kj_100g": 1652,
  carbohydrates_100g: 66.5,
  fat_100g: 7.3,
  fiber_100g: 9.6,
  proteins_100g: 10.3,
  salt_100g: 0.91,
  "saturated-fat_100g": 1.4,
  sodium_100g: 0.364,
  sugars_100g: 19.9,
};

test("an Open Food Facts record yields the same readings the photo does", () => {
  const panel = panelFromOpenFoodFacts(NESTLE_NUTRIMENTS, false);

  assert(panel, "no panel was built");
  assert.equal(panel.isBeverage, false);

  assert.deepEqual(
    panel.readings.map((reading) => [reading.key, reading.gramsPer100]),
    [
      ["sugars", 19.9],
      ["saturates", 1.4],
      ["salt", 0.91],
      ["fibre", 9.6],
      ["protein", 10.3],
    ],
  );
});

test("a record with no nutrition data yields no panel", () => {
  assert.equal(panelFromOpenFoodFacts({}, false), null);
  assert.equal(panelFromOpenFoodFacts(null, false), null);
  assert.equal(panelFromOpenFoodFacts("nutriments", false), null);
});

// Open Food Facts is crowd-sourced and carries its own misplaced decimal
// points, so it goes through the identical plausibility gate the OCR
// readings do — "someone typed it into a database" is not better evidence
// than "OCR read it off the pack".
test("an implausible record is rejected exactly like an implausible photo", () => {
  assert.equal(
    panelFromOpenFoodFacts(
      { ...NESTLE_NUTRIMENTS, salt_100g: 91 },
      false,
    ),
    null,
  );

  assert.equal(
    panelFromOpenFoodFacts(
      { ...NESTLE_NUTRIMENTS, "energy-kcal_100g": 1392 },
      false,
    ),
    null,
  );

  // Mandatory totals missing: not a record that was read correctly.
  assert.equal(
    panelFromOpenFoodFacts({ sugars_100g: 19.9, salt_100g: 0.91 }, false),
    null,
  );
});

// The umbrella category "en:plant-based-foods-and-beverages" covers most of
// the grocery aisle. Matching it as a beverage put a box of breakfast
// cereal on the drinks sugar scale — 60 points instead of 20, two bands of
// the final score.
test("an umbrella category ending in -beverages is not a drink", () => {
  assert.equal(
    isBeverageProduct({
      categories_tags: [
        "en:plant-based-foods-and-beverages",
        "en:plant-based-foods",
        "en:breakfast-cereals",
        "en:mueslis",
      ],
    }),
    false,
  );
});

test("a real drink is still a drink", () => {
  assert.equal(
    isBeverageProduct({
      categories_tags: ["en:beverages", "en:sodas", "en:colas"],
    }),
    true,
  );

  assert.equal(isBeverageProduct({}), false);
  assert.equal(isBeverageProduct({ categories_tags: "en:beverages" }), false);
});

// The consequence of getting that wrong, spelled out in points.
test("the drinks scale is far harsher, which is why the tag must be exact", () => {
  const readings = [
    { key: "sugars" as const, gramsPer100: 19.9, declared: "19.9 g" },
  ];

  assert.equal(penaltiesFor(readings, false)[0].points, 20);
  assert.equal(penaltiesFor(readings, true)[0].points, 60);
});
