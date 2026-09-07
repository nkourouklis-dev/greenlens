import { isRecord, parseJson } from "./analysis";

export type ContentCategory =
  | "ingredients"
  | "nutrition"
  | "chemical_composition"
  | "unknown";

export interface ContentCategoryResult {
  category: ContentCategory;
  confidence: number;
  source: "heuristic" | "ai" | "override";
}

const CHEMICAL_PHRASE_MARKERS = [
  "ανάλυση νερού",
  "αναλυση νερου",
  "χημική ανάλυση",
  "χημικη αναλυση",
  "σκληρότητα",
  "σκληροτητα",
  "ολική σκληρότητα",
  "ολικη σκληροτητα",
  "αγωγιμότητα",
  "αγωγιμοτητα",
  "conductivity",
  "hardness",
  "water analysis",
  "chemical analysis",
  "νιτρικά",
  "νιτρικα",
  "νιτρώδη",
  "νιτρωδη",
  "θειικά",
  "θειικα",
  "χλωριούχα",
  "χλωριουχα",
  "ασβέστιο",
  "ασβεστιο",
  "μαγνήσιο",
  "μαγνησιο",
  "νάτριο",
  "νατριο",
  "κάλιο",
  "καλιο",
  "βαρέα μέταλλα",
  "βαρεα μεταλλα",
  "heavy metals",
  "διαλυμένα στερεά",
  "διαλυμενα στερεα",
  "mg/l",
  "μg/l",
  "tds",
  "typical analysis",
  "mineral analysis",
  "calcium",
  "magnesium",
  "potassium",
  "sulphate",
  "sulfate",
  "nitrate",
  "nitrite",
  "chloride",
  "bicarbonate",
];

// Element/ion symbol followed by a measured value — much more specific than
// the bare letters alone (which would false-positive on ordinary words).
const CHEMICAL_TOKEN_PATTERN =
  /\b(ca|mg|na|k|so4|no3|no2|cl|hco3|pb|cd|as|hg|cu|fe|mn|zn|f)\s*[:=]?\s*\d/gi;

const NUTRITION_PHRASE_MARKERS = [
  "θερμίδες",
  "θερμιδες",
  "ενέργεια",
  "ενεργεια",
  "πρωτεΐνες",
  "πρωτεϊνες",
  "πρωτεινες",
  "πρωτεΐνη",
  "πρωτεινη",
  "λιπαρά",
  "λιπαρα",
  "λίπος",
  "λιπος",
  "ίνες",
  "ινες",
  "τέφρα",
  "τεφρα",
  "υγρασία",
  "υγρασια",
  "υδατάνθρακες",
  "υδατανθρακες",
  "σάκχαρα",
  "σακχαρα",
  "διαιτητικές ίνες",
  "διαιτητικες ινες",
  "φυτικές ίνες",
  "φυτικες ινες",
  "κορεσμένα",
  "κορεσμενα",
  "διατροφική επισήμανση",
  "διατροφικη επισημανση",
  "διατροφικές πληροφορίες",
  "διατροφικες πληροφοριες",
  "ανά 100g",
  "ανα 100g",
  "ανά 100 g",
  "ανα 100 g",
  "ανά 100ml",
  "ανα 100ml",
  "per 100g",
  "per 100ml",
  "nutrition facts",
  "nutritional information",
  "nutrition declaration",
  "energy",
  "protein",
  "carbohydrate",
  "fibre",
  "fiber",
  "saturates",
];

const E_NUMBER_PATTERN = /\bE[\s-]?[1-9]\d{2,3}\b/g;

const INGREDIENT_PHRASE_MARKERS = [
  "συστατικά",
  "συστατικα",
  "ingredients",
  "ingredient list",
  "inci",
  "composition",
  "σύνθεση",
  "συνθεση",
  "περιέχει",
  "περιεχει",
  "contains",
  "ingrédients",
  "zutaten",
  "ingredienti",
];

function countMarkers(normalizedText: string, markers: string[]): number {
  return markers.filter((marker) => normalizedText.includes(marker)).length;
}

function countPattern(text: string, pattern: RegExp): number {
  return (text.match(pattern) ?? []).length;
}

