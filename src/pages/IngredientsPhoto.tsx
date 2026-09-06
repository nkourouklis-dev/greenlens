import { useState } from "react";
import {
  useNavigate,
  useSearchParams,
} from "react-router-dom";
import PhotoCapture from "../components/PhotoCapture";
import {
  saveIngredientsDraft,
  saveOcrDraft,
} from "../services/captureDraftService";
import {
  compressImageForStorage,
  prepareImageForOcr,
} from "../services/historyService";
import { extractOcr } from "../services/ocrClient";
import { extractIngredientText } from "../../worker/ingredientText";

export default function IngredientsPhoto() {
  const [searchParams] =
    useSearchParams();

  const navigate = useNavigate();

  const barcode =
    searchParams.get("barcode") ?? "";

  const [error, setError] =
    useState("");

  const [isSaving, setIsSaving] =
    useState(false);

  async function readIngredients(
    file: File,
  ) {
    setError("");
    setIsSaving(true);

    try {
      const productId =
        crypto.randomUUID();

      const [
        storageImage,
        ocrImage,
      ] = await Promise.all([
        compressImageForStorage(file),
        prepareImageForOcr(file),
      ]);

      saveIngredientsDraft(
        barcode,
        storageImage,
      );

      const result = await extractOcr(
        ocrImage,
        barcode,
        productId,
      );

      const extracted = extractIngredientText(
        result.rawText,
        result.confidence,
      );

      saveOcrDraft(productId, {
        barcode,
        image: storageImage,
        result: {
          ...result,
          rawText:
            extracted.ingredientText &&
            extracted.isValid
              ? extracted.ingredientText
              : result.rawText,
        },
      });

      navigate(
        `/ingredients-review/${productId}`,
      );
    } catch (readError) {
      setError(
        readError instanceof Error
          ? readError.message
          : "Δεν ήταν δυνατή η ανάγνωση της ετικέτας.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <main className="bg-canvas px-4 py-4 pb-20 text-ink">
      <section className="mx-auto flex max-w-md flex-col gap-3">
        <button
          type="button"
          onClick={() => navigate(-1)}
          disabled={isSaving}
          className="inline-flex h-9 items-center text-xs font-semibold text-accent-strong disabled:opacity-50"
        >
          ← Πίσω
        </button>

        <div className="flex gap-1.5">
          <div className="h-1.5 flex-1 rounded-full bg-accent" />
          <div className="h-1.5 flex-1 rounded-full bg-surface-muted" />
        </div>

        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-accent-strong">
            Βήμα 1 από 2
          </p>

          <h1 className="mt-1 text-2xl font-bold">
            Συστατικά
          </h1>

          <p className="mt-1 text-xs leading-5 text-ink-muted">
            Φέρε κοντά την ετικέτα με καθαρό κείμενο.
          </p>
        </div>

        {barcode && (
          <div className="flex items-center justify-between gap-2 rounded-lg border border-line-subtle bg-surface px-2.5 py-2">
            <span className="text-xs text-ink-faint">
              Barcode
            </span>

            <span className="min-w-0 break-all font-mono text-xs font-semibold text-ink-muted">
              {barcode}
            </span>
          </div>
        )}

        <PhotoCapture
          title="Ετικέτα συστατικών"
          description='Βεβαιωθείτε ότι φαίνεται η λίστα συστατικών (μετά τη λέξη «Συστατικά» / «Ingredients» / «INCI»), όχι οδηγίες χρήσης.'
          actionLabel="Διάβασμα ετικέτας"
          onContinue={readIngredients}
          isSaving={isSaving}
          error={error}
        />
      </section>
    </main>
  );
}