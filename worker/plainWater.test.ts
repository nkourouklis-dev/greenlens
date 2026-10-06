import assert from "node:assert/strict";
import test from "node:test";
import { scoreFood, PARTIAL_EVALUATION_SCORE_CAP } from "./foodScore";
import { isPlainWaterLabel } from "./plainWater";
import type { WorkerScore } from "./scoring";

// Βίκος natural mineral water (5201946010022): the label is a chemical
// analysis, there is no nutrition table, and it was capped at 65 "moderate".
const VIKOS_ANALYSIS =
  "ΧΗΜΙΚΗ ΑΝΑΛΥΣΗ | CHEMICAL ANALYSIS (Γ.Χ.Κ. 08/01/25) ΑΤΙΟΝΤΑ (mg/l) [Ca: 100 2| Mg 1,54 |Na 3.01 | K+ 0.61 | HCO-) Cl 7,59 SO. 11.4 |NO. 6.480 PH= 7,6 Αγωγιμότητα / Conductivity=511 μS/cm Dry residue (260°C) = 238 Total dissolved solids = 288";

const CLEAN_LIST_SCORE: WorkerScore = {
  score: 100,
  band: "excellent",
  deductions: [],
  bonuses: [],
  confidence: 0.9,
  lowConfidenceReason: null,
  insufficientDataReasons: [],
  scoringVersion: "test",
};

test("a chemical analysis of mineral water and a mineral list are plain water", () => {
  assert.equal(isPlainWaterLabel(VIKOS_ANALYSIS), true);
  assert.equal(isPlainWaterLabel("Aqua, Ca, Mg, Na, K+"), true);
});

test("water with anything added, or no water, is not plain water", () => {
  assert.equal(isPlainWaterLabel("Water, sugar, citric acid"), false);
  assert.equal(isPlainWaterLabel("Νερό, ζάχαρη, χυμός λεμονιού"), false);
  assert.equal(isPlainWaterLabel("Sugar, cocoa"), false);
  assert.equal(isPlainWaterLabel(null), false);
});

test("a plain water is not capped for lacking a nutrition table", () => {
  const score = scoreFood({
    ingredientScore: CLEAN_LIST_SCORE,
    nutrition: null,
    nonNutritiveSweetener: null,
    ingredientText: VIKOS_ANALYSIS,
    alcohol: null,
    notices: [],
  });

  assert.ok((score.score ?? 0) > PARTIAL_EVALUATION_SCORE_CAP);
  assert.ok(!score.notices?.some((n) => n.code === "partial_no_nutrition"));
});

test("a food without a table is still capped", () => {
  const score = scoreFood({
    ingredientScore: CLEAN_LIST_SCORE,
    nutrition: null,
    nonNutritiveSweetener: null,
    ingredientText: "Oats, honey",
    alcohol: null,
    notices: [],
  });

  assert.equal(score.score, PARTIAL_EVALUATION_SCORE_CAP);
});
