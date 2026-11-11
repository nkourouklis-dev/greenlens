import { Database, ScanLine } from "lucide-react";

/**
 * Shown on a result that was built from Open Food Facts rather than from a
 * photographed label, with the way out: scan the label and replace it.
 */
export default function OffSourceNotice(props: { onCorrect: () => void }) {
  return (
    <section className="flex items-center gap-3 rounded-3xl border border-line-subtle bg-surface p-4 shadow-sm">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/15 text-accent-strong">
        <Database size={20} />
      </span>
      <p className="min-w-0 flex-1 text-sm font-semibold leading-5">
        Δεδομένα από Open Food Facts
      </p>
      <button
        type="button"
        onClick={props.onCorrect}
        className="flex h-10 shrink-0 items-center gap-1.5 rounded-full border border-line-subtle px-3 text-sm font-bold text-accent-strong transition active:scale-[0.98]"
      >
        <ScanLine size={16} />
        Διόρθωση / Σκάναρε ετικέτα
      </button>
    </section>
  );
}
