import assert from "node:assert/strict";
import test from "node:test";
import { readNutritionPanel } from "./nutritionPanel";

// A bilingual bar label printed with bare numbers (per 100 g, per portion),
// where OCR put each row's name and numbers on the same line.
const TABLE = [
  "Λιπαρά / Fat 11.9 7.1",
  "εκ των οποίων κορεσμένα / of which saturated 3.6 2.2",
  "Υδατάνθρακες / Carbohydrates 33.7 20.2",
  "εκ των οποίων σάκχαρα / of which sugars 29.7 17.8",
  "Εδώδιμες ίνες / Dietary Fiber 12.4 7.4",
  "Πρωτεΐνες / Protein 30.1 18.1",
  "Αλάτι / Salt 0.2 0.1",
];

test("unitless table with names and numbers on one line reads the per-100 column", () => {
  const panel = readNutritionPanel(TABLE.join("\n"));
  const byKey = Object.fromEntries(
    panel?.readings.map((r) => [r.key, r.gramsPer100]) ?? [],
  );

  assert.deepEqual(byKey, {
    sugars: 29.7,
    saturates: 3.6,
    fibre: 12.4,
    protein: 30.1,
    salt: 0.2,
  });
});

test("percentages in an ingredient list are not read as a table", () => {
  assert.equal(
    readNutritionPanel("Ingredients: sugar 12%, cocoa 8%, salt 1%, oats 30%"),
    null,
  );
});
