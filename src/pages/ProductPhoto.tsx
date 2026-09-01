import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import PhotoCapture from "../components/PhotoCapture";
import { clearCaptureDraft, clearOcrDraft, getIngredientsDraft, getOcrDraft } from "../services/captureDraftService";
import { compressImageForStorage, saveHistoryItem } from "../services/historyService";
import { identifyProduct } from "../services/identifyClient";

export default function ProductPhoto() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const barcode = searchParams.get("barcode") ?? "";
  const productId = searchParams.get("productId");
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  async function saveProduct(file: File) {
    const ingredientsPhoto = getIngredientsDraft(barcode);
    if (!ingredientsPhoto) {
      setError("Χρειάζεται πρώτα φωτογραφία των συστατικών.");
      return;
    }
    setError("");
    setIsSaving(true);
    const scanId = productId ?? crypto.randomUUID();
    const ocrDraft = productId ? getOcrDraft(productId) : null;
    try {
            const productPhoto =
        await compressImageForStorage(file);

      setIsSaving(true);

      const identity =
        await identifyProduct(
        productPhoto,
        barcode,
      );

      const displayName = identity
        ? [identity.brand, identity.productName]
            .filter(Boolean)
            .join(" ")
            .trim()
        : "";

      const wasSaved = saveHistoryItem({ id: scanId, barcode, status: "unknown", scannedAt: new Date().toISOString(), ingredientsPhoto, productPhoto,productName: displayName || undefined,ocrRawText: ocrDraft?.result.rawText, ocrConfidence: ocrDraft?.result.confidence });
      if (!wasSaved) {
        setError("Ο χώρος αποθήκευσης της συσκευής δεν επαρκεί. Δοκίμασε μικρότερη φωτογραφία.");
        return;
      }
      clearCaptureDraft(barcode);
      if (productId) clearOcrDraft(productId);
      navigate(`/product/${scanId}/analysis`);
    } catch {
      setError("Δεν ήταν δυνατή η αποθήκευση της φωτογραφίας. Δοκίμασε ξανά.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <main className="bg-slate-950 text-white">
      <section className="mx-auto flex max-w-md flex-col gap-3 px-4 py-4 pb-20">
        <div className="flex gap-1.5">
          <div className="h-1.5 flex-1 rounded-full bg-green-500" />
          <div className="h-1.5 flex-1 rounded-full bg-green-500" />
        </div>

        <div>
          <p className="text-xs font-semibold text-green-400">
            Βήμα 2 από 2
          </p>

          <h1 className="mt-1 text-2xl font-bold">
            Μπροστινή όψη
          </h1>

          <p className="mt-1 text-xs text-slate-400">
            Φωτογράφισε τα ληπτικά στοιχεία του προϊόντος.
          </p>
        </div>

        <div className="rounded-lg border border-slate-700 bg-slate-900 p-2 break-all">
          <p className="text-xs text-slate-400">Barcode</p>
          <p className="mt-0.5 font-mono text-sm font-semibold text-slate-200">
            {barcode}
          </p>
        </div>

        <PhotoCapture 
          inputId="product-photo" 
          title="Φωτογραφία" 
          description="Γέμισε το κάδρο με την μπροστινή όψη της συσκευασίας." 
          actionLabel="Αποθήκευση" 
          onContinue={saveProduct} 
          isSaving={isSaving} 
          error={error} 
        />
      </section>

      {/* Sticky footer action bar */}
      <div className="fixed bottom-16 left-0 right-0 border-t border-slate-800 bg-slate-950/95 backdrop-blur px-4 py-3">
        <div className="mx-auto max-w-md">
          {error && (
            <p className="mb-2 rounded-lg border border-red-400/40 bg-red-950/40 p-2 text-xs text-red-100">
              {error}
            </p>
          )}
        </div>
      </div>
    </main>
  );
}