import assert from "node:assert/strict";
import test from "node:test";
import { extractIngredientText } from "./ingredientText";
import { evaluateContentGate } from "./contentGate";
import { filterIrrelevantSegments } from "./contentFilter";
import { parseAnalysis } from "./analysis";
import {
  classifyAllergenFindings,
  withoutAllergenOnlyItems,
} from "./allergens";
import { scoreInterpretation } from "./scoring";

/**
 * End-to-end gating scenarios exercising the exact sequence
 * worker/index.ts's analyzeIngredientsCore runs (extractIngredientText ->
 * evaluateContentGate -> filterIrrelevantSegments -> [AI] ->
 * scoreInterpretation), without stubbing the AI call except where a scored
 * result is actually needed. These pin down the single-decision-point
 * contract: a scan either passes the gate and gets a full score, or it
 * fails the gate and gets only the reasons — never both, and never a score
 * built from unfiltered noise.
 */

test("no real content on the label: gate fails, no score would ever be computed", () => {
  const noiseOnlyText = `
    Keep in a cool, dry place away from direct sunlight.
    Best before date printed on the base of the package.
    www.example.com
  `;

  const extraction = extractIngredientText(noiseOnlyText, 0.9);
  assert.equal(extraction.isValid, false);

  const gate = evaluateContentGate(extraction);

  assert.equal(gate.passed, false);
  assert.ok(gate.reasons.length > 0);
  // The caller (analyzeIngredientsCore) returns before ever building a
  // prompt or calling scoreInterpretation on this path — there is nothing
  // downstream of `gate.passed === false` to assert on, that is the point.
});

test("OCR noise mixed with real ingredients: noise is filtered out, real ingredients are still scored", () => {
  const ocrText = [
    "HERBARIUM",
    "Αντισηπτικό Τζελ Χεριών",
    "",
    "Σύνθεση: Aqua, Glycerin, Made in EU, Parfum, Tocopheryl Acetate",
  ].join("\n");

  const extraction = extractIngredientText(ocrText, 0.92);
  assert.equal(extraction.isValid, true);

  const gate = evaluateContentGate(extraction);
  assert.equal(gate.passed, true);

  // The deterministic heading-based extractor does not itself strip
  // manufacturer/origin boilerplate that appears after the heading — that
  // is exactly the noise this filter step exists to remove.
  assert.ok(extraction.ingredientText?.includes("Made in EU"));

  const filtered = filterIrrelevantSegments(
    extraction.ingredientText ?? "",
    "ingredients",
  );

  assert.ok(!filtered.text.includes("Made in EU"));
  assert.ok(filtered.text.includes("Aqua"));
  assert.ok(filtered.text.includes("Glycerin"));
  assert.ok(filtered.text.includes("Parfum"));
  assert.ok(filtered.text.includes("Tocopheryl Acetate"));

  // The cleaned text is what actually reaches the model in production;
  // simulate its response using only the real ingredients that survived
  // filtering, then confirm scoring proceeds normally from there.
  const modelResponse = {
    productType: "cosmetic" as const,
    summary: "Τζελ με βάση νερό, με ενυδατικά συστατικά.",
    positives: ["Χωρίς προβληματικά συστατικά"],
    attentionItems: [],
    potentialAllergens: [],
    insufficientDataReasons: [],
    confidence: 0.85,
    ingredientFindings: [
      {
        ingredientName: "Aqua",
        normalizedName: "aqua",
        severity: "info" as const,
        title: "Βάση",
        explanation: "Διαλύτης βάσης.",
        evidenceType: "none" as const,
        sourceName: null,
        sourceUrl: null,
        confidence: 0.9,
      },
      {
        ingredientName: "Glycerin",
        normalizedName: "glycerin",
        severity: "positive" as const,
        title: "Ενυδατικό",
        explanation: "Καλά τεκμηριωμένο ενυδατικό.",
        evidenceType: "scientific" as const,
        sourceName: null,
        sourceUrl: null,
        confidence: 0.9,
      },
    ],
  };

  const result = parseAnalysis(JSON.stringify(modelResponse));
  assert.ok(result);
  if (!result) return;

  const allergens = classifyAllergenFindings(
    result.ingredientFindings,
    (finding) => finding.ingredientName,
    result.potentialAllergens,
  );
  result.ingredientFindings = allergens.findings;
  result.attentionItems = withoutAllergenOnlyItems(result.attentionItems);

  const score = scoreInterpretation(extraction.ingredientText ?? "", 0.92, result, {
    extractionConfidence: gate.confidence,
    lowConfidenceReason: null,
  });

  assert.notEqual(score.score, null);
  assert.equal(score.band, "excellent");
});

