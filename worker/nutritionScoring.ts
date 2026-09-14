import {
  blockingReasonsFor,
  deductionsFromModelSeverities,
  deductionsFromThresholds,
  finalizeScore,
  insufficientDataScore,
  MAX_DEDUCTION_COUNT,
  type WorkerScore,
} from "./scoring";
import { isAllergenDeclarationOnly } from "./allergens";
import {
  bonusesFor,
  isBeverageTable,
  readNutrients,
} from "./nutritionThresholds";
import { readNutritionPanel } from "./nutritionPanel";
import type { WorkerNutritionResult } from "./nutritionAnalysis";

const MIN_TEXT_LENGTH = 15;

/**
 * Scores the declared quantities against published thresholds rather than
 * the severities the model attached to each row — the nutrition equivalent
 * of the rule table the ingredients path moved to. See
 * nutritionThresholds.ts for the bands and why beverages get their own.
 *
 * Rows the panel declares without a readable amount still fall back to the
 * model's severity, so a table the parser only partly understands is scored
 * on what it did understand instead of coming back blank.
 *
 * The steps shared with the other content categories (insufficient-data
 * result, model-severity fallback, bonuses, clamp and band) live in
 * scoring.ts.
 */
export function scoreNutrition(
  text: string,
  ocrConfidence: number,
  analysis: WorkerNutritionResult,
  options?: {
    extractionConfidence?: number;
    lowConfidenceReason?: string | null;
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
    shortTextReason: "Δεν υπάρχει επαρκής διατροφικός πίνακας.",
    ocrConfidence,
    findingCount: analysis.nutritionFindings.length,
    noFindingsReason: "Δεν εντοπίστηκαν αξιολογήσιμα διατροφικά στοιχεία.",
  });

  if (blockingReasons.length > 0) {
    return insufficientDataScore({
      confidence,
      lowConfidenceReason,
      blockingReasons,
      modelReasons: analysis.insufficientDataReasons,
    });
  }

  // Same rule as the ingredients path (worker/scoring.ts): a declared EU
  // allergen is information, never a deduction.
  const scorableFindings = analysis.nutritionFindings.filter(
    (finding) => !isAllergenDeclarationOnly(finding, finding.nutrient),
  );

  // Read the panel text directly first. The model is asked to copy each
  // amount "exactly as printed" and does not: on a real date bar it
  // returned 8g of sugar for a label reading 33,7g, 5g of salt for 0,5g and
  // 2g of protein for 20,2g — every digit-dropping error in a different
  // direction, and the score built on them was wrong in both directions at
  // once. The deterministic reader (nutritionPanel.ts) parses the same text
  // and cross-checks the result against the declared energy before a single
  // point is charged.
  //
  // Its amounts fall back to the model's only when it cannot read the table
  // at all, so nothing that scores today stops scoring.
  const panel = readNutritionPanel(text);

  const readings =
    panel?.readings ?? readNutrients(scorableFindings);

  const isBeverage = panel?.isBeverage ?? isBeverageTable(text);

  const thresholdDeductions = deductionsFromThresholds(
    readings,
    isBeverage,
  );

  // All-or-nothing rather than per-row: once any quantity was read, the
  // thresholds own the score. Mixing the two would charge a nutrient twice
  // — once for its number and again for the model's opinion of that same
  // row — which is how the ingredients path used to double-count.
  const fallbackDeductions =
    readings.length > 0
      ? []
      : deductionsFromModelSeverities(scorableFindings);

  const deductions = [
    ...thresholdDeductions,
    ...fallbackDeductions,
  ].slice(0, MAX_DEDUCTION_COUNT);

  return finalizeScore({
    deductions,
    // Earned from declared fibre and protein, not from the model's prose.
    earnedBonuses: bonusesFor(readings),
    positivesCount: analysis.positives.length,
    // The model's prose only counts when there were no numbers to judge.
    positivesBonusAllowed: readings.length === 0,
    positivesBonusLabel: "Πολλαπλά θετικά διατροφικά χαρακτηριστικά",
    noProblemsBonusLabel: "Δεν εντοπίστηκαν προβληματικά διατροφικά στοιχεία",
    confidence,
    lowConfidenceReason,
  });
}
