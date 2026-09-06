import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  clearOcrDraft,
  getOcrDraft,
  updateOcrDraftText,
} from "../services/captureDraftService";
import { extractIngredientText } from "../../worker/ingredientText";

// Reasons that describe extra noise on the label (manufacturer, website,
// storage advice) are informational: the analysis strips them anyway.
// Everything else blocks the flow.
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

  // Only a pure nutrition reading blocks the flow. A mixed label still
  // contains the ingredient list, so the user can correct and continue.
  const nutritionOnly =
    ocrDraft.result.labelType === "nutrition";

  const canContinue =
    !nutritionOnly &&
    textQuality.canContinue &&
    text.trim().length > 0;

  // The model's own labelType disagrees with the deterministic check: it
  // thought this was an ingredient label, but extractIngredientText rejected
  // the text. Surface that mismatch so the user understands why a label
  // that "looks right" still got blocked.
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

        {confirmedIngredientList ? (
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
        )}

        {nutritionOnly && (
          <p className="rounded-lg border border-amber-400/40 bg-amber-400/10 p-2.5 text-xs text-amber-50">
            Εντοπίστηκε διατροφικός πίνακας, όχι
            λίστα συστατικών. Φωτογραφίστε την
            περιοχή μετά τη λέξη «Συστατικά».
          </p>
        )}

        {ocrDraft.result.labelType === "mixed" && (
          <p className="rounded-lg border border-amber-400/40 bg-amber-400/10 p-2.5 text-xs text-amber-50">
            Ελέγξτε ότι το κείμενο περιλαμβάνει
            ολόκληρη τη λίστα συστατικών.
          </p>
        )}

        {textQuality.notice && (
          <p
            className="rounded-lg border border-line bg-surface p-2.5 text-xs text-ink-muted"
            aria-live="polite"
          >
            {textQuality.notice}
          </p>
        )}

        {modelBelievedIngredients && (
          <p
            className="rounded-lg border border-amber-400/40 bg-amber-400/10 p-2.5 text-xs text-amber-50"
            role="alert"
            aria-live="polite"
          >
            Το αρχικό μοντέλο ανάγνωσης πίστεψε ότι
            βρήκε λίστα συστατικών, αλλά ο
            λεπτομερής έλεγχος δεν εντόπισε
            πραγματικά συστατικά σε αυτό το κείμενο.
            Πιθανόν φωτογραφίσατε λάθος πλευρά της
            συσκευασίας. Φωτογραφίστε την περιοχή με
            την ένδειξη «Συστατικά», «Ingredients» ή
            «INCI».
          </p>
        )}

        {textQuality.blockingReason && (
          <p
            className="rounded-lg border border-red-400/40 bg-red-400/10 p-2.5 text-xs text-red-50"
            role="alert"
            aria-live="polite"
          >
            {textQuality.blockingReason}
          </p>
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
