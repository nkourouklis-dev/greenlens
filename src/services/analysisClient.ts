import { analysisVersion, apiBaseUrl, apiConfigurationError } from "../config";
import { UserFacingError } from "./errors";
import type {
  ChemicalInsight,
  ContentCategory,
  ExecutiveSummary,
  IngredientInsight,
  NutritionInsight,
  OcrLabelType,
  ProductAnalysisRecord,
  ScoreBreakdown,
  StructuredAnalysis,
  StructuredChemicalAnalysis,
  StructuredNutritionAnalysis,
} from "../types";

type AnalysisRequest = Omit<
  ProductAnalysisRecord,
  | "structured"
  | "score"
  | "analyzedAt"
  | "analysisVersion"
  | "contentCategory"
  | "ingredientInsights"
  | "executiveSummary"
  | "nutritionAnalysis"
  | "chemicalAnalysis"
  | "unknownCategoryMessage"
> & {
  /**
   * Verdict of the OCR step. The worker uses it to avoid rejecting a scan
   * that OCR already confirmed as an ingredient list. Optional, so older
   * callers keep working unchanged.
   */
  ocrLabelType?: OcrLabelType;

  /**
   * Length of the raw OCR text, used only for server-side diagnostics.
   */
  ocrTextLength?: number;

  /**
   * The user's manual correction of the detected content category, if they
   * used the override dropdown on the review screen. Undefined lets the
   * Worker decide (heuristic, then AI fallback).
   */
  categoryOverride?: ContentCategory;
};

const defaultScore: ScoreBreakdown = {
  score: null,
  band: "insufficient_data",
  deductions: [],
  bonuses: [],
  confidence: 0,
  lowConfidenceReason: null,
  insufficientDataReasons: [
    "Η απάντηση του διακομιστή δεν περιείχε βαθμολογία.",
  ],
  scoringVersion: analysisVersion,
};

const defaultExecutiveSummary: ExecutiveSummary = {
  overallVerdict: "",
  safeIngredients: 0,
  cautionIngredients: 0,
  highImpactIngredients: 0,
  highlights: [],
  watchOutFor: [],
};

export type AnalysisApiResult =
  | {
      contentCategory: "ingredients";
      structured: StructuredAnalysis;
      score: ScoreBreakdown;
      ingredientInsights: IngredientInsight[];
      executiveSummary: ExecutiveSummary;
    }
  | {
      contentCategory: "nutrition";
      structured: StructuredNutritionAnalysis;
      score: ScoreBreakdown;
      nutritionInsights: NutritionInsight[];
      executiveSummary: ExecutiveSummary;
    }
  | {
      contentCategory: "chemical_composition";
      structured: StructuredChemicalAnalysis;
      score: ScoreBreakdown;
      chemicalInsights: ChemicalInsight[];
      executiveSummary: ExecutiveSummary;
    }
  | {
      contentCategory: "unknown";
      message: string;
      insufficientDataReasons: string[];
    };

// Raw shape of whatever the Worker sent back — deliberately loose since it
// varies by contentCategory and older/rolling deployments may omit fields.
interface RawAnalysisResponse {
  contentCategory?: ContentCategory;
  message?: string;
  score?: ScoreBreakdown;
  executiveSummary?: ExecutiveSummary;
  ingredientInsights?: IngredientInsight[];
  nutritionInsights?: NutritionInsight[];
  chemicalInsights?: ChemicalInsight[];
  insufficientDataReasons?: string[];
  [key: string]: unknown;
}

