import type { ContentCategory, OcrResult } from "../types";

const draftKey = (barcode: string) => `greenlens.capture-draft.v1.${barcode}`;
const ocrDraftKey = (productId: string) => `greenlens.ocr-draft.v1.${productId}`;

export interface OcrDraft {
  barcode: string;
  image: string;
  result: OcrResult;
  /**
   * Set only when the user manually overrides the auto-detected content
   * category on the review screen. Undefined means "let the Worker decide".
   */
  categoryOverride?: ContentCategory;
  /**
   * History id of the product this photo is being added to ("add the
   * missing photo"). Its text is merged with that product's analysis.
   */
  mergeInto?: string;
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

export function updateOcrDraftCategoryOverride(
  productId: string,
  categoryOverride: ContentCategory | undefined,
): void {
  const draft = getOcrDraft(productId);
  if (!draft) return;
  saveOcrDraft(productId, { ...draft, categoryOverride });
}

const nutritionDraftKey = (productId: string) =>
  `greenlens.nutrition-draft.v1.${productId}`;

/** The OCR text of the nutrition table photographed in this scan. */
export function saveNutritionDraft(productId: string, text: string): void {
  sessionStorage.setItem(nutritionDraftKey(productId), text);
}

export function getNutritionDraft(productId: string): string | null {
  return sessionStorage.getItem(nutritionDraftKey(productId));
}

export function clearNutritionDraft(productId: string): void {
  sessionStorage.removeItem(nutritionDraftKey(productId));
}

export interface ConfirmedIngredientsDraft {
  text: string;
  confidence: number;
}