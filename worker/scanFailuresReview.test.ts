import assert from "node:assert/strict";
import test from "node:test";
import fixtures from "./fixtures/scanFailures.json" with { type: "json" };
import { reviewState } from "../src/utils/reviewState";

// Real OCR readings that failed in production (scan_failures, exported
// 2026-11-07). Each is pinned to what the review screen now tells the user.
const rows = fixtures as Array<{ category: string; text: string }>;

function verdictFor(start: string) {
  const row = rows.find((candidate) => candidate.text.startsWith(start));

  assert.ok(row, `fixture starting with "${start}" is missing`);

  return reviewState({
    text: row.text,
    confidence: 0.9,
    categoryOverride: undefined,
    isMerge: false,
  });
}

const expectations: Array<[string, string, string | undefined]> = [
  // Lists printed next to a table: the list is found, never an error.
  ["GR Λευκή σοκολάτα", "ready", "ingredients"],
  ["ΣΝΙΤΣΕΛ ΚΟΤΟΠΟΥΛΟ", "ready", "ingredients"],
  ["ANA\nΔΙΑΤΡΟΦΙΚΗ ΔΗΛΩΣΗ", "ready", "ingredients"],
  ["ΣΥΣΤΑΤΙΚΑ: Αγελαδινό", "ready", "ingredients"],
  // Beer whose table OCR read in Latin letters ("ENEPTEIA 167 kJ").
  ["ΟΙ ΣΤΙΓΜΕΣ ΠΟΥ", "ready", "ingredients"],
  // A bottled-water analysis is a water analysis, not an ingredient list.
  ["RPMOFTHEFAME", "ready", "chemical_composition"],
  // A torn-off corner of a table: offer the table, not a "cut-off list".
  ["3,7\n2,2", "table_only", "nutrition"],
  // Front of pack, addresses and storage advice: nothing to analyse.
  ["το\nAttiki", "nothing", undefined],
  ["ΠΡΩΤΟΜΑΓΙΑΣ 9", "nothing", undefined],
  ["Ανάλωση έως", "nothing", undefined],
];

for (const [start, kind, category] of expectations) {
  test(`review verdict for "${start.split("\n")[0]}" is ${kind}`, () => {
    const state = verdictFor(start);

    assert.equal(state.kind, kind);
    assert.equal(state.suggestedCategory, category);
  });
}

test("no real failure leaves the user without a next step", () => {
  for (const row of rows) {
    const state = reviewState({
      text: row.text,
      confidence: 0.9,
      categoryOverride: undefined,
      isMerge: false,
    });

    assert.ok(state.found.length > 0);
    assert.ok(state.canContinue || state.hint !== null);
  }
});
