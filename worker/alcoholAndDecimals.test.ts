import assert from "node:assert/strict";
import test from "node:test";
import {
  alcoholNotice,
  alcoholPoints,
  detectAlcohol,
} from "./alcohol";
import type { WorkerAnalysisResult } from "./analysis";
import { cleanIngredientText, extractIngredientText } from "./ingredientText";
import {
  KAISER_330_OFFSET_OCR,
  KAISER_PILSNER_OCR,
  KRI_KRI_INTERLEAVED_OCR,
} from "./labelFixtures";
import {
  inspectNutritionPanel,
  readNutritionPanel,
} from "./nutritionPanel";
import {
  parseAmountGrams,
  parseDeclaredNumber,
  penaltiesFor,
} from "./nutritionThresholds";
import { rescoreNutritionResult, storedLabelContext } from "./rescore";
import { scoreInterpretation } from "./scoring";

/**
 * The Kaiser pilsner regressions (barcode 5201309103033), found 2026-09-16:
 *
 * 1. Every alcoholic drink's nutrition table failed the energy cross-check,
 *    because ethanol's 7 kcal/g was not counted — so the beer's table was
 *    thrown away and its ingredients alone scored 100.
 * 2. The nutrition path then scored the model's copy of the table, which
 *    read 0,5 g of sugar as 5 g.
 * 3. Nothing about the result said the drink contained alcohol.
 */

// ---------------------------------------------------------------------------
// Decimal separators
// ---------------------------------------------------------------------------

for (const [printed, grams] of [
  ["0,5g", 0.5],
  ["0.5 g", 0.5],
  ["05g", 0.5],
  ["0, 5g", 0.5],
  ["0 ,5g", 0.5],
  ["O,5g", 0.5],
  ["Ο,5g", 0.5], // Greek capital omicron
  ["1,2g", 1.2],
  ["12g", 12],
  ["0g", 0],
  ["285 mg", 0.285],
] as const) {
  test(`"${printed}" is ${grams} g`, () =>
    assert.equal(parseAmountGrams(printed), grams));
}

test("a repaired decimal is reported as repaired", () => {
  assert.deepEqual(parseDeclaredNumber("05"), { value: 0.5, repaired: true });
  assert.deepEqual(parseDeclaredNumber("0,5"), { value: 0.5, repaired: false });
});

function drinkTable(sugars: string): string {
  return [
    "Διατροφική δήλωση ανά 100ml",
    "Ενέργεια 180kJ / 42kcal",
    "Λιπαρά 0g",
    "Υδατάνθρακες 10,6g",
    `εκ των οποίων σάκχαρα ${sugars}`,
    "Πρωτεΐνες 0g",
    "Αλάτι 0g",
  ].join("\n");
}

for (const printed of ["0,5g", "0.5g", "05g", "0, 5g", "O,5g"]) {
  test(`a table row reading "${printed}" is 0,5 g, not 5 g`, () => {
    const sugars = readNutritionPanel(drinkTable(printed))?.readings.find(
      (reading) => reading.key === "sugars",
    );

    assert.equal(sugars?.gramsPer100, 0.5);
  });
}

test("energy keeps its whole number: 172kJ is not 0,172", () => {
  const panel = readNutritionPanel(drinkTable("0,5g").replace("180kJ", "0180kJ"));

  assert.ok(panel, "an energy figure is never decimal-repaired");
});

// ---------------------------------------------------------------------------
// The Kaiser table
// ---------------------------------------------------------------------------

test("an alcoholic drink's table passes once ethanol's energy is counted", () => {
  const read = inspectNutritionPanel(KAISER_PILSNER_OCR);

  assert.deepEqual(
    read.panel?.readings.map((reading) => [reading.key, reading.gramsPer100]),
    [
      ["sugars", 0.5],
      ["saturates", 0],
      ["salt", 0],
    ],
  );
  assert.equal(read.panel?.isBeverage, true);
});

test("without the alcohol, the same table is rejected but still detected", () => {
  // With the protein corrected to what the can prints, so that the only
  // thing left for the energy check to explain is the ethanol.
  const read = inspectNutritionPanel(
    KAISER_PILSNER_OCR.replace("40,5g", "0,5g"),
    { abv: null },
  );

  assert.equal(read.panel, null);
  assert.equal(read.tableDetected, true);
});

test("the misread protein is discarded instead of sinking the whole table", () => {
  const read = inspectNutritionPanel(KAISER_PILSNER_OCR);

  assert.deepEqual(read.discarded, ["protein"]);
  assert.ok(read.warnings.some((warning) => warning.startsWith("protein")));
});

