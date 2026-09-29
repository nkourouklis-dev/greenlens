import assert from "node:assert/strict";
import test from "node:test";
import { tableTextFromVision } from "./nutritionVision";
import { readNutritionPanel } from "./nutritionPanel";

test("a vision reading becomes rows the deterministic reader scores", () => {
  const text = tableTextFromVision(
    'Here you go: {"energyKcal":367,"fat":13,"saturates":3.7,"carbohydrate":32,"sugars":24,"fibre":8.7,"protein":30,"salt":0.4}',
  );

  assert(text);

  const panel = readNutritionPanel(text);

  assert(panel, "no panel was read");

  assert.deepEqual(
    panel.readings.map((reading) => [reading.key, reading.gramsPer100]),
    [
      ["sugars", 24],
      ["saturates", 3.7],
      ["salt", 0.4],
      ["fibre", 8.7],
      ["protein", 30],
    ],
  );
});

test("an implausible vision reading is still rejected by the checks", () => {
  const text = tableTextFromVision(
    '{"energyKcal":367,"fat":13,"saturates":3.7,"carbohydrate":32,"sugars":90,"fibre":8.7,"protein":30,"salt":0.4}',
  );

  assert(text);
  assert.equal(readNutritionPanel(text), null);
});

test("without the three totals there is nothing to read", () => {
  assert.equal(tableTextFromVision('{"fat":13,"sugars":24}'), null);
  assert.equal(tableTextFromVision("no table here"), null);
});
