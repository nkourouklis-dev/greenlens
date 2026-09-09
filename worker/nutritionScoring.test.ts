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

// A panel repeats the same nutrient across columns (per 100 g and per
// portion). Scoring reads the per-100 column once, so ten sugar rows are one
// sugar deduction rather than ten.
test("collapses repeated rows for one nutrient into a single deduction", () => {
  const findings = Array.from({ length: 10 }, (_, index) => ({
    ...attentionFinding,
    normalizedName: "nutrient" + index,
  }));

  const deductions = scoreNutrition(validText, 0.9, {
    ...base,
    nutritionFindings: findings,
  }).deductions;

  assert.equal(deductions.length, 1);
  assert.equal(deductions[0].code, "threshold:sugars");
});

// The declared number is the same number whether or not the model attached a
// source to the row, so the score must be too.
test("scores from the declared amount regardless of evidence type", () => {
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

  // 30 g sugars per 100 g is above the 22.5 g band for solids.
  assert.equal(withEvidence.deductions[0].points, 30);
  assert.equal(withoutEvidence.deductions[0].points, 30);
});

test("a full-sugar drink scores far below a solid with the same sugar band", () => {
  const drink = scoreNutrition(
    "Ενέργεια 42kcal, Σάκχαρα 10.6g ανά 100 ml",
    0.9,
    {
      ...base,
      nutritionFindings: [
        { ...attentionFinding, amount: "10.6g" },
      ],
    },
  );

  assert.equal(drink.deductions[0].points, 55);
  assert.equal(drink.score, 45);
  assert.equal(drink.band, "attention");
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

test("adds the no-problems bonus when there are no deductions", () => {
  const result = scoreNutrition(validText, 0.9, {
    ...base,
    nutritionFindings: [
      {
        ...attentionFinding,
        // Below every threshold band, so nothing is charged. The severity is
        // irrelevant now: the amount decides.
        amount: "2g",
        severity: "positive" as const,
      },
    ],
  });

  assert.ok(
    result.bonuses.some((bonus) => bonus.label.includes("προβληματικά")),
    "expected the no-problems bonus",
  );
});

test("does not add the no-problems bonus when an E-number is flagged", () => {
  const result = scoreNutrition(validText, 0.9, {
    ...base,
    nutritionFindings: [
      { ...attentionFinding, normalizedName: "e621" },
    ],
  });

  assert.ok(
    !result.bonuses.some((bonus) => bonus.label.includes("προβληματικά")),
    "did not expect the no-problems bonus",
  );
});

// Same reproduction as worker/scoring.test.ts: a real, non-additive
// deduction (high sugar) must block the "no problems" bonus, not just
// E-number-pattern matches.
test("does not add the no-problems bonus alongside a real deduction", () => {
  const result = scoreNutrition(validText, 0.9, {
    ...base,
    nutritionFindings: [attentionFinding],
  });

  assert.equal(result.deductions.length, 1);
  assert.ok(
    !result.bonuses.some((bonus) => bonus.label.includes("προβληματικά")),
    "did not expect the no-problems bonus alongside a real deduction",
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
  assert.equal(result.deductions[0].code, "threshold:sugars");
});

test("returns the scoring version", () =>
  assert.equal(
    scoreNutrition(validText, 0.9, {
      ...base,
      nutritionFindings: [attentionFinding],
    }).scoringVersion,
    scoringVersion,
  ));
