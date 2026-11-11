import { apiBaseUrl, apiConfigurationError } from "../config";
import {
  parseTrustedAnalysis,
  type AnalysisApiResult,
} from "./analysisClient";

/** What Open Food Facts already holds for a barcode (worker/offAvailability.ts). */
export interface OffAvailability {
  ingredients: boolean;
  nutrition: boolean;
  nutriScore: boolean;
  source: "openfoodfacts" | "openbeautyfacts" | null;
}

export interface OffLookup {
  availability: OffAvailability;
  productName: string | null;
  brand: string | null;
  ingredientsText: string | null;
}

/** True when the record can stand in for every photo (food: both halves). */
export function canSkipAllPhotos(availability: OffAvailability): boolean {
  if (availability.source === "openbeautyfacts") {
    return availability.ingredients;
  }

  return (
    availability.source === "openfoodfacts" &&
    availability.ingredients &&
    availability.nutrition
  );
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/**
 * Asks the Worker what Open Food Facts holds for this barcode. Never throws:
 * a timeout, an outage or an odd reply all mean "nothing available", which
 * leaves the photo flow exactly as it was.
 */
export async function fetchOffAvailability(
  barcode: string,
): Promise<OffLookup | null> {
  if (apiConfigurationError || !barcode.trim()) {
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);

  try {
    const response = await fetch(
      `${apiBaseUrl}/api/product/off/${encodeURIComponent(barcode.trim())}`,
      { signal: controller.signal },
    );

    if (!response.ok) {
      return null;
    }

    const body: unknown = await response.json().catch(() => null);

    if (typeof body !== "object" || body === null) {
      return null;
    }

    const record = body as Record<string, unknown>;
    const availability = record.availability as
      | Partial<OffAvailability>
      | undefined;

    if (!availability || typeof availability !== "object") {
      return null;
    }

    return {
      availability: {
        ingredients: availability.ingredients === true,
        nutrition: availability.nutrition === true,
        nutriScore: availability.nutriScore === true,
        source:
          availability.source === "openfoodfacts" ||
          availability.source === "openbeautyfacts"
            ? availability.source
            : null,
      },
      productName: text(record.productName),
      brand: text(record.brand),
      ingredientsText: text(record.ingredientsText),
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * The finished result built from Open Food Facts alone, or null when the
 * Worker declined (incomplete record) or anything went wrong — the caller
 * then simply carries on with the photo flow.
 */
export async function analyzeFromOff(
  barcode: string,
): Promise<{ result: AnalysisApiResult; sourceText: string } | null> {
  if (apiConfigurationError || !barcode.trim()) {
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

  try {
    const response = await fetch(`${apiBaseUrl}/api/analysis/from-off`, {
      method: "POST",
      body: JSON.stringify({ barcode: barcode.trim() }),
      signal: controller.signal,
    });

    if (!response.ok) {
      return null;
    }

    return parseTrustedAnalysis(await response.json().catch(() => null));
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
