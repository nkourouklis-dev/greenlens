import assert from "node:assert/strict";
import test from "node:test";
import {
  scoreNutrition,
} from "./nutritionScoring";
import { scoringVersion } from "./scoring";
import type { WorkerNutritionResult } from "./nutritionAnalysis";

const validText =
  "Ενέργεια 450kcal, Πρωτεΐνες 12g, Λιπαρά 20g, Σάκχαρα 30g ανά 100g";

const base: WorkerNutritionResult = {
  subtype: "human_food",
  summary: "Επιβεβαιωμένος διατροφικός πίνακας.",
  positives: [],
  attentionItems: [],
  nutritionFindings: [],
  insufficientDataReasons: [],
  confidence: 0.9,
};

const attentionFinding = {
  nutrient: "Σάκχαρα",
  normalizedName: "sugar",
  amount: "30g",
  severity: "attention" as const,
  title: "x",
  explanation: "x",
  evidenceType: "label" as const,
  sourceName: null,
  sourceUrl: null,
  confidence: 0.9,
};

test("returns null score for empty text", () =>
  assert.equal(scoreNutrition("", 0.9, base).score, null));

test("returns null score for short text", () =>
  assert.equal(scoreNutrition("x", 0.9, base).score, null));

test("returns null score without findings", () =>
  assert.equal(scoreNutrition(validText, 0.9, base).score, null));

test("returns null score for very low confidence", () =>
  assert.equal(
    scoreNutrition(validText, 0.2, {
      ...base,
      nutritionFindings: [attentionFinding],
    }).score,
    null,
  ));

test("accepts plain text OCR confidence", () =>
  assert.notEqual(
    scoreNutrition(validText, 0.5, {
      ...base,
      nutritionFindings: [attentionFinding],
    }).score,
    null,
  ));

test("deduplicates identical findings", () =>
  assert.equal(
    scoreNutrition(validText, 0.9, {
      ...base,
      nutritionFindings: Array(8).fill(attentionFinding),
    }).deductions.length,
    1,
  ));

test("caps deductions at six", () => {
  const findings = Array.from({ length: 10 }, (_, index) => ({
    ...attentionFinding,
    normalizedName: "nutrient" + index,
  }));

  assert.equal(
    scoreNutrition(validText, 0.9, {
      ...base,
      nutritionFindings: findings,
    }).deductions.length,
    6,
  );
});

test("halves points when evidence is missing", () => {
  const withEvidence = scoreNutrition(validText, 0.9, {
    ...base,
    nutritionFindings: [attentionFinding],
  });

  const withoutEvidence = scoreNutrition(validText, 0.9, {
    ...base,
    nutritionFindings: [
      { ...attentionFinding, evidenceType: "none" as const },
    ],
  });

  assert.equal(withEvidence.deductions[0].points, 8);
  assert.equal(withoutEvidence.deductions[0].points, 4);
});

test("ignores positive and info findings", () =>
  assert.equal(
    scoreNutrition(validText, 0.9, {
      ...base,
      nutritionFindings: [
        { ...attentionFinding, severity: "positive" as const },
        {
          ...attentionFinding,
          normalizedName: "y",
          severity: "info" as const,
        },
        attentionFinding,
      ],
    }).deductions.length,
    1,
  ));

test("adds bonus when no flagged E-number additive", () => {
  const result = scoreNutrition(validText, 0.9, {
    ...base,
    nutritionFindings: [attentionFinding],
  });

  assert.ok(result.bonuses.length > 0, "expected at least one bonus");
});

test("does not add additive bonus when an E-number is flagged", () => {
  const result = scoreNutrition(validText, 0.9, {
    ...base,
    nutritionFindings: [
      { ...attentionFinding, normalizedName: "e621" },
    ],
  });

  assert.ok(
    !result.bonuses.some((bonus) => bonus.includes("πρόσθετα")),
    "did not expect the additive-free bonus",
  );
});

test("does not deduct for a declared allergen row", () => {
  const result = scoreNutrition(validText, 0.9, {
    ...base,
    nutritionFindings: [
      {
        ...attentionFinding,
        nutrient: "Γάλα",
        normalizedName: "milk",
        title: "Προσοχή σε γαλακτοκομικά",
        explanation: "Μπορεί να προκαλέσει αλλεργία.",
      },
    ],
  });

  assert.equal(result.deductions.length, 0);
});

test("still deducts for high sugar next to an allergen row", () => {
  const result = scoreNutrition(validText, 0.9, {
    ...base,
    nutritionFindings: [
      {
        ...attentionFinding,
        nutrient: "Αυγό",
        normalizedName: "egg",
        explanation: "Μπορεί να προκαλέσει αλλεργία.",
      },
      attentionFinding,
    ],
  });

  assert.equal(result.deductions.length, 1);
  assert.equal(result.deductions[0].code, "attention:sugar");
});

test("returns the scoring version", () =>
  assert.equal(
    scoreNutrition(validText, 0.9, {
      ...base,
      nutritionFindings: [attentionFinding],
    }).scoringVersion,
    scoringVersion,
  ));
