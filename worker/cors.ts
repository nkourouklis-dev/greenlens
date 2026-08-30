const localOrigins = new Set(["http://localhost:5173", "http://127.0.0.1:5173"]);

export function isAllowedOrigin(origin: string): boolean {
  if (localOrigins.has(origin)) return true;
  try {
    const url = new URL(origin);
    return url.protocol === "https:" && (url.hostname === "greenlens.pages.dev" || url.hostname.endsWith(".greenlens.pages.dev"));
  } catch {
    return false;
  }
}