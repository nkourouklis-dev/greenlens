interface BarcodeProductResult {
  productName: string | null;
  brand: string | null;
  netContent: string | null;
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

function extractFromOpenFoodFacts(
  data: Record<string, unknown>,
): { productName: string | null; brand: string | null; netContent: string | null } | null {
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
  };
}

function validateBarcode(barcode: string): boolean {
  const trimmed = barcode.trim();
  if (!/^\d+$/.test(trimmed)) return false;
  const len = trimmed.length;
  return len >= 8 && len <= 14;
}

export async function lookupProductByBarcode(
  barcode: string,
  options?: { timeoutMs?: number },
): Promise<BarcodeProductResult> {
  const timeoutMs = options?.timeoutMs ?? 4000;

  if (!validateBarcode(barcode)) {
    return {
      productName: null,
      brand: null,
      netContent: null,
      confidence: 0,
      source: null,
    };
  }

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
          ...extracted,
          confidence: extracted.productName ? 0.98 : extracted.brand ? 0.80 : 0.60,
          source: "openfoodfacts",
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
          ...extracted,
          confidence: extracted.productName ? 0.98 : extracted.brand ? 0.80 : 0.60,
          source: "openbeautyfacts",
        };
      }
    }

    clearTimeout(timeoutId);
    return {
      productName: null,
      brand: null,
      netContent: null,
      confidence: 0,
      source: null,
    };
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === "AbortError") {
      // Timeout or abort - return null result
      return {
        productName: null,
        brand: null,
        netContent: null,
        confidence: 0,
        source: null,
      };
    }
    // Network error or other failure - return null result (fallback to AI)
    return {
      productName: null,
      brand: null,
      netContent: null,
      confidence: 0,
      source: null,
    };
  }
}