// Regression: a real-shaped INCI list (28 ingredients) behind a clear
// "Ingredients:" heading was being rejected by evaluateContentGate. Root
// cause was MIN_CONTENT_CONFIDENCE (0.5) being tighter than
// extractIngredientText's with-heading confidence formula
// (ocrConfidence * 0.98, capped at 0.95) at ocrConfidence values that are
// common in production — in particular worker/ocr.ts's readConfidence()
// default of exactly 0.5 for a response that omits a confidence field,
// which yields extraction.confidence 0.49, just under the old 0.5
// threshold. Fixed by lowering MIN_CONTENT_CONFIDENCE to 0.45. This test
// pins the exact reported ingredient list to the gate at that default OCR
// confidence, plus the two other hypotheses investigated (the noise filter
// stripping real ingredients, and heading detection failing when a product
// description sits directly above the heading).
const SHEA_BUTTER_HAND_CREAM_INGREDIENTS =
  "Aqua, Glycerin, Cetearyl Alcohol, Cetearyl Ethylhexanoate, " +
  "Isohexadecane, Alcohol, Sorbitol, Butyrospermum Parkii (Shea) Butter, " +
  "Dimethicone, Sodium Cetearyl Sulfate, Phenoxyethanol, Rosa Centifolia " +
  "Flower Extract, Citric Acid, Panthenol, Tocopheryl Acetate, Allantoin, " +
  "Benzyl Alcohol, Sodium Hydroxide, Sodium Lactate, Serine, Lactic Acid, " +
  "Urea, Glycine, Linalool, Hexyl Cinnamal, Citronellol, " +
  "Alpha-Isomethyl Ionone, Parfum";

test("regression: clear heading + valid INCI list passes the gate at the default (0.5) OCR confidence", () => {
  const labelText =
    "Nourishing Hand Cream with Shea Butter\n" +
    "For dry and sensitive skin.\n\n" +
    "Ingredients: " +
    SHEA_BUTTER_HAND_CREAM_INGREDIENTS;

  // 0.5 is worker/ocr.ts's readConfidence() fallback when the OCR/vision
  // step's response doesn't carry a numeric confidence — not an edge case,
  // the common one.
  const defaultOcrConfidence = 0.5;

  const extraction = extractIngredientText(labelText, defaultOcrConfidence);

  assert.equal(extraction.isValid, true);
  assert.equal(extraction.labelType, "ingredients");
  // The description line above the heading must not defeat heading
  // detection or leak into the isolated block.
  assert.ok(!extraction.ingredientText?.includes("Nourishing Hand Cream"));
  assert.ok(extraction.ingredientText?.includes("Aqua"));
  assert.ok(extraction.ingredientText?.includes("Parfum"));

  const gate = evaluateContentGate(extraction);
  assert.equal(
    gate.passed,
    true,
    `expected the gate to pass at the default OCR confidence, got reasons: ${gate.reasons.join(" ")}`,
  );

  // None of the 28 real ingredient names should be mistaken for brand text,
  // legal/origin boilerplate, or a meaningless short code.
  const filtered = filterIrrelevantSegments(
    extraction.ingredientText ?? "",
    "ingredients",
    { productTitle: "Nourishing Hand Cream with Shea Butter" },
  );

  assert.deepEqual(filtered.removedSegments, []);
  for (const ingredient of [
    "Aqua",
    "Glycerin",
    "Cetearyl Alcohol",
    "Isohexadecane",
    "Alcohol",
    "Sorbitol",
    "Dimethicone",
    "Phenoxyethanol",
    "Citric Acid",
    "Panthenol",
    "Tocopheryl Acetate",
    "Allantoin",
    "Benzyl Alcohol",
    "Sodium Hydroxide",
    "Sodium Lactate",
    "Serine",
    "Lactic Acid",
    "Urea",
    "Glycine",
    "Linalool",
    "Hexyl Cinnamal",
    "Citronellol",
    "Alpha-Isomethyl Ionone",
    "Parfum",
  ]) {
    assert.ok(
      filtered.text.includes(ingredient),
      `expected "${ingredient}" to survive filtering`,
    );
  }
});

test("regression: the same INCI list also passes at a range of realistic OCR confidences", () => {
  for (const ocrConfidence of [0.5, 0.6, 0.75, 0.9]) {
    const extraction = extractIngredientText(
      "Ingredients: " + SHEA_BUTTER_HAND_CREAM_INGREDIENTS,
      ocrConfidence,
    );
    const gate = evaluateContentGate(extraction);

    assert.equal(
      gate.passed,
      true,
      `expected pass at ocrConfidence=${ocrConfidence}, extraction.confidence=${extraction.confidence}`,
    );
  }
});

test("genuine low-resolution/unreadable text: gate fails on low confidence, no score", () => {
  // No heading, so extraction relies on the weaker without-heading path,
  // and a poor OCR confidence (simulating a blurry/low-res photo) pulls the
  // resulting extraction confidence below the gate threshold even though
  // the structural checks pass.
  const lowResText = "Aqua, Glycerin, Sodium Chloride, Citric Acid";
  const poorOcrConfidence = 0.5;

  const extraction = extractIngredientText(lowResText, poorOcrConfidence);
  assert.equal(extraction.isValid, true);
  assert.ok(
    extraction.confidence < 0.5,
    `expected low extraction confidence, got ${extraction.confidence}`,
  );

  const gate = evaluateContentGate(extraction);

  assert.equal(gate.passed, false);
  assert.ok(gate.reasons.length > 0);
  // As with the no-content case, analyzeIngredientsCore returns here with
  // only `gate.reasons` to show — scoreInterpretation is never reached.
});
