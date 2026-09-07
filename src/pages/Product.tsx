import React from "react";
import {
  Camera,
  MessageCircle,
  RefreshCw,
} from "lucide-react";
import { useState } from "react";
import {
  useNavigate,
  useParams,
} from "react-router-dom";
import { askProductQuestion } from "../services/analysisClient";
import { getHistoryItem } from "../services/historyService";
import {
  deriveExecutiveSummary,
  deriveIngredientInsights,
} from "../utils/ingredientInsights";
import type {
  ContentCategory,
  ProductAnalysisRecord,
  ScoreBreakdown,
} from "../types";
import ShareScanButton from "../components/ShareScanButton";
import ExecutiveSummaryCard from "../components/ExecutiveSummaryCard";
import IngredientCard from "../components/IngredientCard";
import NutritionCard from "../components/NutritionCard";
import ChemicalCard from "../components/ChemicalCard";
import ScoreBreakdownPanel from "../components/ScoreBreakdownPanel";

// Records saved before contentCategory existed predate every path except
// ingredients, so a missing field always means "ingredients".
function readContentCategory(
  record: ProductAnalysisRecord,
): ContentCategory {
  return record.contentCategory ?? "ingredients";
}

const sectionTitleByCategory: Record<ContentCategory, string> = {
  ingredients: "Συστατικά",
  nutrition: "Διατροφικά στοιχεία",
  chemical_composition: "Χημική Ανάλυση",
  unknown: "",
};

const bands: Record<
  ScoreBreakdown["band"],
  [string, string, string]
> = {
  excellent: [
    "Εξαιρετική επιλογή",
    "text-emerald-300",
    "border-emerald-400/40",
  ],
  good: [
    "Καλή επιλογή",
    "text-green-300",
    "border-green-400/40",
  ],
  moderate: [
    "Μέτρια επιλογή",
    "text-yellow-200",
    "border-yellow-400/40",
  ],
  attention: [
    "Χρειάζεται προσοχή",
    "text-orange-300",
    "border-orange-400/40",
  ],
  high_attention: [
    "Πολλές επισημάνσεις",
    "text-red-300",
    "border-red-400/40",
  ],
  insufficient_data: [
    "Ανεπαρκή στοιχεία",
    "text-slate-300",
    "border-slate-700",
  ],
};

function ProductImage(props: {
  source: string;
}) {
  const classes =
    "h-24 w-20 shrink-0 rounded-xl bg-slate-800 object-cover";

  if (!props.source) {
    return <span className={classes} />;
  }

  return React.createElement("img", {
    src: props.source,
    alt: "Φωτογραφία προϊόντος",
    className: classes,
  });
}

