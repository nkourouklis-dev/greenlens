import type { WorkerScore } from "./scoring";
import type { ExecutiveSummary } from "./ingredientInsights";
import type { ChemicalFinding, WorkerChemicalResult } from "./chemicalAnalysis";

export type ChemicalRating = "good" | "caution" | "neutral";
export type EvidenceLevel = "high" | "medium" | "low";

export interface ChemicalInsight {
  substance: string;
  normalizedName: string;
  concentration: string | null;
  referenceLimit: string | null;
  rating: ChemicalRating;
  scoreImpact: number;
  description: string;
  whyRated: string;
  evidenceLevel: EvidenceLevel;
  evidenceAvailable: boolean;
}

const verdictByBand: Record<WorkerScore["band"], string> = {
  excellent: "Εξαιρετική σύσταση",
  good: "Καλή σύσταση",
  moderate: "Μέτρια σύσταση",
  attention: "Χρειάζεται προσοχή",
  high_attention: "Πολλές επισημάνσεις",
  insufficient_data: "Ανεπαρκή στοιχεία",
};

const ratingBySeverity: Record<ChemicalFinding["severity"], ChemicalRating> = {
  positive: "good",
  info: "neutral",
  attention: "caution",
  high_attention: "caution",
  unknown: "neutral",
};

function inferEvidenceLevel(finding: ChemicalFinding): EvidenceLevel {
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
 * via the exact `severity:normalizedName` code chemicalScoring.ts produces.
 */
export function buildChemicalInsights(
  analysis: WorkerChemicalResult,
  score: WorkerScore,
): ChemicalInsight[] {
  const deductionsByCode = new Map(
    score.deductions.map((deduction) => [deduction.code, deduction]),
  );

  const seen = new Set<string>();
  const insights: ChemicalInsight[] = [];

  for (const finding of analysis.chemicalFindings) {
    if (seen.has(finding.normalizedName)) {
      continue;
    }

    seen.add(finding.normalizedName);

    const code = `${finding.severity}:${finding.normalizedName}`;
    const deduction = deductionsByCode.get(code) ?? null;
    const rating = ratingBySeverity[finding.severity] ?? "neutral";

    insights.push({
      substance: finding.substance,
      normalizedName: finding.normalizedName,
      concentration: finding.concentration,
      referenceLimit: finding.referenceLimit,
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
 * over chemical findings instead of ingredient findings.
 */
export function buildChemicalExecutiveSummary(
  analysis: WorkerChemicalResult,
  score: WorkerScore,
): ExecutiveSummary {
  let safeIngredients = 0;
  let cautionIngredients = 0;
  let highImpactIngredients = 0;

  for (const finding of analysis.chemicalFindings) {
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
