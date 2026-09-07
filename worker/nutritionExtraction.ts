export interface NutritionTextResult {
  rawText: string;
  nutritionText: string | null;
  confidence: number;
  isValid: boolean;
  reasons: string[];
}

const MIN_TEXT_LENGTH = 15;

const NUTRITION_HEADINGS = [
  "διατροφικές πληροφορίες",
  "διατροφικες πληροφοριες",
  "διατροφική δήλωση",
  "διατροφικη δηλωση",
  "διατροφικά στοιχεία",
  "διατροφικα στοιχεια",
  "nutrition facts",
  "nutritional information",
  "nutrition declaration",
];

// Lines carrying only manufacturer/contact/storage noise, never nutrition
// values — dropped from the isolated block the same way ingredientText.ts
// drops them for ingredient lists, but with its own, independent list so
// that file stays untouched.
const NOISE_LINE_MARKERS = [
  "http://",
  "https://",
  "www.",
  "@",
  "tel:",
  "τηλ:",
  "παρασκευάζεται",
  "παρασκευαζεται",
  "διανέμεται",
  "διανεμεται",
  "εισάγεται",
  "εισαγεται",
  "made in",
  "manufacturer",
  "distributed by",
  "imported by",
  "αποθήκευση",
  "αποθηκευση",
  "storage",
  "best before",
  "ανάλωση κατά προτίμηση",
  "αναλωση κατα προτιμηση",
  "barcode",
  "lot:",
  "batch",
];

const NUMERIC_UNIT_PATTERN =
  /\d+(?:[.,]\d+)?\s*(?:kcal|kj|g|mg|µg|mcg|%)\b/gi;

function countPattern(text: string, pattern: RegExp): number {
  return (text.match(pattern) ?? []).length;
}

function isolateNutritionLines(text: string): string {
  const lines = text.split(/\r?\n/);

  const kept = lines.filter((line) => {
    const normalized = line.toLowerCase();
    return !NOISE_LINE_MARKERS.some((marker) => normalized.includes(marker));
  });

  const joined = kept.join("\n").trim();

  return joined.length >= MIN_TEXT_LENGTH ? joined : text.trim();
}

/**
 * Deterministic validator for nutrition-table text, mirroring the shape and
 * intent of `extractIngredientText` for the ingredients path, but tuned for
 * numeric-value tables (energy/protein/fat/carbohydrate amounts) instead of
 * comma-separated substance names.
 */
export function extractNutritionData(
  rawText: string,
  ocrConfidence: number,
): NutritionTextResult {
  const trimmed = rawText.trim();

  if (trimmed.length < MIN_TEXT_LENGTH) {
    return {
      rawText: trimmed,
      nutritionText: null,
      confidence: 0,
      isValid: false,
      reasons: ["Πολύ σύντομο κείμενο για διατροφικό πίνακα."],
    };
  }

  const section = isolateNutritionLines(trimmed);
  const normalized = section.toLowerCase();

  const numericUnitCount = countPattern(section, NUMERIC_UNIT_PATTERN);
  const hasHeading = NUTRITION_HEADINGS.some((heading) =>
    normalized.includes(heading),
  );

  const isValid = numericUnitCount >= 2 || hasHeading;

  const reasons: string[] = isValid
    ? []
    : ["Δεν εντοπίστηκαν διατροφικές τιμές (θερμίδες, πρωτεΐνες, λιπαρά κ.λπ.)."];

  const extractionConfidence = !isValid
    ? 0
    : hasHeading
      ? 1
      : Math.min(1, 0.55 + numericUnitCount * 0.05);

  return {
    rawText: trimmed,
    nutritionText: isValid ? section : null,
    confidence: Math.min(extractionConfidence, ocrConfidence + 0.3, 1),
    isValid,
    reasons,
  };
}
