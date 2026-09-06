export interface IngredientTextResult {
  rawText: string;
  ingredientText: string | null;
  labelType: "ingredients" | "nutrition" | "mixed" | "unknown";
  confidence: number;
  isValid: boolean;
  reasons: string[];
}

const INGREDIENT_HEADINGS = [
  "\u03c3\u03c5\u03c3\u03c4\u03b1\u03c4\u03b9\u03ba\u03b1",
  "\u03c3\u03c5\u03c3\u03c4\u03b1\u03c4\u03b9\u03ba\u03ac",
  "ingredients",
  "ingredient list",
  "ingredienti",
  "ingredients list",
  "ingr\u00e9dients",
  "ingredientes",
  "ingredi\u00ebnten",
  "zutaten",
  "zutatenliste",
  "inci",
  "composition",
  "\u03c3\u03cd\u03bd\u03b8\u03b5\u03c3\u03b7",
  "\u03c3\u03c5\u03bd\u03b8\u03b5\u03c3\u03b7",
  "\u03c0\u03b5\u03c1\u03b9\u03ad\u03c7\u03b5\u03b9",
  "\u03c0\u03b5\u03c1\u03b9\u03b5\u03c7\u03b5\u03b9",
  "contains",
];

const SECTION_BOUNDARIES = [
  "nutrition",
  "nutrition facts",
  "nutrition declaration",
  "nutritional information",
  "dietary information",
  "\u03b4\u03b9\u03b1\u03c4\u03c1\u03bf\u03c6\u03b9\u03ba\u03ad\u03c2 \u03c0\u03bb\u03b7\u03c1\u03bf\u03c6\u03bf\u03c1\u03af\u03b5\u03c2",
  "\u03b4\u03b9\u03b1\u03c4\u03c1\u03bf\u03c6\u03b9\u03ba\u03b5\u03c2 \u03c0\u03bb\u03b7\u03c1\u03bf\u03c6\u03bf\u03c1\u03b9\u03b5\u03c2",
  "\u03b4\u03b9\u03b1\u03c4\u03c1\u03bf\u03c6\u03b9\u03ba\u03ae \u03b4\u03ae\u03bb\u03c9\u03c3\u03b7",
  "\u03b4\u03b9\u03b1\u03c4\u03c1\u03bf\u03c6\u03b9\u03ba\u03b7 \u03b4\u03b7\u03bb\u03c9\u03c3\u03b7",
  "\u03b4\u03b9\u03b1\u03c4\u03c1\u03bf\u03c6\u03b9\u03ba\u03ac \u03c3\u03c4\u03bf\u03b9\u03c7\u03b5\u03af\u03b1",
  "\u03b4\u03b9\u03b1\u03c4\u03c1\u03bf\u03c6\u03b9\u03ba\u03b1 \u03c3\u03c4\u03bf\u03b9\u03c7\u03b5\u03b9\u03b1",
  "\u03bf\u03b4\u03b7\u03b3\u03af\u03b5\u03c2 \u03c7\u03c1\u03ae\u03c3\u03b7\u03c2",
  "\u03bf\u03b4\u03b7\u03b3\u03b9\u03b5\u03c2 \u03c7\u03c1\u03b7\u03c3\u03b7\u03c2",
  "directions",
  "preparation",
  "warnings",
  "\u03c0\u03c1\u03bf\u03b5\u03b9\u03b4\u03bf\u03c0\u03bf\u03af\u03b7\u03c3\u03b7",
  "\u03c0\u03c1\u03bf\u03b5\u03b9\u03b4\u03bf\u03c0\u03bf\u03b9\u03b7\u03c3\u03b7",
  "\u03c0\u03c1\u03bf\u03b5\u03b9\u03b4\u03bf\u03c0\u03bf\u03b9\u03ae\u03c3\u03b5\u03b9\u03c2",
  "\u03c0\u03c1\u03bf\u03b5\u03b9\u03b4\u03bf\u03c0\u03bf\u03b9\u03b7\u03c3\u03b5\u03b9\u03c2",
  "storage",
  "\u03b1\u03c0\u03bf\u03b8\u03ae\u03ba\u03b5\u03c5\u03c3\u03b7",
  "\u03b1\u03c0\u03bf\u03b8\u03b7\u03ba\u03b5\u03c5\u03c3\u03b7",
  "keep in",
  "best before",
  "\u03b1\u03bd\u03ac\u03bb\u03c9\u03c3\u03b7 \u03ba\u03b1\u03c4\u03ac \u03c0\u03c1\u03bf\u03c4\u03af\u03bc\u03b7\u03c3\u03b7",
  "\u03b1\u03bd\u03b1\u03bb\u03c9\u03c3\u03b7 \u03ba\u03b1\u03c4\u03b1 \u03c0\u03c1\u03bf\u03c4\u03b9\u03bc\u03b7\u03c3\u03b7",
  "manufacturer",
  "distributor",
  "distributed by",
  "\u03c0\u03b1\u03c1\u03b1\u03c3\u03ba\u03b5\u03c5\u03ac\u03b6\u03b5\u03c4\u03b1\u03b9",
  "\u03c0\u03b1\u03c1\u03b1\u03c3\u03ba\u03b5\u03c5\u03b1\u03b6\u03b5\u03c4\u03b1\u03b9",
  "\u03b4\u03b9\u03b1\u03bd\u03ad\u03bc\u03b5\u03c4\u03b1\u03b9",
  "\u03b4\u03b9\u03b1\u03bd\u03b5\u03bc\u03b5\u03c4\u03b1\u03b9",
  "contact",
  "website",
  "email",
  "barcode",
  "recycling",
  "recycling information",
  "imported by",
  "\u03b5\u03b9\u03c3\u03ac\u03b3\u03b5\u03c4\u03b1\u03b9",
  "\u03b5\u03b9\u03c3\u03b1\u03b3\u03b5\u03c4\u03b1\u03b9",
];

