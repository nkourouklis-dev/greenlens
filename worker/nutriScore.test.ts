import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  computeNutriScore,
  gradeForPoints,
  nutriScoreTo100,
  NUTRI_SCORE_TO_100,
  type NutriScoreInput,
} from "./nutriScore";
import {
  detectNutriScoreCategory,
  factsFromOpenFoodFacts,
  nutriScoreInputFor,
  physicalViolations,
} from "./nutritionFacts";

/**
 * The updated Nutri-Score, checked against the Santé publique France tables
 * it is transcribed from (see nutriScore.ts for the documents) and against
 * Open Food Facts' own 2023 grade for real products.
 */

const NONE: NutriScoreInput = {
  category: "general",
  energyKj: null,
  saturates: null,
  sugars: null,
  salt: null,
  fat: null,
  carbohydrate: null,
  fibre: null,
  protein: null,
  fruitVegLegumesPct: null,
  nonNutritiveSweetener: null,
};

function compute(overrides: Partial<NutriScoreInput>) {
  return computeNutriScore({ ...NONE, ...overrides });
}

function computed(overrides: Partial<NutriScoreInput>) {
  const result = compute(overrides);

  assert(result.computable, "expected a computable result");

  return result;
}

// ---------------------------------------------------------------------------
// The tables: a nutrient earns a point for each threshold it is strictly above
// ---------------------------------------------------------------------------

test("general foods: the edges of every scored table, in both directions", () => {
  const base = { energyKj: 0, saturates: 0, sugars: 0, salt: 0 };

  const points = (overrides: Partial<NutriScoreInput>) =>
    computed({ ...base, ...overrides }).negativePoints;

  // Energy: 335 kJ per point, exactly 335 is still 0.
  assert.equal(points({ energyKj: 335 }), 0);
  assert.equal(points({ energyKj: 335.1 }), 1);
  assert.equal(points({ energyKj: 3350 }), 9);
  assert.equal(points({ energyKj: 3351 }), 10);

  // Saturates: 1 g per point, capped at 10.
  assert.equal(points({ saturates: 1 }), 0);
  assert.equal(points({ saturates: 1.01 }), 1);
  assert.equal(points({ saturates: 10.1 }), 10);

  // Sugars: the revised 0–15 scale.
  assert.equal(points({ sugars: 3.4 }), 0);
  assert.equal(points({ sugars: 3.5 }), 1);
  assert.equal(points({ sugars: 51 }), 14);
  assert.equal(points({ sugars: 51.1 }), 15);

  // Salt: 0.2 g per point up to 20.
  assert.equal(points({ salt: 0.2 }), 0);
  assert.equal(points({ salt: 0.21 }), 1);
  assert.equal(points({ salt: 4 }), 19);
  assert.equal(points({ salt: 4.1 }), 20);
});

test("the favourable side: protein 0–7, fibre 0–5, fruit/veg/legumes 0/1/2/5", () => {
  const positives = (overrides: Partial<NutriScoreInput>) =>
    computed({
      energyKj: 0,
      saturates: 0,
      sugars: 0,
      salt: 0,
      ...overrides,
    }).positivePoints;

  assert.equal(positives({ protein: 2.4 }), 0);
  assert.equal(positives({ protein: 2.5 }), 1);
  assert.equal(positives({ protein: 17.1 }), 7);
  assert.equal(positives({ fibre: 3.0 }), 0);
  assert.equal(positives({ fibre: 3.1 }), 1);
  assert.equal(positives({ fibre: 7.5 }), 5);
  assert.equal(positives({ fruitVegLegumesPct: 40 }), 0);
  assert.equal(positives({ fruitVegLegumesPct: 41 }), 1);
  assert.equal(positives({ fruitVegLegumesPct: 61 }), 2);
  assert.equal(positives({ fruitVegLegumesPct: 81 }), 5);
});

test("protein stops counting once the unfavourable side reaches 11 (general foods)", () => {
  // 10 negative points from sugars alone, then 11.
  const below = computed({
    energyKj: 0,
    saturates: 0,
    sugars: 31.5, // 9 points... plus saturates below
    salt: 0,
    protein: 20,
  });

  assert.equal(below.negativePoints < 11, true);
  assert.equal(below.positivePoints, 7);

  const above = computed({
    energyKj: 1700, // 5
    saturates: 6.5, // 6
    sugars: 0,
    salt: 0,
    protein: 20,
    fibre: 4.5,
  });

  assert.equal(above.negativePoints, 11);
  // protein (7) left out; only fibre's 2 points are subtracted.
  assert.equal(above.positivePoints, 2);
  assert.equal(above.points, 9);
});

