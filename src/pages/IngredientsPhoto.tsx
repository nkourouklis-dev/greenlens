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
    <main className="min-h-screen bg-slate-950 px-4 pb-24 pt-4 text-white">
      <section className="mx-auto max-w-md">
        <button
          type="button"
          onClick={() => navigate(-1)}
          disabled={isSaving}
          className="inline-flex min-h-10 items-center text-sm font-semibold text-emerald-400 disabled:opacity-50"
        >
          ← Πίσω
        </button>

        <div className="mt-2 flex gap-2">
          <div className="h-1.5 flex-1 rounded-full bg-emerald-500" />
          <div className="h-1.5 flex-1 rounded-full bg-slate-700" />
        </div>

        <div className="mt-4">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-400">
            Βήμα 1 από 2
          </p>

          <h1 className="mt-1 text-2xl font-bold">
            Φωτογράφισε τα συστατικά
          </h1>

          <p className="mt-1 text-sm leading-5 text-slate-300">
            Φέρε κοντά την ετικέτα και κράτησε
            καθαρό ολόκληρο το κείμενο.
          </p>
        </div>

        {barcode && (
          <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-900 px-3 py-2.5">
            <span className="text-xs text-slate-400">
              Barcode
            </span>

            <span className="min-w-0 break-all font-mono text-sm font-semibold text-slate-200">
              {barcode}
            </span>
          </div>
        )}

        <PhotoCapture
          inputId="ingredients-photo"
          title="Ετικέτα συστατικών"
          description="Γέμισε το κάδρο με τα συστατικά. Απόφυγε αντανακλάσεις και θολά σημεία."
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