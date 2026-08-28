import type { ProductAnalysis } from "../types";

const key = (productId: string) => `greenlens.analysis.v1.${productId}`;

export function getProductAnalysis(productId: string): ProductAnalysis | undefined {
  try {
    const stored = localStorage.getItem(key(productId));
    return stored ? (JSON.parse(stored) as ProductAnalysis) : undefined;
  } catch {
    return undefined;
  }
}

export function saveProductAnalysis(analysis: ProductAnalysis): boolean {
  try {
    localStorage.setItem(key(analysis.productId), JSON.stringify(analysis));
    return true;
  } catch {
    return false;
  }
}