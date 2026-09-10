/**
 * Shared product cache — D1-backed `products` table (see
 * migrations/0004_create_products.sql). First step toward a shared online
 * product database: once a barcode has been fully analyzed, the exact
 * response envelope is stored so the next scan of the same barcode can
 * skip OCR/AI entirely.
 *
 * Same defensive contract as ingredientKnowledge.ts: a lookup miss, a
 * malformed row, or any D1 failure all degrade to "no cached entry" —
 * never thrown — so a DB outage falls back to the normal analysis
 * pipeline instead of breaking the request. Writes (save / increment
 * scan count) are equally defensive: a failure there must never affect
 * the response already computed for this request.
 */

import {
  recordProductVersion,
  type ProductVersionSource,
} from "./productVersions";

export type ProductCacheCategory =
  | "ingredients"
  | "nutrition"
  | "chemical_composition";

export type ProductCacheStatus =
  | "ai_generated"
  | "verified"
  | "needs_review"
  | "draft";

export type ProductCacheSource =
  | "user_scan"
  | "csv_import"
  | "pim_capture";

export interface CachedProduct {
  barcode: string;
  productName: string | null;
  category: ProductCacheCategory;
  // The exact JSON response envelope the ingredients/nutrition/chemical
  // endpoints already return today — deliberately untyped here (the same
  // union those endpoints build lives in worker/index.ts) since this
  // module only stores and replays it, never inspects its shape.
  analysisResult: unknown;
  status: ProductCacheStatus;
  source: ProductCacheSource;
  scanCount: number;
}

// Minimal shape actually used from a D1Database — narrow enough that a
// plain object can stand in for it in tests, which run under plain Node
// (tsx --test) rather than the Workers runtime, so a real D1Database can't
// be constructed there at all. Unlike ingredientKnowledge.ts's read-only
// D1Like, this one also needs `first` (single-row read) and `run` (write).
export interface D1PreparedStatementLike {
  bind(...values: unknown[]): D1PreparedStatementLike;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run(): Promise<unknown>;
}

export interface D1Like {
  prepare(query: string): D1PreparedStatementLike;
}

interface ProductRow {
  barcode: string;
  product_name: string | null;
  category: string;
  analysis_result: string;
  status: string;
  source: string;
  scan_count: number;
}

function isCategory(value: unknown): value is ProductCacheCategory {
  return (
    value === "ingredients" ||
    value === "nutrition" ||
    value === "chemical_composition"
  );
}

function isStatus(value: unknown): value is ProductCacheStatus {
  return (
    value === "ai_generated" ||
    value === "verified" ||
    value === "needs_review" ||
    value === "draft"
  );
}

function isSource(value: unknown): value is ProductCacheSource {
  return (
    value === "user_scan" ||
    value === "csv_import" ||
    value === "pim_capture"
  );
}

/**
 * Looks up a cached product by barcode. Returns null on a miss, a
 * malformed row (unrecognised enum value, unparsable analysis_result —
 * should never happen since this module is the only writer, but a schema
 * change or a bad manual edit shouldn't crash a scan) or any D1 failure.
 */
export async function lookupCachedProduct(
  db: D1Like,
  barcode: string,
): Promise<CachedProduct | null> {
  if (!barcode) {
    return null;
  }

  try {
    const row = await db
      .prepare(
        "SELECT barcode, product_name, category, analysis_result, status, source, scan_count FROM products WHERE barcode = ?",
      )
      .bind(barcode)
      .first<ProductRow>();

    if (!row) {
      return null;
    }

    if (
      !isCategory(row.category) ||
      !isStatus(row.status) ||
      !isSource(row.source)
    ) {
      return null;
    }

    let analysisResult: unknown;

    try {
      analysisResult = JSON.parse(row.analysis_result);
    } catch {
      return null;
    }

    return {
      barcode: row.barcode,
      productName: row.product_name,
      category: row.category,
      analysisResult,
      status: row.status,
      source: row.source,
      scanCount: row.scan_count,
    };
  } catch (caughtError) {
    console.error("product_cache_lookup_failed", {
      message:
        caughtError instanceof Error
          ? caughtError.message
          : String(caughtError).slice(0, 300),
    });

    return null;
  }
}

