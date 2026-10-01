import type { OcrResponse } from "./ocr";

const AZURE_API_VERSION = "2024-02-01";
const AZURE_TIMEOUT_MS = 25_000;

export type AzureOcrErrorCode =
  | "ocr_not_configured"
  | "ocr_credentials_rejected"
  | "ocr_access_blocked"
  | "ocr_endpoint_not_found"
  | "ocr_rate_limited"
  | "ocr_unavailable"
  | "ocr_timeout"
  | "ocr_network"
  | "ocr_no_text"
  | "ocr_failed";

// The Greek text is what the person (and the admin) sees; the code is what
// the frontend and `wrangler tail` key on. A 401 from Azure is also what a
// disabled subscription returns, so that wording names both causes instead
// of sending someone to re-check secrets that were fine.
const AZURE_OCR_ERRORS: Record<
  AzureOcrErrorCode,
  { message: string; status: number }
> = {
  ocr_not_configured: {
    message:
      "Η υπηρεσία OCR δεν έχει ρυθμιστεί σωστά στον διακομιστή (AZURE_VISION).",
    status: 503,
  },
  ocr_credentials_rejected: {
    message:
      "Το Azure OCR απέρριψε το key ή το endpoint. Ελέγξτε τα secrets και ότι η συνδρομή Azure είναι ενεργή.",
    status: 502,
  },
  ocr_access_blocked: {
    message:
      "Το Azure OCR αρνήθηκε την πρόσβαση (όριο χρήσης ή απενεργοποιημένη συνδρομή). Ελέγξτε το Azure Portal.",
    status: 502,
  },
  ocr_endpoint_not_found: {
    message:
      "Το Azure OCR endpoint δεν βρέθηκε. Ελέγξτε το Azure resource και την περιοχή.",
    status: 502,
  },
  ocr_rate_limited: {
    message:
      "Το Azure OCR έχει προσωρινά υπερβεί το όριο αιτημάτων. Δοκιμάστε ξανά σε λίγο.",
    status: 429,
  },
  ocr_unavailable: {
    message: "Το Azure OCR δεν είναι προσωρινά διαθέσιμο.",
    status: 503,
  },
  ocr_timeout: {
    message: "Το Azure OCR δεν απάντησε εγκαίρως.",
    status: 504,
  },
  ocr_network: {
    message: "Δεν ήταν δυνατή η σύνδεση με το Azure OCR.",
    status: 502,
  },
  ocr_no_text: {
    message:
      "Το Azure OCR δεν εντόπισε αναγνώσιμο κείμενο στην ετικέτα.",
    status: 422,
  },
  ocr_failed: {
    message: "Το Azure OCR δεν μπόρεσε να επεξεργαστεί την εικόνα.",
    status: 502,
  },
};

export class AzureOcrError extends Error {
  readonly code: AzureOcrErrorCode;
  readonly httpStatus: number;

  constructor(code: AzureOcrErrorCode) {
    super(AZURE_OCR_ERRORS[code].message);
    this.name = "AzureOcrError";
    this.code = code;
    this.httpStatus = AZURE_OCR_ERRORS[code].status;
  }
}

export function azureOcrErrorForStatus(status: number): AzureOcrErrorCode {
  if (status === 401) return "ocr_credentials_rejected";
  if (status === 403) return "ocr_access_blocked";
  if (status === 404) return "ocr_endpoint_not_found";
  if (status === 429) return "ocr_rate_limited";
  if (status >= 500) return "ocr_unavailable";

  return "ocr_failed";
}

/** Throws before any request is made, so an empty key is never sent to Azure. */
export function assertAzureOcrConfigured(
  endpoint: string | undefined,
  apiKey: string | undefined,
): void {
  if (!endpoint?.trim() || !apiKey?.trim()) {
    throw new AzureOcrError("ocr_not_configured");
  }
}

interface AzureImageAnalysisResponse {
  readResult?: {
    blocks?: Array<{
      lines?: Array<{
        text?: string;
        words?: Array<{
          text?: string;
          confidence?: number;
        }>;
      }>;
    }>;
  };
}

export async function extractWithAzureOcr(
  image: File,
  endpoint: string,
  apiKey: string,
  // Optional single-language hint. Omitted by default so Azure keeps
  // auto-detecting per line — see the AZURE_VISION_LANGUAGE comment in
  // worker/index.ts for why forcing one language is risky on labels that
  // mix Greek copy with Latin/English INCI names.
  language?: string,
): Promise<OcrResponse> {
  assertAzureOcrConfigured(endpoint, apiKey);

  const normalizedEndpoint =
    endpoint.trim().replace(/\/+$/, "");

  const normalizedLanguage = language?.trim();

  const requestUrl =
    `${normalizedEndpoint}` +
    "/computervision/imageanalysis:analyze" +
    `?api-version=${AZURE_API_VERSION}` +
    "&features=read" +
    (normalizedLanguage
      ? `&language=${encodeURIComponent(normalizedLanguage)}`
      : "");

  const controller = new AbortController();

  const timeout = setTimeout(
    () => controller.abort(),
    AZURE_TIMEOUT_MS,
  );

  let response: Response;

  try {
    response = await fetch(requestUrl, {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key":
          apiKey.trim(),
        "Content-Type":
          image.type || "application/octet-stream",
      },
      body: await image.arrayBuffer(),
      signal: controller.signal,
    });
  } catch (caughtError) {
    if (
      caughtError instanceof DOMException &&
      caughtError.name === "AbortError"
    ) {
      throw new AzureOcrError("ocr_timeout");
    }

    throw new AzureOcrError("ocr_network");
  } finally {
    clearTimeout(timeout);
  }

  const responseBody: unknown =
    await response.json().catch(() => null);

  if (!response.ok) {
    throw readAzureError(
      response.status,
      responseBody,
    );
  }

  const lines =
    extractLines(responseBody);

  const rawText = lines
    .map((line) => line.text)
    .filter(Boolean)
    .join("\n")
    .trim();

  if (!rawText) {
    throw new AzureOcrError("ocr_no_text");
  }

  return {
    rawText,
    confidence:
      calculateConfidence(lines),
    labelType:
      detectLabelType(rawText),
    unreadableSegments: [],
  };
}

