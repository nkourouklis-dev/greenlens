import { ChevronRight } from "lucide-react";
import type { IngredientInsight, ScoreBreakdown } from "../types";
import { scoreBandMeta } from "../utils/scoreBand";

/**
 * The first thing on the product page: the score, three sub-scores and a
 * count of what was found, with nothing else to read. Everything that
 * explains the number sits behind "Πώς υπολογίστηκε".
 */

const CARD_BY_BAND: Record<ScoreBreakdown["band"], string> = {
  excellent: "bg-[#2f6b4e]",
  good: "bg-[#2f6b4e]",
  moderate: "bg-[#b7791f]",
  attention: "bg-[#c2571d]",
  high_attention: "bg-[#b5372f]",
  insufficient_data: "bg-[#64748b]",
};

const SUBTITLE_BY_BAND: Record<ScoreBreakdown["band"], string> = {
  excellent: "Πολύ καλή επιλογή",
  good: "Καλή επιλογή",
  moderate: "Με μέτρο",
  attention: "Καλύτερα με προσοχή",
  high_attention: "Καλύτερα να το αποφύγεις",
  insufficient_data: "",
};

const SHORT_LABEL_BY_BAND: Record<ScoreBreakdown["band"], string> = {
  excellent: "Καλό",
  good: "Καλό",
  moderate: "Μέτριο",
  attention: "Προσοχή",
  high_attention: "Κακό",
  insufficient_data: "",
};

/** Categories whose members are additives rather than the food itself. */
const ADDITIVE_CATEGORIES = new Set([
  "preservative",
  "colorant",
  "antioxidant",
  "humectant",
  "surfactant",
  "fragrance",
]);

const E_NUMBER = /\bE\s?\d{3}/i;

export interface SubScore {
  label: string;
  value: number;
}

/**
 * The bars under the score. Nutrition and ingredients are the two halves a
 * food's score was blended from; additives are read off the ingredient
 * list, so they are shown for any list we analysed. Absent halves are left
 * out rather than shown as zero.
 */
export function subScoresFor(
  score: ScoreBreakdown,
  insights: IngredientInsight[],
): SubScore[] {
  const composition = score.composition;

  if (score.score === null || !composition) {
    return [];
  }

  const bars: SubScore[] = [];

  if (composition.nutrition) {
    bars.push({ label: "Θρεπτικά", value: composition.nutrition.score });
  }

  if (composition.ingredients) {
    bars.push({ label: "Συστατικά", value: composition.ingredients.score });
  }

  if (insights.length > 0) {
    const impact = insights
      .filter(
        (insight) =>
          ADDITIVE_CATEGORIES.has(insight.category) ||
          E_NUMBER.test(insight.name),
      )
      .reduce((total, insight) => total + Math.min(0, insight.scoreImpact), 0);

    bars.push({
      label: "Πρόσθετα",
      value: Math.max(0, Math.min(100, Math.round(100 + impact))),
    });
  }

  return bars;
}

function barColor(value: number): string {
  if (value >= 70) return "bg-[#2f6b4e]";
  if (value >= 40) return "bg-[#c58a1b]";
  return "bg-[#b5372f]";
}

function valueColor(value: number): string {
  if (value >= 70) return "text-[#2f6b4e]";
  if (value >= 40) return "text-[#a8730f]";
  return "text-[#b5372f]";
}

export default function ScoreSummaryCard(props: {
  score: ScoreBreakdown;
  bars: SubScore[];
  counts: { clean: number; caution: number; flagged: number };
  analysedCount: number;
  detailsOpen: boolean;
  onToggleDetails: () => void;
}) {
  const { score, bars, counts } = props;

  if (score.score === null) {
    return null;
  }

  const meta = scoreBandMeta[score.band];

  return (
    <section>
      <div
        className={`rounded-3xl px-5 py-5 text-white shadow-lg ${CARD_BY_BAND[score.band]}`}
      >
        <div className="flex items-end justify-between gap-3">
          <p className="flex items-baseline gap-1">
            <strong className="text-6xl font-extrabold leading-none">
              {score.score}
            </strong>
            <span className="text-lg text-white/70">/100</span>
          </p>

          <div className="min-w-0 text-right">
            <p className="text-2xl font-bold leading-tight">
              {SHORT_LABEL_BY_BAND[score.band] || meta.label}
            </p>

            <p className="mt-1 text-sm text-white/80">
              {SUBTITLE_BY_BAND[score.band]}
            </p>
          </div>
        </div>

        <div
          className="mt-4 h-2.5 overflow-hidden rounded-full bg-white/25"
          role="img"
          aria-label={`Βαθμολογία ${score.score} στα 100`}
        >
          <div
            className="h-full rounded-full bg-white"
            style={{ width: `${Math.max(3, score.score)}%` }}
          />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {counts.clean > 0 && (
          <Chip dot="bg-[#2f6b4e]" text={`${counts.clean} καθαρά`} />
        )}

        {counts.caution > 0 && (
          <Chip dot="bg-[#c58a1b]" text={`${counts.caution} προσοχή`} />
        )}

        {counts.flagged > 0 && (
          <Chip dot="bg-[#b5372f]" text={`${counts.flagged} επισημασμένα`} />
        )}
      </div>

      {props.analysedCount > 0 && (
        <p className="mt-2 px-1 text-xs text-slate-400">
          {props.analysedCount} αναλύθηκαν
        </p>
      )}

      <div className="mt-3 rounded-2xl border border-slate-800 bg-slate-900 p-4 shadow-sm">
        {bars.length > 0 && (
          <ul className="space-y-3">
            {bars.map((bar) => (
              <li key={bar.label} className="flex items-center gap-3">
                <span className="w-24 shrink-0 text-sm text-slate-300">
                  {bar.label}
                </span>

                <span className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-[#e8dfd3]">
                  <span
                    className={`block h-full rounded-full ${barColor(bar.value)}`}
                    style={{ width: `${Math.max(3, bar.value)}%` }}
                  />
                </span>

                <span
                  className={`w-8 shrink-0 text-right text-sm font-bold ${valueColor(bar.value)}`}
                >
                  {bar.value}
                </span>
              </li>
            ))}
          </ul>
        )}

        <button
          type="button"
          aria-expanded={props.detailsOpen}
          onClick={props.onToggleDetails}
          className={`flex w-full items-center justify-between gap-2 text-left text-sm font-semibold text-slate-300 ${
            bars.length > 0 ? "mt-4 border-t border-slate-800 pt-3" : ""
          }`}
        >
          Πώς υπολογίστηκε
          <ChevronRight
            size={18}
            className={`shrink-0 transition-transform ${props.detailsOpen ? "rotate-90" : ""}`}
          />
        </button>
      </div>
    </section>
  );
}

function Chip(props: { dot: string; text: string }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-slate-800 bg-slate-900 px-3 py-1.5 text-sm font-semibold text-ink shadow-sm">
      <span className={`h-2 w-2 rounded-full ${props.dot}`} />
      {props.text}
    </span>
  );
}
