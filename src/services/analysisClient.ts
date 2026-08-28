import type { ComparableProductSummary, ExtractedIngredient, ProductAnalysis } from "../types";

export interface AnalysisClient {
  extractIngredients(image: string): Promise<ExtractedIngredient[]>;
  analyzeIngredients(productId: string, correctedText: string): Promise<ProductAnalysis>;
  askProductQuestion(productId: string, question: string): Promise<string>;
  getComparableProducts(productId: string): Promise<ComparableProductSummary[]>;
}