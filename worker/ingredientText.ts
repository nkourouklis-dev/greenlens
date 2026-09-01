export interface IngredientTextResult {
  rawText: string;
  ingredientText: string | null;
  labelType: "ingredients" | "nutrition" | "mixed" | "unknown";
  confidence: number;
  isValid: boolean;
  reasons: string[];
}

const INGREDIENT_HEADINGS = [
  "συστατικα",
  "συστατικά",
  "ingredients",
  "ingredient list",
  "ingredienti",
  "ingredients list",
  "ingrédients",
  "ingredientes",
  "ingrediënten",
  "zutaten",
  "zutatenliste",
  "inci",
  "composition",
  "σύνθεση",
  "συνθεση",
  "περιέχει",
  "περιεχει",
  "contains",
];

const SECTION_BOUNDARIES = [
  "nutrition",
  "nutrition facts",
  "nutrition declaration",
  "nutritional information",
  "διατροφική δήλωση",
  "διατροφικη δηλωση",
  "διατροφικά στοιχεία",
  "διατροφικα στοιχεια",
  "οδηγίες χρήσης",
  "οδηγιες χρησης",
  "directions",
  "preparation",
  "warnings",
  "προειδοποίηση",
  "προειδοποιηση",
  "προειδοποιήσεις",
  "προειδοποιησεις",
  "storage",
  "αποθήκευση",
  "αποθηκευση",
  "keep in",
  "best before",
  "ανάλωση κατά προτίμηση",
  "αναλωση κατα προτιμηση",
  "manufacturer",
  "distributor",
  "distributed by",
  "παρασκευάζεται",
  "παρασκευαζεται",
  "διανέμεται",
  "διανεμεται",
  "contact",
  "website",
  "email",
  "barcode",
  "recycling",
  "recycling information",
  "imported by",
  "εισάγεται",
  "εισαγεται",
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
  "παρασκευάζεται",
  "παρασκευαζεται",
  "distributed by",
  "διανέμεται",
  "διανεμεται",
  "imported by",
  "εισάγεται",
  "εισαγεται",
  "δροσερό",
  "δροσερο",
  "cool place",
  "keep in",
  "store in",
  "αποθηκεύστε",
  "αποθηκευστε",
  "suitable for",
  "low sodium",
  "low content",
  "minerals",
  "diet",
  "lot:",
  "batch",
  "best before",
  "ανάλωση κατά προτίμηση",
  "αναλωση κατα προτιμηση",
  "neck of bottle",
  "s.a.",
  "a.b.e.e",
  "ltd",
  "gmbh",
  "s.p.a.",
];

const NUTRITION_MARKERS = [
  "energy",
  "ενέργεια",
  "ενεργεια",
  "kcal",
  "kj",
  "fat",
  "λιπαρά",
  "λιπαρα",
  "saturates",
  "carbohydrate",
  "υδατάνθρακες",
  "υδατανθρακες",
  "sugars",
  "σάκχαρα",
  "σακχαρα",
  "protein",
  "πρωτεΐνες",
  "πρωτεινες",
  "salt",
  "αλάτι",
  "αλατι",
  "fibre",
  "ίνες",
  "ινες",
  "per 100",
  "ανά 100",
  "vitamin",
  "βιταμίνη",
  "βιταμινη",
  "%rda",
];