test("a misread sugar value is never discarded to make a table pass", () => {
  // 30 g sugars in 3 g of carbohydrate: the part exceeds its whole, and no
  // bonus-only reading explains that.
  const read = inspectNutritionPanel(
    drinkTable("30g").replace("Υδατάνθρακες 10,6g", "Υδατάνθρακες 3g"),
  );

  assert.equal(read.panel, null);
  assert.equal(read.tableDetected, true);
});

test("0,5 g of sugar in a drink costs 5, not the 28 that 5 g costs", () => {
  const points = (grams: number) =>
    penaltiesFor([{ key: "sugars", gramsPer100: grams, declared: "" }], true)[0]
      ?.points ?? 0;

  assert.equal(points(0), 0);
  assert.equal(points(0.5), 5);
  assert.equal(points(1), 5);
  assert.equal(points(2), 15);
  assert.equal(points(3), 15);
  assert.equal(points(5), 28);
});

// ---------------------------------------------------------------------------
// Alcohol detection and grading
// ---------------------------------------------------------------------------

for (const [label, abv] of [
  ["ALC. 5,2%", 5.2],
  ["alc. 4.5% vol", 4.5],
  ["Αλκ. 12% κ.ό.", 12],
  ["12,5% vol", 12.5],
  ["vol. 40%", 40],
  ["Αλκοόλη 38% vol", 38],
] as const) {
  test(`"${label}" declares ${abv}% vol`, () =>
    assert.equal(detectAlcohol([label])?.abv, abv));
}

test("a percentage without an alcohol marker is not a strength", () => {
  assert.equal(detectAlcohol(["Κακάο 70%, Ζάχαρη 30% ανά 100g"]), null);
});

test("a drink word on a per-100 ml table marks a drink whose ABV was not read", () => {
  assert.deepEqual(
    detectAlcohol(["ΜΠΥΡΑ PILSNER", "Διατροφική δήλωση ανά 100ml"]),
    { abv: null, declared: null },
  );
});

test("wine vinegar, ginger ale and a sauce with wine are not alcoholic drinks", () => {
  assert.equal(detectAlcohol(["Ξύδι από κρασί (wine vinegar). ανά 100ml"]), null);
  assert.equal(detectAlcohol(["Ginger ale. Ενέργεια ανά 100ml"]), null);
  assert.equal(
    detectAlcohol(["Σάλτσα ντομάτας με κόκκινο οίνο. Ανά 100g"]),
    null,
  );
});

test("an alcohol-free beer is recognised as such", () => {
  assert.deepEqual(
    detectAlcohol(["Μπύρα χωρίς αλκοόλ", "ανά 100ml"]),
    { abv: 0, declared: null },
  );
});

test("the alcohol deduction grows with strength, as agreed", () => {
  const points = (abv: number | null) => alcoholPoints({ abv, declared: null });

  assert.equal(points(null), 0);
  assert.equal(points(0.5), 0);
  assert.equal(points(5), 25);
  assert.equal(points(5.2), 25);
  assert.equal(points(12), 39);
  assert.equal(points(30), 75);
  assert.equal(points(40), 80);
  assert.equal(points(60), 80);
});

test("every alcoholic drink gets a note; strength-less ones cost nothing", () => {
  assert.equal(alcoholNotice({ abv: 5.2, declared: "5,2%" })?.code, "alcohol");
  assert.equal(alcoholNotice({ abv: 0, declared: null })?.code, "alcohol_free");
  assert.equal(
    alcoholNotice({ abv: null, declared: null })?.code,
    "alcohol_unknown_abv",
  );
});

// ---------------------------------------------------------------------------
// The whole Kaiser label, scored once
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

test("Kaiser pilsner scores 72 from its list, its table and its alcohol together", () => {
  const scoredText = cleanIngredientText(
    extractIngredientText(KAISER_PILSNER_OCR, 0.95).ingredientText ??
      KAISER_PILSNER_OCR,
  );

  const alcohol = detectAlcohol([KAISER_PILSNER_OCR]);

  const score = scoreInterpretation(scoredText, 0.95, beerAnalysis, {
    ruleMatches: [],
    nutritionPanel: readNutritionPanel(KAISER_PILSNER_OCR),
    alcohol,
  });

  assert.deepEqual(
    score.deductions.map((deduction) => [deduction.code, deduction.points]),
    [
      ["alcohol:abv", 25],
      // Barley malt is not a curated "added_sugar" ingredient, so this
      // trace of residual malt sugar is banded as natural (see
      // naturalSugarOnly in nutritionThresholds.ts) rather than as if
      // sugar had been added — 3 points instead of 5.
      ["threshold:sugars", 3],
    ],
  );
  assert.equal(score.score, 72);
  assert.equal(score.deductions[0].title, "Αλκοόλ 5,2% vol");
  assert.deepEqual(
    score.notices.map((notice) => notice.code),
    ["alcohol"],
  );
});

