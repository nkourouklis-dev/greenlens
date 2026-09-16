/**
 * Alcohol as a scoring factor.
 *
 * A beer brewed from water, malt, hops and yeast has nothing the ingredient
 * rules object to, and a pilsner's nutrition table is close to water's — so
 * before this existed the Kaiser pilsner (5201309103033) scored 100, which
 * reads as "drink freely". Alcohol carries its own health risk whatever the
 * rest of the label says, and that risk grows with how much of it there is:
 * a 40% spirit is not a 5% beer with the same ingredients.
 *
 * So the declared strength (ABV) is charged as a *visible* deduction, graded
 * by dose, next to a note that moderation guidance applies regardless of the
 * score. Never a hidden penalty: the user sees "Αλκοόλ 5,2% vol" and the
 * points it cost in the breakdown, like every other deduction.
 *
 * Deterministic from the label text, for the same reason the nutrition panel
 * is (see nutritionPanel.ts): the PIM recompute runs without a model and has
 * to reach the same number a scan did.
 */

export interface AlcoholInfo {
  /** Declared % vol, or null when the drink is alcoholic but no ABV was read. */
  abv: number | null;
  /** The strength exactly as printed, e.g. "5,2%". */
  declared: string | null;
}

/** EU labelling: at or below 0.5% vol a drink may be sold as alcohol-free. */
export const ALCOHOL_FREE_MAX_ABV = 0.5;

/** Ethanol density, g/ml: turns % vol into grams per 100 ml. */
const ETHANOL_DENSITY = 0.789;

/** Atwater factor for ethanol. */
const ETHANOL_KCAL_PER_GRAM = 7;

const MAX_ALCOHOL_POINTS = 80;

/**
 * Strength printed with an alcohol marker on either side of it:
 * "ALC. 5,2%", "alc. 5.2% vol", "Αλκ. 5% κ.ό.", "12,5% vol", "vol. 40%".
 * A bare percentage is never enough — labels are full of them (reference
 * intakes, cocoa content, fruit content).
 */
const ABV_PATTERNS: RegExp[] = [
  /(?<!\p{L})(?:alc|αλκ(?:οόλη?|οολη?)?)\s*\.?\s*:?\s*(\d{1,2}(?:[.,]\d{1,2})?)\s*%/iu,
  /(\d{1,2}(?:[.,]\d{1,2})?)\s*%\s*(?:vol(?!\p{L})|κ\s*\.?\s*[όο](?!\p{L}))/iu,
  /(?<!\p{L})vol\s*\.?\s*:?\s*(\d{1,2}(?:[.,]\d{1,2})?)\s*%/iu,
];

/**
 * Words that make a product an alcoholic drink even when its strength was
 * not read. Kept to drink *types* — "κρασί" alone is not here, because
 * "ξύδι από κρασί" is an ingredient of half the dressings on a shelf.
 * `(?<!\p{L})`/`(?!\p{L})` rather than `\b`, which in JavaScript only
 * knows ASCII letters and never matches next to a Greek one. No "ale":
 * ginger ale is a soft drink.
 */
const ALCOHOLIC_DRINK_PATTERN =
  /(?<!\p{L})(μπ[ύυ]ρα|μπ[ύυ]ρες|beer|pilsner|lager|ζυθοποι\p{L}*|wine|ο[ίι]νος|ο[ίι]νου|ο[ύυ]ζο|τσ[ίι]πουρο|τσικουδι[άα]|vodka|β[όο]τκα|whiske?y|ουισκι|gin|rum|λικ[έε]ρ|liqueur|cider|μηλ[ίι]της|σαμπ[άα]νια|champagne|prosecco|spirit drink)(?!\p{L})/iu;

