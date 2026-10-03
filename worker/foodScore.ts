/**
 * One score for a food, from whatever evidence exists.
 *
 * Until now the score meant "clean ingredient list", and people read it as
 * "healthy food": Lurpak Soft (butter, olive oil, salt — 543 kcal and 23 g of
 * saturates per 100 g) scored 100, because nothing had looked at the numbers
 * Open Food Facts holds for it. This blends the two:
 *
 *   nutrition   — the Nutri-Score (nutriScore.ts), mapped to 0–100;
 *   ingredients — the existing ingredient/additive score (scoring.ts).
 *
 * Cosmetics and chemical composition do not come through here: an
 * ingredient-list scan enters through scoreForProductType, which sends only
 * foods on to scoreFood.
 *
 * What is missing is never dropped silently:
 *  - no nutrition from any source → the score is capped at
 *    PARTIAL_EVALUATION_SCORE_CAP and a visible notice says why;
 *  - no usable ingredient list → the Nutri-Score stands alone, with a notice;
 *  - nutrition present but too incomplete for a grade → treated as missing,
 *    and the notice names what was not found.
 */

import { alcoholDeduction, type AlcoholInfo, type ScoreNotice } from "./alcohol";
import {
  computeNutriScore,
  nutriScoreTo100,
  type NutriGrade,
  type NutriScoreResult,
  type MissingNutrient,
  type NutriScoreComponent,
  type UncreditedNutrient,
} from "./nutriScore";
import {
  factsFromPanel,
  nutriScoreInputFor,
  type NutritionEvidence,
  type NutritionFacts,
  type NutritionSource,
} from "./nutritionFacts";
import type { NutritionPanel } from "./nutritionPanel";
import type { RuleMatch } from "./ingredientRules";
import type { WorkerNutritionResult } from "./nutritionAnalysis";
import {
  declaredFruitVegLegumes,
  parseIngredientList,
  splitSugarOrigin,
  type SugarOrigin,
} from "./ingredientShares";
import { scoreNutrition } from "./nutritionScoring";
import {
  bandForScore,
  insufficientDataScore,
  noticesFor,
  scoringVersion,
  type WorkerScore,
} from "./scoring";

/**
 * How the two halves weigh in a food that has both. Nutrition leads because
 * it is what "healthy" means to the person holding the pack; ingredients and
 * additives keep 40 % because a clean list and an ultra-processed one are
 * not the same food even at equal nutrition. Must sum to 1.
 */
export const NUTRITION_WEIGHT = 0.6;
export const INGREDIENTS_WEIGHT = 0.4;

/**
 * The ceiling for a food judged without any nutrition data. 65 sits below
 * the "good" band (70, see bandForScore): a product nobody has looked at the
 * numbers of can be at best "moderate", never good and never excellent.
 */
export const PARTIAL_EVALUATION_SCORE_CAP = 65;

export const PARTIAL_NO_NUTRITION_NOTICE: ScoreNotice = {
  code: "partial_no_nutrition",
  title: "Μερική αξιολόγηση — δεν βρέθηκαν διατροφικά στοιχεία",
  body: `Η βαθμολογία βασίζεται μόνο στη λίστα συστατικών και δεν μπορεί να ξεπεράσει το ${PARTIAL_EVALUATION_SCORE_CAP}/100. Πρόσθεσε φωτογραφία του διατροφικού πίνακα για πλήρη αξιολόγηση.`,
};

export const PARTIAL_NO_INGREDIENTS_NOTICE: ScoreNotice = {
  code: "partial_no_ingredients",
  title: "Μερική αξιολόγηση — δεν βρέθηκε λίστα συστατικών",
  body: "Η βαθμολογία βασίζεται μόνο στη διατροφική σύσταση. Πρόσθεσε φωτογραφία των συστατικών για πλήρη αξιολόγηση.",
};

/**
 * How much of a sugar that comes from whole or dried fruit counts towards OUR
 * score, relative to a free (added) sugar at 1. The WHO's limit is on free
 * sugars; the sugars inside whole fruit are not part of it, so they are
 * discounted — but not forgiven: a date bar is still energy-dense and the
 * sugar is concentrated, and the official sugar points are untouched.
 */
export const INTRINSIC_SUGAR_WEIGHT = 0.5;

/** From this share of the sugars on, the note says "mostly from fruit". */
export const MOSTLY_INTRINSIC_SHARE = 0.5;

/** Sugar points from which the quantity itself is called out (> 10 g/100 g). */
const LARGE_SUGAR_POINTS = 4;