const NOISE_MARKERS = [
  "http://",
  "https://",
  "www.",
  ".com",
  ".gr",
  ".eu",
  "@",
  "tel:",
  "telephone",
  "phone",
  "fax:",
  "made in",
  "\u03c0\u03b1\u03c1\u03b1\u03c3\u03ba\u03b5\u03c5\u03ac\u03b6\u03b5\u03c4\u03b1\u03b9",
  "\u03c0\u03b1\u03c1\u03b1\u03c3\u03ba\u03b5\u03c5\u03b1\u03b6\u03b5\u03c4\u03b1\u03b9",
  "distributed by",
  "\u03b4\u03b9\u03b1\u03bd\u03ad\u03bc\u03b5\u03c4\u03b1\u03b9",
  "\u03b4\u03b9\u03b1\u03bd\u03b5\u03bc\u03b5\u03c4\u03b1\u03b9",
  "imported by",
  "\u03b5\u03b9\u03c3\u03ac\u03b3\u03b5\u03c4\u03b1\u03b9",
  "\u03b5\u03b9\u03c3\u03b1\u03b3\u03b5\u03c4\u03b1\u03b9",
  "\u03b4\u03c1\u03bf\u03c3\u03b5\u03c1\u03cc",
  "\u03b4\u03c1\u03bf\u03c3\u03b5\u03c1\u03bf",
  "cool place",
  "keep in",
  "store in",
  "\u03b1\u03c0\u03bf\u03b8\u03b7\u03ba\u03b5\u03cd\u03c3\u03c4\u03b5",
  "\u03b1\u03c0\u03bf\u03b8\u03b7\u03ba\u03b5\u03c5\u03c3\u03c4\u03b5",
  "suitable for",
  "low sodium",
  "low content",
  "minerals",
  "diet",
  "lot:",
  "batch",
  "best before",
  "\u03b1\u03bd\u03ac\u03bb\u03c9\u03c3\u03b7 \u03ba\u03b1\u03c4\u03ac \u03c0\u03c1\u03bf\u03c4\u03af\u03bc\u03b7\u03c3\u03b7",
  "\u03b1\u03bd\u03b1\u03bb\u03c9\u03c3\u03b7 \u03ba\u03b1\u03c4\u03b1 \u03c0\u03c1\u03bf\u03c4\u03b9\u03bc\u03b7\u03c3\u03b7",
  "neck of bottle",
  "s.a.",
  "a.b.e.e",
  "ltd",
  "gmbh",
  "s.p.a.",
];

