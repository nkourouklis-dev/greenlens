import {
  blockingReasonsFor,
  deductionsFromThresholds,
  finalizeScore,
  insufficientDataScore,
  MAX_DEDUCTION_COUNT,
  noticesFor,
  withContextDeductions,
  type ScoreNotice,
  type WorkerScore,
} from "./scoring";
import type { AlcoholInfo } from "./alcohol";
import { bonusesFor } from "./nutritionThresholds";
import { inspectNutritionPanel } from "./nutritionPanel";
import type { WorkerNutritionResult } from "./nutritionAnalysis";

const MIN_TEXT_LENGTH = 15;

export const UNREADABLE_TABLE_REASON =
  "Ο διατροφικός πίνακας δεν διαβάστηκε καθαρά — ξαναφωτογράφισέ τον.";

const NO_TABLE_REASON =
  "Δεν εντοπίστηκε αναγνώσιμος διατροφικός πίνακας.";

/**
 * Scores the declared quantities against published thresholds rather than
 * the severities the model attached to each row — the nutrition equivalent
 * of the rule table the ingredients path moved to. See
 * nutritionThresholds.ts for the bands and why beverages get their own.
 *
 * The quantities come only from the deterministic reader
 * (nutritionPanel.ts), which cross-checks them against the declared energy.
 * When it cannot vouch for a table, there is no score — decided 2026-09-16.
 * The model is asked to copy each amount "exactly as printed" and does not:
 * on a date bar it returned 8g of sugar for 33,7g and 5g of salt for 0,5g,
 * and on the Kaiser pilsner 5g of sugar for 0,5g, which put a beer into a
 * high-sugar band. Scoring those numbers was a wrong answer delivered with
 * confidence; asking for a clearer photo is the honest one.
 *
 * The steps shared with the other content categories (insufficient-data
 * result, bonuses, clamp and band) live in scoring.ts.
 */
export function scoreNutrition(
  text: string,
  ocrConfidence: number,
  analysis: WorkerNutritionResult,
  options?: {
    extractionConfidence?: number;
    lowConfidenceReason?: string | null;
    /**
     * The drink's alcohol when it was read from another photo. Omitted, it
     * is looked for in `text` (for the energy check) but charged only when
     * passed — the caller decides what the product is.
     */
    alcohol?: AlcoholInfo | null;
    notices?: ScoreNotice[];
  },
): WorkerScore {
  const lowConfidenceReason = options?.lowConfidenceReason ?? null;

  const notices = noticesFor(options?.notices, options?.alcohol);

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

  const read = inspectNutritionPanel(
    text,
    options?.alcohol ? { abv: options.alcohol.abv } : undefined,
  );

  if (blockingReasons.length === 0 && read.panel === null) {
    blockingReasons.push(
      read.tableDetected ? UNREADABLE_TABLE_REASON : NO_TABLE_REASON,
    );
  }

  if (blockingReasons.length > 0 || read.panel === null) {
    return insufficientDataScore({
      confidence,
      lowConfidenceReason,
      blockingReasons,
      modelReasons: analysis.insufficientDataReasons,
      notices,
    });
  }

  const { readings, isBeverage } = read.panel;

  const deductions = withContextDeductions(
    deductionsFromThresholds(readings, isBeverage),
    options?.alcohol,
  ).slice(0, MAX_DEDUCTION_COUNT);

  return finalizeScore({
    deductions,
    // Earned from declared fibre and protein, not from the model's prose.
    earnedBonuses: bonusesFor(readings),
    positivesCount: analysis.positives.length,
    // There are always numbers to judge by now, and the model's prose does
    // not get to add points on top of them.
    positivesBonusAllowed: false,
    positivesBonusLabel: "Πολλαπλά θετικά διατροφικά χαρακτηριστικά",
    noProblemsBonusLabel: "Δεν εντοπίστηκαν προβληματικά διατροφικά στοιχεία",
    confidence,
    lowConfidenceReason,
    notices,
  });
}