test("cheese always subtracts its protein; red meat caps it at 2 points", () => {
  const rich = {
    energyKj: 1700,
    saturates: 6.5,
    sugars: 0,
    salt: 0,
    protein: 25,
  };

  assert.equal(computed({ ...rich, category: "general" }).positivePoints, 0);
  assert.equal(computed({ ...rich, category: "cheese" }).positivePoints, 7);
  assert.equal(
    computed({ ...rich, category: "red_meat", energyKj: 0, saturates: 0 })
      .positivePoints,
    2,
  );
});

test("class edges for general foods: A ≤ 0, B 1–2, C 3–10, D 11–18, E ≥ 19", () => {
  const grades = [0, 1, 2, 3, 10, 11, 18, 19].map((points) =>
    gradeForPoints("general", points),
  );

  assert.deepEqual(grades, ["A", "B", "B", "C", "C", "D", "D", "E"]);
});

// ---------------------------------------------------------------------------
// Fats, oils, nuts and seeds
// ---------------------------------------------------------------------------

test("fats: class edges are A ≤ −6, B −5–2, C 3–10, D 11–18, E ≥ 19", () => {
  const grades = [-6, -5, 2, 3, 10, 11, 18, 19].map((points) =>
    gradeForPoints("fats_oils_nuts_seeds", points),
  );

  assert.deepEqual(grades, ["A", "B", "B", "C", "C", "D", "D", "E"]);
});

test("fats: energy comes from the saturates (×37 kJ/g) and the ratio is saturates/fat", () => {
  const result = computed({
    category: "fats_oils_nuts_seeds",
    saturates: 23,
    fat: 60,
    sugars: 0,
    salt: 0.01,
  });

  const byKey = Object.fromEntries(
    result.components.map((component) => [component.key, component]),
  );

  // 23 g × 37 = 851 kJ → above 840, the 7th threshold.
  assert.equal(byKey.energy_from_saturates.value, 851);
  assert.equal(byKey.energy_from_saturates.points, 7);
  // 23/60 = 38.3 % → "< 40" is the 5-point row.
  assert.equal(Math.round((byKey.saturates_ratio.value ?? 0) * 10) / 10, 38.3);
  assert.equal(byKey.saturates_ratio.points, 5);
  assert.equal(result.negativePoints, 12);
});

test("fats: the ratio table's own edges", () => {
  const ratioPoints = (saturates: number) =>
    computed({
      category: "fats_oils_nuts_seeds",
      saturates,
      fat: 100,
      sugars: 0,
      salt: 0,
    }).components.find((component) => component.key === "saturates_ratio")
      ?.points;

  assert.equal(ratioPoints(9.9), 0);
  assert.equal(ratioPoints(10), 1);
  assert.equal(ratioPoints(63.9), 9);
  assert.equal(ratioPoints(64), 10);
});

test("fats: protein stops counting at 7 unfavourable points, not 11", () => {
  const result = computed({
    category: "fats_oils_nuts_seeds",
    saturates: 23,
    fat: 60,
    sugars: 0,
    salt: 0.01,
    protein: 20,
  });

  assert.equal(result.negativePoints, 12);
  assert.equal(result.positivePoints, 0);
});

// ---------------------------------------------------------------------------
// Beverages
// ---------------------------------------------------------------------------

test("beverages: their own energy and sugar grids and class edges", () => {
  const drink = (overrides: Partial<NutriScoreInput>) =>
    computed({
      category: "beverage",
      energyKj: 0,
      saturates: 0,
      sugars: 0,
      salt: 0,
      ...overrides,
    });

  assert.equal(drink({ energyKj: 30 }).negativePoints, 0);
  assert.equal(drink({ energyKj: 31 }).negativePoints, 1);
  assert.equal(drink({ energyKj: 391 }).negativePoints, 10);
  assert.equal(drink({ sugars: 0.5 }).negativePoints, 0);
  assert.equal(drink({ sugars: 0.6 }).negativePoints, 1);
  assert.equal(drink({ sugars: 11.1 }).negativePoints, 10);

  const grades = [2, 3, 6, 7, 9, 10].map((points) =>
    gradeForPoints("beverage", points),
  );

  assert.deepEqual(grades, ["B", "C", "C", "D", "D", "E"]);
});