const NUTRITION_MARKERS = [
  "energy",
  "\u03b5\u03bd\u03ad\u03c1\u03b3\u03b5\u03b9\u03b1",
  "\u03b5\u03bd\u03b5\u03c1\u03b3\u03b5\u03b9\u03b1",
  "kcal",
  "kj",
  "fat",
  "\u03bb\u03b9\u03c0\u03b1\u03c1\u03ac",
  "\u03bb\u03b9\u03c0\u03b1\u03c1\u03b1",
  "saturates",
  "carbohydrate",
  "carbohydrates",
  "\u03c5\u03b4\u03b1\u03c4\u03ac\u03bd\u03b8\u03c1\u03b1\u03ba\u03b5\u03c2",
  "\u03c5\u03b4\u03b1\u03c4\u03b1\u03bd\u03b8\u03c1\u03b1\u03ba\u03b5\u03c2",
  "sugars",
  "\u03c3\u03ac\u03ba\u03c7\u03b1\u03c1\u03b1",
  "\u03c3\u03b1\u03ba\u03c7\u03b1\u03c1\u03b1",
  "protein",
  "proteins",
  "\u03c0\u03c1\u03c9\u03c4\u03b5\u0390\u03bd\u03b5\u03c2",
  "\u03c0\u03c1\u03c9\u03c4\u03b5\u03b9\u03bd\u03b5\u03c2",
  "salt",
  "\u03b1\u03bb\u03ac\u03c4\u03b9",
  "\u03b1\u03bb\u03b1\u03c4\u03b9",
  "fibre",
  "fiber",
  "\u03b5\u03b4\u03ce\u03b4\u03b9\u03bc\u03b5\u03c2 \u03af\u03bd\u03b5\u03c2",
  "\u03b5\u03b4\u03c9\u03b4\u03b9\u03bc\u03b5\u03c2 \u03b9\u03bd\u03b5\u03c2",
  "per 100",
  "\u03b1\u03bd\u03ac 100",
  "\u03b1\u03bd\u03b1 100",
  "%rda",
  "\u03b4\u03b9\u03b1\u03c4\u03c1\u03bf\u03c6\u03b9\u03ba\u03ae \u03b4\u03ae\u03bb\u03c9\u03c3\u03b7",
  "\u03b4\u03b9\u03b1\u03c4\u03c1\u03bf\u03c6\u03b9\u03ba\u03b7 \u03b4\u03b7\u03bb\u03c9\u03c3\u03b7",
  "nutrition declaration",
  "nutrition facts",
];

/**
 * Phrases that only ever appear on a nutrition declaration. A single hit is
 * enough to classify the text, no numeric evidence required.
 */
const NUTRITION_DECISIVE_PHRASES = [
  "\u03b4\u03b9\u03b1\u03c4\u03c1\u03bf\u03c6\u03b9\u03ba\u03ae \u03b4\u03ae\u03bb\u03c9\u03c3\u03b7",
  "\u03b4\u03b9\u03b1\u03c4\u03c1\u03bf\u03c6\u03b9\u03ba\u03b7 \u03b4\u03b7\u03bb\u03c9\u03c3\u03b7",
  "\u03b4\u03b9\u03b1\u03c4\u03c1\u03bf\u03c6\u03b9\u03ba\u03ac \u03c3\u03c4\u03bf\u03b9\u03c7\u03b5\u03af\u03b1",
  "\u03b4\u03b9\u03b1\u03c4\u03c1\u03bf\u03c6\u03b9\u03ba\u03b1 \u03c3\u03c4\u03bf\u03b9\u03c7\u03b5\u03b9\u03b1",
  "\u03b4\u03b9\u03b1\u03c4\u03c1\u03bf\u03c6\u03b9\u03ba\u03ad\u03c2 \u03c0\u03bb\u03b7\u03c1\u03bf\u03c6\u03bf\u03c1\u03af\u03b5\u03c2",
  "\u03b4\u03b9\u03b1\u03c4\u03c1\u03bf\u03c6\u03b9\u03ba\u03b5\u03c2 \u03c0\u03bb\u03b7\u03c1\u03bf\u03c6\u03bf\u03c1\u03b9\u03b5\u03c2",
  "nutrition declaration",
  "nutrition facts",
  "nutritional information",
  "dietary information",
  "per 100 g",
  "per 100 ml",
  "\u03b1\u03bd\u03ac 100 g",
  "\u03b1\u03bd\u03b1 100 g",
  "\u03b1\u03bd\u03ac 100 ml",
  "\u03b1\u03bd\u03b1 100 ml",
];

