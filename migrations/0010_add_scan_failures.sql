-- Every scan the app refused to score, with the text it refused.
--
-- Four scoring bugs were found in one afternoon by reading a screenshot of a
-- real label next to the result it produced: a complete ingredient list
-- rejected as marketing copy, a nutrition panel scored from digits the model
-- had dropped, a "χωρίς προσθήκη ζάχαρης" charged as added sugar. None of
-- them left a trace anywhere. The diagnostics exist, but they go to
-- console.log, which means wrangler tail, which means they are gone unless
-- somebody happened to be watching at that second.
--
-- `source_text` is the point of the table. A rejection reason on its own
-- says a photo failed; the text says *why*, and it is exactly what a
-- regression test needs — every fixture added today started life as one of
-- these strings.
--
-- Deliberately not a foreign key to products: most failures are for barcodes
-- that never became a product, which is the interesting case.

CREATE TABLE IF NOT EXISTS scan_failures (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  barcode TEXT,
  -- Which analysis refused it: ingredients, nutrition, chemical_composition,
  -- or unknown when the classifier itself could not decide.
  content_category TEXT NOT NULL,
  -- What OCR thought the label was, when it said.
  label_type TEXT,
  -- JSON array of the Greek reasons shown to the user.
  reasons TEXT NOT NULL,
  -- The text that was refused. Truncated on write; see recordScanFailure.
  source_text TEXT NOT NULL,
  ocr_confidence REAL,
  request_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- The list is always read newest-first, and only ever a page of it.
CREATE INDEX IF NOT EXISTS idx_scan_failures_created_at
  ON scan_failures (created_at DESC);
