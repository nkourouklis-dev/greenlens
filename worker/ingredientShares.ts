/**
 * What an ingredient list says about two things the nutrition table cannot:
 *
 *  1. How much of the product is fruit, vegetables or pulses — the Nutri-Score
 *     "fruit, vegetables and legumes" component. Label tables never state it,
 *     so it was always read as "unknown, 0 points", however many dates a bar
 *     declared ("Χουρμάδες 45%").
 *  2. Where the sugars in the table come from — free/added sugars (sugar,
 *     syrups, honey, concentrates: the WHO's "free sugars") or the intrinsic
 *     sugars of whole and dried fruit.
 *
 * Which ingredients count towards (1) follows the 2023 algorithm [SpF-2022
 * §1.2.2, "Ingredients contributing to the Fruit, vegetables and legumes
 * component"]: vegetable groups, fruit groups and pulses. Nuts and plant oils
 * were REMOVED from that component in the update (nuts moved to the fats
 * category), so peanut or cashew butter earns nothing here. Isolated protein
 * and fibre (pea protein, chicory fibre), juices, extracts and syrups are not
 * the whole food either.
 *
 * Nothing is guessed in the flattering direction: a declared percentage is
 * the only quantity read for (1), and (2) answers "undetermined" whenever the
 * list does not settle it, which callers must treat as "score as before".
 */

import { extractIngredientText } from "./ingredientText";

export interface ListedIngredient {
  /** As printed, without its percentage. */
  name: string;
  /** The declared share of the product, %, or null when none is printed. */
  percent: number | null;
  /** 0-based place among the top-level entries; the list is by weight. */
  position: number;
  /** True for a component named inside a compound ingredient's brackets. */
  nested: boolean;
  /** The entry states its own composition ("(100% Φιστίκια)"). */
  statesComposition: boolean;
}

function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/ς/g, "σ");
}

/** Splits on commas/semicolons that are not inside brackets or decimals. */
function splitTopLevel(text: string): string[] {
  const parts: string[] = [];

  let depth = 0;
  let current = "";

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (char === "(" || char === "[") {
      depth += 1;
    } else if ((char === ")" || char === "]") && depth > 0) {
      depth -= 1;
    }

    const decimalComma =
      char === "," &&
      /\d/.test(text[index - 1] ?? "") &&
      /\d/.test(text[index + 1] ?? "");

    if (depth === 0 && !decimalComma && (char === "," || char === ";")) {
      parts.push(current);
      current = "";
    } else {
      current += char;
    }
  }

  parts.push(current);

  return parts.map((part) => part.trim()).filter((part) => part.length > 0);
}

const PERCENT = /(\d{1,3}(?:[.,]\d+)?)\s*%/;

function toNumber(raw: string): number | null {
  const value = Number(raw.replace(",", "."));

  return Number.isFinite(value) && value <= 100 ? value : null;
}

/** "(46,6%)" on its own: the share itself, not a composition. */
const BRACKETED_PERCENT_ONLY = /^\s*\d{1,3}(?:[.,]\d+)?\s*%\s*$/;

/** "(100% Φιστίκια)": what the ingredient is made of, not how much of it. */
const COMPOSITION_STATEMENT = /^\s*\d{1,3}(?:[.,]\d+)?\s*%\s*\p{L}/u;

