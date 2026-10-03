import assert from "node:assert/strict";
import test from "node:test";
import {
  INGREDIENTS_WEIGHT,
  INTRINSIC_SUGAR_WEIGHT,
  NUTRITION_WEIGHT,
  evaluateNutrition,
  scoreFood,
  scoreNutritionOnly,
} from "./foodScore";
import {
  declaredFruitVegLegumes,
  ingredientListFromLabel,
  isFreeSugar,
  isWholePlantFood,
  parseIngredientList,
  splitSugarOrigin,
} from "./ingredientShares";
import { computeNutriScore } from "./nutriScore";
import {
  nutriScoreInputFor,
  type NutritionEvidence,
} from "./nutritionFacts";
import type { WorkerScore } from "./scoring";

/**
 * Date-and-pea-protein snack bars (Odd Kin, Feel Good), scanned 2026-10-03.
 *
 * Two things were wrong with them, and both are pinned here at the root:
 *  1. Fruit/veg/legumes was always "not found, 0 points", even for a bar that
 *     declares "Χουρμάδες 49,8%" — a label table never states it.
 *  2. Sugars from dates were charged exactly like sugar from a sugar bowl, in
 *     our blended score. The official Nutri-Score sugar points must not move.
 */

// The lists as the labels print them (OCR text, Greek copy first).
const ODD_KIN_SALTED_CARAMEL =
  "Χωρίς προσθήκη ζάχαρης · Χωρίς γλυκαντικά · Χωρίς γλουτένη Περιέχει φυσικά σάκχαρα Πλούσιο σε φυτικές ίνες ΜΠΑΡΑ ΧΟΥΡΜΑ ΜΕ ΦΥΤΙΚΗ ΠΡΩΤΕΪΝΗ Συστατικά: Χουρμάδες 49,8%, Πρωτεΐνη Αρακά 21,0%, Φιστικοβούτυρο 11,6% (100% Φιστίκια), Φυτική Ίνα Κιχωρίου 11%, Μαύρη Σοκολάτα 6,4%, (100% κακαόμαζα), Φυσικές Αρωματικές Ύλες, θαλασσινό Αλάτι.";

const PEANUT_BUTTER_CRUNCH = `100% Φυσικά συστατικά
Χωρίς προσθήκη ζάχαρης
Περιέχει φυσικά σάκχαρα
ΜΠΑΡΑ ΧΟΥΡΜΑ ΜΕ ΦΥΤΙΚΗ ΠΡΩΤΕΪΝΗ
Συστατικά: Χουρμάδες 39,3%, Φιστικοβούτυρο 21,5% (100%
Φιστίκια), Φιστίκια 16%, Πρωτεΐνη Αρακά 12,8%, Φυτική Ίνα
Κιχωρίου 11%, Φυσικές Αρωματικές Ύλες, Θαλασσινό Αλάτι.
Μπορεί να περιέχει ίχνη από άλλους ξηρούς καρπούς και σόγια.
Ingredients: Dates 39,5%, Peanut Butter 21,5% (100% Peanuts), Peanuts 16%,
Διατροφική Δήλωση
Ενέργεια/Energy 1660KJ/ 397kcal`;

const FEEL_GOOD =
  "Πάστα Χουρμά 55%, Πρωτεΐνη Αρακά 21%, Φιστικοβούτυρο (100% Φιστίκια), Βούτυρο Κάσιους (100% Κάσιους), Καρύδια, Κανέλα 3%, Φυτική Ίνα Βρώμης, Φυσικό Εκχύλισμα Καραμέλας. & ΣΥΝΤΗΡΙ Α, ΧΡΩΣΤΙΚΕΣ ΚΑΙ ΠΡΟΣΘΕΤΑ";

const ODD_KIN_OTHER = `Συστατικά: Χουρμάδες 43,3%, Πρωτεΐνη Αρακά 17,3%, Βούτυρο
Κάσιους (100% Κάσιους), Φιστικοβούτυρο (100% Φιστίκι),
Φυτική Ίνα Κιχωρίου 11%, Μαύρη Σοκολάτα 7,6%, (100%
κακαόμαζα), Φυσικές Αρωματικές Ύλες, θαλασσινό Αλάτι.
Μπορεί να περιέχει ίχνη από άλλους ξηρούς καρπούς, γάλα
& σόγια. Ο χουρμάς προέρχεται από χώρες εκτός Ε.Ε.
Ingredients: Dates 43,3%, Pea Protein 17,3%`;

