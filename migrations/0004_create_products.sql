-- Shared product cache: once a barcode has been fully analyzed, the result
-- is stored here so the next scan of the same barcode can skip OCR/AI
-- entirely. First step toward a shared online product database — this
-- migration only adds the table itself, no admin UI/CSV import/photo
-- handling yet (those are later phases).
--
-- `category` is the existing content-category split (ingredients/nutrition/
-- chemical_composition) — which analysis pipeline produced this result, not
-- the product's type. "food" vs "cosmetic" is a separate distinction that
-- already lives inside `analysis_result` (WorkerAnalysisResult.productType)
-- for the ingredients category, so it isn't duplicated as its own column
-- here.
--
-- `analysis_result` stores the exact JSON response envelope the ingredients/
-- nutrition/chemical_composition endpoints already return today (the AI
-- result spread with its score, insights, executiveSummary, allergenNotice
-- and contentCategory) — a cache hit replays this unchanged, so the client
-- never needs to know whether a response was freshly computed or cached.
--
-- `status` preps for the future PIM/admin review flow: every row starts as
-- 'ai_generated'; 'verified' will mean a human confirmed it; 'needs_review'
-- is reserved for flagging a stale or disputed entry. Nothing writes
-- 'verified' or 'needs_review' yet.
--
-- barcode is the primary key: this MVP caches one result per barcode, not
-- one per (barcode, category). A product legitimately scanned under two
-- categories (e.g. its ingredients list once, its nutrition table another
-- time) will simply overwrite the cached row with whichever was analyzed
-- most recently — acceptable for now, but a future iteration may need a
-- composite (barcode, category) key if that turns out to lose useful data.
CREATE TABLE products (
  barcode TEXT PRIMARY KEY,
  product_name TEXT,
  category TEXT NOT NULL CHECK (category IN ('ingredients','nutrition','chemical_composition')),
  analysis_result TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ai_generated' CHECK (status IN ('ai_generated','verified','needs_review')),
  source TEXT NOT NULL DEFAULT 'user_scan' CHECK (source IN ('user_scan','csv_import')),
  scan_count INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_products_category ON products(category);
CREATE INDEX idx_products_status ON products(status);
