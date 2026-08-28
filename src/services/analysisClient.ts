import { apiBaseUrl, apiConfigurationError } from "../config";
import type { ProductAnalysisRecord, StructuredAnalysis } from "../types";

export async function runAnalysis(request: Omit<ProductAnalysisRecord, "structured" | "score" | "analyzedAt" | "analysisVersion">): Promise<StructuredAnalysis> {
  if (apiConfigurationError) throw new Error(apiConfigurationError);
  return requestJson<StructuredAnalysis>("/api/analysis/run", request);
}

export async function askProductQuestion(productId: string, question: string, context: ProductAnalysisRecord): Promise<string> {
  if (apiConfigurationError) throw new Error(apiConfigurationError);
  const response = await requestJson<{ answer: string }>(`/api/products/${encodeURIComponent(productId)}/chat`, { question, conversationHistory: [{ context }] });
  return response.answer;
}

async function requestJson<T>(path: string, body: unknown): Promise<T> {
  let response: Response;
  try { response = await fetch(`${apiBaseUrl}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }); } catch { throw new Error("Δεν ήταν δυνατή η σύνδεση με την υπηρεσία ανάλυσης."); }
  const result: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new Error(typeof result === "object" && result !== null && "error" in result && typeof result.error === "string" ? result.error : "Η ανάλυση δεν ολοκληρώθηκε. Δοκιμάστε ξανά.");
  return result as T;
}