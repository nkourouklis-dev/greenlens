import assert from "node:assert/strict";
import test from "node:test";
import type { WorkerAnalysisResult } from "./analysis";
import { FALLBACK_POINTS, scoreInterpretation } from "./scoring";

/**
 * MVP_STATE §2 gap: declared fragrance allergens had no counterpart to the
 * food-allergen "declaration only" handling. On the normal path this is now
 * settled by the rule table (parfum + fragrance substances share one
 * "fragrance_allergen" group, charged once). These tests cover the path
 * that still read model severities — no rules loaded (D1 unreachable) —
 * where each fragrance finding used to be charged separately.
 */

type Finding = WorkerAnalysisResult["ingredientFindings"][number];

function finding(ingredientName: string, severity: Finding["severity"]): Finding {
  return {
    ingredientName,
    normalizedName: ingredientName.toLowerCase(),
    severity,
    title: ingredientName,
    explanation: ingredientName,
    evidenceType: "label",
    sourceName: null,
    sourceUrl: null,
    confidence: 0.8,
  };
}

function analysis(findings: Finding[]): WorkerAnalysisResult {
  return {
    productType: "cosmetic",
    summary: "",
    positives: [],
    attentionItems: [],
    potentialAllergens: [],
    ingredientFindings: findings,
    insufficientDataReasons: [],
    confidence: 0.9,
  };
}

const LABEL = "Aqua, Glycerin, Parfum, Linalool, Limonene, Phenoxyethanol";

test("without rules, several fragrance findings are charged once, like the rule group", () => {
  const score = scoreInterpretation(
    LABEL,
    0.9,
    analysis([
      finding("Aqua", "info"),
      finding("Parfum", "attention"),
      finding("Linalool", "attention"),
      finding("Limonene", "attention"),
    ]),
  );

  assert.equal(score.deductions.length, 1);
  assert.equal(score.deductions[0].code, "attention:parfum");
  assert.equal(score.score, 100 - FALLBACK_POINTS.attention);
});

test("without rules, a non-fragrance concern is still charged next to the fragrance group", () => {
  const score = scoreInterpretation(
    LABEL,
    0.9,
    analysis([
      finding("Linalool", "attention"),
      finding("Limonene", "attention"),
      finding("Phenoxyethanol", "attention"),
    ]),
  );

  assert.deepEqual(
    score.deductions.map((deduction) => deduction.code).sort(),
    ["attention:linalool", "attention:phenoxyethanol"],
  );
});

test("a fragrance allergen the model marks as info is never charged", () => {
  const score = scoreInterpretation(
    LABEL,
    0.9,
    analysis([finding("Linalool", "info"), finding("Aqua", "info")]),
  );

  assert.equal(score.deductions.length, 0);
});
