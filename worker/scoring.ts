import type { WorkerAnalysisResult } from "./analysis";
import { isAllergenDeclarationOnly } from "./allergens";
import type { RuleMatch } from "./ingredientRules";

export const scoringVersion = "2026.09.3";

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
const MAX_DEDUCTIONS = 8;

/**
 * Points charged when an ingredient has no curated rule and the score has to
 * fall back on the model's own severity. Deliberately below what the rule
 * table charges for a comparable ingredient: an unreviewed guess should be
 * able to nudge a score, not decide it.
 */
export const FALLBACK_POINTS = {
  attention: 8,
  high_attention: 15,
} as const;

export const MAX_DEDUCTION_COUNT = MAX_DEDUCTIONS;

/**
 * True when a deduction list contains something serious enough that the
 * model's free-text `positives` — which tend to echo front-of-pack marketing
 * — should not be allowed to claw points back.
 */
export function hasHighConcernDeduction(
  deductions: WorkerScore["deductions"],
): boolean {
  return deductions.some(
    (deduction) =>
      deduction.code.startsWith("high_concern:") ||
      deduction.code.startsWith("high_attention:"),
  );
}

/**
 * Shared by every content category that scores a *list of substances* —
 * ingredients and chemical composition. Nutrition scores numbers against
 * thresholds instead (see nutritionThresholds.ts), so it does not use this.
 */
export function deductionsFromRules(
  matches: RuleMatch[],
): WorkerScore["deductions"] {
  return matches
    .filter((match) => match.weightedPoints > 0)
    .map((match) => ({
      code:
        match.rule.severity +
        ":" +
        match.rule.normalizedName,
      points: match.weightedPoints,
      title: match.rule.shortDescription,
      explanation:
        match.rule.concerns[0] ??
        match.rule.shortDescription,
      ingredientIds: [],
      evidenceRequired:
        match.rule.severity === "high_concern",
      // A curated rule is itself the evidence — it was reviewed once, by a
      // human, rather than asserted per-scan by the model.
      evidenceAvailable: true,
    }))
    .slice(0, MAX_DEDUCTIONS);
}

/**
 * Pre-rules behaviour, kept only for when the rule table is unreachable.
 * The `evidenceType === "none"` halving that used to live here is gone: the
 * model emits "none" for almost every finding, so halving was the rule
 * rather than the exception and quietly capped most penalties at 4 points.
 */
function deductionsFromFindings(
  analysis: WorkerAnalysisResult,
): WorkerScore["deductions"] {
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

  return scorableFindings
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
    .slice(0, MAX_DEDUCTIONS);
}

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
    /**
     * Curated rules matched against the label text (see ingredientRules.ts).
     * When present these are the *only* source of deductions — the model's
     * severities are ignored, because letting them through was what made the
     * score depend on how many items a given run happened to flag.
     *
     * Omitted (or empty, e.g. a D1 failure) falls back to model severities,
     * so a scan still yields a score rather than a blank one.
     */
    ruleMatches?: RuleMatch[];
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

  const ruleMatches = options?.ruleMatches ?? [];

  const deductions =
    ruleMatches.length > 0
      ? deductionsFromRules(ruleMatches)
      : deductionsFromFindings(analysis);

  const totalDeduction = deductions.reduce(
    (total, deduction) =>
      total + deduction.points,
    0,
  );

  const bonuses: WorkerScore["bonuses"] = [];

  let bonusPoints = 0;

  // Withheld once something serious was found: a product carrying a
  // high_concern ingredient should not claw back points for what its
  // packaging chooses to boast about.
  if (
    analysis.positives.length >= 2 &&
    !hasHighConcernDeduction(deductions)
  ) {
    bonuses.push({
      label: "Πολλαπλά θετικά χαρακτηριστικά",
      points: 3,
    });
    bonusPoints += 3;
  }

  // Deliberately *not* keyed on potentialAllergens any more: rewarding the
  // absence of milk/wheat/egg is the same -5 penalty for containing them,
  // just spelled backwards. And it must never coexist with an actual
  // deduction — a bonus that says "no problems" while a finding just docked
  // points for a real one (e.g. high ethanol content) is a direct
  // contradiction, not a narrower/complementary signal.
  if (deductions.length === 0) {
    bonuses.push({
      label: "Δεν εντοπίστηκαν προβληματικά συστατικά",
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