export interface ProductIdentity {
  productName: string | null;
  brand: string | null;
  netContent: string | null;
  confidence: number;
}

export const identifyPrompt = [
  "Read only the product name and brand from the visible text on this package front.",
  "",
  "Return ONLY this JSON object:",
  "{",
  '  "productName": "string or null",',
  '  "brand": "string or null",',
  '  "netContent": "string or null"',
  "}",
  "",
  "Rules:",
  "- Read only clearly visible text.",
  "- Do not guess from logo or design.",
  "- Return null when unreadable.",
  "- Ignore ingredients, nutrition labels, warnings.",
  "- Keep productName ≤80 chars, brand ≤60 chars.",
  "- Return ONLY JSON. No markdown. No commentary.",
].join("\n");

export function parseProductIdentity(
  value: unknown,
): ProductIdentity | null {
  const candidate = extractJson(value);

  if (!isRecord(candidate)) {
    return null;
  }

  const productName = readField(
    candidate.productName,
    60,
  );

  const brand = readField(candidate.brand, 40);

  const netContent = readField(
    candidate.netContent,
    20,
  );

  if (!productName && !brand) {
    return null;
  }

  return {
    productName,
    brand,
    netContent,
    confidence: productName ? 0.6 : 0.4,
  };
}

function readField(
  value: unknown,
  maxLength: number,
): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  if (
    !trimmed ||
    trimmed.toLowerCase() === "null" ||
    trimmed.toLowerCase() === "unknown"
  ) {
    return null;
  }

  return trimmed.slice(0, maxLength);
}

function extractJson(value: unknown): unknown {
  if (typeof value === "string") {
    return parseJsonText(value);
  }

  if (!isRecord(value)) {
    return null;
  }

  if (isRecord(value.result)) {
    const answer = value.result.answer;

    if (typeof answer === "string") {
      return parseJsonText(answer);
    }
  }

  if (typeof value.answer === "string") {
    return parseJsonText(value.answer);
  }

  if (typeof value.response === "string") {
    return parseJsonText(value.response);
  }

  return value;
}

function parseJsonText(value: string): unknown {
  let text = value.trim();

  if (text.startsWith("```")) {
    const newline = text.indexOf("\n");

    text =
      newline >= 0
        ? text.slice(newline + 1)
        : text.slice(3);
  }

  if (text.endsWith("```")) {
    text = text.slice(0, -3);
  }

  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");

  if (first >= 0 && last > first) {
    text = text.slice(first, last + 1);
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === "object" && value !== null
  );
}