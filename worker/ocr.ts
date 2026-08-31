export const MAX_IMAGE_BYTES =
  5 * 1024 * 1024;

export const supportedImageTypes =
  new Set([
    "image/jpeg",
    "image/png",
    "image/webp",
  ]);

export interface OcrResponse {
  rawText: string;
  confidence: number;
  labelType:
    | "ingredients"
    | "nutrition"
    | "mixed"
    | "unknown";
  unreadableSegments: string[];
}

export function validateOcrRequest(
  image: File | null,
  barcode: string | null,
  productId: string | null,
): string | null {
  if (!image) {
    return "Λείπει η εικόνα της ετικέτας.";
  }

  if (!supportedImageTypes.has(image.type)) {
    return "Ο τύπος εικόνας δεν υποστηρίζεται.";
  }

  if (
    image.size === 0 ||
    image.size > MAX_IMAGE_BYTES
  ) {
    return "Το μέγεθος της εικόνας δεν επιτρέπεται.";
  }

  if (!barcode?.trim()) {
    return "Λείπει το barcode.";
  }

  if (!productId?.trim()) {
    return "Λείπει το productId.";
  }

  return null;
}

export function parseOcrModelOutput(
  value: unknown,
): OcrResponse | null {
  const candidate =
    extractJsonCandidate(value);

    if (!isRecord(candidate)) {
    return null;
  }

  if (
    "confidence" in candidate &&
    candidate.confidence !== undefined &&
    candidate.confidence !== null &&
    (
      typeof candidate.confidence !== "number" ||
      !Number.isFinite(candidate.confidence) ||
      candidate.confidence < 0 ||
      candidate.confidence > 1
    )
  ) {
    return null;
  }

  const labelType =
    isLabelType(candidate.labelType)
      ? candidate.labelType
      : inferLabelType(candidate);

  const unreadableSegments =
    isStringArray(candidate.unreadableSegments)
      ? candidate.unreadableSegments
          .map((segment) => segment.trim())
          .filter(Boolean)
      : [];

  if (Array.isArray(candidate.ingredients)) {
    const ingredients =
      normalizeIngredients(
        candidate.ingredients,
      );

    if (ingredients.length > 0) {
      return {
        rawText: ingredients.join(", "),
        confidence: readConfidence(
          candidate.confidence,
        ),
        labelType:
          labelType === "unknown"
            ? "ingredients"
            : labelType,
        unreadableSegments,
      };
    }

    if (
      labelType === "unknown" ||
      unreadableSegments.length > 0
    ) {
      return null;
    }
  }

  if (
    typeof candidate.rawText === "string"
  ) {
    const rawText =
      candidate.rawText.trim();

    if (!rawText) {
      return null;
    }

    return {
      rawText,
      confidence: readConfidence(
        candidate.confidence,
      ),
      labelType,
      unreadableSegments,
    };
  }

  if (
    typeof candidate.nutritionText ===
      "string" &&
    candidate.nutritionText.trim() &&
    (labelType === "nutrition" ||
      labelType === "mixed")
  ) {
    return {
      rawText:
        candidate.nutritionText.trim(),
      confidence: readConfidence(
        candidate.confidence,
      ),
      labelType,
      unreadableSegments,
    };
  }

  return null;
}

function extractJsonCandidate(
  value: unknown,
  depth: number = 0,
): unknown {
  if (depth > 5) {
    return null;
  }

  if (typeof value === "string") {
    return parseJsonObject(value);
  }

  if (!isRecord(value)) {
    return null;
  }

  if (
    Array.isArray(value.ingredients) ||
    typeof value.rawText === "string" ||
    typeof value.nutritionText === "string"
  ) {
    return value;
  }

  const textCandidates = [
    value.answer,
    value.response,
    value.description,
    value.text,
    value.output,
    value.content,
  ];

  for (const candidate of textCandidates) {
    if (typeof candidate !== "string") {
      continue;
    }

    const parsed =
      parseJsonObject(candidate);

    if (parsed !== null) {
      return parsed;
    }
  }

  if (Array.isArray(value.choices)) {
    for (const choice of value.choices) {
      const parsed =
        extractJsonCandidate(
          choice,
          depth + 1,
        );

      if (parsed !== null) {
        return parsed;
      }
    }
  }

  if ("message" in value) {
    const parsed =
      extractJsonCandidate(
        value.message,
        depth + 1,
      );

    if (parsed !== null) {
      return parsed;
    }
  }

  if ("result" in value) {
    const parsed =
      extractJsonCandidate(
        value.result,
        depth + 1,
      );

    if (parsed !== null) {
      return parsed;
    }
  }

  return null;
}

function parseJsonObject(
  value: string,
): unknown {
  let text = value.trim();

  if (!text) {
    return null;
  }

  if (text.startsWith("```")) {
    const firstNewline =
      text.indexOf("\n");

    if (firstNewline >= 0) {
      text = text.slice(
        firstNewline + 1,
      );
    } else {
      text = text.slice(3);
    }
  }

  if (text.endsWith("```")) {
    text = text.slice(0, -3);
  }

  text = text.trim();

  const directResult =
    tryParseJson(text);

  if (directResult !== null) {
    return directResult;
  }

  const firstBrace =
    text.indexOf("{");

  const lastBrace =
    text.lastIndexOf("}");

  if (
    firstBrace < 0 ||
    lastBrace <= firstBrace
  ) {
    return null;
  }

  const jsonText =
    text.slice(
      firstBrace,
      lastBrace + 1,
    );

  return tryParseJson(jsonText);
}

function tryParseJson(
  value: string,
): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function normalizeIngredients(
  value: unknown[],
): string[] {
  const ingredients: string[] = [];
  const seen =
    new Set<string>();

  for (const item of value) {
    if (typeof item !== "string") {
      continue;
    }

    const ingredient =
      item
        .replace(/\s+/g, " ")
        .trim();

    if (!ingredient) {
      continue;
    }

    const normalized =
      ingredient.toLocaleLowerCase(
        "el-GR",
      );

    if (seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    ingredients.push(ingredient);

    if (ingredients.length >= 40) {
      break;
    }
  }

  return ingredients;
}

function inferLabelType(
  candidate: Record<string, unknown>,
): OcrResponse["labelType"] {
  const hasIngredients =
    Array.isArray(candidate.ingredients) &&
    candidate.ingredients.some(
      (item) =>
        typeof item === "string" &&
        item.trim().length > 0,
    );

  const hasNutrition =
    typeof candidate.nutritionText ===
      "string" &&
    candidate.nutritionText.trim().length > 0;

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

function readConfidence(
  value: unknown,
): number {
  if (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 1
  ) {
    return value;
  }

  return 0.5;
}

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null
  );
}

function isLabelType(
  value: unknown,
): value is OcrResponse["labelType"] {
  return (
    value === "ingredients" ||
    value === "nutrition" ||
    value === "mixed" ||
    value === "unknown"
  );
}

function isStringArray(
  value: unknown,
): value is string[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        typeof item === "string",
    )
  );
}
``