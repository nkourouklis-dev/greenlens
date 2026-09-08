/**
 * Single shared "is there real, evaluable content here" decision, used by
 * the ingredients/nutrition/chemical_composition pipelines alike.
 *
 * Before this existed, each pipeline decided pass/fail on its own
 * `extraction.isValid` boolean, and the ingredients path additionally had a
 * third state — "valid, but on shaky evidence" — that proceeded to a full
 * score while also emitting a message telling the user the reading might be
 * unreliable. That third state is exactly the contradiction this module
 * removes: a caller either gets `passed: true` (safe to score and render a
 * verdict) or `passed: false` (render only `reasons`, nothing else). There
 * is no longer a state that does both.
 */

export interface ContentExtractionLike {
  isValid: boolean;
  confidence: number;
  reasons: string[];
}

export interface ContentGateResult {
  passed: boolean;
  confidence: number;
  reasons: string[];
}

/**
 * Minimum extraction confidence required to trust the result enough to
 * score it.
 *
 * Deliberately *not* 0.5. `worker/ocr.ts`'s readConfidence() falls back to
 * exactly 0.5 whenever the OCR/vision step's response omits a numeric
 * confidence — a common, not exceptional, case — and extractIngredientText
 * discounts that further for a with-heading match (`ocrConfidence * 0.98`,
 * capped at 0.95), landing at 0.49. A flat 0.5 threshold rejected that
 * exact, very common combination: a clear "Ingredients:" heading followed
 * by a fully valid list, with no signal actually wrong about the read. 0.45
 * sits below that floor with a small margin, while still rejecting the
 * weaker without-heading/override acceptances at the same OCR confidence
 * (their discount is steeper — `ocrConfidence * 0.8` or less — so they stay
 * gated, which is the behaviour this module exists to enforce). See
 * worker/analysisGating.test.ts's "clear heading + default OCR confidence"
 * regression case.
 */
export const MIN_CONTENT_CONFIDENCE = 0.45;

const DEFAULT_INSUFFICIENT_REASON =
  "Δεν εντοπίστηκε αρκετά αξιόπιστο περιεχόμενο σε αυτή τη φωτογραφία. Ξαναφωτογράφισε την ετικέτα.";

export function evaluateContentGate(
  extraction: ContentExtractionLike,
  minConfidence: number = MIN_CONTENT_CONFIDENCE,
): ContentGateResult {
  if (!extraction.isValid) {
    return {
      passed: false,
      confidence: extraction.confidence,
      reasons:
        extraction.reasons.length > 0
          ? extraction.reasons
          : [DEFAULT_INSUFFICIENT_REASON],
    };
  }

  if (extraction.confidence < minConfidence) {
    return {
      passed: false,
      confidence: extraction.confidence,
      reasons: [DEFAULT_INSUFFICIENT_REASON],
    };
  }

  return {
    passed: true,
    confidence: extraction.confidence,
    reasons: [],
  };
}
