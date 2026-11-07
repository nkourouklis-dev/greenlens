import {
  Apple,
  Camera,
  ChevronRight,
  History,
  ScanLine,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  SprayCan,
  Wheat,
} from "lucide-react";
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { getHistory } from "../services/historyService";
import { formatRelativeDate, scoreBandMeta } from "../utils/scoreBand";
import type { ScanHistoryItem } from "../types";

const RING_RADIUS = 38;
const RING_LEN = 2 * Math.PI * RING_RADIUS;
// Illustrative only: the hero card is a labelled example, not a real scan.
const DEMO_SCORE = 82;

const chips = [
  { icon: Apple, label: "Τρόφιμα" },
  { icon: SprayCan, label: "Καλλυντικά" },
  { icon: Wheat, label: "Αλλεργιογόνα" },
  { icon: Sparkles, label: "Πρόσθετα" },
];

const steps = [
  {
    icon: Camera,
    title: "Φωτογράφισε",
    text: "Το barcode και την ετικέτα με τα συστατικά.",
  },
  {
    icon: Sparkles,
    title: "Ανάλυση",
    text: "Διαβάζουμε συστατικά, θρεπτικά και πρόσθετα.",
  },
  {
    icon: ShieldCheck,
    title: "Βαθμολογία",
    text: "Ξεκάθαρη βαθμολογία, αλλεργιογόνα και σημεία προσοχής.",
  },
];

const scale = [
  { label: "Πολλές επισημάνσεις", color: "bg-red-500" },
  { label: "Προσοχή", color: "bg-orange-500" },
  { label: "Μέτρια", color: "bg-amber-400" },
  { label: "Καλή", color: "bg-green-500" },
  { label: "Εξαιρετική", color: "bg-emerald-500" },
];

function RecentThumb({ item }: { item: ScanHistoryItem }) {
  const source = item.productPhoto ?? item.ingredientsPhoto ?? "";
  const classes = "h-14 w-14 shrink-0 rounded-2xl bg-surface-muted object-cover";
  return source ? (
    <img src={source} alt="" className={classes} />
  ) : (
    <span className={classes} />
  );
}

function HeroCard() {
  return (
    <div
      aria-hidden
      className="gl-fade-up relative mx-auto mt-8 h-72 w-full max-w-sm"
      style={{ animationDelay: "0.15s" }}
    >
      {/* Mock label being scanned */}
      <div className="gl-float absolute left-1/2 top-0 h-64 w-48 -translate-x-1/2 overflow-hidden rounded-3xl border border-white/15 bg-white/10 p-4 shadow-2xl shadow-black/40 backdrop-blur-md">
        <div className="h-3 w-20 rounded-full bg-white/40" />
        <div className="mt-2 h-2 w-28 rounded-full bg-white/20" />
        <div className="mt-5 space-y-2.5">
          {[92, 78, 86, 60, 80, 70, 54].map((w, i) => (
            <div key={i} className="flex items-center gap-2">
              <span
                className={`h-2 w-2 shrink-0 rounded-full ${
                  i === 3 ? "bg-amber-400" : "bg-[#34d399]"
                }`}
              />
              <span
                className="h-2 rounded-full bg-white/25"
                style={{ width: `${w}%` }}
              />
            </div>
          ))}
        </div>
        {/* Scan beam */}
        <div className="gl-scan-line absolute inset-x-0 h-12 -translate-y-1/2 bg-gradient-to-b from-transparent via-[#6ee7b7]/50 to-transparent" />
        <div className="gl-scan-line absolute inset-x-0 h-0.5 bg-[#6ee7b7] shadow-[0_0_14px_3px_rgb(110_231_183/0.9)]" />
        {/* Viewfinder corners */}
        <span className="absolute left-2 top-2 h-5 w-5 rounded-tl-lg border-l-2 border-t-2 border-[#6ee7b7]" />
        <span className="absolute right-2 top-2 h-5 w-5 rounded-tr-lg border-r-2 border-t-2 border-[#6ee7b7]" />
        <span className="absolute bottom-2 left-2 h-5 w-5 rounded-bl-lg border-b-2 border-l-2 border-[#6ee7b7]" />
        <span className="absolute bottom-2 right-2 h-5 w-5 rounded-br-lg border-b-2 border-r-2 border-[#6ee7b7]" />
      </div>

      {/* Score ring */}
      <div className="gl-float-slow absolute bottom-0 right-0 flex items-center gap-3 rounded-3xl bg-white p-3 pr-4 shadow-2xl shadow-black/30">
        <div className="relative h-[84px] w-[84px] shrink-0">
        <svg width="84" height="84" viewBox="0 0 100 100" className="-rotate-90">
          <circle cx="50" cy="50" r={RING_RADIUS} fill="none" stroke="#e8ece8" strokeWidth="10" />
          <circle
            cx="50"
            cy="50"
            r={RING_RADIUS}
            fill="none"
            stroke="#10b981"
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={RING_LEN}
            className="gl-ring-fill"
            style={
              {
                "--ring-len": RING_LEN,
                "--ring-to": RING_LEN * (1 - DEMO_SCORE / 100),
                strokeDashoffset: RING_LEN * (1 - DEMO_SCORE / 100),
              } as React.CSSProperties
            }
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <p className="text-2xl font-extrabold leading-none text-ink">{DEMO_SCORE}</p>
          <p className="mt-0.5 text-[9px] font-semibold tracking-wide text-ink-faint">
            /100
          </p>
        </div>
        </div>
        <div>
          <p className="text-xs font-bold text-emerald-700">Καλή επιλογή</p>
          <p className="text-[10px] text-ink-faint">Παράδειγμα</p>
        </div>
      </div>

      {/* Allergen flag */}
      <div className="gl-float absolute left-0 top-24 flex items-center gap-1.5 rounded-full bg-amber-400 px-3 py-1.5 text-xs font-bold text-amber-950 shadow-xl shadow-black/30">
        <ShieldAlert size={14} />
        Γλουτένη
      </div>
    </div>
  );
}