test("beverages: a non-nutritive sweetener adds 4 points, and unknown adds none but is said", () => {
  const base = {
    category: "beverage" as const,
    energyKj: 0,
    saturates: 0,
    sugars: 0,
    salt: 0,
  };

  assert.equal(
    computed({ ...base, nonNutritiveSweetener: true }).negativePoints,
    4,
  );

  const unknown = computed({ ...base, nonNutritiveSweetener: null });

  assert.equal(unknown.negativePoints, 0);
  assert.deepEqual(unknown.uncredited, [
    "protein",
    "fibre",
    "fruit_veg_legumes",
    "sweeteners",
  ]);
});

test("water is the one beverage that is an A", () => {
  const water = computed({ category: "water" });

  assert.equal(water.grade, "A");
  assert.equal(water.points, null);
});

// ---------------------------------------------------------------------------
// Partial data: never invented
// ---------------------------------------------------------------------------

test("a missing unfavourable nutrient makes the grade not computable, and says which", () => {
  const result = compute({ energyKj: 500, saturates: 1, salt: 0.1 });

  assert.equal(result.computable, false);
  assert.deepEqual(!result.computable && result.missing, ["sugars"]);
});

test("sugars, when undeclared, are bounded by the carbohydrate — only if that settles the points", () => {
  // Butter: 0.4 g carbohydrate cannot hold the 3.4 g that would score.
  const bounded = computed({
    category: "fats_oils_nuts_seeds",
    saturates: 23,
    fat: 60,
    salt: 0.01,
    carbohydrate: 0.4,
  });

  assert.equal(bounded.sugarsBoundedByCarbohydrate, true);

  // A biscuit with 60 g of carbohydrate could have anywhere from 0 to 60 g
  // of sugar: 0 and 15 points. Not determinate → not scored.
  const open = compute({
    energyKj: 1900,
    saturates: 5,
    salt: 0.5,
    carbohydrate: 60,
  });

  assert.equal(open.computable, false);
  assert.deepEqual(!open.computable && open.missing, ["sugars"]);
});

test("undeclared fibre and protein earn nothing and are listed, never assumed", () => {
  const result = computed({
    energyKj: 100,
    saturates: 0,
    sugars: 0,
    salt: 0,
  });

  assert.equal(result.positivePoints, 0);
  assert.deepEqual(result.uncredited, [
    "protein",
    "fibre",
    "fruit_veg_legumes",
  ]);
});

test("the grade-to-score map is one function and stays inside the verdict bands", () => {
  assert.deepEqual(NUTRI_SCORE_TO_100, { A: 92, B: 77, C: 60, D: 40, E: 15 });
  assert.equal(nutriScoreTo100("D"), 40);
});

// ---------------------------------------------------------------------------
// Categories, from Open Food Facts tags
// ---------------------------------------------------------------------------

test("category comes from whole category tags, never from a suffix", () => {
  assert.equal(detectNutriScoreCategory(["en:butters", "en:dairies"], false), "fats_oils_nuts_seeds");
  assert.equal(detectNutriScoreCategory(["en:cheeses"], false), "cheese");
  assert.equal(detectNutriScoreCategory(["en:sodas"], false), "beverage");
  assert.equal(detectNutriScoreCategory(["en:mineral-waters", "en:waters"], true), "water");
  assert.equal(detectNutriScoreCategory(["en:flavoured-waters", "en:waters", "en:sweetened-beverages"], true), "beverage");
  // The umbrella tag that holds breakfast cereal is not a drink.
  assert.equal(
    detectNutriScoreCategory(["en:plant-based-foods-and-beverages", "en:breakfast-cereals"], false),
    "general",
  );
});

// ---------------------------------------------------------------------------
// Physical plausibility of per-100 data
// ---------------------------------------------------------------------------

test("values no product can have are rejected as a set", () => {
  const facts = (nutriments: Record<string, number>) =>
    factsFromOpenFoodFacts(nutriments, false);

  // The Kaiser bug in database form: 5 g of sugar where 0.5 was declared,
  // beside 1 g of carbohydrate.
  const misplacedDecimal = facts({
    "sugars_100g": 5,
    "carbohydrates_100g": 1,
    "fat_100g": 0,
    "proteins_100g": 0.5,
  });

  assert(misplacedDecimal);
  assert.deepEqual(physicalViolations(misplacedDecimal), ["sugars exceed carbohydrate"]);

  const over100 = facts({ "salt_100g": 120 });

  assert(over100);
  assert(
    physicalViolations(over100).includes("salt 120 exceeds 100 g per 100"),
  );

  const consistent = facts({
    "energy-kj_100g": 2232,
    "fat_100g": 60,
    "saturated-fat_100g": 23,
    "carbohydrates_100g": 0.4,
    "proteins_100g": 0.3,
  });

  assert(consistent);
  assert.deepEqual(physicalViolations(consistent), []);

  // Energy that its own macros cannot explain (2232 kJ beside no fat).
  const wrongEnergy = facts({
    "energy-kj_100g": 2232,
    "fat_100g": 6,
    "carbohydrates_100g": 0.4,
    "proteins_100g": 0.3,
  });

  assert(wrongEnergy);
  assert.deepEqual(physicalViolations(wrongEnergy), ["energy disagrees with the macronutrients"]);
});

