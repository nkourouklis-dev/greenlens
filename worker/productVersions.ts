/**
 * Append-only history of every analysis result a barcode has ever had.
 *
 * The live `products` row answers "what do we show for this barcode right
 * now". This table answers "what else has been said about it, and by
 * which route" — including scans whose result was deliberately *not*
 * applied because the live row is human-verified (see
 * migrations/0007_add_product_versions.sql).
 *
 * Every function here is best-effort on write: losing a history row must
 * never fail the scan or the save that produced it.
 */

/**
 * Writes need less of D1 than reads do, and productCache.ts's own D1Like
 * (which calls this module) declares only bind/first/run. Keeping the write
 * surface separate lets that narrower type pass without every caller having
 * to widen its test fakes.
 */
export interface D1WriteStatementLike {
  bind(...values: unknown[]): D1WriteStatementLike;
  run(): Promise<unknown>;
}

export interface D1WriteLike {
  prepare(query: string): D1WriteStatementLike;
}

export interface D1PreparedStatementLike {
  bind(...values: unknown[]): D1PreparedStatementLike;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run(): Promise<unknown>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
}

export interface D1Like {
  prepare(query: string): D1PreparedStatementLike;
}

export type ProductVersionSource =
  | "user_scan"
  | "admin_analyze"
  | "admin_edit"
  | "restore";

export interface ProductVersionSummary {
  id: number;
  barcode: string;
  source: ProductVersionSource;
  productName: string | null;
  category: string | null;
  score: number | null;
  band: string | null;
  /**
   * True when this result was written to the live `products` row at the
   * time. False for a scan recorded next to a verified row it was not
   * allowed to replace. The live row is therefore the newest applied
   * version — nothing rewrites this flag afterwards, so the column stays a
   * record of what happened rather than a mutable pointer.
   */
  applied: boolean;
  createdAt: string;
}

export interface ProductVersion extends ProductVersionSummary {
  analysisResult: unknown;
}

interface RawVersionRow {
  id: number;
  barcode: string;
  source: string;
  product_name: string | null;
  category: string | null;
  score: number | null;
  band: string | null;
  applied: number;
  created_at: string;
  analysis_result?: string;
}

const VERSION_SOURCES = new Set<string>([
  "user_scan",
  "admin_analyze",
  "admin_edit",
  "restore",
]);

function isVersionSource(
  value: string,
): value is ProductVersionSource {
  return VERSION_SOURCES.has(value);
}

/**
 * Pulls the score and band out of the envelope so the version list can be
 * rendered without parsing every stored blob. Anything unexpected becomes
 * null rather than throwing — a version row is worth keeping even when its
 * payload is shaped oddly.
 */
function readScoreFields(analysisResult: unknown): {
  score: number | null;
  band: string | null;
} {
  if (
    typeof analysisResult !== "object" ||
    analysisResult === null
  ) {
    return { score: null, band: null };
  }

  const score = (analysisResult as Record<string, unknown>).score;

  if (typeof score !== "object" || score === null) {
    return { score: null, band: null };
  }

  const value = (score as Record<string, unknown>).score;
  const band = (score as Record<string, unknown>).band;

  return {
    score: typeof value === "number" ? Math.round(value) : null,
    band: typeof band === "string" ? band : null,
  };
}

function toSummary(row: RawVersionRow): ProductVersionSummary {
  return {
    id: row.id,
    barcode: row.barcode,
    source: isVersionSource(row.source) ? row.source : "user_scan",
    productName: row.product_name,
    category: row.category,
    score: row.score,
    band: row.band,
    applied: row.applied === 1,
    createdAt: row.created_at,
  };
}

export async function recordProductVersion(
  db: D1WriteLike,
  params: {
    barcode: string;
    source: ProductVersionSource;
    productName?: string | null;
    category?: string | null;
    analysisResult: unknown;
    applied: boolean;
  },
): Promise<void> {
  const { score, band } = readScoreFields(params.analysisResult);

  try {
    await db
      .prepare(
        `INSERT INTO product_versions
           (barcode, source, product_name, category, analysis_result, score, band, applied)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        params.barcode,
        params.source,
        params.productName ?? null,
        params.category ?? null,
        JSON.stringify(params.analysisResult),
        score,
        band,
        params.applied ? 1 : 0,
      )
      .run();
  } catch (caughtError) {
    console.error("product_version_record_failed", {
      barcode: params.barcode,
      source: params.source,
      message:
        caughtError instanceof Error
          ? caughtError.message
          : String(caughtError).slice(0, 300),
    });
  }
}

/**
 * Newest first. The payload column is left out on purpose: a barcode can
 * accumulate dozens of versions and the list screen only needs the header
 * fields.
 */
export async function listProductVersions(
  db: D1Like,
  barcode: string,
  limit = 50,
): Promise<ProductVersionSummary[]> {
  const { results } = await db
    .prepare(
      `SELECT id, barcode, source, product_name, category, score, band, applied, created_at
       FROM product_versions
       WHERE barcode = ?
       ORDER BY id DESC
       LIMIT ?`,
    )
    .bind(barcode, limit)
    .all<RawVersionRow>();

  return (results ?? []).map(toSummary);
}

export async function getProductVersion(
  db: D1Like,
  id: number,
): Promise<ProductVersion | null> {
  const row = await db
    .prepare(
      `SELECT id, barcode, source, product_name, category, score, band, applied, created_at, analysis_result
       FROM product_versions
       WHERE id = ?`,
    )
    .bind(id)
    .first<RawVersionRow>();

  if (!row || typeof row.analysis_result !== "string") {
    return null;
  }

  let analysisResult: unknown;

  try {
    analysisResult = JSON.parse(row.analysis_result);
  } catch {
    return null;
  }

  return { ...toSummary(row), analysisResult };
}
