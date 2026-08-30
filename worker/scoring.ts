import type { WorkerAnalysisResult } from "./analysis";

export const scoringVersion = "2026.08.3";

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
  bonuses: string[];
  confidence: number;
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
): WorkerScore {
  const confidence = Math.min(
    ocrConfidence,
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

  const deductions = analysis.ingredientFindings
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

  const bonuses: string[] = [];

  let bonusPoints = 0;

  if (analysis.positives.length >= 2) {
    bonuses.push(
      "Πολλαπλά θετικά χαρακτηριστικά",
    );
    bonusPoints += 3;
  }

  if (
    analysis.potentialAllergens.length === 0
  ) {
    bonuses.push(
      "Δεν εντοπίστηκαν γνωστά αλλεργιογόνα",
    );
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
    insufficientDataReasons: [],
    scoringVersion,
  };
}