import type {
  ExecutiveSummary,
  IngredientCategory,
  IngredientFinding,
  IngredientInsight,
  IngredientRating,
  ScoreBreakdown,
  StructuredAnalysis,
} from "../types";

const verdictByBand: Record<ScoreBreakdown["band"], string> = {
  excellent: "Εξαιρετική επιλογή",
  good: "Καλή επιλογή",
  moderate: "Μέτρια επιλογή",
  attention: "Χρειάζεται προσοχή",
  high_attention: "Πολλές επισημάνσεις",
  insufficient_data: "Ανεπαρκή στοιχεία",
};

const ratingBySeverity: Record<IngredientFinding["severity"], IngredientRating> = {
  positive: "good",
  info: "neutral",
  attention: "caution",
  high_attention: "caution",
  unknown: "neutral",
};

const categoryKeywords: Array<[IngredientCategory, string[]]> = [
  ["fragrance", ["άρωμα", "αρωμα", "fragrance", "parfum"]],
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

/**
 * Rebuilds insight cards for a history item that predates the
 * `ingredientInsights` API field. Only reads data that is already stored
 * locally (structured findings + score deductions) — never contacts the
 * network and never computes a new score.
 */
export function deriveIngredientInsights(
  structured: StructuredAnalysis,
  score: ScoreBreakdown,
): IngredientInsight[] {
  const deductionsByCode = new Map(
    score.deductions.map((deduction) => [deduction.code, deduction]),
  );

  const seen = new Set<string>();
  const insights: IngredientInsight[] = [];

  for (const finding of structured.ingredientFindings) {
    if (seen.has(finding.normalizedName)) {
      continue;
    }

    seen.add(finding.normalizedName);

    const code = `${finding.severity}:${finding.normalizedName}`;
    const deduction = deductionsByCode.get(code) ?? null;
    const rating = ratingBySeverity[finding.severity] ?? "neutral";

    insights.push({
      name: finding.ingredientName,
      normalizedName: finding.normalizedName,
      category: inferCategoryFromText(`${finding.title} ${finding.explanation}`),
      rating,
      scoreImpact: deduction ? -deduction.points : 0,
      shortDescription: finding.title,
      whyRated: finding.explanation,
      benefits: rating === "good" ? [finding.explanation] : [],
      concerns: rating === "caution" ? [finding.explanation] : [],
      aliases: [],
      evidenceLevel: finding.evidenceType === "none" ? "low" : finding.confidence >= 0.7 ? "high" : "medium",
      evidenceAvailable: finding.evidenceType !== "none",
    });
  }

  return insights;
}

const PARABEN_PATTERN = /paraben/;
const SULFATE_PATTERN = /(sulfate|sulphate)/;

export function deriveExecutiveSummary(
  structured: StructuredAnalysis,
  score: ScoreBreakdown,
  insights: IngredientInsight[],
): ExecutiveSummary {
  let safeIngredients = 0;
  let cautionIngredients = 0;
  let highImpactIngredients = 0;

  for (const finding of structured.ingredientFindings) {
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

  const highlights = [...structured.positives];

  if (!hasParaben) {
    highlights.push("Δεν εντοπίστηκαν parabens");
  }

  if (!hasSulfate) {
    highlights.push("Δεν εντοπίστηκαν sulfates");
  }

  const watchOutFor = [...structured.attentionItems];

  if (structured.potentialAllergens.length > 0) {
    watchOutFor.push("Περιέχει πιθανά αλλεργιογόνα αρωμάτων");
  }

  return {
    overallVerdict: verdictByBand[score.band],
    safeIngredients,
    cautionIngredients,
    highImpactIngredients,
    highlights: Array.from(new Set(highlights)),
    watchOutFor: Array.from(new Set(watchOutFor)),
  };
}
