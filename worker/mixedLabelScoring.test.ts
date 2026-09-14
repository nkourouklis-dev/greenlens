import assert from "node:assert/strict";
import test from "node:test";
import type { WorkerAnalysisResult } from "./analysis";
import { cleanIngredientText, extractIngredientText } from "./ingredientText";
import { NESTLE_CLUSTERS_OCR } from "./labelFixtures";
import { matchScoringRules, type RuleSet } from "./ingredientRules";
import { readNutritionPanel } from "./nutritionPanel";
import { scoreInterpretation } from "./scoring";

/**
 * "Mixed" labels: one photo carrying both an ingredient list and a nutrition
 * table.
 *
 * Scoring such a label from the ingredient list alone charges sugar and salt
 * for appearing in the list — a fixed penalty weighted by position, which is
 * a guess at a quantity that is printed in full a centimetre lower down. The
 * Nestlé Clusters fixture is the case that exposed it: a 19,9 g/100 g cereal
 * scored the same as one at 40 g/100 g, and its 9,6 g of fibre and 10,3 g of
 * protein earned nothing at all.
 *
 * These tests run the same sequence worker/index.ts's analyzeIngredientsCore
 * runs (extractIngredientText -> cleanIngredientText -> readNutritionPanel ->
 * matchScoringRules -> scoreInterpretation), over the exact OCR output Azure
 * returned for that photo.
 */

interface FakeRule {
  alias: string;
  normalizedName: string;
  severity: "caution" | "high_concern";
  penaltyPoints: number;
  ruleGroup: string | null;
  shortDescription: string;
}

/**
 * The four ingredient_knowledge rows the Nestlé list actually matches, with
 * the penalties and rule groups they carry in D1. Hand-built rather than
 * loaded so the test pins the *behaviour* — which groups step aside for the
 * table — instead of whatever the live rule table says this week.
 */
const NESTLE_RULES: FakeRule[] = [
  {
    alias: "ζάχαρη",
    normalizedName: "sugar",
    severity: "high_concern",
    penaltyPoints: 25,
    ruleGroup: "added_sugar",
    shortDescription: "Πρόσθετη ζάχαρη",
  },
  {
    alias: "σιρόπι γλυκόζης",
    normalizedName: "glucose syrup",
    severity: "caution",
    penaltyPoints: 12,
    ruleGroup: "added_sugar",
    shortDescription: "Σιρόπι γλυκόζης",
  },
  {
    alias: "αλάτι",
    normalizedName: "sodium chloride",
    severity: "caution",
    penaltyPoints: 8,
    ruleGroup: "salt",
    shortDescription: "Αλάτι",
  },
  {
    alias: "φοινικέλαιο",
    normalizedName: "palm oil",
    severity: "caution",
    penaltyPoints: 12,
    ruleGroup: null,
    shortDescription: "Φοινικέλαιο",
  },
];

function ruleSetOf(rules: FakeRule[]): RuleSet {
  return {
    aliases: rules
      .map((rule) => ({
        alias: rule.alias,
        rule: {
          normalizedName: rule.normalizedName,
          severity: rule.severity,
          penaltyPoints: rule.penaltyPoints,
          bulkWeighted: true,
          ruleGroup: rule.ruleGroup,
          shortDescription: rule.shortDescription,
          concerns: [rule.shortDescription],
        },
      }))
      .sort((left, right) => right.alias.length - left.alias.length),
  };
}

/**
 * Enough of a model reply to get past the blocking checks. Nothing in it
 * carries points: on this path the deductions come from the rules and the
 * table, never from the model's severities.
 */
const analysis: WorkerAnalysisResult = {
  productType: "food",
  summary: "Δημητριακά ολικής άλεσης με αμύγδαλα και μέλι.",
  positives: ["Ολικής άλεσης", "Πηγή φυτικών ινών", "Με αμύγδαλα"],
  attentionItems: [],
  potentialAllergens: ["σιτάρι", "κριθάρι", "αμύγδαλα"],
  ingredientFindings: [
    {
      ingredientName: "Σιτάρι ολικής άλεσης",
      normalizedName: "whole wheat",
      severity: "info",
      title: "Σιτάρι ολικής άλεσης",
      explanation: "Το κύριο συστατικό του προϊόντος.",
      evidenceType: "label",
      sourceName: null,
      sourceUrl: null,
      confidence: 0.9,
    },
    {
      ingredientName: "Ζάχαρη",
      normalizedName: "sugar",
      severity: "attention",
      title: "Πρόσθετη ζάχαρη",
      explanation: "Δεύτερο συστατικό της λίστας.",
      evidenceType: "label",
      sourceName: null,
      sourceUrl: null,
      confidence: 0.9,
    },
    {
      ingredientName: "Φοινικέλαιο",
      normalizedName: "palm oil",
      severity: "attention",
      title: "Φοινικέλαιο",
      explanation: "Φυτικό λίπος υψηλό σε κορεσμένα.",
      evidenceType: "label",
      sourceName: null,
      sourceUrl: null,
      confidence: 0.9,
    },
  ],
  insufficientDataReasons: [],
  confidence: 0.95,
};