function parseEntries(
  text: string,
  nested: boolean,
  positionOf: (index: number) => number,
  out: ListedIngredient[],
): void {
  const chunks = splitTopLevel(text);

  chunks.forEach((chunk, index) => {
    // OCR leaves "Σοκολάτα 7,6%, (100% κακαόμαζα)" with the bracket after the
    // comma: it belongs to the previous entry, it is not an ingredient.
    if (/^\(\s*\d/.test(chunk)) {
      const previous = out[out.length - 1];

      if (previous && !nested) {
        previous.statesComposition = true;
      }

      return;
    }

    // "Χωρίς προσθήκη ζάχαρης" is a claim, not an ingredient.
    if (/^(χωρις|without|no|free from)(?![\p{L}\p{N}])/u.test(normalize(chunk))) {
      return;
    }

    let name = chunk;
    let percent: number | null = null;
    let statesComposition = false;
    const brackets: string[] = [];

    // Pull bracketed groups out so their numbers are not read as this
    // entry's own share.
    name = name.replace(/[([]([^()[\]]*)[)\]]/g, (_whole, inner: string) => {
      if (BRACKETED_PERCENT_ONLY.test(inner)) {
        percent = toNumber(inner.replace("%", "").trim());
      } else if (COMPOSITION_STATEMENT.test(inner)) {
        statesComposition = true;
      } else {
        brackets.push(inner);
      }

      return " ";
    });

    const own = PERCENT.exec(name);

    if (own) {
      percent = toNumber(own[1]);
      name = name.replace(PERCENT, " ");
    }

    name = name
      .replace(/\s{2,}/g, " ")
      .replace(/[.\s]+$/u, "")
      .trim();

    if (name.length === 0) {
      return;
    }

    const position = positionOf(index);

    out.push({ name, percent, position, nested, statesComposition });

    for (const inner of brackets) {
      parseEntries(inner, true, () => position, out);
    }
  });
}

/**
 * The heading the Greek or English list starts under. Matched on the original
 * text with both accented and plain spellings, because OCR drops accents.
 */
const LIST_HEADING = /(?:συστατικ[άα]|ingredients|σ[υύ]νθεση)\s*:/iu;

/**
 * Where the list ends: the first full stop that is not a decimal point, an
 * abbreviation's or inside brackets. What follows is the allergen/trace
 * statement ("Μπορεί να περιέχει ίχνη από γάλα"), origin and storage text.
 */
function endOfList(text: string): number {
  let depth = 0;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (char === "(" || char === "[") {
      depth += 1;
    } else if ((char === ")" || char === "]") && depth > 0) {
      depth -= 1;
    } else if (
      char === "." &&
      depth === 0 &&
      !/\d/.test(text[index + 1] ?? "") &&
      /\s|^$/.test(text[index + 1] ?? "")
    ) {
      return index;
    }
  }

  return text.length;
}

/**
 * Isolates the ingredient list from a label's text, or returns null when the
 * text holds none. Claims printed above it ("Χωρίς προσθήκη ζάχαρης"), the
 * English copy below it and the trace statement after it are all left out: a
 * word in any of them must never be read as an ingredient.
 */
export function ingredientListFromLabel(
  rawText: string,
  options?: { strict?: boolean },
): string | null {
  const strict = options?.strict ?? true;

  const heading = LIST_HEADING.exec(rawText);

  // Without a heading a strict reader needs the text to look like a list; a
  // lenient one takes it as given (an ingredient scan's text is one already).
  const body = heading
    ? rawText.slice(heading.index + heading[0].length)
    : (extractIngredientText(rawText, 1).ingredientText ??
      (strict ? null : rawText));

  if (!body) {
    return null;
  }

  const flat = body.replace(/\s+/g, " ").trim();

  const english = /ingredients\s*:/i.exec(flat);

  const greek = english && english.index > 0 ? flat.slice(0, english.index) : flat;

  const list = greek.slice(0, endOfList(greek)).trim();

  return list.length > 0 ? list : null;
}

/**
 * The entries of an ingredient list, in label order, with the percentage each
 * declares. Components named inside brackets follow their parent (nested).
 * `text` is an ingredient scan's list (a claim above it or a trace statement
 * below it is cut away); a nutrition photo goes through the strict
 * ingredientListFromLabel first.
 */
export function parseIngredientList(text: string): ListedIngredient[] {
  const out: ListedIngredient[] = [];

  const list = ingredientListFromLabel(text, { strict: false });

  if (list !== null) {
    parseEntries(list, false, (index) => index, out);
  }

  return out;
}

