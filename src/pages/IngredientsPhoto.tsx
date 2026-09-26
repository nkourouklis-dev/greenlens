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

  // Set when this photo is the missing half of an existing analysis.
  const mergeInto =
    searchParams.get("mergeInto") ?? undefined;

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

      // Ground truth for what is actually sent for OCR — paste
      // ocrImageDataUrl into a browser address bar to view the exact
      // bytes leaving the client, independent of what OCR reports back.
      console.info("ingredients_ocr_upload_debug", {
        productId,
        barcode,
        sourceFileSizeBytes: file.size,
        sourceFileType: file.type,
        ocrImageDataUrl: ocrImage,
      });

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
          // A merge photo is kept whole: it is usually the nutrition table,
          // and cutting it down to an ingredient list would drop exactly
          // the part it was taken for.
          rawText:
            !mergeInto &&
            extracted.ingredientText &&
            extracted.isValid
              ? extracted.ingredientText
              : result.rawText,
        },
        ...(mergeInto ? { mergeInto } : {}),
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
    <main>
      <PhotoCapture
        step={1}
        stepCount={2}
        barcode={barcode || undefined}
        title="Φωτογράφισε τα συστατικά"
        description="Η λίστα «Ingredients / INCI», συνήθως στο πίσω μέρος της συσκευασίας."
        hint="Χωράει όλη η λίστα στο πλαίσιο"
        actionLabel="Ανάγνωση συστατικών"
        icon="list"
        onContinue={readIngredients}
        isSaving={isSaving}
        error={error}
      />
    </main>
  );
}
