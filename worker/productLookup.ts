import {
  panelFromOpenFoodFacts,
  type NutritionPanel,
} from "./nutritionPanel";

/** Minimal shape used from D1 — same pattern as productPhotos.ts. */
export interface D1PreparedStatementLike {
  bind(...values: unknown[]): D1PreparedStatementLike;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run(): Promise<unknown>;
}

export interface D1Like {
  prepare(query: string): D1PreparedStatementLike;
}

/**
 * Bumped whenever the shape of what we extract from an OFF record changes,
 * so old rows are ignored rather than served by newer code that expects
 * different fields.
 */
const CACHE_SCHEMA_VERSION = 1;

/**
 * A product OFF knows about barely changes; a barcode it does not know is
 * exactly the thing most likely to change, since anyone can add it
 * tomorrow. Hence two clocks.
 */
const HIT_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MISS_TTL_MS = 24 * 60 * 60 * 1000;

interface BarcodeProductResult {
  productName: string | null;
  brand: string | null;
  netContent: string | null;
  /**
   * Per-100 quantities from the record, when it carries a believable set.
   * Same shape the OCR path produces (nutritionPanel.ts), so a score cannot
   * tell which one it was handed — and null more often than not, since OFF
   * coverage is thin outside the big brands.
   */
  nutritionPanel: NutritionPanel | null;
  confidence: number;
  source: "openfoodfacts" | "openbeautyfacts" | null;
}

function trimAndLimit(value: string | undefined, maxLength: number): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
}

function deduplicateBrandFromName(
  brand: string | null,
  productName: string | null,
): { brand: string | null; productName: string | null } {
  if (!brand || !productName) {
    return { brand, productName };
  }
  const brandLower = brand.toLowerCase().trim();
  const nameLower = productName.toLowerCase();
  if (nameLower.startsWith(brandLower)) {
    return { brand: null, productName };
  }
  return { brand, productName };
}

/**
 * Categories that mean the numbers are per 100 ml of something drunk.
 *
 * Matched whole, never as a suffix. Open Food Facts files ordinary groceries
 * under the umbrella "en:plant-based-foods-and-beverages", so "does any tag
 * end in -beverages" called a box of breakfast cereal a drink and put its
 * 19,9 g of sugar on the drinks scale — a 60-point penalty instead of 20,
 * which is two bands of the final score.
 */
const BEVERAGE_CATEGORY_TAGS = new Set([
  "en:beverages",
  "en:waters",
  "en:sodas",
  "en:juices",
  "en:fruit-juices",
  "en:nectars",
  "en:juices-and-nectars",
  "en:plant-based-beverages",
  "en:dairy-drinks",
  "en:iced-teas",
  "en:energy-drinks",
  "en:sweetened-beverages",
]);

/**
 * A record declared per 100 ml rather than per 100 g. Read off the product
 * categories rather than guessed from the name, and it matters: sugars in a
 * drink are banded far more harshly (nutritionThresholds.ts).
 */
export function isBeverageProduct(
  product: Record<string, unknown>,
): boolean {
  const tags = product.categories_tags;

  return (
    Array.isArray(tags) &&
    tags.some(
      (tag) =>
        typeof tag === "string" &&
        BEVERAGE_CATEGORY_TAGS.has(tag.trim().toLowerCase()),
    )
  );
}

function extractFromOpenFoodFacts(
  data: Record<string, unknown>,
): {
  productName: string | null;
  brand: string | null;
  netContent: string | null;
  nutritionPanel: NutritionPanel | null;
} | null {
  if (!data.code || !data.product) {
    return null;
  }

  const product = data.product as Record<string, unknown>;

  let productName =
    trimAndLimit(product.product_name_el as string, 80) ||
    trimAndLimit(product.product_name as string, 80) ||
    trimAndLimit(product.product_name_en as string, 80) ||
    trimAndLimit(product.generic_name_el as string, 80) ||
    trimAndLimit(product.generic_name as string, 80) ||
    trimAndLimit(product.generic_name_en as string, 80);

  let brand = trimAndLimit(product.brands as string, 60);

  const netContent = trimAndLimit(product.quantity as string, 30);

  const dedup = deduplicateBrandFromName(brand, productName);

  return {
    productName: dedup.productName,
    brand: dedup.brand,
    netContent,
    nutritionPanel: panelFromOpenFoodFacts(
      product.nutriments,
      isBeverageProduct(product),
    ),
  };
}

function validateBarcode(barcode: string): boolean {
  const trimmed = barcode.trim();
  if (!/^\d+$/.test(trimmed)) return false;
  const len = trimmed.length;
  return len >= 8 && len <= 14;
}

const EMPTY_RESULT: BarcodeProductResult = {
  productName: null,
  brand: null,
  netContent: null,
  nutritionPanel: null,
  confidence: 0,
  source: null,
};

/**
 * The cached answer for this barcode, or null when there isn't a usable one.
 *
 * Every failure here — no table yet, unreadable row, D1 hiccup — means the
 * same thing: ask Open Food Facts. A cache that can break the lookup it is
 * meant to speed up would be worse than no cache.
 */
