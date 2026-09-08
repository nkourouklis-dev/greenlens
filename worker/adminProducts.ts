/**
 * D1 (+ R2, for delete) access for the PIM admin list/detail/edit screens.
 * Every function here can throw — unlike productCache.ts's read path, an
 * admin management screen needs to know when something actually failed
 * rather than silently seeing an empty list.
 */

import { parseAnalysis } from "./analysis";
import type { ProductCacheStatus } from "./productCache";

// Minimal shape actually used from a D1Database — see productPhotos.ts for
// the same pattern (this module needs the same four methods).
export interface D1PreparedStatementLike {
  bind(...values: unknown[]): D1PreparedStatementLike;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run(): Promise<unknown>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
}

export interface D1Like {
  prepare(query: string): D1PreparedStatementLike;
}

export interface R2Like {
  delete(key: string): Promise<void>;
}

export interface AdminProductListItem {
  barcode: string;
  productName: string | null;
  category: string | null;
  status: string;
  source: string;
  scanCount: number;
  createdAt: string;
  updatedAt: string;
  photoCount: number;
  thumbnailR2Key: string | null;
}

export interface AdminProductPhoto {
  id: number;
  photoType: string;
  r2Key: string;
  uploadedAt: string;
}

export interface AdminProductDetail {
  barcode: string;
  productName: string | null;
  category: string | null;
  status: string;
  source: string;
  scanCount: number;
  createdAt: string;
  updatedAt: string;
  analysisResult: unknown;
  photos: AdminProductPhoto[];
}

const VALID_STATUSES: ProductCacheStatus[] = [
  "ai_generated",
  "verified",
  "needs_review",
  "draft",
];

export function isValidStatusFilter(
  value: string,
): value is ProductCacheStatus {
  return (VALID_STATUSES as string[]).includes(value);
}

interface RawProductRow {
  barcode: string;
  product_name: string | null;
  category: string | null;
  status: string;
  source: string;
  scan_count: number;
  created_at: string;
  updated_at: string;
}

interface RawPhotoLookupRow {
  barcode: string;
  photo_type: string;
  r2_key: string;
}

export const ADMIN_PRODUCTS_PAGE_SIZE = 24;

export async function listAdminProducts(
  db: D1Like,
  options: {
    status?: string;
    barcodeSearch?: string;
    page: number;
  },
): Promise<{
  items: AdminProductListItem[];
  page: number;
  pageSize: number;
  totalCount: number;
}> {
  const pageSize = ADMIN_PRODUCTS_PAGE_SIZE;
  const page = Math.max(1, options.page);
  const offset = (page - 1) * pageSize;

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (options.status && isValidStatusFilter(options.status)) {
    conditions.push("status = ?");
    params.push(options.status);
  }

  const search = options.barcodeSearch?.trim();

  if (search) {
    conditions.push("barcode LIKE ? ESCAPE '\\'");
    params.push(
      `${search.replace(/[\\%_]/g, (char) => `\\${char}`)}%`,
    );
  }

  const whereClause =
    conditions.length > 0
      ? `WHERE ${conditions.join(" AND ")}`
      : "";

  const countRow = await db
    .prepare(
      `SELECT COUNT(*) as count FROM products ${whereClause}`,
    )
    .bind(...params)
    .first<{ count: number }>();

  const totalCount = countRow?.count ?? 0;

  const { results } = await db
    .prepare(
      `SELECT barcode, product_name, category, status, source, scan_count, created_at, updated_at
       FROM products
       ${whereClause}
       ORDER BY updated_at DESC
       LIMIT ? OFFSET ?`,
    )
    .bind(...params, pageSize, offset)
    .all<RawProductRow>();

  const rows = results ?? [];
  const barcodes = rows.map((row) => row.barcode);

  const thumbnails = await lookupThumbnails(db, barcodes);

  const items: AdminProductListItem[] = rows.map((row) => {
    const thumbnail = thumbnails.get(row.barcode);

    return {
      barcode: row.barcode,
      productName: row.product_name,
      category: row.category,
      status: row.status,
      source: row.source,
      scanCount: row.scan_count,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      photoCount: thumbnail?.count ?? 0,
      thumbnailR2Key: thumbnail?.r2Key ?? null,
    };
  });

  return { items, page, pageSize, totalCount };
}

