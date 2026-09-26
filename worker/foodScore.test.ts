import assert from "node:assert/strict";
import test from "node:test";
import type { WorkerAnalysisResult } from "./analysis";
import { detectAlcohol } from "./alcohol";
import {
  INGREDIENTS_WEIGHT,
  NUTRITION_WEIGHT,
  PARTIAL_EVALUATION_SCORE_CAP,
  resolveNutritionEvidence,
  scoreFood,
  scoreForProductType,
  scoreNutritionOnly,
} from "./foodScore";
import { KAISER_PILSNER_OCR } from "./labelFixtures";
import { inspectNutritionPanel } from "./nutritionPanel";
import {
  lookupProductByBarcode,
  hasIdentity,
  type D1Like,
  type D1PreparedStatementLike,
} from "./productLookup";
import { scoreInterpretation, type WorkerScore } from "./scoring";

/**
 * Lurpak Soft with olive oil (barcode 5740900401655) — the permanent
 * regression for "the score means a clean ingredient list, and people read
 * it as healthy food". Three ingredients and nothing an additive rule
 * objects to scored 100 / "Εξαιρετική επιλογή", with 543 kcal and 23 g of
 * saturated fat per 100 g sitting unread in Open Food Facts.
 *
 * Root causes, both fixed and both pinned here:
 *  1. Open Food Facts holds this barcode's nutrition but no product name or
 *     brand, and the lookup kept a record only if it had one of those — so
 *     the nutriments were thrown away and the barcode cached as unknown.
 *  2. Nothing scored nutrition on an ingredient-list scan unless a table was
 *     in the photo, and nothing said so when it was not.
 */

// The record as api/v2 returns it today (fields trimmed to the ones we read):
// nutriments present, no product_name, no brands.
const LURPAK_OFF_RESPONSE = {
  code: "5740900401655",
  status: 1,
  product: {
    code: "5740900401655",
    categories_tags: [
      "en:dairies",
      "en:spreads",
      "en:fats",
      "en:spreadable-fats",
      "en:animal-fats",
      "en:dairy-spreads",
      "en:milkfat",
      "en:butters",
    ],
    nutriments: {
      "carbohydrates_100g": 0.4,
      "energy-kcal_100g": 543,
      "energy-kj_100g": 2232,
      "fat_100g": 60,
      "proteins_100g": 0.3,
      "salt_100g": 0.01,
      "saturated-fat_100g": 23,
      "sodium_100g": 0.004,
      "fruits-vegetables-legumes-estimate-from-ingredients_100g": 0,
    },
  },
};

const lurpakAnalysis: WorkerAnalysisResult = {
  productType: "food",
  summary: "Βούτυρο με ελαιόλαδο.",
  positives: [],
  attentionItems: [],
  potentialAllergens: ["γάλα"],
  ingredientFindings: [
    {
      ingredientName: "Βούτυρο",
      normalizedName: "butter",
      severity: "info",
      title: "Βούτυρο",
      explanation: "Γαλακτοκομικό λίπος.",
      evidenceType: "label",
      sourceName: null,
      sourceUrl: null,
      confidence: 0.9,
    },
    {
      ingredientName: "Ελαιόλαδο",
      normalizedName: "olive oil",
      severity: "info",
      title: "Ελαιόλαδο",
      explanation: "Φυτικό έλαιο.",
      evidenceType: "label",
      sourceName: null,
      sourceUrl: null,
      confidence: 0.9,
    },
  ],
  insufficientDataReasons: [],
  confidence: 0.9,
};

const LURPAK_LIST = "Βούτυρο (γάλα), ελαιόλαδο, αλάτι";

/** The ingredient half of a scan, exactly as analyzeIngredientsCore builds it. */
function ingredientHalf(
  analysis: WorkerAnalysisResult,
  text: string,
  nutritionCoversSugarSalt: boolean,
): WorkerScore {
  return scoreInterpretation(text, 0.95, analysis, {
    ruleMatches: [],
    nutritionCoversSugarSalt,
  });
}

