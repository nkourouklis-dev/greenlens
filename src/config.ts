const configuredApiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim();
export const apiBaseUrl = import.meta.env.DEV ? "http://127.0.0.1:8787" : configuredApiBaseUrl ?? "";
export const apiConfigurationError = !import.meta.env.DEV && !configuredApiBaseUrl ? "Δεν έχει ρυθμιστεί η διεύθυνση της υπηρεσίας ανάλυσης." : null;
export const analysisVersion = "2026.08.1";