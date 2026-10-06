import type { NutritionEvaluation } from "../types";

const KJ_PER_KCAL = 4.184;

const ROWS: Array<{
  key: NutritionEvaluation["components"][number]["key"];
  label: string;
  format: (value: number) => string;
}> = [
  {
    key: "energy",
    label: "Θερμίδες",
    format: (value) => `${Math.round(value / KJ_PER_KCAL)} kcal`,
  },
  { key: "saturates", label: "Κορεσμένα λιπαρά", format: grams },
  { key: "sugars", label: "Σάκχαρα", format: grams },
  { key: "fibre", label: "Φυτικές ίνες", format: grams },
  { key: "protein", label: "Πρωτεΐνες", format: grams },
  { key: "salt", label: "Αλάτι", format: grams },
];

function grams(value: number): string {
  const rounded = value >= 10 ? Math.round(value) : Math.round(value * 10) / 10;

  return `${String(rounded).replace(".", ",")} g`;
}

/**
 * The per-100 values the nutrition score was graded from, as the bare table.
 * Only rows that were actually read are shown; a missing one is not zero.
 */
export default function NutritionFactsTable(props: {
  evaluation: NutritionEvaluation | null | undefined;
}) {
  const rows = ROWS.flatMap((row) => {
    const component = props.evaluation?.components.find(
      (candidate) => candidate.key === row.key,
    );

    return component && component.value !== null
      ? [{ ...row, value: component.value }]
      : [];
  });

  if (rows.length === 0) {
    return null;
  }

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900 p-4 shadow-sm">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-bold">Διατροφικά στοιχεία</h2>

        <span className="text-xs text-slate-400">ανά 100 g</span>
      </div>

      <dl className="mt-2 divide-y divide-slate-800">
        {rows.map((row) => (
          <div key={row.key} className="flex justify-between gap-3 py-2.5">
            <dt className="text-sm text-slate-300">{row.label}</dt>

            <dd className="text-sm font-bold">{row.format(row.value)}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