const INGREDIENT_MARKERS = [
  "water",
  "aqua",
  "\u03bd\u03b5\u03c1\u03cc",
  "\u03bd\u03b5\u03c1\u03bf",
  "glycerin",
  "\u03b3\u03bb\u03c5\u03ba\u03b5\u03c1\u03af\u03bd\u03b7",
  "\u03b3\u03bb\u03c5\u03ba\u03b5\u03c1\u03b9\u03bd\u03b7",
  "alcohol",
  "\u03bf\u03b9\u03bd\u03bf",
  "\u03bf\u03af\u03bd\u03bf",
  "\u03b1\u03bb\u03ba\u03bf\u03cc\u03bb",
  "\u03b1\u03bb\u03ba\u03bf\u03bf\u03bb",
  "acid",
  "\u03bf\u03be\u03cd",
  "\u03bf\u03be\u03c5",
  "oil",
  "\u03ad\u03bb\u03b1\u03b9\u03bf",
  "\u03b5\u03bb\u03b1\u03b9\u03bf",
  "extract",
  "\u03ad\u03ba\u03c7\u03cd\u03bb\u03b9\u03c3\u03bc\u03b1",
  "\u03b5\u03ba\u03c7\u03c5\u03bb\u03b9\u03c3\u03bc\u03b1",
  "parfum",
  "\u03ac\u03c1\u03c9\u03bc\u03b1",
  "\u03b1\u03c1\u03c9\u03bc\u03b1",
  "fragrance",
  "sodium",
  "\u03bd\u03ac\u03c4\u03c1\u03b9\u03bf",
  "\u03bd\u03b1\u03c4\u03c1\u03b9\u03bf",
  "potassium",
  "calcium",
  "sulphate",
  "sulfate",
  "citrate",
  "chloride",
  "starch",
  "\u03ac\u03bc\u03c5\u03bb\u03bf",
  "\u03b1\u03bc\u03c5\u03bb\u03bf",
  "flour",
  "\u03b1\u03bb\u03b5\u03cd\u03c1\u03b9",
  "\u03b1\u03bb\u03b5\u03c5\u03c1\u03b9",
  "sugar",
  "\u03b6\u03ac\u03c7\u03b1\u03c1\u03b7",
  "\u03b6\u03b1\u03c7\u03b1\u03c1\u03b7",
  "salt",
  "\u03b1\u03bb\u03ac\u03c4\u03b9",
  "\u03b1\u03bb\u03b1\u03c4\u03b9",
  "milk",
  "\u03b3\u03ac\u03bb\u03b1",
  "\u03b3\u03b1\u03bb\u03b1",
  "wheat",
  "\u03c3\u03af\u03c4\u03bf\u03c2",
  "\u03c3\u03b9\u03c4\u03bf\u03c2",
  "vinegar",
  "\u03be\u03cd\u03b4\u03b9",
  "\u03be\u03c5\u03b4\u03b9",
  "preservative",
  "\u03c3\u03c5\u03bd\u03c4\u03b7\u03c1\u03b7\u03c4\u03b9\u03ba\u03cc",
  "\u03c3\u03c5\u03bd\u03c4\u03b7\u03c1\u03b7\u03c4\u03b9\u03ba\u03bf",
  "color",
  "colour",
  "\u03c7\u03c1\u03ce\u03bc\u03b1",
  "\u03c7\u03c1\u03c9\u03bc\u03b1",
  "emulsifier",
  "\u03b3\u03b1\u03bb\u03b1\u03ba\u03c4\u03c9\u03bc\u03b1\u03c4\u03b9\u03ba\u03cc",
  "\u03b3\u03b1\u03bb\u03b1\u03ba\u03c4\u03c9\u03bc\u03b1\u03c4\u03b9\u03ba\u03bf",
  "linalool",
  "limonene",
  "citronellol",
  "geraniol",
  "coumarin",
  "tocopherol",
  "tocopheryl",
  "panthenol",
  "dimethicone",
  "cetearyl",
  "phenoxyethanol",
  "butyrospermum",
  "niacinamide",
  "cocamidopropyl",
];

