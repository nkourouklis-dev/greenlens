import {
  Camera,
  RefreshCw,
} from "lucide-react";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import {
  useNavigate,
  useParams,
} from "react-router-dom";
import { getHistoryItem } from "../services/historyService";
import { refreshFromCatalogue } from "../services/catalogueRefresh";
import {
  deriveAllergenNotice,
  deriveExecutiveSummary,
  deriveIngredientInsights,
} from "../utils/ingredientInsights";
import { scoreBandMeta } from "../utils/scoreBand";
import type {
  ContentCategory,
  IngredientRating,
  ProductAnalysisRecord,
  ScoreBreakdown,
} from "../types";
import { useAnalysisJobs } from "../services/analysisJobs";
import ShareScanButton from "../components/ShareScanButton";
import AllergenNoticeCard from "../components/AllergenNoticeCard";
import ExecutiveSummaryCard from "../components/ExecutiveSummaryCard";
import IngredientCard from "../components/IngredientCard";
import NutritionCard from "../components/NutritionCard";
import ChemicalCard from "../components/ChemicalCard";
import ScoreBreakdownPanel from "../components/ScoreBreakdownPanel";
import ScoreNoticesCard from "../components/ScoreNoticesCard";

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

export default function Product() {
  const { id = "" } = useParams();
  const navigate = useNavigate();

  // Re-renders this page when a background analysis finishes.
  useAnalysisJobs();

  // Bumped when the saved copy was replaced by the catalogue's newer one.
  const [, setRefreshed] = useState(0);

  const item = getHistoryItem(id);

  // What this phone saved is the result at the time of the scan. The shared
  // catalogue may have moved since (new scoring, corrected list, nutrition
  // found), so opening a product checks it and shows the current answer.
  const savedItem = getHistoryItem(id);
  const savedBarcode = savedItem?.barcode;
  const savedRunning = savedItem?.analysisState;

  useEffect(() => {
    const current = getHistoryItem(id);

    if (!current || !savedBarcode || savedRunning) {
      return;
    }

    let cancelled = false;

    void refreshFromCatalogue(current).then((updated) => {
      if (updated && !cancelled) {
        setRefreshed((count) => count + 1);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [id, savedBarcode, savedRunning]);

  if (!item) {
    return (
      <main className="min-h-screen bg-canvas px-4 py-6 text-ink">
        <section className="mx-auto max-w-md">
          <h1 className="text-2xl font-bold">
            Το προϊόν δεν βρέθηκε
          </h1>

          <button
            type="button"
            onClick={() => navigate("/scan")}
            className="mt-5 h-12 rounded-xl bg-emerald-500 px-4 font-bold text-on-accent"
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

  const photoSource =
    item.productPhoto ?? item.ingredientsPhoto ?? "";

  const category = record ? readContentCategory(record) : null;

  const categoryChip = record
    ? category === "ingredients"
      ? record.productType === "food"
        ? "Τρόφιμο"
        : record.productType === "cosmetic"
          ? "Καλλυντικό"
          : "Άγνωστη κατηγορία"
      : sectionTitleByCategory[category!] || "Άγνωστο περιεχόμενο"
    : null;

  const meta = scoreBandMeta[score.band];

  return (
    <main className="min-h-screen bg-canvas pb-5 text-ink">
      <section className="mx-auto max-w-md">
        <div className="relative h-64 w-full overflow-hidden bg-slate-800">
          {photoSource ? (
            <img
              src={photoSource}
              alt="Φωτογραφία προϊόντος"
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="h-full w-full bg-gradient-to-br from-emerald-800 via-slate-800 to-slate-900" />
          )}

          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-transparent" />

          {record && score.score != null && (
            <div className="absolute right-4 top-4 flex h-14 w-14 items-center justify-center rounded-full bg-white shadow-lg">
              <strong className={`text-lg font-extrabold ${meta.vividTextClass}`}>
                {score.score}
              </strong>
            </div>
          )}

          <div className="absolute inset-x-4 bottom-4">
            {categoryChip && (
              <span className="mb-2 inline-block rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur-sm">
                {categoryChip}
              </span>
            )}

            <h1 className="text-2xl font-bold leading-tight text-white drop-shadow-sm">
              {item.productName || "Νέο προϊόν"}
            </h1>

            <p className="mt-1 text-sm text-white/75">
              {item.barcode}
            </p>

            {record && (
              <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-black/35 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur-sm">
                <span className={`h-2 w-2 rounded-full ${meta.dotClass}`} />
                {meta.label}
              </span>
            )}
          </div>
        </div>

        <div className="space-y-4 px-4 pt-4">
        {!record && item.analysisState === "running" ? (
          <section
            role="status"
            className="rounded-2xl border border-slate-800 bg-slate-900 shadow-sm p-4"
          >
            <span className="block h-3 w-3 animate-pulse rounded-full bg-emerald-500" />

            <p className="mt-3 font-semibold">Αναλύεται…</p>

            <p className="mt-1 text-sm text-slate-400">
              Θα εμφανιστεί εδώ σε λίγα δευτερόλεπτα. Αν δεν θες να περιμένεις,
              μπορείς να σαρώσεις άλλο προϊόν και θα σε ειδοποιήσουμε όταν
              είναι έτοιμο.
            </p>

            <button
              type="button"
              onClick={() => navigate("/scan")}
              className="mt-4 h-12 w-full rounded-xl border border-slate-700 font-semibold"
            >
              Σάρωση άλλου προϊόντος
            </button>
          </section>
        ) : !record ? (
          <section className="rounded-2xl border border-slate-800 bg-slate-900 shadow-sm p-4">
            <p className="font-semibold">
              {item.analysisState === "failed"
                ? "Η ανάλυση δεν ολοκληρώθηκε"
                : "Η ετικέτα αναγνώστηκε"}
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
              className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 font-bold text-on-accent"
            >
              <RefreshCw size={18} />
              Ανάλυση συστατικών
            </button>
          </section>
        ) : (
          <Result
            record={record}
            score={score}
            onRetakePhoto={() =>
              navigate(
                `/ingredients-photo?barcode=${encodeURIComponent(item.barcode)}`,
              )
            }
            onAddMissingPhoto={() =>
              navigate(
                `/ingredients-photo?barcode=${encodeURIComponent(item.barcode)}&mergeInto=${encodeURIComponent(id)}`,
              )
            }
          />
        )}

        <ShareScanButton
          productName={item.productName}
          barcode={item.barcode}
          score={item.analysis?.score?.score}
          summary={
            category === "nutrition"
              ? record?.nutritionAnalysis?.structured.summary
              : category === "chemical_composition"
                ? record?.chemicalAnalysis?.structured.summary
                : record?.structured?.summary
          }
          positives={
            category === "nutrition"
              ? record?.nutritionAnalysis?.structured.positives
              : category === "chemical_composition"
                ? record?.chemicalAnalysis?.structured.positives
                : record?.structured?.positives
          }
          attentionItems={
            category === "nutrition"
              ? record?.nutritionAnalysis?.structured.attentionItems
              : category === "chemical_composition"
                ? record?.chemicalAnalysis?.structured.attentionItems
                : record?.structured?.attentionItems
          }
          allergens={
            record?.allergenNotice?.labels ??
            (category === "ingredients"
              ? record?.structured?.potentialAllergens
              : undefined)
          }
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
        </div>
      </section>
    </main>
  );
}

function Result(props: {
  record: ProductAnalysisRecord;
  score: ScoreBreakdown;
  onRetakePhoto: () => void;
  onAddMissingPhoto: () => void;
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
          className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 font-bold text-on-accent"
        >
          <Camera size={18} />
          Ξαναπροσπάθησε
        </button>
      </section>
    );
  }

  const isInsufficientData =
    props.score.band === "insufficient_data";

  // Single decision point, mirroring the Worker's own gate: a scan either
  // passed the content-sufficiency check (below, full score + verdict) or
  // it didn't (here, only the reason and a retry action) — never both. This
  // used to render the score circle, allergen card, executive summary and
  // score breakdown panel alongside this same message.
  if (isInsufficientData) {
    return (
      <section className="rounded-xl border border-amber-400/40 bg-amber-400/10 p-4">
        <p className="text-sm leading-6 text-amber-50">
          {props.score.insufficientDataReasons.join(" ")}
        </p>

        <button
          type="button"
          onClick={props.onRetakePhoto}
          className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 font-bold text-on-accent"
        >
          <Camera size={18} />
          Ξαναπροσπάθησε
        </button>
      </section>
    );
  }

  const { label, textClass: color, borderClass: borderColor } =
    scoreBandMeta[props.score.band];

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

  // Declared allergens are shown once, at the top, for every path that can
  // have them. A record saved before the Worker sent the notice gets it
  // derived from the names already stored on the device.
  const allergenNotice =
    props.record.allergenNotice !== undefined
      ? props.record.allergenNotice
      : category === "ingredients"
        ? deriveAllergenNotice(
            (props.record.structured?.ingredientFindings ?? []).map(
              (finding) => finding.ingredientName,
            ),
            props.record.structured?.potentialAllergens ?? [],
          )
        : category === "nutrition"
          ? deriveAllergenNotice(
              (
                props.record.nutritionAnalysis?.structured
                  .nutritionFindings ?? []
              ).map((finding) => finding.nutrient),
            )
          : null;

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

  type Entry = { rating: IngredientRating; impact: number; node: ReactNode };

  const entries: Entry[] =
    category === "ingredients"
      ? ingredientInsights.map((insight) => ({
          rating: insight.rating,
          impact: insight.scoreImpact,
          node: (
            <IngredientCard key={insight.normalizedName} insight={insight} />
          ),
        }))
      : category === "nutrition"
        ? nutritionInsights.map((insight) => ({
            rating: insight.rating,
            impact: insight.scoreImpact,
            node: (
              <NutritionCard key={insight.normalizedName} insight={insight} />
            ),
          }))
        : chemicalInsights.map((insight) => ({
            rating: insight.rating,
            impact: insight.scoreImpact,
            node: (
              <ChemicalCard key={insight.normalizedName} insight={insight} />
            ),
          }));

  const groups: Record<IngredientRating, Entry[]> = {
    caution: [],
    good: [],
    neutral: [],
  };

  for (const entry of entries) groups[entry.rating].push(entry);
  for (const list of Object.values(groups)) {
    list.sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact));
  }

  const leadsWithPositives =
    props.score.band === "excellent" || props.score.band === "good";

  const groupOrder: IngredientRating[] = leadsWithPositives
    ? ["good", "caution", "neutral"]
    : ["caution", "good", "neutral"];

  const groupTitle: Record<IngredientRating, string> = {
    caution: "Αρνητικά",
    good: "Θετικά",
    neutral: "Ουδέτερα",
  };

  return (
    <>
      <section
        className={`flex items-center justify-between gap-3 rounded-2xl border bg-slate-900 p-4 shadow-sm ${borderColor}`}
      >
        <div className="min-w-0">
          <p className={`text-base font-bold ${color}`}>
            {label}
          </p>

        </div>
      </section>

      <ScoreNoticesCard
        notices={props.score.notices}
        onAddPhoto={props.onAddMissingPhoto}
      />

      <AllergenNoticeCard notice={allergenNotice} />

      <section>
        <div className="flex items-baseline justify-between px-1">
          <h2 className="font-bold">
            {sectionTitleByCategory[category]}
          </h2>

          <span className="text-xs text-slate-400">
            {itemCount} αναλύθηκαν
          </span>
        </div>

        {/* GreenPoint-style: what hurts the score first, then what helps,
            so the reason behind the verdict is the first thing read. A
            clearly good product leads with its positives instead. */}
        {groupOrder.map((group) =>
          groups[group].length > 0 ? (
            <div key={group} className="mt-4">
              <h3 className="px-1 text-sm font-bold text-slate-300">
                {groupTitle[group]}
              </h3>

              <div className="mt-2 space-y-2">
                {groups[group].map((entry) => entry.node)}
              </div>
            </div>
          ) : null,
        )}
      </section>

      <ExecutiveSummaryCard summary={executiveSummary} />

      {summary && (
        <section className="rounded-2xl border border-slate-800 bg-slate-900 shadow-sm p-4">
          <h2 className="font-bold">Περίληψη</h2>

          <p className="mt-2 text-sm leading-6 text-slate-300">
            {summary}
          </p>
        </section>
      )}

      <ScoreBreakdownPanel
        score={props.score}
        insights={category === "ingredients" ? ingredientInsights : []}
      />

      <section className="rounded-2xl border border-slate-800 bg-slate-900 shadow-sm p-4">
        <h2 className="font-bold">Σύγκριση</h2>

        <p className="mt-2 text-sm text-slate-400">
          Δεν υπάρχουν ακόμη αρκετά συγκρίσιμα
          προϊόντα.
        </p>
      </section>
    </>
  );
}

