import type {
  IngredientInsight,
  NutriScoreComponent,
  NutritionEvaluation,
  ScoreBreakdown,
} from "../types";

const COMPONENT_LABELS: Record<NutriScoreComponent["key"], string> = {
  energy: "Ενέργεια",
  energy_from_saturates: "Ενέργεια από κορεσμένα λιπαρά",
  sugars: "Σάκχαρα",
  saturates: "Κορεσμένα λιπαρά",
  saturates_ratio: "Κορεσμένα προς ολικά λιπαρά",
  salt: "Αλάτι",
  sweeteners: "Γλυκαντικά",
  protein: "Πρωτεΐνη",
  fibre: "Φυτικές ίνες",
  fruit_veg_legumes: "Φρούτα, λαχανικά, όσπρια",
};

const COMPONENT_UNITS: Record<NutriScoreComponent["key"], string> = {
  energy: "kJ",
  energy_from_saturates: "kJ",
  sugars: "g",
  saturates: "g",
  saturates_ratio: "%",
  salt: "g",
  sweeteners: "",
  protein: "g",
  fibre: "g",
  fruit_veg_legumes: "%",
};

const UNCREDITED_LABELS: Record<
  NutritionEvaluation["uncredited"][number],
  string
> = {
  fibre: "φυτικές ίνες",
  protein: "πρωτεΐνη",
  fruit_veg_legumes: "φρούτα/λαχανικά/όσπρια",
  sweeteners: "πληροφορία για γλυκαντικά",
};

const SOURCE_LABELS = {
  label: "την ετικέτα",
  openfoodfacts: "το Open Food Facts",
} as const;

function formatValue(value: number, unit: string): string {
  const rounded = Math.round(value * 10) / 10;

  return `${String(rounded).replace(".", ",")}${unit ? ` ${unit}` : ""}`;
}

function percent(weight: number): string {
  return `${Math.round(weight * 100)}%`;
}

/**
 * The breakdown of a food scored from both halves (worker/foodScore.ts):
 * the two component scores and their weights, the cap and the alcohol as
 * rows of their own, and — under them — what each half looked at. The
 * "100 minus deductions" arithmetic of the ingredients-only breakdown does
 * not describe this score, so it is not used here.
 */
