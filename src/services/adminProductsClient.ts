import { apiBaseUrl, apiConfigurationError } from "../config";
import { UserFacingError } from "./errors";
import { getStoredAdminPassword } from "./adminAuth";

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

export interface AdminProductListResult {
  items: AdminProductListItem[];
  page: number;
  pageSize: number;
  totalCount: number;
}

function authHeaders(): Record<string, string> {
  return { "X-Admin-Password": getStoredAdminPassword() };
}

async function parseErrorMessage(
  response: Response,
  fallback: string,
): Promise<string> {
  const body: unknown = await response.json().catch(() => null);

  if (
    body &&
    typeof body === "object" &&
    typeof (body as { error?: unknown }).error === "string"
  ) {
    return (body as { error: string }).error;
  }

  return fallback;
}

export async function listAdminProducts(options: {
  status?: string;
  search?: string;
  page?: number;
}): Promise<AdminProductListResult> {
  if (apiConfigurationError) {
    throw new UserFacingError(apiConfigurationError);
  }

  const params = new URLSearchParams();

  if (options.status) {
    params.set("status", options.status);
  }

  if (options.search) {
    params.set("search", options.search);
  }

  params.set("page", String(options.page ?? 1));

  let response: Response;

  try {
    response = await fetch(
      `${apiBaseUrl}/api/admin/products?${params.toString()}`,
      { headers: authHeaders() },
    );
  } catch {
    throw new UserFacingError(
      "Δεν ήταν δυνατή η σύνδεση με την υπηρεσία.",
    );
  }

  if (!response.ok) {
    throw new UserFacingError(
      await parseErrorMessage(
        response,
        "Η λίστα προϊόντων δεν φορτώθηκε.",
      ),
    );
  }

  return (await response.json()) as AdminProductListResult;
}

export async function getAdminProduct(
  barcode: string,
): Promise<AdminProductDetail> {
  if (apiConfigurationError) {
    throw new UserFacingError(apiConfigurationError);
  }

  let response: Response;

  try {
    response = await fetch(
      `${apiBaseUrl}/api/admin/products/${encodeURIComponent(barcode)}`,
      { headers: authHeaders() },
    );
  } catch {
    throw new UserFacingError(
      "Δεν ήταν δυνατή η σύνδεση με την υπηρεσία.",
    );
  }

  if (!response.ok) {
    throw new UserFacingError(
      await parseErrorMessage(
        response,
        "Το προϊόν δεν φορτώθηκε.",
      ),
    );
  }

  const body = (await response.json()) as {
    product: AdminProductDetail;
  };

  return body.product;
}

export async function updateAdminProduct(
  barcode: string,
  params: { analysisResult: unknown; category?: string },
): Promise<AdminProductDetail> {
  if (apiConfigurationError) {
    throw new UserFacingError(apiConfigurationError);
  }

  let response: Response;

  try {
    response = await fetch(
      `${apiBaseUrl}/api/admin/products/${encodeURIComponent(barcode)}`,
      {
        method: "PUT",
        headers: {
          ...authHeaders(),
          "content-type": "application/json",
        },
        body: JSON.stringify(params),
      },
    );
  } catch {
    throw new UserFacingError(
      "Δεν ήταν δυνατή η σύνδεση με την υπηρεσία.",
    );
  }

  if (!response.ok) {
    throw new UserFacingError(
      await parseErrorMessage(
        response,
        "Η αποθήκευση απέτυχε.",
      ),
    );
  }

  const body = (await response.json()) as {
    product: AdminProductDetail;
  };

  return body.product;
}

export async function deleteAdminProduct(
  barcode: string,
): Promise<void> {
  if (apiConfigurationError) {
    throw new UserFacingError(apiConfigurationError);
  }

  let response: Response;

  try {
    response = await fetch(
      `${apiBaseUrl}/api/admin/products/${encodeURIComponent(barcode)}`,
      { method: "DELETE", headers: authHeaders() },
    );
  } catch {
    throw new UserFacingError(
      "Δεν ήταν δυνατή η σύνδεση με την υπηρεσία.",
    );
  }

  if (!response.ok) {
    throw new UserFacingError(
      await parseErrorMessage(response, "Η διαγραφή απέτυχε."),
    );
  }
}

export async function analyzeAdminProduct(
  barcode: string,
): Promise<AdminProductDetail> {
  if (apiConfigurationError) {
    throw new UserFacingError(apiConfigurationError);
  }

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    60_000,
  );

  let response: Response;

  try {
    response = await fetch(
      `${apiBaseUrl}/api/admin/products/${encodeURIComponent(barcode)}/analyze`,
      { method: "POST", headers: authHeaders(), signal: controller.signal },
    );
  } catch (caughtError) {
    throw new UserFacingError(
      caughtError instanceof DOMException &&
        caughtError.name === "AbortError"
        ? "Η ανάλυση καθυστέρησε υπερβολικά. Δοκιμάστε ξανά."
        : "Δεν ήταν δυνατή η σύνδεση με την υπηρεσία.",
    );
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new UserFacingError(
      await parseErrorMessage(
        response,
        "Η ανάλυση δεν ολοκληρώθηκε.",
      ),
    );
  }

  const body = (await response.json()) as {
    product: AdminProductDetail;
  };

  return body.product;
}

/**
 * Fetches a stored photo as a Blob so it can be rendered as an
 * object-URL <img src>. A plain <img src="/api/admin/photos/file?..."> is
 * not an option since the endpoint requires the X-Admin-Password header,
 * which a browser's own image loader can't attach.
 */
export async function fetchAdminPhotoBlob(
  r2Key: string,
): Promise<Blob | null> {
  try {
    const response = await fetch(
      `${apiBaseUrl}/api/admin/photos/file?key=${encodeURIComponent(r2Key)}`,
      { headers: authHeaders() },
    );

    if (!response.ok) {
      return null;
    }

    return await response.blob();
  } catch {
    return null;
  }
}