test("sodium stands in for salt only when salt is absent, kcal for kJ likewise", () => {
  const facts = factsFromOpenFoodFacts(
    { "sodium_100g": 0.4, "energy-kcal_100g": 100 },
    false,
  );

  assert(facts);
  assert.equal(facts.salt, 1);
  assert.equal(Math.round(facts.energyKj ?? 0), 418);

  const both = factsFromOpenFoodFacts(
    { "salt_100g": 0.5, "sodium_100g": 0.4, "energy-kj_100g": 400, "energy-kcal_100g": 100 },
    false,
  );

  assert.equal(both?.salt, 0.5);
  assert.equal(both?.energyKj, 400);
});

// ---------------------------------------------------------------------------
// Cross-check against Open Food Facts' own 2023 grade, on real products
// ---------------------------------------------------------------------------

interface OffProduct {
  code: string;
  name: string;
  category: "general" | "fats" | "beverage" | "red_meat" | "water" | "cheese";
  nutriments: Record<string, number>;
  sweetener: boolean;
  offGrade: string;
}

const OFF_PRODUCTS: OffProduct[] = JSON.parse(
  readFileSync(
    new URL("./fixtures/offNutriScoreProducts.json", import.meta.url),
    "utf8",
  ),
);

const OFF_CATEGORY = {
  general: "general",
  fats: "fats_oils_nuts_seeds",
  beverage: "beverage",
  red_meat: "red_meat",
  water: "water",
  cheese: "cheese",
} as const;

/**
 * Where our grade differs from Open Food Facts', with the reason. Reported
 * rather than tuned away: neither number below was moved to make a case pass.
 *
 * Both are pure olive oils. The official rule (SpF-2022 §2.3.2: "in the fats
 * and oils category specifically, oils derived from ingredients in the list
 * qualify for the component (e.g. olive and avocado)") makes olive oil count
 * as 100 % fruit/vegetables/legumes — worth 5 favourable points — and Open
 * Food Facts applies it from the ingredient list. Its `nutriments` carry
 * fruits-vegetables-legumes-estimate 0 for the same products, so from
 * per-100 data alone we cannot reproduce it, and we grade them C where OFF
 * grades them B. A product scanned with its ingredient list could be
 * graded from that; deliberately not built here.
 */
const KNOWN_MISMATCHES = new Map([
  ["8002470023727", { off: "B", ours: "C" }],
  ["6111024002186", { off: "B", ours: "C" }],
]);

test("the fixture is a real spread of Open Food Facts products", () => {
  assert(OFF_PRODUCTS.length >= 80);

  const categories = new Set(OFF_PRODUCTS.map((product) => product.category));

  assert.deepEqual(
    [...categories].sort(),
    ["beverage", "cheese", "fats", "general", "red_meat", "water"],
  );
});

test("our grade matches Open Food Facts' 2023 grade, apart from the reported mismatches", () => {
  const mismatches = new Map<string, { off: string; ours: string }>();

  for (const product of OFF_PRODUCTS) {
    const facts = factsFromOpenFoodFacts(
      product.nutriments,
      product.category === "beverage" || product.category === "water",
    );

    assert(facts, `${product.code} has no nutrition`);

    const input = {
      ...nutriScoreInputFor(
        { source: "openfoodfacts", facts, categoryTags: [] },
        { nonNutritiveSweetener: product.sweetener },
      ),
      // OFF's own category flags, so this test measures the algorithm and not
      // the tag heuristics above.
      category: OFF_CATEGORY[product.category],
    };

    const result = computeNutriScore(input);

    const ours = result.computable ? result.grade : "not computable";

    if (ours !== product.offGrade) {
      mismatches.set(product.code, { off: product.offGrade, ours });
    }
  }

  assert.deepEqual(
    Object.fromEntries(mismatches),
    Object.fromEntries(KNOWN_MISMATCHES),
  );
});
