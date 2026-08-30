import { useEffect, useState } from "react";
import {
  useNavigate,
  useParams,
} from "react-router-dom";
import {
  analysisVersion,
  apiBaseUrl,
  apiConfigurationError,
} from "../config";
import { runAnalysis } from "../services/analysisClient";
import { normalizeIngredients } from "../services/ingredientNormalizer";
import {
  getHistoryItem,
  updateHistoryItem,
} from "../services/historyService";
import type { ScoreBreakdown } from "../types";

const insufficientScore = (
  reason: string,
  confidence: number,
): ScoreBreakdown => ({
  score: null,
  band: "insufficient_data",
  deductions: [],
  bonuses: [],
  confidence,
  insufficientDataReasons: [reason],
  scoringVersion: analysisVersion,
});

export default function AnalysisRun() {
  const { id = "" } = useParams();
  const navigate = useNavigate();

  const [message, setMessage] = useState(
    "Προετοιμασία ανάλυσης...",
  );
  const [error, setError] = useState("");
  const [debugInfo, setDebugInfo] = useState("");

  useEffect(() => {
    const item = getHistoryItem(id);

    if (!item) {
      setError("Το προϊόν δεν βρέθηκε στη συσκευή.");
      setDebugInfo("item=missing");
      return;
    }

    const text =
      item.userCorrectedText ||
      item.ocrRawText ||
      "";

    const confidence = item.ocrConfidence ?? 0;

    const ingredients = normalizeIngredients(
      text,
      confidence,
    );

    setDebugInfo(
      [
        `text=${text.length}`,
        `conf=${confidence}`,
        `ingredients=${ingredients.length}`,
        `api=${apiBaseUrl || "EMPTY"}`,
        `cfgError=${apiConfigurationError ?? "none"}`,
      ].join(" | "),
    );

    if (
      !text.trim() ||
      ingredients.length === 0
    ) {
      updateHistoryItem(id, {
        analysis: {
          productId: id,
          barcode: item.barcode,
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
      "Αναλύω τα επιβεβαιωμένα συστατικά...",
    );

    runAnalysis({
      productId: id,
      barcode: item.barcode,
      confirmedIngredientText: text,
      normalizedIngredients: ingredients,
      ocrConfidence: confidence,
    })
      .then(({ structured, score }) => {
        const record = {
          productId: id,
          barcode: item.barcode,
          confirmedIngredientText: text,
          normalizedIngredients: ingredients,
          ocrConfidence: confidence,
          structured,
          score,
          analyzedAt: new Date().toISOString(),
          analysisVersion: score.scoringVersion,
        };

        const wasSaved = updateHistoryItem(id, {
          normalizedIngredients: ingredients,
          analysis: record,
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
      })
      .catch((caughtError) => {
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : "Η ανάλυση δεν ολοκληρώθηκε. Δοκιμάστε ξανά.",
        );

        setDebugInfo((previousInfo) =>
          [
            previousInfo,
            `requestFailed=${
              caughtError instanceof Error
                ? caughtError.message
                : "unknown"
            }`,
          ]
            .filter(Boolean)
            .join(" | "),
        );
      });
  }, [id, navigate]);

  return (
    <main className="min-h-screen bg-slate-950 px-5 py-12 text-white">
      <section className="mx-auto max-w-md">
        <p className="text-sm font-bold uppercase tracking-[0.14em] text-emerald-400">
          GreenLens
        </p>

        <h1 className="mt-3 text-2xl font-bold">
          Ανάλυση συστατικών
        </h1>

        {error ? (
          <>
            <p
              role="alert"
              className="mt-6 rounded-xl border border-red-400/40 bg-red-950/40 p-4 leading-6 text-red-100"
            >
              {error}
            </p>

            <button
              type="button"
              onClick={() =>
                navigate(`/product/${id}`)
              }
              className="mt-5 h-14 w-full rounded-xl bg-emerald-500 font-bold text-slate-950"
            >
              Πίσω στο προϊόν
            </button>
          </>
        ) : (
          <div
            role="status"
            className="mt-8 rounded-2xl border border-slate-800 bg-slate-900 p-6"
          >
            <span className="block h-3 w-3 animate-pulse rounded-full bg-emerald-400" />

            <p className="mt-4 font-semibold">
              {message}
            </p>

            <p className="mt-2 text-sm leading-6 text-slate-400">
              Η βαθμολογία υπολογίζεται από σταθερούς
              κανόνες αφού ολοκληρωθεί η ερμηνεία.
            </p>
          </div>
        )}

        {debugInfo && (
          <pre className="mt-6 overflow-x-auto whitespace-pre-wrap break-all rounded-xl bg-slate-800 p-3 text-xs text-slate-200">
            {debugInfo}
          </pre>
        )}
      </section>
    </main>
  );
}