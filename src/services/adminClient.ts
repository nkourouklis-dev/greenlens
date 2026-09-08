import { apiBaseUrl, apiConfigurationError } from "../config";
import { UserFacingError } from "./errors";
import { getStoredAdminPassword } from "./adminAuth";
import type { PhotoType } from "../../worker/productPhotos";

export type { PhotoType };

/**
 * There's no dedicated "check my password" endpoint — every /api/admin/*
 * route already needs one, so this just pings the photo-list endpoint for
 * a throwaway barcode and reads the status code. A 200 (even for a barcode
 * with zero photos) means the header was accepted; a 401 means it wasn't.
 */
export async function verifyAdminPassword(
  password: string,
): Promise<boolean> {
  if (apiConfigurationError || !password.trim()) {
    return false;
  }

  try {
    const response = await fetch(
      `${apiBaseUrl}/api/admin/photos/0000000000000`,
      { headers: { "X-Admin-Password": password } },
    );

    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Uploads one captured photo for a barcode. Always reads the password from
 * session storage (not passed in) so every call site stays simple — by the
 * time this is reachable the admin gate has already verified it.
 */
export async function uploadAdminPhoto(
  barcode: string,
  photoType: PhotoType,
  file: File,
): Promise<string> {
  if (apiConfigurationError) {
    throw new UserFacingError(apiConfigurationError);
  }

  const formData = new FormData();
  formData.append("image", file, "capture.jpg");
  formData.append("photoType", photoType);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);

  let response: Response;

  try {
    response = await fetch(
      `${apiBaseUrl}/api/admin/photos/${encodeURIComponent(barcode)}`,
      {
        method: "POST",
        headers: {
          "X-Admin-Password": getStoredAdminPassword(),
        },
        body: formData,
        signal: controller.signal,
      },
    );
  } catch (caughtError) {
    throw new UserFacingError(
      caughtError instanceof DOMException &&
        caughtError.name === "AbortError"
        ? "Η μεταφόρτωση καθυστέρησε υπερβολικά. Δοκιμάστε ξανά."
        : "Δεν ήταν δυνατή η σύνδεση με την υπηρεσία.",
    );
  } finally {
    clearTimeout(timeout);
  }

  if (response.status === 401) {
    throw new UserFacingError(
      "Λάθος κωδικός διαχειριστή. Συνδεθείτε ξανά.",
    );
  }

  if (!response.ok) {
    throw new UserFacingError(
      "Η μεταφόρτωση της φωτογραφίας απέτυχε.",
    );
  }

  const body: unknown = await response.json().catch(() => null);

  const r2Key =
    body &&
    typeof body === "object" &&
    typeof (body as { r2Key?: unknown }).r2Key === "string"
      ? (body as { r2Key: string }).r2Key
      : "";

  return r2Key;
}