function fakeDb(rows: unknown[] = []): { db: D1Like; writes: unknown[][] } {
  const writes: unknown[][] = [];

  const db: D1Like = {
    prepare(sql: string): D1PreparedStatementLike {
      let bound: unknown[] = [];

      const statement: D1PreparedStatementLike = {
        bind(...values: unknown[]) {
          bound = values;
          return statement;
        },
        async first<T>() {
          return (rows[0] ?? null) as T | null;
        },
        async run() {
          if (sql.startsWith("INSERT")) {
            writes.push(bound);
          }

          return undefined;
        },
      };

      return statement;
    },
  };

  return { db, writes };
}

async function withFetch<T>(
  responder: (url: string) => unknown,
  run: () => Promise<T>,
): Promise<T> {
  const original = globalThis.fetch;

  globalThis.fetch = (async (input: unknown) => {
    const body = responder(String(input));

    return new Response(JSON.stringify(body), { status: 200 });
  }) as typeof fetch;

  try {
    return await run();
  } finally {
    globalThis.fetch = original;
  }
}

// ---------------------------------------------------------------------------
// Root cause 1: the lookup threw the nutrition away
// ---------------------------------------------------------------------------

test("Lurpak: a record with nutrition and no name is kept, cached as found, and is not an identity", async () => {
  const fake = fakeDb();

  const result = await withFetch(
    () => LURPAK_OFF_RESPONSE,
    () => lookupProductByBarcode("5740900401655", { db: fake.db }),
  );

  assert.equal(result.source, "openfoodfacts");
  assert.equal(hasIdentity(result), false);
  assert(result.nutritionFacts, "the nutriments were dropped");
  assert.equal(result.nutritionFacts.saturates, 23);
  assert.equal(result.nutritionFacts.fat, 60);
  assert.equal(result.nutritionFacts.energyKj, 2232);
  assert(result.categoryTags.includes("en:butters"));

  // Cached as a *hit* — the miss it used to cache is what kept this barcode
  // unscored for a day at a time.
  assert.equal(fake.writes.length, 1);
  assert.equal(fake.writes[0][3], 1);
});

test("a record whose numbers contradict themselves is kept for its name only", async () => {
  const response = {
    code: "1",
    product: {
      product_name: "Παράδειγμα",
      nutriments: {
        "sugars_100g": 5,
        "carbohydrates_100g": 1,
        "fat_100g": 0,
        "proteins_100g": 0.5,
      },
    },
  };

  const result = await withFetch(
    () => response,
    () => lookupProductByBarcode("5201309103033", {}),
  );

  assert.equal(result.productName, "Παράδειγμα");
  assert.equal(result.nutritionFacts, null);
});

test("a barcode Open Food Facts knows nothing about still comes back empty", async () => {
  const result = await withFetch(
    () => ({ status: 0 }),
    () => lookupProductByBarcode("5740900401655", {}),
  );

  assert.equal(result.source, null);
  assert.equal(result.nutritionFacts, null);
});

// ---------------------------------------------------------------------------
// Root cause 2: what the score does with it
// ---------------------------------------------------------------------------

function lurpakEvidence() {
  const facts = LURPAK_OFF_RESPONSE.product.nutriments;

  return resolveNutritionEvidence({
    panel: null,
    offFacts: {
      energyKj: facts["energy-kj_100g"],
      fat: facts.fat_100g,
      saturates: facts["saturated-fat_100g"],
      carbohydrate: facts.carbohydrates_100g,
      sugars: null,
      fibre: null,
      protein: facts.proteins_100g,
      salt: facts.salt_100g,
      fruitVegLegumesPct: 0,
      isBeverage: false,
      abv: null,
    },
    categoryTags: LURPAK_OFF_RESPONSE.product.categories_tags,
  });
}

