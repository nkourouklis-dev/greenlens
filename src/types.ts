export type ScanStatus = "known" | "unknown";

/**
 * Label verdict produced by the OCR step. Shared by the OCR result, the
 * scan history record and the analysis request payload.
 */
export type OcrLabelType =
  | "ingredients"
  | "nutrition"
  | "mixed"
  | "unknown";

export interface OcrResult {
  rawText: string;
  confidence: number;
  labelType: OcrLabelType;
  unreadableSegments: string[];
}

export type ProductType =
  | "food"
  | "cosmetic"
  | "unknown";

export type FindingSeverity =
  | "positive"
  | "info"
  | "attention"
  | "high_attention"
  | "unknown";

export interface NormalizedIngredient {
  id: string;
  originalName: string;
  normalizedName: string;
  displayName: string;
  percentage: number | null;
  category:
    | "base"
    | "additive"
    | "preservative"
    | "sweetener"
    | "colorant"
    | "fragrance"
    | "allergen"
    | "other"
    | "unknown";
  aliases: string[];
  confidence: number;
}

export interface IngredientFinding {
  ingredientName: string;
  normalizedName: string;
  severity: FindingSeverity;
  title: string;
  explanation: string;
  evidenceType:
    | "regulatory"
    | "scientific"
    | "label"
    | "none";
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
  band:
    | "excellent"
    | "good"
    | "moderate"
    | "attention"
    | "high_attention"
    | "insufficient_data";
  deductions: ScoreDeduction[];
  bonuses: string[];
  confidence: number;
  /**
   * Set when the ingredient text was accepted on shaky evidence (no
   * heading found, or only via the nutrition-table override) even though a
   * full score is still shown. Null when the reading was solid.
   */
  lowConfidenceReason: string | null;
  insufficientDataReasons: string[];
  scoringVersion: string;
}

export type IngredientCategory =
  | "preservative"
  | "fragrance"
  | "colorant"
  | "humectant"
  | "surfactant"
  | "emollient"
  | "antioxidant"
  | "active"
  | "other";

export type IngredientRating = "good" | "caution" | "neutral";

export type EvidenceLevel = "high" | "medium" | "low";

export interface IngredientInsight {
  name: string;
  normalizedName: string;
  category: IngredientCategory;
  rating: IngredientRating;
  scoreImpact: number;
  shortDescription: string;
  whyRated: string;
  benefits: string[];
  concerns: string[];
  aliases: string[];
  evidenceLevel: EvidenceLevel;
  evidenceAvailable: boolean;
}

export interface ExecutiveSummary {
  overallVerdict: string;
  safeIngredients: number;
  cautionIngredients: number;
  highImpactIngredients: number;
  highlights: string[];
  watchOutFor: string[];
}

export interface ProductAnalysisRecord {
  productId: string;
  barcode: string;
  productType: ProductType;
  confirmedIngredientText: string;
  normalizedIngredients: NormalizedIngredient[];
  ocrConfidence: number;
  structured: StructuredAnalysis;
  score: ScoreBreakdown;
  /**
   * Optional because history items analyzed before this field existed
   * don't have it. Product.tsx falls back to deriving these on the client
   * (src/utils/ingredientInsights.ts) when they are missing.
   */
  ingredientInsights?: IngredientInsight[];
  executiveSummary?: ExecutiveSummary;
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
  ocrLabelType?: OcrLabelType;
  userCorrectedText?: string;
  normalizedIngredients?: NormalizedIngredient[];
  analysis?: ProductAnalysisRecord;
}
