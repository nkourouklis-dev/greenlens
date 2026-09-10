-- Version history for a barcode's analysis, plus provenance for photos.
--
-- Why versions: `products` keeps exactly one analysis_result per barcode,
-- and saveProductResult refuses to overwrite a human-verified row (see
-- migrations/0004_create_products.sql and worker/productCache.ts). That
-- guard protects the curated data, but it also means a later, possibly
-- better scan of the same product was simply thrown away — nobody could
-- see what it said, let alone promote it. Every write now also lands here,
-- and so does every scan whose result was *not* written because the live
-- row is verified.
--
-- `applied` is that distinction: 1 = this result was written to the live
-- row, 0 = it was recorded but the live row was left untouched. It is never
-- rewritten afterwards, so the live row is simply the newest applied
-- version. The admin/PIM lists both kinds and can restore any of them.
--
-- The full envelope is duplicated per version rather than stored as a diff:
-- these rows are small JSON blobs written a handful of times per product,
-- and a diff chain would make "show me what this version said" a
-- reconstruction problem instead of a single SELECT.
--
-- `score`/`band` are denormalized out of the JSON so the version list can
-- be rendered (and sorted) without parsing every blob.
CREATE TABLE product_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  barcode TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('user_scan','admin_analyze','admin_edit','restore')),
  product_name TEXT,
  category TEXT,
  analysis_result TEXT NOT NULL,
  score INTEGER,
  band TEXT,
  applied INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Every read is "the versions of this barcode, newest first".
CREATE INDEX idx_product_versions_barcode ON product_versions(barcode, id DESC);

-- Where a photo came from. Existing rows are all admin captures, which is
-- why that is the default. 'user_scan' rows are uploaded by the public
-- ingredient-photo flow, so the PIM can tell curated shots apart from
-- whatever a user's camera produced.
ALTER TABLE product_photos ADD COLUMN uploaded_by TEXT NOT NULL DEFAULT 'admin_capture';
