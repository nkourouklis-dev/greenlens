import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  clearOcrDraft,
  getOcrDraft,
  updateOcrDraftCategoryOverride,
  updateOcrDraftText,
} from "../services/captureDraftService";
import { extractIngredientText } from "../../worker/ingredientText";
import { detectContentCategoryHeuristic } from "../../worker/contentCategory";
import type { ContentCategory } from "../types";

const categoryOptions: Array<{
  value: "auto" | Exclude<ContentCategory, "unknown">;
  label: string;
}> = [
  { value: "auto", label: "Αυτόματος εντοπισμός (προτεινόμενο)" },
  { value: "ingredients", label: "Συστατικά" },
  { value: "nutrition", label: "Διατροφικά" },
  { value: "chemical_composition", label: "Χημική Ανάλυση" },
];

// Reasons that describe extra noise on the label (manufacturer, website,
// storage advice) are shown as a quiet notice: the analysis strips them
// anyway. Everything else is surfaced as a warning (blockingReason below),
// but never disables the Continue button — see canContinue.
const informationalPatterns = [
  "κατασκευαστ",
  "ιστοσελίδ",
  "ιστοσελιδ",
  "website",
  "manufacturer",
  "distributor",
  "αποθήκευσ",
  "αποθηκευσ",
  "storage",
  "heading",
];

function isInformationalReason(
  reason: string,
): boolean {
  const normalized = reason.toLowerCase();

  return informationalPatterns.some((pattern) =>
    normalized.includes(pattern),
  );
}

type TextQuality = {
  canContinue: boolean;
  blockingReason: string | null;
  notice: string | null;
};

// Single source of truth: the same deterministic validator the Worker uses.
// No parallel heuristics, so the review step can never disagree with the
// analysis step.
function reviewTextQuality(
  text: string,
  confidence: number,
): TextQuality {
  const trimmed = text.trim();

  if (trimmed.length < 12) {
    return {
      canContinue: false,
      blockingReason:
        "Πάρα πολύ σύντομο κείμενο. Χρειάζεται ολόκληρη η λίστα συστατικών.",
      notice: null,
    };
  }

  const extraction = extractIngredientText(
    trimmed,
    confidence,
  );

  const reasons = Array.isArray(extraction.reasons)
    ? extraction.reasons
    : [];

  const blocking = reasons.filter(
    (reason) => !isInformationalReason(reason),
  );

  const informational = reasons.filter(
    isInformationalReason,
  );

  if (!extraction.isValid && blocking.length > 0) {
    return {
      canContinue: false,
      blockingReason: blocking[0],
      notice: null,
    };
  }

  return {
    canContinue: true,
    blockingReason: null,
    notice:
      informational.length > 0
        ? "Βρέθηκαν και στοιχεία εκτός λίστας συστατικών (π.χ. κατασκευαστής ή οδηγίες). Θα αγνοηθούν κατά την ανάλυση."
        : null,
  };
}

