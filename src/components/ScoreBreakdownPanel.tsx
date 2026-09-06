import type { IngredientInsight, ScoreBreakdown } from "../types";

const STARTING_SCORE = 100;

export default function ScoreBreakdownPanel(props: {
  score: ScoreBreakdown;
  insights: IngredientInsight[];
}) {
  const { score, insights } = props;

  if (score.score === null) {
    return (
      <section className="rounded-xl border border-slate-800 bg-slate-900 p-4">
        <h2 className="font-bold">Ανάλυση βαθμολογίας</h2>

        <p className="mt-2 text-sm leading-6 text-slate-400">
          {score.insufficientDataReasons.join(" ")}
        </p>
      </section>
    );
  }

  // Prefer the enriched insights (they carry the ingredient's display name),
  // but fall back to the raw deductions so older/legacy records without
  // ingredientInsights still render a correct breakdown.
  const rows =
    insights.length > 0
      ? insights
          .filter((insight) => insight.scoreImpact < 0)
          .sort((a, b) => a.scoreImpact - b.scoreImpact)
          .map((insight) => ({
            key: insight.normalizedName,
            label: insight.name,
            impact: insight.scoreImpact,
            reason: insight.whyRated || insight.shortDescription,
          }))
      : score.deductions.map((deduction) => ({
          key: deduction.code,
          label: deduction.title,
          impact: -deduction.points,
          reason: deduction.explanation,
        }));

  const totalPenalty = rows.reduce(
    (total, row) => total + Math.abs(row.impact),
    0,
  );

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900 p-4">
      <h2 className="font-bold">Ανάλυση βαθμολογίας</h2>

      <div className="mt-3 flex items-center justify-between text-sm">
        <span className="text-slate-400">Αρχική βαθμολογία</span>
        <span className="font-semibold text-slate-200">
          {STARTING_SCORE}
        </span>
      </div>

      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-slate-400">
          Δεν εντοπίστηκαν αφαιρέσεις βαθμών.
        </p>
      ) : (
        <div className="mt-2 divide-y divide-slate-800">
          {rows.map((row) => (
            <div key={row.key} className="py-3">
              <div className="flex items-baseline justify-between gap-2 text-sm font-semibold">
                <span className="min-w-0 truncate text-slate-200">
                  {row.label}
                </span>

                <span className="shrink-0 text-orange-300">
                  {row.impact}
                </span>
              </div>

              {row.reason && (
                <p className="mt-1 text-sm leading-6 text-slate-400">
                  {row.reason}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="mt-3 flex items-center justify-between border-t border-slate-800 pt-3 text-sm">
        <span className="text-slate-400">Σύνολο αφαιρέσεων</span>
        <span className="font-semibold text-orange-300">
          -{totalPenalty}
        </span>
      </div>

      <div className="mt-2 flex items-center justify-between text-base">
        <span className="font-bold text-slate-100">Τελική βαθμολογία</span>
        <span className="font-bold text-emerald-300">
          {score.score} / 100
        </span>
      </div>
    </section>
  );
}
