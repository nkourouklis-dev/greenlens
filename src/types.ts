export type ScanStatus = "known" | "unknown";

export interface OcrResult {
  rawText: string;
  confidence: number;
  labelType: "ingredients" | "nutrition" | "mixed" | "unknown";
  unreadableSegments: string[];
}

export type ProductType = "food" | "cosmetic" | "unknown";
export type FindingSeverity = "positive" | "info" | "attention" | "high_attention" | "unknown";

export interface NormalizedIngredient {
  id: string;
  originalName: string;
  normalizedName: string;
  displayName: string;
  percentage: number | null;
  category: "base" | "additive" | "preservative" | "sweetener" | "colorant" | "fragrance" | "allergen" | "other" | "unknown";
  aliases: string[];
  confidence: number;
}

export interface IngredientFinding {
  ingredientName: string;
  normalizedName: string;
  severity: FindingSeverity;
  title: string;
  explanation: string;
  evidenceType: "regulatory" | "scientific" | "label" | "none";
  sourceName: string | null;
  sourceUrl: string | null;
  confidence: number;
}

export interface StructuredAnalysis {
  productType: ProductType;
  summary: string;
  positives: string[];
  attentionItems: string[];
  potentialAllergens: string[];
  ingredientFindings: IngredientFinding[];
  insufficientDataReasons: string[];
  confidence: number;
}

export interface ScoreDeduction {
  code: string;
  points: number;
  title: string;
  explanation: string;
  ingredientIds: string[];
  evidenceRequired: boolean;
  evidenceAvailable: boolean;
}

export interface ScoreBreakdown {
  score: number | null;
  band: "excellent" | "good" | "moderate" | "attention" | "high_attention" | "insufficient_data";
  deductions: ScoreDeduction[];
  bonuses: string[];
  confidence: number;
  insufficientDataReasons: string[];
  scoringVersion: string;
}

export interface ProductAnalysisRecord {
  productId: string;
  barcode: string;
  confirmedIngredientText: string;
  normalizedIngredients: NormalizedIngredient[];
  extractionConfidence: number;
  structured: StructuredAnalysis;
  score: ScoreBreakdown;
  analyzedAt: string;
  analysisVersion: string;
}

export interface Product {
  id: string;
  barcode: string;
  name: string;
  brand: string;
  ingredients: string[];
  description: string;
  isDemo: boolean;
}

export interface ScanHistoryItem {
  id: string;
  barcode: string;
  status: ScanStatus;
  scannedAt: string;
  productId?: string;
  productName?: string;
  ingredientsPhoto?: string;
  productPhoto?: string;
  ocrRawText?: string;
  ocrConfidence?: number;
  userCorrectedText?: string;
  normalizedIngredients?: NormalizedIngredient[];
  analysis?: ProductAnalysisRecord;
}