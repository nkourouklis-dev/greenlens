/**
 * A second reading of a nutrition table, by a vision model, for the photos
 * the OCR text could not be made sense of.
 *
 * The model is asked for numbers only; they are rewritten here as the
 * ordinary "name value unit" rows the deterministic reader already
 * understands, so they go through exactly the same plausibility checks as a
 * table read from OCR — energy against macronutrients, sugars against
 * carbohydrate, and so on. A misread number is rejected there; nothing the
 * model says is trusted on its own.
 */

export const NUTRITION_VISION_PROMPT = [
  "This is a photo of a food nutrition table. Read the PER 100 g (or per 100 ml) column only, never the per-portion column.",
  'Return ONLY a JSON object: {"energyKcal": number|null, "fat": number|null, "saturates": number|null, "carbohydrate": number|null, "sugars": number|null, "fibre": number|null, "protein": number|null, "salt": number|null}.',
  "Use grams for everything except energyKcal. Use a dot for decimals. Use null for any row that is not printed. Do not guess.",
].join("\n");

const ROWS: Array<[string, string]> = [
  ["fat", "Λιπαρά"],
  ["saturates", "κορεσμένα"],
  ["carbohydrate", "Υδατάνθρακες"],
  ["sugars", "σάκχαρα"],
  ["fibre", "Εδώδιμες ίνες"],
  ["protein", "Πρωτεΐνες"],
  ["salt", "Αλάτι"],
];

function asAmount(value: unknown): number | null {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value.replace(",", "."))
        : NaN;

  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 5000
    ? parsed
    : null;
}

function grams(value: number): string {
  return String(value).replace(".", ",");
}

/**
 * The model's reply as label-style rows, or null when it did not give the
 * three totals a table needs (fat, carbohydrate, protein).
 */
export function tableTextFromVision(reply: string): string | null {
  const start = reply.indexOf("{");
  const end = reply.lastIndexOf("}");

  if (start === -1 || end <= start) {
    return null;
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(reply.slice(start, end + 1));
  } catch {
    return null;
  }

  if (typeof parsed !== "object" || parsed === null) {
    return null;
  }

  const record = parsed as Record<string, unknown>;

  const amounts = new Map<string, number>();

  for (const [key] of ROWS) {
    const amount = asAmount(record[key]);

    if (amount !== null) {
      amounts.set(key, amount);
    }
  }

  if (
    !amounts.has("fat") ||
    !amounts.has("carbohydrate") ||
    !amounts.has("protein")
  ) {
    return null;
  }

  const lines: string[] = [];

  const kcal = asAmount(record.energyKcal);

  if (kcal !== null) {
    lines.push(`Ενέργεια ${grams(kcal)} kcal`);
  }

  for (const [key, name] of ROWS) {
    const amount = amounts.get(key);

    if (amount !== undefined) {
      lines.push(`${name} ${grams(amount)} g`);
    }
  }

  return lines.join("\n");
}