// --- Vocabulary ----------------------------------------------------------------
// Stems are matched on accent- and case-folded text.

/** Whole or dried fruit, vegetables and pulses — the whole food. */
const PLANT_FOOD_STEMS = [
  // fruit
  "χουρμ", "συκο$", "συκα$", "σταφιδ", "σουλτανιν", "βεριοκο", "δαμασκην", "μπανανα",
  "μηλο$", "μηλα$", "αχλαδι", "φραουλ", "βατομουρ", "μυρτιλ", "κρανμπερ",
  "κερασι", "ανανα", "μανγκο", "πορτοκαλι", "λεμον", "ροδι$", "ροδακιν",
  "σταφυλι", "καρπουζ", "πεπονι", "ακτινιδ", "αβοκαντο", "φρουτ", "φρουτο",
  "date$", "fig$", "raisin", "sultana", "apricot", "prune", "banana", "apple",
  "pear$", "strawberr", "blueberr", "cranberr", "cherr", "pineapple", "mango",
  "orange", "lemon", "grape", "fruit",
  // vegetables
  "καροτ", "ντοματ", "πατατ", "κολοκυθ", "σπανακ", "κρεμμυδ", "λαχανικ",
  "μπροκολ", "κουνουπιδ", "πιπερι", "μελιτζαν", "μελιντζαν", "παντζαρι", "carrot",
  "tomato", "potato", "pumpkin", "spinach", "onion", "vegetable", "broccoli",
  // pulses
  "ρεβιθ", "φακη$", "φακες", "φασολ", "αρακα$", "αρακας", "chickpea", "lentil",
  "bean$", "pea$",
];

/**
 * Anything that is a part, extract or derivative rather than the whole food,
 * or a nut/oil (excluded from the 2023 component), or a sugar in its own
 * right. Checked first.
 */
const NOT_WHOLE_FOOD_STEMS = [
  "πρωτεϊν", "πρωτειν", "protein", "ινα$", "ινες", "fibre", "fiber", "χυμο", "juice",
  "συμπυκν", "concentrate", "εκχυλισμ", "extract", "σιροπ", "syrup",
  "ελαι", "oil$", "βουτυρ", "butter", "αρωμα", "flavour", "flavor", "σκονη",
  "powder", "αλευρ", "flour", "καρυδ", "nut$", "αμυγδαλ", "almond", "φιστικ",
  "peanut", "κασιους", "cashew", "φουντουκ", "hazelnut", "σουσαμ", "sesame",
  "κακα", "cocoa", "κανελ", "cinnamon",
];

/**
 * Free sugars, WHO definition: added sugars and syrups, honey, and sugars
 * naturally present in juices and concentrates. Maltodextrin and the like are
 * included — they are refined carbohydrate that behaves as sugar.
 */
const FREE_SUGAR_STEMS = [
  "ζαχαρη", "ζαχαρ", "σακχαροζ", "sugar", "sucrose", "saccharose",
  "γλυκοζ", "glucose", "dextrose", "δεξτροζ", "φρουκτοζ", "fructose",
  "σιροπι", "syrup", "μελι$", "honey", "μελασ", "molasses", "αγαβη", "agave",
  "μαλτοδεξτριν", "maltodextrin", "ισογλυκοζ", "isoglucose", "μαλτοζ",
  "maltose", "συμπυκνωμ", "concentrate", "χυμο$", "χυμου$", "juice",
  "ζαχαροπλαστ", "καραμελ", "caramelised sugar",
];

/**
 * Compound ingredients that normally carry added sugar and whose recipe the
 * list does not give, so the sugar they hold cannot be assigned to fruit.
 */
const OPAQUE_SUGAR_CARRIER_STEMS = [
  "σοκολατ", "chocolate", "κουβερτουρ", "μαρμελαδ", "jam$", "μπισκοτ",
  "biscuit", "δημητριακ", "cereal", "γκρανολ", "granola", "παγωτ", "γιαουρτ",
  "yogurt", "yoghurt", "γαλα$", "milk", "σαντιγ", "κρεμα$", "cream", "γλασο",
  "glaze", "επικαλυψ", "coating",
];

