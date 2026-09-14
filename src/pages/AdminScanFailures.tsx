import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import AdminGate from "../components/AdminGate";
import {
  listAdminScanFailures,
  type AdminScanFailure,
} from "../services/adminProductsClient";

const CATEGORY_LABEL: Record<string, string> = {
  ingredients: "Συστατικά",
  nutrition: "Διατροφικά",
  chemical_composition: "Χημική ανάλυση",
  unknown: "Άγνωστο",
};

const CATEGORY_BADGE: Record<string, string> = {
  ingredients: "bg-emerald-500/15 text-emerald-300",
  nutrition: "bg-blue-500/15 text-blue-300",
  chemical_composition: "bg-purple-500/15 text-purple-300",
  unknown: "bg-amber-500/15 text-amber-300",
};

function AdminScanFailuresContent() {
  const navigate = useNavigate();

  const [failures, setFailures] = useState<AdminScanFailure[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [expanded, setExpanded] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    listAdminScanFailures()
      .then((rows) => {
        if (!cancelled) {
          setFailures(rows);
        }
      })
      .catch((caughtError: unknown) => {
        if (!cancelled) {
          setLoadError(
            caughtError instanceof Error
              ? caughtError.message
              : "Η λίστα δεν φορτώθηκε.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="min-h-screen bg-canvas px-4 pb-28 pt-5 text-ink">
      <section className="mx-auto max-w-2xl">
        <button
          type="button"
          onClick={() => navigate("/admin")}
          className="text-sm font-semibold text-accent"
        >
          ← Πίσω στα προϊόντα
        </button>

        <h1 className="mt-3 text-xl font-bold">Αποτυχίες σάρωσης</h1>

        <p className="mt-1 text-sm leading-6 text-ink-muted">
          Κάθε σάρωση που η εφαρμογή αρνήθηκε να βαθμολογήσει, με το κείμενο
          που διάβασε. Το κείμενο είναι το χρήσιμο κομμάτι: δείχνει αν
          έφταιγε η φωτογραφία ή ο κώδικας.
        </p>

        {isLoading && (
          <p className="mt-5 text-sm text-ink-faint">Φόρτωση...</p>
        )}

        {loadError && (
          <p
            role="alert"
            className="mt-5 rounded-xl border border-red-500/40 bg-red-950/40 p-3 text-sm text-red-100"
          >
            {loadError}
          </p>
        )}

        {!isLoading && !loadError && failures.length === 0 && (
          <p className="mt-5 rounded-xl border border-line-subtle bg-surface/70 p-4 text-sm leading-6 text-ink-muted">
            Καμία αποτυχία καταγεγραμμένη. Είτε όλα δουλεύουν, είτε δεν
            έχει σαρώσει ακόμα κανείς.
          </p>
        )}

        <div className="mt-4 space-y-3">
          {failures.map((failure) => (
            <article
              key={failure.id}
              className="rounded-2xl border border-line-subtle bg-surface/70 p-3"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                    CATEGORY_BADGE[failure.contentCategory] ??
                    "bg-slate-500/15 text-slate-300"
                  }`}
                >
                  {CATEGORY_LABEL[failure.contentCategory] ??
                    failure.contentCategory}
                </span>

                {failure.barcode ? (
                  <button
                    type="button"
                    onClick={() =>
                      navigate(`/admin/products/${failure.barcode}`)
                    }
                    className="font-mono text-sm font-semibold text-accent"
                  >
                    {failure.barcode}
                  </button>
                ) : (
                  <span className="text-sm text-ink-faint">χωρίς barcode</span>
                )}

                <span className="ml-auto text-xs text-ink-faint">
                  {failure.createdAt}
                </span>
              </div>

              <ul className="mt-2 space-y-1">
                {failure.reasons.map((reason, index) => (
                  <li
                    key={index}
                    className="text-sm leading-5 text-ink-muted"
                  >
                    • {reason}
                  </li>
                ))}
              </ul>

              <p className="mt-2 text-xs text-ink-faintest">
                OCR:{" "}
                {failure.ocrConfidence === null
                  ? "—"
                  : failure.ocrConfidence.toFixed(2)}
                {failure.labelType ? ` · ${failure.labelType}` : ""}
              </p>

              <button
                type="button"
                onClick={() =>
                  setExpanded(expanded === failure.id ? null : failure.id)
                }
                className="mt-2 text-xs font-semibold text-accent"
              >
                {expanded === failure.id
                  ? "Απόκρυψη κειμένου"
                  : "Κείμενο που διαβάστηκε"}
              </button>

              {expanded === failure.id && (
                <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap rounded-lg border border-line bg-canvas p-2 text-xs leading-5 text-ink-muted">
                  {failure.sourceText}
                </pre>
              )}
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}

export default function AdminScanFailures() {
  return (
    <AdminGate>
      <AdminScanFailuresContent />
    </AdminGate>
  );
}
