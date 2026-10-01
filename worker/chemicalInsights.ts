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

// Thresholds for the positives we can state without the model: sodium at or
// below 20 mg/L is the level natural mineral waters use for "suitable for a
// low-sodium diet"; nitrate at or below 10 mg/L is well under the 50 mg/L
// drinking-water limit.
const LOW_SODIUM_MG_L = 20;
const LOW_NITRATE_MG_L = 10;

const MEASURED_UNIT = /^\s*([<≤]?)\s*(\d+(?:[.,]\d+)?)\s*(?:mg\s*\/\s*l|ppm)\s*$/i;

function milligramsPerLitre(finding: ChemicalFinding): number | null {
  const match = finding.concentration?.match(MEASURED_UNIT);

  return match ? Number(match[2].replace(",", ".")) : null;
}

function describesSubstance(finding: ChemicalFinding, pattern: RegExp): boolean {
  return pattern.test(`${finding.normalizedName} ${finding.substance}`);
}

/**
 * A positive that only names the kind of label ("Χημική ανάλυση") says
 * nothing about the water, so it is dropped rather than shown.
 */
function isGenericPositive(value: string): boolean {
  return /^(η\s+)?χημικ[ήη]\s+(ανάλυση|σύσταση)\.?$/i.test(value.trim());
}

/**
 * Positives backed by the printed values, followed by whatever specific
 * positives the model gave. The model's own wording is kept only when it is
 * not a bare category name.
 */
export function refineChemicalPositives(
  analysis: WorkerChemicalResult,
): WorkerChemicalResult {
  const derived: string[] = [];

  for (const finding of analysis.chemicalFindings) {
    const value = milligramsPerLitre(finding);

    if (value === null) {
      continue;
    }

    const printed = finding.concentration?.trim() ?? "";

    if (
      describesSubstance(finding, /sodium|νάτρι|νατρι/i) &&
      value <= LOW_SODIUM_MG_L
    ) {
      derived.push(`Χαμηλό νάτριο (${printed})`);
    }

    if (
      describesSubstance(finding, /nitrate|νιτρικ/i) &&
      value <= LOW_NITRATE_MG_L
    ) {
      derived.push(`Χαμηλά νιτρικά (${printed})`);
    }
  }

  const positives = dedupe([
    ...derived,
    ...analysis.positives.filter((positive) => !isGenericPositive(positive)),
  ]);

  return { ...analysis, positives };
}

function dedupe(values: string[]): string[] {
  return Array.from(new Set(values));
}
