/**
 * Re-scoring of an already-analyzed product, without re-running OCR or the
 * model.
 *
 * The PIM edit form used to POST whatever number an admin typed into the
 * "Βαθμολογία" box, so a hand-corrected ingredient list kept the score (and,
 * worse, the `deductions` list) of the analysis it replaced — a breakdown
 * that could charge points for an ingredient the admin had just deleted.
 *
 * Scoring is deterministic from the label text (see ingredientRules.ts), so
 * the fix needs no AI call: run the exact same rule matching and
 * `scoreInterpretation` the live scan runs, over the text the admin
 * confirmed. Same input, same output — an admin save and a fresh scan of the
 * same text now agree by construction.
 */

import type { WorkerAnalysisResult } from "./analysis";
import type { D1Like } from "./ingredientKnowledge";
import {
  buildIngredientInsights,
  verdictByBand,
  type IngredientInsight,
} from "./ingredientInsights";
import {
  loadScoringRules,
  matchScoringRules,
  type RuleMatch,
} from "./ingredientRules";
import { scoreInterpretation, type WorkerScore } from "./scoring";

/**
 * A verified row's text was read and corrected by a human, so the OCR and
 * extraction confidences that discount a live scan's score don't apply here.
 * The model's own `confidence` still flows through `scoreInterpretation`,
 * which takes the minimum of the three.
 */
const HUMAN_VERIFIED_CONFIDENCE = 1;

export interface RescoreOutcome {
  score: WorkerScore;
  ingredientInsights: IngredientInsight[];
  ruleMatches: RuleMatch[];
}

export async function rescoreIngredientsResult(
  db: D1Like,
  result: WorkerAnalysisResult,
  sourceText: string,
): Promise<RescoreOutcome> {
  const ruleSet = await loadScoringRules(db);

  const ruleMatches = matchScoringRules(sourceText, ruleSet);

  const score = scoreInterpretation(
    sourceText,
    HUMAN_VERIFIED_CONFIDENCE,
    result,
    {
      extractionConfidence: HUMAN_VERIFIED_CONFIDENCE,
      lowConfidenceReason: null,
      ruleMatches,
    },
  );

  // Rebuilt alongside the score, not carried over: `scoreImpact` on every
  // ingredient card is read straight out of `score.deductions`, so keeping
  // the old insights next to a new score is the same self-contradiction the
  // stale deductions were.
  const ingredientInsights = await buildIngredientInsights(
    result,
    score,
    db,
    ruleMatches,
  );

  return { score, ingredientInsights, ruleMatches };
}

/**
 * Fallback label text for rows analyzed before `sourceText` was persisted:
 * the admin's own findings list, in order, as a comma-separated list.
 *
 * Comma-separated matters — `matchScoringRules` weights a match by which
 * comma-separated segment it lands in (EU labels are ordered by descending
 * quantity), so this preserves position weighting as long as the findings
 * keep label order.
 *
 * It is a weaker input than the real label text, since the model only
 * reports ingredients worth a card, and it is offered as a *prefill* for the
 * editable text field rather than used silently: the admin sees exactly the
 * text the score will be computed from.
 */
export function ingredientTextFromFindings(
  result: WorkerAnalysisResult,
): string {
  return result.ingredientFindings
    .map((finding) => finding.ingredientName.trim())
    .filter((name) => name.length > 0)
    .join(", ");
}

/**
 * A score written into prose — "Βαθμολογείται με 92/100 για την εξαιρετική
 * του σύνθεση." — is the one part of an edited row that the recompute used
 * to leave behind. The PIM assistant is asked for "μία πρόταση που
 * δικαιολογεί τη βαθμολογία", so the number it saw at draft time gets baked
 * into text that `rescoreIngredientsResult` never touches, and an admin who
 * corrected the ingredient list ended up with a card reading 95 above a
 * sentence still arguing for 92.
 *
 * Rewriting the number rather than regenerating the sentence is deliberate:
 * the wording may have been edited by hand after the assistant wrote it, and
 * a save is not the place to throw that away (nor to spend an AI call).
 */
const SCORE_OVER_100 = /\b(\d{1,3})\s*\/\s*100\b/g;

/**
 * "βαθμολογία: 92", "βαθμολογείται με 92" — the same claim without the
 * /100. The lookahead keeps it off numbers SCORE_OVER_100 has already
 * handled, and it only fires right after a form of "βαθμολογ-" so that an
 * unrelated number ("2 γρ. ανά 100 γρ.") is left alone.
 */
const BARE_SCORE = /(βαθμολογ\p{L}*[\s:]+(?:με\s+)?)(\d{1,3})\b(?!\s*\/)/giu;

function hasScoreMention(text: string): boolean {
  SCORE_OVER_100.lastIndex = 0;
  BARE_SCORE.lastIndex = 0;
  return SCORE_OVER_100.test(text) || BARE_SCORE.test(text);
}

/**
 * Drops whole sentences instead of rewriting them when the recompute came
 * back without a score at all: there is no number to substitute, and
 * "Βαθμολογείται με —/100" is worse than saying nothing. `fallback` covers
 * the case where the score claim *was* the entire text.
 */
function withoutScoreSentences(
  text: string,
  fallback: string,
): string {
  const kept = text
    .split(/(?<=[.!;·])\s+/)
    .filter((sentence) => !hasScoreMention(sentence))
    .join(" ")
    .trim();

  return kept.length > 0 ? kept : fallback;
}

/**
 * Brings one free-text field in line with a freshly computed score.
 * Returns the text unchanged when it never mentioned a score.
 */
export function syncScoreMentions(
  text: string,
  score: number | null,
  fallback: string,
): string {
  if (!hasScoreMention(text)) {
    return text;
  }

  if (score === null) {
    return withoutScoreSentences(text, fallback);
  }

  return text
    .replace(SCORE_OVER_100, `${score}/100`)
    .replace(BARE_SCORE, `$1${score}`);
}

/**
 * Applies `syncScoreMentions` to every free-text field of a stored analysis
 * that an admin or the PIM assistant can put a score into, so a save leaves
 * no sentence arguing for the previous number.
 */
export function syncEnvelopeScoreMentions(
  envelope: Record<string, unknown>,
  score: WorkerScore,
): Record<string, unknown> {
  const fallback = verdictByBand[score.band];

  const syncText = (value: unknown): unknown =>
    typeof value === "string"
      ? syncScoreMentions(value, score.score, fallback)
      : value;

  const syncList = (value: unknown): unknown =>
    Array.isArray(value) ? value.map(syncText) : value;

  const executiveSummary = envelope.executiveSummary;

  if (
    typeof executiveSummary !== "object" ||
    executiveSummary === null ||
    Array.isArray(executiveSummary)
  ) {
    return { ...envelope, summary: syncText(envelope.summary) };
  }

  const summary = executiveSummary as Record<string, unknown>;

  return {
    ...envelope,
    summary: syncText(envelope.summary),
    executiveSummary: {
      ...summary,
      overallVerdict: syncText(summary.overallVerdict),
      highlights: syncList(summary.highlights),
      watchOutFor: syncList(summary.watchOutFor),
    },
  };
}
