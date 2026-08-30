export interface ProductIdentity {
  productName: string | null;
  brand: string | null;
  netContent: string | null;
  confidence: number;
}

export const identifyPrompt = [
  "Read the product name and brand from the front of this package.",
  "",
  "Return ONLY this JSON object:",
  "{",
  '  "productName": "string or null",',
  '  "brand": "string or null",',
  '  "netContent": "string or null"',
  "}",
  "",
  "Rules:",
  "- Read only text clearly printed on the package.",
  "- Do not guess the brand from the logo design.",
  "- Do not invent a product name.",
  "- Use null when text is not clearly readable.",
  "- Ignore ingredient lists and nutrition tables.",
  "- Keep productName under 60 characters.",
  "- Return ONLY the JSON object. No commentary. No Markdown.",
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