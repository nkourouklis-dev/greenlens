import type { NormalizedIngredient } from "../types";

const aliasGroups: Record<string, string[]> = {
  aqua: [
    "aqua",
    "water",
    "eau",
    "νερό",
    "νερο",
  ],
  parfum: [
    "parfum",
    "fragrance",
    "aroma",
    "άρωμα",
    "αρωμα",
  ],
  "cetearyl alcohol": [
    "cetearyl alcohol",
    "cetostearyl alcohol",
  ],
  "sodium hydroxide": [
    "sodium hydroxide",
    "caustic soda",
  ],
  "tocopheryl acetate": [
    "tocopheryl acetate",
    "vitamin e acetate",
    "tocopherol acetate",
  ],
  glycerin: [
    "glycerin",
    "glycerine",
    "glycerol",
    "γλυκερίνη",
    "γλυκερινη",
  ],
  "citric acid": [
    "citric acid",
    "κιτρικό οξύ",
    "κιτρικο οξυ",
  ],
  panthenol: [
    "panthenol",
    "d-panthenol",
    "provitamin b5",
    "πανθενόλη",
    "πανθενολη",
  ],
};

const aliasLookup = buildAliasLookup();

export function normalizeIngredients(
  text: string,
  confidence: number,
): NormalizedIngredient[] {
  const seen = new Set<string>();

  const result: NormalizedIngredient[] = [];

  for (const rawValue of splitIngredients(
    text,
  )) {
    const originalName = rawValue.trim();

    if (!originalName) {
      continue;
    }

    if (!isPlausibleIngredient(originalName)) {
      continue;
    }

    const percentage =
      readPercentage(originalName);

    const normalizedName = canonicalName(
      originalName,
    );

    if (!normalizedName) {
      continue;
    }

    if (seen.has(normalizedName)) {
      continue;
    }

    seen.add(normalizedName);

    result.push({
      id: crypto.randomUUID(),
      originalName,
      normalizedName,
      displayName: formatDisplayName(
        originalName,
      ),
      percentage,
      category: categoryFor(normalizedName),
      aliases:
        aliasGroups[normalizedName] ?? [],
      confidence,
    });
  }

  return result;
}

function splitIngredients(
  text: string,
): string[] {
  return text
    .replace(/\r/g, "")
    .replace(/[;\n]/g, ",")
    .split(",");
}

function isPlausibleIngredient(
  value: string,
): boolean {
  const trimmed = value.trim();

  if (trimmed.length < 2) {
    return false;
  }

  if (trimmed.length > 80) {
    return false;
  }

  const letters = trimmed.match(/[\p{L}]/gu);

  if ((letters?.length ?? 0) < 2) {
    return false;
  }

  const lowered = trimmed.toLowerCase();

  const noiseTerms = [
    "ingredients",
    "συστατικά",
    "συστατικα",
    "inci",
    "unreadable",
    "made in",
    "www.",
    "http",
  ];

  return !noiseTerms.some((term) =>
    lowered.startsWith(term),
  );
}

function readPercentage(
  value: string,
): number | null {
  const match = value.match(
    /(\d+(?:[.,]\d+)?)\s*%/,
  );

  if (!match) {
    return null;
  }

  const parsed = Number(
    match[1].replace(",", "."),
  );

  return Number.isFinite(parsed)
    ? parsed
    : null;
}

function canonicalName(
  value: string,
): string {
  const cleaned = value
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\d+(?:[.,]\d+)?\s*%/g, " ")
    .replace(/[*†‡•]/g, " ")
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) {
    return "";
  }

  return aliasLookup.get(cleaned) ?? cleaned;
}

function formatDisplayName(
  value: string,
): string {
  return value
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
}

function buildAliasLookup(): Map<
  string,
  string
> {
  const lookup = new Map<string, string>();

  for (const [canonical, aliases] of Object.entries(
    aliasGroups,
  )) {
    lookup.set(canonical, canonical);

    for (const alias of aliases) {
      lookup.set(alias, canonical);
    }
  }

  return lookup;
}

function categoryFor(
  name: string,
): NormalizedIngredient["category"] {
  if (/\be\d{3,4}\b/.test(name)) {
    return "additive";
  }

  if (
    /(paraben|phenoxyethanol|benzoate|sorbate|sodium benzoate|συντηρητικ)/.test(
      name,
    )
  ) {
    return "preservative";
  }

  if (
    /(parfum|fragrance|linalool|limonene|citronellol|geraniol|coumarin|cinnamal|ionone|άρωμα|αρωμα)/.test(
      name,
    )
  ) {
    return "fragrance";
  }

  if (
    /(sugar|syrup|sucralose|aspartame|stevia|γλυκαντικ|ζάχαρη|ζαχαρη)/.test(
      name,
    )
  ) {
    return "sweetener";
  }

  if (
    /(ci \d{5}|colou?r|colorant|χρωστικ)/.test(
      name,
    )
  ) {
    return "colorant";
  }

  if (
    /(peanut|nut|milk|lactose|gluten|wheat|soy|egg|fish|sesame|γάλα|γαλα|γλουτέν|γλουτεν|ξηροί καρποί)/.test(
      name,
    )
  ) {
    return "allergen";
  }

  if (
    /(aqua|water|alcohol|glycerin|oil|butter|έλαιο|ελαιο|νερό|νερο)/.test(
      name,
    )
  ) {
    return "base";
  }

  return "unknown";
}