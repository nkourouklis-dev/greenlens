import {
  alcoholDeduction,
  alcoholNotice,
  type AlcoholInfo,
  type ScoreNotice,
} from "./alcohol";
import type { WorkerAnalysisResult } from "./analysis";
import {
  isAllergenDeclarationOnly,
  matchFragranceAllergen,
} from "./allergens";
import type { RuleMatch } from "./ingredientRules";
import type { NutritionPanel } from "./nutritionPanel";
import {
  bonusesFor,
  penaltiesFor,
  type NutrientReading,
} from "./nutritionThresholds";

export const scoringVersion = "2026.09.5";

export type { ScoreNotice } from "./alcohol";

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
  /**
   * Context the number alone cannot carry, shown beside the score: that the
   * product contains alcohol, or that a nutrition table / ingredient list on
   * the label was not taken into account because it could not be read.
   * Never changes the score by itself — anything that costs points is a
   * deduction, where the user can see it.
   */
  notices: ScoreNotice[];
  scoringVersion: string;
}

type Deductions = WorkerScore["deductions"];

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
  deductions: Deductions,
): boolean {
  return deductions.some(
    (deduction) =>
      deduction.code.startsWith("high_concern:") ||
      deduction.code.startsWith("high_attention:"),
  );
}

// ---------------------------------------------------------------------------
// Shared scoring steps
//
// Ingredients (scoreInterpretation below), nutrition (nutritionScoring.ts)
// and chemical composition (chemicalScoring.ts) used to each carry their own
// copy of the steps below. They differ only in *what* they deduct for and in
// their wording; the arithmetic around it — when a result is "insufficient",
// how the model-severity fallback charges, when the two bonuses apply, the
// 0–100 clamp and the bands — is one rule, kept here so a fix to it (like
// 96c9d1d's "no-problems bonus next to a deduction") lands once.
// ---------------------------------------------------------------------------

/**
 * The reasons a text cannot be scored at all: too little text, an OCR read
 * too unreliable to trust, or nothing evaluable found in it.
 */
export function blockingReasonsFor(params: {
  text: string;
  minTextLength: number;
  shortTextReason: string;
  ocrConfidence: number;
  findingCount: number;
  noFindingsReason: string;
}): string[] {
  const reasons: string[] = [];

  if (params.text.trim().length < params.minTextLength) {
    reasons.push(params.shortTextReason);
  }

  if (params.ocrConfidence < MIN_OCR_CONFIDENCE) {
    reasons.push("Η ανάγνωση της ετικέτας δεν ήταν αρκετά αξιόπιστη.");
  }

  if (params.findingCount === 0) {
    reasons.push(params.noFindingsReason);
  }

  return reasons;
}

/** The result for a text that could not be scored: no number, only reasons. */
export function insufficientDataScore(params: {
  confidence: number;
  lowConfidenceReason: string | null;
  blockingReasons: string[];
  modelReasons: string[];
  notices?: ScoreNotice[];
}): WorkerScore {
  return {
    score: null,
    band: "insufficient_data",
    deductions: [],
    bonuses: [],
    confidence: params.confidence,
    lowConfidenceReason: params.lowConfidenceReason,
    insufficientDataReasons: Array.from(
      new Set([...params.blockingReasons, ...params.modelReasons]),
    ),
    notices: params.notices ?? [],
    scoringVersion,
  };
}

interface SeverityFinding {
  normalizedName: string;
  severity: string;
  title: string;
  explanation: string;
  evidenceType: string;
}

/**
 * Fallback deductions from the model's own per-finding severities, for when
 * no curated rule or threshold applies. One deduction per
 * severity:ingredient, FALLBACK_POINTS each, at most MAX_DEDUCTIONS.
 *
 * `groupOf` puts findings into a group that is charged only once, by its
 * first finding — the fallback's stand-in for a rule group (see
 * deductionsFromFindings). A duplicate severity:ingredient is skipped before
 * the group is considered, so it never uses up the group's one charge.
 */
export function deductionsFromModelSeverities<F extends SeverityFinding>(
  findings: F[],
  groupOf: (finding: F) => string | null = () => null,
): Deductions {
  const seen = new Set<string>();
  const chargedGroups = new Set<string>();

  return findings
    .flatMap((finding) => {
      const severity = finding.severity;

      if (severity !== "attention" && severity !== "high_attention") {
        return [];
      }

      const code = severity + ":" + finding.normalizedName;

      if (seen.has(code)) {
        return [];
      }

      seen.add(code);

      const group = groupOf(finding);

      if (group !== null) {
        if (chargedGroups.has(group)) {
          return [];
        }

        chargedGroups.add(group);
      }

      return [
        {
          code,
          points: FALLBACK_POINTS[severity],
          title: finding.title,
          explanation: finding.explanation,
          ingredientIds: [],
          evidenceRequired: severity === "high_attention",
          evidenceAvailable: finding.evidenceType !== "none",
        },
      ];
    })
    .slice(0, MAX_DEDUCTIONS);
}

/**
 * Deductions charged for declared quantities rather than for names: each
 * nutrient banded against the published thresholds (see
 * nutritionThresholds.ts). Used by the nutrition path for the whole score
 * and by the ingredients path for the sugar/salt part of a mixed label.
 */
