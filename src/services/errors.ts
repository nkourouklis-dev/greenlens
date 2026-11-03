/**
 * Marks an error message as already written for end users (Greek, no
 * technical detail). Callers should show `error.message` verbatim only for
 * this class — any other thrown error (a raw TypeError, a bug) must never
 * reach the UI as-is; log it and show a generic fallback instead.
 */
export class UserFacingError extends Error {}

/**
 * Turns a fetch() that threw (never got a response) into a message that says
 * which of the three causes it was. The raw error goes to the console so the
 * cause is visible when debugging on a phone.
 */
export function networkFailureMessage(error: unknown, context: string): string {
  console.error("api_request_failed", { context, error });
  if (error instanceof DOMException && error.name === "AbortError") {
    return "Η υπηρεσία ανάλυσης άργησε να απαντήσει (timeout). Δοκίμασε ξανά.";
  }
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return "Δεν υπάρχει σύνδεση στο δίκτυο. Έλεγξε το internet και δοκίμασε ξανά.";
  }
  return "Δεν ήταν δυνατή η σύνδεση με την υπηρεσία ανάλυσης. Έλεγξε το δίκτυο και δοκίμασε ξανά.";
}

export function logServerFailure(context: string, status: number): void {
  console.error("api_server_error", { context, status });
}
