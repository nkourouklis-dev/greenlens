import {
  deductionsFromRules,
  FALLBACK_POINTS,
  hasHighConcernDeduction,
  MAX_DEDUCTION_COUNT,
  scoringVersion,
  type WorkerScore,
} from "./scoring";
import type { RuleMatch } from "./ingredientRules";
import type { WorkerChemicalResult } from "./chemicalAnalysis";

const MIN_OCR_CONFIDENCE = 0.4;
const MIN_TEXT_LENGTH = 10;

/**
 * A chemical composition label is a list of substances, exactly like an
 * ingredient list, so it scores through the same curated rule table rather
 * than through whatever severity the model attached to each finding — see
 * ingredientRules.ts for why that swap was necessary.
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
  const extractionConfidence = options?.extractionConfidence ?? 1;
  const lowConfidenceReason = options?.lowConfidenceReason ?? null;

  const confidence = Math.min(
    ocrConfidence,
    extractionConfidence,
    analysis.confidence,
  );

  const blockingReasons: string[] = [];

  if (text.trim().length < MIN_TEXT_LENGTH) {
    blockingReasons.push("Δεν υπάρχει επαρκής χημική ανάλυση.");
  }

  if (ocrConfidence < MIN_OCR_CONFIDENCE) {
    blockingReasons.push(
      "Η ανάγνωση της ετικέτας δεν ήταν αρκετά αξιόπιστη.",
    );
  }

  if (analysis.chemicalFindings.length === 0) {
    blockingReasons.push(
      "Δεν εντοπίστηκαν αξιολογήσιμες συγκεντρώσεις στοιχείων/ενώσεων.",
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

  const ruleMatches = options?.ruleMatches ?? [];

  const seen = new Set<string>();

  const deductions =
    ruleMatches.length > 0
      ? deductionsFromRules(ruleMatches)
      : analysis.chemicalFindings
          .flatMap((finding) => {
            if (
              finding.severity !== "attention" &&
              finding.severity !== "high_attention"
            ) {
              return [];
            }

            const code =
              finding.severity + ":" + finding.normalizedName;

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
                evidenceRequired:
                  finding.severity === "high_attention",
                evidenceAvailable:
                  finding.evidenceType !== "none",
              },
            ];
          })
          .slice(0, MAX_DEDUCTION_COUNT);

  const totalDeduction = deductions.reduce(
    (total, deduction) => total + deduction.points,
    0,
  );

  const bonuses: WorkerScore["bonuses"] = [];
  let bonusPoints = 0;

  if (
    analysis.positives.length >= 2 &&
    !hasHighConcernDeduction(deductions)
  ) {
    bonuses.push({
      label: "Πολλαπλά θετικά χαρακτηριστικά σύστασης",
      points: 3,
    });
    bonusPoints += 3;
  }

  // Must never coexist with an actual deduction — see worker/scoring.ts for
  // why this is gated on "no deductions at all" rather than a narrower
  // per-cause check (this used to only look at high_attention, so a
  // moderate "attention" deviation could still get the "no deviations"
  // bonus).
  if (deductions.length === 0) {
    bonuses.push({
      label: "Δεν εντοπίστηκαν αποκλίσεις από όρια ασφαλείας",
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