/**
 * A real nutrition table always pairs its vocabulary with measured values.
 * Ingredient lists mention the same words without measurement pairs.
 */
const NUTRITION_NUMERIC_UNIT_THRESHOLD = 3;

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u0301\u0390\u03b0]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isWordCharacter(character: string): boolean {
  if (!character) {
    return false;
  }

  return /[\p{L}\p{N}]/u.test(character);
}

/**
 * Whole-word containment check.
 *
 * Plain substring matching produced false positives that broke the flow:
 * "fat" matched "fatty acids", and "\u03b9\u03bd\u03b5\u03c2" matched Greek words ending in
 * -ines such as "\u03b3\u03bb\u03c5\u03ba\u03b5\u03c1\u03b9\u03bd\u03b5\u03c2". Both pushed real ingredient lists into the
 * nutrition branch.
 */
function containsWord(haystack: string, needle: string): boolean {
  if (!needle) {
    return false;
  }

  const guardStart = isWordCharacter(needle[0]);
  const guardEnd = isWordCharacter(needle[needle.length - 1]);

  let fromIndex = 0;

  for (;;) {
    const index = haystack.indexOf(needle, fromIndex);

    if (index < 0) {
      return false;
    }

    const before = index > 0 ? haystack[index - 1] : "";
    const after = haystack[index + needle.length] ?? "";

    const startOk = !guardStart || !isWordCharacter(before);
    const endOk = !guardEnd || !isWordCharacter(after);

    if (startOk && endOk) {
      return true;
    }

    fromIndex = index + 1;
  }
}

function countMarkers(text: string, markers: string[]): number {
  const normalized = normalize(text);
  let count = 0;

  for (const marker of markers) {
    if (containsWord(normalized, normalize(marker))) {
      count += 1;
    }
  }

  return count;
}

/**
 * Counts numeric values that carry a measurement unit, e.g. "25 g",
 * "500 kcal", "12%". This is the strongest signal of a nutrition table.
 */
function countNumericUnits(text: string): number {
  const normalized = text.toLowerCase();

  const matches =
    normalized.match(
      /\d+(?:[.,]\d+)?\s*(kcal|kj|mg|\u00b5g|\u03bcg|g\b|\u03b3\u03c1|ml|%)/g,
    ) ?? [];

  return matches.length;
}

function findHeadingMatch(text: string): number {
  const normalized = normalize(text);

  for (const heading of INGREDIENT_HEADINGS) {
    const idx = normalized.indexOf(normalize(heading));
    if (idx >= 0) {
      return idx;
    }
  }

  return -1;
}

function isBoundaryLine(line: string): boolean {
  const normalized = normalize(line);
  return SECTION_BOUNDARIES.some((boundary) =>
    normalized.includes(normalize(boundary)),
  );
}

