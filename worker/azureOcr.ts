import type { OcrResponse } from "./ocr";

const AZURE_API_VERSION = "2024-02-01";
const AZURE_TIMEOUT_MS = 25_000;

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
): Promise<OcrResponse> {
  const normalizedEndpoint =
    endpoint.trim().replace(/\/+$/, "");

  if (!normalizedEndpoint) {
    throw new Error(
      "Δεν έχει ρυθμιστεί το Azure Vision endpoint.",
    );
  }

  if (!apiKey.trim()) {
    throw new Error(
      "Δεν έχει ρυθμιστεί το Azure Vision key.",
    );
  }

  const requestUrl =
    `${normalizedEndpoint}` +
    "/computervision/imageanalysis:analyze" +
    `?api-version=${AZURE_API_VERSION}` +
    "&features=read";

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
      throw new Error(
        "Το Azure OCR δεν απάντησε εγκαίρως.",
      );
    }

    throw new Error(
      "Δεν ήταν δυνατή η σύνδεση με το Azure OCR.",
    );
  } finally {
    clearTimeout(timeout);
  }

  const responseBody: unknown =
    await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      readAzureError(
        response.status,
        responseBody,
      ),
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
    throw new Error(
      "Το Azure OCR δεν εντόπισε αναγνώσιμο κείμενο στην ετικέτα.",
    );
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
): string {
  let providerMessage = "";

  if (isRecord(value)) {
    if (
      isRecord(value.error) &&
      typeof value.error.message ===
        "string"
    ) {
      providerMessage =
        value.error.message;
    } else if (
      typeof value.message === "string"
    ) {
      providerMessage =
        value.message;
    }
  }

  console.error("azure_ocr_http_error", {
    status,
    providerMessage:
      providerMessage.slice(0, 200),
  });

  if (
    status === 401 ||
    status === 403
  ) {
    return "Το Azure OCR απέρριψε τα credentials. Ελέγξτε το endpoint και το key.";
  }

  if (status === 404) {
    return "Το Azure OCR endpoint δεν βρέθηκε. Ελέγξτε το Azure resource και την περιοχή.";
  }

  if (status === 429) {
    return "Το Azure OCR έχει προσωρινά υπερβεί το όριο αιτημάτων. Δοκιμάστε ξανά.";
  }

  if (status >= 500) {
    return "Το Azure OCR δεν είναι προσωρινά διαθέσιμο.";
  }

  return "Το Azure OCR δεν μπόρεσε να επεξεργαστεί την εικόνα.";
}

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null
  );
}