export function mostlyIntrinsicSugarNotice(
  sugarsGrams: number | null,
  largeQuantity: boolean,
): ScoreNotice {
  const grams =
    sugarsGrams === null
      ? ""
      : ` (${String(Math.round(sugarsGrams * 10) / 10).replace(".", ",")} g ανά 100 g)`;

  return {
    code: "sugar_mostly_intrinsic",
    title: "Τα σάκχαρα προέρχονται κυρίως από φρούτα",
    body: `Τα σάκχαρα προέρχονται από φρούτα (π.χ. χουρμάδες) και όχι από προστιθέμενα σάκχαρα ή σιρόπια. Στη βαθμολογία μας προσμετρούνται στο ${Math.round(INTRINSIC_SUGAR_WEIGHT * 100)}%. Το επίσημο Nutri-Score δεν αλλάζει.${
      largeQuantity
        ? ` Προσοχή: η ποσότητα σακχάρων είναι μεγάλη${grams}.`
        : ""
    }`,
  };
}

const NUTRIENT_NAMES: Record<MissingNutrient | UncreditedNutrient, string> = {
  energy: "ενέργεια",
  saturates: "κορεσμένα λιπαρά",
  sugars: "σάκχαρα",
  salt: "αλάτι",
  fat: "λιπαρά",
  fibre: "φυτικές ίνες",
  protein: "πρωτεΐνη",
  fruit_veg_legumes: "φρούτα/λαχανικά/όσπρια",
  sweeteners: "πληροφορία για γλυκαντικά",
};

function incompleteNutritionNotice(missing: MissingNutrient[]): ScoreNotice {
  const names = missing.map((key) => NUTRIENT_NAMES[key]).join(", ");

  return {
    code: "partial_no_nutrition",
    title: "Μερική αξιολόγηση — δεν βρέθηκαν διατροφικά στοιχεία",
    body: `Τα διατροφικά στοιχεία που βρέθηκαν είναι ελλιπή (λείπουν: ${names}), οπότε δεν υπολογίστηκε διατροφική βαθμολογία. Η βαθμολογία δεν μπορεί να ξεπεράσει το ${PARTIAL_EVALUATION_SCORE_CAP}/100.`,
  };
}

/** What the nutrition half looked at, kept on the result for the UI. */
export interface NutritionEvaluation {
  source: NutritionSource;
  /** The official Nutri-Score class, exactly as the algorithm gives it. */
  grade: NutriGrade;
  /**
   * The class our score is built from. Equals `grade` unless the sugars were
   * shown to be mostly intrinsic to fruit, when they are weighted down
   * (INTRINSIC_SUGAR_WEIGHT). The official grade and points are not changed.
   */
  scoredGrade: NutriGrade;
  /** Where the sugars come from, when the ingredient list settles it. */
  sugarOrigin?: SugarOrigin;
  /** The weight the intrinsic sugars carried in `scoredGrade` (free sugar = 1). */
  intrinsicSugarWeight?: number;
  /** Where the fruit/veg/legumes share came from, when it is known. */
  fruitVegLegumesFrom?: "openfoodfacts" | "ingredient_list" | null;
  /** The Nutri-Score value itself; null for water. */
  points: number | null;
  category: string;
  components: NutriScoreComponent[];
  /** Favourable nutrients not declared — they earned nothing, and we say so. */
  uncredited: UncreditedNutrient[];
  sugarsBoundedByCarbohydrate: boolean;
  /**
   * Whether the ingredient list names an added sweetener. false is the claim
   * "no added sugar" — the sugars in the table then come from whole foods
   * (dates, fruit, milk). null when nobody checked (no rules matched).
   */
  addedSugar?: boolean | null;
}

/** How the final number was put together, for the breakdown panel. */
export interface ScoreComposition {
  nutrition: {
    score: number;
    weight: number;
    /** The official class. */
    grade: NutriGrade;
    /** The class the score was built from; differs when sugars are mostly fruit's. */
    scoredGrade: NutriGrade;
    source: NutritionSource;
  } | null;
  ingredients: { score: number; weight: number } | null;
  /** Combined score before the cap and the alcohol deduction. */
  blended: number;
  /** Set when the partial-evaluation cap actually lowered the score. */
  cappedFrom: number | null;
  cap: number | null;
}

export type FoodWorkerScore = WorkerScore & {
  composition?: ScoreComposition;
  nutritionEvaluation?: NutritionEvaluation | null;
};

