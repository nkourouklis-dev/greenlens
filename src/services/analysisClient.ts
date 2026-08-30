import { apiBaseUrl, apiConfigurationError } from "../config";
import type { ProductAnalysisRecord, ScoreBreakdown, StructuredAnalysis } from "../types";

export async function runAnalysis(request: Omit<ProductAnalysisRecord, "structured" | "score" | "analyzedAt" | "analysisVersion">): Promise<{ structured: StructuredAnalysis; score: ScoreBreakdown }> {
  if (apiConfigurationError) throw new Error(apiConfigurationError);
  return requestJson<StructuredAnalysis & { score: ScoreBreakdown }>("/api/analysis/run", request).then((response) => ({ structured: { productType: response.productType, summary: response.summary, positives: response.positives, attentionItems: response.attentionItems, potentialAllergens: response.potentialAllergens, ingredientFindings: response.ingredientFindings, insufficientDataReasons: response.insufficientDataReasons, confidence: response.confidence }, score: response.score }));
}

export async function askProductQuestion(_productId: string, _question: string): Promise<string> {
  return "Η συνομιλία θα είναι διαθέσιμη όταν αποθηκευτεί με ασφάλεια η ανάλυση του προϊόντος.";
}

async function requestJson<T>(path: string, body: unknown): Promise<T> {
  let response: Response;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try { response = await fetch(`${apiBaseUrl}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: controller.signal }); } catch (error) { throw new Error(error instanceof DOMException && error.name === "AbortError" ? "Η υπηρεσία ανάλυσης δεν είναι προσωρινά διαθέσιμη." : "Δεν ήταν δυνατή η σύνδεση με την υπηρεσία ανάλυσης."); } finally { clearTimeout(timeout); }
  const result: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new Error(typeof result === "object" && result !== null && "error" in result && typeof result.error === "string" ? result.error : "Η ανάλυση δεν ολοκληρώθηκε. Δοκιμάστε ξανά.");
  return result as T;
}