export default function Product() {
  const { id = "" } = useParams();
  const navigate = useNavigate();

  const item = getHistoryItem(id);

  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState("");

  if (!item) {
    return (
      <main className="min-h-screen bg-slate-950 px-4 py-6 text-white">
        <section className="mx-auto max-w-md">
          <h1 className="text-2xl font-bold">
            Το προϊόν δεν βρέθηκε
          </h1>

          <button
            type="button"
            onClick={() => navigate("/scan")}
            className="mt-5 h-12 rounded-xl bg-emerald-500 px-4 font-bold text-slate-950"
          >
            Νέα σάρωση
          </button>
        </section>
      </main>
    );
  }

  const record = item.analysis;

  const score: ScoreBreakdown = record?.score ?? {
    score: null,
    band: "insufficient_data",
    deductions: [],
    bonuses: [],
    confidence: 0,
    lowConfidenceReason: null,
    insufficientDataReasons: [
      "Δεν υπάρχουν επαρκή δεδομένα για βαθμολογία.",
    ],
    scoringVersion: "unknown",
  };

  async function ask() {
    if (!record || !question.trim()) {
      return;
    }

    try {
      setError("");
      setAnswer(
        await askProductQuestion(id, question),
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Η υπηρεσία ερωτήσεων δεν είναι διαθέσιμη.",
      );
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-5 text-white">
      <section className="mx-auto max-w-md space-y-4">
        <article className="flex gap-4 rounded-2xl border border-slate-800 bg-slate-900 p-4">
          <ProductImage
            source={
              item.productPhoto ??
              item.ingredientsPhoto ??
              ""
            }
          />

          <div className="min-w-0">
            <h1 className="truncate text-xl font-bold">
              {item.productName || "Νέο προϊόν"}
            </h1>

            <p className="mt-1 text-sm text-slate-400">
              {item.barcode}
            </p>

            <p className="mt-2 text-xs text-slate-500">
              {new Date(
                item.scannedAt,
              ).toLocaleString("el-GR")}
            </p>

            {record && readContentCategory(record) === "ingredients" && (
              <p className="mt-2 inline-block rounded-full bg-slate-800 px-2 py-1 text-xs text-slate-300">
                {record.productType === "food"
                  ? "Τρόφιμο"
                  : record.productType ===
                      "cosmetic"
                    ? "Καλλυντικό"
                    : "Άγνωστη κατηγορία"}
              </p>
            )}
            {record && readContentCategory(record) !== "ingredients" && (
              <p className="mt-2 inline-block rounded-full bg-slate-800 px-2 py-1 text-xs text-slate-300">
                {sectionTitleByCategory[readContentCategory(record)] ||
                  "Άγνωστο περιεχόμενο"}
              </p>
            )}
          </div>
        </article>

        {!record ? (
          <section className="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <p className="font-semibold">
              Η ετικέτα αναγνώστηκε
            </p>

            <p className="mt-1 text-sm text-slate-400">
              Το προϊόν είναι έτοιμο για ανάλυση.
            </p>

            <button
              type="button"
              onClick={() =>
                navigate(
                  `/product/${id}/analysis`,
                )
              }
              className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 font-bold text-slate-950"
            >
              <RefreshCw size={18} />
              Ανάλυση συστατικών
            </button>
          </section>
        ) : (
          <Result
            record={record}
            score={score}
            onReanalyze={() =>
              navigate(
                `/product/${id}/analysis`,
              )
            }
            onRetakePhoto={() =>
              navigate(
                `/ingredients-photo?barcode=${encodeURIComponent(item.barcode)}`,
              )
            }
          />
        )}

        {record && (
          <section className="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <div className="flex items-center gap-2">
              <MessageCircle
                size={18}
                className="text-emerald-300"
              />

              <h2 className="font-bold">
                Ρώτησε το GreenLens
              </h2>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {[
                "Γιατί πήρε αυτό το score;",
                "Ποια συστατικά χρειάζονται προσοχή;",
                "Υπάρχουν πιθανά αλλεργιογόνα;",
                "Τι πληροφορίες λείπουν;",
              ].map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() =>
                    setQuestion(value)
                  }
                  className="rounded-lg border border-slate-700 px-3 py-2 text-xs"
                >
                  {value}
                </button>
              ))}
            </div>

            <label
              htmlFor="question"
              className="sr-only"
            >
              Ερώτηση για το προϊόν
            </label>

            <div className="mt-4 flex gap-2">
              <input
                id="question"
                value={question}
                onChange={(event) =>
                  setQuestion(event.target.value)
                }
                placeholder="Γράψε μια ερώτηση"
                className="min-w-0 flex-1 rounded-xl bg-slate-800 px-3 py-3 text-sm"
              />

              <button
                type="button"
                onClick={ask}
                className="rounded-xl bg-emerald-500 px-3 font-bold text-slate-950"
              >
                Αποστολή
              </button>
            </div>

            {error && (
              <p
                role="alert"
                className="mt-3 text-sm text-red-200"
              >
                {error}
              </p>
            )}

            {answer && (
              <p className="mt-3 rounded-xl bg-emerald-400/10 p-3 text-sm leading-6 text-emerald-50">
                {answer}
              </p>
            )}
          </section>
        )}

        <ShareScanButton
          productName={item.productName}
          barcode={item.barcode}
          score={item.analysis?.score?.score}
          summary={item.analysis?.structured?.summary}
          positives={item.analysis?.structured?.positives}
          attentionItems={item.analysis?.structured?.attentionItems}
          allergens={item.analysis?.structured?.potentialAllergens}
        />

        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => navigate("/scan")}
            className="h-12 rounded-xl border border-slate-700 font-semibold"
          >
            Νέα σάρωση
          </button>

          <button
            type="button"
            onClick={() => navigate("/history")}
            className="h-12 rounded-xl border border-slate-700 font-semibold"
          >
            Ιστορικό
          </button>
        </div>

        <p className="pb-3 text-xs leading-5 text-slate-500">
          Η ανάλυση είναι ενημερωτική και δεν
          αποτελεί ιατρική συμβουλή. Οι επιδράσεις
          μπορεί να εξαρτώνται από ποσότητα,
          συχνότητα χρήσης, αλλεργίες και ατομικές
          ανάγκες.
        </p>
      </section>
    </main>
  );
}