function stripNoiseSegments(text: string): string {
  return text
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/www\.[^\s]+/gi, " ")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, " ")
    .replace(/\b(?:tel|telephone|phone|fax)\s*[:\-]?[^\n]+/gi, " ")
    .replace(
      /\b(?:website|manufacturer|distributor|imported by|distributed by|storage|directions|preparation|nutrition facts|recycling information)\b[^\n]*[:\-]?[^\n]*/gi,
      " ",
    )
    .replace(/\b(?:keep in|store in|best before|avoid|recycle)\b[^\n]*/gi, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function countNoiseMarkers(text: string): number {
  const normalized = normalize(text);
  let count = 0;

  for (const marker of NOISE_MARKERS) {
    const normalizedMarker = normalize(marker);

    // Punctuation-heavy markers such as "www." or "@" cannot use word
    // boundaries, so they keep plain containment.
    const usesWordBoundary =
      isWordCharacter(normalizedMarker[0]) &&
      isWordCharacter(normalizedMarker[normalizedMarker.length - 1]);

    const hit = usesWordBoundary
      ? containsWord(normalized, normalizedMarker)
      : normalized.includes(normalizedMarker);

    if (hit) {
      count += 1;
    }
  }

  return count;
}

function countNutritionMarkers(text: string): number {
  return countMarkers(text, NUTRITION_MARKERS);
}

function countIngredientMarkers(text: string): number {
  return countMarkers(text, INGREDIENT_MARKERS);
}

function hasDecisiveNutritionPhrase(text: string): boolean {
  const normalized = normalize(text);

  return NUTRITION_DECISIVE_PHRASES.some((phrase) =>
    normalized.includes(normalize(phrase)),
  );
}

/**
 * Decides whether a block of text really is a nutrition declaration.
 *
 * Requires either an unambiguous heading phrase, or nutrition vocabulary
 * backed by several measured values. Vocabulary alone is not enough,
 * because ingredient lists legitimately mention salt, vitamins and oils.
 */
function looksLikeNutritionTable(text: string): boolean {
  if (hasDecisiveNutritionPhrase(text)) {
    return true;
  }

  const markerCount = countNutritionMarkers(text);
  const numericUnitCount = countNumericUnits(text);

  return (
    markerCount >= 2 &&
    numericUnitCount >= NUTRITION_NUMERIC_UNIT_THRESHOLD
  );
}

function hasStructuredFormat(text: string): boolean {
  const lines = text.split("\n").map((l) => l.trim());
  const nonEmptyLines = lines.filter((l) => l.length > 0);

  const commaSeparated = text.split(",").length >= 3;
  const semicolonSeparated = text.split(";").length >= 3;
  const multiline = nonEmptyLines.length >= 3;

  return commaSeparated || semicolonSeparated || multiline;
}

function isLikelyMarketingClaim(text: string): boolean {
  const normalized = normalize(text);

  const claimPatterns = [
    "suitable for",
    "low sodium",
    "low content",
    "diet",
    "gluten",
    "allergen",
    "free",
    "organic",
    "natural",
    "eco",
    "green",
  ];

  const matchingPatterns = claimPatterns.filter((p) =>
    containsWord(normalized, p),
  ).length;

  return matchingPatterns >= 2;
}

function isLikelyStorageOrDirections(text: string): boolean {
  const normalized = normalize(text);

  const storagePatterns = [
    "cool place",
    "store in",
    "keep in",
    "away from",
    "away of",
    "odours",
    "light",
    "moisture",
    "temperature",
    "\u03b1\u03c0\u03bf\u03b8\u03b7\u03ba\u03b5\u03c5\u03c3\u03b7",
    "\u03b4\u03c1\u03bf\u03c3\u03b5\u03c1\u03bf",
  ];

  const matchingPatterns = storagePatterns.filter((p) =>
    containsWord(normalized, p),
  ).length;

  return matchingPatterns >= 2;
}

function extractIngredientTextWithHeading(
  rawText: string,
): string | null {
  const headingIdx = findHeadingMatch(rawText);

  if (headingIdx < 0) {
    return null;
  }

  const afterHeading = rawText.substring(headingIdx);
  const colonIdx = afterHeading.indexOf(":");
  const newlineAfterHeading = afterHeading.indexOf("\n");

  let contentStart = 0;

  if (
    colonIdx >= 0 &&
    (newlineAfterHeading < 0 || colonIdx < newlineAfterHeading)
  ) {
    const afterColon = afterHeading
      .substring(colonIdx + 1)
      .split("\n")[0]
      .trim();

    if (afterColon.length > 0) {
      contentStart = colonIdx + 1;
    } else if (newlineAfterHeading >= 0) {
      contentStart = newlineAfterHeading + 1;
    } else {
      return null;
    }
  } else if (newlineAfterHeading >= 0) {
    contentStart = newlineAfterHeading + 1;
  } else {
    return null;
  }

  const contentAfterStart = afterHeading.substring(contentStart);

  const doubleNewlineIdx = contentAfterStart.indexOf("\n\n");
  let endIdx = contentAfterStart.length;

  if (doubleNewlineIdx >= 0) {
    endIdx = doubleNewlineIdx;
  } else {
    const normalized = normalize(contentAfterStart);

    const boundaries = SECTION_BOUNDARIES.map((b) => ({
      boundary: b,
      idx: normalized.indexOf(normalize(b)),
    }))
      .filter((b) => b.idx >= 0)
      .sort((a, b) => a.idx - b.idx);

    if (boundaries.length > 0) {
      endIdx = boundaries[0].idx;
    }
  }

  const ingredientBlock = contentAfterStart.substring(0, endIdx).trim();

  const cleanedBlock = ingredientBlock
    .replace(
      /\s+\b(?:more info|website|contact|tel|phone|info)\b\s*[:\-]?[\s\S]*$/i,
      "",
    )
    .trim();

  if (cleanedBlock.length < 10) {
    return null;
  }

  return cleanedBlock;
}

function extractIngredientTextWithoutHeading(
  rawText: string,
): string | null {
  if (rawText.length < 15) {
    return null;
  }

  const lines = rawText
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  let startIndex = -1;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const compact = normalize(line);

    const looksIngredientLike =
      countIngredientMarkers(compact) >= 1 ||
      /[,;]|\(|\)|%|\d\s*%|\b(?:water|\u03bd\u03b5\u03c1\u03cc|glycerin|\u03b6\u03ac\u03c7\u03b1\u03c1\u03b7|sugar|salt|\u03b1\u03bb\u03ac\u03c4\u03b9|oil|extract|acid|parfum|flavour|aroma|\u03b1\u03c1\u03c9\u03bc\u03b1|\u03b2\u03bf\u03cd\u03c4\u03c5\u03c1\u03bf|\u03b2\u03bf\u03c5\u03c4\u03c5\u03c1\u03bf)\b/i.test(
        line,
      );

    if (looksIngredientLike) {
      startIndex = index;
      break;
    }
  }

  if (startIndex < 0) {
    return null;
  }

  const tail = lines
    .slice(startIndex)
    .filter((line) => !isBoundaryLine(line));

  const candidate = stripNoiseSegments(tail.join("\n").trim());

  if (countNoiseMarkers(candidate) >= 2) {
    return null;
  }

  // Only reject when the block really behaves like a nutrition table.
  // Counting vocabulary alone rejected valid ingredient lists.
  if (looksLikeNutritionTable(candidate)) {
    return null;
  }

  if (isLikelyMarketingClaim(candidate)) {
    return null;
  }

  if (isLikelyStorageOrDirections(candidate)) {
    return null;
  }

  if (candidate.length < 12) {
    return null;
  }

  if (
    countIngredientMarkers(candidate) < 2 &&
    !/[,:;]|\(|\)|%/.test(candidate)
  ) {
    return null;
  }

  return candidate;
}

