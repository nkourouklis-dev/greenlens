import { ScanLine, Search, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  clearHistory,
  deleteHistoryItem,
  getHistory,
  getStorageUsage,
} from "../services/historyService";
import { formatRelativeDate, scoreBandMeta } from "../utils/scoreBand";
import type { ScanHistoryItem } from "../types";
import { useAnalysisJobs } from "../services/analysisJobs";

function HistoryThumbnail(props: {
  item: ScanHistoryItem;
}) {
  const source =
    props.item.productPhoto ??
    props.item.ingredientsPhoto ??
    "";

  const classes =
    "h-20 w-20 shrink-0 rounded-2xl bg-slate-800 object-cover";

  if (!source) {
    return <span className={classes} />;
  }

  return (
    <img
      src={source}
      alt="Φωτογραφία προϊόντος"
      className={classes}
    />
  );
}

export default function History() {
  const navigate = useNavigate();

  const [history, setHistory] = useState<
    ScanHistoryItem[]
  >([]);

  const [query, setQuery] = useState("");

  const [usage, setUsage] = useState({
    items: 0,
    approximateKb: 0,
  });

  const [pendingDelete, setPendingDelete] =
    useState<string | null>(null);

  const [showClearConfirm, setShowClearConfirm] =
    useState(false);

  function refresh() {
    setHistory(getHistory());
    setUsage(getStorageUsage());
  }

  // Re-read the list whenever a background analysis starts or finishes, so
  // "Αναλύεται…" turns into the score without leaving the page.
  const { running } = useAnalysisJobs();

  useEffect(() => {
    refresh();
  }, [running]);

  function handleDelete(id: string) {
    deleteHistoryItem(id);
    setPendingDelete(null);
    refresh();
  }

  function handleClearAll() {
    clearHistory();
    setShowClearConfirm(false);
    refresh();
  }

  const visible = history.filter((item) =>
    (
      (item.productName || "Νέο προϊόν") +
      " " +
      item.barcode
    )
      .toLowerCase()
      .includes(query.toLowerCase()),
  );

  const scores = history
    .map((item) => item.analysis?.score?.score)
    .filter((score): score is number => typeof score === "number");
  const average = scores.length
    ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length)
    : null;
  const goodCount = history.filter((item) => {
    const band = item.analysis?.score?.band;
    return band === "excellent" || band === "good";
  }).length;
  const attentionCount = history.filter((item) => {
    const band = item.analysis?.score?.band;
    return band === "attention" || band === "high_attention";
  }).length;

  const stats = [
    { label: "Σαρώσεις", value: String(usage.items) },
    { label: "Μέσος όρος", value: average !== null ? String(average) : "–" },
    { label: "Καλές επιλογές", value: String(goodCount) },
    { label: "Με προσοχή", value: String(attentionCount) },
  ];

  return (
    <main className="min-h-screen bg-canvas text-ink">
      {/* Dark header, same language as the home hero */}
      <div className="relative mx-4 mt-1 overflow-hidden rounded-3xl bg-gradient-to-br from-[#052e22] via-[#064e3b] to-[#0b7a52] px-4 pb-5 pt-5 text-white shadow-lg shadow-emerald-900/20">
        <div
          aria-hidden
          className="gl-drift pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-[#34d399]/30 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              "radial-gradient(circle, #fff 1px, transparent 1px)",
            backgroundSize: "22px 22px",
          }}
        />

        <div className="relative mx-auto max-w-md">
          <h1 className="text-3xl font-extrabold tracking-tight">
            Ιστορικό<span className="text-[#6ee7b7]">.</span>
          </h1>
          <p className="mt-1 text-sm text-emerald-50/70">
            Όλα όσα έχεις σαρώσει, αποθηκευμένα στη συσκευή σου.
          </p>

          {history.length > 0 && (
            <div className="mt-5 grid grid-cols-4 gap-2">
              {stats.map(({ label, value }) => (
                <div
                  key={label}
                  className="rounded-2xl border border-white/15 bg-white/10 px-2 py-2.5 text-center backdrop-blur"
                >
                  <p className="text-xl font-extrabold leading-none">{value}</p>
                  <p className="mt-1 text-[10px] font-semibold leading-tight text-emerald-50/70">
                    {label}
                  </p>
                </div>
              ))}
            </div>
          )}

          <label className="relative mt-5 block">
            <span className="sr-only">
              Αναζήτηση ιστορικού
            </span>

            <Search
              size={18}
              className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
            />

            <input
              value={query}
              onChange={(event) =>
                setQuery(event.target.value)
              }
              placeholder="Αναζήτηση προϊόντος ή barcode"
              className="h-12 w-full rounded-full border-0 bg-white pl-11 pr-4 text-sm text-ink shadow-lg shadow-black/20"
            />
          </label>
        </div>
      </div>

      <section className="mx-auto max-w-md px-4 pb-6 pt-6">
        {visible.length === 0 ? (
          <div className="rounded-3xl border border-line-subtle bg-surface p-7 text-center shadow-sm">
            <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/15 text-accent-strong">
              <ScanLine size={30} />
            </span>
            <p className="mt-4 text-lg font-bold">
              {history.length === 0
                ? "Δεν έχεις σαρώσει τίποτα ακόμα"
                : "Δεν βρέθηκε κάτι"}
            </p>
            <p className="mt-1 text-sm text-ink-faint">
              {history.length === 0
                ? "Σάρωσε το πρώτο σου προϊόν και θα εμφανιστεί εδώ με τη βαθμολογία του."
                : "Δοκίμασε άλλο όνομα ή barcode."}
            </p>

            {history.length === 0 && (
              <button
                type="button"
                onClick={() => navigate("/scan")}
                className="mt-5 h-12 rounded-full bg-accent px-6 font-bold text-on-accent shadow-lg shadow-emerald-500/25 transition active:scale-[0.98]"
              >
                Σάρωση πρώτου προϊόντος
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {visible.map((item) => {
              const band = item.analysis?.score?.band;
              const meta = band ? scoreBandMeta[band] : null;
              const numericScore = item.analysis?.score?.score;

              return (
              <div
                key={item.id}
                className="overflow-hidden rounded-3xl border border-line-subtle bg-surface shadow-sm transition active:scale-[0.99]"
              >
                <div className="flex">
                  {/* Band-coloured edge, readable at a glance */}
                  <span
                    className={`w-1.5 shrink-0 ${meta ? meta.dotClass : "bg-slate-600"}`}
                  />
                  <div className="flex min-w-0 flex-1 gap-3 p-3">
                  <button
                    type="button"
                    onClick={() =>
                      navigate(
                        "/product/" + item.id,
                      )
                    }
                    className="flex min-w-0 flex-1 gap-3 text-left"
                  >
                    <HistoryThumbnail
                      item={item}
                    />

                    <span className="min-w-0 flex-1 py-0.5">
                      <span className="block truncate text-[15px] font-bold">
                        {item.productName ||
                          "Νέο προϊόν"}
                      </span>

                      <span className="mt-0.5 block truncate text-xs text-slate-400">
                        {item.barcode}
                      </span>

                      <span className="mt-2 flex items-center gap-2">
                        {meta ? (
                          <span
                            className={`inline-flex items-center gap-1.5 rounded-full bg-slate-800 px-2 py-1 text-[11px] font-semibold ${meta.vividTextClass}`}
                          >
                            <span
                              className={`h-1.5 w-1.5 rounded-full ${meta.dotClass}`}
                            />
                            {meta.label}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-500">
                            {item.analysisState === "running"
                              ? "Αναλύεται…"
                              : item.analysisState === "failed"
                                ? "Η ανάλυση απέτυχε"
                                : item.analysis
                                  ? "Ανεπαρκή στοιχεία"
                                  : "Εκκρεμεί ανάλυση"}
                          </span>
                        )}

                        <span className="text-[11px] text-slate-500">
                          {formatRelativeDate(item.scannedAt)}
                        </span>
                      </span>
                    </span>
                  </button>

                  <div className="flex flex-col items-center justify-between">
                    {numericScore != null && meta && (
                      <span
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-800 text-sm font-extrabold ${meta.vividTextClass}`}
                      >
                        {numericScore}
                      </span>
                    )}

                    <button
                      type="button"
                      onClick={() =>
                        setPendingDelete(item.id)
                      }
                      aria-label="Διαγραφή σάρωσης"
                      className="rounded-lg p-2 text-slate-400"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                  </div>
                </div>

                {pendingDelete === item.id && (
                  <div className="border-t border-slate-800 p-3">
                    <p className="text-sm text-slate-300">
                      Διαγραφή αυτής της σάρωσης;
                    </p>

                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          handleDelete(item.id)
                        }
                        className="h-11 flex-1 rounded-xl bg-red-500 font-bold text-white"
                      >
                        Διαγραφή
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          setPendingDelete(null)
                        }
                        className="h-11 flex-1 rounded-xl border border-slate-700 font-semibold"
                      >
                        Ακύρωση
                      </button>
                    </div>
                  </div>
                )}
              </div>
              );
            })}
          </div>
        )}

        {history.length > 0 && (
          <button
            type="button"
            onClick={() => navigate("/scan")}
            className="mt-6 flex h-14 w-full items-center justify-center gap-2 rounded-full bg-accent font-bold text-on-accent shadow-lg shadow-emerald-500/25 transition active:scale-[0.98]"
          >
            <ScanLine size={20} />
            Νέα σάρωση
          </button>
        )}

        {history.length > 0 &&
          (showClearConfirm ? (
            <div className="mt-4 rounded-xl border border-red-500/40 bg-red-950/30 p-4">
              <p className="text-sm text-red-100">
                Θα διαγραφούν όλες οι σαρώσεις και
                οι φωτογραφίες από τη συσκευή.
              </p>

              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={handleClearAll}
                  className="h-11 flex-1 rounded-xl bg-red-500 font-bold text-white"
                >
                  Διαγραφή όλων
                </button>

                <button
                  type="button"
                  onClick={() =>
                    setShowClearConfirm(false)
                  }
                  className="h-11 flex-1 rounded-xl border border-slate-700 font-semibold"
                >
                  Ακύρωση
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() =>
                setShowClearConfirm(true)
              }
              className="mt-3 h-12 w-full rounded-full border border-red-500/40 font-semibold text-red-300"
            >
              Καθαρισμός ιστορικού
            </button>
          ))}
      </section>
    </main>
  );
}
