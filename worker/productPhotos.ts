/**
 * D1-backed `product_photos` rows (see migrations/0005_add_capture_flow.sql)
 * for the bulk in-store capture flow. Unlike productCache.ts, this is not
 * an optional/best-effort layer around an otherwise-complete request — the
 * photo record *is* the thing the admin capture endpoint exists to create,
 * so read/write failures here propagate to the caller instead of being
 * swallowed. An admin capturing photos in a store needs to know if a save
 * actually failed, not see a false "saved" confirmation.
 */

// Minimal shape actually used from a D1Database — see productCache.ts for
// the same pattern. Defined separately (rather than reusing productCache's
// narrower D1Like) because this module also needs `all()` for listing.
export interface D1PreparedStatementLike {
  bind(...values: unknown[]): D1PreparedStatementLike;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run(): Promise<unknown>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
}

export interface D1Like {
  prepare(query: string): D1PreparedStatementLike;
}

export type PhotoType =
  | "front"
  | "ingredients"
  | "nutrition"
  | "other";

/** Who put a photo in the catalogue. */
export type PhotoSource = "admin_capture" | "user_scan";

export interface ProductPhotoRow {
  id: number;
  barcode: string;
  photoType: PhotoType;
  r2Key: string;
  uploadedAt: string;
  uploadedBy: PhotoSource;
}

interface RawPhotoRow {
  id: number;
  barcode: string;
  photo_type: string;
  r2_key: string;
  uploaded_at: string;
  uploaded_by: string | null;
}

export function isPhotoType(value: unknown): value is PhotoType {
  return (
    value === "front" ||
    value === "ingredients" ||
    value === "nutrition" ||
    value === "other"
  );
}

/**
 * Records one uploaded photo. Called after the R2 write already succeeded
 * (see runAdminUploadPhoto in worker/index.ts) — if this throws, the
 * caller still returns an error even though the object now sits in R2, but
 * that's the safer failure mode: an orphaned R2 object is harmless and
 * cleanable later, whereas a product_photos row with no matching object
 * would be a broken reference the admin/PIM can't do anything with.
 */
export async function insertProductPhoto(
  db: D1Like,
  params: {
    barcode: string;
    photoType: PhotoType;
    r2Key: string;
    /** Defaults to the in-store capture flow, which is the older caller. */
    uploadedBy?: PhotoSource;
  },
): Promise<void> {
  await db
    .prepare(
      "INSERT INTO product_photos (barcode, photo_type, r2_key, uploaded_by) VALUES (?, ?, ?, ?)",
    )
    .bind(
      params.barcode,
      params.photoType,
      params.r2Key,
      params.uploadedBy ?? "admin_capture",
    )
    .run();
}

/**
 * Removes the rows for previous user-scan photos of one type, returning
 * their R2 keys so the caller can delete the objects too.
 *
 * Bounds what the public flow can accumulate: a barcode scanned by fifty
 * people should hold the newest label shot, not fifty of them. Admin
 * captures are never touched — those are the curated ones.
 */
export async function pruneUserPhotos(
  db: D1Like,
  barcode: string,
  photoType: PhotoType,
): Promise<string[]> {
  const { results } = await db
    .prepare(
      "SELECT id, r2_key FROM product_photos WHERE barcode = ? AND photo_type = ? AND uploaded_by = 'user_scan'",
    )
    .bind(barcode, photoType)
    .all<{ id: number; r2_key: string }>();

  const rows = results ?? [];

  if (rows.length === 0) {
    return [];
  }

  await db
    .prepare(
      "DELETE FROM product_photos WHERE barcode = ? AND photo_type = ? AND uploaded_by = 'user_scan'",
    )
    .bind(barcode, photoType)
    .run();

  return rows.map((row) => row.r2_key);
}

/**
 * Lists every photo captured for a barcode, newest first.
 */
export async function listProductPhotos(
  db: D1Like,
  barcode: string,
): Promise<ProductPhotoRow[]> {
  const { results } = await db
    .prepare(
      "SELECT id, barcode, photo_type, r2_key, uploaded_at, uploaded_by FROM product_photos WHERE barcode = ? ORDER BY uploaded_at DESC, id DESC",
    )
    .bind(barcode)
    .all<RawPhotoRow>();

  return (results ?? [])
    .filter(
      (
        row,
      ): row is RawPhotoRow & { photo_type: PhotoType } =>
        isPhotoType(row.photo_type),
    )
    .map((row) => ({
      id: row.id,
      barcode: row.barcode,
      photoType: row.photo_type,
      r2Key: row.r2_key,
      uploadedAt: row.uploaded_at,
      uploadedBy:
        row.uploaded_by === "user_scan" ? "user_scan" : "admin_capture",
    }));
}

/**
 * Whether the catalogue holds any photo for this barcode. Kept separate
 * from listProductPhotos because the public cache lookup only needs the
 * yes/no to decide whether to hand the app a photo URL, and that runs on
 * every scan of a known product.
 */
export async function hasProductPhoto(
  db: D1Like,
  barcode: string,
): Promise<boolean> {
  try {
    const row = await db
      .prepare(
        "SELECT 1 AS present FROM product_photos WHERE barcode = ? LIMIT 1",
      )
      .bind(barcode)
      .first<{ present: number }>();

    return Boolean(row);
  } catch {
    return false;
  }
}

/**
 * Creates a bare 'draft' products row for a barcode captured through this
 * flow with no analysis yet — category/analysis_result stay NULL until a
 * real analysis eventually runs (see migrations/0005_add_capture_flow.sql
 * for why NULL rather than an 'unknown' category).
 *
 * Deliberately does nothing if a row already exists for this barcode,
 * regardless of its current status — capturing an extra photo of an
 * already-analyzed (or already-draft) product must never downgrade or
 * touch its existing row. Best-effort/non-throwing on purpose (unlike the
 * rest of this module): the photo itself is already safely recorded by
 * the time this runs, so a failure here only means the future PIM won't
 * see this barcode listed as a draft yet — not that the capture failed.
 */
export async function ensureDraftProduct(
  db: D1Like,
  barcode: string,
): Promise<void> {
  try {
    await db
      .prepare(
        `INSERT INTO products (barcode, category, analysis_result, status, source, scan_count)
         VALUES (?, NULL, NULL, 'draft', 'pim_capture', 0)
         ON CONFLICT(barcode) DO NOTHING`,
      )
      .bind(barcode)
      .run();
  } catch (caughtError) {
    console.error("product_draft_ensure_failed", {
      barcode,
      message:
        caughtError instanceof Error
          ? caughtError.message
          : String(caughtError).slice(0, 300),
    });
  }
}
