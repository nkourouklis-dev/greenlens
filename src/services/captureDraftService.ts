import type { OcrResult } from "../types";

const draftKey = (barcode: string) => `greenlens.capture-draft.v1.${barcode}`;
const ocrDraftKey = (productId: string) => `greenlens.ocr-draft.v1.${productId}`;

export interface OcrDraft {
  barcode: string;
  image: string;
  result: OcrResult;
}

export function saveIngredientsDraft(barcode: string, image: string): void {
  sessionStorage.setItem(draftKey(barcode), image);
}

export function getIngredientsDraft(barcode: string): string | null {
  return sessionStorage.getItem(draftKey(barcode));
}

export function clearCaptureDraft(barcode: string): void {
  sessionStorage.removeItem(draftKey(barcode));
}

export function saveOcrDraft(productId: string, draft: OcrDraft): void {
  sessionStorage.setItem(ocrDraftKey(productId), JSON.stringify(draft));
}

export function getOcrDraft(productId: string): OcrDraft | null {
  try {
    const storedDraft = sessionStorage.getItem(ocrDraftKey(productId));
    return storedDraft ? (JSON.parse(storedDraft) as OcrDraft) : null;
  } catch {
    return null;
  }
}

export function clearOcrDraft(productId: string): void {
  sessionStorage.removeItem(ocrDraftKey(productId));
}

export function updateOcrDraftText(productId: string, text: string): void {
  const draft = getOcrDraft(productId);
  if (!draft) return;
  saveOcrDraft(productId, { ...draft, result: { ...draft.result, rawText: text } });
}

export interface ConfirmedIngredientsDraft {
  text: string;
  confidence: number;
}