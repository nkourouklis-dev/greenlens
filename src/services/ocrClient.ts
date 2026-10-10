import type { OcrResult } from "../types";
import { apiBaseUrl, apiConfigurationError } from "../config";

export async function extractOcr(image: string, barcode: string, productId: string, expect?: "nutrition"): Promise<OcrResult> {
  if (apiConfigurationError) throw new Error(apiConfigurationError);
  const formData = new FormData();
  const imageBlob = await (await fetch(image)).blob();
  formData.append("image", imageBlob, "ingredients.jpg");
  formData.append("barcode", barcode);
  formData.append("productId", productId);
  if (expect) formData.append("expect", expect);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  let response: Response;
  try { response = await fetch(`${apiBaseUrl}/api/ocr/extract`, { method: "POST", body: formData, signal: controller.signal }); } catch (error) { throw new Error(error instanceof DOMException && error.name === "AbortError" ? "Η υπηρεσία ανάλυσης δεν είναι προσωρινά διαθέσιμη." : "Δεν ήταν δυνατή η σύνδεση με την υπηρεσία ανάλυσης."); } finally { clearTimeout(timeout); }
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new Error(readError(body));
  if (!isOcrResult(body)) throw new Error("Η υπηρεσία επέστρεψε μη έγκυρη ανάγνωση ετικέτας.");
  return body;
}

function isOcrResult(value: unknown): value is OcrResult {
  return typeof value === "object" && value !== null && "rawText" in value && "confidence" in value && "labelType" in value && "unreadableSegments" in value && typeof value.rawText === "string" && typeof value.confidence === "number" && Number.isFinite(value.confidence) && value.confidence >= 0 && value.confidence <= 1 && (value.labelType === "ingredients" || value.labelType === "nutrition" || value.labelType === "mixed" || value.labelType === "unknown") && Array.isArray(value.unreadableSegments) && value.unreadableSegments.every((segment) => typeof segment === "string");
}

// Keyed on the worker's error code so each failure reads differently: a bad
// key is the operator's problem, a quota or outage is "try later", and a
// photo problem is the person's to retry. Unknown codes fall back to the
// worker's own message.
const OCR_ERROR_MESSAGES: Record<string, string> = {
  ocr_not_configured: "Η ανάγνωση ετικέτας δεν έχει ρυθμιστεί στον διακομιστή (λείπει το κλειδί OCR). Ειδοποίησε τον διαχειριστή.",
  ocr_credentials_rejected: "Η υπηρεσία ανάγνωσης απέρριψε τα credentials ή η συνδρομή Azure είναι ανενεργή. Είναι θέμα ρύθμισης, όχι της φωτογραφίας — ειδοποίησε τον διαχειριστή.",
  ocr_endpoint_not_found: "Η διεύθυνση της υπηρεσίας ανάγνωσης δεν βρέθηκε. Είναι θέμα ρύθμισης — ειδοποίησε τον διαχειριστή.",
  ocr_access_blocked: "Η υπηρεσία ανάγνωσης είναι προσωρινά μη διαθέσιμη (όριο χρήσης ή ανενεργή συνδρομή). Δοκίμασε αργότερα.",
  ocr_rate_limited: "Πολλά αιτήματα αυτή τη στιγμή. Δοκίμασε ξανά σε λίγα δευτερόλεπτα.",
  ocr_unavailable: "Η υπηρεσία ανάγνωσης είναι προσωρινά μη διαθέσιμη. Δοκίμασε ξανά σε λίγο.",
  ocr_timeout: "Η υπηρεσία ανάγνωσης άργησε να απαντήσει. Δοκίμασε ξανά.",
  ocr_network: "Η υπηρεσία ανάγνωσης δεν ήταν προσβάσιμη. Δοκίμασε ξανά σε λίγο.",
  ocr_no_text: "Δεν βρέθηκε αναγνώσιμο κείμενο στη φωτογραφία. Δοκίμασε νέα λήψη με καλύτερο φωτισμό.",
};

export function ocrErrorMessage(code: string | undefined, fallback: string): string {
  return (code && OCR_ERROR_MESSAGES[code]) || fallback;
}

function readError(value: unknown): string {
  const code = typeof value === "object" && value !== null && "code" in value && typeof value.code === "string" ? value.code : undefined;
  const message = typeof value === "object" && value !== null && "error" in value && typeof value.error === "string" ? value.error : "";
  return ocrErrorMessage(code, message || "Δεν μπορέσαμε να διαβάσουμε καθαρά την ετικέτα. Δοκιμάστε ξανά με καλύτερο φωτισμό.");
}