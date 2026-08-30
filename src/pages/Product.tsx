import React from "react";
import {
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
import type {
  FindingSeverity,
  IngredientFinding,
  ProductAnalysisRecord,
  ScoreBreakdown,
} from "../types";

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

const severityLabels: Record<
  FindingSeverity,
  [string, string]
> = {
  positive: [
    "Θετικό",
    "bg-emerald-500/15 text-emerald-200",
  ],
  info: [
    "Ουδέτερο",
    "bg-slate-700/50 text-slate-300",
  ],
  attention: [
    "Προσοχή",
    "bg-amber-500/15 text-amber-200",
  ],
  high_attention: [
    "Υψηλή προσοχή",
    "bg-red-500/15 text-red-200",
  ],
  unknown: [
    "Άγνωστο",
    "bg-slate-700/50 text-slate-400",
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
  const [open, setOpen] = useState<
    string | null
  >(null);

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

            {record && (
              <p className="mt-2 inline-block rounded-full bg-slate-800 px-2 py-1 text-xs text-slate-300">
                {record.productType === "food"
                  ? "Τρόφιμο"
                  : record.productType ===
                      "cosmetic"
                    ? "Καλλυντικό"
                    : "Άγνωστη κατηγορία"}
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
            open={open}
            setOpen={setOpen}
            onReanalyze={() =>
              navigate(
                `/product/${id}/analysis`,
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

function countSeverities(
  findings: IngredientFinding[],
) {
  let safe = 0;
  let attention = 0;
  let high = 0;

  for (const finding of findings) {
    if (
      finding.severity === "positive" ||
      finding.severity === "info"
    ) {
      safe += 1;
      continue;
    }

    if (finding.severity === "attention") {
      attention += 1;
      continue;
    }

    if (finding.severity === "high_attention") {
      high += 1;
    }
  }

  return { safe, attention, high };
}

function Result(props: {
  record: ProductAnalysisRecord;
  score: ScoreBreakdown;
  open: string | null;
  setOpen: (value: string | null) => void;
  onReanalyze: () => void;
}) {
  const [label, color, borderColor] =
    bands[props.score.band];

  const counts = countSeverities(
    props.record.structured.ingredientFindings,
  );

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

            <button
              type="button"
              onClick={props.onReanalyze}
              className="mt-2 flex items-center gap-1 text-xs text-emerald-300"
            >
              <RefreshCw size={14} />
              Νέα ανάλυση
            </button>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-3 gap-2">
          <div className="rounded-xl bg-emerald-500/10 p-3 text-center">
            <strong className="block text-xl text-emerald-300">
              {counts.safe}
            </strong>

            <span className="text-xs text-emerald-200">
              Ασφαλή
            </span>
          </div>

          <div className="rounded-xl bg-amber-500/10 p-3 text-center">
            <strong className="block text-xl text-amber-300">
              {counts.attention}
            </strong>

            <span className="text-xs text-amber-200">
              Προσοχή
            </span>
          </div>

          <div className="rounded-xl bg-red-500/10 p-3 text-center">
            <strong className="block text-xl text-red-300">
              {counts.high}
            </strong>

            <span className="text-xs text-red-200">
              Υψηλή προσοχή
            </span>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-slate-800 bg-slate-900 p-4">
        <h2 className="font-bold">Με μια ματιά</h2>

        <p className="mt-2 text-sm leading-6 text-slate-300">
          {props.record.structured.summary}
        </p>
      </section>

      <Cards
        title="Θετικά"
        items={
          props.record.structured.positives
        }
      />

      <Cards
        title="Σημεία προσοχής"
        items={
          props.record.structured.attentionItems
        }
      />

      <Cards
        title="Πιθανά αλλεργιογόνα"
        items={
          props.record.structured
            .potentialAllergens
        }
      />

      <section>
        <div className="flex items-baseline justify-between px-1">
          <h2 className="font-bold">
            Συστατικά
          </h2>

          <span className="text-xs text-slate-400">
            {
              props.record.structured
                .ingredientFindings.length
            }{" "}
            αναλύθηκαν
          </span>
        </div>

        <div className="mt-3 space-y-2">
          {props.record.structured.ingredientFindings.map(
            (finding) => {
              const [
                severityLabel,
                severityClass,
              ] =
                severityLabels[
                  finding.severity
                ] ??
                severityLabels.unknown;

              const key =
                finding.normalizedName +
                "-" +
                finding.title;

              return (
                <article
                  key={key}
                  className="rounded-xl border border-slate-800 bg-slate-900"
                >
                  <button
                    type="button"
                    onClick={() =>
                      props.setOpen(
                        props.open === key
                          ? null
                          : key,
                      )
                    }
                    className="flex min-h-12 w-full items-center justify-between gap-3 px-4 py-3 text-left"
                  >
                    <span className="min-w-0 flex-1 truncate font-semibold">
                      {finding.ingredientName}
                    </span>

                    <span
                      className={`shrink-0 rounded-full px-2 py-1 text-xs ${severityClass}`}
                    >
                      {severityLabel}
                    </span>
                  </button>

                  {props.open === key && (
                    <div className="border-t border-slate-800 px-4 py-3 text-sm leading-6 text-slate-300">
                      <p className="font-semibold text-slate-200">
                        {finding.title}
                      </p>

                      <p className="mt-1">
                        {finding.explanation}
                      </p>

                                            {finding.sourceUrl &&
                        React.createElement(
                          "a",
                          {
                            href: finding.sourceUrl,
                            target: "_blank",
                            rel: "noreferrer",
                            className:
                              "mt-2 inline-block text-emerald-300 underline",
                          },
                          finding.sourceName ||
                            "Πηγή",
                        )}
                    </div>
                  )}
                </article>
              );
            },
          )}
        </div>
      </section>

      <section className="rounded-xl border border-slate-800 bg-slate-900 p-4">
        <h2 className="font-bold">
          Ανάλυση βαθμολογίας
        </h2>

        {props.score.score === null ? (
          <p className="mt-2 text-sm text-slate-400">
            {props.score.insufficientDataReasons.join(
              " ",
            )}
          </p>
        ) : props.score.deductions.length ===
          0 ? (
          <p className="mt-2 text-sm text-slate-400">
            Δεν εντοπίστηκαν αφαιρέσεις βαθμών.
          </p>
        ) : (
          props.score.deductions.map(
            (deduction) => (
              <div
                key={deduction.code}
                className="mt-3"
              >
                <div className="flex justify-between text-sm font-semibold">
                  <span>{deduction.title}</span>

                  <span className="text-orange-300">
                    -{deduction.points}
                  </span>
                </div>

                <p className="mt-1 text-sm text-slate-400">
                  {deduction.explanation}
                </p>
              </div>
            ),
          )
        )}
      </section>

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

function Cards(props: {
  title: string;
  items: string[];
}) {
  if (props.items.length === 0) {
    return null;
  }

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900 p-4">
      <h2 className="font-bold">
        {props.title}
      </h2>

      <ul className="mt-2 space-y-1 text-sm text-slate-300">
        {props.items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </section>
  );
}