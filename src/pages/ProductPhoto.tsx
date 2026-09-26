import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import PhotoCapture from "../components/PhotoCapture";
import { clearCaptureDraft, clearOcrDraft, getIngredientsDraft, getOcrDraft } from "../services/captureDraftService";
import { compressImageForStorage, saveHistoryItem } from "../services/historyService";
import { identifyProduct } from "../services/identifyClient";
import { startAnalysis } from "../services/analysisJobs";
import { composeDisplayTitle } from "../utils/productTitle";

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
        ? composeDisplayTitle(identity.brand, identity.productName)
        : "";

      const wasSaved = saveHistoryItem({ id: scanId, barcode, status: "unknown", scannedAt: new Date().toISOString(), ingredientsPhoto, productPhoto,productName: displayName || undefined,ocrRawText: ocrDraft?.result.rawText, ocrConfidence: ocrDraft?.result.confidence, categoryOverride: ocrDraft?.categoryOverride });
      if (!wasSaved) {
        setError("Ο χώρος αποθήκευσης της συσκευής δεν επαρκεί. Δοκίμασε μικρότερη φωτογραφία.");
        return;
      }
      clearCaptureDraft(barcode);
      if (productId) clearOcrDraft(productId);
      // The analysis takes 15–30 s. It runs in the background: the product
      // page shows it loading and fills in when it is done, and offers
      // "scan another" for anyone who would rather not wait.
      void startAnalysis(scanId, { notify: true });
      navigate(`/product/${scanId}`, { replace: true });
    } catch {
      setError("Δεν ήταν δυνατή η αποθήκευση της φωτογραφίας. Δοκίμασε ξανά.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <main>
      <PhotoCapture
        step={2}
        stepCount={2}
        barcode={barcode || undefined}
        title="Φωτογράφισε την μπροστινή όψη"
        description="Να φαίνονται η μάρκα και το όνομα του προϊόντος, για την αναγνώρισή του."
        hint="Γέμισε το πλαίσιο με τη συσκευασία"
        actionLabel="Αποθήκευση"
        icon="pack"
        onContinue={saveProduct}
        isSaving={isSaving}
        error={error}
      />
    </main>
  );
}
