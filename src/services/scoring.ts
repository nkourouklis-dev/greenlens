import { minimumOcrConfidence, scoreRules, scoringVersion } from "./scoringConfig";
import type { NormalizedIngredient, ScoreBreakdown, ScoreDeduction, StructuredAnalysis } from "../types";

export function scoreAnalysis(text: string, ingredients: NormalizedIngredient[], ocrConfidence: number, analysis: StructuredAnalysis | null): ScoreBreakdown {
  const reasons: string[] = [];
  if (!text.trim() || ingredients.length === 0) reasons.push("Δεν υπάρχει επιβεβαιωμένη λίστα συστατικών.");
  if (ocrConfidence < minimumOcrConfidence) reasons.push("Η ανάγνωση της ετικέτας έχει χαμηλή εμπιστοσύνη.");
  if (!analysis || analysis.productType === "unknown") reasons.push("Δεν αναγνωρίστηκε αξιόπιστα ο τύπος προϊόντος.");
  if (analysis?.insufficientDataReasons.length) reasons.push(...analysis.insufficientDataReasons);
  if (analysis?.ingredientFindings.some((finding) => finding.severity === "high_attention" && finding.evidenceType === "none")) reasons.push("Λείπει επαρκές τεκμήριο για σημαντική επισήμανση.");
  if (reasons.length) return insufficient(reasons, ocrConfidence);

  const completedAnalysis = analysis;
  if (!completedAnalysis) return insufficient(["Δεν υπάρχει έγκυρη δομημένη ανάλυση."], ocrConfidence);
  const deductions = buildDeductions(ingredients, completedAnalysis.ingredientFindings);
  const score = Math.max(0, Math.min(100, 100 - deductions.reduce((total, deduction) => total + deduction.points, 0)));
  return { score, band: toBand(score), deductions, bonuses: [], confidence: Math.min(ocrConfidence, completedAnalysis.confidence), insufficientDataReasons: [], scoringVersion };
}

function buildDeductions(ingredients: NormalizedIngredient[], findings: StructuredAnalysis["ingredientFindings"]): ScoreDeduction[] {
  const ingredientByName = new Map(ingredients.map((ingredient) => [ingredient.normalizedName, ingredient.id]));
  const usedCodes = new Set<string>();
  return findings.flatMap((finding) => {
    if (finding.severity !== "attention" && finding.severity !== "high_attention") return [];
    if (finding.evidenceType === "none") return [];
    const code = `${finding.severity}:${finding.normalizedName}`;
    if (usedCodes.has(code)) return [];
    usedCodes.add(code);
    const rule = finding.severity === "high_attention" ? scoreRules.highAttention : scoreRules.attention;
    return [{ code, points: rule.points, title: finding.title, explanation: finding.explanation, ingredientIds: ingredientByName.get(finding.normalizedName) ? [ingredientByName.get(finding.normalizedName) as string] : [], evidenceRequired: true, evidenceAvailable: true }];
  }).slice(0, scoreRules.attention.cap + scoreRules.highAttention.cap);
}

function insufficient(reasons: string[], confidence: number): ScoreBreakdown {
  return { score: null, band: "insufficient_data", deductions: [], bonuses: [], confidence, insufficientDataReasons: [...new Set(reasons)], scoringVersion };
}

export function toBand(score: number): ScoreBreakdown["band"] {
  if (score >= 85) return "excellent";
  if (score >= 70) return "good";
  if (score >= 50) return "moderate";
  if (score >= 30) return "attention";
  return "high_attention";
}