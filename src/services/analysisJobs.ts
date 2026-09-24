import { useSyncExternalStore } from "react";
import { analysisVersion } from "../config";
import { runAnalysis } from "./analysisClient";
import { buildAnalysisRecord, insufficientScore } from "./analysisRecord";
import { UserFacingError } from "./errors";
import { normalizeIngredients } from "./ingredientNormalizer";
import { extractIngredientText } from "../../worker/ingredientText";
import { detectContentCategoryHeuristic } from "../../worker/contentCategory";
import { getHistory, getHistoryItem, updateHistoryItem } from "./historyService";
import type { ContentCategory } from "../types";

/**
 * Analyses run here, not inside a page, so they keep going while the user
 * moves on to the next scan. The state is mirrored onto the history item
 * (`analysisState`) so a reload can resume what was in flight.
 */

const GENERIC_ANALYSIS_ERROR =
  "Κάτι πήγε στραβά κατά την ανάλυση. Δοκιμάστε ξανά.";

// Workers AI answers each one in 15–30 s; a couple in parallel keeps a burst
// of scans moving without hammering the daily budget guard.
const MAX_CONCURRENT_ANALYSES = 2;

export type AnalysisOutcome =
  | { ok: true }
  | { ok: false; message: string };

export interface AnalysisNotice {
  key: string;
  itemId: string;
  kind: "done" | "failed";
  title: string;
  score: number | null;
}

interface JobsSnapshot {
  /** Item ids currently running or waiting for a slot. */
  running: readonly string[];
  notices: readonly AnalysisNotice[];
}

let snapshot: JobsSnapshot = { running: [], notices: [] };
const listeners = new Set<() => void>();
const promises = new Map<string, Promise<AnalysisOutcome>>();
const waiting: Array<() => void> = [];
let active = 0;

