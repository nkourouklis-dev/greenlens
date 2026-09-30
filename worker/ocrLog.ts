/**
 * The raw OCR text behind a product's newest analysis (product_ocr).
 * Best-effort in both directions: a failing log write must never fail the
 * scan it describes, and a missing table reads as "nothing recorded".
 */

import type { D1Like } from "./adminAssistant";

export interface OcrLogEntry {
  text: string;
  labelType: string;
  confidence: number;
  /** Photo slot it was read from ("front", "ingredients", …), when known. */
  photoType?: string;
}

/** Enough for any label; a runaway OCR result must not bloat the row. */
const MAX_TEXT_LENGTH = 6000;

export async function saveOcrTexts(
  db: D1Like,
  barcode: string,
  source: string,
  entries: OcrLogEntry[],
): Promise<void> {
  if (!barcode || entries.length === 0) {
    return;
  }

  try {
    await db
      .prepare(
        "INSERT INTO product_ocr (barcode, texts, source, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP) ON CONFLICT(barcode) DO UPDATE SET texts = excluded.texts, source = excluded.source, updated_at = CURRENT_TIMESTAMP",
      )
      .bind(
        barcode,
        JSON.stringify(
          entries.map((entry) => ({
            ...entry,
            text: entry.text.slice(0, MAX_TEXT_LENGTH),
          })),
        ),
        source,
      )
      .run();
  } catch (caughtError) {
    console.error("ocr_log_save_failed", {
      barcode,
      message:
        caughtError instanceof Error
          ? caughtError.message
          : String(caughtError).slice(0, 300),
    });
  }
}

export async function readOcrTexts(
  db: D1Like,
  barcode: string,
): Promise<{ entries: OcrLogEntry[]; source: string; updatedAt: string } | null> {
  try {
    const row = await db
      .prepare(
        "SELECT texts, source, updated_at FROM product_ocr WHERE barcode = ?",
      )
      .bind(barcode)
      .first<{ texts: string; source: string; updated_at: string }>();

    if (!row) {
      return null;
    }

    const parsed: unknown = JSON.parse(row.texts);

    return {
      entries: Array.isArray(parsed) ? (parsed as OcrLogEntry[]) : [],
      source: row.source,
      updatedAt: row.updated_at,
    };
  } catch {
    return null;
  }
}
