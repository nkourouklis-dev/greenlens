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

export interface LabelClaims {
  noAddedSugar: boolean;
  noPreservatives: boolean;
  noColourants: boolean;
  noAdditives: boolean;
}

export function detectLabelClaims(texts: string[]): LabelClaims {
  const claims: LabelClaims = {
    noAddedSugar: false,
    noPreservatives: false,
    noColourants: false,
    noAdditives: false,
  };

  for (const raw of texts) {
    const text = fold(raw);

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

export function withLabelClaims(
  summary: ExecutiveSummary,
  texts: string[],
): ExecutiveSummary {
  const claims = detectLabelClaims(texts);

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
