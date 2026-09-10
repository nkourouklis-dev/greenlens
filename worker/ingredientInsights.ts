import type { WorkerAnalysisResult } from "./analysis";
import type { WorkerScore } from "./scoring";
import { withoutAllergenOnlyItems } from "./allergens";
import {
  lookupIngredientKnowledgeBatch,
  type D1Like,
  type EvidenceLevel,
  type IngredientCategory,
} from "./ingredientKnowledge";
import type { RuleMatch } from "./ingredientRules";

export type IngredientRating = "good" | "caution" | "neutral";

export interface IngredientInsight {
  name: string;
  normalizedName: string;
  category: IngredientCategory;
  rating: IngredientRating;
  /**
   * Always <= 0. Sourced only from a matching entry in
   * `WorkerScore.deductions` — this function never invents or recomputes a
   * number of its own. Ingredients with no matching deduction get 0.
   */
  scoreImpact: number;
  shortDescription: string;
  whyRated: string;
  benefits: string[];
  concerns: string[];
  aliases: string[];
  evidenceLevel: EvidenceLevel;
  evidenceAvailable: boolean;
}

export interface ExecutiveSummary {
  overallVerdict: string;
  safeIngredients: number;
  cautionIngredients: number;
  highImpactIngredients: number;
  highlights: string[];
  watchOutFor: string[];
}

type Finding = WorkerAnalysisResult["ingredientFindings"][number];

export const verdictByBand: Record<WorkerScore["band"], string> = {
  excellent: "Εξαιρετική επιλογή",
  good: "Καλή επιλογή",
  moderate: "Μέτρια επιλογή",
  attention: "Χρειάζεται προσοχή",
  high_attention: "Πολλές επισημάνσεις",
  insufficient_data: "Ανεπαρκή στοιχεία",
};

const ratingBySeverity: Record<Finding["severity"], IngredientRating> = {
  positive: "good",
  info: "neutral",
  attention: "caution",
  high_attention: "caution",
  unknown: "neutral",
};

// Lightweight, deterministic keyword fallback used only when an ingredient
// has no static registry entry. It never looks at the score — it only
// guesses a display category from the AI's own free-text explanation, so
// the UI still has something better than "other" to show.
const categoryKeywords: Array<[IngredientCategory, string[]]> = [
  ["fragrance", ["άρωμα", "αρωμα", "fragrance", "parfum", "αρωματ"]],
  ["preservative", ["συντηρητικ", "preservative"]],
  ["colorant", ["χρωστικ", "colorant", "colour", "color"]],
  ["surfactant", ["απορρυπαντ", "αφριστικ", "surfactant", "sulfate", "sulphate"]],
  ["humectant", ["ενυδατ", "humectant", "moistur"]],
  ["emollient", ["μαλακτικ", "emollient"]],
  ["antioxidant", ["αντιοξειδωτικ", "antioxidant", "vitamin e", "vitamin c"]],
  ["active", ["δραστικ", "active ingredient", "retinol", "niacinamide"]],
];

function inferCategoryFromText(text: string): IngredientCategory {
  const normalized = text.toLowerCase();

  for (const [category, keywords] of categoryKeywords) {
    if (keywords.some((keyword) => normalized.includes(keyword))) {
      return category;
    }
  }

  return "other";
}

function inferEvidenceLevel(finding: Finding): EvidenceLevel {
  if (finding.evidenceType === "none") {
    return "low";
  }

  if (finding.evidenceType === "regulatory" || finding.evidenceType === "scientific") {
    return finding.confidence >= 0.6 ? "high" : "medium";
  }

  return finding.confidence >= 0.75 ? "medium" : "low";
}

/**
 * Builds one IngredientInsight per distinct ingredient found by the AI.
 * `score.deductions` is the single source of truth for scoreImpact: this
 * function matches each finding to its deduction and never derives a number
 * any other way.
 *
 * Two linking paths, because deductions now have two possible origins:
 *
 *   - Rule deductions are keyed on a curated ingredient ("high_concern:sugar")
 *     while the model names the same thing however it likes ("Γλυκαντικά
 *     (Κυκλαμικό νάτριο...)"), so those are matched by looking for the alias
 *     that actually matched the label inside the finding's own text.
 *   - Fallback deductions still carry the model's own
 *     `severity:normalizedName`, so those match exactly.
 *
 * Without the first path every ingredient card would report a scoreImpact of
 * 0 while the score breakdown showed real deductions — the same class of
 * self-contradicting output that the no-problems bonus used to produce.
 *
 * Curated knowledge is fetched from D1 in one batched pair of queries
 * (lookupIngredientKnowledgeBatch) covering every distinct ingredient in
 * this analysis, rather than one query per ingredient.
 */
