import assert from "node:assert/strict";
import test from "node:test";
import { NUTREE_BAR_PANEL_OCR } from "./labelFixtures";
import { readNutritionPanel } from "./nutritionPanel";
import { bonusesFor, penaltiesFor } from "./nutritionThresholds";

/**
 * Picking the right column out of a three-column table.
 *
 * A printed panel declares per 100 g, per portion and %RI side by side. OCR
 * reads it column by column and drops the unit off values that sit hard
 * against the column rule, so the per-100 g figure can arrive as a bare
 * "33.7" while the per-portion one below it keeps its "16,8g". A reader that
 * waits for a unit takes the portion and scores it as though it were per
 * 100 g — halving the number with nothing to show anything went wrong.
 *
 * The label is barcode 5214001318704, which scored 49 when the sugars in it
 * were read as 16,8 g instead of the 33,7 g actually printed.
 */

test("a per-100 column that lost its unit is still the per-100 column", () => {
  const panel = readNutritionPanel(NUTREE_BAR_PANEL_OCR);

  assert(panel, "no panel was read");

  assert.deepEqual(
    panel.readings.map((reading) => [reading.key, reading.gramsPer100]),
    [
      // 33,7 — not the 16,8 of the 50 g bar below it.
      ["sugars", 33.7],
      ["saturates", 3.6],
      ["salt", 0.5],
      ["fibre", 9.1],
      ["protein", 20.2],
    ],
  );
});

test("the whole panel scores from the printed numbers", () => {
  const panel = readNutritionPanel(NUTREE_BAR_PANEL_OCR);

  assert(panel);

  assert.deepEqual(
    penaltiesFor(panel.readings, panel.isBeverage).map((penalty) => [
      penalty.key,
      penalty.points,
    ]),
    [
      ["sugars", 30],
      ["saturates", 15],
      ["salt", 5],
    ],
  );

  // 9,1 g of fibre and 20,2 g of protein, both earned — and both lost
  // entirely when the amounts came back as 1 g and 2 g.
  assert.deepEqual(
    bonusesFor(panel.readings).map((bonus) => bonus.points),
    [6, 4],
  );
});

// The per-portion column is a fraction of the per-100 one on every real
// label, so a bare number smaller than the value below it is not a column —
// it is a stray percentage, and taking it would understate the product.
test("a bare number smaller than the amount below it is not the per-100 value", () => {
  const panel = readNutritionPanel(
    [
      "ΛΙΠΑΡΑ/FAT",
      "10g",
      "ΥΔΑΤΑΝΘΡΑΚΕΣ",
      "40g",
      "ΠΡΩΤΕΪΝΕΣ",
      "5g",
      "ΣΑΚΧΑΡΑ",
      "2",
      "20g",
    ].join("\n"),
  );

  assert(panel);

  assert.equal(
    panel.readings.find((reading) => reading.key === "sugars")?.gramsPer100,
    20,
  );
});

// The declared amount is quoted back to the user; when it already carries a
// basis, the sentence used to read "8g ανά 100g ανά 100 g".
test("the explanation states the basis once", () => {
  const [penalty] = penaltiesFor(
    [{ key: "sugars", gramsPer100: 30, declared: "8g ανά 100g" }],
    false,
  );

  assert.equal(penalty.explanation, "8g ανά 100 g");
});