/**
 * A stem matches a word that starts with it. A stem ending in "$" is a whole
 * word that may only carry a short case ending ("μελι$" matches "μελιού" but
 * not "μελιτζάνα"; "oil$" matches "oils" but not "foil").
 */
function tokenMatches(token: string, stem: string): boolean {
  if (stem.endsWith("$")) {
    const root = stem.slice(0, -1);

    return token.startsWith(root) && token.length - root.length <= 2;
  }

  return token.startsWith(stem);
}

function hasStem(name: string, stems: string[]): boolean {
  const folded = normalize(name);

  // Multi-word stems ("χυμου συμπυκν") are phrases, matched as such.
  const tokens = folded.split(/[^\p{L}\p{N}]+/u).filter(Boolean);

  return stems.some((stem) => {
    const phrase = normalize(stem);

    return phrase.includes(" ")
      ? folded.includes(phrase)
      : tokens.some((token) => tokenMatches(token, phrase));
  });
}

/** A natural flavour or extract is named after a food but is not that food. */
export function isWholePlantFood(name: string): boolean {
  return !hasStem(name, NOT_WHOLE_FOOD_STEMS) && hasStem(name, PLANT_FOOD_STEMS);
}

/** "Φυσικό εκχύλισμα καραμέλας" is a flavour, "καραμέλα" is cooked sugar. */
export function isFreeSugar(name: string): boolean {
  const folded = normalize(name);

  if (/εκχυλισμ|extract|αρωμα|flavour|flavor/.test(folded)) {
    return false;
  }

  return hasStem(name, FREE_SUGAR_STEMS);
}

function isOpaqueSugarCarrier(entry: ListedIngredient): boolean {
  return (
    !entry.statesComposition &&
    !entry.nested &&
    hasStem(entry.name, OPAQUE_SUGAR_CARRIER_STEMS) &&
    !isFreeSugar(entry.name)
  );
}

// --- (1) Fruit, vegetables, legumes ---------------------------------------------

export interface FruitVegLegumes {
  /** Sum of the declared shares of qualifying ingredients, %. */
  percent: number;
  /** Qualifying ingredients that declare a share, for the explanation. */
  counted: Array<{ name: string; percent: number }>;
}

/**
 * The share of fruit, vegetables and pulses the list *declares*. Null when no
 * qualifying ingredient declares one — unknown, not zero — so the Nutri-Score
 * keeps saying "not found" instead of crediting or charging a guess. An
 * undeclared qualifying ingredient adds nothing: the figure is a floor.
 */
export function declaredFruitVegLegumes(
  ingredients: ListedIngredient[],
): FruitVegLegumes | null {
  const counted = ingredients
    .filter(
      (entry) =>
        !entry.nested && entry.percent !== null && isWholePlantFood(entry.name),
    )
    .map((entry) => ({ name: entry.name, percent: entry.percent as number }));

  if (counted.length === 0) {
    return null;
  }

  return {
    percent: Math.min(
      100,
      counted.reduce((total, entry) => total + entry.percent, 0),
    ),
    counted,
  };
}

// --- (2) Intrinsic versus free sugars --------------------------------------------

/**
 * Sugar, g per 100 g of the ingredient, of dried fruit and of other fruit —
 * only used when a free sugar and fruit share the list and the order alone
 * does not settle it. Dried fruit (dates, figs, raisins, prunes, apricots)
 * runs 38–68 g per 100 g; the middle is used. Fresh and canned fruit ~10 g.
 */
const DRIED_FRUIT_SUGAR_PER_100 = 55;
const OTHER_FRUIT_SUGAR_PER_100 = 10;
const DRIED_FRUIT_STEMS = [
  "χουρμ", "συκο$", "συκα$", "σταφιδ", "σουλτανιν", "βεριοκο", "δαμασκην",
  "date$", "fig$", "raisin", "sultana", "apricot", "prune", "ξηρ", "dried",
];