function commaDensityBonus(text: string): number {
  const commaCount = (text.match(/,/g) ?? []).length;
  return commaCount >= 5 ? 1 : 0;
}

interface CategoryScores {
  ingredients: number;
  nutrition: number;
  chemical_composition: number;
}

function scoreCategories(text: string): CategoryScores {
  const normalized = text.toLowerCase();

  return {
    ingredients:
      // A heading like "Ingredients:"/"Συστατικά:"/"INCI:" is a much
      // stronger, more structural signal than a single vocabulary word
      // (e.g. "sulfate" also appears in chemical-analysis substance names),
      // so it is weighted the same as an element-with-value token below.
      countMarkers(normalized, INGREDIENT_PHRASE_MARKERS) * 2 +
      commaDensityBonus(text),
    nutrition:
      countMarkers(normalized, NUTRITION_PHRASE_MARKERS) +
      countPattern(text, E_NUMBER_PATTERN),
    chemical_composition:
      countMarkers(normalized, CHEMICAL_PHRASE_MARKERS) +
      countPattern(text, CHEMICAL_TOKEN_PATTERN) * 2,
  };
}

const ABSOLUTE_FLOOR = 1;
const MARGIN = 1;

/**
 * Deterministic, keyword-based classifier. Only commits to a category when
 * its score clears an absolute floor and is clearly ahead of the runner-up
 * — otherwise returns "unknown" so the caller can fall back to an AI
 * classification call instead of guessing.
 */
export function detectContentCategoryHeuristic(
  text: string,
): ContentCategoryResult {
  const trimmed = text.trim();

  if (trimmed.length < 8) {
    return { category: "unknown", confidence: 0, source: "heuristic" };
  }

  const scores = scoreCategories(trimmed);

  const entries = (
    Object.entries(scores) as Array<
      [keyof CategoryScores, number]
    >
  ).sort((a, b) => b[1] - a[1]);

  const [topCategory, topScore] = entries[0];
  const [, secondScore] = entries[1];

  if (topScore < ABSOLUTE_FLOOR || topScore - secondScore < MARGIN) {
    return { category: "unknown", confidence: 0.3, source: "heuristic" };
  }

  const confidence = Math.min(
    0.95,
    0.5 + (topScore - secondScore) * 0.1,
  );

  return { category: topCategory, confidence, source: "heuristic" };
}

export function buildCategoryClassificationPrompt(text: string): string {
  return [
    "Classify the label text below into exactly one category.",
    "",
    "Return ONLY this exact JSON structure:",
    '{ "category": "ingredients" }',
    "",
    "category must be exactly one of: ingredients, nutrition, chemical_composition, unknown.",
    '- "ingredients": a cosmetic/cleaning-product/food ingredient list (INCI-style comma-separated substance names, often under a heading like "Συστατικά"/"Ingredients"/"INCI").',
    '- "nutrition": a nutrition facts table with amounts per serving (energy, protein, fat, carbohydrates, sugars) for food, pet food or supplements.',
    '- "chemical_composition": a lab/water/mineral chemical analysis listing elements or compounds with concentrations (e.g. Ca, Mg, Na, NO3, pH, hardness, mg/L values), typically bottled water or a raw-material analysis.',
    '- "unknown": none of the above, or genuinely unclear.',
    "Return ONLY the JSON object. No commentary. No Markdown. No code fences.",
    "",
    "Label text:",
    text,
  ].join("\n");
}

/**
 * Accepts either a raw JSON string, an already-parsed object, or the
 * Workers AI SDK's `{ response: "..." }` wrapper — same shapes handled by
 * parseAnalysis for the ingredients prompt.
 */
export function parseCategoryClassification(
  value: unknown,
): ContentCategory | null {
  const candidate =
    typeof value === "string"
      ? parseJson(value)
      : isRecord(value) && typeof value.response === "string"
        ? parseJson(value.response)
        : value;

  if (!isRecord(candidate)) {
    return null;
  }

  const category = candidate.category;

  if (
    category === "ingredients" ||
    category === "nutrition" ||
    category === "chemical_composition" ||
    category === "unknown"
  ) {
    return category;
  }

  return null;
}
