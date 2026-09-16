import assert from "node:assert/strict";
import test from "node:test";
import {
  scoreNutrition,
  UNREADABLE_TABLE_REASON,
} from "./nutritionScoring";
import { scoringVersion } from "./scoring";
import type { WorkerNutritionResult } from "./nutritionAnalysis";

/**
 * A solid's table that passes every plausibility check: 4·12 + 4·60 + 9·20
 * = 468 kcal against 470 declared. 30 g sugars is above the 22,5 g band.
 */
const validText = [
  "Διατροφική δήλωση ανά 100g",
  "Ενέργεια 1966kJ / 470kcal",
  "Λιπαρά 20g",
  "εκ των οποίων κορεσμένα 1g",
  "Υδατάνθρακες 60g",
  "εκ των οποίων σάκχαρα 30g",
  "Πρωτεΐνες 12g",
  "Αλάτι 0,2g",
].join("\n");

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

const withFinding = { ...base, nutritionFindings: [attentionFinding] };

test("returns null score for empty text", () =>
  assert.equal(scoreNutrition("", 0.9, base).score, null));

test("returns null score for short text", () =>
  assert.equal(scoreNutrition("x", 0.9, base).score, null));

test("returns null score without findings", () =>
  assert.equal(scoreNutrition(validText, 0.9, base).score, null));

test("returns null score for very low confidence", () =>
  assert.equal(scoreNutrition(validText, 0.2, withFinding).score, null));

test("accepts plain text OCR confidence", () =>
  assert.notEqual(scoreNutrition(validText, 0.5, withFinding).score, null));

test("scores from the printed table, not from the model's severities", () => {
  const result = scoreNutrition(validText, 0.9, {
    ...base,
    nutritionFindings: [
      ...Array(8).fill(attentionFinding),
      { ...attentionFinding, normalizedName: "e621" },
      { ...attentionFinding, severity: "positive" as const },
    ],
  });

  assert.deepEqual(
    result.deductions.map((deduction) => [deduction.code, deduction.points]),
    [["threshold:sugars", 30]],
  );
});

// Decided 2026-09-16: a table the reader cannot vouch for yields no score.
// The model's copy of it is exactly what put Kaiser pilsner's 0,5 g of sugar
// into the score as 5 g.
test("an unreadable table yields no score, whatever the model copied", () => {
  const unreadable = [
    "Διατροφική δήλωση ανά 100ml",
    "Ενέργεια 1966kJ / 470kcal",
    "Λιπαρά 2g",
    "Υδατάνθρακες 3g",
    "εκ των οποίων σάκχαρα 30g",
    "Πρωτεΐνες 1g",
  ].join("\n");

  const result = scoreNutrition(unreadable, 0.9, {
    ...base,
    nutritionFindings: [{ ...attentionFinding, amount: "5g" }],
  });

  assert.equal(result.score, null);
  assert.ok(result.insufficientDataReasons.includes(UNREADABLE_TABLE_REASON));
});

test("a full-sugar drink scores far below a solid with the same sugar band", () => {
  const drink = scoreNutrition(
    [
      "Διατροφική δήλωση ανά 100ml",
      "Ενέργεια 180kJ / 42kcal",
      "Λιπαρά 0g",
      "Υδατάνθρακες 10,6g",
      "εκ των οποίων σάκχαρα 10,6g",
      "Πρωτεΐνες 0g",
      "Αλάτι 0g",
    ].join("\n"),
    0.9,
    withFinding,
  );

  assert.equal(drink.deductions[0].points, 55);
  assert.equal(drink.score, 45);
  assert.equal(drink.band, "attention");
});

test("adds the no-problems bonus when there are no deductions", () => {
  const result = scoreNutrition(
    validText.replace("σάκχαρα 30g", "σάκχαρα 2g"),
    0.9,
    withFinding,
  );

  assert.deepEqual(result.deductions, []);
  assert.ok(
    result.bonuses.some((bonus) => bonus.label.includes("προβληματικά")),
    "expected the no-problems bonus",
  );
});

test("does not add the no-problems bonus alongside a real deduction", () => {
  const result = scoreNutrition(validText, 0.9, withFinding);

  assert.equal(result.deductions.length, 1);
  assert.ok(
    !result.bonuses.some((bonus) => bonus.label.includes("προβληματικά")),
    "did not expect the no-problems bonus alongside a real deduction",
  );
});

test("a declared allergen row costs nothing", () => {
  const result = scoreNutrition(
    validText.replace("σάκχαρα 30g", "σάκχαρα 2g"),
    0.9,
    {
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
    },
  );

  assert.equal(result.deductions.length, 0);
});

test("returns the scoring version", () =>
  assert.equal(
    scoreNutrition(validText, 0.9, withFinding).scoringVersion,
    scoringVersion,
  ));
