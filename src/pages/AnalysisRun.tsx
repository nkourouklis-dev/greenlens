import { useCallback, useEffect, useState } from "react";
import {
  useNavigate,
  useParams,
} from "react-router-dom";
import { analysisVersion } from "../config";
import { runAnalysis } from "../services/analysisClient";
import {
  buildAnalysisRecord,
  insufficientScore,
} from "../services/analysisRecord";
import { UserFacingError } from "../services/errors";
import { normalizeIngredients } from "../services/ingredientNormalizer";
import { extractIngredientText } from "../../worker/ingredientText";
import { detectContentCategoryHeuristic } from "../../worker/contentCategory";
import {
  getHistoryItem,
  updateHistoryItem,
} from "../services/historyService";
import type { ContentCategory } from "../types";

const GENERIC_ANALYSIS_ERROR =
  "Κάτι πήγε στραβά κατά την ανάλυση. Δοκιμάστε ξανά.";

type OcrLabelType =
  | "ingredients"
  | "nutrition"
  | "mixed"
  | "unknown";

// The stored history item may predate the label type field, so it is read
// defensively. Older entries simply fall back to "unknown" and the Worker
// keeps its previous behaviour.
function readLabelType(
  item: unknown,
): OcrLabelType {
  if (typeof item !== "object" || item === null) {
    return "unknown";
  }

  const value = (item as Record<string, unknown>)
    .ocrLabelType;

  if (
    value === "ingredients" ||
    value === "nutrition" ||
    value === "mixed" ||
    value === "unknown"
  ) {
    return value;
  }

  return "unknown";
}

