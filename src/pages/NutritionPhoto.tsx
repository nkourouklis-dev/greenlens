import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import PhotoCapture from "../components/PhotoCapture";
import { saveNutritionDraft } from "../services/captureDraftService";
import { prepareImageForOcr } from "../services/historyService";
import { extractOcr } from "../services/ocrClient";
import { inspectNutritionPanel } from "../../worker/nutritionPanel";

/**
 * The optional second photo of a scan: the nutrition table, which is usually
 * on a different side of the pack from the ingredient list. It is read right
 * here, and the person is told at once whether the table could be used —
 * instead of finding out from a score that quietly ignored it.
 */
export default function NutritionPhoto() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const barcode = searchParams.get("barcode") ?? "";
  const productId = searchParams.get("productId") ?? "";

  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  function goOn() {
    navigate(
      `/product-photo?barcode=${encodeURIComponent(barcode)}&productId=${encodeURIComponent(productId)}`,
    );
  }

  async function readTable(file: File) {
    setError("");
    setIsSaving(true);

    try {
      const ocrImage = await prepareImageForOcr(file);

      const result = await extractOcr(
        ocrImage,
        barcode,
        crypto.randomUUID(),
        "nutrition",
      );

      const read = inspectNutritionPanel(result.rawText);

      if (!read.panel) {
        setError(
          read.tableDetected
            ? "Ο πίνακας διαβάστηκε, αλλά οι τιμές δεν βγαίνουν αξιόπιστες. Δοκίμασε νέα λήψη πιο κοντά και χωρίς αντανακλάσεις, ή πάτα «Παράλειψη»."
            : "Δεν βρέθηκε διατροφικός πίνακας στη φωτογραφία. Δοκίμασε ξανά ή πάτα «Παράλειψη».",
        );

        return;
      }

      saveNutritionDraft(productId, result.rawText);
      goOn();
    } catch (readError) {
      setError(
        readError instanceof Error
          ? readError.message
          : "Δεν ήταν δυνατή η ανάγνωση του πίνακα.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <main>
      <PhotoCapture
        step={2}
        stepCount={3}
        barcode={barcode || undefined}
        title="Φωτογράφισε τον διατροφικό πίνακα"
        description="Ο πίνακας «Διατροφικές πληροφορίες», συνήθως στο πλάι ή στο πίσω μέρος. Μετράει στη βαθμολογία."
        hint="Χωράει ολόκληρος ο πίνακας στο πλαίσιο"
        actionLabel="Ανάγνωση πίνακα"
        icon="list"
        onContinue={readTable}
        onSkip={goOn}
        skipLabel="Παράλειψη — δεν έχει πίνακα"
        isSaving={isSaving}
        error={error}
      />
    </main>
  );
}
