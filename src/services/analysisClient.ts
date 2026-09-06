import { apiBaseUrl, apiConfigurationError } from "../config";
import type {
  ExecutiveSummary,
  IngredientInsight,
  OcrLabelType,
  ProductAnalysisRecord,
  ScoreBreakdown,
  StructuredAnalysis,
} from "../types";

type AnalysisRequest = Omit<
  ProductAnalysisRecord,
  "structured" | "score" | "analyzedAt" | "analysisVersion"
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
};

export async function runAnalysis(request: AnalysisRequest): Promise<{
  structured: StructuredAnalysis;
  score: ScoreBreakdown;
  ingredientInsights: IngredientInsight[];
  executiveSummary: ExecutiveSummary;
}> {
  if (apiConfigurationError) {
    throw new Error(apiConfigurationError);
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

  const response = await requestJson<
    StructuredAnalysis & {
      score: ScoreBreakdown;
      ingredientInsights: IngredientInsight[];
      executiveSummary: ExecutiveSummary;
    }
  >("/api/analysis/run", payload);

  return {
    structured: {
      productType: response.productType,
      summary: response.summary,
      positives: response.positives,
      attentionItems: response.attentionItems,
      potentialAllergens: response.potentialAllergens,
      ingredientFindings: response.ingredientFindings,
      insufficientDataReasons: response.insufficientDataReasons,
      confidence: response.confidence,
    },
    score: response.score,
    // Older Worker deployments won't send these yet during a rolling
    // release, so default to empty rather than letting the UI crash.
    ingredientInsights: response.ingredientInsights ?? [],
    executiveSummary:
      response.executiveSummary ?? {
        overallVerdict: "",
        safeIngredients: 0,
        cautionIngredients: 0,
        highImpactIngredients: 0,
        highlights: [],
        watchOutFor: [],
      },
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
    throw new Error(
      error instanceof DOMException && error.name === "AbortError"
        ? "Η ανάλυση καθυστέρησε υπερβολικά. Δοκιμάστε ξανά."
        : "Δεν ήταν δυνατή η σύνδεση με την υπηρεσία ανάλυσης.",
    );
  } finally {
    clearTimeout(timeout);
  }

  const result: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
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