function publish(next: Partial<JobsSnapshot>): void {
  snapshot = { ...snapshot, ...next };
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useAnalysisJobs(): JobsSnapshot {
  return useSyncExternalStore(subscribe, () => snapshot);
}

export function dismissAnalysisNotice(key: string): void {
  publish({ notices: snapshot.notices.filter((notice) => notice.key !== key) });
}

async function acquireSlot(): Promise<void> {
  if (active < MAX_CONCURRENT_ANALYSES) {
    active += 1;
    return;
  }
  await new Promise<void>((resolve) => waiting.push(resolve));
}

function releaseSlot(): void {
  const next = waiting.shift();
  if (next) {
    next();
    return;
  }
  active -= 1;
}

type OcrLabelType = "ingredients" | "nutrition" | "mixed" | "unknown";

// The stored history item may predate the label type field, so it is read
// defensively; older entries fall back to "unknown".
function readLabelType(item: unknown): OcrLabelType {
  if (typeof item !== "object" || item === null) return "unknown";
  const value = (item as Record<string, unknown>).ocrLabelType;
  return value === "ingredients" ||
    value === "nutrition" ||
    value === "mixed" ||
    value === "unknown"
    ? value
    : "unknown";
}

async function execute(id: string): Promise<AnalysisOutcome> {
  const item = getHistoryItem(id);

  if (!item) {
    return { ok: false, message: "Το προϊόν δεν βρέθηκε στη συσκευή." };
  }

  const text = item.userCorrectedText || item.ocrRawText || "";
  const confidence = item.ocrConfidence ?? 0;
  const labelType = readLabelType(item);
  const categoryOverride: ContentCategory | undefined = item.categoryOverride;
  const ingredients = normalizeIngredients(text, confidence);

  // Which category this text is headed for, purely to decide which
  // client-side quick-gate to apply below — the Worker is always the real
  // authority (it re-resolves the category itself, heuristic then AI
  // fallback). An explicit override wins; otherwise this mirrors the
  // Worker's own heuristic so nutrition/chemical text isn't wrongly blocked
  // by the ingredients-only check.
  const likelyCategory: ContentCategory =
    categoryOverride && categoryOverride !== "unknown"
      ? categoryOverride
      : detectContentCategoryHeuristic(text).category;

  // The naive comma-splitting normalizer can come back empty even when the
  // text is a valid ingredient list (e.g. OCR text missing commas).
  // extractIngredientText is the same validator the review screen and the
  // Worker use, and the authority for *ingredients* text. Nutrition and
  // chemical text go to the Worker's own category-specific extraction, so
  // only non-empty text is required here. A merge photo is judged together
  // with the stored analysis on the Worker, so checking it alone as an
  // ingredient list would be wrong.
  const isAnalyzable =
    text.trim().length > 0 &&
    (item.mergeWithStored === true ||
      likelyCategory !== "ingredients" ||
      extractIngredientText(text, confidence).isValid);

  if (!isAnalyzable) {
    updateHistoryItem(id, {
      analysisState: undefined,
      analysis: {
        productId: id,
        barcode: item.barcode,
        productType: "unknown",
        contentCategory: "ingredients",
        confirmedIngredientText: text,
        normalizedIngredients: ingredients,
        ocrConfidence: confidence,
        structured: {
          productType: "unknown",
          summary: "Δεν υπάρχουν αρκετά στοιχεία για αξιόπιστη ανάλυση.",
          positives: [],
          attentionItems: [],
          potentialAllergens: [],
          ingredientFindings: [],
          insufficientDataReasons: [
            "Δεν υπάρχει επιβεβαιωμένο κείμενο συστατικών.",
          ],
          confidence: 0,
        },
        score: insufficientScore(
          "Δεν υπάρχει επιβεβαιωμένο κείμενο συστατικών.",
          confidence,
        ),
        ingredientInsights: [],
        executiveSummary: {
          overallVerdict: "Ανεπαρκή στοιχεία",
          safeIngredients: 0,
          cautionIngredients: 0,
          highImpactIngredients: 0,
          highlights: [],
          watchOutFor: [],
        },
        analyzedAt: new Date().toISOString(),
        analysisVersion,
      },
    });
    return { ok: true };
  }

  try {
    const result = await runAnalysis({
      productId: id,
      barcode: item.barcode,
      productType: "unknown",
      confirmedIngredientText: text,
      normalizedIngredients: ingredients,
      ocrConfidence: confidence,
      // Carries the OCR verdict to the Worker so the analysis step can trust
      // a high confidence ingredient reading instead of re-judging the label
      // from scratch.
      ocrLabelType: labelType,
      ocrTextLength: text.trim().length,
      categoryOverride,
      productTitle: item.productName,
      ...(item.mergeWithStored ? { mergeWithStored: true } : {}),
    });

    // A malformed or partial response that slipped past analysisClient's own
    // defaults must end up as the friendly message, not a raw JS error.
    const analysis = buildAnalysisRecord(
      result,
      id,
      item,
      text,
      ingredients,
      confidence,
    );

    const wasSaved = updateHistoryItem(id, {
      normalizedIngredients: ingredients,
      categoryOverride,
      analysis,
      mergeWithStored: false,
      analysisState: undefined,
    });

    return wasSaved
      ? { ok: true }
      : {
          ok: false,
          message: "Δεν ήταν δυνατή η αποθήκευση της ανάλυσης στη συσκευή.",
        };
  } catch (caughtError) {
    console.error("analysis_run_failed", caughtError);
    return {
      ok: false,
      message:
        caughtError instanceof UserFacingError
          ? caughtError.message
          : GENERIC_ANALYSIS_ERROR,
    };
  }
}

/**
 * Starts (or joins) the analysis of a history item. Resolves when it is done;
 * callers that navigate away simply never look at the result. `notify` posts
 * a "ready" / "failed" notice for the banner — off for a page that is itself
 * waiting on the result.
 */
export function startAnalysis(
  id: string,
  options: { notify?: boolean } = {},
): Promise<AnalysisOutcome> {
  const existing = promises.get(id);
  if (existing) return existing;

  updateHistoryItem(id, { analysisState: "running" });
  publish({ running: [...snapshot.running, id] });

  const promise = (async (): Promise<AnalysisOutcome> => {
    await acquireSlot();
    let outcome: AnalysisOutcome;
    try {
      outcome = await execute(id);
    } catch (caughtError) {
      console.error("analysis_job_crashed", caughtError);
      outcome = { ok: false, message: GENERIC_ANALYSIS_ERROR };
    } finally {
      releaseSlot();
    }

    if (!outcome.ok) updateHistoryItem(id, { analysisState: "failed" });

    promises.delete(id);

    const item = getHistoryItem(id);
    const notices = options.notify
      ? [
          ...snapshot.notices,
          {
            key: `${id}:${Date.now()}`,
            itemId: id,
            kind: outcome.ok ? ("done" as const) : ("failed" as const),
            title: item?.productName || "Νέο προϊόν",
            score: item?.analysis?.score?.score ?? null,
          },
        ]
      : snapshot.notices;

    publish({
      running: snapshot.running.filter((runningId) => runningId !== id),
      notices,
    });

    return outcome;
  })();

  promises.set(id, promise);
  return promise;
}

/** On app start: pick up analyses a reload or a closed tab interrupted. */
export function resumePendingAnalyses(): void {
  for (const item of getHistory()) {
    if (item.analysisState === "running" && !promises.has(item.id)) {
      void startAnalysis(item.id, { notify: true });
    }
  }
}