function evidence(
  facts: Partial<NutritionEvidence["facts"]>,
): NutritionEvidence {
  return {
    source: "label",
    categoryTags: [],
    facts: {
      energyKj: null,
      fat: null,
      saturates: null,
      carbohydrate: null,
      sugars: null,
      fibre: null,
      protein: null,
      salt: null,
      fruitVegLegumesPct: null,
      isBeverage: false,
      abv: null,
      ...facts,
    },
  };
}

// Per-100 g tables, as read off the packs.
const FEEL_GOOD_TABLE = evidence({
  energyKj: 1589.92,
  fat: 11.9,
  saturates: 3.6,
  carbohydrate: 33.7,
  sugars: 29.7,
  fibre: 12.4,
  protein: 30.1,
  salt: 0.2,
});

const PEANUT_BUTTER_CRUNCH_TABLE = evidence({
  energyKj: 1661,
  fat: 19.9,
  saturates: 4,
  carbohydrate: 34.4,
  sugars: 29.5,
  fibre: 14.5,
  protein: 20,
  salt: 0.63,
});

const CLEAN_INGREDIENT_SCORE: WorkerScore = {
  score: 100,
  band: "excellent",
  deductions: [],
  bonuses: [],
  confidence: 1,
  lowConfidenceReason: null,
  insufficientDataReasons: [],
  notices: [],
  scoringVersion: "test",
};

const pointsOf = (
  components: Array<{ key: string; points: number }>,
  key: string,
) => components.find((component) => component.key === key)?.points;

// --- Which ingredients count: SpF-2022 §1.2.2 -----------------------------------

test("fruit, vegetables and pulses count; nuts, oils, isolates and extracts do not", () => {
  for (const name of ["Χουρμάδες", "Πάστα Χουρμά", "Σύκα", "Σταφίδες", "Καρότα", "Ρεβίθια", "Dates", "Dried figs"]) {
    assert.equal(isWholePlantFood(name), true, name);
  }

  for (const name of [
    "Φιστικοβούτυρο",
    "Φιστίκια",
    "Καρύδια",
    "Βούτυρο Κάσιους",
    "Αμύγδαλα",
    "Ελαιόλαδο",
    "Πρωτεΐνη Αρακά",
    "Φυτική Ίνα Κιχωρίου",
    "Χυμός μήλου",
    "Φυσικό Εκχύλισμα Καραμέλας",
    "Μελιτζάνα σκόνη",
  ]) {
    assert.equal(isWholePlantFood(name), false, name);
  }
});

test("honey and eggplant are told apart; extracts and flavours are not sugars", () => {
  assert.equal(isFreeSugar("Μέλι"), true);
  assert.equal(isFreeSugar("Μελιτζάνα"), false);
  assert.equal(isFreeSugar("Σιρόπι χουρμά"), true);
  assert.equal(isFreeSugar("Σιρόπι αγαύης"), true);
  assert.equal(isFreeSugar("Συμπυκνωμένος χυμός μήλου"), true);
  assert.equal(isFreeSugar("Maltodextrin"), true);
  assert.equal(isFreeSugar("Φυσικό Εκχύλισμα Καραμέλας"), false);
  assert.equal(isFreeSugar("Φυσικές Αρωματικές Ύλες"), false);
});

// --- List isolation --------------------------------------------------------------

test("the list is cut from the claims above it, the English copy and the trace statement", () => {
  const list = ingredientListFromLabel(PEANUT_BUTTER_CRUNCH);

  assert.ok(list);
  assert.ok(list.startsWith("Χουρμάδες 39,3%"));
  assert.ok(!list.includes("Dates"));
  assert.ok(!list.includes("Μπορεί"));

  const names = parseIngredientList(PEANUT_BUTTER_CRUNCH).map((e) => e.name);

  assert.ok(!names.some((name) => name.includes("Χωρίς")));
  assert.ok(!names.some((name) => name.includes("σόγια")));
});

