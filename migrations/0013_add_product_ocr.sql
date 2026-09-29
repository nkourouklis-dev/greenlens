-- The raw text OCR returned for a product's label photos, from its latest
-- analysis. Kept so that when a score looks wrong the first question — did the
-- OCR misread the photo, or did we misread the OCR? — can be answered by
-- looking, not by guessing. One row per barcode, overwritten by each analysis:
-- the history of scores lives in product_versions, this is only the input of
-- the newest one.
CREATE TABLE IF NOT EXISTS product_ocr (
  barcode TEXT PRIMARY KEY,
  -- JSON array of { text, labelType, confidence }.
  texts TEXT NOT NULL,
  -- Which route produced it (user_scan, admin_analyze, ...).
  source TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
