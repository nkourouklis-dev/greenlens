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

export type ProductCacheCategory =
  | "ingredients"
  | "nutrition"
  | "chemical_composition";

export type ProductCacheStatus =
  | "ai_generated"
  | "verified"
  | "needs_review";

export type ProductCacheSource = "user_scan" | "csv_import";

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
    value === "needs_review"
  );
}

function isSource(value: unknown): value is ProductCacheSource {
  return value === "user_scan" || value === "csv_import";
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
 * Saves a freshly computed analysis result for future cache hits. Only
 * ever called after a cache miss for this barcode, so a plain insert would
 * normally suffice — the upsert only exists to survive two concurrent
 * first-time requests for the same never-before-seen barcode racing each
 * other. The `WHERE status != 'verified'` guard means a future
 * human-verified entry (no code path sets that status yet — prep for the
 * PIM review flow) can never be silently clobbered by a routine rescan.
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
  },
): Promise<void> {
  try {
    await db
      .prepare(
        `INSERT INTO products (barcode, product_name, category, analysis_result, status, source, scan_count)
         VALUES (?, ?, ?, ?, 'ai_generated', 'user_scan', 1)
         ON CONFLICT(barcode) DO UPDATE SET
           product_name = excluded.product_name,
           category = excluded.category,
           analysis_result = excluded.analysis_result,
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
}
