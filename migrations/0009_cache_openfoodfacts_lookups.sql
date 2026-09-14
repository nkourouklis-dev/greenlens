-- Per-barcode cache of what Open Food Facts told us.
--
-- The lookup runs on the identify path of every barcode scan, and again as
-- the nutrition fallback when a photographed label carries no table. Both
-- are third-party calls on the critical path of something the user is
-- waiting for, and the same barcode gets scanned over and over — the point
-- of the app is that people re-check products.
--
-- What is stored is the extracted result (name, brand, net content, per-100
-- quantities), not the ~60 KB JSON document OFF returns. `schema_version`
-- exists so that changing how the extraction works invalidates every row
-- instead of quietly serving values parsed by older code.
--
-- Misses are cached too, with a much shorter life (see productLookup.ts):
-- "OFF does not know this barcode" is a real, useful answer worth not
-- re-asking for on every scan, but it is the answer most likely to change,
-- since anyone can add the product tomorrow.

CREATE TABLE IF NOT EXISTS openfoodfacts_cache (
  barcode TEXT PRIMARY KEY,
  schema_version INTEGER NOT NULL,
  -- JSON of the extracted BarcodeProductResult.
  result TEXT NOT NULL,
  -- Whether OFF held the product at all, so hits and misses can expire on
  -- different clocks without parsing the payload to find out which it is.
  found INTEGER NOT NULL,
  fetched_at_ms INTEGER NOT NULL
);