test("Lurpak with Open Food Facts nutrition is NOT excellent: Nutri-Score D, blended 60/40", () => {
  const evidence = lurpakEvidence();

  assert.equal(evidence?.source, "openfoodfacts");

  const score = scoreFood({
    ingredientScore: ingredientHalf(lurpakAnalysis, LURPAK_LIST, true),
    nutrition: evidence,
    nonNutritiveSweetener: null,
    alcohol: null,
    notices: [],
  });

  // Category from the tags (butter → fats/oils), sugars bounded by the
  // 0.4 g of carbohydrate, saturates 23 g of 60 g fat → 12 unfavourable
  // points → D.
  assert.equal(score.nutritionEvaluation?.category, "fats_oils_nuts_seeds");
  assert.equal(score.nutritionEvaluation?.grade, "D");
  assert.equal(score.nutritionEvaluation?.points, 12);
  assert.equal(score.nutritionEvaluation?.source, "openfoodfacts");
  assert.equal(score.nutritionEvaluation?.sugarsBoundedByCarbohydrate, true);
  assert.deepEqual(score.nutritionEvaluation?.uncredited, ["fibre"]);

  // 0.6 × 40 (D) + 0.4 × 100 (clean list) = 64.
  assert.equal(score.composition?.nutrition?.score, 40);
  assert.equal(score.composition?.ingredients?.score, 100);
  assert.equal(score.score, 64);
  assert.equal(score.band, "moderate");
  assert.notEqual(score.band, "excellent");
  assert.equal(
    score.notices.some((notice) => notice.code === "partial_no_nutrition"),
    false,
  );
});

test("Lurpak with nutrition missing from every source: partial notice and the cap", () => {
  const score = scoreFood({
    ingredientScore: ingredientHalf(lurpakAnalysis, LURPAK_LIST, false),
    nutrition: null,
    nonNutritiveSweetener: null,
    alcohol: null,
    notices: [],
  });

  // The list alone is a perfect 100 — and is held to the cap.
  assert.equal(score.composition?.blended, 100);
  assert.equal(score.score, PARTIAL_EVALUATION_SCORE_CAP);
  assert.equal(score.composition?.cappedFrom, 100);
  assert.notEqual(score.band, "excellent");
  assert.notEqual(score.band, "good");

  const notice = score.notices.find(
    (candidate) => candidate.code === "partial_no_nutrition",
  );

  assert(notice, "the partial-evaluation notice is missing");
  assert.match(notice.title, /Μερική αξιολόγηση — δεν βρέθηκαν διατροφικά στοιχεία/);

  // The cap is a visible row, not a silent change to the number.
  assert.equal(
    score.deductions.find((deduction) => deduction.code === "partial:no_nutrition_cap")
      ?.points,
    100 - PARTIAL_EVALUATION_SCORE_CAP,
  );
});

test("nutrition too incomplete to grade counts as missing, and the notice names what", () => {
  // Saturates and salt only: no energy, no sugars, and no carbohydrate to
  // bound them by.
  const evidence = resolveNutritionEvidence({
    panel: null,
    offFacts: {
      energyKj: null,
      fat: null,
      saturates: 23,
      carbohydrate: null,
      sugars: null,
      fibre: null,
      protein: null,
      salt: 0.01,
      fruitVegLegumesPct: null,
      isBeverage: false,
      abv: null,
    },
    categoryTags: [],
  });

  const score = scoreFood({
    ingredientScore: ingredientHalf(lurpakAnalysis, LURPAK_LIST, false),
    nutrition: evidence,
    nonNutritiveSweetener: null,
    alcohol: null,
    notices: [],
  });

  assert.equal(score.score, PARTIAL_EVALUATION_SCORE_CAP);

  const notice = score.notices.find((candidate) => candidate.code === "partial_no_nutrition");

  assert(notice);
  assert.match(notice.body, /ενέργεια/);
  assert.match(notice.body, /σάκχαρα/);
});

test("the content gate still comes first: no ingredients and no nutrition is no score at all", () => {
  const score = scoreFood({
    ingredientScore: null,
    nutrition: null,
    nonNutritiveSweetener: null,
    alcohol: null,
    notices: [],
  });

  assert.equal(score.score, null);
  assert.equal(score.band, "insufficient_data");
});

test("the weights are named constants that sum to one", () => {
  assert.equal(NUTRITION_WEIGHT + INGREDIENTS_WEIGHT, 1);
  assert.equal(NUTRITION_WEIGHT, 0.6);
});

