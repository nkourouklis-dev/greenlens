/**
 * Saying why a food scored what it did.
 *
 * The score is a blend of a Nutri-Score and an ingredient score, and the copy
 * beside it used to be written from the ingredient list alone — so Lurpak Soft
 * at 64 was "explained" by "Περιέχει βούτυρο", when the reason is 23 g of
 * saturated fat per 100 g. The reasons are built here, from the numbers the
 * score was computed from, never by a model: a caution a person can check
 * against the pack is the point. The model still writes the summary and the
 * highlights; it is only *told* these facts.
 */

import type { ExecutiveSummary } from "./ingredientInsights";
import type {
  FoodWorkerScore,
  NutritionEvaluation,
} from "./foodScore";
import type { NutriScoreComponent } from "./nutriScore";

/** Greek number: comma decimal, at most one decimal place. */
function formatNumber(value: number): string {
  return String(Math.round(value * 10) / 10).replace(".", ",");
}

/** kJ of energy per gram of saturated fat, as used by the fats table. */
const KJ_PER_GRAM_SATURATES = 37;

/**
 * The unfavourable Nutri-Score components worth telling a shopper about, with
 * the measured quantity — "Υψηλά κορεσμένα λιπαρά: 23 g ανά 100 g" — most
 * costly first, at most three. Components worth under two points are noise.
 *
 * In the fats category the energy from saturates and the saturates/fat ratio
 * are two views of one fact, so they are said once.
 */
function nutritionWatchOuts(evaluation: NutritionEvaluation): string[] {
  const negatives = evaluation.components.filter(
    (component) => component.side === "negative" && component.points >= 2,
  );

  const find = (key: NutriScoreComponent["key"]) =>
    negatives.find((component) => component.key === key);

  const lines: Array<{ points: number; text: string }> = [];

  const saturatesEnergy = find("energy_from_saturates");
  const ratio = find("saturates_ratio");

  if (saturatesEnergy && saturatesEnergy.value !== null) {
    const grams = saturatesEnergy.value / KJ_PER_GRAM_SATURATES;

    lines.push({
      points: saturatesEnergy.points + (ratio?.points ?? 0),
      text: `Υψηλά κορεσμένα λιπαρά: ${formatNumber(grams)} g ανά 100 g${
        ratio && ratio.value !== null
          ? ` (${formatNumber(ratio.value)}% των λιπαρών)`
          : ""
      }`,
    });
  } else if (ratio && ratio.value !== null) {
    lines.push({
      points: ratio.points,
      text: `Πολλά κορεσμένα ως προς τα λιπαρά: ${formatNumber(ratio.value)}%`,
    });
  }

  const measured: Array<[NutriScoreComponent["key"], string, string]> = [
    ["saturates", "Κορεσμένα λιπαρά", "g ανά 100 g"],
    ["sugars", "Σάκχαρα", "g ανά 100 g"],
    ["salt", "Αλάτι", "g ανά 100 g"],
    ["energy", "Ενέργεια", "kJ ανά 100 g"],
  ];

  for (const [key, label, unit] of measured) {
    const component = find(key);

    if (component && component.value !== null) {
      lines.push({
        points: component.points,
        text: `${label}: ${formatNumber(component.value)} ${unit}`,
      });
    }
  }

  const sweeteners = find("sweeteners");

  if (sweeteners) {
    lines.push({
      points: sweeteners.points,
      text: "Περιέχει γλυκαντικές ουσίες",
    });
  }

  return lines
    .sort((left, right) => right.points - left.points)
    .slice(0, 3)
    .map((line) => line.text);
}

export interface ScoreExplanation {
  /** One sentence that accounts for the number. */
  overallVerdict: string;
  /** Nutrition-driven cautions, most costly first. */
  watchOutFor: string[];
  /** The checkable facts in words, to hand to a prompt. */
  facts: string[];
}

function lowercaseFirst(text: string): string {
  return `${text.charAt(0).toLowerCase()}${text.slice(1)}`;
}

/**
 * Accounts for a food's score from how it was put together: which half pulled
 * it where, and what the cap or the alcohol took. Null for a score that was
 * not built by `scoreFood` (older rows), which keep the text they have.
 */
export function explainFoodScore(
  score: FoodWorkerScore,
): ScoreExplanation | null {
  const composition = score.composition;

  if (!composition || score.score === null) {
    return null;
  }

  const evaluation = score.nutritionEvaluation ?? null;

  const watchOutFor = evaluation ? nutritionWatchOuts(evaluation) : [];

  const weight = (value: number) => `${Math.round(value * 100)}%`;

  let parts: string;

  if (composition.nutrition && composition.ingredients) {
    parts = `Διατροφή Nutri-Score ${composition.nutrition.grade} (${composition.nutrition.score}/100, βάρος ${weight(composition.nutrition.weight)}) και συστατικά ${composition.ingredients.score}/100 (βάρος ${weight(composition.ingredients.weight)})`;
  } else if (composition.nutrition) {
    parts = `Μόνο η διατροφή, Nutri-Score ${composition.nutrition.grade} (${composition.nutrition.score}/100)`;
  } else {
    parts = `Μόνο τα συστατικά (${composition.ingredients?.score ?? 0}/100)· χωρίς διατροφικά στοιχεία η βαθμολογία δεν μπορεί να ξεπεράσει το ${composition.cap ?? ""}`;
  }

  const adjustments = score.deductions
    .filter(
      (deduction) =>
        deduction.code.startsWith("alcohol:") ||
        // The cap is already in the sentence when nutrition is missing.
        (deduction.code.startsWith("partial:") && composition.nutrition),
    )
    .map((deduction) => `${deduction.title} −${deduction.points}`);

  const reason =
    watchOutFor.length > 0
      ? ` Κύριος λόγος: ${lowercaseFirst(watchOutFor[0])}.`
      : "";

  const overallVerdict = `Βαθμολογείται με ${score.score}/100: ${parts}${
    adjustments.length > 0 ? `, ${adjustments.join(", ")}` : ""
  }.${reason}`;

  const facts = evaluation
    ? [
        `Nutri-Score ${evaluation.grade}`,
        ...watchOutFor,
        ...(evaluation.uncredited.length > 0
          ? [
              "Δεν δηλώνονται όλα τα θρεπτικά συστατικά· δεν προστέθηκαν βαθμοί για όσα λείπουν",
            ]
          : []),
      ]
    : ["Δεν υπάρχουν διατροφικά στοιχεία"];

  return { overallVerdict, watchOutFor, facts };
}

/**
 * An executive summary whose verdict and cautions say what actually decided
 * the score. The model's own cautions stay, after the nutrition ones, so a
 * genuine ingredient concern is not lost.
 */
export function withScoreExplanation(
  summary: ExecutiveSummary,
  score: FoodWorkerScore,
): ExecutiveSummary {
  const explanation = explainFoodScore(score);

  if (!explanation) {
    return summary;
  }

  return {
    ...summary,
    overallVerdict: explanation.overallVerdict,
    watchOutFor: Array.from(
      new Set([...explanation.watchOutFor, ...summary.watchOutFor]),
    ).slice(0, 4),
  };
}
