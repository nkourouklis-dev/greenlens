import assert from "node:assert/strict";
import test from "node:test";
import {
  buildExecutiveSummary,
  buildIngredientInsights,
} from "./ingredientInsights";
import { scoreInterpretation } from "./scoring";
import type { WorkerAnalysisResult } from "./analysis";

const base: WorkerAnalysisResult = {
  productType: "cosmetic",
  summary: "Δοκιμαστική περίληψη.",
  positives: ["Δεν εντοπίστηκαν παραβένια"],
  attentionItems: ["Περιέχει συνθετικό άρωμα"],
  potentialAllergens: ["Limonene", "Linalool"],
  ingredientFindings: [
    {
      ingredientName: "Aqua",
      normalizedName: "aqua",
      severity: "info",
      title: "Νερό",
      explanation: "Βάση του προϊόντος.",
      evidenceType: "none",
      sourceName: null,
      sourceUrl: null,
      confidence: 0.5,
    },
    {
      ingredientName: "Parfum",
      normalizedName: "parfum",
      severity: "attention",
      title: "Άρωμα",
      explanation: "Μείγμα αρωματικών ουσιών.",
      evidenceType: "label",
      sourceName: null,
      sourceUrl: null,
      confidence: 0.8,
    },
    {
      ingredientName: "Limonene",
      normalizedName: "limonene",
      severity: "attention",
      title: "Limonene",
      explanation: "Γνωστό αλλεργιογόνο αρωμάτων.",
      evidenceType: "regulatory",
      sourceName: null,
      sourceUrl: null,
      confidence: 0.9,
    },
  ],
  insufficientDataReasons: [],
  confidence: 0.8,
};

const validText =
  "Aqua, Parfum, Limonene, Linalool, Glycerin";

test("insights carry a scoreImpact that matches the Worker's own deductions", () => {
  const score = scoreInterpretation(validText, 0.9, base);
  const insights = buildIngredientInsights(base, score);

  const parfum = insights.find((insight) => insight.normalizedName === "parfum");
  const matchingDeduction = score.deductions.find((deduction) => deduction.code === "attention:parfum");

  assert.ok(parfum);
  assert.ok(matchingDeduction);
  assert.equal(parfum?.scoreImpact, -matchingDeduction!.points);
});

test("ingredients with no deduction get a zero score impact", () => {
  const score = scoreInterpretation(validText, 0.9, base);
  const insights = buildIngredientInsights(base, score);

  const aqua = insights.find((insight) => insight.normalizedName === "aqua");

  assert.equal(aqua?.scoreImpact, 0);
  assert.equal(aqua?.rating, "neutral");
});

test("known ingredients are enriched from the static registry", () => {
  const score = scoreInterpretation(validText, 0.9, base);
  const insights = buildIngredientInsights(base, score);

  const limonene = insights.find((insight) => insight.normalizedName === "limonene");

  assert.equal(limonene?.category, "fragrance");
  assert.ok(limonene && limonene.concerns.length > 0);
  assert.equal(limonene?.evidenceLevel, "high");
});

test("deduplicates repeated ingredient findings", () => {
  const score = scoreInterpretation(validText, 0.9, {
    ...base,
    ingredientFindings: [
      ...base.ingredientFindings,
      base.ingredientFindings[1],
    ],
  });

  const insights = buildIngredientInsights(
    {
      ...base,
      ingredientFindings: [
        ...base.ingredientFindings,
        base.ingredientFindings[1],
      ],
    },
    score,
  );

  assert.equal(
    insights.filter((insight) => insight.normalizedName === "parfum").length,
    1,
  );
});

test("executive summary counts ingredients by severity", () => {
  const score = scoreInterpretation(validText, 0.9, base);
  const insights = buildIngredientInsights(base, score);
  const summary = buildExecutiveSummary(base, score, insights);

  assert.equal(summary.safeIngredients, 1);
  assert.equal(summary.cautionIngredients, 2);
  assert.equal(summary.highImpactIngredients, 0);
});

test("executive summary highlights absence of parabens and sulfates", () => {
  const score = scoreInterpretation(validText, 0.9, base);
  const insights = buildIngredientInsights(base, score);
  const summary = buildExecutiveSummary(base, score, insights);

  assert.ok(summary.highlights.includes("Δεν εντοπίστηκαν parabens"));
  assert.ok(summary.highlights.includes("Δεν εντοπίστηκαν sulfates"));
});

test("executive summary flags potential allergens in watchOutFor", () => {
  const score = scoreInterpretation(validText, 0.9, base);
  const insights = buildIngredientInsights(base, score);
  const summary = buildExecutiveSummary(base, score, insights);

  assert.ok(
    summary.watchOutFor.includes("Περιέχει πιθανά αλλεργιογόνα αρωμάτων"),
  );
});

test("executive summary verdict matches the score band", () => {
  const score = scoreInterpretation(validText, 0.9, base);
  const insights = buildIngredientInsights(base, score);
  const summary = buildExecutiveSummary(base, score, insights);

  assert.equal(typeof summary.overallVerdict, "string");
  assert.ok(summary.overallVerdict.length > 0);
});
