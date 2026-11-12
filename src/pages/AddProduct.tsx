import { useEffect, useState } from "react";
import { Barcode, Camera, Check, Database, Loader2 } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import FlowHeader from "../components/FlowHeader";
import {
  analyzeFromOff,
  canSkipAllPhotos,
  fetchOffAvailability,
  type OffLookup,
} from "../services/offClient";
import {
  markOffHasNutrition,
  saveOcrDraft,
} from "../services/captureDraftService";
import { saveHistoryItem } from "../services/historyService";
import { buildAnalysisRecord } from "../services/analysisRecord";
import type { ScanHistoryItem } from "../types";

/**
 * The first screen for a barcode the catalogue does not know. It renders at
 * once, exactly as it always did; in the background it asks what Open Food
 * Facts already holds and, only when that can replace a photo, shortens the
 * flow. Nothing here waits on the lookup, and anything that goes wrong leaves
 * the photo flow untouched.
 */
export default function AddProduct() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const barcode = searchParams.get("barcode") ?? "";
  // "Σκάναρε ετικέτα" from a result built on Open Food Facts: the person
  // wants the photograph, so no shortcut is taken.
  const manual = searchParams.get("manual") === "1";

  const [off, setOff] = useState<OffLookup | null>(null);
  const [building, setBuilding] = useState(false);

  useEffect(() => {
    if (!barcode || manual) {
      return;
    }

    let cancelled = false;

    void (async () => {
      const lookup = await fetchOffAvailability(barcode);

      if (cancelled || !lookup) {
        return;
      }

      if (!canSkipAllPhotos(lookup.availability)) {
        setOff(lookup);
        return;
      }

      setBuilding(true);

      const built = await analyzeFromOff(barcode);

      if (cancelled) {
        return;
      }

      if (!built) {
        // The Worker declined or failed: carry on with the photos.
        setBuilding(false);
        setOff(lookup);
        return;
      }

      const id = crypto.randomUUID();

      const historyItem: ScanHistoryItem = {
        id,
        barcode,
        status: "known",
        scannedAt: new Date().toISOString(),
        ...(lookup.productName ? { productName: lookup.productName } : {}),
        ...(lookup.brand ? { productBrand: lookup.brand } : {}),
        ...(built.sourceText
          ? {
              ocrRawText: built.sourceText,
              userCorrectedText: built.sourceText,
            }
          : {}),
        dataSource: "off",
      };

      const analysis = buildAnalysisRecord(
        built.result,
        id,
        historyItem,
        built.sourceText,
        [],
        built.result.contentCategory === "unknown"
          ? 0
          : built.result.score.confidence,
      );

      const saved = saveHistoryItem({
        ...historyItem,
        productId: id,
        analysis,
      });

      if (!saved) {
        setBuilding(false);
        setOff(lookup);
        return;
      }

      // The record gave data but no picture: ask for the front of the pack
      // (skippable) so the product has a thumbnail and the catalogue a photo.
      navigate(
        `/product-photo?barcode=${encodeURIComponent(barcode)}&offId=${encodeURIComponent(id)}`,
        { replace: true },
      );
    })();

    return () => {
      cancelled = true;
    };
  }, [barcode, manual, navigate]);

  const hasIngredients = off?.availability.ingredients === true;
  const hasNutrition = off?.availability.nutrition === true;

  // Only the ingredient list is on record: the next photo is the table.
  const ingredientsFromOff =
    hasIngredients &&
    !hasNutrition &&
    off?.availability.source === "openfoodfacts" &&
    off.ingredientsText !== null;

  // Only the table is on record: the ingredient photo is still needed, but
  // the table photo that normally follows it is not.
  const nutritionFromOff = hasNutrition && !hasIngredients;

  function next() {
    if (ingredientsFromOff && off?.ingredientsText) {
      const productId = crypto.randomUUID();

      saveOcrDraft(productId, {
        barcode,
        image: "",
        result: {
          rawText: off.ingredientsText,
          confidence: 0.95,
          labelType: "ingredients",
          unreadableSegments: [],
        },
      });

      navigate(
        `/nutrition-photo?barcode=${encodeURIComponent(barcode)}&productId=${encodeURIComponent(productId)}`,
      );
      return;
    }

    if (nutritionFromOff) {
      markOffHasNutrition(barcode);
    }

    navigate(`/ingredients-photo?barcode=${encodeURIComponent(barcode)}`);
  }

  const nextTitle = ingredientsFromOff
    ? "Βρήκαμε τα συστατικά στο Open Food Facts"
    : nutritionFromOff
      ? "Βρήκαμε τον πίνακα διατροφής στο Open Food Facts"
      : "Επόμενο βήμα";

  const nextText = ingredientsFromOff
    ? "Χρειάζεται μόνο φωτογραφία του πίνακα διατροφικής αξίας."
    : nutritionFromOff
      ? "Χρειάζεται μόνο φωτογραφία της λίστας συστατικών."
      : "Φωτογραφία της λίστας συστατικών. Αν υπάρχει και πίνακας διατροφικής αξίας, θα τον ζητήσουμε μετά.";

  const ctaLabel = ingredientsFromOff
    ? "Συνέχεια: φωτογραφία πίνακα διατροφής"
    : "Συνέχεια στη φωτογράφιση";

  return (
    <main className="min-h-dvh bg-canvas px-4 pb-24 text-ink">
      <FlowHeader
        eyebrow="Νέο προϊόν"
        title="Δεν το ξέρουμε ακόμα"
        subtitle="Θα το προσθέσεις με μία φωτογραφία της ετικέτας."
      />

      <section className="mx-auto flex max-w-md flex-col gap-4">
        <div className="flex items-center gap-4 rounded-3xl border border-line-subtle bg-surface p-4 shadow-sm">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/15 text-accent-strong">
            <Barcode size={24} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-accent-strong">
              <Check size={14} strokeWidth={3} />
              Barcode αναγνωρίστηκε
            </p>
            <p className="mt-0.5 break-all text-xl font-bold tabular-nums tracking-wide">
              {barcode || "Δεν έχει δοθεί barcode"}
            </p>
          </div>
        </div>

        {building && (
          <div
            role="status"
            className="flex items-start gap-3 rounded-3xl border border-line-subtle bg-surface p-4 shadow-sm"
          >
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/15 text-accent-strong">
              <Loader2 size={22} className="animate-spin" />
            </span>
            <div>
              <p className="font-bold">Βρήκαμε το προϊόν στο Open Food Facts</p>
              <p className="mt-0.5 text-sm leading-5 text-ink-muted">
                Ετοιμάζουμε το αποτέλεσμα, χωρίς να χρειαστεί φωτογραφία.
              </p>
            </div>
          </div>
        )}

        {!building && (
          <>
            <div className="flex items-start gap-3 rounded-3xl border border-line-subtle bg-surface p-4 shadow-sm">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/15 text-accent-strong">
                {ingredientsFromOff || nutritionFromOff ? (
                  <Database size={22} />
                ) : (
                  <Camera size={22} />
                )}
              </span>
              <div>
                <p className="font-bold">{nextTitle}</p>
                <p className="mt-0.5 text-sm leading-5 text-ink-muted">
                  {nextText}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={next}
              className="flex h-14 w-full items-center justify-center gap-2 rounded-full bg-accent text-base font-bold text-on-accent shadow-lg shadow-emerald-500/25 transition active:scale-[0.98]"
            >
              <Camera size={20} />
              {ctaLabel}
            </button>
          </>
        )}
      </section>
    </main>
  );
}
