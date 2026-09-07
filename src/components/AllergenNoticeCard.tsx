import { Info } from "lucide-react";
import type { AllergenNotice } from "../types";

/**
 * One line for every declared EU allergen in the product, shown once at the
 * top. This replaces the per-ingredient "Προσοχή σε X · Μπορεί να προκαλέσει
 * αλλεργία" cards, which repeated the same sentence for every allergen and
 * took points off a perfectly ordinary label.
 */
export default function AllergenNoticeCard(props: {
  notice: AllergenNotice | null;
}) {
  const { notice } = props;

  if (!notice || notice.labels.length === 0) {
    return null;
  }

  return (
    <section className="rounded-xl border border-sky-400/30 bg-sky-400/10 p-4">
      <div className="flex items-start gap-2">
        <Info size={18} className="mt-0.5 shrink-0 text-sky-300" />

        <div className="min-w-0">
          <h2 className="text-sm font-bold text-sky-100">
            Περιέχει γνωστά αλλεργιογόνα
          </h2>

          <p className="mt-1 text-sm leading-6 text-sky-50">
            {notice.labels.join(", ")}
          </p>

          <p className="mt-2 text-xs leading-5 text-sky-200/80">
            {notice.note}
          </p>
        </div>
      </div>
    </section>
  );
}
