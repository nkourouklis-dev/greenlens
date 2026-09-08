-- Prep for the bulk in-store photo capture flow (PIM admin, built in a
-- follow-up task): a barcode can now get a `products` row before any
-- analysis exists at all — just photos, captured on-site, to be analyzed
-- later from the admin/PIM.
--
-- Two changes needed on `products`:
--   1. `status` gains 'draft' (photos captured, no analysis yet) and
--      `source` gains 'pim_capture', alongside the existing values.
--   2. `category` and `analysis_result` must become nullable — a draft row
--      has neither yet. `analysis_result` was NOT NULL (see
--      migrations/0004_create_products.sql); `category` was NOT NULL too.
--      `category` stays NULL rather than gaining an 'unknown' enum value:
--      "no analysis attempted yet" (draft) is a different thing from
--      "the AI couldn't classify the content" (the existing frontend
--      ContentCategory "unknown"), and conflating them would make a draft
--      row look like a failed analysis instead of a not-yet-attempted one.
--
-- SQLite can't ALTER a CHECK or NOT NULL constraint in place, so this
-- follows the standard rebuild: create the relaxed table under a new name,
-- copy every existing row across (all of which already satisfy the
-- stricter old constraints, so nothing here can fail), drop the old table,
-- rename the new one into place.
CREATE TABLE products_new (
  barcode TEXT PRIMARY KEY,
  product_name TEXT,
  category TEXT CHECK (category IN ('ingredients','nutrition','chemical_composition')),
  analysis_result TEXT,
  status TEXT NOT NULL DEFAULT 'ai_generated' CHECK (status IN ('ai_generated','verified','needs_review','draft')),
  source TEXT NOT NULL DEFAULT 'user_scan' CHECK (source IN ('user_scan','csv_import','pim_capture')),
  scan_count INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO products_new (barcode, product_name, category, analysis_result, status, source, scan_count, created_at, updated_at)
SELECT barcode, product_name, category, analysis_result, status, source, scan_count, created_at, updated_at
FROM products;

DROP TABLE products;

ALTER TABLE products_new RENAME TO products;

CREATE INDEX idx_products_category ON products(category);
CREATE INDEX idx_products_status ON products(status);

-- Photos captured in bulk at a store, before any analysis runs. Several
-- rows can exist per barcode (one per photo_type, occasionally more if a
-- shot gets retaken and the old row is kept rather than replaced — the
-- admin/PIM built in a follow-up task decides which to keep). `barcode` is
-- deliberately not a hard foreign key: a photo can be captured for a
-- barcode that has no `products` row yet (the capture endpoint creates a
-- draft row for it — see worker/productPhotos.ts), and D1/SQLite FK
-- enforcement across that kind of "create the parent lazily" flow is more
-- awkward than it's worth here. Indexed on barcode instead, which is all
-- the lookup patterns so far actually need.
CREATE TABLE product_photos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  barcode TEXT NOT NULL,
  photo_type TEXT NOT NULL CHECK (photo_type IN ('front','ingredients','nutrition','other')),
  r2_key TEXT NOT NULL,
  uploaded_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_product_photos_barcode ON product_photos(barcode);