export interface FoodScoreInput {
  /**
   * The ingredient-side score, computed without alcohol (that is charged
   * once, here). Null, or a null score, means no usable ingredient list.
   */
  ingredientScore: WorkerScore | null;
  nutrition: NutritionEvidence | null;
  /** From the ingredient rules: a beverage's non-nutritive sweetener. */
  nonNutritiveSweetener: boolean | null;
  /** See NutritionEvaluation.addedSugar; absent means unchecked. */
  addedSugar?: boolean | null;
  /** The label's ingredient list: the fruit share and the sugars' origin. */
  ingredientText?: string | null;
  alcohol: AlcoholInfo | null;
  notices: ScoreNotice[];
}

/**
 * Whether the ingredients name a non-nutritive sweetener (the beverage
 * Nutri-Score adds 4 points for one). null when no rules were matched at
 * all — the rule table was unreachable — because then "no sweetener" would
 * be a claim nobody checked.
 */
export function sweetenerFrom(ruleMatches: RuleMatch[]): boolean | null {
  return ruleMatches.length === 0
    ? null
    : ruleMatches.some((match) => match.rule.ruleGroup === "artificial_sweetener");
}

/** Whether the ingredients name an added sugar; null when nothing was checked. */
export function addedSugarFrom(ruleMatches: RuleMatch[]): boolean | null {
  return ruleMatches.length === 0
    ? null
    : ruleMatches.some((match) => match.rule.ruleGroup === "added_sugar");
}

/** Evaluates the nutrition half; null when there is nothing gradable. */
export function evaluateNutrition(
  evidence: NutritionEvidence | null,
  nonNutritiveSweetener: boolean | null,
  ingredientText?: string | null,
): { result: NutriScoreResult | null; evaluation: NutritionEvaluation | null } {
  if (evidence === null) {
    return { result: null, evaluation: null };
  }

  const listed = ingredientText ? parseIngredientList(ingredientText) : null;

  // The share of fruit, vegetables and pulses: Open Food Facts' estimate when
  // the evidence has one, else what the list declares. Never invented.
  const declared = listed ? declaredFruitVegLegumes(listed) : null;

  const input = nutriScoreInputFor(evidence, {
    nonNutritiveSweetener,
    fruitVegLegumesPct: declared?.percent ?? null,
  });

  const result = computeNutriScore(input);

  if (!result.computable) {
    return { result, evaluation: null };
  }

  // Our own score only: the same algorithm with the fruit-intrinsic share of
  // the sugars discounted. `result` (the official one) is left as it is.
  const sugarOrigin = splitSugarOrigin(listed, evidence.facts.sugars);

  let scoredGrade = result.grade;

  if (sugarOrigin.determined && sugarOrigin.intrinsicGrams > 0) {
    const adjusted = computeNutriScore({
      ...input,
      sugars:
        sugarOrigin.freeGrams +
        INTRINSIC_SUGAR_WEIGHT * sugarOrigin.intrinsicGrams,
    });

    if (adjusted.computable) {
      scoredGrade = adjusted.grade;
    }
  }

  return {
    result,
    evaluation: {
      source: evidence.source,
      grade: result.grade,
      scoredGrade,
      sugarOrigin,
      intrinsicSugarWeight: INTRINSIC_SUGAR_WEIGHT,
      fruitVegLegumesFrom:
        evidence.facts.fruitVegLegumesPct !== null
          ? "openfoodfacts"
          : declared
            ? "ingredient_list"
            : null,
      points: result.points,
      category: result.category,
      components: result.components,
      uncredited: result.uncredited,
      sugarsBoundedByCarbohydrate: result.sugarsBoundedByCarbohydrate,
    },
  };
}

/**
 * Picks the nutrition evidence for a product: the label in the user's hand,
 * else the barcode's Open Food Facts record, else none.
 *
 * "Else" applies when the label's table cannot be graded — unreadable, or
 * missing something the Nutri-Score needs — not merely when it is absent. A
 * whole source is used or not; fields are never mixed across the two. When
 * neither can be graded, the label (or failing that Open Food Facts) is still
 * returned so the notice can say what was missing.
 */
export function resolveNutritionEvidence(params: {
  panel: NutritionPanel | null;
  offFacts: NutritionFacts | null;
  categoryTags: string[];
}): NutritionEvidence | null {
  const label: NutritionEvidence | null = params.panel
    ? {
        source: "label",
        facts: factsFromPanel(params.panel),
        categoryTags: params.categoryTags,
      }
    : null;

  const off: NutritionEvidence | null = params.offFacts
    ? {
        source: "openfoodfacts",
        facts: params.offFacts,
        categoryTags: params.categoryTags,
      }
    : null;

  for (const candidate of [label, off]) {
    if (candidate && evaluateNutrition(candidate, null).evaluation !== null) {
      return candidate;
    }
  }

  return label ?? off;
}

