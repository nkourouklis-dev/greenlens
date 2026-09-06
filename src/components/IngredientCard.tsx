import { CheckCircle2, AlertTriangle, Minus } from "lucide-react";
import type {
  EvidenceLevel,
  IngredientCategory,
  IngredientInsight,
  IngredientRating,
} from "../types";

const categoryLabels: Record<IngredientCategory, string> = {
  preservative: "Συντηρητικό",
  fragrance: "Άρωμα",
  colorant: "Χρωστική",
  humectant: "Ενυδατικό",
  surfactant: "Απορρυπαντικό",
  emollient: "Μαλακτικό",
  antioxidant: "Αντιοξειδωτικό",
  active: "Δραστικό συστατικό",
  other: "Άλλο",
};

const ratingConfig: Record<
  IngredientRating,
  { label: string; badgeClass: string; Icon: typeof CheckCircle2 }
> = {
  good: {
    label: "Καλό",
    badgeClass: "bg-emerald-500/15 text-emerald-200",
    Icon: CheckCircle2,
  },
  caution: {
    label: "Προσοχή",
    badgeClass: "bg-amber-500/15 text-amber-200",
    Icon: AlertTriangle,
  },
  neutral: {
    label: "Ουδέτερο",
    badgeClass: "bg-slate-700/50 text-slate-300",
    Icon: Minus,
  },
};

const evidenceLabels: Record<EvidenceLevel, string> = {
  high: "Υψηλή τεκμηρίωση",
  medium: "Μέτρια τεκμηρίωση",
  low: "Περιορισμένη τεκμηρίωση",
};

export default function IngredientCard(props: {
  insight: IngredientInsight;
}) {
  const { insight } = props;
  const rating = ratingConfig[insight.rating];
  const RatingIcon = rating.Icon;

  return (
    <article className="rounded-xl border border-slate-800 bg-slate-900 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="break-words text-sm font-semibold leading-tight text-slate-100">
            {insight.name}
          </h3>

          <p className="mt-1 text-xs text-slate-500">
            {categoryLabels[insight.category]}
            {insight.aliases.length > 0 && (
              <span> · {insight.aliases.join(", ")}</span>
            )}
          </p>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1">
          <span
            className={`flex items-center gap-1 rounded-full px-2 py-1 text-[11px] ${rating.badgeClass}`}
          >
            <RatingIcon size={12} />
            {rating.label}
          </span>

          {insight.scoreImpact < 0 && (
            <span className="text-xs font-semibold text-orange-300">
              {insight.scoreImpact}
            </span>
          )}
        </div>
      </div>

      <p className="mt-3 text-sm leading-6 text-slate-300">
        {insight.shortDescription}
      </p>

      {insight.whyRated && insight.whyRated !== insight.shortDescription && (
        <p className="mt-1 text-sm leading-6 text-slate-400">
          {insight.whyRated}
        </p>
      )}

      {insight.benefits.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-300">
            Οφέλη
          </p>

          <ul className="mt-1 space-y-1 text-sm leading-6 text-slate-300">
            {insight.benefits.map((benefit) => (
              <li key={benefit}>• {benefit}</li>
            ))}
          </ul>
        </div>
      )}

      {insight.concerns.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-300">
            Σημεία προσοχής
          </p>

          <ul className="mt-1 space-y-1 text-sm leading-6 text-slate-300">
            {insight.concerns.map((concern) => (
              <li key={concern}>• {concern}</li>
            ))}
          </ul>
        </div>
      )}

      <p className="mt-3 text-[11px] text-slate-500">
        {evidenceLabels[insight.evidenceLevel]}
        {!insight.evidenceAvailable && " · χωρίς επιβεβαιωμένη πηγή"}
      </p>
    </article>
  );
}
