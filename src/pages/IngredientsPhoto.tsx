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

      saveOcrDraft(productId, {
        barcode,
        image: storageImage,
        result,
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
    <main className="bg-slate-950 px-4 py-4 pb-20 text-white">
      <section className="mx-auto flex max-w-md flex-col gap-3">
        <button
          type="button"
          onClick={() => navigate(-1)}
          disabled={isSaving}
          className="inline-flex h-9 items-center text-xs font-semibold text-emerald-400 disabled:opacity-50"
        >
          ← Πίσω
        </button>

        <div className="flex gap-1.5">
          <div className="h-1.5 flex-1 rounded-full bg-emerald-500" />
          <div className="h-1.5 flex-1 rounded-full bg-slate-700" />
        </div>

        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-400">
            Βήμα 1 από 2
          </p>

          <h1 className="mt-1 text-2xl font-bold">
            Συστατικά
          </h1>

          <p className="mt-1 text-xs leading-5 text-slate-300">
            Φέρε κοντά την ετικέτα με καθαρό κείμενο.
          </p>
        </div>

        {barcode && (
          <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-900 px-2.5 py-2">
            <span className="text-xs text-slate-400">
              Barcode
            </span>

            <span className="min-w-0 break-all font-mono text-xs font-semibold text-slate-200">
              {barcode}
            </span>
          </div>
        )}

        <PhotoCapture
          inputId="ingredients-photo"
          title="Ετικέτα συστατικών"
          description="Γέμισε το κάδρο με τα συστατικά."
          actionLabel="Διάβασμα ετικέτας"
          onContinue={readIngredients}
          isSaving={isSaving}
          error={error}
        />
      </section>
    </main>
  );
}
``