export default function AnalysisRun() {
  const { id = "" } = useParams();
  const navigate = useNavigate();

  const [message, setMessage] = useState(
    "Προετοιμασία ανάλυσης...",
  );

  const [error, setError] = useState("");

  const performAnalysis = useCallback(() => {
    setError("");

    const item = getHistoryItem(id);

    if (!item) {
      setError(
        "Το προϊόν δεν βρέθηκε στη συσκευή.",
      );
      return;
    }

    const text =
      item.userCorrectedText ||
      item.ocrRawText ||
      "";

    const confidence = item.ocrConfidence ?? 0;

    const labelType = readLabelType(item);
    const categoryOverride: ContentCategory | undefined =
      item.categoryOverride;

    const ingredients = normalizeIngredients(
      text,
      confidence,
    );

    // Which category this text is headed for, purely to decide which
    // client-side quick-gate to apply below — the Worker is always the
    // real authority (it re-resolves the category itself, heuristic then
    // AI fallback). An explicit override wins; otherwise this mirrors the
    // Worker's own heuristic so nutrition/chemical text isn't wrongly
    // blocked by the ingredients-only check.
    const likelyCategory: ContentCategory =
      categoryOverride && categoryOverride !== "unknown"
        ? categoryOverride
        : detectContentCategoryHeuristic(text).category;

    // The naive comma-splitting normalizer above can come back empty even
    // when the text itself is a valid ingredient list (e.g. OCR text
    // missing commas). extractIngredientText is the same robust, tested
    // validator the review screen and the Worker use — it is the actual
    // authority on whether *ingredients* text is analyzable. For
    // nutrition/chemical composition text it does not apply — the Worker's
    // own category-specific extraction is the real validator there, so we
    // only require non-empty text client-side.
    const isAnalyzable =
      text.trim().length > 0 &&
      (likelyCategory !== "ingredients" ||
        extractIngredientText(text, confidence).isValid);

    if (!isAnalyzable) {
      updateHistoryItem(id, {
        analysis: {
          productId: id,
          barcode: item.barcode,
          productType: "unknown",
          contentCategory: "ingredients",
          confirmedIngredientText: text,
          normalizedIngredients: ingredients,
          ocrConfidence: confidence,
          structured: {
            productType: "unknown",
            summary:
              "Δεν υπάρχουν αρκετά στοιχεία για αξιόπιστη ανάλυση.",
            positives: [],
            attentionItems: [],
            potentialAllergens: [],
            ingredientFindings: [],
            insufficientDataReasons: [
              "Δεν υπάρχει επιβεβαιωμένο κείμενο συστατικών.",
            ],
            confidence: 0,
          },
          score: insufficientScore(
            "Δεν υπάρχει επιβεβαιωμένο κείμενο συστατικών.",
            confidence,
          ),
          ingredientInsights: [],
          executiveSummary: {
            overallVerdict: "Ανεπαρκή στοιχεία",
            safeIngredients: 0,
            cautionIngredients: 0,
            highImpactIngredients: 0,
            highlights: [],
            watchOutFor: [],
          },
          analyzedAt: new Date().toISOString(),
          analysisVersion,
        },
      });

      navigate(`/product/${id}`, {
        replace: true,
      });

      return;
    }

    setMessage(
      "Αναλύω το επιβεβαιωμένο κείμενο. Μπορεί να διαρκέσει έως 30 δευτερόλεπτα.",
    );

    runAnalysis({
      productId: id,
      barcode: item.barcode,
      productType: "unknown",
      confirmedIngredientText: text,
      normalizedIngredients: ingredients,
      ocrConfidence: confidence,
      // Carries the OCR verdict to the Worker so the analysis step can
      // trust a high confidence ingredient reading instead of re-judging
      // the label from scratch.
      ocrLabelType: labelType,
      ocrTextLength: text.trim().length,
      categoryOverride,
      productTitle: item.productName,
    })
      .then((result) => {
        // Guards against any unexpected shape in `result` (a malformed or
        // partial response that slipped past analysisClient's own
        // defaults) turning into a raw JS error shown to the user instead
        // of the friendly message below.
        try {
          const analysis = buildAnalysisRecord(
            result,
            id,
            item,
            text,
            ingredients,
            confidence,
          );

          const wasSaved = updateHistoryItem(id, {
            normalizedIngredients: ingredients,
            categoryOverride,
            analysis,
          });

          if (!wasSaved) {
            setError(
              "Δεν ήταν δυνατή η αποθήκευση της ανάλυσης στη συσκευή.",
            );
            return;
          }

          navigate(`/product/${id}`, {
            replace: true,
          });
        } catch (processingError) {
          console.error(
            "analysis_run_processing_failed",
            processingError,
          );
          setError(GENERIC_ANALYSIS_ERROR);
        }
      })
      .catch((caughtError) => {
        console.error(
          "analysis_run_request_failed",
          caughtError,
        );
        setError(
          caughtError instanceof UserFacingError
            ? caughtError.message
            : GENERIC_ANALYSIS_ERROR,
        );
      });
  }, [id, navigate]);

  useEffect(() => {
    performAnalysis();
  }, [performAnalysis]);

  return (
    <main className="min-h-screen bg-canvas px-5 py-12 text-ink">
      <section className="mx-auto max-w-md">
        <p className="text-sm font-bold uppercase tracking-[0.14em] text-accent-strong">
          GreenLens
        </p>

        <h1 className="mt-3 text-2xl font-bold">
          Ανάλυση προϊόντος
        </h1>

        {error ? (
          <>
            <p
              role="alert"
              className="mt-6 rounded-xl border border-red-400/40 bg-red-950/40 p-4 leading-6 text-red-100"
            >
              {error}
            </p>

            <div className="mt-5 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() =>
                  navigate(`/product/${id}`)
                }
                className="h-14 rounded-xl border border-line font-semibold text-ink-muted"
              >
                Πίσω στο προϊόν
              </button>

              <button
                type="button"
                onClick={() => {
                  setMessage(
                    "Προετοιμασία ανάλυσης...",
                  );
                  performAnalysis();
                }}
                className="h-14 rounded-xl bg-accent font-bold text-on-accent"
              >
                Δοκιμή ξανά
              </button>
            </div>
          </>
        ) : (
          <div
            role="status"
            className="mt-8 rounded-2xl border border-line-subtle bg-surface p-6"
          >
            <span className="block h-3 w-3 animate-pulse rounded-full bg-accent-strong" />

            <p className="mt-4 font-semibold text-ink">
              {message}
            </p>

            <p className="mt-2 text-sm leading-6 text-ink-faint">
              Η βαθμολογία υπολογίζεται από
              σταθερούς κανόνες αφού ολοκληρωθεί η
              ερμηνεία.
            </p>
          </div>
        )}
      </section>
    </main>
  );
}
