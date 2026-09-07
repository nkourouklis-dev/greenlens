import {
  isConfidence,
  isEvidenceType,
  isRecord,
  isSafeUrl,
  isSeverity,
  isStrings,
  isText,
  parseJson,
  type EvidenceType,
  type FindingSeverity,
} from "./analysis";

export interface NutritionFinding {
  nutrient: string;
  normalizedName: string;
  amount: string | null;
  severity: FindingSeverity;
  title: string;
  explanation: string;
  evidenceType: EvidenceType;
  sourceName: string | null;
  sourceUrl: string | null;
  confidence: number;
}

export type NutritionSubtype = "human_food" | "pet_food" | "unknown";

export interface WorkerNutritionResult {
  subtype: NutritionSubtype;
  summary: string;
  positives: string[];
  attentionItems: string[];
  nutritionFindings: NutritionFinding[];
  insufficientDataReasons: string[];
  confidence: number;
}

export function parseNutritionAnalysis(
  value: unknown,
): WorkerNutritionResult | null {
  const candidate =
    typeof value === "string"
      ? parseJson(value)
      : isRecord(value) && typeof value.response === "string"
        ? parseJson(value.response)
        : null;

  if (
    !isRecord(candidate) ||
    !isSubtype(candidate.subtype) ||
    !isText(candidate.summary) ||
    !isStrings(candidate.positives) ||
    !isStrings(candidate.attentionItems) ||
    !isStrings(candidate.insufficientDataReasons) ||
    !isConfidence(candidate.confidence) ||
    !Array.isArray(candidate.nutritionFindings)
  ) {
    return null;
  }

  const findings = candidate.nutritionFindings.map(parseNutritionFinding);

  if (findings.some((finding) => finding === null)) {
    return null;
  }

  return {
    subtype: candidate.subtype,
    summary: candidate.summary,
    positives: candidate.positives,
    attentionItems: candidate.attentionItems,
    nutritionFindings: findings.filter(
      (finding): finding is NutritionFinding => finding !== null,
    ),
    insufficientDataReasons: candidate.insufficientDataReasons,
    confidence: candidate.confidence,
  };
}

function parseNutritionFinding(value: unknown): NutritionFinding | null {
  if (
    !isRecord(value) ||
    !isText(value.nutrient) ||
    !isText(value.normalizedName) ||
    !(value.amount === null || typeof value.amount === "string") ||
    !isSeverity(value.severity) ||
    !isText(value.title) ||
    !isText(value.explanation) ||
    !isEvidenceType(value.evidenceType) ||
    !(value.sourceName === null || typeof value.sourceName === "string") ||
    !(value.sourceUrl === null || typeof value.sourceUrl === "string") ||
    !isConfidence(value.confidence)
  ) {
    return null;
  }

  const sourceUrl = value.sourceUrl;

  if (sourceUrl !== null && !isSafeUrl(sourceUrl)) {
    return null;
  }

  if (
    value.evidenceType === "none" &&
    (value.sourceName !== null ||
      sourceUrl !== null ||
      value.severity === "high_attention")
  ) {
    return null;
  }

  return {
    nutrient: value.nutrient,
    normalizedName: value.normalizedName,
    amount: value.amount,
    severity: value.severity,
    title: value.title,
    explanation: value.explanation,
    evidenceType: value.evidenceType,
    sourceName: value.sourceName,
    sourceUrl,
    confidence: value.confidence,
  };
}

function isSubtype(value: unknown): value is NutritionSubtype {
  return (
    value === "human_food" ||
    value === "pet_food" ||
    value === "unknown"
  );
}
