import assert from "node:assert/strict";
import test from "node:test";
import {
  extractIngredientText,
} from "./ingredientText";

// Test 1: Greek heading inline
test("extracts Greek heading with inline ingredients", () => {
  const text =
    "Συστατικά: νερό, ζάχαρη, αλάτι";
  const result = extractIngredientText(text, 0.95);
  assert(result.isValid);
  assert.equal(result.labelType, "ingredients");
  assert(result.ingredientText?.includes("νερό"));
});

// Test 2: English heading and next line
test("extracts English heading with ingredients on next line", () => {
  const text =
    "INGREDIENTS\nWater, sugar, citric acid";
  const result = extractIngredientText(text, 0.95);
  assert(result.isValid);
  assert.equal(result.labelType, "ingredients");
  assert(result.ingredientText?.includes("Water"));
});

// Test 3: INCI cosmetic list
test("extracts INCI cosmetic ingredient list", () => {
  const text =
    "INCI: Aqua, Glycerin, Cetearyl Alcohol, Parfum";
  const result = extractIngredientText(text, 0.95);
  assert(result.isValid);
  assert.equal(result.labelType, "ingredients");
});

// Test 4: Cleaning composition with Greek
test("extracts cleaning product composition", () => {
  const text =
    "Σύνθεση: <5% ανιονικά τασιενεργά, άρωμα, συντηρητικό";
  const result = extractIngredientText(text, 0.95);
  assert(result.isValid);
  assert.equal(result.labelType, "ingredients");
});

// Test 5: Mixed ingredients and nutrition
test("detects mixed section with ingredients and nutrition", () => {
  const text =
    "Συστατικά: νερό, ζάχαρη\nDietary information:\nEnergy: 100 kcal";
  const result = extractIngredientText(text, 0.95);
  assert(result.isValid);
  assert.equal(result.labelType, "mixed");
  assert(result.ingredientText?.includes("νερό"));
  assert(!result.ingredientText?.includes("Energy"));
});

// Test 6: Nutrition table only
test("rejects nutrition-only table", () => {
  const text =
    "Per 100g\nEnergy: 100 kcal\nProtein: 5g\nFat: 3g";
  const result = extractIngredientText(text, 0.95);
  assert(!result.isValid);
  assert.equal(result.labelType, "nutrition");
});

// Test 7: Website text only
test("rejects website/contact information", () => {
  const text = "vikos.com\nwww.example.com\nTel: +30 210 1234567";
  const result = extractIngredientText(text, 0.95);
  assert(!result.isValid);
  assert(
    result.reasons.some((r) =>
      r.includes("θόρυβος"),
    ),
  );
});

// Test 8: Real bad OCR example
test("rejects real OCR failure with noise", () => {
  const text =
    "L17 4.68\n" +
    "Συνιστάται η φυλακη\n" +
    "δροσερό μαζί και από δομές\n" +
    "vikos.com\n" +
    "SUITABLE FOR A LOW SODIUM DIET\n" +
    "ΨΗΣΤΑ ΣΕ ΑΛΑΤΑ";
  const result = extractIngredientText(text, 0.95);
  assert(!result.isValid);
  assert.equal(result.labelType, "unknown");
});

// Test 9: Comma-separated without heading
test("accepts comma-separated list without heading if strong signals", () => {
  const text = "Water, glycerin, alcohol, oil, extract";
  const result = extractIngredientText(text, 0.95);
  assert(result.isValid);
  assert.equal(result.labelType, "ingredients");
});

// Test 10: Single word "SODIUM"
test("rejects single word 'sodium'", () => {
  const text = "SODIUM";
  const result = extractIngredientText(text, 0.95);
  assert(!result.isValid);
});

// Test 11: Claim text
test("rejects marketing claim text", () => {
  const text =
    "SUITABLE FOR A LOW SODIUM DIET\nWITH A LOW CONTENT IN MINERALS";
  const result = extractIngredientText(text, 0.95);
  assert(!result.isValid);
  assert(
    result.reasons.some((r) =>
      r.includes("marketing"),
    ),
  );
});

// Test 12: Storage instructions
test("rejects storage-only text", () => {
  const text =
    "Keep in cool place\nAway from heat and moisture\nStore at room temperature";
  const result = extractIngredientText(text, 0.95);
  assert(!result.isValid);
});

// Test 13: Empty text
test("rejects empty text", () => {
  const text = "";
  const result = extractIngredientText(text, 0.95);
  assert(!result.isValid);
});

// Test 14: Heading only
test("rejects heading-only text", () => {
  const text = "Συστατικά";
  const result = extractIngredientText(text, 0.95);
  assert(!result.isValid);
});

// Test 15: Mojibake and garbled OCR
test("rejects garbled/mojibake text without ingredient markers", () => {
  const text =
    "BAene oruAn. Organ PES\nKaraMnAn via no buo\nKATA AHA MEXA TE";
  const result = extractIngredientText(text, 0.95);
  assert(!result.isValid);
});

// Test 16: Heading with clear stop at nutrition section
test("stops at nutrition section boundary", () => {
  const text =
    "Ingredients: Water, Sugar, Salt\n\nNutrition Facts\nEnergy: 100 kcal";
  const result = extractIngredientText(text, 0.95);
  assert(result.isValid);
  assert(result.ingredientText?.includes("Water"));
  assert(!result.ingredientText?.includes("Energy"));
});

// Test 17: No accents but Greek still works
test("works with Greek text without accents", () => {
  const text = "Συστατικα: νερο, ζαχαρη, αλατι";
  const result = extractIngredientText(text, 0.95);
  assert(result.isValid);
  assert.equal(result.labelType, "ingredients");
});

// Test 18: Multiline list without heading
test("accepts well-structured multiline list without heading", () => {
  const text = "Water\nGlycerin\nAlcohol\nOil\nExtract";
  const result = extractIngredientText(text, 0.95);
  assert(result.isValid);
  assert.equal(result.labelType, "ingredients");
});

// Test 19: Confidence adjustment with heading
test("uses proper confidence with heading", () => {
  const text = "Συστατικά: νερό, ζάχαρη";
  const result = extractIngredientText(text, 1.0);
  assert(result.isValid);
  assert(result.confidence <= 0.95);
  assert(result.confidence >= 0.9);
});

// Test 20: Confidence adjustment without heading
test("uses lower confidence without heading", () => {
  const text = "Water, glycerin, alcohol, oil, extract";
  const result = extractIngredientText(text, 1.0);
  assert(result.isValid);
  assert(result.confidence <= 0.85);
  assert(result.confidence >= 0.7);
});

// Test 21: Very short heading match but enough content
test("accepts content after heading even if heading is short", () => {
  const text =
    "INCI: Aqua, Glycerin, Alcohol, Cetearyl, Parfum";
  const result = extractIngredientText(text, 0.95);
  assert(result.isValid);
});

// Test 22: Mixed Greek and English
test("handles mixed Greek and English text", () => {
  const text =
    "Συστατικά / Ingredients: νερό / Water, ζάχαρη / Sugar";
  const result = extractIngredientText(text, 0.95);
  assert(result.isValid);
});

// Test 23: URL with valid ingredients after
test("accepts valid ingredients even if URL is present, if ingredients dominate", () => {
  const text =
    "Ingredients: Water, Sugar, Salt, Oil\nMore info: www.example.com";
  const result = extractIngredientText(text, 0.95);
  assert(result.isValid);
  assert(
    !result.ingredientText?.includes("example.com"),
  );
});
