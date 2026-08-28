import type { OcrResult } from "../types";
import { apiBaseUrl, apiConfigurationError } from "../config";

export async function extractOcr(image: string, barcode: string, productId: string): Promise<OcrResult> {
  if (apiConfigurationError) throw new Error(apiConfigurationError);
  const formData = new FormData();
  const imageBlob = await (await fetch(image)).blob();
  formData.append("image", imageBlob, "ingredients.jpg");
  formData.append("barcode", barcode);
  formData.append("productId", productId);

  const response = await fetch(`${apiBaseUrl}/api/ocr/extract`, { method: "POST", body: formData });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new Error(readError(body));
  if (!isOcrResult(body)) throw new Error("Η υπηρεσία επέστρεψε μη έγκυρη ανάγνωση ετικέτας.");
  return body;
}

function isOcrResult(value: unknown): value is OcrResult {
  return typeof value === "object" && value !== null && "rawText" in value && "confidence" in value && "labelType" in value && "unreadableSegments" in value && typeof value.rawText === "string" && typeof value.confidence === "number" && Number.isFinite(value.confidence) && value.confidence >= 0 && value.confidence <= 1 && (value.labelType === "ingredients" || value.labelType === "nutrition" || value.labelType === "mixed" || value.labelType === "unknown") && Array.isArray(value.unreadableSegments) && value.unreadableSegments.every((segment) => typeof segment === "string");
}

function readError(value: unknown): string {
  return typeof value === "object" && value !== null && "error" in value && typeof value.error === "string" ? value.error : "Δεν ήταν δυνατή η ανάγνωση της ετικέτας.";
}