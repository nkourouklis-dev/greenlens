import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  ChevronDown,
  Info,
  Pencil,
} from "lucide-react";
import { updateHistoryItem } from "../services/historyService";
import {
  clearOcrDraft,
  getOcrDraft,
  updateOcrDraftCategoryOverride,
  updateOcrDraftText,
} from "../services/captureDraftService";
import { extractIngredientText } from "../../worker/ingredientText";
import { inspectNutritionPanel } from "../../worker/nutritionPanel";
import { detectProductType } from "../../worker/productType";
import {
  reviewState,
  splitAroundBlock,
  type ReviewStateKind,
} from "../utils/reviewState";
import PageHeader from "../components/PageHeader";
import type { ContentCategory } from "../types";

const categoryOptions: Array<{
  value: "auto" | Exclude<ContentCategory, "unknown">;
  label: string;
}> = [
  { value: "auto", label: "Αυτόματα (προτείνεται)" },
  { value: "ingredients", label: "Λίστα συστατικών" },
  { value: "nutrition", label: "Διατροφικός πίνακας" },
  { value: "chemical_composition", label: "Χημική ανάλυση (π.χ. νερό)" },
];

const stateStyle: Record<
  ReviewStateKind,
  { box: string; icon: typeof CheckCircle2; iconClass: string }
> = {
  ready: {
    box: "border-emerald-300/40 bg-emerald-950",
    icon: CheckCircle2,
    iconClass: "text-emerald-400",
  },
  incomplete: {
    box: "border-amber-300/40 bg-amber-950",
    icon: Info,
    iconClass: "text-amber-400",
  },
  table_only: {
    box: "border-amber-300/40 bg-amber-950",
    icon: Info,
    iconClass: "text-amber-400",
  },
  nothing: {
    box: "border-red-300/40 bg-red-950",
    icon: AlertTriangle,
    iconClass: "text-red-400",
  },
};