/**
 * A nutrition-only product whose figures are too incomplete to grade has
 * nothing else to fall back on, so it gets no number — only the reason, which
 * names what is missing (never a guess in its place).
 */
export function incompleteNutritionScore(
  evidence: NutritionEvidence,
  notices: ScoreNotice[],
): WorkerScore {
  const { result } = evaluateNutrition(evidence, null);

  const missing =
    result && !result.computable
      ? result.missing.map((key) => NUTRIENT_NAMES[key]).join(", ")
      : "";

  return insufficientDataScore({
    confidence: 1,
    lowConfidenceReason: null,
    blockingReasons: [
      `Ο διατροφικός πίνακας δεν έχει επαρκή στοιχεία για βαθμολογία${missing ? ` (λείπουν: ${missing})` : ""}. Ξαναφωτογράφισέ τον.`,
    ],
    modelReasons: [],
    notices,
  });
}

/**
 * The blend, the cap and the alcohol deduction, in that order.
 *
 * `deductions` carries the ingredient-side deductions unchanged (they explain
 * the 40 % half), plus the alcohol charge and the cap, when they applied, as
 * their own visible rows. The Nutri-Score's own components are on
 * `nutritionEvaluation`.
 */
/**
 * Whether a product is scored as a food (scoreFood) or on its ingredient
 * list alone. A cosmetic never is: the Nutri-Score half, the partial cap and
 * the "no nutrition found" notice mean nothing for a shampoo — a Garnier
 * shampoo was capped at 65 and told to photograph its nutrition table.
 * A product nobody could place counts as food only when nutrition exists
 * for it somewhere (label or Open Food Facts), which only foods have.
 */
export function isScoredAsFood(
  productType: "food" | "cosmetic" | "unknown",
  nutrition: NutritionEvidence | null,
): boolean {
  if (productType === "food") return true;
  if (productType === "cosmetic") return false;
  return nutrition !== null;
}

/**
 * The entry point for an ingredient-list scan: scoreFood for foods, the
 * ingredient score unchanged for everything else (see isScoredAsFood).
 */
export function scoreForProductType(
  productType: "food" | "cosmetic" | "unknown",
  input: FoodScoreInput,
): FoodWorkerScore {
  if (
    input.ingredientScore !== null &&
    !isScoredAsFood(productType, input.nutrition)
  ) {
    return input.ingredientScore;
  }

  return scoreFood(input);
}

