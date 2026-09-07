import type { WorkerAnalysisResult } from "./analysis";
import { isAllergenDeclarationOnly } from "./allergens";

export const scoringVersion = "2026.09.1";

/**
 * E-numbers, the marker this codebase uses for "flagged artificial additive".
 * Shared with the nutrition path so both score the same thing the same way.
 */
export const ARTIFICIAL_ADDITIVE_PATTERN = /\be[\s-]?[1-9]\d{2,3}\b/i;

export interface WorkerScore {
  score: number | null;
  band:
    | "excellent"
    | "good"
    | "moderate"
    | "attention"
    | "high_attention"
    | "insufficient_data";
  deductions: Array<{
    code: string;
    points: number;
    title: string;
    explanation: string;
    ingredientIds: string[];
    evidenceRequired: boolean;
    evidenceAvailable: boolean;
  }>;
  /**
   * Each bonus carries its own points (unlike the old string[] shape) so
   * the UI can show the same "starting - deductions + bonuses = final"
   * arithmetic it already shows for deductions — before this, the score
   * breakdown panel could show e.g. "-4" total deductions next to a final
   * score unchanged from 100, with no visible reason, whenever a bonus
   * more than offset the deduction.
   */
  bonuses: Array<{ label: string; points: number }>;
  confidence: number;
  /**
   * Set when the ingredient text was accepted on shaky evidence (no
   * heading, or only via the nutrition-table override) even though a full
   * score was still computed. Never blocks the flow — it's shown next to
   * the result as a caveat, not a rejection.
   */
  lowConfidenceReason: string | null;
  insufficientDataReasons: string[];
  scoringVersion: string;
}

const MIN_OCR_CONFIDENCE = 0.4;
const MIN_INGREDIENT_TEXT_LENGTH = 15;
const MAX_DEDUCTIONS = 6;

export function scoreInterpretation(
  text: string,
  ocrConfidence: number,
  analysis: WorkerAnalysisResult,
  options?: {
    /**
     * Confidence from the deterministic ingredient-text validator (lower
     * when the text was accepted without a heading). Defaults to 1 (no
     * effect) so existing callers that omit it keep today's behaviour.
     */
    extractionConfidence?: number;
    lowConfidenceReason?: string | null;
  },
): WorkerScore {
  const extractionConfidence =
    options?.extractionConfidence ?? 1;

  const lowConfidenceReason =
    options?.lowConfidenceReason ?? null;

  const confidence = Math.min(
    ocrConfidence,
    extractionConfidence,
    analysis.confidence,
  );

  const blockingReasons: string[] = [];

  if (
    text.trim().length <
    MIN_INGREDIENT_TEXT_LENGTH
  ) {
    blockingReasons.push(
      "Δεν υπάρχει επαρκής λίστα συστατικών.",
    );
  }

  if (ocrConfidence < MIN_OCR_CONFIDENCE) {
    blockingReasons.push(
      "Η ανάγνωση της ετικέτας δεν ήταν αρκετά αξιόπιστη.",
    );
  }

  if (
    analysis.ingredientFindings.length === 0
  ) {
    blockingReasons.push(
      "Δεν εντοπίστηκαν αξιολογήσιμα συστατικά.",
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
        new Set([
          ...blockingReasons,
          ...analysis.insufficientDataReasons,
        ]),
      ),
      scoringVersion,
    };
  }

  const seen = new Set<string>();

  // "This is wheat/milk/egg" is a declaration, not a defect. The analysis
  // path already downgrades these to info before scoring; filtering again
  // here means no caller can reintroduce the penalty by scoring findings
  // that were never classified.
  const scorableFindings =
    analysis.ingredientFindings.filter(
      (finding) =>
        !isAllergenDeclarationOnly(
          finding,
          finding.ingredientName,
        ),
    );

  const deductions = scorableFindings
    .flatMap((finding) => {
      if (
        finding.severity !== "attention" &&
        finding.severity !== "high_attention"
      ) {
        return [];
      }

      const code =
        finding.severity +
        ":" +
        finding.normalizedName;

      if (seen.has(code)) {
        return [];
      }

      seen.add(code);

      const hasEvidence =
        finding.evidenceType !== "none";

      const basePoints =
        finding.severity === "high_attention"
          ? 15
          : 8;

      const points = hasEvidence
        ? basePoints
        : Math.round(basePoints / 2);

      return [
        {
          code,
          points,
          title: finding.title,
          explanation: finding.explanation,
          ingredientIds: [],
          evidenceRequired:
            finding.severity ===
            "high_attention",
          evidenceAvailable: hasEvidence,
        },
      ];
    })
    .slice(0, MAX_DEDUCTIONS);

  const totalDeduction = deductions.reduce(
    (total, deduction) =>
      total + deduction.points,
    0,
  );

  const bonuses: WorkerScore["bonuses"] = [];

  let bonusPoints = 0;

  if (analysis.positives.length >= 2) {
    bonuses.push({
      label: "Πολλαπλά θετικά χαρακτηριστικά",
      points: 3,
    });
    bonusPoints += 3;
  }

  // Deliberately *not* keyed on potentialAllergens any more: rewarding the
  // absence of milk/wheat/egg is the same -5 penalty for containing them,
  // just spelled backwards. What still earns the bonus is the absence of
  // flagged artificial additives, matching the nutrition path.
  const hasFlaggedAdditive =
    scorableFindings.some(
      (finding) =>
        (finding.severity === "attention" ||
          finding.severity === "high_attention") &&
        (ARTIFICIAL_ADDITIVE_PATTERN.test(
          finding.normalizedName,
        ) ||
          ARTIFICIAL_ADDITIVE_PATTERN.test(
            finding.ingredientName,
          )),
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
    Math.min(
      100,
      100 - totalDeduction + bonusPoints,
    ),
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