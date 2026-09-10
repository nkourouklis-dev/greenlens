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
