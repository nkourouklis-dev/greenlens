import assert from "node:assert/strict";
import test from "node:test";
import {
  bonusesFor,
  isBeverageTable,
  parseAmountGrams,
  penaltiesFor,
  readNutrients,
} from "./nutritionThresholds";

function row(
  nutrient: string,
  amount: string | null,
  normalizedName = nutrient,
) {
  return { nutrient, normalizedName, amount };
}

test("parses a Greek decimal comma", () =>
  assert.equal(parseAmountGrams("10,6 g"), 10.6));

test("converts milligrams to grams", () =>
  assert.equal(parseAmountGrams("285 mg"), 0.285));

test("returns null for an unreadable amount", () =>
  assert.equal(parseAmountGrams("ίχνη"), null));

test("recognises a per-100ml panel as a beverage", () => {
  assert.equal(
    isBeverageTable("Ενέργεια 180 kJ ανά 100 ml"),
    true,
  );

  assert.equal(
    isBeverageTable("Ενέργεια 450 kcal ανά 100 g"),
    false,
  );
});

// Sodium and salt are alternative declarations of the same thing, not two
// separate nutrients to be charged for.
test("converts declared sodium into salt", () => {
  const readings = readNutrients([
    row("Νάτριο", "0.4g", "sodium"),
  ]);

  assert.equal(readings.length, 1);
  assert.equal(readings[0].key, "salt");
  assert.equal(readings[0].gramsPer100, 1);
});

test("reads the per-100 column and ignores the repeat", () => {
  const readings = readNutrients([
    row("Σάκχαρα", "30g", "sugars"),
    row("Σάκχαρα ανά μερίδα", "45g", "sugars"),
  ]);

  assert.equal(readings.length, 1);
  assert.equal(readings[0].gramsPer100, 30);
});

test("saturated fat is not mistaken for sugars", () => {
  const readings = readNutrients([
    row("εκ των οποίων κορεσμένα", "9g", "saturated fat"),
  ]);

  assert.equal(readings[0].key, "saturates");
});

test("skips a row with no declared amount", () =>
  assert.equal(
    readNutrients([row("Σάκχαρα", null, "sugars")]).length,
    0,
  ));

// The regression driving the beverage scale: FSA per-100ml bands call a
// full-sugar cola "amber", which scores it in the high eighties.
test("a full-sugar cola is penalised far harder as a drink than as a solid", () => {
  const readings = readNutrients([
    row("Σάκχαρα", "10.6g", "sugars"),
  ]);

  const asDrink = penaltiesFor(readings, true);
  const asSolid = penaltiesFor(readings, false);

  assert.equal(asDrink[0].points, 55);
  assert.equal(asSolid[0].points, 12);
});

test("water-like values are charged nothing", () =>
  assert.equal(
    penaltiesFor(
      readNutrients([
        row("Σάκχαρα", "0g", "sugars"),
        row("Αλάτι", "0.1g", "salt"),
      ]),
      true,
    ).length,
    0,
  ));

test("penalties come back worst first", () => {
  const penalties = penaltiesFor(
    readNutrients([
      row("Αλάτι", "1.0g", "salt"),
      row("Σάκχαρα", "30g", "sugars"),
    ]),
    false,
  );

  assert.equal(penalties[0].key, "sugars");
  assert.equal(penalties[0].points, 30);
  assert.equal(penalties[1].key, "salt");
  assert.equal(penalties[1].points, 12);
});

test("fibre and protein earn bonuses from their declared amounts", () => {
  const bonuses = bonusesFor(
    readNutrients([
      row("Εδώδιμες ίνες", "7g", "fibre"),
      row("Πρωτεΐνες", "11g", "protein"),
    ]),
  );

  assert.equal(bonuses.length, 2);
  assert.equal(
    bonuses.reduce((sum, bonus) => sum + bonus.points, 0),
    10,
  );
});

test("a trace of fibre earns no bonus", () =>
  assert.equal(
    bonusesFor(
      readNutrients([row("Εδώδιμες ίνες", "1g", "fibre")]),
    ).length,
    0,
  ));
