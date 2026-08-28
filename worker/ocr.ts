export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const supportedImageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

export interface OcrResponse {
  rawText: string;
  confidence: number;
}

export function validateOcrRequest(image: File | null, barcode: string | null, productId: string | null): string | null {
  if (!image) return "Λείπει η εικόνα της ετικέτας.";
  if (!supportedImageTypes.has(image.type)) return "Ο τύπος εικόνας δεν υποστηρίζεται.";
  if (image.size === 0 || image.size > MAX_IMAGE_BYTES) return "Το μέγεθος της εικόνας δεν επιτρέπεται.";
  if (!barcode?.trim()) return "Λείπει το barcode.";
  if (!productId?.trim()) return "Λείπει το productId.";
  return null;
}

export function parseOcrModelOutput(value: unknown): OcrResponse | null {
  const candidate = typeof value === "string" ? parseJson(value) : isRecord(value) && typeof value.description === "string" ? parseJson(value.description) : null;
  if (!isRecord(candidate) || typeof candidate.rawText !== "string" || !candidate.rawText.trim() || typeof candidate.confidence !== "number" || !Number.isFinite(candidate.confidence) || candidate.confidence < 0 || candidate.confidence > 1) return null;
  return { rawText: candidate.rawText.trim(), confidence: candidate.confidence };
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}