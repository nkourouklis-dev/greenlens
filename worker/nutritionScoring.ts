import {
  FALLBACK_POINTS,
  hasHighConcernDeduction,
  MAX_DEDUCTION_COUNT,
  scoringVersion,
  type WorkerScore,
} from "./scoring";
import { isAllergenDeclarationOnly } from "./allergens";
import {
  bonusesFor,
  isBeverageTable,
  penaltiesFor,
  readNutrients,
} from "./nutritionThresholds";
import type { WorkerNutritionResult } from "./nutritionAnalysis";

const MIN_OCR_CONFIDENCE = 0.4;
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
  const extractionConfidence = options?.extractionConfidence ?? 1;
  const lowConfidenceReason = options?.lowConfidenceReason ?? null;

  const confidence = Math.min(
    ocrConfidence,
    extractionConfidence,
    analysis.confidence,
  );

  const blockingReasons: string[] = [];

  if (text.trim().length < MIN_TEXT_LENGTH) {
    blockingReasons.push("Δεν υπάρχει επαρκής διατροφικός πίνακας.");
  }

  if (ocrConfidence < MIN_OCR_CONFIDENCE) {
    blockingReasons.push(
      "Η ανάγνωση της ετικέτας δεν ήταν αρκετά αξιόπιστη.",
    );
  }

  if (analysis.nutritionFindings.length === 0) {
    blockingReasons.push(
      "Δεν εντοπίστηκαν αξιολογήσιμα διατροφικά στοιχεία.",
    );
  }

  if (blockingReasons.length > 0) {
    return {
      score: null,
      band: "insufficient_data",
      deductions: [],
      bonuses: [],
      confidence,
      lowConfidenceReason,
      insufficientDataReasons: Array.from(
        new Set([...blockingReasons, ...analysis.insufficientDataReasons]),
      ),
      scoringVersion,
    };
  }

  const seen = new Set<string>();

  // Same rule as the ingredients path (worker/scoring.ts): a declared EU
  // allergen is information, never a deduction.
  const scorableFindings = analysis.nutritionFindings.filter(
    (finding) => !isAllergenDeclarationOnly(finding, finding.nutrient),
  );

  const readings = readNutrients(scorableFindings);
  const isBeverage = isBeverageTable(text);

  const thresholdDeductions = penaltiesFor(
    readings,
    isBeverage,
  ).map((penalty) => ({
    code: "threshold:" + penalty.key,
    points: penalty.points,
    title: penalty.title,
    explanation: penalty.explanation,
    ingredientIds: [],
    evidenceRequired: false,
    // The threshold is the evidence: a published band, not a per-scan guess.
    evidenceAvailable: true,
  }));

  // All-or-nothing rather than per-row: once any quantity was read, the
  // thresholds own the score. Mixing the two would charge a nutrient twice
  // — once for its number and again for the model's opinion of that same
  // row — which is how the ingredients path used to double-count.
  const fallbackDeductions = (
    readings.length > 0 ? [] : scorableFindings
  )
    .flatMap((finding) => {
      if (
        finding.severity !== "attention" &&
        finding.severity !== "high_attention"
      ) {
        return [];
      }

      const code = finding.severity + ":" + finding.normalizedName;

      if (seen.has(code)) {
        return [];
      }

      seen.add(code);

      return [
        {
          code,
          points: FALLBACK_POINTS[finding.severity],
          title: finding.title,
          explanation: finding.explanation,
          ingredientIds: [],
          evidenceRequired: finding.severity === "high_attention",
          evidenceAvailable: finding.evidenceType !== "none",
        },
      ];
    });

  const deductions = [
    ...thresholdDeductions,
    ...fallbackDeductions,
  ].slice(0, MAX_DEDUCTION_COUNT);

  const totalDeduction = deductions.reduce(
    (total, deduction) => total + deduction.points,
    0,
  );

  // Earned from declared fibre and protein, not from the model's prose.
  const bonuses: WorkerScore["bonuses"] = bonusesFor(readings);

  let bonusPoints = bonuses.reduce(
    (total, bonus) => total + bonus.points,
    0,
  );

  if (
    analysis.positives.length >= 2 &&
    !hasHighConcernDeduction(deductions) &&
    readings.length === 0
  ) {
    bonuses.push({
      label: "Πολλαπλά θετικά διατροφικά χαρακτηριστικά",
      points: 3,
    });
    bonusPoints += 3;
  }

  // Must never coexist with an actual deduction — see worker/scoring.ts for
  // why this is gated on "no deductions at all" rather than a narrower
  // per-cause check.
  if (deductions.length === 0) {
    bonuses.push({
      label: "Δεν εντοπίστηκαν προβληματικά διατροφικά στοιχεία",
      points: 5,
    });
    bonusPoints += 5;
  }

  const score = Math.max(
    0,
    Math.min(100, 100 - totalDeduction + bonusPoints),
  );

  const band =
    score >= 85
      ? "excellent"
      : score >= 70
        ? "good"
        : score >= 50
          ? "moderate"
          : score >= 30
            ? "attention"
            : "high_attention";

  return {
    score,
    band,
    deductions,
    bonuses,
    confidence,
    lowConfidenceReason,
    insufficientDataReasons: [],
    scoringVersion,
  };
}
