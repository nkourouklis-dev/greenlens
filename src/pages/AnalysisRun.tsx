import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Loader2, WifiOff } from "lucide-react";
import { startAnalysis } from "../services/analysisJobs";
import PageHeader from "../components/PageHeader";

type Phase = "running" | "offline" | "failed";

/** After this long the screen says so and offers to leave, instead of spinning on. */
const SLOW_AFTER_S = 20;

// Waiting view for an analysis someone is deliberately watching (the "new
// analysis" and "add missing photo" buttons). The work itself lives in
// analysisJobs, so leaving this page never cancels it, and the photo and the
// confirmed text stay on the device for a retry.
export default function AnalysisRun() {
  const { id = "" } = useParams();
  const navigate = useNavigate();

  const [phase, setPhase] = useState<Phase>(() =>
    typeof navigator !== "undefined" && navigator.onLine === false
      ? "offline"
      : "running",
  );
  const [error, setError] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const startedAt = useRef(0);

  const performAnalysis = useCallback(() => {
    if (navigator.onLine === false) {
      setPhase("offline");
      return;
    }

    setError("");
    setPhase("running");
    startedAt.current = Date.now();
    setElapsed(0);

    startAnalysis(id).then((outcome) => {
      if (outcome.ok) {
        navigate(`/product/${id}`, { replace: true });
        return;
      }

      setError(outcome.message);
      setPhase(navigator.onLine === false ? "offline" : "failed");
    });
  }, [id, navigate]);

  useEffect(() => {
    performAnalysis();
  }, [performAnalysis]);

  // Back online: carry on by itself, the user should not have to notice.
  useEffect(() => {
    const onOnline = () => {
      if (phase === "offline") performAnalysis();
    };

    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [phase, performAnalysis]);

  useEffect(() => {
    if (phase !== "running") return;

    const timer = window.setInterval(
      () => setElapsed(Math.round((Date.now() - startedAt.current) / 1000)),
      1000,
    );

    return () => window.clearInterval(timer);
  }, [phase]);

  return (
    <main className="min-h-dvh bg-canvas px-4 text-ink">
      <PageHeader eyebrow="GreenLens" title="Ανάλυση προϊόντος" />

      <section className="mx-auto flex max-w-md flex-col gap-4">
        {phase === "running" && (
          <>
            <div
              role="status"
              aria-live="polite"
              className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-4"
            >
              <Loader2
                size={22}
                className="shrink-0 animate-spin text-accent-strong"
                aria-hidden
              />
              <div className="min-w-0">
                <p className="font-semibold text-ink">
                  Διαβάζω τα συστατικά και υπολογίζω τη βαθμολογία
                </p>
                <p className="mt-0.5 text-sm text-ink-faint">
                  {elapsed < SLOW_AFTER_S
                    ? `${elapsed} δευτ.`
                    : `${elapsed} δευτ. · Αργεί περισσότερο από το συνηθισμένο.`}
                </p>
              </div>
            </div>

            {elapsed >= SLOW_AFTER_S && (
              <button
                type="button"
                onClick={() => navigate("/scan")}
                className="h-12 rounded-xl border border-line bg-surface font-semibold text-ink"
              >
                Συνέχισε να σκανάρεις, θα σε ειδοποιήσω
              </button>
            )}

            {/* The shape of the result, so the wait reads as "almost there". */}
            <div aria-hidden className="flex flex-col gap-3">
              <div className="flex items-center gap-4 rounded-2xl border border-line-subtle bg-surface p-4">
                <div className="h-16 w-16 animate-pulse rounded-full bg-surface-muted" />
                <div className="flex flex-1 flex-col gap-2">
                  <div className="h-4 w-2/3 animate-pulse rounded bg-surface-muted" />
                  <div className="h-3 w-1/2 animate-pulse rounded bg-surface-muted" />
                </div>
              </div>
              {[0, 1, 2].map((row) => (
                <div
                  key={row}
                  className="h-14 animate-pulse rounded-2xl border border-line-subtle bg-surface"
                />
              ))}
            </div>

            <p className="text-center text-xs leading-5 text-ink-faint">
              Η βαθμολογία βγαίνει από σταθερούς κανόνες, ίδια κάθε φορά για
              το ίδιο προϊόν.
            </p>
          </>
        )}

        {phase === "offline" && (
          <div
            role="status"
            aria-live="polite"
            className="flex gap-3 rounded-2xl border border-amber-300/40 bg-amber-950 p-4"
          >
            <WifiOff size={22} className="mt-0.5 shrink-0 text-amber-400" aria-hidden />
            <div>
              <p className="font-semibold text-ink">Δεν υπάρχει σύνδεση</p>
              <p className="mt-1 text-sm leading-5 text-ink-muted">
                Η φωτογραφία και το κείμενο έχουν κρατηθεί. Η ανάλυση θα
                ξεκινήσει μόλις επανέλθει το internet.
              </p>
            </div>
          </div>
        )}

        {phase === "failed" && (
          <>
            <div
              role="alert"
              className="rounded-2xl border border-red-300/40 bg-red-950 p-4"
            >
              <p className="font-semibold text-ink">Η ανάλυση δεν ολοκληρώθηκε</p>
              <p className="mt-1 text-sm leading-5 text-ink-muted">{error}</p>
              <p className="mt-2 text-xs text-ink-faint">
                Η φωτογραφία και το κείμενο έχουν κρατηθεί.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => navigate(`/product/${id}`)}
                className="h-12 rounded-xl border border-line bg-surface font-semibold text-ink-muted"
              >
                Πίσω στο προϊόν
              </button>

              <button
                type="button"
                onClick={performAnalysis}
                className="h-12 rounded-xl bg-accent font-bold text-on-accent"
              >
                Δοκιμή ξανά
              </button>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
