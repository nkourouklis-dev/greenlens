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
import {
  scoreInterpretation,
  type ScoreNotice,
  type WorkerScore,
} from "./scoring";
import {
  inspectNutritionPanel,
  parseNutritionPanel,
  type NutritionPanel,
} from "./nutritionPanel";
import {
  detectAlcohol,
  parseAlcoholInfo,
  type AlcoholInfo,
} from "./alcohol";
import { cleanIngredientText } from "./ingredientText";
import {
  evaluateNutrition,
  resolveNutritionEvidence,
  scoreFood,
  scoreNutritionOnly,
  sweetenerFrom,
  type FoodWorkerScore,
} from "./foodScore";
import {
  parseNutritionEvidence,
  type NutritionEvidence,
} from "./nutritionFacts";
import { scoreNutrition } from "./nutritionScoring";
import {
  buildNutritionExecutiveSummary,
  buildNutritionInsights,
  type NutritionInsight,
} from "./nutritionInsights";
import type { WorkerNutritionResult } from "./nutritionAnalysis";
import { scoreChemicalComposition } from "./chemicalScoring";
import {
  buildChemicalExecutiveSummary,
  buildChemicalInsights,
  type ChemicalInsight,
} from "./chemicalInsights";
import type { WorkerChemicalResult } from "./chemicalAnalysis";
import type { ExecutiveSummary } from "./ingredientInsights";

/**
 * A verified row's text was read and corrected by a human, so the OCR and
 * extraction confidences that discount a live scan's score don't apply here.
 * The model's own `confidence` still flows through `scoreInterpretation`,
 * which takes the minimum of the three.
 */
const HUMAN_VERIFIED_CONFIDENCE = 1;

export interface StoredLabelContext {
  /** The quantities to score, re-read from the stored table text if any. */
  nutritionPanel: NutritionPanel | null;
  /**
   * What the scan graded the nutrition half from (per-100 facts, source and
   * category tags), as stored. Carries Open Food Facts numbers across a
   * recompute, which cannot fetch or photograph them again — and the
   * category tags even when the label was the source.
   */
  storedEvidence: NutritionEvidence | null;
  alcohol: AlcoholInfo | null;
  notices: ScoreNotice[];
}

export const NUTRITION_NOT_CONSIDERED_NOTICE: ScoreNotice = {
  code: "nutrition_not_considered",
  title: "Ο διατροφικός πίνακας δεν λήφθηκε υπόψη",
  body: "Υπάρχει διατροφικός πίνακας στην ετικέτα, αλλά δεν διαβάστηκε καθαρά. Η βαθμολογία βασίζεται μόνο στη λίστα συστατικών.",
};

export const INGREDIENTS_NOT_CONSIDERED_NOTICE: ScoreNotice = {
  code: "ingredients_not_considered",
  title: "Η λίστα συστατικών δεν λήφθηκε υπόψη",
  body: "Η λίστα συστατικών δεν διαβάστηκε καθαρά. Η βαθμολογία βασίζεται μόνο στον διατροφικό πίνακα.",
};

function textsOf(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : typeof value === "string"
      ? [value]
      : [];
}

/**
 * What a recompute needs beyond the ingredient text, rebuilt from a stored
 * analysis envelope.
 *
 * The table is *re-read* from the raw text it came from whenever that text
 * was stored, rather than replaying the numbers saved with the row: a
 * recompute is how a parser fix (like the 2026-09-16 alcohol-aware energy
 * check) reaches products already in the catalogue. Rows analysed before
 * that text was kept fall back to their saved quantities.
 *
 * Alcohol is taken as stored, else detected in whatever label text the row
 * kept, which for a nutrition row is the whole panel.
 */
export function storedLabelContext(
  stored: Record<string, unknown>,
): StoredLabelContext {
  const labelTexts = [
    ...textsOf(stored.labelTexts),
    ...textsOf(stored.nutritionSourceText),
    ...textsOf(stored.sourceText),
  ];

  const alcohol =
    stored.alcohol !== undefined
      ? parseAlcoholInfo(stored.alcohol)
      : detectAlcohol(labelTexts);

  const tableText =
    typeof stored.nutritionSourceText === "string"
      ? stored.nutritionSourceText
      : null;

  const storedEvidence = parseNutritionEvidence(stored.nutritionEvidence);

  if (tableText === null) {
    return {
      nutritionPanel: parseNutritionPanel(stored.nutritionPanel),
      storedEvidence,
      alcohol,
      notices: [],
    };
  }

  const read = inspectNutritionPanel(tableText, {
    abv: alcohol?.abv ?? null,
  });

  return {
    nutritionPanel: read.panel,
    storedEvidence,
    alcohol,
    notices:
      read.panel === null && read.tableDetected
        ? [NUTRITION_NOT_CONSIDERED_NOTICE]
        : [],
  };
}