/** A drink-type word used as an ingredient, not as what the product is. */
const NOT_A_DRINK_PATTERN =
  /(ξ[ύυ]δι|vinegar|μαγι[άα]\s+μπ[ύυ]ρας|brewer'?s yeast|root beer|ginger beer)/iu;

const ALCOHOL_FREE_PATTERN =
  /(χωρ[ίι]ς\s+αλκο[όο]λ|αναλκοολ|alcohol[\s-]*free|non[\s-]*alcoholic)/iu;

function parseStrength(text: string): { abv: number; declared: string } | null {
  for (const pattern of ABV_PATTERNS) {
    const match = pattern.exec(text);

    if (!match) {
      continue;
    }

    const abv = Number(match[1].replace(",", "."));

    // Nothing drinkable is sold above ~96%; a larger number is a misread.
    if (Number.isFinite(abv) && abv >= 0 && abv <= 96) {
      return { abv, declared: `${match[1]}%` };
    }
  }

  return null;
}

/**
 * The alcohol a label declares, or null for a product that is not an
 * alcoholic drink. `texts` are every piece of text known for the product —
 * the strength is often printed on a different panel from the ingredients.
 */
export function detectAlcohol(
  texts: Array<string | null | undefined>,
): AlcoholInfo | null {
  const joined = texts
    .filter((text): text is string => typeof text === "string")
    .join("\n");

  if (joined.trim().length === 0) {
    return null;
  }

  const strength = parseStrength(joined);

  if (strength) {
    return { abv: strength.abv, declared: strength.declared };
  }

  const drinkWord = ALCOHOLIC_DRINK_PATTERN.exec(joined);

  // A drink word alone is weak evidence — "κόκκινος οίνος" is an ingredient
  // of many sauces — so it only counts on a label that also declares its
  // values per 100 ml, i.e. on a drink.
  if (drinkWord && /100\s*ml/iu.test(joined)) {
    if (ALCOHOL_FREE_PATTERN.test(joined)) {
      return { abv: 0, declared: null };
    }

    const around = joined.slice(
      Math.max(0, drinkWord.index - 20),
      drinkWord.index + drinkWord[0].length + 20,
    );

    if (!NOT_A_DRINK_PATTERN.test(around)) {
      return { abv: null, declared: null };
    }
  }

  return null;
}

/** Grams of ethanol in 100 ml, for the energy cross-check. */
export function alcoholGramsPer100ml(abv: number): number {
  return abv * ETHANOL_DENSITY;
}

export function alcoholKcalPer100ml(abv: number): number {
  return alcoholGramsPer100ml(abv) * ETHANOL_KCAL_PER_GRAM;
}

/**
 * 15 + 2 points per % vol, capped at 80 — agreed 2026-09-16:
 * 5% beer −25, 12% wine −39, 30% liqueur −75, 40% spirit −80.
 * Nothing at or below 0.5% (alcohol-free), and nothing when the strength
 * could not be read: a note, never a guessed number.
 */
export function alcoholPoints(info: AlcoholInfo | null): number {
  if (!info || info.abv === null || info.abv <= ALCOHOL_FREE_MAX_ABV) {
    return 0;
  }

  return Math.min(MAX_ALCOHOL_POINTS, Math.round(15 + 2 * info.abv));
}

function formatAbv(info: AlcoholInfo): string {
  return info.declared ?? `${String(info.abv).replace(".", ",")}%`;
}

export function alcoholDeduction(info: AlcoholInfo | null): {
  code: string;
  points: number;
  title: string;
  explanation: string;
  ingredientIds: string[];
  evidenceRequired: boolean;
  evidenceAvailable: boolean;
} | null {
  const points = alcoholPoints(info);

  if (!info || points === 0) {
    return null;
  }

  return {
    code: "alcohol:abv",
    points,
    title: `Αλκοόλ ${formatAbv(info)} vol`,
    explanation:
      "Το αλκοόλ επιβαρύνει την υγεία ανεξάρτητα από τα συστατικά· όσο υψηλότερος ο αλκοολικός βαθμός, τόσο μεγαλύτερη η αφαίρεση.",
    ingredientIds: [],
    evidenceRequired: false,
    // The strength is printed on the label; the curve is a fixed rule.
    evidenceAvailable: true,
  };
}

export interface ScoreNotice {
  code: string;
  title: string;
  body: string;
}

/** The note shown beside the score of any alcoholic drink. */
export function alcoholNotice(info: AlcoholInfo | null): ScoreNotice | null {
  if (!info) {
    return null;
  }

  if (info.abv !== null && info.abv <= ALCOHOL_FREE_MAX_ABV) {
    return {
      code: "alcohol_free",
      title: "Ποτό χωρίς αλκοόλ",
      body: "Μπορεί να περιέχει ίχνη αλκοόλ (έως 0,5% vol).",
    };
  }

  if (info.abv === null) {
    return {
      code: "alcohol_unknown_abv",
      title: "Αλκοολούχο ποτό",
      body: "Δεν διαβάστηκε ο αλκοολικός βαθμός, οπότε δεν υπολογίστηκε στη βαθμολογία. Ισχύουν οι συστάσεις για μέτρια κατανάλωση, όποια κι αν είναι η βαθμολογία.",
    };
  }

  return {
    code: "alcohol",
    title: `Περιέχει αλκοόλ ${formatAbv(info)} vol`,
    body: "Η βαθμολογία αφορά τα συστατικά και τη διατροφική σύσταση και δεν σημαίνει ότι η κατανάλωση είναι ασφαλής. Ισχύουν οι συστάσεις για μέτρια κατανάλωση αλκοόλ.",
  };
}

/** Reads back an AlcoholInfo persisted on a stored analysis. */
export function parseAlcoholInfo(value: unknown): AlcoholInfo | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const candidate = value as Record<string, unknown>;

  const abv =
    typeof candidate.abv === "number" &&
    Number.isFinite(candidate.abv) &&
    candidate.abv >= 0 &&
    candidate.abv <= 96
      ? candidate.abv
      : null;

  if (candidate.abv !== null && abv === null) {
    return null;
  }

  return {
    abv,
    declared:
      typeof candidate.declared === "string" ? candidate.declared : null,
  };
}