export default function IngredientsReview() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const draft = getOcrDraft(id);

  const [text, setText] = useState(() => {
    if (!draft) return "";

    // A photo that also carries the nutrition table keeps it: the table is
    // what the score's sugar and salt are judged from.
    if (inspectNutritionPanel(draft.result.rawText).tableDetected) {
      return draft.result.rawText;
    }

    const isolated = extractIngredientText(
      draft.result.rawText,
      draft.result.confidence,
    );

    return isolated.ingredientText?.trim() || draft.result.rawText;
  });

  const [categoryOverride, setCategoryOverride] = useState<
    ContentCategory | undefined
  >(() => draft?.categoryOverride);

  const [editing, setEditing] = useState(false);

  const state = useMemo(
    () =>
      reviewState({
        text,
        confidence: draft?.result.confidence ?? 0,
        categoryOverride,
        isMerge: draft?.mergeInto !== undefined,
      }),
    [text, draft?.result.confidence, draft?.mergeInto, categoryOverride],
  );

  // Something the user has to fix is shown in the editor straight away.
  const showEditor = editing || state.kind === "nothing";

  if (!draft) {
    return (
      <main className="bg-canvas px-4 text-ink">
        <PageHeader eyebrow="Ανάγνωση ετικέτας" title="Έλεγχος ετικέτας" />
        <section className="mx-auto flex max-w-md flex-col gap-3">
          <p className="text-sm text-ink-muted">
            Δεν βρέθηκε ανάγνωση ετικέτας. Ξεκίνα μια νέα σάρωση.
          </p>
          <button
            type="button"
            onClick={() => navigate("/scan")}
            className="mt-2 h-12 rounded-xl bg-accent font-bold text-on-accent"
          >
            Νέα σάρωση
          </button>
        </section>
      </main>
    );
  }

  const ocrDraft = draft;

  function selectCategory(value: "auto" | Exclude<ContentCategory, "unknown">) {
    const next = value === "auto" ? undefined : value;
    setCategoryOverride(next);
    updateOcrDraftCategoryOverride(id, next);
  }

  function retake() {
    clearOcrDraft(id);
    navigate(
      `/ingredients-photo?barcode=${encodeURIComponent(ocrDraft.barcode)}`,
    );
  }

  function confirm() {
    if (!state.canContinue) return;

    const finalText = text.trim();

    updateOcrDraftText(id, finalText);

    if (ocrDraft.mergeInto) {
      // No front photo to take: the product already has one. Straight to a
      // merged analysis of the existing product.
      const mergeInto = ocrDraft.mergeInto;

      updateHistoryItem(mergeInto, {
        ocrRawText: ocrDraft.result.rawText,
        userCorrectedText: finalText,
        ocrConfidence: ocrDraft.result.confidence,
        ocrLabelType: ocrDraft.result.labelType,
        categoryOverride: undefined,
        mergeWithStored: true,
      });

      clearOcrDraft(id);

      navigate(`/product/${encodeURIComponent(mergeInto)}/analysis`);

      return;
    }

    // What the screen said this photo is, is what the analysis is asked
    // for, so the result cannot disagree with the review.
    const category = categoryOverride ?? state.suggestedCategory;

    if (category !== categoryOverride) {
      updateOcrDraftCategoryOverride(id, category);
    }

    // The nutrition table is the next step unless this photo already holds
    // one, it is being scored as a table alone, or the product is not a food
    // at all: a cream or a water analysis has no table to photograph.
    const takesNoTable =
      category === "chemical_composition" ||
      category === "nutrition" ||
      detectProductType(finalText) === "cosmetic";

    const next =
      state.hasTable || takesNoTable ? "/product-photo" : "/nutrition-photo";

    navigate(
      `${next}?barcode=${encodeURIComponent(
        ocrDraft.barcode,
      )}&productId=${encodeURIComponent(id)}`,
    );
  }

  const style = stateStyle[state.kind];
  const StateIcon = style.icon;
  const highlighted = splitAroundBlock(text, state.ingredientBlock);
  const asksForRetake = state.kind === "table_only" || state.kind === "nothing";

  return (
    <main className="bg-canvas px-4 text-ink">
      <PageHeader eyebrow="Ανάγνωση ετικέτας" title="Έλεγχος κειμένου" />

      <section className="mx-auto flex max-w-md flex-col gap-4">
        <img
          src={ocrDraft.image}
          alt="Η φωτογραφία της ετικέτας"
          className="max-h-[32dvh] w-full rounded-2xl border border-line bg-surface object-contain"
        />

        <div
          className={`flex gap-3 rounded-2xl border p-4 ${style.box}`}
          role="status"
          aria-live="polite"
        >
          <StateIcon
            size={22}
            className={`mt-0.5 shrink-0 ${style.iconClass}`}
            aria-hidden
          />
          <div className="min-w-0">
            <p className="font-semibold text-ink">{state.found}</p>
            {state.hint && (
              <p className="mt-1 text-sm leading-5 text-ink-muted">
                {state.hint}
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          {asksForRetake ? (
            <>
              <button
                type="button"
                onClick={retake}
                className="flex h-12 items-center justify-center gap-2 rounded-xl bg-accent font-bold text-on-accent"
              >
                <Camera size={18} aria-hidden />
                {state.kind === "table_only"
                  ? "Φωτογράφισε τα συστατικά"
                  : "Νέα φωτογραφία"}
              </button>
              {state.canContinue && (
                <button
                  type="button"
                  onClick={confirm}
                  className="h-12 rounded-xl border border-line bg-surface font-semibold text-ink"
                >
                  {state.kind === "table_only"
                    ? "Συνέχεια μόνο με τον πίνακα"
                    : "Συνέχεια"}
                </button>
              )}
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={confirm}
                className="h-12 rounded-xl bg-accent font-bold text-on-accent"
              >
                Συνέχεια
              </button>
              <button
                type="button"
                onClick={retake}
                className="flex h-12 items-center justify-center gap-2 rounded-xl border border-line bg-surface font-semibold text-ink-muted"
              >
                <Camera size={18} aria-hidden />
                Νέα φωτογραφία
              </button>
            </>
          )}
        </div>

        <section
          aria-labelledby="ocr-text-title"
          className="rounded-2xl border border-line bg-surface"
        >
          <div className="flex items-center justify-between gap-2 px-4 pt-2">
            <h2 id="ocr-text-title" className="py-2 text-sm font-semibold text-ink">
              Κείμενο που διαβάστηκε
            </h2>
            {!showEditor && (
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="flex h-11 items-center gap-1.5 rounded-lg px-2 text-sm font-semibold text-accent-soft"
              >
                <Pencil size={16} aria-hidden />
                Διόρθωση
              </button>
            )}
          </div>

          {showEditor ? (
            <div className="px-4 pb-4">
              <label htmlFor="ocr-text" className="sr-only">
                Κείμενο ετικέτας
              </label>
              {/* 16px text: iOS zooms the page into any smaller input. */}
              <textarea
                id="ocr-text"
                value={text}
                onChange={(event) => setText(event.target.value)}
                className="min-h-40 w-full rounded-xl border border-line bg-canvas p-3 text-base leading-6 text-ink"
                placeholder="Κείμενο από την ετικέτα..."
              />
              <p className="mt-1 text-xs text-ink-faint">
                Αυτό ακριβώς το κείμενο θα αναλυθεί.
              </p>
            </div>
          ) : (
            <p className="max-h-64 overflow-y-auto whitespace-pre-wrap break-words px-4 pb-4 text-sm leading-6 text-ink-muted">
              {highlighted ? (
                <>
                  {highlighted.before}
                  <mark className="rounded bg-emerald-950 px-0.5 text-ink ring-1 ring-emerald-300/40">
                    {highlighted.block}
                  </mark>
                  {highlighted.after}
                </>
              ) : (
                text
              )}
            </p>
          )}
          {highlighted && !showEditor && (
            <p className="border-t border-line-subtle px-4 py-2 text-xs text-ink-faint">
              Με πράσινο: η λίστα συστατικών που θα αναλυθεί.
            </p>
          )}
        </section>

        {ocrDraft.mergeInto === undefined && (
          <details className="group rounded-2xl border border-line bg-surface">
            <summary className="flex h-12 cursor-pointer list-none items-center justify-between px-4 text-sm font-semibold text-ink">
              Τύπος περιεχομένου
              <ChevronDown
                size={18}
                className="transition group-open:rotate-180"
                aria-hidden
              />
            </summary>
            <div className="px-4 pb-4">
              <label htmlFor="category-override" className="sr-only">
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
                className="h-12 w-full rounded-xl border border-line bg-canvas px-3 text-base text-ink"
              >
                {categoryOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <p className="mt-2 text-xs leading-5 text-ink-faint">
                Άλλαξέ το μόνο αν ο αυτόματος εντοπισμός έκανε λάθος. Μια
                ετικέτα με λίστα και πίνακα αξιολογείται ολόκληρη ως «Λίστα
                συστατικών».
              </p>
            </div>
          </details>
        )}
      </section>
    </main>
  );
}