test("a trace statement naming milk does not make the bar a milk product", () => {
  const origin = splitSugarOrigin(parseIngredientList(ODD_KIN_OTHER), 14.8);

  assert.equal(origin.determined, true);
});

test("a nutrition table is never read as an ingredient list", () => {
  assert.equal(
    ingredientListFromLabel("Ενέργεια 1660 kJ Λιπαρά 12 g Υδατάνθρακες 34 g σάκχαρα 22 g Πρωτεΐνες 30 g Αλάτι 0,2 g"),
    null,
  );
});

test("percentages: decimal commas, brackets, and (100% …) compositions", () => {
  const entries = parseIngredientList(ODD_KIN_SALTED_CARAMEL);

  const byName = (name: string) => entries.find((e) => e.name === name);

  assert.equal(byName("Χουρμάδες")?.percent, 49.8);
  assert.equal(byName("Φιστικοβούτυρο")?.percent, 11.6);
  assert.equal(byName("Μαύρη Σοκολάτα")?.percent, 6.4);
  assert.equal(byName("Μαύρη Σοκολάτα")?.statesComposition, true);

  const bracketed = parseIngredientList("Χουρμάδες (46,6%), Νερό");

  assert.equal(bracketed[0].percent, 46.6);

  // "(100% Κάσιους)" is what it is made of, not how much of the bar it is.
  assert.equal(
    parseIngredientList("Βούτυρο Κάσιους (100% Κάσιους), Νερό")[0].percent,
    null,
  );
});

// --- (1) Fruit, vegetables, legumes ----------------------------------------------

test("dates declared above 40% earn the fruit/veg/legumes point, nuts and pea protein do not", () => {
  const dates = declaredFruitVegLegumes(parseIngredientList(ODD_KIN_SALTED_CARAMEL));

  assert.equal(dates?.percent, 49.8);
  assert.deepEqual(dates?.counted.map((entry) => entry.name), ["Χουρμάδες"]);

  const { result } = evaluateNutrition(
    FEEL_GOOD_TABLE,
    null,
    FEEL_GOOD,
  );

  assert.ok(result?.computable);
  assert.equal(pointsOf(result.components, "fruit_veg_legumes"), 1);
  assert.deepEqual(result.uncredited, []);
});

test("39,3% dates is under the 40% threshold: 0 points, but known, not 'not found'", () => {
  const { evaluation } = evaluateNutrition(
    PEANUT_BUTTER_CRUNCH_TABLE,
    null,
    PEANUT_BUTTER_CRUNCH,
  );

  assert.ok(evaluation);
  assert.equal(pointsOf(evaluation.components, "fruit_veg_legumes"), 0);
  assert.equal(evaluation.fruitVegLegumesFrom, "ingredient_list");
  assert.deepEqual(evaluation.uncredited, []);
});

test("peanuts and peanut butter never count as fruit/veg/legumes", () => {
  const list = parseIngredientList("Φιστικοβούτυρο 60%, Φιστίκια 30%, Αλάτι");

  assert.equal(declaredFruitVegLegumes(list), null);
});

test("no declared share → still unknown (never a guessed 0 or a guessed share)", () => {
  const { evaluation } = evaluateNutrition(
    FEEL_GOOD_TABLE,
    null,
    "Χουρμάδες, Πρωτεΐνη Αρακά, Αλάτι",
  );

  assert.ok(evaluation);
  assert.deepEqual(evaluation.uncredited, ["fruit_veg_legumes"]);
  assert.equal(evaluation.fruitVegLegumesFrom, null);
});

test("an Open Food Facts fruit/veg estimate wins over the list", () => {
  const { evaluation } = evaluateNutrition(
    { ...FEEL_GOOD_TABLE, facts: { ...FEEL_GOOD_TABLE.facts, fruitVegLegumesPct: 85 } },
    null,
    FEEL_GOOD,
  );

  assert.equal(pointsOf(evaluation?.components ?? [], "fruit_veg_legumes"), 5);
  assert.equal(evaluation?.fruitVegLegumesFrom, "openfoodfacts");
});