test("the label wins over Open Food Facts whenever it can be graded", () => {
  const label = inspectNutritionPanel(KAISER_PILSNER_OCR, { abv: 5.2 }).panel;

  assert(label);

  const evidence = resolveNutritionEvidence({
    panel: label,
    // A wildly different Open Food Facts record for the same barcode.
    offFacts: {
      energyKj: 1500,
      fat: 20,
      saturates: 10,
      carbohydrate: 50,
      sugars: 40,
      fibre: 0,
      protein: 5,
      salt: 1,
      fruitVegLegumesPct: null,
      isBeverage: true,
      abv: null,
    },
    categoryTags: [],
  });

  assert.equal(evidence?.source, "label");
  assert.equal(evidence?.facts.sugars, 0.5);
});

test("a label that cannot be graded hands over to Open Food Facts, whole", () => {
  // Saturates only — nothing to grade from.
  const evidence = resolveNutritionEvidence({
    panel: {
      readings: [{ key: "saturates", gramsPer100: 3, declared: "3 g" }],
      isBeverage: false,
    },
    offFacts: lurpakEvidence()?.facts ?? null,
    categoryTags: LURPAK_OFF_RESPONSE.product.categories_tags,
  });

  assert.equal(evidence?.source, "openfoodfacts");
  // Not a mixture: the label's 3 g did not leak into the record's figures.
  assert.equal(evidence?.facts.saturates, 23);
});

// ---------------------------------------------------------------------------
// Kaiser pilsner: the decimal bug, the alcohol, and the combined score
// ---------------------------------------------------------------------------

const beerAnalysis: WorkerAnalysisResult = {
  productType: "food",
  summary: "Μπύρα pilsner.",
  positives: [],
  attentionItems: [],
  potentialAllergens: ["κριθάρι"],
  ingredientFindings: [
    {
      ingredientName: "Βύνη κριθαριού",
      normalizedName: "barley malt",
      severity: "info",
      title: "Βύνη κριθαριού",
      explanation: "Βασικό συστατικό της μπύρας.",
      evidenceType: "label",
      sourceName: null,
      sourceUrl: null,
      confidence: 0.9,
    },
  ],
  insufficientDataReasons: [],
  confidence: 0.9,
};

test("Kaiser: 0,5 g of sugar is read as 0,5 — not 5 — and the drink is graded from it", () => {
  const alcohol = detectAlcohol([KAISER_PILSNER_OCR]);
  const read = inspectNutritionPanel(KAISER_PILSNER_OCR, {
    abv: alcohol?.abv ?? null,
  });

  assert(read.panel);
  assert.equal(
    read.panel.readings.find((reading) => reading.key === "sugars")?.gramsPer100,
    0.5,
  );

  // The same table with the separator lost ("05g") is repaired, not scored
  // ten times too sweet.
  const repaired = inspectNutritionPanel(
    KAISER_PILSNER_OCR.replace("0,5g", "05g"),
    { abv: alcohol?.abv ?? null },
  );

  assert.equal(
    repaired.panel?.readings.find((reading) => reading.key === "sugars")?.gramsPer100,
    0.5,
  );

  // A dot as the separator reads the same as a comma.
  const dotted = inspectNutritionPanel(
    KAISER_PILSNER_OCR.replace("0,5g", "0.5g"),
    { abv: alcohol?.abv ?? null },
  );

  assert.equal(
    dotted.panel?.readings.find((reading) => reading.key === "sugars")?.gramsPer100,
    0.5,
  );
});

