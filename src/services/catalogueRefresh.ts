import type { ScanHistoryItem } from "../types";
import { checkCachedProduct } from "./analysisClient";
import { buildAnalysisRecord } from "./analysisRecord";
import { getHistoryItem, updateHistoryItem } from "./historyService";

/**
 * A scan is saved on the phone together with the result it had at the time,
 * and used to be shown from there forever. When the catalogue's score for the
 * barcode changed afterwards — a new scoring method, a corrected ingredient
 * list, the nutrition arriving — the phone kept saying what it was first told:
 * Lurpak Soft stayed "excellent" at 100 on a device long after the catalogue
 * said 64.
 *
 * The shared catalogue is the source of truth for a barcode, so every time a
 * saved scan is opened it is compared with it, and replaced when they differ.
 * Silent and best-effort: offline, or a barcode the catalogue does not hold,
 * leaves the saved copy exactly as it was.
 *
 * Returns the refreshed item, or null when nothing changed.
 */
export async function refreshFromCatalogue(
  item: ScanHistoryItem,
): Promise<ScanHistoryItem | null> {
  // Still analysing (or waiting to): the result in hand is newer than any
  // catalogue row, and replacing it would race the job.
  if (!item.barcode || !item.analysis || item.analysisState) {
    return null;
  }

  const cached = await checkCachedProduct(item.barcode);

  if (!cached || cached.result.contentCategory === "unknown") {
    return null;
  }

  const current = item.analysis.score;
  const fresh = cached.result.score;

  const changed =
    current?.score !== fresh.score ||
    current?.band !== fresh.band ||
    current?.scoringVersion !== fresh.scoringVersion ||
    (item.productName ?? "") !== (cached.productName ?? item.productName ?? "");

  if (!changed) {
    return null;
  }

  const analysis = buildAnalysisRecord(
    cached.result,
    item.productId ?? item.id,
    item,
    cached.sourceText || item.userCorrectedText || item.ocrRawText || "",
    item.normalizedIngredients ?? [],
    fresh.confidence,
  );

  const updated = updateHistoryItem(item.id, {
    analysis,
    ...(cached.productName ? { productName: cached.productName } : {}),
  });

  return updated ? (getHistoryItem(item.id) ?? null) : null;
}
