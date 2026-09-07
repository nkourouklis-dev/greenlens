export interface ChemicalTextResult {
  rawText: string;
  chemicalText: string | null;
  confidence: number;
  isValid: boolean;
  reasons: string[];
}

const MIN_TEXT_LENGTH = 10;

const CHEMICAL_HEADINGS = [
  "χημική ανάλυση",
  "χημικη αναλυση",
  "ανάλυση νερού",
  "αναλυση νερου",
  "τυπική χημική ανάλυση",
  "τυπικη χημικη αναλυση",
  "chemical analysis",
  "water analysis",
  "typical analysis",
];

// Same intent as nutritionExtraction.ts's noise list — independent from
// ingredientText.ts on purpose, so that file stays untouched.
const NOISE_LINE_MARKERS = [
  "http://",
  "https://",
  "www.",
  "@",
  "tel:",
  "τηλ:",
  "παρασκευάζεται",
  "παρασκευαζεται",
  "εμφιαλώνεται",
  "εμφιαλωνεται",
  "διανέμεται",
  "διανεμεται",
  "εισάγεται",
  "εισαγεται",
  "made in",
  "manufacturer",
  "distributed by",
  "imported by",
  "barcode",
  "lot:",
  "batch",
  "best before",
];

const NUMERIC_UNIT_PATTERN =
  /\d+(?:[.,]\d+)?\s*(?:mg\/l|µg\/l|mg\/kg|ms\/cm|°dh|mval\/l|mmol\/l|%)\b/gi;

const ELEMENT_VALUE_PATTERN =
  /\b(ca|mg|na|k|so4|no3|no2|cl|hco3|pb|cd|as|hg|cu|fe|mn|zn|f|ph)\s*[:=]?\s*\d/gi;

function countPattern(text: string, pattern: RegExp): number {
  return (text.match(pattern) ?? []).length;
}

function isolateChemicalLines(text: string): string {
  const lines = text.split(/\r?\n/);

  const kept = lines.filter((line) => {
    const normalized = line.toLowerCase();
    return !NOISE_LINE_MARKERS.some((marker) => normalized.includes(marker));
  });

  const joined = kept.join("\n").trim();

  return joined.length >= MIN_TEXT_LENGTH ? joined : text.trim();
}

/**
 * Deterministic validator for chemical/lab-analysis text (water hardness,
 * mineral concentrations, pH), mirroring extractIngredientText's shape but
 * tuned for element/compound-with-concentration tables instead of
 * comma-separated ingredient names.
 */
export function extractChemicalComposition(
  rawText: string,
  ocrConfidence: number,
): ChemicalTextResult {
  const trimmed = rawText.trim();

  if (trimmed.length < MIN_TEXT_LENGTH) {
    return {
      rawText: trimmed,
      chemicalText: null,
      confidence: 0,
      isValid: false,
      reasons: ["Πολύ σύντομο κείμενο για χημική ανάλυση."],
    };
  }

  const section = isolateChemicalLines(trimmed);
  const normalized = section.toLowerCase();

  const numericUnitCount = countPattern(section, NUMERIC_UNIT_PATTERN);
  const elementValueCount = countPattern(section, ELEMENT_VALUE_PATTERN);
  const hasHeading = CHEMICAL_HEADINGS.some((heading) =>
    normalized.includes(heading),
  );

  const isValid =
    numericUnitCount >= 1 || elementValueCount >= 2 || hasHeading;

  const reasons: string[] = isValid
    ? []
    : ["Δεν εντοπίστηκαν συγκεντρώσεις στοιχείων/ενώσεων (π.χ. Ca, Mg, mg/L, pH)."];

  const extractionConfidence = !isValid
    ? 0
    : hasHeading
      ? 1
      : Math.min(1, 0.5 + (numericUnitCount + elementValueCount) * 0.05);

  return {
    rawText: trimmed,
    chemicalText: isValid ? section : null,
    confidence: Math.min(extractionConfidence, ocrConfidence + 0.3, 1),
    isValid,
    reasons,
  };
}
