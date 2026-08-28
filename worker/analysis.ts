export interface WorkerIngredient {
  id: string;
  originalName: string;
  normalizedName: string;
}

export interface WorkerAnalysisResult {
  productType: "food" | "cosmetic" | "unknown";
  summary: string;
  positives: string[];
  attentionItems: string[];
  potentialAllergens: string[];
  ingredientFindings: Array<{ ingredientName: string; normalizedName: string; severity: "positive" | "info" | "attention" | "high_attention" | "unknown"; title: string; explanation: string; evidenceType: "regulatory" | "scientific" | "label" | "none"; sourceName: string | null; sourceUrl: string | null; confidence: number }>;
  insufficientDataReasons: string[];
  confidence: number;
}

export function parseAnalysis(value: unknown): WorkerAnalysisResult | null {
  const candidate = typeof value === "string" ? parseJson(value) : isRecord(value) && typeof value.response === "string" ? parseJson(value.response) : null;
  if (!isRecord(candidate) || !isProductType(candidate.productType) || !isText(candidate.summary) || !isStrings(candidate.positives) || !isStrings(candidate.attentionItems) || !isStrings(candidate.potentialAllergens) || !isStrings(candidate.insufficientDataReasons) || !isConfidence(candidate.confidence) || !Array.isArray(candidate.ingredientFindings)) return null;
  const findings = candidate.ingredientFindings.map(parseFinding);
  if (findings.some((finding) => finding === null)) return null;
  return { productType: candidate.productType, summary: candidate.summary, positives: candidate.positives, attentionItems: candidate.attentionItems, potentialAllergens: candidate.potentialAllergens, ingredientFindings: findings.filter((finding): finding is WorkerAnalysisResult["ingredientFindings"][number] => finding !== null), insufficientDataReasons: candidate.insufficientDataReasons, confidence: candidate.confidence };
}

function parseFinding(value: unknown): WorkerAnalysisResult["ingredientFindings"][number] | null {
  if (!isRecord(value) || !isText(value.ingredientName) || !isText(value.normalizedName) || !isSeverity(value.severity) || !isText(value.title) || !isText(value.explanation) || !isEvidenceType(value.evidenceType) || !(value.sourceName === null || typeof value.sourceName === "string") || !(value.sourceUrl === null || typeof value.sourceUrl === "string") || !isConfidence(value.confidence)) return null;
  const sourceUrl = value.sourceUrl;
  if (sourceUrl !== null && !isSafeUrl(sourceUrl)) return null;
  if (value.evidenceType === "none" && (value.sourceName !== null || sourceUrl !== null || value.severity === "high_attention")) return null;
  return { ingredientName: value.ingredientName, normalizedName: value.normalizedName, severity: value.severity, title: value.title, explanation: value.explanation, evidenceType: value.evidenceType, sourceName: value.sourceName, sourceUrl, confidence: value.confidence };
}

function parseJson(value: string): unknown { try { return JSON.parse(value) as unknown; } catch { return null; } }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null; }
function isText(value: unknown): value is string { return typeof value === "string" && value.trim().length > 0; }
function isStrings(value: unknown): value is string[] { return Array.isArray(value) && value.every(isText); }
function isConfidence(value: unknown): value is number { return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1; }
function isProductType(value: unknown): value is WorkerAnalysisResult["productType"] { return value === "food" || value === "cosmetic" || value === "unknown"; }
function isSeverity(value: unknown): value is WorkerAnalysisResult["ingredientFindings"][number]["severity"] { return value === "positive" || value === "info" || value === "attention" || value === "high_attention" || value === "unknown"; }
function isEvidenceType(value: unknown): value is WorkerAnalysisResult["ingredientFindings"][number]["evidenceType"] { return value === "regulatory" || value === "scientific" || value === "label" || value === "none"; }
function isSafeUrl(value: string): boolean { try { return new URL(value).protocol === "https:"; } catch { return false; } }