export function deductionsFromThresholds(
  readings: NutrientReading[],
  isBeverage: boolean,
  options?: { naturalSugarOnly?: boolean },
): Deductions {
  return penaltiesFor(readings, isBeverage, options).map((penalty) => ({
    code: "threshold:" + penalty.key,
    points: penalty.points,
    title: penalty.title,
    explanation: penalty.explanation,
    ingredientIds: [],
    evidenceRequired: false,
    // The threshold is the evidence: a published band, not a per-scan guess.
    evidenceAvailable: true,
  }));
}

/**
 * Adds what the product *is* on top of what it contains: today, the graded
 * alcohol deduction (see alcohol.ts). Kept worst-first and within the
 * deduction cap like every other list, and applied by every food path so an
 * alcoholic drink costs the same whether its label was read as ingredients,
 * nutrition, or both.
 */
export function withContextDeductions(
  deductions: Deductions,
  alcohol: AlcoholInfo | null | undefined,
): Deductions {
  const alcoholCharge = alcoholDeduction(alcohol ?? null);

  if (!alcoholCharge) {
    return deductions;
  }

  return [alcoholCharge, ...deductions]
    .sort((left, right) => right.points - left.points)
    .slice(0, MAX_DEDUCTIONS);
}

/** Caller-supplied notices plus the alcohol note, without duplicates. */
export function noticesFor(
  notices: ScoreNotice[] | undefined,
  alcohol: AlcoholInfo | null | undefined,
): ScoreNotice[] {
  const all = [...(notices ?? [])];

  const alcoholNote = alcoholNotice(alcohol ?? null);

  if (alcoholNote && !all.some((notice) => notice.code === alcoholNote.code)) {
    all.unshift(alcoholNote);
  }

  return all;
}

export function bandForScore(score: number): WorkerScore["band"] {
  return score >= 85
    ? "excellent"
    : score >= 70
      ? "good"
      : score >= 50
        ? "moderate"
        : score >= 30
          ? "attention"
          : "high_attention";
}

/**
 * Turns a finished deduction list into the final score: adds the two
 * shared bonuses, clamps to 0–100 and picks the band.
 *
 * - "Multiple positives" (+3) is withheld once something serious was
 *   found: a product carrying a high_concern ingredient should not claw
 *   back points for what its packaging chooses to boast about.
 *   `positivesBonusAllowed` lets a caller add its own condition.
 * - "No problems" (+5) must never coexist with an actual deduction — a
 *   bonus that says "no problems" while a finding just docked points for a
 *   real one (e.g. high ethanol content) is a direct contradiction.
 *
 * `earnedBonuses` are bonuses the caller already awarded from data (e.g.
 * declared fibre in a nutrition table); they come first in the list.
 */
export function finalizeScore(params: {
  deductions: Deductions;
  earnedBonuses?: WorkerScore["bonuses"];
  positivesCount: number;
  positivesBonusAllowed?: boolean;
  positivesBonusLabel: string;
  noProblemsBonusLabel: string;
  confidence: number;
  lowConfidenceReason: string | null;
  notices?: ScoreNotice[];
}): WorkerScore {
  const { deductions } = params;

  const totalDeduction = deductions.reduce(
    (total, deduction) => total + deduction.points,
    0,
  );

  const bonuses: WorkerScore["bonuses"] = [...(params.earnedBonuses ?? [])];

  if (
    params.positivesCount >= 2 &&
    !hasHighConcernDeduction(deductions) &&
    (params.positivesBonusAllowed ?? true)
  ) {
    bonuses.push({ label: params.positivesBonusLabel, points: 3 });
  }

  if (deductions.length === 0) {
    bonuses.push({ label: params.noProblemsBonusLabel, points: 5 });
  }

  const bonusPoints = bonuses.reduce(
    (total, bonus) => total + bonus.points,
    0,
  );

  const score = Math.max(
    0,
    Math.min(100, 100 - totalDeduction + bonusPoints),
  );

  return {
    score,
    band: bandForScore(score),
    deductions,
    bonuses,
    confidence: params.confidence,
    lowConfidenceReason: params.lowConfidenceReason,
    insufficientDataReasons: [],
    notices: params.notices ?? [],
    scoringVersion,
  };
}

// ---------------------------------------------------------------------------
// Ingredients
// ---------------------------------------------------------------------------

/**
 * The `ingredient_knowledge.rule_group`s whose whole job is to stand in for
 * a quantity nobody could read off the ingredient list. A nutrition table
 * declares those quantities outright, so on a label carrying one these rules
 * step aside for the thresholds instead of being charged on top of them.
 */
const THRESHOLD_OWNED_RULE_GROUPS = new Set([
  "added_sugar",
  "salt",
]);

/**
 * Shared by every content category that scores a *list of substances* —
 * ingredients and chemical composition. Nutrition scores numbers against
 * thresholds instead (see nutritionThresholds.ts), so it does not use this.
 */
