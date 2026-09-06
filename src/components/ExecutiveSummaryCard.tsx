import { CheckCircle2, AlertTriangle } from "lucide-react";
import type { ExecutiveSummary } from "../types";

export default function ExecutiveSummaryCard(props: {
  summary: ExecutiveSummary;
  finalScore: number | null;
}) {
  const { summary, finalScore } = props;

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900 p-4">
      <div className="flex items-baseline justify-between">
        <h2 className="font-bold">Με μια ματιά</h2>
        <span className="text-sm font-semibold text-emerald-300">
          {summary.overallVerdict}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <div className="rounded-xl bg-emerald-500/10 p-3 text-center">
          <strong className="block text-xl text-emerald-300">
            {summary.safeIngredients}
          </strong>
          <span className="text-xs text-emerald-200">Ασφαλή</span>
        </div>

        <div className="rounded-xl bg-amber-500/10 p-3 text-center">
          <strong className="block text-xl text-amber-300">
            {summary.cautionIngredients}
          </strong>
          <span className="text-xs text-amber-200">Προσοχή</span>
        </div>

        <div className="rounded-xl bg-red-500/10 p-3 text-center">
          <strong className="block text-xl text-red-300">
            {summary.highImpactIngredients}
          </strong>
          <span className="text-xs text-red-200">Υψηλή προσοχή</span>
        </div>
      </div>

      {summary.highlights.length > 0 && (
        <ul className="mt-4 space-y-2 text-sm leading-6 text-slate-300">
          {summary.highlights.map((highlight) => (
            <li key={highlight} className="flex items-start gap-2">
              <CheckCircle2
                size={16}
                className="mt-0.5 shrink-0 text-emerald-300"
              />
              <span>{highlight}</span>
            </li>
          ))}
        </ul>
      )}

      {summary.watchOutFor.length > 0 && (
        <ul className="mt-2 space-y-2 text-sm leading-6 text-slate-300">
          {summary.watchOutFor.map((item) => (
            <li key={item} className="flex items-start gap-2">
              <AlertTriangle
                size={16}
                className="mt-0.5 shrink-0 text-amber-300"
              />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      )}

      {finalScore !== null && (
        <p className="mt-4 border-t border-slate-800 pt-3 text-sm font-semibold text-slate-200">
          Τελική βαθμολογία: {finalScore}/100
        </p>
      )}
    </section>
  );
}