export default function IngredientsReview() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const draft = getOcrDraft(id);

  const [text, setText] = useState(() => {
    if (!draft) return "";

    const isolated = extractIngredientText(
      draft.result.rawText,
      draft.result.confidence,
    );

    return (
      isolated.ingredientText?.trim() ||
      draft.result.rawText
    );
  });

  const textQuality = useMemo(
    () =>
      reviewTextQuality(
        text,
        draft?.result.confidence ?? 0,
      ),
    [text, draft?.result.confidence],
  );

  const detectedCategory = useMemo(
    () => detectContentCategoryHeuristic(text).category,
    [text],
  );

  const [categoryOverride, setCategoryOverride] = useState<
    ContentCategory | undefined
  >(() => draft?.categoryOverride);

  function selectCategory(
    value: "auto" | Exclude<ContentCategory, "unknown">,
  ) {
    const next = value === "auto" ? undefined : value;
    setCategoryOverride(next);
    updateOcrDraftCategoryOverride(id, next);
  }

  if (!draft) {
    return (
      <main className="bg-canvas px-4 py-6 text-ink">
        <section className="mx-auto max-w-md flex flex-col gap-3">
          <h1 className="text-2xl font-bold">
            Έλεγχος ετικέτας
          </h1>
          <p className="text-sm text-ink-muted">
            Δεν βρέθηκε ανάγνωση ετικέτας.
          </p>
          <button
            type="button"
            onClick={() => navigate("/scan")}
            className="mt-2 h-11 rounded-lg bg-accent font-bold text-on-accent"
          >
            Νέα σάρωση
          </button>
        </section>
      </main>
    );
  }

  const ocrDraft = draft;

  // A pure nutrition reading only triggers an informational notice below —
  // it never blocks the flow (see canContinue).
  const nutritionOnly =
    ocrDraft.result.labelType === "nutrition";

  // Quality checks are informational only — they never block the flow.
  // The user can always continue with whatever text is present (raw OCR
  // fallback included) and correct it manually if needed.
  const canContinue = text.trim().length > 0;

  // The model's own labelType disagrees with the deterministic check: it
  // thought this was an ingredient label, but extractIngredientText rejected
  // the text. Surface that mismatch as a notice so the user understands why
  // the reading looks uncertain, even though they can still continue.
  const modelBelievedIngredients =
    !textQuality.canContinue &&
    (ocrDraft.result.labelType === "ingredients" ||
      ocrDraft.result.labelType === "mixed");

  // The OCR confidence score only measures how well the model read the
  // pixels, not whether it read an actual ingredient list. Only pair it
  // with a "Λίστα συστατικών" label once the deterministic validator has
  // confirmed the text really is one — otherwise a high OCR confidence on,
  // say, a front-of-pack photo would read as "we found the ingredients"
  // when nothing of the sort happened.
  const confirmedIngredientList =
    textQuality.canContinue && !nutritionOnly;

  // The ingredients-specific quality checks below (extractIngredientText)
  // only make sense when the user actually intends this to be an
  // ingredient list. Once they've manually picked nutrition/chemical
  // composition, showing "no ingredient list found" would just be
  // confusing noise — the Worker's own category-specific validator is the
  // real gate for those paths.
  const isIngredientsIntent =
    !categoryOverride || categoryOverride === "ingredients";

  function retake() {
    clearOcrDraft(id);
    navigate(
      `/ingredients-photo?barcode=${encodeURIComponent(
        ocrDraft.barcode,
      )}`,
    );
  }

  function confirm() {
    if (!canContinue) return;

    updateOcrDraftText(id, text.trim());

    navigate(
      `/product-photo?barcode=${encodeURIComponent(
        ocrDraft.barcode,
      )}&productId=${encodeURIComponent(id)}`,
    );
  }

  const label =
    ocrDraft.result.labelType === "ingredients"
      ? "Λίστα συστατικών"
      : ocrDraft.result.labelType === "nutrition"
        ? "Διατροφικός πίνακας"
        : ocrDraft.result.labelType === "mixed"
          ? "Μικτή ετικέτα"
          : "Άγνωστος τύπος";

  return (
    <main className="bg-canvas px-4 py-4 pb-20 text-ink">
      <section className="mx-auto flex max-w-md flex-col gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-accent-strong">
            Ανάγνωση ετικέτας
          </p>
          <h1 className="mt-1 text-2xl font-bold">
            Έλεγχος κειμένου
          </h1>
        </div>

        <img
          src={ocrDraft.image}
          alt="Φωτογραφία ετικέτας συστατικών"
          className="max-h-[40vh] w-full rounded-2xl border border-line object-contain"
        />

        {isIngredientsIntent && (confirmedIngredientList ? (
          <div className="flex items-center justify-between gap-2 rounded-lg border border-line bg-surface p-3">
            <span className="text-sm font-semibold text-ink">
              {label}
            </span>
            <span className="text-sm font-bold text-accent-soft">
              {Math.round(ocrDraft.result.confidence * 100)}
              %
            </span>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2 rounded-lg border border-line bg-surface p-3">
            <span className="text-sm font-semibold text-ink-muted">
              Κείμενο εντοπίστηκε, αλλά δεν μοιάζει
              με λίστα συστατικών
            </span>
          </div>
        ))}

        {isIngredientsIntent && nutritionOnly && (
          <p className="rounded-lg border border-amber-400/40 bg-amber-400/10 p-2.5 text-xs text-amber-50">
            Εντοπίστηκε διατροφικός πίνακας, όχι
            λίστα συστατικών. Φωτογραφίστε την
            περιοχή μετά τη λέξη «Συστατικά».
          </p>
        )}

        {isIngredientsIntent && ocrDraft.result.labelType === "mixed" && (
          <p className="rounded-lg border border-amber-400/40 bg-amber-400/10 p-2.5 text-xs text-amber-50">
            Ελέγξτε ότι το κείμενο περιλαμβάνει
            ολόκληρη τη λίστα συστατικών.
          </p>
        )}

        {isIngredientsIntent && textQuality.notice && (
          <p
            className="rounded-lg border border-line bg-surface p-2.5 text-xs text-ink-muted"
            aria-live="polite"
          >
            {textQuality.notice}
          </p>
        )}

        {isIngredientsIntent && textQuality.blockingReason && (
          <div
            className="rounded-lg border border-red-400/40 bg-red-400/10 p-2.5 text-xs text-red-50"
            role="alert"
            aria-live="polite"
          >
            <p>
              Δεν εντοπίστηκε λίστα συστατικών.
              Φωτογραφίστε την περιοχή με την ένδειξη
              «Συστατικά» / «Ingredients» / «INCI».
            </p>

            <details className="mt-1.5">
              <summary className="cursor-pointer text-[11px] text-red-100/70">
                Λεπτομέρειες
              </summary>
              <div className="mt-1 space-y-1 text-[11px] leading-4 text-red-100/70">
                {modelBelievedIngredients && (
                  <p>
                    Το αρχικό μοντέλο ανάγνωσης
                    πίστεψε ότι βρήκε λίστα
                    συστατικών, αλλά ο λεπτομερής
                    έλεγχος δεν εντόπισε πραγματικά
                    συστατικά σε αυτό το κείμενο.
                  </p>
                )}
                <p>Λόγος: {textQuality.blockingReason}</p>
              </div>
            </details>
          </div>
        )}

        <div>
          <label
            htmlFor="ocr-text"
            className="block text-xs font-semibold uppercase tracking-wide text-ink-faint"
          >
            Κείμενο ετικέτας
          </label>
          <textarea
            id="ocr-text"
            value={text}
            onChange={(event) => setText(event.target.value)}
            className="mt-2 min-h-32 w-full rounded-lg border border-line bg-surface p-3 text-sm leading-5 text-ink"
            placeholder="Κείμενο από ετικέτα..."
          />
          <p className="mt-1 text-xs text-ink-faintest">
            Μπορείτε να διορθώσετε το κείμενο πριν
            συνεχίσετε. Αυτό ακριβώς το κείμενο θα
            αναλυθεί.
          </p>
        </div>

        {ocrDraft.result.unreadableSegments.length > 0 && (
          <p className="text-xs text-ink-faint">
            Μη αναγνώσιμα: {ocrDraft.result.unreadableSegments.join(", ")}
          </p>
        )}

        <div>
          <label
            htmlFor="category-override"
            className="block text-xs font-semibold uppercase tracking-wide text-ink-faint"
          >
            Τύπος περιεχομένου
          </label>
          <select
            id="category-override"
            value={categoryOverride ?? "auto"}
            onChange={(event) =>
              selectCategory(
                event.target.value as
                  | "auto"
                  | Exclude<ContentCategory, "unknown">,
              )
            }
            className="mt-2 h-11 w-full rounded-lg border border-line bg-surface px-3 text-sm text-ink"
          >
            {categoryOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          {!categoryOverride && detectedCategory !== "unknown" && (
            <p className="mt-1 text-xs text-ink-faintest">
              Εντοπίστηκε αυτόματα ως:{" "}
              {detectedCategory === "ingredients"
                ? "Συστατικά"
                : detectedCategory === "nutrition"
                  ? "Διατροφικά"
                  : "Χημική Ανάλυση"}
              . Αν δεν είναι σωστό, διόρθωσέ το παραπάνω.
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={confirm}
            disabled={!canContinue}
            className="h-11 rounded-lg bg-accent font-bold text-on-accent disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-ink-faint"
            aria-live="polite"
          >
            Συνέχεια
          </button>
          <button
            type="button"
            onClick={retake}
            className="h-11 rounded-lg border border-line font-semibold text-ink-muted"
          >
            Λήψη ξανά
          </button>
        </div>
      </section>
    </main>
  );
}
