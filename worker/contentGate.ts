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
 * score it. Chosen as the midpoint of the 0-1 scale: below it, the
 * evidence for "this really is real content" is weaker than the evidence
 * against, so the honest answer is "not sure" rather than a scored verdict.
 */
export const MIN_CONTENT_CONFIDENCE = 0.5;

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
