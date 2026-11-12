import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import PhotoCapture from "../components/PhotoCapture";
import { clearCaptureDraft, clearNutritionDraft, clearOcrDraft, getIngredientsDraft, getNutritionDraft, getOcrDraft } from "../services/captureDraftService";
import { compressImageForStorage, getHistoryItem, saveHistoryItem, updateHistoryItem } from "../services/historyService";
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

  // Set when the result already exists (built from Open Food Facts) and only
  // the front photo is missing.
  const offId = searchParams.get("offId");

  async function addPhotoToOffResult(file: File, id: string) {
    setError("");
    setIsSaving(true);

    try {
      const productPhoto = await compressImageForStorage(file);
      // Also stores the photo in the shared catalogue (R2) for this barcode.
      const identity = await identifyProduct(productPhoto, barcode);

      const saved = updateHistoryItem(id, { productPhoto });

      if (!saved) {
        setError("Ο χώρος αποθήκευσης της συσκευής δεν επαρκεί. Δοκίμασε μικρότερη φωτογραφία.");
        return;
      }

      const existing = getHistoryItem(id);

      if (!existing?.productName && identity) {
        const name = composeDisplayTitle(identity.brand, identity.productName);

        if (name) {
          updateHistoryItem(id, { productName: name });
        }
      }

      navigate(`/product/${id}`, { replace: true });
    } catch {
      setError("Δεν ήταν δυνατή η αποθήκευση της φωτογραφίας. Δοκίμασε ξανά.");
    } finally {
      setIsSaving(false);
    }
  }

  async function saveProduct(file: File) {
    if (offId) {
      await addPhotoToOffResult(file, offId);
      return;
    }

    const ocrDraft = productId ? getOcrDraft(productId) : null;
    const ingredientsPhoto = getIngredientsDraft(barcode);
    // The ingredient list may come from Open Food Facts instead of a photo
    // (AddProduct stores it as the draft's text), so a photo is only
    // required when there is no text either.
    if (!ingredientsPhoto && !ocrDraft?.result.rawText) {
      setError("Χρειάζεται πρώτα φωτογραφία των συστατικών.");
      return;
    }
    setError("");
    setIsSaving(true);
    const scanId = productId ?? crypto.randomUUID();
    const nutritionText = productId ? getNutritionDraft(productId) : null;
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

      const wasSaved = saveHistoryItem({ id: scanId, barcode, status: "unknown", scannedAt: new Date().toISOString(), ...(ingredientsPhoto ? { ingredientsPhoto } : {}), productPhoto,productName: displayName || undefined,...(identity?.brand?.trim() ? { productBrand: identity.brand.trim() } : {}),ocrRawText: ocrDraft?.result.rawText, ocrConfidence: ocrDraft?.result.confidence, categoryOverride: ocrDraft?.categoryOverride, ...(nutritionText ? { extraLabelTexts: [nutritionText] } : {}) });
      if (!wasSaved) {
        setError("Ο χώρος αποθήκευσης της συσκευής δεν επαρκεί. Δοκίμασε μικρότερη φωτογραφία.");
        return;
      }
      clearCaptureDraft(barcode);
      if (productId) {
        clearOcrDraft(productId);
        clearNutritionDraft(productId);
      }
      // The analysis runs in the background: the product
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
        step={3}
        stepCount={3}
        barcode={barcode || undefined}
        title="Φωτογράφισε την μπροστινή όψη"
        description="Να φαίνονται η μάρκα και το όνομα του προϊόντος, για την αναγνώρισή του."
        hint="Γέμισε το πλαίσιο με τη συσκευασία"
        actionLabel="Αποθήκευση"
        icon="pack"
        onContinue={saveProduct}
        isSaving={isSaving}
        error={error}
        {...(offId
          ? {
              onSkip: () => navigate(`/product/${offId}`, { replace: true }),
            }
          : {})}
      />
    </main>
  );
}