export default function CompositionBreakdown(props: {
  score: ScoreBreakdown;
  insights: IngredientInsight[];
}) {
  const { score, insights } = props;
  const composition = score.composition;
  const evaluation = score.nutritionEvaluation ?? null;

  if (!composition) {
    return null;
  }

  const alcoholRow = score.deductions.find((deduction) =>
    deduction.code.startsWith("alcohol:"),
  );

  const capRow = score.deductions.find((deduction) =>
    deduction.code.startsWith("partial:"),
  );

  const ingredientRows =
    insights.length > 0
      ? insights
          .filter((insight) => insight.scoreImpact < 0)
          .map((insight) => ({
            key: insight.normalizedName,
            label: insight.name,
            impact: insight.scoreImpact,
          }))
      : score.deductions
          .filter(
            (deduction) =>
              !deduction.code.startsWith("alcohol:") &&
              !deduction.code.startsWith("partial:"),
          )
          .map((deduction) => ({
            key: deduction.code,
            label: deduction.title,
            impact: -deduction.points,
          }));

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900 shadow-sm p-4">
      <h2 className="font-bold">Ανάλυση βαθμολογίας</h2>

      <div className="mt-3 divide-y divide-slate-800 text-sm">
        <div className="flex items-baseline justify-between gap-2 py-2">
          <span className="min-w-0 text-slate-200">
            {composition.nutrition
              ? `Διατροφή · Nutri-Score ${composition.nutrition.grade}`
              : "Διατροφή · δεν βρέθηκαν στοιχεία"}
          </span>

          <span className="shrink-0 font-semibold text-slate-200">
            {composition.nutrition
              ? `${composition.nutrition.score}/100 × ${percent(composition.nutrition.weight)}`
              : "—"}
          </span>
        </div>

        <div className="flex items-baseline justify-between gap-2 py-2">
          <span className="min-w-0 text-slate-200">
            Συστατικά και πρόσθετα
          </span>

          <span className="shrink-0 font-semibold text-slate-200">
            {composition.ingredients
              ? `${composition.ingredients.score}/100 × ${percent(composition.ingredients.weight)}`
              : "—"}
          </span>
        </div>

        <div className="flex items-baseline justify-between gap-2 py-2">
          <span className="text-slate-400">Συνδυασμένη βαθμολογία</span>

          <span className="font-semibold text-slate-200">
            {composition.blended}
          </span>
        </div>

        {capRow && (
          <div className="py-2">
            <div className="flex items-baseline justify-between gap-2 font-semibold">
              <span className="min-w-0 text-slate-200">{capRow.title}</span>

              <span className="shrink-0 text-orange-300">
                -{capRow.points}
              </span>
            </div>

            <p className="mt-1 text-sm leading-6 text-slate-400">
              {capRow.explanation}
            </p>
          </div>
        )}

        {alcoholRow && (
          <div className="py-2">
            <div className="flex items-baseline justify-between gap-2 font-semibold">
              <span className="min-w-0 text-slate-200">
                {alcoholRow.title}
              </span>

              <span className="shrink-0 text-orange-300">
                -{alcoholRow.points}
              </span>
            </div>

            <p className="mt-1 text-sm leading-6 text-slate-400">
              {alcoholRow.explanation}
            </p>
          </div>
        )}
      </div>

      <div className="mt-2 flex items-center justify-between border-t border-slate-800 pt-3 text-base">
        <span className="font-bold text-slate-100">Τελική βαθμολογία</span>

        <span className="font-bold text-emerald-300">
          {score.score} / 100
        </span>
      </div>

      {evaluation && (
        <div className="mt-4 border-t border-slate-800 pt-3">
          <h3 className="text-sm font-bold text-slate-200">
            Nutri-Score {evaluation.grade} · από{" "}
            {SOURCE_LABELS[evaluation.source]}
          </h3>

          <div className="mt-2 divide-y divide-slate-800">
            {evaluation.components.map((component) => (
              <div
                key={component.key}
                className="flex items-baseline justify-between gap-2 py-2 text-sm"
              >
                <span className="min-w-0 text-slate-300">
                  {COMPONENT_LABELS[component.key]}
                  {component.value !== null && (
                    <span className="text-slate-500">
                      {" "}
                      ·{" "}
                      {formatValue(
                        component.value,
                        COMPONENT_UNITS[component.key],
                      )}
                    </span>
                  )}
                </span>

                <span
                  className={`shrink-0 font-semibold ${
                    component.side === "negative"
                      ? "text-orange-300"
                      : component.counted
                        ? "text-emerald-300"
                        : "text-slate-500"
                  }`}
                >
                  {component.side === "negative"
                    ? `+${component.points}`
                    : component.counted
                      ? `-${component.points}`
                      : `(${component.points})`}
                </span>
              </div>
            ))}
          </div>

          <p className="mt-2 text-xs leading-5 text-slate-500">
            Πόντοι Nutri-Score: δυσμενείς μείον ευνοϊκοί
            {evaluation.points !== null ? ` = ${evaluation.points}` : ""}.
            Ευνοϊκοί πόντοι σε παρένθεση δεν προσμετρώνται λόγω του επίσημου
            κανόνα.
          </p>

          {evaluation.uncredited.length > 0 && (
            <p className="mt-2 text-xs leading-5 text-slate-400">
              Δεν βρέθηκαν:{" "}
              {evaluation.uncredited
                .map((key) => UNCREDITED_LABELS[key])
                .join(", ")}
              . Δεν προστέθηκαν βαθμοί για ό,τι δεν δηλώνεται.
            </p>
          )}

          {evaluation.sugarsBoundedByCarbohydrate && (
            <p className="mt-2 text-xs leading-5 text-slate-400">
              Τα σάκχαρα δεν δηλώνονται, αλλά δεν μπορούν να ξεπερνούν τους
              υδατάνθρακες, που είναι τόσο λίγοι ώστε δεν αλλάζουν τους
              πόντους.
            </p>
          )}
        </div>
      )}

      {composition.ingredients && (
        <div className="mt-4 border-t border-slate-800 pt-3">
          <h3 className="text-sm font-bold text-slate-200">
            Συστατικά και πρόσθετα · {composition.ingredients.score}/100
          </h3>

          {ingredientRows.length === 0 ? (
            <p className="mt-2 text-sm text-slate-400">
              Δεν εντοπίστηκαν αφαιρέσεις βαθμών.
            </p>
          ) : (
            <div className="mt-2 divide-y divide-slate-800">
              {ingredientRows.map((row) => (
                <div
                  key={row.key}
                  className="flex items-baseline justify-between gap-2 py-2 text-sm"
                >
                  <span className="min-w-0 truncate text-slate-300">
                    {row.label}
                  </span>

                  <span className="shrink-0 font-semibold text-orange-300">
                    {row.impact}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
