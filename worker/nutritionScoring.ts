import {
  ARTIFICIAL_ADDITIVE_PATTERN,
  scoringVersion,
  type WorkerScore,
} from "./scoring";
import { isAllergenDeclarationOnly } from "./allergens";
import type { WorkerNutritionResult } from "./nutritionAnalysis";

const MIN_OCR_CONFIDENCE = 0.4;
const MIN_TEXT_LENGTH = 15;
const MAX_DEDUCTIONS = 6;

/**
 * Same severity → points → band algorithm as scoreInterpretation
 * (worker/scoring.ts), kept as an independent copy tuned for nutrition
 * findings so the ingredients path's tested scoring stays untouched.
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

  const deductions = scorableFindings
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

      const hasEvidence = finding.evidenceType !== "none";
      const basePoints = finding.severity === "high_attention" ? 15 : 8;
      const points = hasEvidence ? basePoints : Math.round(basePoints / 2);

      return [
        {
          code,
          points,
          title: finding.title,
          explanation: finding.explanation,
          ingredientIds: [],
          evidenceRequired: finding.severity === "high_attention",
          evidenceAvailable: hasEvidence,
        },
      ];
    })
    .slice(0, MAX_DEDUCTIONS);

  const totalDeduction = deductions.reduce(
    (total, deduction) => total + deduction.points,
    0,
  );

  const bonuses: WorkerScore["bonuses"] = [];
  let bonusPoints = 0;

  if (analysis.positives.length >= 2) {
    bonuses.push({
      label: "Πολλαπλά θετικά διατροφικά χαρακτηριστικά",
      points: 3,
    });
    bonusPoints += 3;
  }

  const hasFlaggedAdditive = scorableFindings.some(
    (finding) =>
      (finding.severity === "attention" ||
        finding.severity === "high_attention") &&
      ARTIFICIAL_ADDITIVE_PATTERN.test(finding.normalizedName),
  );

  if (!hasFlaggedAdditive) {
    bonuses.push({
      label: "Δεν εντοπίστηκαν προβληματικά πρόσθετα (E-numbers)",
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
