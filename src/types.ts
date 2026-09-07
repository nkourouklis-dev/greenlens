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

/**
 * The one place declared EU allergens are shown. Presence of these is
 * information for people with an allergy or intolerance, never a score
 * deduction — see worker/allergens.ts for the rule.
 */
export interface AllergenNotice {
  keys: string[];
  labels: string[];
  headline: string;
  note: string;
}

export interface ExecutiveSummary {
  overallVerdict: string;
  safeIngredients: number;
  cautionIngredients: number;
  highImpactIngredients: number;
  highlights: string[];
  watchOutFor: string[];
}

export type ContentCategory =
  | "ingredients"
  | "nutrition"
  | "chemical_composition"
  | "unknown";

export interface NutritionFinding {
  nutrient: string;
  normalizedName: string;
  amount: string | null;
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

export interface StructuredNutritionAnalysis {
  subtype: "human_food" | "pet_food" | "unknown";
  summary: string;
  positives: string[];
  attentionItems: string[];
  nutritionFindings: NutritionFinding[];
  insufficientDataReasons: string[];
  confidence: number;
}

export interface NutritionInsight {
  name: string;
  normalizedName: string;
  amount: string | null;
  rating: IngredientRating;
  scoreImpact: number;
  description: string;
  whyRated: string;
  evidenceLevel: EvidenceLevel;
  evidenceAvailable: boolean;
}

export interface ChemicalFinding {
  substance: string;
  normalizedName: string;
  concentration: string | null;
  referenceLimit: string | null;
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

export interface StructuredChemicalAnalysis {
  sourceType:
    | "drinking_water"
    | "mineral_water"
    | "raw_material"
    | "unknown";
  summary: string;
  positives: string[];
  attentionItems: string[];
  chemicalFindings: ChemicalFinding[];
  insufficientDataReasons: string[];
  confidence: number;
}

export interface ChemicalInsight {
  substance: string;
  normalizedName: string;
  concentration: string | null;
  referenceLimit: string | null;
  rating: IngredientRating;
  scoreImpact: number;
  description: string;
  whyRated: string;
  evidenceLevel: EvidenceLevel;
  evidenceAvailable: boolean;
}

export interface ProductAnalysisRecord {
  productId: string;
  barcode: string;
  productType: ProductType;
  confirmedIngredientText: string;
  normalizedIngredients: NormalizedIngredient[];
  ocrConfidence: number;
  /**
   * Which analysis path produced this record. Missing on records saved
   * before this field existed — those are always treated as "ingredients"
   * (see readContentCategory in Product.tsx), the only path that existed
   * then.
   */
  contentCategory?: ContentCategory;
  /**
   * Populated only when contentCategory is "ingredients" (the default when
   * the field is missing, for records saved before content categories
   * existed). See nutritionAnalysis/chemicalAnalysis below for the other
   * two paths' structured results.
   */
  structured?: StructuredAnalysis;
  score: ScoreBreakdown;
  /**
   * Optional because history items analyzed before this field existed
   * don't have it. Product.tsx falls back to deriving these on the client
   * (src/utils/ingredientInsights.ts) when they are missing.
   */
  ingredientInsights?: IngredientInsight[];
  executiveSummary?: ExecutiveSummary;
  /**
   * Declared EU allergens for this scan, on every path that can have them.
   * Missing on records saved before the notice existed and null when the
   * product declares none — Product.tsx derives it locally in the first
   * case (src/utils/ingredientInsights.ts).
   */
  allergenNotice?: AllergenNotice | null;
  /**
   * Populated only when contentCategory is "nutrition"/"chemical_composition"
   * respectively — siblings of the ingredients-shaped fields above rather
   * than a replacement, so old records and the ingredients path never need
   * to change shape.
   */
  nutritionAnalysis?: {
    structured: StructuredNutritionAnalysis;
    score: ScoreBreakdown;
    insights: NutritionInsight[];
    executiveSummary: ExecutiveSummary;
  };
  chemicalAnalysis?: {
    structured: StructuredChemicalAnalysis;
    score: ScoreBreakdown;
    insights: ChemicalInsight[];
    executiveSummary: ExecutiveSummary;
  };
  unknownCategoryMessage?: string;
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
  /**
   * The user's manual correction of the detected content category from the
   * review screen, if they used the override dropdown. Undefined means
   * "let the Worker decide" (heuristic, then AI fallback).
   */
  categoryOverride?: ContentCategory;
  normalizedIngredients?: NormalizedIngredient[];
  analysis?: ProductAnalysisRecord;
}
