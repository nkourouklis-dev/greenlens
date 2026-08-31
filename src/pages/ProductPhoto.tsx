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
    <main className="min-h-screen bg-slate-950 text-white">
      <section className="mx-auto flex min-h-screen max-w-md flex-col px-5 py-6">

        <div className="mb-6 flex gap-2">
          <div className="h-2 flex-1 rounded-full bg-green-500" />
          <div className="h-2 flex-1 rounded-full bg-green-500" />
        </div>

        <p className="text-sm font-semibold text-green-400">
          Βήμα 2 από 2
        </p>

        <h1 className="mt-2 text-4xl font-bold">
          Φωτογραφία προϊόντος
        </h1>

        <p className="mt-3 text-slate-400">
          Φωτογράφισε την μπροστινή όψη του προϊόντος.
        </p>

        <div className="mt-4 rounded-2xl bg-slate-800 p-4 break-all">
          {barcode}
        </div>

        <PhotoCapture inputId="product-photo" title="Μπροστινή όψη" description="Βεβαιώσου ότι φαίνεται καθαρά η συσκευασία." actionLabel="Αποθήκευση" onContinue={saveProduct} isSaving={isSaving} error={error} />

      </section>
    </main>
  );
}