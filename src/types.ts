export type ScanStatus = "known" | "unknown";
export type AnalysisStatus = "queued" | "reading_label" | "needs_review" | "analyzing" | "completed" | "insufficient_data" | "failed";

export interface IngredientEvidence {
  source: "label_ocr" | "user_corrected" | "seed_record";
  sourceText: string;
  confidence: number;
}

export interface ExtractedIngredient {
  name: string;
  normalizedName: string;
  confidence: number;
  evidence: IngredientEvidence;
}

export type IngredientFlagTone = "positive" | "attention" | "allergen" | "neutral";

export interface IngredientFlag {
  ingredient: string;
  tone: IngredientFlagTone;
  label: string;
  reason: string;
  evidence: IngredientEvidence;
}

export interface ScoreBreakdown {
  factor: string;
  weight: number;
  deduction: number;
  reason: string;
}

export interface AnalysisConfidence {
  overall: number;
  labelRead: number;
  userReviewed: boolean;
  explanation: string;
}

export interface ComparableProductSummary {
  name: string;
  reason: string;
}

export interface ProductAnalysis {
  productId: string;
  status: AnalysisStatus;
  correctedText: string;
  ingredients: ExtractedIngredient[];
  flags: IngredientFlag[];
  score?: number;
  scoreBand?: "green" | "yellow" | "orange" | "red" | "gray";
  scoreBreakdown: ScoreBreakdown[];
  confidence: AnalysisConfidence;
  positives: string[];
  attentionItems: string[];
  allergens: string[];
  comparisons: ComparableProductSummary[];
  notice?: string;
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
}