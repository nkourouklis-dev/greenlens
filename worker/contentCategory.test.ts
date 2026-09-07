import assert from "node:assert/strict";
import test from "node:test";
import { detectContentCategoryHeuristic } from "./contentCategory";

const ingredientsSamples = [
  "Συστατικά: Aqua, Glycerin, Cetearyl Alcohol, Parfum, Linalool, Sodium Benzoate",
  "Ingredients: Water, Sodium Lauryl Sulfate, Cocamidopropyl Betaine, Citric Acid, Fragrance",
  "INCI: Aqua, Glycerin, Phenoxyethanol, Tocopheryl Acetate, Citric Acid",
  "Σύνθεση: Νερό, Αιθυλική Αλκοόλη, Άρωμα, Κιτρικό Οξύ, Χρωστική",
  "Ingredient list: Wheat flour, Sugar, Palm oil, Cocoa, Salt, Yeast, Emulsifier E322",
  "Περιέχει: Ζάχαρη, Κακάο, Γάλα σε σκόνη, Λεκιθίνη σόγιας, Βανιλίνη, Αλάτι",
  "Ingredienti: Farina di grano, Zucchero, Olio di palma, Sale, Lievito",
  "Zutaten: Wasser, Glycerin, Parfum, Citronensäure, Natriumbenzoat",
  "Composition: Sodium Hypochlorite, Sodium Hydroxide, Surfactants, Fragrance, Water",
  "Ingredients: Aqua, Sodium Chloride, Cocamidopropyl Betaine, Parfum, Benzyl Alcohol",
];

const nutritionSamples = [
  "Διατροφικές πληροφορίες ανά 100g: Ενέργεια 450kcal, Πρωτεΐνες 12g, Λιπαρά 20g, Υδατάνθρακες 55g, Σάκχαρα 30g, Φυτικές ίνες 3g, Αλάτι 1.2g",
  "Nutrition Facts per 100g: Energy 200kcal, Protein 5g, Fat 10g, Carbohydrate 25g, Sugars 12g, Fibre 2g, Salt 0.5g",
  "Ενέργεια: 1500kJ/350kcal Πρωτεΐνες: 8g Λιπαρά: 15g εκ των οποίων κορεσμένα 6g Υδατάνθρακες: 40g εκ των οποίων σάκχαρα 20g",
  "Nutritional information: Energy 100kcal, Fat 2g, Saturates 1g, Carbohydrate 15g, Sugar 5g, Protein 3g, Salt 0.3g. Contains E102, E110",
  "Διατροφική δήλωση ανά 100ml: Ενέργεια 45kcal, Πρωτεΐνες 3.4g, Υδατάνθρακες 4.8g εκ των οποίων σάκχαρα 4.8g, Λιπαρά 1.5g",
  "Per serving (30g): Calories 120, Protein 3g, Total Fat 4g, Total Carbohydrate 20g, Sugars 8g, Dietary Fiber 2g",
  "Θερμίδες 250 ανά μερίδα, Πρωτεΐνες 6g, Λιπαρά 9g, Υδατάνθρακες 35g εκ των οποίων σάκχαρα 18g, Φυτικές ίνες 2g",
  "Nutrition declaration per 100g: Energy 380kcal, Protein 25g, Fat 18g, Carbohydrate 30g, Sugars 4g, Fibre 5g, Salt 1g",
];

const chemicalSamples = [
  "Χημική Ανάλυση: Ca 78 mg/L, Mg 24 mg/L, Na 12 mg/L, K 1.5 mg/L, SO4 45 mg/L, NO3 8 mg/L, Cl 15 mg/L, Ολική Σκληρότητα 22 γαλλικοί βαθμοί",
  "Water analysis: pH 7.2, Conductivity 450 µS/cm, Ca 60 mg/L, Mg 15 mg/L, HCO3 180 mg/L",
  "Τυπική Χημική Ανάλυση Εμφιαλωμένου Νερού: Νάτριο (Na) 5.5 mg/L, Ασβέστιο (Ca) 12 mg/L, Μαγνήσιο (Mg) 3.2 mg/L, Θειικά (SO4) 6 mg/L, Νιτρικά (NO3) 3.8 mg/L, pH 7.5",
  "Typical analysis per litre: Calcium 45mg, Magnesium 10mg, Sodium 8mg, Potassium 1mg, Sulphate 20mg, Nitrate 4mg, Chloride 12mg, pH 7.6, Hardness 18°dH",
  "Σκληρότητα νερού: 15 γαλλικοί βαθμοί. Αγωγιμότητα: 380 µS/cm. Ca 40 mg/L. Mg 8 mg/L.",
  "Ανάλυση νερού βρύσης: Cl 0.3 mg/L, NO2 0.01 mg/L, NO3 5 mg/L, Pb 0.01 mg/L, Cd 0.001 mg/L, As 0.005 mg/L",
  "Mineral analysis: Ca 22 mg/L, Mg 8 mg/L, Na 6 mg/L, HCO3 65 mg/L, TDS 180 mg/L",
  "Βαρέα μέταλλα: Pb 0.002 mg/L, Cd 0.0005 mg/L, Hg 0.0001 mg/L. Ολική σκληρότητα 12°dH, Ca 30 mg/L, Mg 9 mg/L",
];

const unknownSamples = [
  "Καλή διατήρηση σε δροσερό και σκιερό μέρος. Παρασκευάζεται στην Ελλάδα.",
  "Made in Greece. www.example.com. Distributed by ACME Ltd. Tel: 210-1234567.",
  "Το αγαπημένο προϊόν της οικογένειάς σας, τώρα σε νέα συσκευασία!",
  "Ανακυκλώστε τη συσκευασία. Φυλάσσετε μακριά από παιδιά.",
];

for (const [index, text] of ingredientsSamples.entries()) {
  test(`heuristic detects ingredients sample ${index + 1}`, () =>
    assert.equal(
      detectContentCategoryHeuristic(text).category,
      "ingredients",
    ));
}

for (const [index, text] of nutritionSamples.entries()) {
  test(`heuristic detects nutrition sample ${index + 1}`, () =>
    assert.equal(
      detectContentCategoryHeuristic(text).category,
      "nutrition",
    ));
}

for (const [index, text] of chemicalSamples.entries()) {
  test(`heuristic detects chemical_composition sample ${index + 1}`, () =>
    assert.equal(
      detectContentCategoryHeuristic(text).category,
      "chemical_composition",
    ));
}

for (const [index, text] of unknownSamples.entries()) {
  test(`heuristic returns unknown for ambiguous sample ${index + 1}`, () =>
    assert.equal(
      detectContentCategoryHeuristic(text).category,
      "unknown",
    ));
}

test("returns unknown for empty text", () =>
  assert.equal(detectContentCategoryHeuristic("").category, "unknown"));

test("heuristic result carries source 'heuristic'", () =>
  assert.equal(
    detectContentCategoryHeuristic(ingredientsSamples[0]).source,
    "heuristic",
  ));
