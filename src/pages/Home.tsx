import { ScanLine, History, Sparkles, ShieldAlert, ScanText } from "lucide-react";
import { useNavigate } from "react-router-dom";

const features = [
  { icon: ScanText, title: "OCR", text: "Συστατικά" },
  { icon: Sparkles, title: "AI", text: "Ανάλυση" },
  { icon: ShieldAlert, title: "Safety", text: "Αλλεργιογόνα" },
];

export default function Home() {
  const navigate = useNavigate();

  return (
    <main className="bg-canvas px-5 pt-10 text-ink">
      <section className="mx-auto flex max-w-md flex-col gap-8 pb-8">
        <div className="pt-6">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-accent-strong">
            AI Ingredient Scanner
          </p>
          <h1 className="mt-3 text-5xl font-extrabold leading-[1.05] tracking-tight">
            Σκάναρε<span className="text-accent">.</span>
            <br />
            Κατάλαβε<span className="text-accent">.</span>
            <br />
            Διάλεξε<span className="text-accent">.</span>
          </h1>
          <p className="mt-4 text-base leading-6 text-ink-faint">
            Συστατικά τροφίμων και καλλυντικών, αλλεργιογόνα και σημεία
            προσοχής, με μία ματιά.
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <button
            type="button"
            onClick={() => navigate("/scan")}
            className="flex h-14 w-full items-center justify-center gap-2 rounded-full bg-accent px-6 text-base font-bold text-on-accent shadow-lg shadow-emerald-500/25 transition active:scale-[0.98]"
          >
            <ScanLine size={20} />
            Σάρωση προϊόντος
          </button>
          <button
            type="button"
            onClick={() => navigate("/history")}
            className="flex h-14 w-full items-center justify-center gap-2 rounded-full border border-line bg-surface px-6 text-base font-semibold text-ink shadow-sm transition active:scale-[0.98]"
          >
            <History size={20} />
            Ιστορικό σαρώσεων
          </button>
        </div>

        {/* auto-fit instead of a fixed grid-cols-3: at normal text size
            three ~6.5rem cards fit a side by side, but iOS "Larger Text"
            (Dynamic Type/zoom) can grow the card content past that width —
            auto-fit lets a card wrap to its own row instead of being
            squeezed and clipped inside a column that no longer fits it. */}
        <div className="grid grid-cols-[repeat(auto-fit,minmax(6.5rem,1fr))] gap-3">
          {features.map(({ icon: Icon, title, text }) => (
            <div key={title} className="min-w-0 rounded-3xl border border-line-subtle bg-surface p-3 shadow-sm">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-accent-strong">
                <Icon size={18} />
              </span>
              <p className="mt-3 break-words text-xs text-ink-faint">{title}</p>
              <p className="break-words text-sm font-bold leading-tight">{text}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