/**
 * One batched query for every barcode on the page (never one query per
 * card — same principle as ingredientKnowledge.ts's batch lookup),
 * preferring a 'front' photo as the thumbnail since that's the shot most
 * recognisable at a glance; falls back to whichever photo exists first.
 */
async function lookupThumbnails(
  db: D1Like,
  barcodes: string[],
): Promise<Map<string, { count: number; r2Key: string }>> {
  const result = new Map<
    string,
    { count: number; r2Key: string }
  >();

  if (barcodes.length === 0) {
    return result;
  }

  const { results } = await db
    .prepare(
      `SELECT barcode, photo_type, r2_key FROM product_photos WHERE barcode IN (${barcodes.map(() => "?").join(", ")})`,
    )
    .bind(...barcodes)
    .all<RawPhotoLookupRow>();

  const byBarcode = new Map<string, RawPhotoLookupRow[]>();

  for (const row of results ?? []) {
    const list = byBarcode.get(row.barcode) ?? [];
    list.push(row);
    byBarcode.set(row.barcode, list);
  }

  for (const [barcode, photos] of byBarcode) {
    const front = photos.find(
      (photo) => photo.photo_type === "front",
    );

    result.set(barcode, {
      count: photos.length,
      r2Key: (front ?? photos[0]).r2_key,
    });
  }

  return result;
}

export async function getAdminProduct(
  db: D1Like,
  barcode: string,
): Promise<AdminProductDetail | null> {
  const row = await db
    .prepare(
      "SELECT barcode, product_name, category, status, source, scan_count, created_at, updated_at, analysis_result FROM products WHERE barcode = ?",
    )
    .bind(barcode)
    .first<RawProductRow & { analysis_result: string | null }>();

  if (!row) {
    return null;
  }

  const { results } = await db
    .prepare(
      "SELECT id, photo_type, r2_key, uploaded_at FROM product_photos WHERE barcode = ? ORDER BY uploaded_at DESC, id DESC",
    )
    .bind(barcode)
    .all<{
      id: number;
      photo_type: string;
      r2_key: string;
      uploaded_at: string;
    }>();

  let analysisResult: unknown = null;

  if (row.analysis_result) {
    try {
      analysisResult = JSON.parse(row.analysis_result);
    } catch {
      analysisResult = null;
    }
  }

  return {
    barcode: row.barcode,
    productName: row.product_name,
    category: row.category,
    status: row.status,
    source: row.source,
    scanCount: row.scan_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    analysisResult,
    photos: (results ?? []).map((photo) => ({
      id: photo.id,
      photoType: photo.photo_type,
      r2Key: photo.r2_key,
      uploadedAt: photo.uploaded_at,
    })),
  };
}

const VALID_SCORE_BANDS = new Set([
  "excellent",
  "good",
  "moderate",
  "attention",
  "high_attention",
  "insufficient_data",
]);

function isPlainObject(
  value: unknown,
): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isValidScoreShape(value: unknown): boolean {
  if (!isPlainObject(value)) {
    return false;
  }

  return (
    (value.score === null || typeof value.score === "number") &&
    VALID_SCORE_BANDS.has(value.band as string) &&
    typeof value.confidence === "number" &&
    Number.isFinite(value.confidence) &&
    Array.isArray(value.deductions) &&
    Array.isArray(value.bonuses) &&
    Array.isArray(value.insufficientDataReasons) &&
    typeof value.scoringVersion === "string" &&
    (value.lowConfidenceReason === null ||
      typeof value.lowConfidenceReason === "string")
  );
}