export function scoreFood(input: FoodScoreInput): FoodWorkerScore {
  const { result, evaluation } = evaluateNutrition(
    input.nutrition,
    input.nonNutritiveSweetener,
    input.ingredientText,
  );

  const ingredientScore =
    input.ingredientScore !== null && input.ingredientScore.score !== null
      ? input.ingredientScore
      : null;

  const notices = noticesFor(input.notices, input.alcohol);

  if (evaluation === null && ingredientScore === null) {
    return {
      score: null,
      band: "insufficient_data",
      deductions: [],
      bonuses: [],
      confidence: input.ingredientScore?.confidence ?? 0,
      lowConfidenceReason: input.ingredientScore?.lowConfidenceReason ?? null,
      insufficientDataReasons:
        input.ingredientScore?.insufficientDataReasons ?? [],
      notices,
      scoringVersion,
    };
  }

  const nutritionScore = evaluation
    ? nutriScoreTo100(evaluation.scoredGrade)
    : null;

  let blended: number;

  if (nutritionScore !== null && ingredientScore) {
    blended = Math.round(
      NUTRITION_WEIGHT * nutritionScore +
        INGREDIENTS_WEIGHT * (ingredientScore.score as number),
    );
  } else if (nutritionScore !== null) {
    blended = nutritionScore;
  } else {
    blended = ingredientScore?.score as number;
  }

  const extraNotices: ScoreNotice[] = [];

  if (nutritionScore === null) {
    extraNotices.push(
      result && !result.computable
        ? incompleteNutritionNotice(result.missing)
        : PARTIAL_NO_NUTRITION_NOTICE,
    );
  } else if (ingredientScore === null) {
    extraNotices.push(PARTIAL_NO_INGREDIENTS_NOTICE);
  }

  if (
    evaluation?.sugarOrigin?.determined &&
    evaluation.sugarOrigin.intrinsicShare >= MOSTLY_INTRINSIC_SHARE
  ) {
    extraNotices.push(
      mostlyIntrinsicSugarNotice(
        input.nutrition?.facts.sugars ?? null,
        (evaluation.components.find((c) => c.key === "sugars")?.points ?? 0) >=
          LARGE_SUGAR_POINTS,
      ),
    );
  }

  let afterCap = blended;
  let cappedFrom: number | null = null;

  if (nutritionScore === null && blended > PARTIAL_EVALUATION_SCORE_CAP) {
    afterCap = PARTIAL_EVALUATION_SCORE_CAP;
    cappedFrom = blended;
  }

  const alcoholCharge = alcoholDeduction(input.alcohol);

  const finalScore = Math.max(
    0,
    Math.min(100, afterCap - (alcoholCharge?.points ?? 0)),
  );

  const deductions = [...(ingredientScore?.deductions ?? [])];

  if (cappedFrom !== null) {
    deductions.unshift({
      code: "partial:no_nutrition_cap",
      points: cappedFrom - afterCap,
      title: "Χωρίς διατροφικά στοιχεία",
      explanation: `Χωρίς διατροφικά στοιχεία η βαθμολογία δεν μπορεί να ξεπεράσει το ${PARTIAL_EVALUATION_SCORE_CAP}/100.`,
      ingredientIds: [],
      evidenceRequired: false,
      evidenceAvailable: true,
    });
  }

  if (alcoholCharge) {
    deductions.unshift(alcoholCharge);
  }

  const existingCodes = new Set(notices.map((notice) => notice.code));

  return {
    score: finalScore,
    band: bandForScore(finalScore),
    deductions,
    bonuses: ingredientScore?.bonuses ?? [],
    confidence: ingredientScore?.confidence ?? 1,
    lowConfidenceReason: ingredientScore?.lowConfidenceReason ?? null,
    insufficientDataReasons: [],
    notices: [
      ...notices,
      ...extraNotices.filter((notice) => !existingCodes.has(notice.code)),
    ],
    scoringVersion,
    composition: {
      nutrition:
        nutritionScore !== null && evaluation
          ? {
              score: nutritionScore,
              weight: ingredientScore ? NUTRITION_WEIGHT : 1,
              grade: evaluation.grade,
              scoredGrade: evaluation.scoredGrade,
              source: evaluation.source,
            }
          : null,
      ingredients: ingredientScore
        ? {
            score: ingredientScore.score as number,
            weight: nutritionScore !== null ? INGREDIENTS_WEIGHT : 1,
          }
        : null,
      blended,
      cappedFrom,
      cap: nutritionScore === null ? PARTIAL_EVALUATION_SCORE_CAP : null,
    },
    nutritionEvaluation: evaluation && {
      ...evaluation,
      addedSugar: input.addedSugar ?? null,
    },
  };
}

/**
 * The score of a product known only from its nutrition table — shared by the
 * scan and the PIM recompute so the two cannot disagree.
 *
 * Graded evidence → the Nutri-Score alone, with a notice that there was no
 * ingredient list. Evidence too incomplete to grade → no number, and the
 * reason. No evidence at all → the table reader's own verdict, which says
 * whether a table was there and unreadable.
 */
export function scoreNutritionOnly(params: {
  evidence: NutritionEvidence | null;
  alcohol: AlcoholInfo | null;
  notices: ScoreNotice[];
  text: string;
  ocrConfidence: number;
  analysis: WorkerNutritionResult;
  extractionConfidence: number;
  /** An ingredient list found on the same photo, if any (not scored itself). */
  ingredientText?: string | null;
}): WorkerScore {
  const graded = evaluateNutrition(params.evidence, null).evaluation !== null;

  if (graded) {
    return scoreFood({
      ingredientScore: null,
      nutrition: params.evidence,
      nonNutritiveSweetener: null,
      ingredientText: params.ingredientText ?? null,
      alcohol: params.alcohol,
      notices: params.notices,
    });
  }

  if (params.evidence !== null) {
    return incompleteNutritionScore(
      params.evidence,
      noticesFor(params.notices, params.alcohol),
    );
  }

  return scoreNutrition(params.text, params.ocrConfidence, params.analysis, {
    extractionConfidence: params.extractionConfidence,
    alcohol: params.alcohol,
    notices: params.notices,
  });
}
