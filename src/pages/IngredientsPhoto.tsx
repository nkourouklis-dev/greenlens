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
  updateHistoryItem,
} from "../services/historyService";
import { extractOcr } from "../services/ocrClient";
import { extractIngredientText } from "../../worker/ingredientText";
import { inspectNutritionPanel } from "../../worker/nutritionPanel";

export default function IngredientsPhoto() {
  const [searchParams] =
    useSearchParams();

  const navigate = useNavigate();

  const barcode =
    searchParams.get("barcode") ?? "";

  // Set when this photo is the missing half of an existing analysis.
  const mergeInto =
    searchParams.get("mergeInto") ?? undefined;

  // What the photo is wanted for when it completes an existing analysis.
  const wantsNutrition = searchParams.get("for") === "nutrition";

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

      // The photo that completes an existing analysis goes straight into it:
      // there is no front photo left to take, and the review screen is built
      // around an ingredient list this photo usually is not. The analysis
      // page that follows is the confirmation — it shows the new score.
      if (mergeInto) {
        updateHistoryItem(mergeInto, {
          ocrRawText: result.rawText,
          userCorrectedText: result.rawText,
          ocrConfidence: result.confidence,
          ocrLabelType: result.labelType,
          categoryOverride: undefined,
          mergeWithStored: true,
        });

        navigate(`/product/${encodeURIComponent(mergeInto)}/analysis`);

        return;
      }

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
          //
          // Likewise a photo that carries the nutrition table beside the
          // list: cutting it down to the list threw the table away, so a
          // scan from the phone never counted it.
          rawText:
            !mergeInto &&
            !inspectNutritionPanel(result.rawText).tableDetected &&
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
        step={mergeInto ? undefined : 1}
        stepCount={mergeInto ? undefined : 3}
        barcode={barcode || undefined}
        title={
          wantsNutrition
            ? "Φωτογράφισε τον διατροφικό πίνακα"
            : "Φωτογράφισε τα συστατικά"
        }
        description={
          wantsNutrition
            ? "Ο πίνακας «Διατροφικές πληροφορίες / Nutrition facts», συνήθως στο πλάι ή στο πίσω μέρος."
            : "Η λίστα «Ingredients / INCI», συνήθως στο πίσω μέρος της συσκευασίας."
        }
        hint={
          wantsNutrition
            ? "Χωράει ολόκληρος ο πίνακας στο πλαίσιο"
            : "Χωράει όλη η λίστα στο πλαίσιο"
        }
        actionLabel={
          wantsNutrition ? "Ανάγνωση πίνακα" : "Ανάγνωση συστατικών"
        }
        icon="list"
        onContinue={readIngredients}
        isSaving={isSaving}
        error={error}
      />
    </main>
  );
}