async function readCachedLookup(
  db: D1Like,
  barcode: string,
): Promise<BarcodeProductResult | null> {
  try {
    const row = await db
      .prepare(
        "SELECT result, found, fetched_at_ms FROM openfoodfacts_cache WHERE barcode = ? AND schema_version = ?",
      )
      .bind(barcode, CACHE_SCHEMA_VERSION)
      .first<{
        result: string;
        found: number;
        fetched_at_ms: number;
      }>();

    if (!row) {
      return null;
    }

    const age = Date.now() - row.fetched_at_ms;

    if (age > (row.found === 1 ? HIT_TTL_MS : MISS_TTL_MS)) {
      return null;
    }

    const parsed: unknown = JSON.parse(row.result);

    return typeof parsed === "object" && parsed !== null
      ? (parsed as BarcodeProductResult)
      : null;
  } catch {
    return null;
  }
}

/** Best-effort write. A cache miss costs a request; a throw costs the scan. */
async function writeCachedLookup(
  db: D1Like,
  barcode: string,
  result: BarcodeProductResult,
): Promise<void> {
  try {
    await db
      .prepare(
        `INSERT INTO openfoodfacts_cache (barcode, schema_version, result, found, fetched_at_ms)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(barcode) DO UPDATE SET
           schema_version = excluded.schema_version,
           result = excluded.result,
           found = excluded.found,
           fetched_at_ms = excluded.fetched_at_ms`,
      )
      .bind(
        barcode,
        CACHE_SCHEMA_VERSION,
        JSON.stringify(result),
        result.source === null ? 0 : 1,
        Date.now(),
      )
      .run();
  } catch (error) {
    console.error("openfoodfacts_cache_write_failed", {
      barcode,
      message:
        error instanceof Error ? error.message : String(error).slice(0, 200),
    });
  }
}

/**
 * Asks Open Food Facts, then Open Beauty Facts. No caching and no barcode
 * validation — both belong to the exported wrapper below.
 */
async function fetchFromOpenFoodFacts(
  barcode: string,
  timeoutMs: number,
): Promise<{ result: BarcodeProductResult; completed: boolean }> {
  const encodedBarcode = encodeURIComponent(barcode.trim());

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    // Try Open Food Facts first
    const offResponse = await fetch(
      `https://world.openfoodfacts.org/api/v2/product/${encodedBarcode}.json`,
      {
        signal: controller.signal,
        headers: {
          "User-Agent": "GreenLens/1.0 (+https://greenlens.app)",
        },
      },
    );

    if (offResponse.ok) {
      const offData = (await offResponse.json()) as Record<string, unknown>;
      const extracted = extractFromOpenFoodFacts(offData);

      if (extracted && (extracted.productName || extracted.brand)) {
        clearTimeout(timeoutId);
        return {
          result: {
            ...extracted,
            confidence: extracted.productName
              ? 0.98
              : extracted.brand
                ? 0.8
                : 0.6,
            source: "openfoodfacts",
          },
          completed: true,
        };
      }
    }

    // Try Open Beauty Facts as fallback
    const obfResponse = await fetch(
      `https://world.openbeautyfacts.org/api/v2/product/${encodedBarcode}.json`,
      {
        signal: controller.signal,
        headers: {
          "User-Agent": "GreenLens/1.0 (+https://greenlens.app)",
        },
      },
    );

    if (obfResponse.ok) {
      const obfData = (await obfResponse.json()) as Record<string, unknown>;
      const extracted = extractFromOpenFoodFacts(obfData);

      if (extracted && (extracted.productName || extracted.brand)) {
        clearTimeout(timeoutId);
        return {
          result: {
            ...extracted,
            confidence: extracted.productName
              ? 0.98
              : extracted.brand
                ? 0.8
                : 0.6,
            source: "openbeautyfacts",
          },
          completed: true,
        };
      }
    }

    clearTimeout(timeoutId);

    // Both services answered and neither knows this barcode. That is a real
    // answer about the product, and worth not asking for again immediately.
    return { result: EMPTY_RESULT, completed: true };
  } catch {
    clearTimeout(timeoutId);

    // A timeout or a network error says nothing about the product, only
    // about the moment. The caller still gets a blank result so the scan
    // carries on, but `completed: false` keeps it out of the cache — one bad
    // minute must not blank a perfectly well-known barcode for a day.
    return { result: EMPTY_RESULT, completed: false };
  }
}

/**
 * Product identity and per-100 quantities for a barcode, from Open Food
 * Facts (or Open Beauty Facts for cosmetics).
 *
 * Pass `db` to serve repeat scans from D1 instead of calling out again. The
 * same barcodes come back constantly — re-checking a product is what the app
 * is for — and this call sits on the critical path of a scan the user is
 * waiting on, twice: once to name the product, once as the nutrition
 * fallback for a label photographed without its table.
 *
 * Without `db` it behaves exactly as it always has.
 */
export async function lookupProductByBarcode(
  barcode: string,
  options?: { timeoutMs?: number; db?: D1Like },
): Promise<BarcodeProductResult> {
  if (!validateBarcode(barcode)) {
    return EMPTY_RESULT;
  }

  const key = barcode.trim();
  const db = options?.db;

  if (db) {
    const cached = await readCachedLookup(db, key);

    if (cached) {
      return cached;
    }
  }

  const { result, completed } = await fetchFromOpenFoodFacts(
    key,
    options?.timeoutMs ?? 4000,
  );

  if (db && completed) {
    await writeCachedLookup(db, key, result);
  }

  return result;
}