export default function Home() {
  const navigate = useNavigate();

  const history = useMemo(() => getHistory(), []);
  const recent = history.slice(0, 3);
  const scored = history
    .map((item) => item.analysis?.score?.score)
    .filter((score): score is number => typeof score === "number");
  const average = scored.length
    ? Math.round(scored.reduce((sum, score) => sum + score, 0) / scored.length)
    : null;

  return (
    <main className="bg-canvas pb-[calc(var(--nav-clearance)+1rem)] text-ink">
      {/* Dark hero that bleeds to the edges */}
      <div className="relative overflow-hidden rounded-b-[2.5rem] bg-gradient-to-br from-[#052e22] via-[#064e3b] to-[#0b7a52] px-5 pb-10 pt-12 text-white">
        <div
          aria-hidden
          className="gl-drift pointer-events-none absolute -right-20 -top-20 h-80 w-80 rounded-full bg-[#34d399]/30 blur-3xl"
        />
        <div
          aria-hidden
          className="gl-drift pointer-events-none absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-lime-300/15 blur-3xl"
          style={{ animationDelay: "-6s" }}
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

        <section className="relative mx-auto max-w-md">
          <p className="gl-fade-up inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-[#a7f3d0] backdrop-blur">
            <span className="h-1.5 w-1.5 rounded-full bg-[#6ee7b7]" />
            AI Ingredient Scanner
          </p>
          <h1
            className="gl-fade-up mt-4 text-[3.4rem] font-extrabold leading-[1.02] tracking-tight"
            style={{ animationDelay: "0.05s" }}
          >
            Σκάναρε<span className="text-[#6ee7b7]">.</span>
            <br />
            Κατάλαβε<span className="text-[#6ee7b7]">.</span>
            <br />
            <span className="bg-gradient-to-r from-[#a7f3d0] to-lime-200 bg-clip-text text-transparent">
              Διάλεξε
            </span>
            <span className="text-[#6ee7b7]">.</span>
          </h1>
          <p
            className="gl-fade-up mt-4 text-base leading-6 text-emerald-50/80"
            style={{ animationDelay: "0.1s" }}
          >
            Συστατικά τροφίμων και καλλυντικών, αλλεργιογόνα και σημεία
            προσοχής, με μία ματιά.
          </p>

          <HeroCard />

          <div
            className="gl-fade-up mt-8 flex flex-col gap-3"
            style={{ animationDelay: "0.25s" }}
          >
            <button
              type="button"
              onClick={() => navigate("/scan")}
              className="gl-pulse-ring flex h-16 w-full items-center justify-center gap-3 rounded-full bg-white px-6 text-lg font-extrabold text-emerald-900 shadow-xl shadow-black/25 transition active:scale-[0.98]"
            >
              <ScanLine size={24} />
              Σάρωση προϊόντος
            </button>
            <button
              type="button"
              onClick={() => navigate("/history")}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-full border border-white/25 bg-white/10 px-6 text-base font-semibold text-white backdrop-blur transition active:scale-[0.98]"
            >
              <History size={18} />
              Ιστορικό σαρώσεων
            </button>
          </div>
        </section>
      </div>

      <section className="mx-auto mt-7 flex max-w-md flex-col gap-7 px-5">
        {/* What it reads */}
        <div className="-mx-5 flex gap-2.5 overflow-x-auto px-5 pb-1 [scrollbar-width:none]">
          {chips.map(({ icon: Icon, label }) => (
            <span
              key={label}
              className="flex shrink-0 items-center gap-2 rounded-full border border-line-subtle bg-surface px-4 py-2.5 text-sm font-semibold shadow-sm"
            >
              <Icon size={16} className="text-accent-strong" />
              {label}
            </span>
          ))}
        </div>

        {recent.length > 0 && (
          <div>
            <div className="flex items-baseline justify-between">
              <h2 className="text-lg font-bold">Πρόσφατες σαρώσεις</h2>
              <button
                type="button"
                onClick={() => navigate("/history")}
                className="flex items-center text-sm font-semibold text-accent-strong"
              >
                Όλες
                <ChevronRight size={16} />
              </button>
            </div>

            {average !== null && (
              <p className="mt-1 text-sm text-ink-faint">
                {history.length} σαρώσεις · μέσος όρος {average}/100
              </p>
            )}

            <div className="mt-3 space-y-2.5">
              {recent.map((item) => {
                const band = item.analysis?.score?.band;
                const meta = band ? scoreBandMeta[band] : null;
                const score = item.analysis?.score?.score;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => navigate("/product/" + item.id)}
                    className="flex w-full items-center gap-3 rounded-2xl border border-line-subtle bg-surface p-2.5 text-left shadow-sm transition active:scale-[0.99]"
                  >
                    <RecentThumb item={item} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-bold">
                        {item.productName || "Νέο προϊόν"}
                      </span>
                      <span className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-faint">
                        {meta && (
                          <span
                            className={`h-1.5 w-1.5 shrink-0 rounded-full ${meta.dotClass}`}
                          />
                        )}
                        <span className="truncate">
                          {meta
                            ? meta.label
                            : item.analysisState === "running"
                              ? "Αναλύεται…"
                              : "Εκκρεμεί ανάλυση"}
                        </span>
                        <span>· {formatRelativeDate(item.scannedAt)}</span>
                      </span>
                    </span>
                    {score != null && meta && (
                      <span
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-muted text-sm font-extrabold ${meta.vividTextClass}`}
                      >
                        {score}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* How it works */}
        <div>
          <h2 className="text-lg font-bold">Πώς λειτουργεί</h2>
          <ol className="mt-3 space-y-2.5">
            {steps.map(({ icon: Icon, title, text }, index) => (
              <li
                key={title}
                className="flex items-center gap-3 rounded-2xl border border-line-subtle bg-surface p-3 shadow-sm"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/15 text-accent-strong">
                  <Icon size={20} />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-bold">
                    {index + 1}. {title}
                  </span>
                  <span className="block text-sm leading-5 text-ink-faint">
                    {text}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        </div>

        {/* Score scale */}
        <div className="rounded-3xl border border-line-subtle bg-surface p-4 shadow-sm">
          <h2 className="text-lg font-bold">Πώς βαθμολογούμε</h2>
          <p className="mt-1 text-sm leading-5 text-ink-faint">
            Από 0 έως 100, με σταθερούς κανόνες, όχι εντυπώσεις. Κάθε
            βαθμολογία εξηγείται στο προϊόν.
          </p>
          <div className="mt-4 flex h-3 overflow-hidden rounded-full">
            {scale.map(({ label, color }) => (
              <span key={label} className={`flex-1 ${color}`} />
            ))}
          </div>
          <div className="mt-2 flex justify-between text-[11px] font-semibold text-ink-faint">
            <span>{scale[0].label}</span>
            <span>{scale[scale.length - 1].label}</span>
          </div>
        </div>
      </section>
    </main>
  );
}