// --- (2) Intrinsic versus free sugars --------------------------------------------

test("no free sugar listed and dates present: every sugar is the fruit's", () => {
  const origin = splitSugarOrigin(parseIngredientList(FEEL_GOOD), 29.7);

  assert.deepEqual(origin, {
    determined: true,
    basis: "no_free_sugar_listed",
    intrinsicGrams: 29.7,
    freeGrams: 0,
    intrinsicShare: 1,
  });
});

test("sugar listed before the dates: not determined, scored as before", () => {
  const origin = splitSugarOrigin(
    parseIngredientList("Ζάχαρη, Χουρμάδες 20%, Νερό"),
    40,
  );

  assert.deepEqual(origin, {
    determined: false,
    reason: "free_sugar_listed_before_fruit",
  });
});

test("dates first with a declared share, plus a syrup: split from the declared shares", () => {
  const origin = splitSugarOrigin(
    parseIngredientList("Χουρμάδες 46,6%, Σιρόπι γλυκόζης 5%, Νερό"),
    40,
  );

  assert.ok(origin.determined);
  assert.equal(origin.basis, "estimated_from_declared_shares");
  assert.ok(origin.intrinsicShare > 0.5 && origin.intrinsicShare < 0.7);
  assert.ok(Math.abs(origin.intrinsicGrams + origin.freeGrams - 40) < 1e-9);
});

test("dates first, a syrup too, but no declared share: not determined", () => {
  assert.deepEqual(
    splitSugarOrigin(parseIngredientList("Χουρμάδες, Μέλι, Νερό"), 40),
    { determined: false, reason: "free_sugar_with_undeclared_fruit" },
  );
});

test("no fruit, a chocolate of unknown recipe, or no list at all: not determined", () => {
  assert.equal(
    splitSugarOrigin(parseIngredientList("Αλεύρι, Νερό, Αλάτι"), 12).determined,
    false,
  );

  assert.deepEqual(
    splitSugarOrigin(parseIngredientList("Χουρμάδες 50%, Σοκολάτα γάλακτος 10%"), 30),
    { determined: false, reason: "opaque_sugar_carrier" },
  );

  assert.deepEqual(splitSugarOrigin(null, 30), {
    determined: false,
    reason: "no_ingredient_list",
  });
});

test("'χωρίς προσθήκη ζάχαρης' is a claim, not a free sugar", () => {
  const origin = splitSugarOrigin(
    parseIngredientList("Χωρίς προσθήκη ζάχαρης, Συστατικά: Χουρμάδες 50%, Αλάτι"),
    30,
  );

  assert.equal(origin.determined, true);
});

// --- The official Nutri-Score is untouched; only our score moves ---------------------

test("official points and grade are exactly the plain algorithm's, sugar points included", () => {
  for (const [table, list] of [
    [FEEL_GOOD_TABLE, FEEL_GOOD],
    [PEANUT_BUTTER_CRUNCH_TABLE, PEANUT_BUTTER_CRUNCH],
  ] as const) {
    const plain = computeNutriScore(nutriScoreInputFor(table));
    const { result, evaluation } = evaluateNutrition(table, null, list);

    assert.ok(plain.computable && result?.computable && evaluation);

    assert.equal(
      pointsOf(result.components, "sugars"),
      pointsOf(plain.components, "sugars"),
    );
    assert.equal(
      pointsOf(result.components, "energy"),
      pointsOf(plain.components, "energy"),
    );
    assert.equal(evaluation.grade, result.grade);
  }
});

