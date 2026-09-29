/**
 * "Free from" claims printed on the pack — "χωρίς προσθήκη ζάχαρης", "χωρίς
 * συντηρητικά, χρωστικές και πρόσθετα" — read from the OCR text of every
 * photo.
 *
 * The model used to see that sentence at the end of the ingredient block and
 * flag "Χρωστικές και πρόσθετα" as something to watch out for: the words of
 * a claim, scored as if they were the thing claimed absent (the same mistake
 * ingredientRules.ts guards against for sugar). They belong on the other
 * side of the summary. Deterministic, so a scan and a re-analysis agree.
 *
 * Text is compared lowercased with accents stripped, and the leading "χ" of
 * "χωρίς" is optional — Azure regularly clips it on curved packaging.
 */

import type { ExecutiveSummary } from "./ingredientInsights";

function fold(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/ς/g, "σ");
}

const NO_ADDED_SUGAR =
  /(?:χωρισ|ωρισ)\s+ζαχαρ|(?:χωρισ|ωρισ)[^.,]{0,30}?προσθηκη\s+ζαχαρ|no added sugars?|without added sugars?|unsweetened/u;

const NO_PRESERVATIVES =
  /(?:χωρισ|ωρισ|ορισ)\s*συντηρ|no preservatives?|without preservatives?|preservative[- ]free/u;

/** How far a colorants/additives word may sit from the preservatives claim. */
const CLAIM_WINDOW = 70;

const GLUTEN_FREE =
  /(?:χωρισ|ωρισ)\s+γλουτεν|gluten[- ]?free|without gluten|free from gluten|free of gluten|αδεν γλουτεν/u;

const LACTOSE_FREE =
  /(?:χωρισ|ωρισ)\s+λακτοζ|lactose[- ]?free|without lactose|free from lactose|χωρισ λακτοζη/u;

export interface LabelClaims {
  vegan: boolean;
  noLactose: boolean;
  noGluten: boolean;
  noAddedSugar: boolean;
  noPreservatives: boolean;
  noColourants: boolean;
  noAdditives: boolean;
}

export function detectLabelClaims(texts: string[]): LabelClaims {
  const claims: LabelClaims = {
    vegan: false,
    noLactose: false,
    noGluten: false,
    noAddedSugar: false,
    noPreservatives: false,
    noColourants: false,
    noAdditives: false,
  };

  for (const raw of texts) {
    const text = fold(raw);

    if (GLUTEN_FREE.test(text)) {
      claims.noGluten = true;
    }

    // "Vegetarian" is not "vegan": only the word itself counts.
    if (/(?<![a-z])vegan(?![a-z])|βιγκαν/u.test(text)) {
      claims.vegan = true;
    }

    if (LACTOSE_FREE.test(text)) {
      claims.noLactose = true;
    }

    if (NO_ADDED_SUGAR.test(text)) {
      claims.noAddedSugar = true;
    }

    const match = NO_PRESERVATIVES.exec(text);

    if (match) {
      claims.noPreservatives = true;

      // The list of things the pack does without runs on from the
      // preservatives: "χωρίς συντηρητικά, χρωστικές και πρόσθετα".
      const near = text.slice(
        Math.max(0, match.index - CLAIM_WINDOW),
        match.index + match[0].length + CLAIM_WINDOW,
      );

      if (/χρωστικ|colou?rs?\b|colou?rings?|dyes?/u.test(near)) {
        claims.noColourants = true;
      }

      if (/προσθετ|additives?/u.test(near)) {
        claims.noAdditives = true;
      }
    }
  }

  return claims;
}

/** The positives the claims earn, in the order a shopper cares about them. */
export function claimHighlights(claims: LabelClaims): string[] {
  const highlights: string[] = [];

  if (claims.noGluten) {
    highlights.push("Χωρίς γλουτένη");
  }

  if (claims.noLactose) {
    highlights.push("Χωρίς λακτόζη");
  }

  if (claims.noAddedSugar) {
    highlights.push("Χωρίς προστιθέμενη ζάχαρη");
  }

  const free = [
    claims.noPreservatives ? "συντηρητικά" : null,
    claims.noColourants ? "χρωστικές" : null,
    claims.noAdditives ? "πρόσθετα" : null,
  ].filter((item): item is string => item !== null);

  if (free.length === 1) {
    highlights.push(`Χωρίς ${free[0]}`);
  } else if (free.length > 1) {
    highlights.push(
      `Χωρίς ${free.slice(0, -1).join(", ")} και ${free[free.length - 1]}`,
    );
  }

  if (claims.vegan) {
    highlights.push("Vegan (δήλωση συσκευασίας)");
  }

  return highlights;
}

/** A caution that merely repeats a claim of absence. */
function contradictsClaims(item: string, claims: LabelClaims): boolean {
  const text = fold(item);

  // A specific E-number is a finding, not a paraphrase of the claim.
  if (/\be\s?\d{3}/u.test(text)) {
    return false;
  }

  return (
    (claims.noPreservatives && /συντηρητικ|preservativ/u.test(text)) ||
    (claims.noColourants && /χρωστικ|colou?r|dye/u.test(text)) ||
    (claims.noAdditives && /προσθετ|additive/u.test(text))
  );
}

/** Reads claims back from what a scan stored; empty when there were none. */
export function claimsFromStored(value: unknown): LabelClaims {
  const record =
    typeof value === "object" && value !== null
      ? (value as Record<string, unknown>)
      : {};

  return {
    vegan: record.vegan === true,
    noLactose: record.noLactose === true,
    noGluten: record.noGluten === true,
    noAddedSugar: record.noAddedSugar === true,
    noPreservatives: record.noPreservatives === true,
    noColourants: record.noColourants === true,
    noAdditives: record.noAdditives === true,
  };
}

/**
 * Puts the claims' positives first and removes cautions that only repeat
 * them. Used on the scan's summary and on the assistant's draft alike.
 */
export function applyClaims<
  T extends { highlights: string[]; watchOutFor: string[] },
>(summary: T, claims: LabelClaims): T {
  const added = claimHighlights(claims);

  if (added.length === 0) {
    return summary;
  }

  return {
    ...summary,
    highlights: Array.from(new Set([...added, ...summary.highlights])).slice(
      0,
      5,
    ),
    watchOutFor: summary.watchOutFor.filter(
      (item) => !contradictsClaims(item, claims),
    ),
  };
}

export function withLabelClaims(
  summary: ExecutiveSummary,
  texts: string[],
): ExecutiveSummary {
  return applyClaims(summary, detectLabelClaims(texts));
}