test("Kaiser: one combined score — Nutri-Score C, clean list, and the alcohol shown as its own row", () => {
  const alcohol = detectAlcohol([KAISER_PILSNER_OCR]);

  const panel = inspectNutritionPanel(KAISER_PILSNER_OCR, {
    abv: alcohol?.abv ?? null,
  }).panel;

  const evidence = resolveNutritionEvidence({
    panel,
    offFacts: null,
    categoryTags: [],
  });

  assert.equal(evidence?.source, "label");

  const score = scoreFood({
    ingredientScore: ingredientHalf(beerAnalysis, "Νερό, βύνη κριθαριού, λυκίσκος, μαγιά", true),
    nutrition: evidence,
    nonNutritiveSweetener: null,
    alcohol,
    notices: [],
  });

  // 172 kJ → 3 points on the beverage grid; 0,5 g sugars → 0. Grade C.
  assert.equal(score.nutritionEvaluation?.category, "beverage");
  assert.equal(score.nutritionEvaluation?.grade, "C");

  // 0.6 × 60 + 0.4 × 100 = 76, then alcohol 15 + 2 × 5.2 → −25 → 51.
  assert.equal(score.composition?.blended, 76);
  assert.equal(score.score, 51);

  const alcoholRow = score.deductions.find((deduction) => deduction.code === "alcohol:abv");

  assert.equal(alcoholRow?.points, 25);
  assert.equal(alcoholRow?.title, "Αλκοόλ 5,2% vol");
  assert.equal(
    score.notices.some((notice) => notice.code === "alcohol"),
    true,
  );
});

test("Kaiser: a nutrition photo alone is graded too, with the missing-ingredients notice", () => {
  const alcohol = detectAlcohol([KAISER_PILSNER_OCR]);

  const panel = inspectNutritionPanel(KAISER_PILSNER_OCR, {
    abv: alcohol?.abv ?? null,
  }).panel;

  const score = scoreNutritionOnly({
    evidence: resolveNutritionEvidence({ panel, offFacts: null, categoryTags: [] }),
    alcohol,
    notices: [],
    text: KAISER_PILSNER_OCR,
    ocrConfidence: 0.95,
    analysis: {
      subtype: "human_food",
      summary: "",
      positives: [],
      attentionItems: [],
      nutritionFindings: [],
      potentialAllergens: [],
      insufficientDataReasons: [],
      confidence: 0.9,
    } as never,
    extractionConfidence: 1,
  });

  // Nutri-Score C alone (60), minus the alcohol row.
  assert.equal(score.score, 35);
  assert.equal(
    score.notices.some((notice) => notice.code === "partial_no_ingredients"),
    true,
  );
});

test("a shampoo is scored on its list alone: no nutrition notice, no 65 cap", () => {
  const shampoo: WorkerAnalysisResult = {
    ...lurpakAnalysis,
    productType: "cosmetic",
    potentialAllergens: [],
  };
  const ingredientScore = ingredientHalf(
    shampoo,
    "Aqua, Sodium Laureth Sulfate, Coco-Betaine, Glycerin, Parfum",
    false,
  );

  const score = scoreForProductType("cosmetic", {
    ingredientScore,
    nutrition: null,
    nonNutritiveSweetener: null,
    alcohol: null,
    notices: [],
  });

  assert.equal(score, ingredientScore);
  assert(
    !score.notices.some((notice) => notice.code === "partial_no_nutrition"),
    "a cosmetic must never be told to photograph a nutrition table",
  );
  assert(
    !score.deductions.some((deduction) => deduction.code === "partial:no_nutrition_cap"),
  );
});

test("a food still goes through scoreFood: Lurpak with no nutrition keeps the cap", () => {
  const score = scoreForProductType("food", {
    ingredientScore: ingredientHalf(lurpakAnalysis, LURPAK_LIST, false),
    nutrition: null,
    nonNutritiveSweetener: null,
    alcohol: null,
    notices: [],
  });

  assert.equal(score.score, PARTIAL_EVALUATION_SCORE_CAP);
  assert(score.notices.some((notice) => notice.code === "partial_no_nutrition"));
});

test("an unplaced product with no nutrition anywhere is not treated as food", () => {
  const ingredientScore = ingredientHalf(lurpakAnalysis, LURPAK_LIST, false);

  const score = scoreForProductType("unknown", {
    ingredientScore,
    nutrition: null,
    nonNutritiveSweetener: null,
    alcohol: null,
    notices: [],
  });

  assert.equal(score, ingredientScore);
});
