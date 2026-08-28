import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import PhotoCapture from "../components/PhotoCapture";
import { clearCaptureDraft, getIngredientsDraft } from "../services/captureDraftService";
import { compressImageForStorage, saveHistoryItem } from "../services/historyService";

export default function ProductPhoto() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const barcode = searchParams.get("barcode") ?? "";
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
    const scanId = crypto.randomUUID();
    try {
      const productPhoto = await compressImageForStorage(file);
      const wasSaved = saveHistoryItem({ id: scanId, barcode, status: "unknown", scannedAt: new Date().toISOString(), ingredientsPhoto, productPhoto });
      if (!wasSaved) {
        setError("Ο χώρος αποθήκευσης της συσκευής δεν επαρκεί. Δοκίμασε μικρότερη φωτογραφία.");
        return;
      }
      clearCaptureDraft(barcode);
      navigate(`/product/${scanId}`);
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