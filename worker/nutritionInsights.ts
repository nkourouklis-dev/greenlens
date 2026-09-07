import type { WorkerScore } from "./scoring";
import type { ExecutiveSummary } from "./ingredientInsights";
import type { NutritionFinding, WorkerNutritionResult } from "./nutritionAnalysis";

export type NutritionRating = "good" | "caution" | "neutral";
export type EvidenceLevel = "high" | "medium" | "low";

export interface NutritionInsight {
  name: string;
  normalizedName: string;
  amount: string | null;
  rating: NutritionRating;
  scoreImpact: number;
  description: string;
  whyRated: string;
  evidenceLevel: EvidenceLevel;
  evidenceAvailable: boolean;
}

const verdictByBand: Record<WorkerScore["band"], string> = {
  excellent: "Εξαιρετική επιλογή",
  good: "Καλή επιλογή",
  moderate: "Μέτρια επιλογή",
  attention: "Χρειάζεται προσοχή",
  high_attention: "Πολλές επισημάνσεις",
  insufficient_data: "Ανεπαρκή στοιχεία",
};

const ratingBySeverity: Record<NutritionFinding["severity"], NutritionRating> = {
  positive: "good",
  info: "neutral",
  attention: "caution",
  high_attention: "caution",
  unknown: "neutral",
};

function inferEvidenceLevel(finding: NutritionFinding): EvidenceLevel {
  if (finding.evidenceType === "none") {
    return "low";
  }

  if (finding.evidenceType === "regulatory" || finding.evidenceType === "scientific") {
    return finding.confidence >= 0.6 ? "high" : "medium";
  }

  return finding.confidence >= 0.75 ? "medium" : "low";
}

/**
 * Same pattern as buildIngredientInsights (worker/ingredientInsights.ts):
 * score.deductions is the single source of truth for scoreImpact, matched
 * via the exact `severity:normalizedName` code nutritionScoring.ts produces.
 */
export function buildNutritionInsights(
  analysis: WorkerNutritionResult,
  score: WorkerScore,
): NutritionInsight[] {
  const deductionsByCode = new Map(
    score.deductions.map((deduction) => [deduction.code, deduction]),
  );

  const seen = new Set<string>();
  const insights: NutritionInsight[] = [];

  for (const finding of analysis.nutritionFindings) {
    if (seen.has(finding.normalizedName)) {
      continue;
    }

    seen.add(finding.normalizedName);

    const code = `${finding.severity}:${finding.normalizedName}`;
    const deduction = deductionsByCode.get(code) ?? null;
    const rating = ratingBySeverity[finding.severity] ?? "neutral";

    insights.push({
      name: finding.nutrient,
      normalizedName: finding.normalizedName,
      amount: finding.amount,
      rating,
      scoreImpact: deduction ? -deduction.points : 0,
      description: finding.title,
      whyRated: finding.explanation,
      evidenceLevel: inferEvidenceLevel(finding),
      evidenceAvailable: finding.evidenceType !== "none",
    });
  }

  return insights;
}

/**
 * Reuses the ingredients path's ExecutiveSummary shape (its "Ασφαλή /
 * Προσοχή / Υψηλή προσοχή" labels are already domain-neutral), just counted
 * over nutrition findings instead of ingredient findings.
 */
export function buildNutritionExecutiveSummary(
  analysis: WorkerNutritionResult,
  score: WorkerScore,
): ExecutiveSummary {
  let safeIngredients = 0;
  let cautionIngredients = 0;
  let highImpactIngredients = 0;

  for (const finding of analysis.nutritionFindings) {
    if (finding.severity === "positive" || finding.severity === "info") {
      safeIngredients += 1;
    } else if (finding.severity === "attention") {
      cautionIngredients += 1;
    } else if (finding.severity === "high_attention") {
      highImpactIngredients += 1;
    }
  }

  return {
    overallVerdict: verdictByBand[score.band],
    safeIngredients,
    cautionIngredients,
    highImpactIngredients,
    highlights: dedupe(analysis.positives),
    watchOutFor: dedupe(analysis.attentionItems),
  };
}

function dedupe(values: string[]): string[] {
  return Array.from(new Set(values));
}
