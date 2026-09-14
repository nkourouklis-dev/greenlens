import assert from "node:assert/strict";
import test from "node:test";
import type { WorkerNutritionResult } from "./nutritionAnalysis";
import { NUTREE_BAR_PANEL_OCR } from "./labelFixtures";
import { rescoreNutritionResult } from "./rescore";
import { scoreNutrition } from "./nutritionScoring";

/**
 * Recomputing a nutrition row without re-reading the photograph.
 *
 * Until the nutrition path started persisting its panel text there was no
 * way to do this at all: a row whose quantities came back wrong could only
 * be repaired by a full re-analysis, which spends an OCR pass and a model
 * call to fix arithmetic. Both categories now score deterministically from
 * text, so both can simply be recomputed.
 */

/**
 * The amounts as the model reported them for barcode 5214001318704 — every
 * one of them missing digits. They are deliberately kept in the fixture: the
 * recompute must ignore them and read the panel text instead, which is the
 * whole reason it can repair the row.
 */
const analysis: WorkerNutritionResult = {
  subtype: "food",
  summary: "Μπάρα χουρμά με φυτική πρωτεΐνη.",
  positives: [],
  attentionItems: [],
  nutritionFindings: [
    {
      nutrient: "Ζάχαρη",
      normalizedName: "sugar",
      amount: "8g ανά 100g",
      severity: "attention",
      title: "Ζάχαρη",
      explanation: "Υψηλά σάκχαρα.",
      evidenceType: "label",
      sourceName: null,
      sourceUrl: null,
      confidence: 0.8,
    },
    {
      nutrient: "Άλας",
      normalizedName: "salt",
      amount: "5g ανά 100g",
      severity: "attention",
      title: "Αλάτι",
      explanation: "Υψηλό αλάτι.",
      evidenceType: "label",
      sourceName: null,
      sourceUrl: null,
      confidence: 0.8,
    },
  ],
  insufficientDataReasons: [],
  confidence: 0.9,
};

test("the recompute reads the panel instead of the model's amounts", async () => {
  const { score } = await rescoreNutritionResult(
    analysis,
    NUTREE_BAR_PANEL_OCR,
  );

  // 33,7 g sugars, 3,6 g saturates, 0,5 g salt, and the fibre/protein
  // bonuses the mangled amounts had thrown away.
  assert.deepEqual(
    score.deductions.map((deduction) => [deduction.code, deduction.points]),
    [
      ["threshold:sugars", 30],
      ["threshold:saturates", 15],
      ["threshold:salt", 5],
    ],
  );

  assert.deepEqual(
    score.bonuses.map((bonus) => bonus.points),
    [6, 4],
  );

  assert.equal(score.score, 60);
});

// The point of a recompute is that it agrees with a scan of the same text.
test("a recompute matches what a scan of the same panel produces", async () => {
  const { score } = await rescoreNutritionResult(
    analysis,
    NUTREE_BAR_PANEL_OCR,
  );

  const scanned = scoreNutrition(NUTREE_BAR_PANEL_OCR, 1, analysis, {
    extractionConfidence: 1,
  });

  assert.equal(score.score, scanned.score);
  assert.deepEqual(score.deductions, scanned.deductions);
  assert.deepEqual(score.bonuses, scanned.bonuses);
});

test("the insights are rebuilt beside the score, never carried over", async () => {
  const { nutritionInsights, executiveSummary } =
    await rescoreNutritionResult(analysis, NUTREE_BAR_PANEL_OCR);

  assert(nutritionInsights.length > 0);
  assert(typeof executiveSummary.overallVerdict === "string");

  // Nothing may claim a score impact the deductions do not carry.
  for (const insight of nutritionInsights) {
    assert.equal(typeof insight.scoreImpact, "number");
    assert(insight.scoreImpact <= 0);
  }
});
