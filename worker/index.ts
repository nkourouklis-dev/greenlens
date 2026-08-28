import { parseOcrModelOutput, validateOcrRequest, type OcrResponse } from "./ocr";

const allowedOrigins = new Set(["http://localhost:5173", "http://127.0.0.1:5173"]);
const visionModel = "@cf/llava-hf/llava-1.5-7b-hf";
const ocrPrompt = "Transcribe only visible label text, prioritizing the ingredients list. Return only JSON: {\"rawText\": string, \"confidence\": number from 0 to 1}. Do not make health, medical, regulatory, or safety conclusions. Do not calculate a product score.";

export default {
  async fetch(request, env): Promise<Response> {
    const origin = request.headers.get("Origin");
    if (request.method === "OPTIONS") return handleOptions(origin);

    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/api/health") return json({ status: "ok", service: "greenlens-ocr" }, 200, origin);
    if (request.method !== "POST" || url.pathname !== "/api/ocr/extract") return error("Η διαδρομή δεν βρέθηκε.", 404, origin);
    if (!request.headers.get("content-type")?.includes("multipart/form-data")) return error("Απαιτείται multipart/form-data.", 400, origin);

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return error("Το multipart payload δεν είναι έγκυρο.", 400, origin);
    }

    const imageValue = formData.get("image");
    const image = imageValue instanceof File ? imageValue : null;
    const barcode = readTextField(formData, "barcode");
    const productId = readTextField(formData, "productId");
    const validationError = validateOcrRequest(image, barcode, productId);
    if (validationError) return error(validationError, 400, origin);
    if (!image) return error("Λείπει η εικόνα της ετικέτας.", 400, origin);

    try {
      const imageBytes = Array.from(new Uint8Array(await image.arrayBuffer()));
      const modelOutput = await env.AI.run(visionModel, { image: imageBytes, prompt: ocrPrompt });
      const result = parseOcrModelOutput(modelOutput);
      if (!result) return error("Η ανάγνωση της ετικέτας δεν επέστρεψε έγκυρα δεδομένα.", 502, origin);
      return json(result, 200, origin);
    } catch (caughtError) {
      console.error("ocr_extract_failed", { message: caughtError instanceof Error ? caughtError.message : "unknown" });
      return error("Δεν ήταν δυνατή η ανάγνωση της ετικέτας.", 502, origin);
    }
  },
} satisfies ExportedHandler<Env>;

function handleOptions(origin: string | null): Response {
  if (!origin || !allowedOrigins.has(origin)) return new Response(null, { status: 403, headers: { Vary: "Origin" } });
  return new Response(null, { status: 204, headers: corsHeaders(origin) });
}

function readTextField(formData: FormData, name: string): string | null {
  const value = formData.get(name);
  return typeof value === "string" ? value : null;
}

function json(body: OcrResponse | { status: "ok"; service: "greenlens-ocr" }, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", ...corsHeaders(origin) } });
}

function error(message: string, status: number, origin: string | null): Response {
  return new Response(JSON.stringify({ error: message }), { status, headers: { "content-type": "application/json; charset=utf-8", ...corsHeaders(origin) } });
}

function corsHeaders(origin: string | null): Record<string, string> {
  const headers: Record<string, string> = { Vary: "Origin" };
  if (origin && allowedOrigins.has(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS";
    headers["Access-Control-Allow-Headers"] = "Content-Type";
  }
  return headers;
}