/**
 * Same rules as the frontend's isWellFormedAnalysisResult
 * (src/services/analysisClient.ts) — kept as an independent
 * implementation here rather than imported, since that file pulls in
 * Vite-only globals (import.meta.env via ../config) that don't exist
 * under the Worker's build. Delegates the WorkerAnalysisResult-shaped
 * fields (productType, summary, positives, ingredientFindings, ...) to
 * parseAnalysis — the exact same validator every live AI response
 * already has to pass — by round-tripping the candidate through JSON so
 * a plain admin-submitted object hits the same code path a real AI reply
 * does. Only the fields analysis pipeline adds on top (score,
 * ingredientInsights, executiveSummary, allergenNotice, contentCategory)
 * are checked here directly.
 *
 * ingredients-category only for now — the PIM edit form (Part C) only has
 * fields for this shape; nutrition/chemical_composition rows can still be
 * listed and deleted through this API, just not edited yet.
 */
export function validateVerifiedAnalysisResult(
  candidate: unknown,
): Record<string, unknown> | null {
  if (!isPlainObject(candidate)) {
    return null;
  }

  const core = parseAnalysis(JSON.stringify(candidate));

  if (!core) {
    return null;
  }

  if (!isValidScoreShape(candidate.score)) {
    return null;
  }

  if (!isPlainObject(candidate.executiveSummary)) {
    return null;
  }

  if (!Array.isArray(candidate.ingredientInsights)) {
    return null;
  }

  if (
    candidate.allergenNotice !== null &&
    candidate.allergenNotice !== undefined &&
    !isPlainObject(candidate.allergenNotice)
  ) {
    return null;
  }

  return {
    ...core,
    score: candidate.score,
    executiveSummary: candidate.executiveSummary,
    ingredientInsights: candidate.ingredientInsights,
    allergenNotice: candidate.allergenNotice ?? null,
    contentCategory: "ingredients",
  };
}

export async function saveVerifiedProduct(
  db: D1Like,
  params: {
    barcode: string;
    category?: string;
    analysisResult: Record<string, unknown>;
  },
): Promise<void> {
  await db
    .prepare(
      `UPDATE products
       SET analysis_result = ?,
           category = COALESCE(?, category, 'ingredients'),
           status = 'verified',
           updated_at = datetime('now')
       WHERE barcode = ?`,
    )
    .bind(
      JSON.stringify(params.analysisResult),
      params.category ?? null,
      params.barcode,
    )
    .run();
}

/**
 * Deletes the product row and every one of its photos, both the D1 rows
 * and the underlying R2 objects — a hard delete, not a soft/deferred one.
 * Tradeoff considered: deferring R2 cleanup (e.g. leaving orphaned objects
 * for a periodic sweep) would make this endpoint faster and simpler to
 * make atomic, but at this scale (a manual, one-at-a-time admin action,
 * not a bulk operation) the extra R2 delete calls cost nothing noticeable
 * and avoid silently accumulating storage nobody will ever clean up.
 * R2 deletes happen before the D1 rows so a failure here leaves the
 * product_photos rows intact (pointing at objects that still exist)
 * rather than the reverse (rows gone, objects orphaned with nothing left
 * to find them by).
 */
export async function deleteAdminProduct(
  db: D1Like,
  photos: R2Like,
  barcode: string,
): Promise<void> {
  const { results } = await db
    .prepare(
      "SELECT r2_key FROM product_photos WHERE barcode = ?",
    )
    .bind(barcode)
    .all<{ r2_key: string }>();

  for (const row of results ?? []) {
    await photos.delete(row.r2_key);
  }

  await db
    .prepare("DELETE FROM product_photos WHERE barcode = ?")
    .bind(barcode)
    .run();

  await db
    .prepare("DELETE FROM products WHERE barcode = ?")
    .bind(barcode)
    .run();
}