export async function runAnalysis(
  request: AnalysisRequest,
): Promise<AnalysisApiResult> {
  if (apiConfigurationError) {
    throw new UserFacingError(apiConfigurationError);
  }

  // "mixed" means a label that carries both an ingredient list and a
  // nutrition table, which is exactly the case we want treated as an
  // ingredient list.
  const ocrLabelType =
    request.ocrLabelType === "mixed"
      ? "ingredients"
      : request.ocrLabelType;

  const payload = {
    ...request,
    ...(ocrLabelType ? { ocrLabelType } : {}),
  };

  const response = await requestJson<RawAnalysisResponse>(
    "/api/analysis/run",
    payload,
  );

  // Older/mismatched Worker deployments during a rolling release won't send
  // contentCategory yet — default to "ingredients", the only path that
  // existed before this field.
  const category = response.contentCategory ?? "ingredients";

  if (category === "unknown") {
    return {
      contentCategory: "unknown",
      message:
        response.message ??
        "Δεν αναγνωρίστηκε ο τύπος περιεχομένου.",
      insufficientDataReasons: response.insufficientDataReasons ?? [],
    };
  }

  if (category === "nutrition") {
    return {
      contentCategory: "nutrition",
      structured: {
        subtype: (response.subtype as StructuredNutritionAnalysis["subtype"]) ?? "unknown",
        summary: (response.summary as string) ?? "",
        positives: (response.positives as string[]) ?? [],
        attentionItems: (response.attentionItems as string[]) ?? [],
        nutritionFindings:
          (response.nutritionFindings as StructuredNutritionAnalysis["nutritionFindings"]) ??
          [],
        insufficientDataReasons: response.insufficientDataReasons ?? [],
        confidence: (response.confidence as number) ?? 0,
      },
      score: response.score ?? defaultScore,
      nutritionInsights: response.nutritionInsights ?? [],
      executiveSummary: response.executiveSummary ?? defaultExecutiveSummary,
    };
  }

  if (category === "chemical_composition") {
    return {
      contentCategory: "chemical_composition",
      structured: {
        sourceType: (response.sourceType as StructuredChemicalAnalysis["sourceType"]) ?? "unknown",
        summary: (response.summary as string) ?? "",
        positives: (response.positives as string[]) ?? [],
        attentionItems: (response.attentionItems as string[]) ?? [],
        chemicalFindings:
          (response.chemicalFindings as StructuredChemicalAnalysis["chemicalFindings"]) ??
          [],
        insufficientDataReasons: response.insufficientDataReasons ?? [],
        confidence: (response.confidence as number) ?? 0,
      },
      score: response.score ?? defaultScore,
      chemicalInsights: response.chemicalInsights ?? [],
      executiveSummary: response.executiveSummary ?? defaultExecutiveSummary,
    };
  }

  return {
    contentCategory: "ingredients",
    structured: {
      productType: (response.productType as StructuredAnalysis["productType"]) ?? "unknown",
      summary: (response.summary as string) ?? "",
      positives: (response.positives as string[]) ?? [],
      attentionItems: (response.attentionItems as string[]) ?? [],
      potentialAllergens: (response.potentialAllergens as string[]) ?? [],
      ingredientFindings:
        (response.ingredientFindings as StructuredAnalysis["ingredientFindings"]) ??
        [],
      insufficientDataReasons: response.insufficientDataReasons ?? [],
      confidence: (response.confidence as number) ?? 0,
    },
    // Older/mismatched Worker deployments during a rolling release, or a
    // malformed response, might not carry a score at all — default rather
    // than letting the UI crash trying to read fields off undefined.
    score: response.score ?? defaultScore,
    // Older Worker deployments won't send these yet during a rolling
    // release, so default to empty rather than letting the UI crash.
    ingredientInsights: response.ingredientInsights ?? [],
    executiveSummary: response.executiveSummary ?? defaultExecutiveSummary,
  };
}

export async function askProductQuestion(
  _productId: string,
  _question: string,
): Promise<string> {
  return "Η συνομιλία θα είναι διαθέσιμη όταν αποθηκευτεί με ασφάλεια η ανάλυση του προϊόντος.";
}

async function requestJson<T>(
  path: string,
  body: unknown,
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90_000);

  let response: Response;

  try {
    response = await fetch(`${apiBaseUrl}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json; charset=utf-8",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (error) {
    throw new UserFacingError(
      error instanceof DOMException && error.name === "AbortError"
        ? "Η ανάλυση καθυστέρησε υπερβολικά. Δοκιμάστε ξανά."
        : "Δεν ήταν δυνατή η σύνδεση με την υπηρεσία ανάλυσης.",
    );
  } finally {
    clearTimeout(timeout);
  }

  const result: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    throw new UserFacingError(
      typeof result === "object" &&
        result !== null &&
        "error" in result &&
        typeof result.error === "string"
        ? result.error
        : "Η ανάλυση δεν ολοκληρώθηκε. Δοκιμάστε ξανά.",
    );
  }

  return result as T;
}
