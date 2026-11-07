/**
 * Guards for the free-text lines a person reads (highlights, watch-outs,
 * summaries) when they came from a language model or from an older scan.
 *
 * A line that is visibly broken, or says nothing, is dropped rather than shown:
 * "Φυσικά εκ_extracts" and a bare "Χημικές ουσίες" both reached the share text
 * of a real scan.
 */

/** An underscore in a word, or one word mixing Greek and Latin letters. */
export function isGarbled(text: string): boolean {
  if (text.includes("_")) {
    return true;
  }

  return text.split(/\s+/).some((word) => {
    const letters = word.replace(/[^\p{L}]/gu, "");

    return (
      /\p{Script=Greek}/u.test(letters) && /\p{Script=Latin}/u.test(letters)
    );
  });
}

/**
 * Warnings that name no ingredient and no reason. "Χημικές ουσίες" is true of
 * every product ever made, so as a caution it only scares; a useful one says
 * which ingredient and why.
 */
const VAGUE_LINES = new Set([
  "χημικές ουσίες",
  "χημικά",
  "χημικά συστατικά",
  "χημικές ενώσεις",
  "πτητικές οργανικές ενώσεις",
  "ουσίες",
  "συστατικά",
  "πρόσθετα",
  "θρεπτικά συστατικά",
  "φυσικά συστατικά",
]);

function normalizeLine(text: string): string {
  return text
    .toLocaleLowerCase("el-GR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[.\s:;,!·•-]+$/u, "")
    .replace(/\s+/g, " ")
    .trim();
}

const VAGUE_NORMALIZED = new Set(Array.from(VAGUE_LINES, normalizeLine));

export function isVague(text: string): boolean {
  return VAGUE_NORMALIZED.has(normalizeLine(text));
}

/** True when a line must not be shown to a person. */
export function isUnusableCopy(text: string): boolean {
  return text.trim().length === 0 || isGarbled(text) || isVague(text);
}

export function usableCopyLines(items: readonly string[] | undefined): string[] {
  return (items ?? []).filter(
    (item): item is string => typeof item === "string" && !isUnusableCopy(item),
  );
}
