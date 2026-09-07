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

export interface ChemicalFinding {
  substance: string;
  normalizedName: string;
  concentration: string | null;
  referenceLimit: string | null;
  severity: FindingSeverity;
  title: string;
  explanation: string;
  evidenceType: EvidenceType;
  sourceName: string | null;
  sourceUrl: string | null;
  confidence: number;
}

export type ChemicalSourceType =
  | "drinking_water"
  | "mineral_water"
  | "raw_material"
  | "unknown";

export interface WorkerChemicalResult {
  sourceType: ChemicalSourceType;
  summary: string;
  positives: string[];
  attentionItems: string[];
  chemicalFindings: ChemicalFinding[];
  insufficientDataReasons: string[];
  confidence: number;
}

export function parseChemicalAnalysis(
  value: unknown,
): WorkerChemicalResult | null {
  const candidate =
    typeof value === "string"
      ? parseJson(value)
      : isRecord(value) && typeof value.response === "string"
        ? parseJson(value.response)
        : null;

  if (
    !isRecord(candidate) ||
    !isSourceType(candidate.sourceType) ||
    !isText(candidate.summary) ||
    !isStrings(candidate.positives) ||
    !isStrings(candidate.attentionItems) ||
    !isStrings(candidate.insufficientDataReasons) ||
    !isConfidence(candidate.confidence) ||
    !Array.isArray(candidate.chemicalFindings)
  ) {
    return null;
  }

  const findings = candidate.chemicalFindings.map(parseChemicalFinding);

  if (findings.some((finding) => finding === null)) {
    return null;
  }

  return {
    sourceType: candidate.sourceType,
    summary: candidate.summary,
    positives: candidate.positives,
    attentionItems: candidate.attentionItems,
    chemicalFindings: findings.filter(
      (finding): finding is ChemicalFinding => finding !== null,
    ),
    insufficientDataReasons: candidate.insufficientDataReasons,
    confidence: candidate.confidence,
  };
}

function parseChemicalFinding(value: unknown): ChemicalFinding | null {
  if (
    !isRecord(value) ||
    !isText(value.substance) ||
    !isText(value.normalizedName) ||
    !(value.concentration === null || typeof value.concentration === "string") ||
    !(value.referenceLimit === null || typeof value.referenceLimit === "string") ||
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
    substance: value.substance,
    normalizedName: value.normalizedName,
    concentration: value.concentration,
    referenceLimit: value.referenceLimit,
    severity: value.severity,
    title: value.title,
    explanation: value.explanation,
    evidenceType: value.evidenceType,
    sourceName: value.sourceName,
    sourceUrl,
    confidence: value.confidence,
  };
}

function isSourceType(value: unknown): value is ChemicalSourceType {
  return (
    value === "drinking_water" ||
    value === "mineral_water" ||
    value === "raw_material" ||
    value === "unknown"
  );
}
