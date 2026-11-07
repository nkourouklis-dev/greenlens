import { extractIngredientText } from "../../worker/ingredientText";
import { detectContentCategoryHeuristic } from "../../worker/contentCategory";
import { inspectNutritionPanel } from "../../worker/nutritionPanel";
import { splitIngredientNames } from "../../worker/deterministicAnalysis";
import type { ContentCategory } from "../types";

/**
 * The review screen's single verdict on a label reading. Exactly one state is
 * shown at a time, each with one obvious next step, instead of several
 * overlapping warnings that could contradict each other.
 *
 * - ready:       an ingredient list was found (with or without a table), or
 *                the content is a table / water analysis the user meant to
 *                scan. One tap to continue.
 * - incomplete:  a list was found but looks cut off. Continuing is allowed.
 * - table_only:  only a nutrition table, no ingredient list. The user picks:
 *                photograph the list, or score the table alone.
 * - nothing:     no list, no table, no analysis. Retake (or edit the text).
 */
export type ReviewStateKind = "ready" | "incomplete" | "table_only" | "nothing";

export interface ReviewState {
  kind: ReviewStateKind;
  /** What the photo holds, in Greek, for the status line. */
  found: string;
  /** One sentence telling the user what to do, or null when nothing is needed. */
  hint: string | null;
  canContinue: boolean;
  /** The ingredient block inside the text, for highlighting, or null. */
  ingredientBlock: string | null;
  hasTable: boolean;
  /** The category the analysis should be sent as when the user continues. */
  suggestedCategory: Exclude<ContentCategory, "unknown"> | undefined;
}

/** Fewer named items than this reads as a list cut off by the photo frame. */
const MIN_LIST_ITEMS = 3;

/** The reason extractIngredientText gives when it found a list heading. */
const HEADING_REASON = "Εντοπίστηκε heading συστατικών";

export function reviewState(input: {
  text: string;
  confidence: number;
  categoryOverride: ContentCategory | undefined;
  /** Adding the missing photo to a stored product: either half is fine. */
  isMerge: boolean;
}): ReviewState {
  const text = input.text.trim();

  const hasTable = text.length > 0 && inspectNutritionPanel(text).tableDetected;

  const extraction =
    text.length >= 12 ? extractIngredientText(text, input.confidence) : null;

  // Found under a printed "Συστατικά/Ingredients/INCI" heading, rather than
  // guessed from the shape of the text.
  const underHeading =
    extraction?.reasons.includes(HEADING_REASON) ?? false;

  const heuristic = text.length > 0
    ? detectContentCategoryHeuristic(text).category
    : "unknown";

  const candidateBlock =
    extraction?.isValid && extraction.ingredientText
      ? extraction.ingredientText
      : null;

  // Without a heading, a "list" is only believed when it has a few items and
  // the text is not plainly a water analysis: an address or a torn-off corner
  // of a table is not an ingredient list cut short.
  const ingredientBlock =
    candidateBlock &&
    (underHeading ||
      (heuristic !== "chemical_composition" &&
        splitIngredientNames(candidateBlock).length >= MIN_LIST_ITEMS))
      ? candidateBlock
      : null;

  const base = { ingredientBlock, hasTable };

  if (text.length === 0) {
    return {
      ...base,
      kind: "nothing",
      found: "Δεν διαβάστηκε κείμενο",
      hint: "Βγάλε ξανά φωτογραφία, πιο κοντά και με καλό φωτισμό.",
      canContinue: false,
      suggestedCategory: input.categoryOverride as ReviewState["suggestedCategory"],
    };
  }

  // A choice the user made, or a merge, is respected: the Worker has its own
  // validator for each category and will say so if the text does not fit.
  if (input.isMerge || (input.categoryOverride && input.categoryOverride !== "ingredients" && input.categoryOverride !== "unknown")) {
    return {
      ...base,
      kind: "ready",
      found: input.isMerge
        ? "Νέα φωτογραφία για το προϊόν"
        : input.categoryOverride === "nutrition"
          ? "Διατροφικός πίνακας"
          : "Χημική ανάλυση",
      hint: null,
      canContinue: true,
      suggestedCategory: input.isMerge
        ? undefined
        : (input.categoryOverride as ReviewState["suggestedCategory"]),
    };
  }

  if (ingredientBlock) {
    const items = splitIngredientNames(ingredientBlock).length;

    const found = hasTable
      ? "Βρέθηκαν λίστα συστατικών και διατροφικός πίνακας"
      : "Βρέθηκε λίστα συστατικών";

    if (items < MIN_LIST_ITEMS) {
      return {
        ...base,
        kind: "incomplete",
        found,
        hint: "Η λίστα φαίνεται κομμένη. Αν λείπουν συστατικά, βγάλε ξανά φωτογραφία ολόκληρη τη λίστα.",
        canContinue: true,
        suggestedCategory: "ingredients",
      };
    }

    return {
      ...base,
      kind: "ready",
      found,
      hint: null,
      canContinue: true,
      suggestedCategory: "ingredients",
    };
  }

  // The user insisted this is an ingredient list: let them fix the text.
  const userSaysIngredients = input.categoryOverride === "ingredients";

  if (hasTable || (heuristic === "nutrition" && !userSaysIngredients)) {
    return {
      ...base,
      kind: "table_only",
      found: "Βρέθηκε μόνο διατροφικός πίνακας",
      hint: "Για πλήρη αξιολόγηση φωτογράφισε και τη λίστα συστατικών. Μπορείς και να συνεχίσεις μόνο με τον πίνακα.",
      canContinue: !userSaysIngredients,
      suggestedCategory: "nutrition",
    };
  }

  if (heuristic === "chemical_composition" && !userSaysIngredients) {
    return {
      ...base,
      kind: "ready",
      found: "Βρέθηκε χημική ανάλυση (π.χ. νερού)",
      hint: null,
      canContinue: true,
      suggestedCategory: "chemical_composition",
    };
  }

  return {
    ...base,
    kind: "nothing",
    found: "Δεν βρέθηκε λίστα συστατικών ούτε πίνακας",
    hint: "Φωτογράφισε την περιοχή με την ένδειξη «Συστατικά», «Ingredients» ή «INCI». Αν το κείμενο είναι σωστό, διόρθωσέ το παρακάτω.",
    canContinue: false,
    suggestedCategory: undefined,
  };
}

/**
 * Splits `text` around the first occurrence of `block`, for highlighting the
 * detected ingredient list inside the full reading. Null when the block is
 * not a verbatim substring (the extractor may have tidied it).
 */
export function splitAroundBlock(
  text: string,
  block: string | null,
): { before: string; block: string; after: string } | null {
  if (!block) return null;

  const index = text.indexOf(block);

  if (index < 0) return null;

  return {
    before: text.slice(0, index),
    block,
    after: text.slice(index + block.length),
  };
}
