const draftKey = (barcode: string) => `greenlens.capture-draft.v1.${barcode}`;

export function saveIngredientsDraft(barcode: string, image: string): void {
  sessionStorage.setItem(draftKey(barcode), image);
}

export function getIngredientsDraft(barcode: string): string | null {
  return sessionStorage.getItem(draftKey(barcode));
}

export function clearCaptureDraft(barcode: string): void {
  sessionStorage.removeItem(draftKey(barcode));
}