// ---------------------------------------------------------------------------
// Recomputing the row already in the catalogue
// ---------------------------------------------------------------------------

test("recomputing the stored Kaiser nutrition row reaches the same 70, with no new photo", async () => {
  // As stored on 2026-09-16: no `alcohol` field, the whole panel as its
  // source text, and the model's "5g" of sugar in its findings.
  const stored: Record<string, unknown> = {
    contentCategory: "nutrition",
    sourceText: KAISER_PILSNER_OCR,
  };

  const context = storedLabelContext(stored);

  assert.equal(context.alcohol?.abv, 5.2);

  const { score } = await rescoreNutritionResult(
    {
      subtype: "human_food",
      summary: "Μπύρα.",
      positives: [],
      attentionItems: [],
      nutritionFindings: [
        {
          nutrient: "Ζάχαρη",
          normalizedName: "sugar",
          amount: "5g ανά 100ml",
          severity: "attention",
          title: "Ζάχαρη",
          explanation: "Περιέχει ζάχαρη",
          evidenceType: "none",
          sourceName: null,
          sourceUrl: null,
          confidence: 0.5,
        },
      ],
      insufficientDataReasons: [],
      confidence: 0.5,
    },
    KAISER_PILSNER_OCR,
    context,
  );

  assert.equal(score.score, 70);
  assert.deepEqual(
    score.notices.map((notice) => notice.code),
    ["alcohol"],
  );
});

test("a stored table text that no longer passes is reported, not silently dropped", () => {
  const context = storedLabelContext({
    nutritionSourceText: KAISER_PILSNER_OCR.replace("40,5g", "0,5g"),
    alcohol: null,
  });

  assert.equal(context.nutritionPanel, null);
  assert.deepEqual(
    context.notices.map((notice) => notice.code),
    ["nutrition_not_considered"],
  );
});

// ---------------------------------------------------------------------------
// A row name glued to a line of ingredients
// ---------------------------------------------------------------------------

test("a row name at the end of an interleaved ingredient line is still read", () => {
  const read = inspectNutritionPanel(KRI_KRI_INTERLEAVED_OCR);

  assert.deepEqual(
    read.panel?.readings.map((reading) => [reading.key, reading.gramsPer100]),
    [
      ["sugars", 7.9],
      ["saturates", 0.4],
      ["salt", 0.13],
      ["protein", 8.8],
    ],
  );
});

// ---------------------------------------------------------------------------
// Values emitted one row late
// ---------------------------------------------------------------------------

test("a table whose values arrive one row late is paired by position", () => {
  const read = inspectNutritionPanel(KAISER_330_OFFSET_OCR);

  assert.deepEqual(read.values, {
    fat: 0,
    saturates: 0,
    carbohydrate: 2.8,
    sugars: 0.5,
    protein: 0.5,
    salt: 0,
  });
  assert.equal(read.energyKcal, 41);
  assert.deepEqual(
    read.panel?.readings.map((reading) => [reading.key, reading.gramsPer100]),
    [
      ["sugars", 0.5],
      ["saturates", 0],
      ["salt", 0],
      ["protein", 0.5],
    ],
  );
});

test("the 330 ml can scores the same 70 as the 500 ml one", async () => {
  const { score } = await rescoreNutritionResult(
    {
      subtype: "human_food",
      summary: "Μπύρα.",
      positives: [],
      attentionItems: [],
      nutritionFindings: [
        {
          nutrient: "Ζάχαρη",
          normalizedName: "sugar",
          amount: "0,5g",
          severity: "info",
          title: "Ζάχαρη",
          explanation: "",
          evidenceType: "none",
          sourceName: null,
          sourceUrl: null,
          confidence: 0.5,
        },
      ],
      insufficientDataReasons: [],
      confidence: 0.9,
    },
    KAISER_330_OFFSET_OCR,
    storedLabelContext({ sourceText: KAISER_330_OFFSET_OCR }),
  );

  assert.equal(score.score, 70);
});