export async function buildIngredientInsights(
  analysis: WorkerAnalysisResult,
  score: WorkerScore,
  db: D1Like,
  ruleMatches: RuleMatch[] = [],
): Promise<IngredientInsight[]> {
  const deductionsByCode = new Map(
    score.deductions.map((deduction) => [deduction.code, deduction]),
  );

  const ruleDeductions = ruleMatches.flatMap((match) => {
    const deduction = deductionsByCode.get(
      `${match.rule.severity}:${match.rule.normalizedName}`,
    );

    return deduction
      ? [{ alias: match.matchedAlias, deduction }]
      : [];
  });

  // A deduction belongs to one ingredient card. Without this, a label that
  // mentions an ingredient twice would show the same penalty on both cards
  // and appear to have been charged twice.
  const claimed = new Set<string>();

  const seen = new Set<string>();

  const dedupedFindings = analysis.ingredientFindings.filter((finding) => {
    if (seen.has(finding.normalizedName)) {
      return false;
    }

    seen.add(finding.normalizedName);
    return true;
  });

  const knowledgeByName = await lookupIngredientKnowledgeBatch(
    db,
    dedupedFindings.map((finding) => finding.normalizedName),
  );

  return dedupedFindings.map((finding) => {
    const code = `${finding.severity}:${finding.normalizedName}`;

    const haystack =
      `${finding.ingredientName} ${finding.normalizedName}`.toLowerCase();

    const viaRule = ruleDeductions.find(
      (entry) =>
        !claimed.has(entry.deduction.code) &&
        haystack.includes(entry.alias),
    );

    const deduction =
      deductionsByCode.get(code) ??
      viaRule?.deduction ??
      null;

    if (deduction) {
      claimed.add(deduction.code);
    }

    const knowledge = knowledgeByName.get(finding.normalizedName) ?? null;

    // A rule can disagree with the model about how serious an ingredient is,
    // and the rule wins — a card must not read "neutral" next to a penalty.
    const rating = deduction
      ? "caution"
      : (ratingBySeverity[finding.severity] ?? "neutral");

    return {
      name: finding.ingredientName,
      normalizedName: finding.normalizedName,
      category: knowledge?.category ?? inferCategoryFromText(`${finding.title} ${finding.explanation}`),
      rating,
      scoreImpact: deduction ? -deduction.points : 0,
      shortDescription: knowledge?.shortDescription ?? finding.title,
      whyRated: finding.explanation,
      // No fallback to [finding.explanation] here: whyRated above already
      // *is* finding.explanation, so that fallback used to render the
      // model's one sentence twice — once as the card body, once again
      // under "Οφέλη"/"ΣΗΜΕΙΑ ΠΡΟΣΟΧΗΣ" — for every ingredient with no
      // curated D1 match. An empty list here just means the card shows no
      // bullets beyond whyRated, which is the correct amount of
      // information when there's nothing extra to add.
      benefits: knowledge?.benefits ?? [],
      concerns: knowledge?.concerns ?? [],
      aliases: knowledge?.aliases ?? [],
      evidenceLevel: knowledge?.evidenceLevel ?? inferEvidenceLevel(finding),
      evidenceAvailable: finding.evidenceType !== "none",
    };
  });
}

const PARABEN_PATTERN = /paraben/;
const SULFATE_PATTERN = /(sulfate|sulphate)/;

/**
 * Pure aggregation over data the Worker already produced (the AI's
 * classification and its own score). No new judgement is made here — this
 * only counts and labels what already exists, the same way the frontend
 * used to count severities locally before this endpoint returned it ready
 * to render.
 */
export function buildExecutiveSummary(
  analysis: WorkerAnalysisResult,
  score: WorkerScore,
  insights: IngredientInsight[],
): ExecutiveSummary {
  let safeIngredients = 0;
  let cautionIngredients = 0;
  let highImpactIngredients = 0;

  for (const finding of analysis.ingredientFindings) {
    if (finding.severity === "positive" || finding.severity === "info") {
      safeIngredients += 1;
    } else if (finding.severity === "attention") {
      cautionIngredients += 1;
    } else if (finding.severity === "high_attention") {
      highImpactIngredients += 1;
    }
  }

  const hasParaben = insights.some((insight) => PARABEN_PATTERN.test(insight.normalizedName));
  const hasSulfate = insights.some((insight) => SULFATE_PATTERN.test(insight.normalizedName));

  const highlights = [...analysis.positives];

  if (!hasParaben) {
    highlights.push("Δεν εντοπίστηκαν parabens");
  }

  if (!hasSulfate) {
    highlights.push("Δεν εντοπίστηκαν sulfates");
  }

  // Declared allergens are no longer listed here: they get their own
  // single notice above the summary (see worker/allergens.ts), so repeating
  // them as a "watch out" line would be the same noise in a second place.
  const watchOutFor = withoutAllergenOnlyItems(analysis.attentionItems);

  return {
    overallVerdict: verdictByBand[score.band],
    safeIngredients,
    cautionIngredients,
    highImpactIngredients,
    highlights: dedupe(highlights),
    watchOutFor: dedupe(watchOutFor),
  };
}

function dedupe(values: string[]): string[] {
  return Array.from(new Set(values));
}