export function extractIngredientText(
  rawText: string,
  ocrConfidence: number,
): IngredientTextResult {
  if (!rawText || rawText.trim().length === 0) {
    return {
      rawText,
      ingredientText: null,
      labelType: "unknown",
      confidence: 0,
      isValid: false,
      reasons: ["\u039a\u03b5\u03bd\u03cc \u03ba\u03b5\u03af\u03bc\u03b5\u03bd\u03bf"],
    };
  }

  const trimmed = rawText.trim();
  const reasons: string[] = [];

  const hasNutritionContent = looksLikeNutritionTable(trimmed);

  const withHeading = extractIngredientTextWithHeading(trimmed);

  if (withHeading) {
    const labelType =
      hasNutritionContent && countIngredientMarkers(withHeading) >= 2
        ? "mixed"
        : "ingredients";

    return {
      rawText: trimmed,
      ingredientText: withHeading,
      labelType,
      confidence: Math.min(ocrConfidence * 0.98, 0.95),
      isValid: true,
      reasons: ["\u0395\u03bd\u03c4\u03bf\u03c0\u03af\u03c3\u03c4\u03b7\u03ba\u03b5 heading \u03c3\u03c5\u03c3\u03c4\u03b1\u03c4\u03b9\u03ba\u03ce\u03bd"],
    };
  }

  const withoutHeading = extractIngredientTextWithoutHeading(trimmed);

  if (withoutHeading) {
    return {
      rawText: trimmed,
      ingredientText: withoutHeading,
      labelType:
        hasNutritionContent && countIngredientMarkers(withoutHeading) >= 2
          ? "mixed"
          : "ingredients",
      confidence: Math.min(ocrConfidence * 0.8, 0.85),
      isValid: true,
      reasons: ["\u0394\u03b5\u03ba\u03c4\u03cc \u03c7\u03c9\u03c1\u03af\u03c2 heading (\u03b1\u03c1\u03ba\u03b5\u03c4\u03ac \u03c3\u03b7\u03bc\u03ac\u03b4\u03b9\u03b1)"],
    };
  }

  // Reaching here means no ingredient block could be isolated. Only now is
  // it safe to call the whole text a nutrition table.
  if (hasNutritionContent) {
    return {
      rawText: trimmed,
      ingredientText: null,
      labelType: "nutrition",
      confidence: ocrConfidence,
      isValid: false,
      reasons: ["\u0394\u03b9\u03b1\u03c4\u03c1\u03bf\u03c6\u03b9\u03ba\u03cc\u03c2 \u03c0\u03af\u03bd\u03b1\u03ba\u03b1\u03c2, \u03cc\u03c7\u03b9 \u03bb\u03af\u03c3\u03c4\u03b1 \u03c3\u03c5\u03c3\u03c4\u03b1\u03c4\u03b9\u03ba\u03ce\u03bd"],
    };
  }

  if (countNoiseMarkers(trimmed) >= 2) {
    reasons.push("\u03a0\u03bf\u03bb\u03cd \u03b8\u03cc\u03c1\u03c5\u03b2\u03bf\u03c2 (URLs, \u03b4\u03b9\u03b5\u03c5\u03b8\u03cd\u03bd\u03c3\u03b5\u03b9\u03c2, \u03c4\u03b7\u03bb\u03ad\u03c6\u03c9\u03bd\u03b1)");
  }

  if (countIngredientMarkers(trimmed) < 2) {
    reasons.push("\u0391\u03bd\u03b5\u03c0\u03b1\u03c1\u03ba\u03ae \u03c3\u03b7\u03bc\u03ac\u03b4\u03b9\u03b1 \u03c3\u03c5\u03c3\u03c4\u03b1\u03c4\u03b9\u03ba\u03ce\u03bd");
  }

  if (!hasStructuredFormat(trimmed)) {
    reasons.push("\u0394\u03b5\u03bd \u03ad\u03c7\u03b5\u03b9 \u03b4\u03bf\u03bc\u03ae \u03bb\u03af\u03c3\u03c4\u03b1\u03c2 (\u03ba\u03cc\u03bc\u03bc\u03b1\u03c4\u03b1, \u03b3\u03c1\u03b1\u03bc\u03bc\u03ad\u03c2, \u03ba\u03bb\u03c0)");
  }

  if (isLikelyMarketingClaim(trimmed)) {
    reasons.push("\u03a6\u03b1\u03af\u03bd\u03b5\u03c4\u03b1\u03b9 marketing claim");
  }

  if (isLikelyStorageOrDirections(trimmed)) {
    reasons.push("\u03a6\u03b1\u03af\u03bd\u03b5\u03c4\u03b1\u03b9 \u03bf\u03b4\u03b7\u03b3\u03af\u03b5\u03c2 \u03b1\u03c0\u03bf\u03b8\u03ae\u03ba\u03b5\u03c5\u03c3\u03b7\u03c2");
  }

  return {
    rawText: trimmed,
    ingredientText: null,
    labelType: "unknown",
    confidence: 0,
    isValid: false,
    reasons:
      reasons.length > 0
        ? reasons
        : ["\u0394\u03b5\u03bd \u03b5\u03bd\u03c4\u03bf\u03c0\u03af\u03c3\u03c4\u03b7\u03ba\u03b5 \u03b5\u03c0\u03b1\u03c1\u03ba\u03ae\u03c2 \u03bb\u03af\u03c3\u03c4\u03b1 \u03c3\u03c5\u03c3\u03c4\u03b1\u03c4\u03b9\u03ba\u03ce\u03bd"],
  };
}
