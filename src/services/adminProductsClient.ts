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

export interface AdminProductVersion {
  id: number;
  barcode: string;
  source: "user_scan" | "admin_analyze" | "admin_edit" | "restore";
  productName: string | null;
  category: string | null;
  score: number | null;
  band: string | null;
  applied: boolean;
  createdAt: string;
  analysisResult?: unknown;
}

export interface AssistantDraft {
  summary: string;
  overallVerdict: string;
  highlights: string[];
  watchOutFor: string[];
}

export interface AssistantFacts {
  totalProducts: number;
  byStatus: Array<{ status: string; count: number }>;
  byCategory: Array<{ category: string; count: number }>;
  byBand: Array<{ band: string; count: number }>;
  averageScore: number | null;
  pendingReview: number;
  unappliedVersions: number;
  recentlyUpdated: Array<{
    barcode: string;
    productName: string | null;
    status: string;
    score: number | null;
    band: string | null;
    updatedAt: string;
  }>;
}

export interface AssistantReply {
  mode: "draft" | "report";
  text: string | null;
  draft: AssistantDraft | null;
  facts: AssistantFacts | null;
}

/**
 * One place for every admin call's plumbing: configuration guard, the
 * shared-secret header, network failure wording, and error extraction.
 * The older functions in this file predate it and keep their own copies.
 */
async function adminRequest<T>(
  path: string,
  init: RequestInit,
  fallbackError: string,
): Promise<T> {
  if (apiConfigurationError) {
    throw new UserFacingError(apiConfigurationError);
  }

  let response: Response;

  try {
    response = await fetch(`${apiBaseUrl}${path}`, {
      ...init,
      headers: {
        ...authHeaders(),
        ...(init.body ? { "content-type": "application/json" } : {}),
        ...(init.headers ?? {}),
      },
    });
  } catch {
    throw new UserFacingError(
      "Δεν ήταν δυνατή η σύνδεση με την υπηρεσία.",
    );
  }

  if (!response.ok) {
    throw new UserFacingError(
      await parseErrorMessage(response, fallbackError),
    );
  }

  const body: unknown = await response.json().catch(() => null);

  if (!body || typeof body !== "object") {
    throw new UserFacingError(fallbackError);
  }

  return body as T;
}

export async function listProductVersions(
  barcode: string,
): Promise<AdminProductVersion[]> {
  const body = await adminRequest<{ versions: AdminProductVersion[] }>(
    `/api/admin/products/${encodeURIComponent(barcode)}/versions`,
    { method: "GET" },
    "Το ιστορικό εκδόσεων δεν φορτώθηκε.",
  );

  return Array.isArray(body.versions) ? body.versions : [];
}

export async function getProductVersion(
  barcode: string,
  id: number,
): Promise<AdminProductVersion> {
  const body = await adminRequest<{ version: AdminProductVersion }>(
    `/api/admin/products/${encodeURIComponent(barcode)}/versions?id=${id}`,
    { method: "GET" },
    "Η έκδοση δεν φορτώθηκε.",
  );

  return body.version;
}

export async function restoreProductVersion(
  barcode: string,
  versionId: number,
): Promise<AdminProductDetail> {
  const body = await adminRequest<{ product: AdminProductDetail }>(
    `/api/admin/products/${encodeURIComponent(barcode)}/versions`,
    { method: "POST", body: JSON.stringify({ versionId }) },
    "Η επαναφορά απέτυχε.",
  );

  return body.product;
}

export async function assistDraft(
  barcode: string,
): Promise<AssistantReply> {
  const body = await adminRequest<{ assistant: AssistantReply }>(
    "/api/admin/assist",
    { method: "POST", body: JSON.stringify({ mode: "draft", barcode }) },
    "Ο βοηθός δεν απάντησε.",
  );

  return body.assistant;
}

export async function assistReport(
  question: string,
): Promise<AssistantReply> {
  const body = await adminRequest<{ assistant: AssistantReply }>(
    "/api/admin/assist",
    { method: "POST", body: JSON.stringify({ mode: "report", question }) },
    "Ο βοηθός δεν απάντησε.",
  );

  return body.assistant;
}
