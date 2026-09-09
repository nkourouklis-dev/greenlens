import assert from "node:assert/strict";
import test from "node:test";
import { extractIngredientText } from "./ingredientText";
import { parseAnalysis } from "./analysis";
import { classifyAllergenFindings, withoutAllergenOnlyItems } from "./allergens";
import { scoreInterpretation } from "./scoring";

/**
 * Golden/regression scans: real-shaped label text run through the same
 * sequence worker/index.ts uses in production (extractIngredientText ->
 * parseAnalysis -> classifyAllergenFindings -> scoreInterpretation), pinned
 * to a known-good outcome. Unlike the unit tests in scoring.test.ts (which
 * exercise scoreInterpretation with hand-built findings), these catch bugs
 * that only show up when the full pipeline runs end to end.
 *
 * Only the AI model call itself is stubbed out, with a hand-written
 * response shaped like what the model actually returned for this product,
 * since these tests must run offline and deterministically.
 */

const HERBARIUM_OCR_TEXT = `HERBARIUM
Αντισηπτικό Τζελ Χεριών με Αιθυλική Αλκοόλη 70% vol

Σύνθεση: Alcohol Denat. (Αιθυλική Αλκοόλη) 70% vol, Aqua, Glycerin, Carbomer, Triethanolamine, Parfum, Linalool, Aloe Barbadensis Leaf Juice, Tocopheryl Acetate

Προειδοποίηση: Εύφλεκτο. Κρατήστε μακριά από παιδιά και φλόγες.`;

// Barcode 5202399414023 — the product from the reported bug: a 70% ethanol
// hand antiseptic gel that got docked -4 for the ethanol content but *also*
// received the +5 "no problematic ingredients" bonus in the same score
// breakdown, because that bonus only checked for E-number-pattern matches
// instead of "any deduction at all". A good regression fixture precisely
// because it carries three distinct kinds of finding at once: a declared
// EU cosmetic fragrance allergen (Linalool, informational), an active
// ingredient with a real, evidence-light deduction (the ethanol
// concentration), and separate benefit ingredients (Glycerin, Aloe) — so it
// exercises the allergen layer, the deduction path and the bonus path
// together instead of in isolation.
const HERBARIUM_MODEL_RESPONSE = {
  productType: "cosmetic",
  summary:
    "Αντισηπτικό τζελ χεριών με βάση την αιθυλική αλκοόλη (70%), με ενυδατικά συστατικά και δηλωμένο άρωμα.",
  positives: [
    "Περιέχει ενυδατικά συστατικά (Glycerin, Aloe Barbadensis)",
    "Χωρίς τεχνητές χρωστικές",
  ],
  attentionItems: ["Υψηλή περιεκτικότητα σε αιθυλική αλκοόλη (70%)"],
  potentialAllergens: ["Linalool"],
  insufficientDataReasons: [],
  confidence: 0.9,
  ingredientFindings: [
    {
      ingredientName: "Alcohol Denat. (Αιθυλική Αλκοόλη)",
      normalizedName: "ethanol",
      severity: "attention",
      title: "Υψηλή περιεκτικότητα σε αιθυλική αλκοόλη (70%)",
      explanation:
        "Μπορεί να προκαλέσει ξηρότητα ή ερεθισμό στο δέρμα με συχνή χρήση.",
      evidenceType: "none",
      sourceName: null,
      sourceUrl: null,
      confidence: 0.85,
    },
    {
      ingredientName: "Linalool",
      normalizedName: "linalool",
      severity: "info",
      title: "Δηλωμένο αλλεργιογόνο αρώματος",
      explanation:
        "Αρωματικό συστατικό που πρέπει να δηλώνεται βάσει κανονισμού καλλυντικών της ΕΕ.",
      evidenceType: "label",
      sourceName: null,
      sourceUrl: null,
      confidence: 0.9,
    },
    {
      ingredientName: "Glycerin",
      normalizedName: "glycerin",
      severity: "positive",
      title: "Καλά τεκμηριωμένο ενυδατικό",
      explanation: "Ευρέως χρησιμοποιούμενο, ασφαλές ενυδατικό συστατικό.",
      evidenceType: "scientific",
      sourceName: null,
      sourceUrl: null,
      confidence: 0.9,
    },
    {
      ingredientName: "Aloe Barbadensis Leaf Juice",
      normalizedName: "aloe barbadensis leaf juice",
      severity: "positive",
      title: "Καταπραϋντική δράση",
      explanation: "Καταπραϋντικό και ενυδατικό εκχύλισμα για το δέρμα.",
      evidenceType: "scientific",
      sourceName: null,
      sourceUrl: null,
      confidence: 0.85,
    },
  ],
};

test("herbarium hand antiseptic gel (70% ethanol, EAN 5202399414023): extraction accepts the ingredient block", () => {
  const extraction = extractIngredientText(HERBARIUM_OCR_TEXT, 0.9);

  assert.equal(extraction.isValid, true);
  assert.ok(extraction.ingredientText?.includes("Alcohol Denat."));
  assert.ok(extraction.ingredientText?.includes("Aqua"));
  // The warning line after the blank line must not leak into the
  // ingredient block.
  assert.ok(!extraction.ingredientText?.includes("Εύφλεκτο"));
});

test("herbarium hand antiseptic gel: ethanol is flagged with a deduction, no no-problems bonus, score is not a fake 100/100", () => {
  const extraction = extractIngredientText(HERBARIUM_OCR_TEXT, 0.9);
  assert.equal(extraction.isValid, true);

  const result = parseAnalysis(JSON.stringify(HERBARIUM_MODEL_RESPONSE));
  assert.ok(result, "expected the model response to parse");
  if (!result) {
    return;
  }

  // Same step worker/index.ts runs before scoring: fold declared-allergen
  // findings into information, never a deduction.
  const allergens = classifyAllergenFindings(
    result.ingredientFindings,
    (finding) => finding.ingredientName,
    result.potentialAllergens,
  );
  result.ingredientFindings = allergens.findings;
  result.attentionItems = withoutAllergenOnlyItems(result.attentionItems);

  assert.ok(allergens.notice, "expected an allergen notice for Linalool");

  const score = scoreInterpretation(
    extraction.ingredientText ?? "",
    0.9,
    result,
    { extractionConfidence: extraction.confidence },
  );

  // (a) the ethanol content is flagged with a real deduction.
  assert.equal(score.deductions.length, 1);
  assert.equal(score.deductions[0].code, "attention:ethanol");
  assert.equal(score.deductions[0].points, 8);

  // (b) no "no problematic ingredients" bonus alongside that deduction —
  // this is the exact contradiction the bug report described.
  assert.ok(
    !score.bonuses.some((bonus) => bonus.label.includes("προβληματικά")),
    "did not expect the no-problems bonus next to an active deduction",
  );

  // The unrelated "multiple positives" bonus is still allowed to coexist
  // with a deduction — that's not a contradiction, a product can have both
  // good and bad aspects at once.
  assert.ok(
    score.bonuses.some((bonus) => bonus.label.includes("θετικά")),
  );

  // (c) the final score reflects the deduction instead of being clamped
  // back up to a misleading 100/100. Before the fix this computed to
  // 100 - 4 + 3 (positives) + 5 (wrongly-awarded no-problems bonus) = 104,
  // clamped to a perfect 100 that hid the contradiction entirely.
  assert.equal(score.score, 95);
  assert.notEqual(score.score, 100);
});
