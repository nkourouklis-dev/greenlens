import assert from "node:assert/strict";
import test from "node:test";
import {
  scoreChemicalComposition,
} from "./chemicalScoring";
import { scoringVersion } from "./scoring";
import type { WorkerChemicalResult } from "./chemicalAnalysis";

const validText = "Ca 80 mg/L, Mg 20 mg/L, Na 15 mg/L, NO3 12 mg/L, pH 7.4";

const base: WorkerChemicalResult = {
  sourceType: "drinking_water",
  summary: "Επιβεβαιωμένη χημική ανάλυση.",
  positives: [],
  attentionItems: [],
  chemicalFindings: [],
  insufficientDataReasons: [],
  confidence: 0.9,
};

const attentionFinding = {
  substance: "Νιτρικά",
  normalizedName: "nitrate",
  concentration: "80 mg/L",
  referenceLimit: "≤ 50 mg/L (EU 2020/2184)",
  severity: "attention" as const,
  title: "x",
  explanation: "x",
  evidenceType: "label" as const,
  sourceName: null,
  sourceUrl: null,
  confidence: 0.9,
};

test("returns null score for empty text", () =>
  assert.equal(scoreChemicalComposition("", 0.9, base).score, null));

test("returns null score for short text", () =>
  assert.equal(scoreChemicalComposition("x", 0.9, base).score, null));

test("returns null score without findings", () =>
  assert.equal(
    scoreChemicalComposition(validText, 0.9, base).score,
    null,
  ));

test("returns null score for very low confidence", () =>
  assert.equal(
    scoreChemicalComposition(validText, 0.2, {
      ...base,
      chemicalFindings: [attentionFinding],
    }).score,
    null,
  ));

test("accepts plain text OCR confidence", () =>
  assert.notEqual(
    scoreChemicalComposition(validText, 0.5, {
      ...base,
      chemicalFindings: [attentionFinding],
    }).score,
    null,
  ));

test("deduplicates identical findings", () =>
  assert.equal(
    scoreChemicalComposition(validText, 0.9, {
      ...base,
      chemicalFindings: Array(8).fill(attentionFinding),
    }).deductions.length,
    1,
  ));

test("caps deductions at six", () => {
  const findings = Array.from({ length: 10 }, (_, index) => ({
    ...attentionFinding,
    normalizedName: "substance" + index,
  }));

  assert.equal(
    scoreChemicalComposition(validText, 0.9, {
      ...base,
      chemicalFindings: findings,
    }).deductions.length,
    6,
  );
});

test("halves points when evidence is missing", () => {
  const withEvidence = scoreChemicalComposition(validText, 0.9, {
    ...base,
    chemicalFindings: [attentionFinding],
  });

  const withoutEvidence = scoreChemicalComposition(validText, 0.9, {
    ...base,
    chemicalFindings: [
      { ...attentionFinding, evidenceType: "none" as const },
    ],
  });

  assert.equal(withEvidence.deductions[0].points, 8);
  assert.equal(withoutEvidence.deductions[0].points, 4);
});

test("ignores positive and info findings", () =>
  assert.equal(
    scoreChemicalComposition(validText, 0.9, {
      ...base,
      chemicalFindings: [
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

test("adds the no-deviations bonus when there are no deductions", () => {
  const result = scoreChemicalComposition(validText, 0.9, {
    ...base,
    chemicalFindings: [
      { ...attentionFinding, severity: "positive" as const },
    ],
  });

  assert.ok(
    result.bonuses.some((bonus) => bonus.label.includes("όρια ασφαλείας")),
    "expected the no-deviations safety bonus",
  );
});

test("does not add the safety bonus when something is high_attention", () => {
  const result = scoreChemicalComposition(validText, 0.9, {
    ...base,
    chemicalFindings: [
      { ...attentionFinding, severity: "high_attention" as const },
    ],
  });

  assert.ok(
    !result.bonuses.some((bonus) => bonus.label.includes("όρια ασφαλείας")),
    "did not expect the no-deviation safety bonus",
  );
});

// This used to only gate on high_attention, so a merely "attention"-level
// deviation (a real deduction) could still get the "no deviations from
// safety limits" bonus alongside it — same class of bug as the ingredients
// and nutrition paths.
test("does not add the safety bonus alongside a moderate attention deduction", () => {
  const result = scoreChemicalComposition(validText, 0.9, {
    ...base,
    chemicalFindings: [attentionFinding],
  });

  assert.equal(result.deductions.length, 1);
  assert.ok(
    !result.bonuses.some((bonus) => bonus.label.includes("όρια ασφαλείας")),
    "did not expect the no-deviation safety bonus alongside a real deduction",
  );
});

test("returns the scoring version", () =>
  assert.equal(
    scoreChemicalComposition(validText, 0.9, {
      ...base,
      chemicalFindings: [attentionFinding],
    }).scoringVersion,
    scoringVersion,
  ));