/**
 * Cache-hit bookkeeping only — never throws, never awaited-for-correctness
 * by the caller's response (a failure here must not turn a cache hit into
 * an error).
 */
export async function incrementProductScanCount(
  db: D1Like,
  barcode: string,
): Promise<void> {
  try {
    await db
      .prepare(
        "UPDATE products SET scan_count = scan_count + 1, updated_at = datetime('now') WHERE barcode = ?",
      )
      .bind(barcode)
      .run();
  } catch (caughtError) {
    console.error("product_cache_increment_failed", {
      message:
        caughtError instanceof Error
          ? caughtError.message
          : String(caughtError).slice(0, 300),
    });
  }
}

/**
 * Saves a freshly computed analysis result for future cache hits. Also the
 * one place a 'draft' row (photos captured in-store, no analysis yet — see
 * worker/productPhotos.ts) or a 'needs_review' row transitions back to
 * 'ai_generated': a fresh, real analysis supersedes either. The
 * `WHERE status != 'verified'` guard means a human-verified entry (set by
 * the admin PUT endpoint) can never be silently clobbered by a routine
 * rescan or a re-analyze call — the whole UPDATE is skipped for it.
 *
 * Either way the result is appended to product_versions: a scan that was
 * refused by the verified guard is exactly the thing the admin needs to be
 * able to look at and promote, so it is recorded as an unapplied version
 * rather than dropped (see worker/productVersions.ts).
 *
 * Never throws — a failure to cache must not fail the request that already
 * has a perfectly good, freshly computed result to return.
 */
export async function saveProductResult(
  db: D1Like,
  params: {
    barcode: string;
    productName?: string | null;
    category: ProductCacheCategory;
    analysisResult: unknown;
    /** Which route produced this result, for the version log. */
    versionSource?: ProductVersionSource;
  },
): Promise<void> {
  // Read before writing: once the upsert has run there is no way to tell
  // whether the verified guard skipped it.
  const existing = await readProductStatus(db, params.barcode);

  const applied = existing !== "verified";

  try {
    await db
      .prepare(
        `INSERT INTO products (barcode, product_name, category, analysis_result, status, source, scan_count)
         VALUES (?, ?, ?, ?, 'ai_generated', 'user_scan', 1)
         ON CONFLICT(barcode) DO UPDATE SET
           -- COALESCE, not a plain overwrite: most analysis callers have no
           -- name to send, and letting those NULLs land would erase the name
           -- an admin (or an earlier identify call) had already recorded —
           -- the one the scan history shows for a known product.
           product_name = COALESCE(excluded.product_name, products.product_name),
           category = excluded.category,
           analysis_result = excluded.analysis_result,
           status = 'ai_generated',
           updated_at = datetime('now')
         WHERE products.status != 'verified'`,
      )
      .bind(
        params.barcode,
        params.productName ?? null,
        params.category,
        JSON.stringify(params.analysisResult),
      )
      .run();
  } catch (caughtError) {
    console.error("product_cache_save_failed", {
      message:
        caughtError instanceof Error
          ? caughtError.message
          : String(caughtError).slice(0, 300),
    });
  }

  await recordProductVersion(db, {
    barcode: params.barcode,
    source: params.versionSource ?? "user_scan",
    productName: params.productName ?? null,
    category: params.category,
    analysisResult: params.analysisResult,
    applied,
  });
}

/**
 * Current status of a row, or null when the barcode is unknown. Swallows
 * failures like everything else on this write path — an unreadable status
 * is treated as "not verified", which risks recording a version as applied
 * when it wasn't, and never risks losing the version itself.
 */
async function readProductStatus(
  db: D1Like,
  barcode: string,
): Promise<string | null> {
  try {
    const row = await db
      .prepare("SELECT status FROM products WHERE barcode = ?")
      .bind(barcode)
      .first<{ status: string }>();

    return row?.status ?? null;
  } catch {
    return null;
  }
}