function extractLines(
  value: unknown,
): Array<{
  text: string;
  confidences: number[];
}> {
  if (!isRecord(value)) {
    return [];
  }

  const typedValue =
    value as AzureImageAnalysisResponse;

  const blocks =
    typedValue.readResult?.blocks;

  if (!Array.isArray(blocks)) {
    return [];
  }

  const output: Array<{
    text: string;
    confidences: number[];
  }> = [];

  for (const block of blocks) {
    if (!Array.isArray(block.lines)) {
      continue;
    }

    for (const line of block.lines) {
      const text =
        typeof line.text === "string"
          ? normalizeWhitespace(line.text)
          : "";

      if (!text) {
        continue;
      }

      const confidences =
        Array.isArray(line.words)
          ? line.words
              .map((word) =>
                typeof word.confidence ===
                  "number"
                  ? word.confidence
                  : null,
              )
              .filter(
                (
                  confidence,
                ): confidence is number =>
                  confidence !== null &&
                  Number.isFinite(
                    confidence,
                  ) &&
                  confidence >= 0 &&
                  confidence <= 1,
              )
          : [];

      output.push({
        text,
        confidences,
      });
    }
  }

  return output;
}

function calculateConfidence(
  lines: Array<{
    text: string;
    confidences: number[];
  }>,
): number {
  const confidences =
    lines.flatMap(
      (line) => line.confidences,
    );

  if (confidences.length === 0) {
    return 0.5;
  }

  const average =
    confidences.reduce(
      (sum, value) => sum + value,
      0,
    ) / confidences.length;

  return Math.max(
    0,
    Math.min(
      1,
      Math.round(average * 100) / 100,
    ),
  );
}

function detectLabelType(
  rawText: string,
): OcrResponse["labelType"] {
  const normalized =
    rawText.toLocaleLowerCase("el-GR");

  const ingredientMarkers = [
    "συστατικά",
    "συστατικα",
    "ingredients",
    "ingredient list",
    "inci",
  ];

  const nutritionMarkers = [
    "διατροφική δήλωση",
    "διατροφικη δηλωση",
    "nutrition declaration",
    "nutrition facts",
    "ενέργεια",
    "ενεργεια",
    "energy",
    "kcal",
    "kj",
    "ανά 100",
    "ανα 100",
    "per 100",
    "λιπαρά",
    "λιπαρα",
    "fat",
    "υδατάνθρακες",
    "υδατανθρακες",
    "carbohydrate",
    "πρωτεΐνες",
    "πρωτεινες",
    "protein",
  ];

  const hasIngredients =
    ingredientMarkers.some(
      (marker) =>
        normalized.includes(marker),
    );

  const nutritionMatches =
    nutritionMarkers.filter(
      (marker) =>
        normalized.includes(marker),
    ).length;

  const hasNutrition =
    nutritionMatches >= 2;

  if (hasIngredients && hasNutrition) {
    return "mixed";
  }

  if (hasIngredients) {
    return "ingredients";
  }

  if (hasNutrition) {
    return "nutrition";
  }

  return "unknown";
}

function normalizeWhitespace(
  value: string,
): string {
  return value
    .replace(/\s+/g, " ")
    .trim();
}

function readAzureError(
  status: number,
  value: unknown,
): AzureOcrError {
  let providerMessage = "";
  let providerCode = "";

  if (isRecord(value)) {
    if (
      isRecord(value.error) &&
      typeof value.error.message ===
        "string"
    ) {
      providerMessage =
        value.error.message;

      if (typeof value.error.code === "string") {
        providerCode = value.error.code;
      }
    } else if (
      typeof value.message === "string"
    ) {
      providerMessage =
        value.message;
    }
  }

  const ocrError = new AzureOcrError(
    azureOcrErrorForStatus(status),
  );

  // Status, Azure's own error code and message — never the key or endpoint.
  console.error("azure_ocr_http_error", {
    status,
    ocrCode: ocrError.code,
    providerCode: providerCode.slice(0, 80),
    providerMessage:
      providerMessage.slice(0, 200),
  });

  return ocrError;
}

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null
  );
}