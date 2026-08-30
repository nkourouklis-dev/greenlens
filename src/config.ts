const configuredApiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim().replace(/\/+$/, "");
export const apiBaseUrl = import.meta.env.DEV ? "http://127.0.0.1:8787" : configuredApiBaseUrl ?? "";
export const apiConfigurationError = !import.meta.env.DEV && !configuredApiBaseUrl ? "Η υπηρεσία OCR δεν έχει ρυθμιστεί σωστά." : null;
export const analysisVersion = "2026.08.1";
export function apiDiagnostics(): { host: string; mode: string } | null { return import.meta.env.DEV ? { host: new URL(apiBaseUrl).host, mode: import.meta.env.MODE } : null; }