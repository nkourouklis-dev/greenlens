import type { IngredientRating, ScoreBreakdown } from "../types";

/**
 * Single source of truth for how a score band reads across the app —
 * Product's hero/verdict and History's list rows both key off this so a
 * "good" score always looks the same shade of green everywhere.
 */
export const scoreBandMeta: Record<
  ScoreBreakdown["band"],
  {
    label: string;
    /** Readable on a light card (e.g. verdict text). */
    textClass: string;
    borderClass: string;
    /** Solid, vivid — for status dots and badges on photos. */
    dotClass: string;
    /** Vivid text for a number sitting on a white/pale chip. */
    vividTextClass: string;
  }
> = {
  excellent: {
    label: "Εξαιρετική επιλογή",
    textClass: "text-emerald-300",
    borderClass: "border-emerald-400/40",
    dotClass: "bg-emerald-500",
    vividTextClass: "text-emerald-600",
  },
  good: {
    label: "Καλή επιλογή",
    textClass: "text-green-300",
    borderClass: "border-green-400/40",
    dotClass: "bg-green-500",
    vividTextClass: "text-green-600",
  },
  moderate: {
    label: "Μέτρια επιλογή",
    textClass: "text-yellow-200",
    borderClass: "border-yellow-400/40",
    dotClass: "bg-amber-500",
    vividTextClass: "text-amber-600",
  },
  attention: {
    label: "Χρειάζεται προσοχή",
    textClass: "text-orange-300",
    borderClass: "border-orange-400/40",
    dotClass: "bg-orange-500",
    vividTextClass: "text-orange-600",
  },
  high_attention: {
    label: "Πολλές επισημάνσεις",
    textClass: "text-red-300",
    borderClass: "border-red-400/40",
    dotClass: "bg-red-500",
    vividTextClass: "text-red-600",
  },
  insufficient_data: {
    label: "Ανεπαρκή στοιχεία",
    textClass: "text-slate-300",
    borderClass: "border-slate-700",
    dotClass: "bg-slate-500",
    vividTextClass: "text-slate-500",
  },
};

/**
 * Colored status dot for a single ingredient/nutrient/chemical row —
 * mirrors GreenPoint's ingredient-list dots (green/yellow/grey) placed
 * before each row's name.
 */
export const ratingDotClass: Record<IngredientRating, string> = {
  good: "bg-emerald-500",
  caution: "bg-amber-500",
  neutral: "bg-slate-400",
};

export function formatRelativeDate(iso: string): string {
  const date = new Date(iso);
  const diffDays = Math.floor(
    (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24),
  );

  if (diffDays <= 0) return "Σήμερα";
  if (diffDays === 1) return "Χθες";
  if (diffDays < 7) return `Πριν ${diffDays} ημέρες`;

  return date.toLocaleDateString("el-GR", {
    day: "numeric",
    month: "short",
  });
}