export function deductionsFromRules(
  matches: RuleMatch[],
): Deductions {
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
): Deductions {
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

  // Fragrance is charged once, whichever fragrance finding comes first —
  // the same thing the rule table does through its "fragrance_allergen"
  // group (parfum plus the EU-declared fragrance substances). Without this,
  // a label listing Parfum, Linalool and Limonene lost 24 points here but
  // at most 6 on the normal rule path, so a D1 hiccup alone could drop a
  // cosmetic by two bands.
  return deductionsFromModelSeverities(scorableFindings, (finding) => {
    const name = `${finding.ingredientName} ${finding.normalizedName}`;

    return matchFragranceAllergen(name) !== null ||
      /\b(parfum|fragrance)\b/i.test(name)
      ? "fragrance"
      : null;
  });
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
    /**
     * Per-100 quantities read off a nutrition table printed on the same
     * label (see nutritionPanel.ts). Present only for "mixed" labels, and
     * only when the numbers passed their plausibility checks — so omitting
     * it, or passing null, is exactly today's ingredients-only behaviour.
     */
    nutritionPanel?: NutritionPanel | null;
    /** The drink's declared alcohol, if it is one (alcohol.ts). */
    alcohol?: AlcoholInfo | null;
    /** e.g. "the nutrition table was not taken into account". */
    notices?: ScoreNotice[];
  },
): WorkerScore {
  const lowConfidenceReason =
    options?.lowConfidenceReason ?? null;

  const notices = noticesFor(options?.notices, options?.alcohol);

  const confidence = Math.min(
    ocrConfidence,
    options?.extractionConfidence ?? 1,
    analysis.confidence,
  );

  const blockingReasons = blockingReasonsFor({
    text,
    minTextLength: MIN_INGREDIENT_TEXT_LENGTH,
    shortTextReason: "Δεν υπάρχει επαρκής λίστα συστατικών.",
    ocrConfidence,
    findingCount: analysis.ingredientFindings.length,
    noFindingsReason: "Δεν εντοπίστηκαν αξιολογήσιμα συστατικά.",
  });

  if (blockingReasons.length > 0) {
    return insufficientDataScore({
      confidence,
      lowConfidenceReason,
      blockingReasons,
      modelReasons: analysis.insufficientDataReasons,
      notices,
    });
  }

  const ruleMatches = options?.ruleMatches ?? [];

  const panel = options?.nutritionPanel ?? null;

  const panelReadings = panel?.readings ?? [];

  // A mixed label carries both kinds of evidence for the same thing. "Ζάχαρη
  // appears second in the list" is a guess at how much sugar is in there;
  // "σάκχαρα 19,9g ανά 100g" is the answer, printed on the same photo. So
  // where the numbers exist, they replace the rules that were standing in
  // for them — and only those rules: palm oil, sweeteners, parabens,
  // fragrance and the rest are things a quantity table says nothing about,
  // and keep costing exactly what they cost today.
  const scoredRuleMatches =
    panelReadings.length > 0
      ? ruleMatches.filter(
          (match) =>
            !THRESHOLD_OWNED_RULE_GROUPS.has(
              match.rule.ruleGroup ?? "",
            ),
        )
      : ruleMatches;

  const ingredientDeductions =
    ruleMatches.length > 0
      ? deductionsFromRules(scoredRuleMatches)
      : deductionsFromFindings(analysis);

  // Whether the ingredient list itself names an added sweetener (sugar,
  // glucose-fructose syrup, added fructose, ...). When it doesn't, the
  // table's "sugars" figure can only be coming from a whole-food ingredient
  // (dates, honey, fruit) — that is still sugar, but not the same claim as
  // added sugar, so it is banded more gently (see naturalSugarOnly).
  const hasAddedSugarIngredient = ruleMatches.some(
    (match) => match.rule.ruleGroup === "added_sugar",
  );

  const listAndTableDeductions =
    panelReadings.length > 0
      ? [
          ...deductionsFromThresholds(
            panelReadings,
            panel?.isBeverage ?? false,
            { naturalSugarOnly: !hasAddedSugarIngredient },
          ),
          ...ingredientDeductions,
        ]
          .sort((left, right) => right.points - left.points)
          .slice(0, MAX_DEDUCTIONS)
      : ingredientDeductions;

  const deductions = withContextDeductions(
    listAndTableDeductions,
    options?.alcohol,
  );

  // Deliberately *not* keyed on potentialAllergens: rewarding the absence of
  // milk/wheat/egg is the same -5 penalty for containing them, just spelled
  // backwards.
  return finalizeScore({
    deductions,
    // Fibre and protein, earned from the declared amounts — the same
    // bonuses the nutrition-only path awards for the same table.
    earnedBonuses: bonusesFor(panelReadings),
    positivesCount: analysis.positives.length,
    // Same rule as the nutrition path: once there are real numbers to
    // judge, the model's prose about how wholesome the product is does not
    // get to add points on top of them.
    positivesBonusAllowed: panelReadings.length === 0,
    positivesBonusLabel: "Πολλαπλά θετικά χαρακτηριστικά",
    noProblemsBonusLabel: "Δεν εντοπίστηκαν προβληματικά συστατικά",
    confidence,
    lowConfidenceReason,
    notices,
  });
}
