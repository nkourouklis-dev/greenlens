import {
  blockingReasonsFor,
  deductionsFromModelSeverities,
  deductionsFromRules,
  finalizeScore,
  insufficientDataScore,
  type WorkerScore,
} from "./scoring";
import type { RuleMatch } from "./ingredientRules";
import type { WorkerChemicalResult } from "./chemicalAnalysis";

const MIN_TEXT_LENGTH = 10;

/**
 * A chemical composition label is a list of substances, exactly like an
 * ingredient list, so it scores through the same curated rule table rather
 * than through whatever severity the model attached to each finding — see
 * ingredientRules.ts for why that swap was necessary.
 *
 * The steps shared with the other content categories (insufficient-data
 * result, model-severity fallback, bonuses, clamp and band) live in
 * scoring.ts.
 */
export function scoreChemicalComposition(
  text: string,
  ocrConfidence: number,
  analysis: WorkerChemicalResult,
  options?: {
    extractionConfidence?: number;
    lowConfidenceReason?: string | null;
    ruleMatches?: RuleMatch[];
  },
): WorkerScore {
  const lowConfidenceReason = options?.lowConfidenceReason ?? null;

  const confidence = Math.min(
    ocrConfidence,
    options?.extractionConfidence ?? 1,
    analysis.confidence,
  );

  const blockingReasons = blockingReasonsFor({
    text,
    minTextLength: MIN_TEXT_LENGTH,
    shortTextReason: "Δεν υπάρχει επαρκής χημική ανάλυση.",
    ocrConfidence,
    findingCount: analysis.chemicalFindings.length,
    noFindingsReason:
      "Δεν εντοπίστηκαν αξιολογήσιμες συγκεντρώσεις στοιχείων/ενώσεων.",
  });

  if (blockingReasons.length > 0) {
    return insufficientDataScore({
      confidence,
      lowConfidenceReason,
      blockingReasons,
      modelReasons: analysis.insufficientDataReasons,
    });
  }

  const ruleMatches = options?.ruleMatches ?? [];

  const deductions =
    ruleMatches.length > 0
      ? deductionsFromRules(ruleMatches)
      : deductionsFromModelSeverities(analysis.chemicalFindings);

  return finalizeScore({
    deductions,
    positivesCount: analysis.positives.length,
    positivesBonusLabel: "Πολλαπλά θετικά χαρακτηριστικά σύστασης",
    noProblemsBonusLabel: "Δεν εντοπίστηκαν αποκλίσεις από όρια ασφαλείας",
    confidence,
    lowConfidenceReason,
  });
}
