import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import PhotoCapture from "../components/PhotoCapture";
import { saveIngredientsDraft } from "../services/captureDraftService";
import { compressImageForStorage } from "../services/historyService";

export default function IngredientsPhoto() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const barcode = searchParams.get("barcode") ?? "";
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  async function continueToProductPhoto(file: File) {
    setError("");
    setIsSaving(true);
    try {
      saveIngredientsDraft(barcode, await compressImageForStorage(file));
      navigate(`/product-photo?barcode=${encodeURIComponent(barcode)}`);
    } catch {
      setError("Δεν ήταν δυνατή η προετοιμασία της φωτογραφίας. Δοκίμασε ξανά.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <section className="mx-auto flex min-h-screen max-w-md flex-col px-5 py-6">

        <div className="mb-6 flex gap-2">
          <div className="h-2 flex-1 rounded-full bg-green-500" />
          <div className="h-2 flex-1 rounded-full bg-slate-700" />
        </div>

        <p className="text-sm font-semibold text-green-400">
          Βήμα 1 από 2
        </p>

        <h1 className="mt-2 text-4xl font-bold">
          Συστατικά
        </h1>

        <p className="mt-3 text-slate-400 leading-6">
          Φωτογράφισε καθαρά την ετικέτα συστατικών.
        </p>

        <div className="mt-4 rounded-2xl bg-slate-800 p-4 break-all">
          {barcode}
        </div>

        <PhotoCapture inputId="ingredients-photo" title="Ετικέτα συστατικών" description="Συμπερίλαβε όλο το κείμενο σε μία ευκρινή φωτογραφία." actionLabel="Συνέχεια" onContinue={continueToProductPhoto} isSaving={isSaving} error={error} />

        <button
          type="button"
          onClick={() => navigate(-1)}
          className="mt-3 h-12 rounded-xl border border-slate-700"
        >
          Πίσω
        </button>

      </section>
    </main>
  );
}