function Result(props: {
  record: ProductAnalysisRecord;
  score: ScoreBreakdown;
  onReanalyze: () => void;
  onRetakePhoto: () => void;
}) {
  const category = readContentCategory(props.record);

  if (category === "unknown") {
    return (
      <section className="rounded-xl border border-amber-400/40 bg-amber-400/10 p-4">
        <p className="text-sm leading-6 text-amber-50">
          {props.record.unknownCategoryMessage ||
            "Δεν αναγνωρίστηκε ο τύπος περιεχομένου - δοκίμασε να φωτογραφίσεις πιο καθαρά τη λίστα συστατικών/διατροφικό πίνακα."}
        </p>

        <button
          type="button"
          onClick={props.onRetakePhoto}
          className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 font-bold text-slate-950"
        >
          <Camera size={18} />
          Ξαναπροσπάθησε
        </button>
      </section>
    );
  }

  const [label, color, borderColor] =
    bands[props.score.band];

  const isInsufficientData =
    props.score.band === "insufficient_data";

  const ingredientInsights =
    category === "ingredients"
      ? (props.record.ingredientInsights ??
        (props.record.structured
          ? deriveIngredientInsights(
              props.record.structured,
              props.score,
            )
          : []))
      : [];

  const executiveSummary =
    props.record.executiveSummary ??
    (category === "ingredients" && props.record.structured
      ? deriveExecutiveSummary(
          props.record.structured,
          props.score,
          ingredientInsights,
        )
      : {
          overallVerdict: "",
          safeIngredients: 0,
          cautionIngredients: 0,
          highImpactIngredients: 0,
          highlights: [],
          watchOutFor: [],
        });

  const summary =
    category === "nutrition"
      ? (props.record.nutritionAnalysis?.structured.summary ?? "")
      : category === "chemical_composition"
        ? (props.record.chemicalAnalysis?.structured.summary ?? "")
        : (props.record.structured?.summary ?? "");

  const nutritionInsights =
    props.record.nutritionAnalysis?.insights ?? [];

  const chemicalInsights =
    props.record.chemicalAnalysis?.insights ?? [];

  const itemCount =
    category === "ingredients"
      ? ingredientInsights.length
      : category === "nutrition"
        ? nutritionInsights.length
        : chemicalInsights.length;

  return (
    <>
      <section
        className={`rounded-2xl border bg-slate-900 p-5 ${borderColor}`}
      >
        <div className="flex items-center gap-5">
          <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-full bg-slate-800">
            <div className="text-center">
              <strong
                className={`text-3xl ${color}`}
              >
                {props.score.score ?? "-"}
              </strong>

              <span className="block text-xs text-slate-400">
                στα 100
              </span>
            </div>
          </div>

          <div className="min-w-0">
            <p
              className={`text-lg font-bold ${color}`}
            >
              {label}
            </p>

            <p className="mt-1 text-sm text-slate-400">
              Εμπιστοσύνη{" "}
              {Math.round(
                props.score.confidence * 100,
              )}
              %
            </p>

            {props.score.lowConfidenceReason && (
              <p className="mt-1 text-xs text-amber-400">
                {props.score.lowConfidenceReason}
              </p>
            )}

            {!isInsufficientData && (
              <button
                type="button"
                onClick={props.onReanalyze}
                className="mt-2 flex items-center gap-1 text-xs text-emerald-300"
              >
                <RefreshCw size={14} />
                Νέα ανάλυση
              </button>
            )}
          </div>
        </div>
      </section>

      {isInsufficientData && (
        <section className="rounded-xl border border-amber-400/40 bg-amber-400/10 p-4">
          <p className="text-sm leading-6 text-amber-50">
            {props.score.insufficientDataReasons.join(" ")}
          </p>

          <button
            type="button"
            onClick={props.onRetakePhoto}
            className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 font-bold text-slate-950"
          >
            <Camera size={18} />
            Ξαναπροσπάθησε
          </button>
        </section>
      )}

      <ExecutiveSummaryCard
        summary={executiveSummary}
        finalScore={props.score.score}
      />

      {summary && (
        <section className="rounded-xl border border-slate-800 bg-slate-900 p-4">
          <h2 className="font-bold">Περίληψη</h2>

          <p className="mt-2 text-sm leading-6 text-slate-300">
            {summary}
          </p>
        </section>
      )}

      <section>
        <div className="flex items-baseline justify-between px-1">
          <h2 className="font-bold">
            {sectionTitleByCategory[category]}
          </h2>

          <span className="text-xs text-slate-400">
            {itemCount} αναλύθηκαν
          </span>
        </div>

        <div className="mt-3 space-y-2">
          {category === "ingredients" &&
            ingredientInsights.map((insight) => (
              <IngredientCard
                key={insight.normalizedName}
                insight={insight}
              />
            ))}

          {category === "nutrition" &&
            nutritionInsights.map((insight) => (
              <NutritionCard
                key={insight.normalizedName}
                insight={insight}
              />
            ))}

          {category === "chemical_composition" &&
            chemicalInsights.map((insight) => (
              <ChemicalCard
                key={insight.normalizedName}
                insight={insight}
              />
            ))}
        </div>
      </section>

      <ScoreBreakdownPanel
        score={props.score}
        insights={category === "ingredients" ? ingredientInsights : []}
      />

      <section className="rounded-xl border border-slate-800 bg-slate-900 p-4">
        <h2 className="font-bold">Σύγκριση</h2>

        <p className="mt-2 text-sm text-slate-400">
          Δεν υπάρχουν ακόμη αρκετά συγκρίσιμα
          προϊόντα.
        </p>
      </section>
    </>
  );
}

