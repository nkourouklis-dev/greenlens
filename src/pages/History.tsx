import React from "react";
import { Search, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  clearHistory,
  deleteHistoryItem,
  getHistory,
  getStorageUsage,
} from "../services/historyService";
import type { ScanHistoryItem } from "../types";

function HistoryThumbnail(props: {
  item: ScanHistoryItem;
}) {
  const source =
    props.item.productPhoto ??
    props.item.ingredientsPhoto ??
    "";

  const classes =
    "h-16 w-16 shrink-0 rounded-lg bg-slate-800 object-cover";

  if (!source) {
    return <span className={classes} />;
  }

  return React.createElement("img", {
    src: source,
    alt: "Φωτογραφία προϊόντος",
    className: classes,
  });
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

  useEffect(() => {
    refresh();
  }, []);

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

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-5 text-white">
      <section className="mx-auto max-w-md">
        <div className="flex items-baseline justify-between">
          <h1 className="text-2xl font-bold">
            Ιστορικό
          </h1>

          <span className="text-xs text-slate-400">
            {usage.items} σαρώσεις,{" "}
            {usage.approximateKb} KB
          </span>
        </div>

        <label className="relative mt-5 block">
          <span className="sr-only">
            Αναζήτηση ιστορικού
          </span>

          <Search
            size={18}
            className="absolute left-3 top-3.5 text-slate-400"
          />

          <input
            value={query}
            onChange={(event) =>
              setQuery(event.target.value)
            }
            placeholder="Αναζήτηση προϊόντος ή barcode"
            className="h-11 w-full rounded-xl border border-slate-700 bg-slate-900 pl-10 pr-3 text-sm"
          />
        </label>

        {visible.length === 0 ? (
          <div className="mt-8 rounded-xl border border-slate-800 bg-slate-900 p-5">
            <p className="text-slate-300">
              Δεν υπάρχουν σαρώσεις που ταιριάζουν.
            </p>

            <button
              type="button"
              onClick={() => navigate("/scan")}
              className="mt-4 h-12 rounded-xl bg-emerald-500 px-4 font-bold text-slate-950"
            >
              Σάρωση πρώτου προϊόντος
            </button>
          </div>
        ) : (
          <div className="mt-5 space-y-3">
            {visible.map((item) => (
              <div
                key={item.id}
                className="rounded-xl border border-slate-800 bg-slate-900"
              >
                <div className="flex gap-3 p-3">
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

                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">
                        {item.productName ||
                          "Νέο προϊόν"}
                      </span>

                      <span className="mt-1 block text-xs text-slate-400">
                        {item.barcode}
                      </span>

                      <span className="mt-1 block text-xs text-slate-500">
                        {new Date(
                          item.scannedAt,
                        ).toLocaleString("el-GR")}
                      </span>
                    </span>
                  </button>

                  <div className="flex flex-col items-end justify-between">
                    <span className="text-xs">
                      {item.analysis &&
                      item.analysis.score.score !==
                        null ? (
                        <span className="rounded-full bg-emerald-500/15 px-2 py-1 text-emerald-200">
                          {
                            item.analysis.score
                              .score
                          }
                        </span>
                      ) : (
                        <span className="text-slate-400">
                          {item.analysis
                            ? "Ανεπαρκή"
                            : "Ετικέτα"}
                        </span>
                      )}
                    </span>

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
            ))}
          </div>
        )}

        <button
          type="button"
          onClick={() => navigate("/scan")}
          className="mt-6 h-14 w-full rounded-xl bg-emerald-500 font-bold text-slate-950"
        >
          Νέα σάρωση
        </button>

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
              className="mt-3 h-12 w-full rounded-xl border border-red-500/40 font-semibold text-red-300"
            >
              Καθαρισμός ιστορικού
            </button>
          ))}
      </section>
    </main>
  );
}