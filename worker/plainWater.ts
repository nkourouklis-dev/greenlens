import type { NutritionEvidence } from "./nutritionFacts";

/**
 * A plain water has no nutrition table to photograph: its label is a list of
 * dissolved minerals (a "chemical analysis"), and every real table would read
 * zero. Scored as an unfinished food it was capped at 65 — "moderate" — and
 * told to add a table that does not exist (Βίκος, 5201946010022).
 *
 * The Nutri-Score already grades plain water A; this recognises the label so
 * that grade can be used when Open Food Facts has no record to say so.
 */

function fold(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase();
}

/** What a list of water and its minerals is made of, and nothing else. */
const WATER_WORDS = new Set([
  "water", "aqua", "νερο", "μεταλλικο", "φυσικο", "mineral", "natural", "spring",
  "calcium", "magnesium", "sodium", "potassium", "bicarbonate", "bicarbonates",
  "chloride", "sulfate", "sulphate", "nitrate", "silica", "fluoride",
  "ασβεστιο", "μαγνησιο", "νατριο", "καλιο", "υδρογονανθρακικα", "χλωριον",
  "θειικα", "νιτρικα", "πυριτιο", "φθοριο",
  "ca", "mg", "na", "k", "cl", "f", "so4", "no3", "hco3", "sio2", "co2",
  "carbonated", "sparkling", "αεριουχο", "διοξειδιο", "ανθρακα", "του", "of", "and", "και",
]);

/** A measured analysis report: a heading naming it, and mg/L figures. */
function looksLikeWaterAnalysis(folded: string): boolean {
  return (
    /(chemical analysis|χημικη αναλυση)/.test(folded) &&
    /mg\s?\/\s?l/.test(folded) &&
    /\b(ca|mg|na)\b/.test(folded)
  );
}

function isMineralList(folded: string): boolean {
  const words = folded.split(/[^\p{L}\p{N}]+/u).filter((word) => word.length > 0);

  return (
    words.length > 0 &&
    words.some((word) => word === "aqua" || word === "water" || word === "νερο") &&
    words.every((word) => WATER_WORDS.has(word))
  );
}

export function isPlainWaterLabel(text: string | null | undefined): boolean {
  if (!text) {
    return false;
  }

  const folded = fold(text);

  return looksLikeWaterAnalysis(folded) || isMineralList(folded);
}

/** The evidence a plain water stands on: the category alone, no quantities. */
export const PLAIN_WATER_EVIDENCE: NutritionEvidence = {
  source: "label",
  categoryTags: ["en:waters"],
  facts: {
    energyKj: null,
    fat: null,
    saturates: null,
    carbohydrate: null,
    sugars: null,
    fibre: null,
    protein: null,
    salt: null,
    fruitVegLegumesPct: null,
    isBeverage: true,
    abv: null,
  },
};
