import type { WorkerAnalysisResult } from "./analysis";

export const scoringVersion = "2026.08.2";
export interface WorkerScore { score: number | null; band: "excellent" | "good" | "moderate" | "attention" | "high_attention" | "insufficient_data"; deductions: Array<{ code: string; points: number; title: string; explanation: string; ingredientIds: string[]; evidenceRequired: boolean; evidenceAvailable: boolean }>; bonuses: string[]; confidence: number; insufficientDataReasons: string[]; scoringVersion: string; }

export function scoreInterpretation(text: string, ocrConfidence: number, analysis: WorkerAnalysisResult): WorkerScore {
  const reasons = [...analysis.insufficientDataReasons];
  if (!text.trim()) reasons.push("Δεν υπάρχει επιβεβαιωμένη λίστα συστατικών.");
  if (ocrConfidence < 0.7) reasons.push("Η ανάγνωση της ετικέτας έχει χαμηλή εμπιστοσύνη.");
  if (analysis.productType === "unknown") reasons.push("Δεν αναγνωρίστηκε αξιόπιστα ο τύπος προϊόντος.");
  if (analysis.ingredientFindings.some((finding) => finding.severity === "high_attention" && finding.evidenceType === "none")) reasons.push("Λείπει επαρκές τεκμήριο για σημαντική επισήμανση.");
  if (reasons.length) return { score: null, band: "insufficient_data", deductions: [], bonuses: [], confidence: Math.min(ocrConfidence, analysis.confidence), insufficientDataReasons: [...new Set(reasons)], scoringVersion };
  const seen = new Set<string>();
  const deductions = analysis.ingredientFindings.flatMap((finding) => {
    if ((finding.severity !== "attention" && finding.severity !== "high_attention") || finding.evidenceType === "none") return [];
    const code = `${finding.severity}:${finding.normalizedName}`;
    if (seen.has(code)) return [];
    seen.add(code);
    return [{ code, points: finding.severity === "high_attention" ? 15 : 8, title: finding.title, explanation: finding.explanation, ingredientIds: [], evidenceRequired: true, evidenceAvailable: true }];
  }).slice(0, 5);
  const score = Math.max(0, 100 - deductions.reduce((total, deduction) => total + deduction.points, 0));
  const band = score >= 85 ? "excellent" : score >= 70 ? "good" : score >= 50 ? "moderate" : score >= 30 ? "attention" : "high_attention";
  return { score, band, deductions, bonuses: [], confidence: Math.min(ocrConfidence, analysis.confidence), insufficientDataReasons: [], scoringVersion };
}