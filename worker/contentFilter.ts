/**
 * Shared irrelevant-token filter for the ingredients/nutrition/
 * chemical_composition extraction paths. Applied to the already-isolated
 * text block right before it is sent to the model, so noise the
 * deterministic extractors let through (they isolate a *section* of the
 * label, not individual tokens) never becomes a fake "ingredient".
 *
 * Three kinds of noise, all observed in real OCR output:
 *  - the product's own brand/title, when OCR captures it inside the
 *    ingredients/nutrition/chemical block instead of just the ingredients
 *  - country-of-origin / legal-manufacturer boilerplate, in whichever of
 *    several languages the label happens to be printed in
 *  - bare 2-3 character packaging/recycling codes with no ingredient
 *    semantics (not applied to chemical_composition, where a 2-3 letter
 *    token — Pb, Ca, Fe — is often the actual content)
 */

export type ContentFilterCategory =
  | "ingredients"
  | "nutrition"
  | "chemical_composition";

export interface ContentFilterContext {
  productTitle?: string | null;
  brand?: string | null;
}

export interface ContentFilterResult {
  text: string;
  removedSegments: string[];
}

const COMBINING_DIACRITICS_PATTERN = new RegExp(
  "[̀-ͯ]",
  "g",
);

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(COMBINING_DIACRITICS_PATTERN, "")
    .replace(/['’]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function hasLetters(text: string): boolean {
  return /\p{L}/u.test(text);
}

// Country-of-origin / legal-manufacturer boilerplate, normalized (lowercase,
// diacritics stripped) so e.g. "Fabriqué" and "fabrique" both match, and
// "País" and "pais" both match.
const BOILERPLATE_PHRASES = [
  // English
  "made in",
  "product of",
  "country of origin",
  "produced in",
  "manufactured in",
  "manufactured by",
  "manufactured for",
  "distributed by",
  "imported by",
  "packed in",
  "packed by",
  "packed for",
  "net weight",
  // French
  "fabrique en",
  "fabrique dans",
  "fabrique pour",
  "produit en",
  "produit de",
  "fait en",
  "responsable legal",
  "pays d origine",
  "distribue par",
  "importe par",
  // German
  "hergestellt in",
  "hergestellt fur",
  "hergestellt von",
  "verantwortlich",
  "vertrieb durch",
  "ursprungsland",
  // Spanish
  "producido en",
  "hecho en",
  "pais de origen",
  "distribuido por",
  "importado por",
  // Italian
  "prodotto in",
  "responsabile legale",
  "distribuito da",
  "importato da",
  // Greek
  "παρασκευαζεται",
  "διανεμεται",
  "εισαγεται",
  "χωρα καταγωγης",
  "κατασκευαζεται",
  "διανομεας",
  "υπευθυνος διανομης",
];

// Common packaging/recycling codes short enough (<=3 characters) to be
// indistinguishable from a meaningless fragment on their own. Deliberately
// a fixed list rather than a length-only rule — plenty of real ingredient
// words (oil, wax, gum, tea...) are themselves 3 characters long.
const SHORT_PACKAGING_CODES = new Set([
  "eu",
  "ue",
  "ce",
  "pet",
  "pe",
  "pp",
  "ps",
  "pvc",
  "pap",
  "alu",
  "fe",
  "gl",
  "fsc",
  "tuv",
  "ean",
  "upc",
  "na",
]);

function isBoilerplateSegment(normalizedSegment: string): boolean {
  return BOILERPLATE_PHRASES.some((phrase) =>
    normalizedSegment.includes(phrase),
  );
}

function isMeaninglessShortCode(
  segment: string,
  normalizedSegment: string,
  category: ContentFilterCategory,
): boolean {
  // Chemical composition legitimately contains bare 1-3 character tokens
  // (element symbols: Pb, Ca, Fe...) — never filter short tokens there.
  if (category === "chemical_composition") {
    return false;
  }

  const trimmed = segment.trim();

  // A short, letter-less fragment (a lone digit, a recycling glyph) is
  // never an ingredient/nutrient regardless of what it says.
  if (trimmed.length > 0 && trimmed.length <= 4 && !hasLetters(trimmed)) {
    return true;
  }

  if (trimmed.length <= 3 && SHORT_PACKAGING_CODES.has(normalizedSegment)) {
    return true;
  }

  return false;
}

function matchesProductIdentity(
  normalizedSegment: string,
  context?: ContentFilterContext,
): boolean {
  if (!normalizedSegment) {
    return false;
  }

  const candidates = [context?.productTitle, context?.brand]
    .filter((value): value is string => Boolean(value && value.trim()))
    .map(normalize);

  // Exact match only — a real ingredient that merely shares a word with the
  // product title (e.g. title "Extra Virgin Olive Oil", ingredient "Olive
  // Oil" as one entry among several) must never be dropped on that basis
  // alone. Only a token that IS the title/brand, verbatim, is filtered —
  // that shape is what OCR produces when it captures the product's own
  // name/brand line as if it were part of the ingredient block.
  return candidates.includes(normalizedSegment);
}

/**
 * Splits `text` into comma/semicolon/newline-separated segments and drops
 * any that are brand/title noise, legal/origin boilerplate, or (outside
 * chemical_composition) a meaningless short code. Segments that survive are
 * rejoined with ", ".
 */
export function filterIrrelevantSegments(
  text: string,
  category: ContentFilterCategory,
  context?: ContentFilterContext,
): ContentFilterResult {
  if (!text || !text.trim()) {
    return { text, removedSegments: [] };
  }

  const segments = text
    .split(/[,;\n]+/)
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);

  // Nothing to split on: filtering a single free-form block on the same
  // rules as a token risks destroying real content (e.g. a nutrition
  // sentence with no delimiters), so only the boilerplate-phrase and
  // exact-identity checks run, against the whole text.
  if (segments.length <= 1) {
    const normalizedWhole = normalize(text);

    if (
      isBoilerplateSegment(normalizedWhole) ||
      matchesProductIdentity(normalizedWhole, context)
    ) {
      return { text: "", removedSegments: [text.trim()] };
    }

    return { text, removedSegments: [] };
  }

  const kept: string[] = [];
  const removed: string[] = [];

  for (const segment of segments) {
    const normalizedSegment = normalize(segment);

    const reject =
      isBoilerplateSegment(normalizedSegment) ||
      isMeaninglessShortCode(segment, normalizedSegment, category) ||
      matchesProductIdentity(normalizedSegment, context);

    if (reject) {
      removed.push(segment);
    } else {
      kept.push(segment);
    }
  }

  return {
    text: kept.join(", "),
    removedSegments: removed,
  };
}
