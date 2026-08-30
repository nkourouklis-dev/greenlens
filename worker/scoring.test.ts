import assert from "node:assert/strict";
import test from "node:test";
import {
  scoreInterpretation,
  scoringVersion,
} from "./scoring";
import type { WorkerAnalysisResult } from "./analysis";

const validText =
  "Aqua, Glycerin, Cetearyl Alcohol, Parfum, Linalool";

const base: WorkerAnalysisResult = {
  productType: "food",
  summary: "Επιβεβαιωμένο κείμενο.",
  positives: [],
  attentionItems: [],
  potentialAllergens: [],
  ingredientFindings: [],
  insufficientDataReasons: [],
  confidence: 0.9,
};

const attentionFinding = {
  ingredientName: "x",
  normalizedName: "x",
  severity: "attention" as const,
  title: "x",
  explanation: "x",
  evidenceType: "label" as const,
  sourceName: null,
  sourceUrl: null,
  confidence: 0.9,
};

test("returns null score for empty text", () =>
  assert.equal(
    scoreInterpretation("", 0.9, base).score,
    null,
  ));

test("returns null score for short text", () =>
  assert.equal(
    scoreInterpretation("x", 0.9, base).score,
    null,
  ));

test("returns null score without findings", () =>
  assert.equal(
    scoreInterpretation(
      validText,
      0.9,
      base,
    ).score,
    null,
  ));

test("returns null score for very low confidence", () =>
  assert.equal(
    scoreInterpretation(validText, 0.2, {
      ...base,
      ingredientFindings: [attentionFinding],
    }).score,
    null,
  ));

test("accepts plain text OCR confidence", () =>
  assert.notEqual(
    scoreInterpretation(validText, 0.5, {
      ...base,
      ingredientFindings: [attentionFinding],
    }).score,
    null,
  ));

test("deduplicates identical findings", () =>
  assert.equal(
    scoreInterpretation(validText, 0.9, {
      ...base,
      ingredientFindings: Array(8).fill(
        attentionFinding,
      ),
    }).deductions.length,
    1,
  ));

test("caps deductions at six", () => {
  const findings = Array.from(
    { length: 10 },
    (_, index) => ({
      ...attentionFinding,
      normalizedName: "ingredient" + index,
    }),
  );

  assert.equal(
    scoreInterpretation(validText, 0.9, {
      ...base,
      ingredientFindings: findings,
    }).deductions.length,
    6,
  );
});

test("halves points when evidence is missing", () => {
  const withEvidence = scoreInterpretation(
    validText,
    0.9,
    {
      ...base,
      ingredientFindings: [attentionFinding],
    },
  );

  const withoutEvidence = scoreInterpretation(
    validText,
    0.9,
    {
      ...base,
      ingredientFindings: [
        {
          ...attentionFinding,
          evidenceType: "none" as const,
        },
      ],
    },
  );

  assert.equal(
    withEvidence.deductions[0].points,
    8,
  );

  assert.equal(
    withoutEvidence.deductions[0].points,
    4,
  );
});

test("ignores positive and info findings", () =>
  assert.equal(
    scoreInterpretation(validText, 0.9, {
      ...base,
      ingredientFindings: [
        {
          ...attentionFinding,
          severity: "positive" as const,
        },
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

test("adds bonus when no allergens", () => {
  const result = scoreInterpretation(
    validText,
    0.9,
    {
      ...base,
      ingredientFindings: [attentionFinding],
      potentialAllergens: [],
    },
  );

  assert.ok(
    result.bonuses.length > 0,
    "expected at least one bonus",
  );
});

test("returns the scoring version", () =>
  assert.equal(
    scoreInterpretation(validText, 0.9, {
      ...base,
      ingredientFindings: [attentionFinding],
    }).scoringVersion,
    scoringVersion,
  ));