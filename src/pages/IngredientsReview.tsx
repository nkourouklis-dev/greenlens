import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  clearOcrDraft,
  getOcrDraft,
  updateOcrDraftText,
} from "../services/captureDraftService";
import { extractIngredientText } from "../../worker/ingredientText";

function checkIngredientTextQuality(
  text: string,
): {
  isValid: boolean;
  warning: string | null;
} {
  const normalized = text.toLowerCase();

  // Check for URLs
  if (
  normalized.includes("http://") ||
  normalized.includes("https://") ||
  normalized.includes("www.") ||
  normalized.includes(".com") ||
  normalized.includes(".gr") ||
  normalized.includes(".eu") ||
  normalized.includes("@")
) {
  return {
    isValid: true,
    warning:
      "Βρέθηκαν επίσης στοιχεία κατασκευαστή ή ιστοσελίδας. Θα αγνοηθούν κατά την ανάλυση.",
  };
}

  // Check for single word
  const words = text.trim().split(/\s+/);
  if (words.length < 3) {
    return {
      isValid: false,
      warning:
        "Πάρα πολύ σύντομο κείμενο. Πρέπει να περιέχει τουλάχιστον μια λίστα συστατικών.",
    };
  }

  // Check for marketing claims
  if (
    (normalized.includes("suitable for") ||
      normalized.includes("low sodium")) &&
    !normalized.includes("water") &&
    !normalized.includes("νερό") &&
    !normalized.includes("glycerin") &&
    !normalized.includes("γλυκερίνη")
  ) {
    return {
      isValid: false,
      warning:
        "Φαίνεται ότι πρόκειται για διατροφικές ισχυρισμούς, όχι συστατικά.",
    };
  }

  // Check for storage/directions dominance
  if (
    (normalized.includes("cool place") ||
      normalized.includes("store in") ||
      normalized.includes("keep in") ||
      normalized.includes("δροσερό") ||
      normalized.includes("αποθηκεύστε")) &&
    !normalized.includes(",") &&
    !normalized.includes(";")
  ) {
    return {
      isValid: false,
      warning:
        "Φαίνεται ότι πρόκειται για οδηγίες αποθήκευσης, όχι λίστα συστατικών.",
    };
  }

  // Check for minimum ingredient-like content
  const hasIngredientsMarkers =
    normalized.includes("water") ||
    normalized.includes("νερό") ||
    normalized.includes("glycerin") ||
    normalized.includes("γλυκερίνη") ||
    normalized.includes("alcohol") ||
    normalized.includes("αλκοόλ") ||
    normalized.includes("oil") ||
    normalized.includes("έλαιο") ||
    normalized.includes("sugar") ||
    normalized.includes("ζάχαρη") ||
    normalized.includes("salt") ||
    normalized.includes("αλάτι") ||
    normalized.includes("acid") ||
    normalized.includes("οξύ");

  if (!hasIngredientsMarkers && words.length < 8) {
    return {
      isValid: false,
      warning:
        "Δεν υπάρχουν σαφή σημάδια συστατικών. Ελέγξτε ότι είναι ορατή η λίστα συστατικών.",
    };
  }

  return { isValid: true, warning: null };
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
    return isolated.ingredientText ?? draft.result.rawText;
  });
  const textQuality = checkIngredientTextQuality(text);

  if (!draft) {
    return (
      <main className="bg-slate-950 px-4 py-6 text-white">
        <section className="mx-auto max-w-md flex flex-col gap-3">
          <h1 className="text-2xl font-bold">
            Έλεγχος ετικέτας
          </h1>
          <p className="text-sm text-slate-300">
            Δεν βρέθηκε ανάγνωση ετικέτας.
          </p>
          <button
            type="button"
            onClick={() => navigate("/scan")}
            className="mt-2 h-11 rounded-lg bg-emerald-500 font-bold text-slate-950"
          >
            Νέα σάρωση
          </button>
        </section>
      </main>
    );
  }

  const ocrDraft = draft;
  const nutritionOnly =
    ocrDraft.result.labelType === "nutrition";
  const insufficient =
    ocrDraft.result.labelType === "unknown" ||
    text.trim().length < 12;

  function retake() {
    clearOcrDraft(id);
    navigate(
      `/ingredients-photo?barcode=${encodeURIComponent(
        ocrDraft.barcode,
      )}`,
    );
  }

  function confirm() {
    if (!text.trim() || nutritionOnly) return;
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
    <main className="bg-slate-950 px-4 py-4 pb-20 text-white">
      <section className="mx-auto flex max-w-md flex-col gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-emerald-400">
            Ανάγνωση ετικέτας
          </p>
          <h1 className="mt-1 text-2xl font-bold">
            Έλεγχος κειμένου
          </h1>
        </div>

        <img
          src={ocrDraft.image}
          alt="Φωτογραφία ετικέτας συστατικών"
          className="max-h-[40vh] w-full rounded-2xl border border-slate-700 object-contain"
        />

        <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-700 bg-slate-900 p-3">
          <span className="text-sm font-semibold">
            {label}
          </span>
          <span className="text-sm font-bold text-emerald-300">
            {Math.round(ocrDraft.result.confidence * 100)}
            %
          </span>
        </div>

        {nutritionOnly && (
          <p className="rounded-lg border border-amber-400/40 bg-amber-400/10 p-2.5 text-xs text-amber-50">
            Εντοπίστηκε διατροφικός πίνακας, όχι
            λίστα συστατικών.
          </p>
        )}

        {ocrDraft.result.labelType === "mixed" && (
          <p className="rounded-lg border border-amber-400/40 bg-amber-400/10 p-2.5 text-xs text-amber-50">
            Ελέγξτε ότι το κείμενο περιλαμβάνει
            ολόκληρη τη λίστα συστατικών.
          </p>
        )}

        {insufficient && (
          <p className="rounded-lg border border-slate-700 bg-slate-900 p-2.5 text-xs text-slate-200">
            Δεν υπάρχουν αρκετά στοιχεία για
            αξιόπιστη ανάλυση.
          </p>
        )}

        {textQuality.warning && (
          <p
            className="rounded-lg border border-red-400/40 bg-red-400/10 p-2.5 text-xs text-red-50"
            aria-live="polite"
          >
            {textQuality.warning}
          </p>
        )}

        <div>
          <label
            htmlFor="ocr-text"
            className="block text-xs font-semibold uppercase tracking-wide text-slate-400"
          >
            Κείμενο ετικέτας
          </label>
          <textarea
            id="ocr-text"
            value={text}
            onChange={(event) => setText(event.target.value)}
            className="mt-2 min-h-32 w-full rounded-lg border border-slate-700 bg-slate-900 p-3 text-sm leading-5"
            placeholder="Κείμενο από ετικέτα..."
          />
        </div>

        {ocrDraft.result.unreadableSegments.length > 0 && (
          <p className="text-xs text-slate-400">
            Μη αναγνώσιμα: {ocrDraft.result.unreadableSegments.join(", ")}
          </p>
        )}

        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={confirm}
            disabled={!text.trim() || nutritionOnly}
            className="h-11 rounded-lg bg-emerald-500 font-bold text-slate-950 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
            aria-live="polite"
          >
            Συνέχεια
          </button>
          <button
            type="button"
            onClick={retake}
            className="h-11 rounded-lg border border-slate-600 font-semibold text-slate-100"
          >
            Λήψη ξανά
          </button>
        </div>
      </section>
    </main>
  );
}