export type SugarOriginBasis =
  /** Fruit is listed and no free sugar is: every sugar is the fruit's. */
  | "no_free_sugar_listed"
  /** Free sugar is listed; the fruit's declared share was used to split. */
  | "estimated_from_declared_shares";

export type SugarOriginUndetermined =
  | "no_ingredient_list"
  | "no_sugar_value"
  | "no_fruit_listed"
  | "free_sugar_listed_before_fruit"
  | "free_sugar_with_undeclared_fruit"
  | "opaque_sugar_carrier";

export type SugarOrigin =
  | {
      determined: true;
      basis: SugarOriginBasis;
      /** Per 100 g of product. */
      intrinsicGrams: number;
      freeGrams: number;
      /** intrinsicGrams / sugars, 0–1. */
      intrinsicShare: number;
    }
  | { determined: false; reason: SugarOriginUndetermined };

/**
 * Splits the table's sugars (g per 100 g) into free and intrinsic.
 *
 *  - Nothing in the list is a free sugar, and whole/dried fruit is listed
 *    → all sugars are the fruit's. (Compound ingredients with no stated recipe
 *    — chocolate, biscuit, milk — make this undetermined: they bring sugar of
 *    their own and the list does not say how much.)
 *  - A free sugar is listed too → estimated only when the fruit comes before
 *    every free sugar (the list is by weight) and declares its share; the
 *    fruit's sugars are that share × a typical sugar content, capped at the
 *    table's total, and everything else is free.
 *  - Anything else → undetermined, and the caller scores as before.
 */
export function splitSugarOrigin(
  ingredients: ListedIngredient[] | null,
  sugarsPer100: number | null,
): SugarOrigin {
  if (ingredients === null || ingredients.length === 0) {
    return { determined: false, reason: "no_ingredient_list" };
  }

  if (sugarsPer100 === null || sugarsPer100 <= 0) {
    return { determined: false, reason: "no_sugar_value" };
  }

  const fruit = ingredients.filter(
    (entry) => !entry.nested && isWholePlantFood(entry.name),
  );

  const freeSugars = ingredients.filter((entry) => isFreeSugar(entry.name));

  if (fruit.length === 0) {
    return { determined: false, reason: "no_fruit_listed" };
  }

  if (ingredients.some(isOpaqueSugarCarrier)) {
    return { determined: false, reason: "opaque_sugar_carrier" };
  }

  if (freeSugars.length === 0) {
    return {
      determined: true,
      basis: "no_free_sugar_listed",
      intrinsicGrams: sugarsPer100,
      freeGrams: 0,
      intrinsicShare: 1,
    };
  }

  const firstFreePosition = Math.min(
    ...freeSugars.map((entry) => entry.position),
  );

  const fruitBeforeSugar = fruit.filter(
    (entry) => entry.position < firstFreePosition,
  );

  if (fruitBeforeSugar.length === 0) {
    return { determined: false, reason: "free_sugar_listed_before_fruit" };
  }

  if (fruitBeforeSugar.some((entry) => entry.percent === null)) {
    return { determined: false, reason: "free_sugar_with_undeclared_fruit" };
  }

  const estimated = fruitBeforeSugar.reduce(
    (total, entry) =>
      total +
      ((entry.percent as number) / 100) *
        (hasStem(entry.name, DRIED_FRUIT_STEMS)
          ? DRIED_FRUIT_SUGAR_PER_100
          : OTHER_FRUIT_SUGAR_PER_100),
    0,
  );

  const intrinsicGrams = Math.min(sugarsPer100, estimated);

  return {
    determined: true,
    basis: "estimated_from_declared_shares",
    intrinsicGrams,
    freeGrams: sugarsPer100 - intrinsicGrams,
    intrinsicShare: intrinsicGrams / sugarsPer100,
  };
}