const INGREDIENT_MARKERS = [
  "water",
  "aqua",
  "νερό",
  "νερο",
  "glycerin",
  "γλυκερίνη",
  "γλυκερινη",
  "alcohol",
  "οινο",
  "οίνο",
  "αλκοόλ",
  "αλκοολ",
  "acid",
  "οξύ",
  "οξυ",
  "oil",
  "έλαιο",
  "ελαιο",
  "extract",
  "έκχύλισμα",
  "εκχυλισμα",
  "parfum",
  "άρωμα",
  "αρωμα",
  "fragrance",
  "sodium",
  "νάτριο",
  "νατριο",
  "potassium",
  "calcium",
  "sulphate",
  "sulfate",
  "citrate",
  "chloride",
  "starch",
  "άμυλο",
  "αμυλο",
  "flour",
  "αλεύρι",
  "αλευρι",
  "sugar",
  "ζάχαρη",
  "ζαχαρη",
  "salt",
  "αλάτι",
  "αλατι",
  "milk",
  "γάλα",
  "γαλα",
  "wheat",
  "σίτος",
  "σιτος",
  "vinegar",
  "ξύδι",
  "ξυδι",
  "preservative",
  "συντηρητικό",
  "συντηρητικο",
  "color",
  "colour",
  "χρώμα",
  "χρωμα",
  "emulsifier",
  "γαλακτωματικό",
  "γαλακτωματικο",
];

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[́ΐΰ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
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
    .replace(/\b(?:website|manufacturer|distributor|imported by|distributed by|storage|directions|preparation|nutrition facts|recycling information)\b[^\n]*[:\-]?[^\n]*/gi, " ")
    .replace(/\b(?:keep in|store in|best before|avoid|recycle)\b[^\n]*/gi, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function countNoiseMarkers(text: string): number {
  const normalized = normalize(text);
  let count = 0;
  for (const marker of NOISE_MARKERS) {
    if (normalized.includes(marker)) {
      count++;
    }
  }
  return count;
}

function countNutritionMarkers(text: string): number {
  const normalized = normalize(text);
  let count = 0;
  for (const marker of NUTRITION_MARKERS) {
    if (normalized.includes(marker)) {
      count++;
    }
  }
  return count;
}

function countIngredientMarkers(text: string): number {
  const normalized = normalize(text);
  let count = 0;
  for (const marker of INGREDIENT_MARKERS) {
    if (normalized.includes(marker)) {
      count++;
    }
  }
  return count;
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
    normalized.includes(p),
  ).length;

  return matchingPatterns >= 2;
}

function isLikelyStorageOrDirections(
  text: string,
): boolean {
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
    "αποθήκευση",
    "αποθηκευση",
    "δροσερό",
    "δροσερο",
  ];

  const matchingPatterns = storagePatterns.filter((p) =>
    normalized.includes(p),
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
  const newlineAfterHeading = afterHeading.indexOf(
    "\n",
  );

  let contentStart = 0;

  if (
    colonIdx >= 0 &&
    (newlineAfterHeading < 0 ||
      colonIdx < newlineAfterHeading)
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

  const contentAfterStart = afterHeading.substring(
    contentStart,
  );

  const doubleNewlineIdx = contentAfterStart.indexOf(
    "\n\n",
  );
  let endIdx = contentAfterStart.length;

  if (doubleNewlineIdx >= 0) {
    endIdx = doubleNewlineIdx;
  } else {
    const normalized = normalize(contentAfterStart);
    const boundaries = SECTION_BOUNDARIES.map((b) => ({
      boundary: b,
      idx: normalized.indexOf(b),
    }))
      .filter((b) => b.idx >= 0)
      .sort((a, b) => a.idx - b.idx);

    if (boundaries.length > 0) {
      endIdx = boundaries[0].idx;
    }
  }

  const ingredientBlock = contentAfterStart
    .substring(0, endIdx)
    .trim();

  const cleanedBlock = ingredientBlock
    .replace(
      /\s+(?:more info|website|contact|tel|phone|info)\s*[:\-]?[\s\S]*$/i,
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

  const candidateLines: string[] = [];
  let startIndex = -1;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const compact = normalize(line);
    if (startIndex < 0) {
      const looksIngredientLike =
        countIngredientMarkers(compact) >= 1 ||
        /[,;]|\(|\)|%|\d\s*%|\b(?:water|νερό|glycerin|ζάχαρη|sugar|salt|αλάτι|oil|extract|acid|parfum|flavour|aroma|αρωμα|βούτυρο|βουτυρο)\b/i.test(
          line,
        );
      if (looksIngredientLike) {
        startIndex = index;
      }
      continue;
    }

    if (isBoundaryLine(line)) {
      break;
    }

    candidateLines.push(line);
  }

  if (startIndex < 0) {
    return null;
  }

  const tail = lines.slice(startIndex).filter((line) => !isBoundaryLine(line));
  const candidate = stripNoiseSegments(tail.join("\n").trim());

  const noiseCount = countNoiseMarkers(candidate);
  if (noiseCount >= 2) {
    return null;
  }

  const nutritionCount = countNutritionMarkers(candidate);
  if (nutritionCount >= 2) {
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

  if (countIngredientMarkers(candidate) < 2 && !/[,:;]|\(|\)|%/.test(candidate)) {
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
      reasons: ["Κενό κείμενο"],
    };
  }

  const trimmed = rawText.trim();
  const reasons: string[] = [];

  const fullTextNutritionCount =
    countNutritionMarkers(trimmed);
  const hasNutritionContent =
    fullTextNutritionCount >= 2 ||
    /(?:nutrition|energy|kcal|protein|fat|carbohydrate|per 100|ανά 100|διατροφ)/i.test(
      trimmed,
    );

  const withHeading = extractIngredientTextWithHeading(
    trimmed,
  );

  if (withHeading) {
    const labelType =
      hasNutritionContent &&
      countIngredientMarkers(withHeading) >= 2
        ? "mixed"
        : "ingredients";

    return {
      rawText: trimmed,
      ingredientText: withHeading,
      labelType,
      confidence: Math.min(
        ocrConfidence * 0.98,
        0.95,
      ),
      isValid: true,
      reasons: [
        "Εντοπίστηκε heading συστατικών",
      ],
    };
  }

  const withoutHeading =
    extractIngredientTextWithoutHeading(trimmed);

  if (withoutHeading) {
    return {
      rawText: trimmed,
      ingredientText: withoutHeading,
      labelType:
        hasNutritionContent &&
        countIngredientMarkers(withoutHeading) >= 2
          ? "mixed"
          : "ingredients",
      confidence: Math.min(
        ocrConfidence * 0.80,
        0.85,
      ),
      isValid: true,
      reasons: [
        "Δεκτό χωρίς heading (αρκετά σημάδια)",
      ],
    };
  }

  if (hasNutritionContent) {
    return {
      rawText: trimmed,
      ingredientText: null,
      labelType: "nutrition",
      confidence: ocrConfidence,
      isValid: false,
      reasons: [
        "Διατροφικός πίνακας, όχι λίστα συστατικών",
      ],
    };
  }

  const noiseCount = countNoiseMarkers(trimmed);
  if (noiseCount >= 2) {
    reasons.push(
      "Πολύ θόρυβος (URLs, διευθύνσεις, τηλέφωνα)",
    );
  }

  const ingredientCount =
    countIngredientMarkers(trimmed);
  if (ingredientCount < 2) {
    reasons.push(
      "Ανεπαρκή σημάδια συστατικών",
    );
  }

  if (!hasStructuredFormat(trimmed)) {
    reasons.push(
      "Δεν έχει δομή λίστας (κόμματα, γραμμές, κλπ)",
    );
  }

  if (isLikelyMarketingClaim(trimmed)) {
    reasons.push("Φαίνεται marketing claim");
  }

  if (isLikelyStorageOrDirections(trimmed)) {
    reasons.push(
      "Φαίνεται οδηγίες αποθήκευσης",
    );
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
        : [
            "Δεν εντοπίστηκε επαρκής λίστα συστατικών",
          ],
  };
}
