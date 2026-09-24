import { useCallback, useEffect, useState } from "react";
import {
  useNavigate,
  useParams,
} from "react-router-dom";
import { startAnalysis } from "../services/analysisJobs";

// Waiting view for an analysis someone is deliberately watching (the "new
// analysis" and "add missing photo" buttons). The work itself lives in
// analysisJobs, so leaving this page never cancels it.
export default function AnalysisRun() {
  const { id = "" } = useParams();
  const navigate = useNavigate();

  const [message, setMessage] = useState(
    "Προετοιμασία ανάλυσης...",
  );

  const [error, setError] = useState("");

  const performAnalysis = useCallback(() => {
    setError("");
    setMessage(
      "Αναλύω το επιβεβαιωμένο κείμενο. Μπορεί να διαρκέσει έως 30 δευτερόλεπτα.",
    );

    startAnalysis(id).then((outcome) => {
      if (outcome.ok) {
        navigate(`/product/${id}`, { replace: true });
      } else {
        setError(outcome.message);
      }
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
