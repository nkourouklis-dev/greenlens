import assert from "node:assert/strict";
import test from "node:test";
import type { ChemicalFinding, WorkerChemicalResult } from "./chemicalAnalysis";
import { refineChemicalPositives } from "./chemicalInsights";

function finding(
  normalizedName: string,
  substance: string,
  concentration: string | null,
): ChemicalFinding {
  return {
    substance,
    normalizedName,
    concentration,
    referenceLimit: null,
    severity: "info",
    title: "t",
    explanation: "e",
    evidenceType: "none",
    sourceName: null,
    sourceUrl: null,
    confidence: 0.5,
  };
}

function result(
  positives: string[],
  findings: ChemicalFinding[],
): WorkerChemicalResult {
  return {
    sourceType: "mineral_water",
    summary: "s",
    positives,
    attentionItems: [],
    chemicalFindings: findings,
    insufficientDataReasons: [],
    confidence: 0.8,
  };
}

test("drops a positive that only names the kind of label", () => {
  assert.deepEqual(
    refineChemicalPositives(result(["Χημική ανάλυση"], [])).positives,
    [],
  );
});

test("states low sodium and low nitrate with the printed value", () => {
  const refined = refineChemicalPositives(
    result(
      ["Χημική ανάλυση"],
      [
        finding("sodium", "Νάτριο (Na+)", "9 mg/L"),
        finding("nitrate", "Νιτρικά (NO3)", "3,5 mg/L"),
      ],
    ),
  );

  assert.deepEqual(refined.positives, [
    "Χαμηλό νάτριο (9 mg/L)",
    "Χαμηλά νιτρικά (3,5 mg/L)",
  ]);
});

test("says nothing positive about sodium or nitrate above the thresholds", () => {
  const refined = refineChemicalPositives(
    result(
      [],
      [
        finding("sodium", "Νάτριο", "45 mg/L"),
        finding("nitrate", "Νιτρικά", "25 mg/L"),
      ],
    ),
  );

  assert.deepEqual(refined.positives, []);
});

test("nitrite is not mistaken for nitrate", () => {
  const refined = refineChemicalPositives(
    result([], [finding("nitrite", "Νιτρώδη (NO2)", "0.005 mg/L")]),
  );

  assert.deepEqual(refined.positives, []);
});

test("keeps a specific model positive and does not repeat it", () => {
  const refined = refineChemicalPositives(
    result(
      ["Χαμηλό νάτριο (9 mg/L)", "Ήπια σκληρότητα"],
      [finding("sodium", "Νάτριο", "9 mg/L")],
    ),
  );

  assert.deepEqual(refined.positives, [
    "Χαμηλό νάτριο (9 mg/L)",
    "Ήπια σκληρότητα",
  ]);
});

test("ignores concentrations it cannot read as mg/L", () => {
  const refined = refineChemicalPositives(
    result([], [finding("sodium", "Νάτριο", null), finding("nitrate", "Νιτρικά", "τιμή")]),
  );

  assert.deepEqual(refined.positives, []);
});