test("Feel Good bar: the dates earn the fruit point; the sugars are half-weighted in our score only", () => {
  const { evaluation } = evaluateNutrition(FEEL_GOOD_TABLE, null, FEEL_GOOD);

  assert.ok(evaluation);

  // Official: 4 energy + 3 saturates + 8 sugars + 0 salt = 15 → protein not
  // counted; 15 − (5 fibre + 1 fruit) = 9 → C.
  assert.equal(evaluation.points, 9);
  assert.equal(evaluation.grade, "C");
  assert.equal(pointsOf(evaluation.components, "sugars"), 8);

  // Ours: 29.7 g × 0.5 = 14.85 g → 4 sugar points: 4 + 3 + 4 + 0 = 11 →
  // protein still off; 11 − 6 = 5 → C.
  assert.equal(INTRINSIC_SUGAR_WEIGHT, 0.5);
  assert.equal(evaluation.scoredGrade, "C");
});

test("Peanut Butter Crunch: official D, but mostly-fruit sugars lift our grade to C", () => {
  const { evaluation } = evaluateNutrition(
    PEANUT_BUTTER_CRUNCH_TABLE,
    null,
    PEANUT_BUTTER_CRUNCH,
  );

  assert.ok(evaluation);
  assert.equal(evaluation.grade, "D");
  assert.equal(evaluation.points, 13);
  assert.equal(evaluation.scoredGrade, "C");
});

test("the blended score is built from our grade, and says so in a notice", () => {
  const score = scoreFood({
    ingredientScore: CLEAN_INGREDIENT_SCORE,
    nutrition: PEANUT_BUTTER_CRUNCH_TABLE,
    nonNutritiveSweetener: false,
    ingredientText: PEANUT_BUTTER_CRUNCH,
    alcohol: null,
    notices: [],
  });

  // C = 60 → 0.6 × 60 + 0.4 × 100 (an official D = 40 would give 64).
  assert.equal(
    score.score,
    Math.round(NUTRITION_WEIGHT * 60 + INGREDIENTS_WEIGHT * 100),
  );
  assert.equal(score.composition?.nutrition?.grade, "D");
  assert.equal(score.composition?.nutrition?.scoredGrade, "C");
  assert.equal(score.nutritionEvaluation?.grade, "D");

  assert.ok(
    score.notices?.some(
      (notice) =>
        notice.code === "sugar_mostly_intrinsic" &&
        notice.title === "Η ζάχαρη προέρχεται κυρίως από φρούτα",
    ),
  );
});

test("added sugar keeps the full penalty: the same table with sugar in the list scores as before", () => {
  const withSugar = scoreFood({
    ingredientScore: CLEAN_INGREDIENT_SCORE,
    nutrition: PEANUT_BUTTER_CRUNCH_TABLE,
    nonNutritiveSweetener: false,
    ingredientText: "Ζάχαρη, Χουρμάδες 39,3%, Φιστικοβούτυρο, Αλάτι",
    alcohol: null,
    notices: [],
  });

  const noList = scoreFood({
    ingredientScore: CLEAN_INGREDIENT_SCORE,
    nutrition: PEANUT_BUTTER_CRUNCH_TABLE,
    nonNutritiveSweetener: false,
    alcohol: null,
    notices: [],
  });

  assert.equal(withSugar.score, noList.score);
  assert.equal(withSugar.nutritionEvaluation?.scoredGrade, "D");
  assert.equal(
    withSugar.notices?.some((notice) => notice.code === "sugar_mostly_intrinsic"),
    false,
  );
});

test("undetermined origin falls back to current behaviour and the evaluation says why", () => {
  const { evaluation } = evaluateNutrition(
    PEANUT_BUTTER_CRUNCH_TABLE,
    null,
    "Αλεύρι, Νερό, Αλάτι",
  );

  assert.equal(evaluation?.scoredGrade, evaluation?.grade);
  assert.deepEqual(evaluation?.sugarOrigin, {
    determined: false,
    reason: "no_fruit_listed",
  });
});

test("a nutrition-photo scan uses the list on the same photo, and only for these two reads", () => {
  const score = scoreNutritionOnly({
    evidence: PEANUT_BUTTER_CRUNCH_TABLE,
    alcohol: null,
    notices: [],
    text: PEANUT_BUTTER_CRUNCH,
    ocrConfidence: 0.9,
    analysis: {} as never,
    extractionConfidence: 0.9,
    ingredientText: ingredientListFromLabel(PEANUT_BUTTER_CRUNCH),
  });

  assert.equal(score.score, 60);
});
