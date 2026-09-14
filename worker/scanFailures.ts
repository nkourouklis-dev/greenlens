/**
 * The record of every scan the app refused to score.
 *
 * Until this existed, a refusal was visible only in console.log — which
 * means wrangler tail, which means gone unless somebody was watching at that
 * second. Four scoring bugs were found in one afternoon by reading a real
 * label next to the result it produced, and every one of them needed a
 * screenshot sent by hand to be noticed at all.
 *
 * What makes the table worth having is `sourceText`. A reason says a photo
 * failed; the text says why, and it is exactly what a regression test needs.
 */

export interface D1PreparedStatementLike {
  bind(...values: unknown[]): D1PreparedStatementLike;
  run(): Promise<unknown>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
}

export interface D1Like {
  prepare(query: string): D1PreparedStatementLike;
}

/**
 * Long enough to hold the whole of any label panel, short enough that a
 * runaway OCR read of a magazine page cannot fill the database.
 */
const MAX_SOURCE_TEXT = 4000;

export interface ScanFailure {
  barcode: string | null;
  contentCategory: string;
  labelType: string | null;
  reasons: string[];
  sourceText: string;
  ocrConfidence: number | null;
  requestId: string | null;
}

export interface ScanFailureRow extends ScanFailure {
  id: number;
  createdAt: string;
}

/**
 * Best-effort by design: a scan that already failed to produce a score must
 * not also fail to return, so nothing here is allowed to throw into the
 * request path.
 */
export async function recordScanFailure(
  db: D1Like,
  failure: ScanFailure,
): Promise<void> {
  try {
    await db
      .prepare(
        `INSERT INTO scan_failures
           (barcode, content_category, label_type, reasons, source_text, ocr_confidence, request_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        failure.barcode,
        failure.contentCategory,
        failure.labelType,
        JSON.stringify(failure.reasons),
        failure.sourceText.slice(0, MAX_SOURCE_TEXT),
        failure.ocrConfidence,
        failure.requestId,
      )
      .run();
  } catch (error) {
    console.error("scan_failure_record_failed", {
      message:
        error instanceof Error ? error.message : String(error).slice(0, 200),
    });
  }
}

interface RawFailureRow {
  id: number;
  barcode: string | null;
  content_category: string;
  label_type: string | null;
  reasons: string;
  source_text: string;
  ocr_confidence: number | null;
  request_id: string | null;
  created_at: string;
}

function parseReasons(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value);

    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

/** The most recent refusals, newest first. */
export async function listScanFailures(
  db: D1Like,
  limit = 50,
): Promise<ScanFailureRow[]> {
  const bounded = Math.max(1, Math.min(200, Math.floor(limit)));

  const { results } = await db
    .prepare(
      `SELECT id, barcode, content_category, label_type, reasons, source_text, ocr_confidence, request_id, created_at
       FROM scan_failures
       ORDER BY created_at DESC, id DESC
       LIMIT ?`,
    )
    .bind(bounded)
    .all<RawFailureRow>();

  return (results ?? []).map((row) => ({
    id: row.id,
    barcode: row.barcode,
    contentCategory: row.content_category,
    labelType: row.label_type,
    reasons: parseReasons(row.reasons),
    sourceText: row.source_text,
    ocrConfidence: row.ocr_confidence,
    requestId: row.request_id,
    createdAt: row.created_at,
  }));
}
