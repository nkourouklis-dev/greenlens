import { useEffect, useState } from "react";
import { fetchAdminPhotoBlob } from "../services/adminProductsClient";

/**
 * Fetches an admin photo (authenticated — see fetchAdminPhotoBlob) once
 * per r2Key and hands back an object URL, revoking it on cleanup/change.
 * Returns null while loading, on a missing key, or if the fetch failed.
 */
export function useAdminPhotoUrl(
  r2Key: string | null,
): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!r2Key) {
      setUrl(null);
      return;
    }

    let cancelled = false;
    let objectUrl: string | null = null;

    fetchAdminPhotoBlob(r2Key).then((blob) => {
      if (cancelled || !blob) {
        return;
      }

      objectUrl = URL.createObjectURL(blob);
      setUrl(objectUrl);
    });

    return () => {
      cancelled = true;

      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [r2Key]);

  return url;
}