const scoredText = cleanIngredientText(
  extractIngredientText(NESTLE_CLUSTERS_OCR, 0.96).ingredientText ?? "",
);

const ruleMatches = matchScoringRules(scoredText, ruleSetOf(NESTLE_RULES));

function pointsFor(
  score: ReturnType<typeof scoreInterpretation>,
  code: string,
): number | null {
  return (
    score.deductions.find((deduction) => deduction.code === code)?.points ??
    null
  );
}

test("the per-100 g column is read out of a column-split Azure table", () => {
  const panel = readNutritionPanel(NESTLE_CLUSTERS_OCR);

  assert(panel, "no nutrition panel was read");
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

test("a label with no nutrition table yields no panel", () => {
  assert.equal(
    readNutritionPanel(
      "Συστατικά: Νερό, Ζάχαρη, Χυμός λεμονιού, Αλάτι, Άρωμα",
    ),
    null,
  );
});

test("sugar and salt are charged from the table, the other rules from the list", () => {
  const panel = readNutritionPanel(NESTLE_CLUSTERS_OCR);

  const score = scoreInterpretation(scoredText, 0.96, analysis, {
    extractionConfidence: 0.94,
    ruleMatches,
    nutritionPanel: panel,
  });

  // From the declared quantities: 19,9 g sugars and 0,91 g salt per 100 g.
  assert.equal(pointsFor(score, "threshold:sugars"), 20);
  assert.equal(pointsFor(score, "threshold:salt"), 12);

  // ...and not a second time from the list itself.
  assert.equal(pointsFor(score, "high_concern:sugar"), null);
  assert.equal(pointsFor(score, "caution:glucose syrup"), null);
  assert.equal(pointsFor(score, "caution:sodium chloride"), null);

  // A quantity table says nothing about palm oil, so its rule still stands.
  assert.equal(pointsFor(score, "caution:palm oil"), 12);

  assert.deepEqual(score.bonuses, [
    { label: "Υψηλή περιεκτικότητα σε φυτικές ίνες", points: 6 },
    { label: "Υψηλή περιεκτικότητα σε πρωτεΐνη", points: 4 },
  ]);

  // 100 - (20 + 12 + 12) + (6 + 4)
  assert.equal(score.score, 66);
  assert.equal(score.band, "moderate");
});

test("the same label scored without its table keeps the old, list-only verdict", () => {
  const score = scoreInterpretation(scoredText, 0.96, analysis, {
    extractionConfidence: 0.94,
    ruleMatches,
  });

  // sugar -30 (bulk-weighted at position 2), palm oil -12, salt -8.
  assert.equal(score.score, 50);
  assert.equal(pointsFor(score, "high_concern:sugar"), 30);
  assert.deepEqual(score.bonuses, []);
});

test("an implausible table is ignored rather than scored", () => {
  // The real failure mode: Azure drops the decimal separator, so 0,91 g of
  // salt is read as 91 g and the macronutrients no longer sum to a food.
  const withLostDecimal = NESTLE_CLUSTERS_OCR.replace(
    "Αλάτι\n0,91g",
    "Αλάτι\n91g",
  );

  assert.notEqual(withLostDecimal, NESTLE_CLUSTERS_OCR);
  assert.equal(readNutritionPanel(withLostDecimal), null);

  const score = scoreInterpretation(scoredText, 0.96, analysis, {
    extractionConfidence: 0.94,
    ruleMatches,
    nutritionPanel: readNutritionPanel(withLostDecimal),
  });

  assert.equal(score.score, 50);
});

test("a table whose energy contradicts its macronutrients is ignored", () => {
  // 392 kcal against 7,3 g fat / 66,5 g carbohydrate / 10,3 g protein is
  // arithmetic that checks out; 1392 kcal is not.
  const wrongEnergy = NESTLE_CLUSTERS_OCR.replace("392kcal", "1392kcal");

  assert.notEqual(wrongEnergy, NESTLE_CLUSTERS_OCR);
  assert.equal(readNutritionPanel(wrongEnergy), null);
});

test("the stored ingredient text reads as an ingredient list", () => {
  assert.equal(
    scoredText,
    "Σιτάρι ολικής άλεσης 63,3%, Ζάχαρη, Αμύγδαλα 9,2%, Αλεύρι σιταριού 5,3%, Σιρόπι γλυκόζης, Νιφάδες σιταριού 1,8%, Εκχύλισμα βύνης κριθαριού (κριθάρι, βύνη κριθαριού), Ιμβερτοποιημένο σιρόπι ζάχαρης, Νιφάδες βρώμης 1,4%, Ανθρακικό ασβέστιο, Φοινικέλαιο, Αλάτι, Μέλι 0,3%, Αλεύρι ρυζιού 0,3%, Μελάσα, Φυσική αρωματική ύλη, Ρυθμιστής οξύτητας (φωσφορικά άλατα νατρίου), Σίδηρος, Βιταμίνη Β3, Β5, Β9, Β6, Β2.",
  );
});
