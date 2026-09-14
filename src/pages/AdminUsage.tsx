import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import AdminGate from "../components/AdminGate";
import {
  getAdminUsage,
  type AdminUsage as AdminUsageData,
  type AdminUsageBudget,
  type UsageLevel,
} from "../services/adminProductsClient";

const LEVEL_TEXT: Record<UsageLevel, string> = {
  ok: "text-emerald-300",
  warning: "text-amber-300",
  over: "text-red-300",
};

const LEVEL_BAR: Record<UsageLevel, string> = {
  ok: "bg-emerald-400",
  warning: "bg-amber-400",
  over: "bg-red-400",
};

const PERIOD_LABEL: Record<AdminUsageBudget["period"], string> = {
  day: "σήμερα",
  month: "αυτόν τον μήνα",
};

function percentOf(ratio: number): number {
  return Math.round(ratio * 1000) / 10;
}

function BudgetBar({ budget }: { budget: AdminUsageBudget }) {
  const percent = percentOf(budget.ratio);

  return (
    <article className="rounded-2xl border border-line-subtle bg-surface/70 p-4">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <h2 className="text-base font-bold">{budget.label}</h2>

        <span className="text-sm text-ink-faint">
          {PERIOD_LABEL[budget.period]}
        </span>

        <span
          className={`ml-auto font-mono text-sm font-semibold tabular-nums ${LEVEL_TEXT[budget.level]}`}
        >
          {percent}%
        </span>
      </div>

      <p className="mt-1 font-mono text-sm tabular-nums text-ink-muted">
        {budget.used.toLocaleString("el-GR")} /{" "}
        {budget.limit.toLocaleString("el-GR")}
      </p>

      {/* The 80% mark is drawn on the track, so "πόσο κοντά είμαι" is a
          glance rather than a calculation. */}
      <div
        className="relative mt-3 h-2.5 w-full overflow-hidden rounded-full bg-surface-muted"
        role="img"
        aria-label={`${percent}% του ορίου`}
      >
        <div
          className={`h-full rounded-full transition-all ${LEVEL_BAR[budget.level]}`}
          style={{ width: `${Math.min(100, percent)}%` }}
        />

        <span
          aria-hidden="true"
          className="absolute inset-y-0 w-px bg-ink-faint/60"
          style={{ left: "80%" }}
        />
      </div>

      <p className="mt-2 text-xs leading-5 text-ink-faint">{budget.note}</p>
    </article>
  );
}

function HistoryChart({ usage }: { usage: AdminUsageData }) {
  const peak = Math.max(
    1,
    ...usage.history.map(
      (day) => day.azureOcr + day.workersAiVision + day.workersAiText,
    ),
  );

  return (
    <section className="mt-6 rounded-2xl border border-line-subtle bg-surface/70 p-4">
      <h2 className="text-base font-bold">Τελευταίες 30 ημέρες</h2>

      <p className="mt-1 text-sm leading-6 text-ink-muted">
        Χρεώσιμες κλήσεις ανά ημέρα. Κορυφή: {peak.toLocaleString("el-GR")}.
      </p>

      <div className="mt-4 flex h-28 items-end gap-[3px]">
        {usage.history.map((day) => {
          const total = day.azureOcr + day.workersAiVision + day.workersAiText;

          return (
            <div
              key={day.day}
              title={`${day.day}: ${total} κλήσεις`}
              className="flex h-full flex-1 flex-col justify-end"
            >
              <div
                className={total > 0 ? "rounded-sm bg-accent" : "bg-line"}
                style={{
                  height: total > 0 ? `${(total / peak) * 100}%` : "1px",
                }}
              />
            </div>
          );
        })}
      </div>

      <div className="mt-2 flex justify-between font-mono text-[11px] text-ink-faintest">
        <span>{usage.history[0]?.day}</span>
        <span>{usage.history[usage.history.length - 1]?.day}</span>
      </div>
    </section>
  );
}

function AdminUsageContent() {
  const navigate = useNavigate();

  const [usage, setUsage] = useState<AdminUsageData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let cancelled = false;

    getAdminUsage()
      .then((result) => {
        if (!cancelled) {
          setUsage(result);
        }
      })
      .catch((caughtError: unknown) => {
        if (!cancelled) {
          setLoadError(
            caughtError instanceof Error
              ? caughtError.message
              : "Τα στοιχεία χρήσης δεν φορτώθηκαν.",
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

        <h1 className="mt-3 text-xl font-bold">Χρήση και όρια</h1>

        <p className="mt-1 text-sm leading-6 text-ink-muted">
          Τι ξόδεψε η εφαρμογή, μετρημένο εκεί που ξοδεύεται. Σάρωση barcode
          που υπάρχει ήδη στον κατάλογο δεν χρεώνεται καθόλου — απαντιέται από
          τη βάση πριν ζητηθεί φωτογραφία.
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

        {usage && (
          <>
            {usage.level !== "ok" && (
              <p
                role="alert"
                className={`mt-5 rounded-xl border p-3 text-sm leading-6 ${
                  usage.level === "over"
                    ? "border-red-500/40 bg-red-950/40 text-red-100"
                    : "border-amber-500/40 bg-amber-950/40 text-amber-100"
                }`}
              >
                {usage.level === "over"
                  ? "Ένα όριο εξαντλήθηκε. Οι σαρώσεις των χρηστών είναι ΣΕ ΠΑΥΣΗ μέχρι να ανανεωθεί το όριο — ανέβασε το budget αν θέλεις να συνεχίσουν τώρα."
                  : "Ένα όριο πέρασε το 80%. Υπάρχει ακόμα δωρεάν περιθώριο, αλλά όχι πολύ. Στο 100% οι σαρώσεις σταματούν."}
              </p>
            )}

            <div className="mt-5 space-y-3">
              {usage.budgets.map((budget) => (
                <BudgetBar key={budget.id} budget={budget} />
              ))}
            </div>

            <HistoryChart usage={usage} />

            <p className="mt-6 rounded-xl border border-line-subtle bg-surface/50 p-4 text-sm leading-6 text-ink-muted">
              Αυτά είναι τα νούμερα της εφαρμογής, όχι του λογαριασμού. Βάλε
              και ειδοποιήσεις κόστους στο Cloudflare και στο Azure: μετράνε
              ό,τι πραγματικά χρεώνεται και δουλεύουν ακόμα κι αν αυτή η σελίδα
              σταματήσει να ενημερώνεται.
            </p>
          </>
        )}
      </section>
    </main>
  );
}

export default function AdminUsage() {
  return (
    <AdminGate>
      <AdminUsageContent />
    </AdminGate>
  );
}
