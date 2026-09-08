import { analysisVersion } from "../config";
import type { AnalysisApiResult } from "./analysisClient";
import type {
  NormalizedIngredient,
  ProductAnalysisRecord,
  ScanHistoryItem,
  ScoreBreakdown,
} from "../types";

/**
 * Shared by AnalysisRun.tsx (after a fresh OCR + AI pass) and Scan.tsx
 * (after a shared-product-cache hit, which skips OCR/AI entirely) — kept
 * in its own module rather than defined on either page so importing it
 * never pulls one route's whole chunk into the other's
 * (see fe1b9c2, "code-split bundle, lazy-load ... routes").
 */
export function insufficientScore(
  reason: string,
  confidence: number,
): ScoreBreakdown {
  return {
    score: null,
    band: "insufficient_data",
    deductions: [],
    bonuses: [],
    confidence,
    lowConfidenceReason: null,
    insufficientDataReasons: [reason],
    scoringVersion: analysisVersion,
  };
}

/**
 * Turns a Worker analysis response into the shape stored in scan history.
 * `text`/`ingredients`/`confidence` are OCR-derived metadata, not used to
 * render the result itself — a cache-hit caller (no OCR ever ran for this
 * particular scan) can safely pass "" / [] / the result's own
 * score.confidence.
 */
export function buildAnalysisRecord(
  result: AnalysisApiResult,
  id: string,
  item: ScanHistoryItem,
  text: string,
  ingredients: NormalizedIngredient[],
  confidence: number,
): ProductAnalysisRecord {
  const base = {
    productId: id,
    barcode: item.barcode,
    confirmedIngredientText: text,
    normalizedIngredients: ingredients,
    ocrConfidence: confidence,
    analyzedAt: new Date().toISOString(),
    analysisVersion:
      result.contentCategory !== "unknown"
        ? (result.score.scoringVersion ?? analysisVersion)
        : analysisVersion,
  };

  if (result.contentCategory === "ingredients") {
    return {
      ...base,
      productType: result.structured.productType,
      contentCategory: "ingredients",
      structured: result.structured,
      score: result.score,
      ingredientInsights: result.ingredientInsights,
      executiveSummary: result.executiveSummary,
      allergenNotice: result.allergenNotice,
    };
  }

  if (result.contentCategory === "nutrition") {
    return {
      ...base,
      productType: "unknown",
      contentCategory: "nutrition",
      score: result.score,
      executiveSummary: result.executiveSummary,
      allergenNotice: result.allergenNotice,
      nutritionAnalysis: {
        structured: result.structured,
        score: result.score,
        insights: result.nutritionInsights,
        executiveSummary: result.executiveSummary,
      },
    };
  }

  if (result.contentCategory === "chemical_composition") {
    return {
      ...base,
      productType: "unknown",
      contentCategory: "chemical_composition",
      score: result.score,
      executiveSummary: result.executiveSummary,
      chemicalAnalysis: {
        structured: result.structured,
        score: result.score,
        insights: result.chemicalInsights,
        executiveSummary: result.executiveSummary,
      },
    };
  }

  return {
    ...base,
    productType: "unknown",
    contentCategory: "unknown",
    unknownCategoryMessage: result.message,
    score: insufficientScore(
      result.insufficientDataReasons[0] ?? result.message,
      confidence,
    ),
  };
}