export interface RescoreOutcome {
  score: WorkerScore;
  ingredientInsights: IngredientInsight[];
  ruleMatches: RuleMatch[];
  /**
   * The text the score was actually computed from, cleaned. Callers persist
   * this rather than what they passed in, so the stored "Κείμενο συστατικών"
   * and the stored score stay two views of one thing.
   */
  sourceText: string;
}

export async function rescoreIngredientsResult(
  db: D1Like,
  result: WorkerAnalysisResult,
  sourceText: string,
  /**
   * The nutrition quantities the original scan read off the same label
   * (worker/nutritionPanel.ts), carried through the stored analysis. Passing
   * them back in is what makes a PIM save reproduce the scan's score: the
   * recompute never re-runs OCR, so it cannot read the table again, and
   * dropping it would rescore a mixed label as an ingredients-only one.
   */
  nutritionPanel: NutritionPanel | null = null,
  context: StoredLabelContext | null = null,
): Promise<RescoreOutcome> {
  const ruleSet = await loadScoringRules(db);

  // Cleaned first, exactly as a live scan cleans before scoring
  // (analyzeIngredientsCore). Without this the two disagree: a scan joins a
  // line-wrapped "Sodium / Lauryl Sulfate" and charges it, while a save of
  // the same row scored the raw text and missed it — the same product at 71
  // from the scanner and 79 from the PIM. It also matters for text an admin
  // pastes in by hand, which arrives with whatever line breaks it had.
  const cleanedText = cleanIngredientText(sourceText);

  const ruleMatches = matchScoringRules(cleanedText, ruleSet);

  const score = scoreInterpretation(
    cleanedText,
    HUMAN_VERIFIED_CONFIDENCE,
    result,
    {
      extractionConfidence: HUMAN_VERIFIED_CONFIDENCE,
      lowConfidenceReason: null,
      ruleMatches,
      nutritionPanel,
      alcohol: context?.alcohol ?? null,
      notices: context?.notices ?? [],
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

  return {
    score,
    ingredientInsights,
    ruleMatches,
    sourceText: cleanedText,
  };
}

/**
 * The nutrition evidence a recompute grades from: the label's table re-read
 * from its stored text, else Open Food Facts numbers — the ones stored with
 * the scan, or, for a row analysed before they were kept, `freshOffFacts`
 * that the caller fetched for the barcode. Same rules as a scan
 * (resolveNutritionEvidence), which is what keeps the two in agreement.
 */
export function nutritionEvidenceForRecompute(
  context: StoredLabelContext,
  fresh: { facts: NutritionEvidence["facts"] | null; categoryTags: string[] } | null,
): NutritionEvidence | null {
  const stored = context.storedEvidence;

  const storedOffFacts =
    stored?.source === "openfoodfacts" ? stored.facts : null;

  return resolveNutritionEvidence({
    panel: context.nutritionPanel,
    offFacts: storedOffFacts ?? fresh?.facts ?? null,
    categoryTags:
      stored && stored.categoryTags.length > 0
        ? stored.categoryTags
        : (fresh?.categoryTags ?? []),
  });
}

/**
 * The unified counterpart of rescoreIngredientsResult: the ingredient half
 * recomputed exactly as before, then blended with the nutrition half the way
 * a scan blends them (foodScore.ts). Same input, same output.
 */
export async function rescoreFoodIngredients(
  db: D1Like,
  result: WorkerAnalysisResult,
  sourceText: string,
  context: StoredLabelContext,
  evidence: NutritionEvidence | null,
): Promise<RescoreOutcome & { score: FoodWorkerScore }> {
  const ruleSet = await loadScoringRules(db);

  const cleanedText = cleanIngredientText(sourceText);

  const ruleMatches = matchScoringRules(cleanedText, ruleSet);

  const graded = evaluateNutrition(evidence, null).evaluation !== null;

  const ingredientScore = scoreInterpretation(
    cleanedText,
    HUMAN_VERIFIED_CONFIDENCE,
    result,
    {
      extractionConfidence: HUMAN_VERIFIED_CONFIDENCE,
      lowConfidenceReason: null,
      ruleMatches,
      nutritionCoversSugarSalt: graded,
    },
  );

  // As on a scan: an unscoreable ingredient list stays unscored, whatever a
  // database says about the nutrition.
  const score: FoodWorkerScore =
    ingredientScore.score === null
      ? ingredientScore
      : scoreFood({
          ingredientScore,
          nutrition: evidence,
          nonNutritiveSweetener: sweetenerFrom(ruleMatches),
          alcohol: context.alcohol,
          notices: graded ? [] : context.notices,
        });

  const ingredientInsights = await buildIngredientInsights(
    result,
    score,
    db,
    ruleMatches,
  );

  return { score, ingredientInsights, ruleMatches, sourceText: cleanedText };
}

/** The unified counterpart of rescoreNutritionResult. */
export function rescoreFoodNutrition(
  result: WorkerNutritionResult,
  sourceText: string,
  context: StoredLabelContext,
  evidence: NutritionEvidence | null,
): {
  score: WorkerScore;
  nutritionInsights: NutritionInsight[];
  executiveSummary: ExecutiveSummary;
} {
  const score = scoreNutritionOnly({
    evidence,
    alcohol: context.alcohol,
    notices: context.notices,
    text: sourceText,
    ocrConfidence: HUMAN_VERIFIED_CONFIDENCE,
    analysis: result,
    extractionConfidence: HUMAN_VERIFIED_CONFIDENCE,
  });

  return {
    score,
    nutritionInsights: buildNutritionInsights(result, score),
    executiveSummary: buildNutritionExecutiveSummary(result, score),
  };
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

/**
 * The nutrition equivalent of rescoreIngredientsResult: a fresh score for an
 * already-analyzed nutrition row, from the panel text it was scored from,
 * with no OCR and no model call.
 *
 * This had no equivalent until the nutrition path started persisting
 * `sourceText`, which is why a nutrition row whose numbers came back wrong
 * could only be fixed by re-running the whole analysis. The quantities are
 * read deterministically (nutritionPanel.ts, via scoreNutrition), so the
 * recompute reproduces exactly what a scan of the same text produces.
 */
export async function rescoreNutritionResult(
  result: WorkerNutritionResult,
  sourceText: string,
  context: StoredLabelContext | null = null,
): Promise<{
  score: WorkerScore;
  nutritionInsights: NutritionInsight[];
  executiveSummary: ExecutiveSummary;
}> {
  const score = scoreNutrition(
    sourceText,
    HUMAN_VERIFIED_CONFIDENCE,
    result,
    {
      extractionConfidence: HUMAN_VERIFIED_CONFIDENCE,
      alcohol: context?.alcohol ?? null,
      notices: context?.notices ?? [],
    },
  );

  return {
    score,
    // Rebuilt beside the score for the same reason the ingredient cards are:
    // every card's scoreImpact is read out of score.deductions.
    nutritionInsights: buildNutritionInsights(result, score),
    executiveSummary: buildNutritionExecutiveSummary(result, score),
  };
}

/**
 * The chemical-composition counterpart. Same shape as the ingredients one —
 * a chemical label is a list of substances and scores through the same
 * curated rule table — so it needs D1 for the rules, and the text is cleaned
 * first for the same reason: a scan cleans before scoring, and a recompute
 * that did not would disagree with it.
 */
export async function rescoreChemicalResult(
  db: D1Like,
  result: WorkerChemicalResult,
  sourceText: string,
): Promise<{
  score: WorkerScore;
  chemicalInsights: ChemicalInsight[];
  executiveSummary: ExecutiveSummary;
  sourceText: string;
}> {
  const cleanedText = cleanIngredientText(sourceText);

  const ruleSet = await loadScoringRules(db);

  const ruleMatches = matchScoringRules(cleanedText, ruleSet);

  const score = scoreChemicalComposition(
    cleanedText,
    HUMAN_VERIFIED_CONFIDENCE,
    result,
    {
      extractionConfidence: HUMAN_VERIFIED_CONFIDENCE,
      ruleMatches,
    },
  );

  return {
    score,
    chemicalInsights: buildChemicalInsights(result, score),
    executiveSummary: buildChemicalExecutiveSummary(result, score),
    sourceText: cleanedText,
  };
}
