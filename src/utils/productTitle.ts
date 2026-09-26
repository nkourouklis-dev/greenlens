/**
 * Display titles from a brand and a product name.
 *
 * Shared by the worker and the app (the worker imports this file), so the
 * two can never disagree about what a product is called. It was two copies
 * of `[brand, name].join(" ")` — and a third, weaker one in the barcode
 * lookup — which is how "LURPAK LURPAK" reached the screen: the product was
 * identified by the model as brand "Lurpak", name "LURPAK", and nothing
 * checked whether the second already said the first.
 */

/** Case-, accent- and whitespace-insensitive words of a title. */
function wordsOf(text: string): string[] {
  return text
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length > 0);
}

/** True when `needle` appears in `haystack` as a run of whole words. */
function containsWords(haystack: string[], needle: string[]): boolean {
  if (needle.length === 0 || needle.length > haystack.length) {
    return false;
  }

  for (let start = 0; start + needle.length <= haystack.length; start += 1) {
    if (needle.every((word, offset) => haystack[start + offset] === word)) {
      return true;
    }
  }

  return false;
}

/**
 * "Brand Name", without saying the brand twice.
 *
 * The brand is dropped when the name already contains it as whole words
 * ("Lurpak" + "Lurpak Soft"), and the name is dropped when it is only the
 * brand again ("Lurpak" + "LURPAK"). Whole words, so brand "Mi" is not found
 * inside "Milk". Whichever of the two is kept is returned as it was written.
 */
export function composeDisplayTitle(
  brand: string | null | undefined,
  productName: string | null | undefined,
): string {
  const brandText = (brand ?? "").replace(/\s+/g, " ").trim();
  const nameText = (productName ?? "").replace(/\s+/g, " ").trim();

  if (!brandText) {
    return nameText;
  }

  if (!nameText) {
    return brandText;
  }

  const brandWords = wordsOf(brandText);
  const nameWords = wordsOf(nameText);

  if (containsWords(nameWords, brandWords)) {
    return nameText;
  }

  if (containsWords(brandWords, nameWords)) {
    return brandText;
  }

  return `${brandText} ${nameText}`;
}

/**
 * Cleans a title that was already composed and stored, before this rule
 * existed: a title that is one phrase said twice ("LURPAK LURPAK") becomes
 * the phrase once. Anything else is returned untouched.
 */
export function collapseRepeatedTitle(title: string): string {
  const text = title.replace(/\s+/g, " ").trim();

  const words = text.split(" ");

  if (words.length < 2 || words.length % 2 !== 0) {
    return text;
  }

  const half = words.length / 2;

  const first = words.slice(0, half).join(" ");
  const second = words.slice(half).join(" ");

  return wordsOf(first).join(" ") === wordsOf(second).join(" ")
    ? first
    : text;
}
