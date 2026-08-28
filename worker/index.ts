import { parseOcrModelOutput, validateOcrRequest, type OcrResponse } from "./ocr";
import { parseAnalysis, type WorkerAnalysisResult } from "./analysis";

const allowedOrigins = new Set(["http://localhost:5173", "http://127.0.0.1:5173", "https://greenlens.pages.dev"]);
const visionModel = "@cf/llava-hf/llava-1.5-7b-hf";
const textModel = "@cf/meta/llama-3.1-8b-instruct";
const ocrPrompt = "Transcribe visible label text. Prioritize text headed Συστατικά, Ingredients, INGREDIENTS, or INCI. Preserve commas, percentages, parentheses, E-numbers, INCI terms, and emphasized allergens when visible. Return only JSON: {\"rawText\":string,\"confidence\":number,\"labelType\":\"ingredients|nutrition|mixed|unknown\",\"unreadableSegments\":string[]}. Transcription only: no health, medical, regulatory, safety conclusions or score.";

export default {
  async fetch(request, env): Promise<Response> {
    const origin = request.headers.get("Origin");
    if (request.method === "OPTIONS") return handleOptions(origin);

    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/api/health") return json({ status: "ok", service: "greenlens-ocr" }, 200, origin);
    if (request.method === "POST" && url.pathname === "/api/analysis/run") return runAnalysis(request, env, origin);
    if (request.method === "POST" && /^\/api\/products\/[^/]+\/chat$/.test(url.pathname)) return runChat(request, env, origin);
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

function json(body: OcrResponse | WorkerAnalysisResult | { status: "ok"; service: "greenlens-ocr" } | { answer: string }, status: number, origin: string | null): Response {
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

async function readJson(request: Request): Promise<unknown> {
  try { return await request.json() as unknown; } catch { return null; }
}

function isAnalysisRequest(value: unknown): value is { productId: string; barcode: string; productType: "food" | "cosmetic" | "unknown"; confirmedIngredientText: string; normalizedIngredients: unknown[] } {
  return isRecord(value) && isText(value.productId) && isText(value.barcode) && (value.productType === "food" || value.productType === "cosmetic" || value.productType === "unknown") && typeof value.confirmedIngredientText === "string" && Array.isArray(value.normalizedIngredients);
}

function isChatRequest(value: unknown): value is { question: string; conversationHistory: Array<{ context?: unknown }> } {
  return isRecord(value) && isText(value.question) && Array.isArray(value.conversationHistory);
}

function insufficientAnalysis(): WorkerAnalysisResult {
  return { productType: "unknown", summary: "Δεν υπάρχουν αρκετά στοιχεία για αξιόπιστη ανάλυση.", positives: [], attentionItems: [], potentialAllergens: [], ingredientFindings: [], insufficientDataReasons: ["Λείπει επιβεβαιωμένη και επαρκής λίστα συστατικών."], confidence: 0 };
}

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null; }
function isText(value: unknown): value is string { return typeof value === "string" && value.trim().length > 0; }

async function runAnalysis(request: Request, env: Env, origin: string | null): Promise<Response> {
  const requestBody = await readJson(request);
  if (!isAnalysisRequest(requestBody)) return error("Το αίτημα ανάλυσης δεν είναι έγκυρο.", 400, origin);
  if (!requestBody.confirmedIngredientText.trim() || requestBody.normalizedIngredients.length === 0) return json(insufficientAnalysis(), 200, origin);
  const prompt = `Interpret only this confirmed ingredient context as JSON. Do not calculate a score, do not claim safety, health, medical or regulatory conclusions, and do not invent source URLs. If evidence is unavailable use severity unknown, evidenceType none, sourceName null, sourceUrl null. Context: ${JSON.stringify(requestBody)}`;
  try {
    const modelOutput = await env.AI.run(textModel, { prompt });
    const result = parseAnalysis(modelOutput);
    return result ? json(result, 200, origin) : error("Η ανάλυση επέστρεψε μη έγκυρα δεδομένα.", 502, origin);
  } catch {
    return error("Η ανάλυση δεν ολοκληρώθηκε. Δοκιμάστε ξανά.", 502, origin);
  }
}

async function runChat(request: Request, env: Env, origin: string | null): Promise<Response> {
  const requestBody = await readJson(request);
  if (!isChatRequest(requestBody)) return error("Το αίτημα συνομιλίας δεν είναι έγκυρο.", 400, origin);
  const context = requestBody.conversationHistory.at(-1)?.context;
  if (!context) return json({ answer: "Δεν υπάρχουν αρκετά στοιχεία για αξιόπιστη απάντηση." }, 200, origin);
  const prompt = `Answer in Greek, briefly, using only this product context: ${JSON.stringify(context)}. Do not give medical advice or make claims beyond context. If context is insufficient, say exactly: Δεν υπάρχουν αρκετά στοιχεία για αξιόπιστη απάντηση.`;
  try {
    const output = await env.AI.run(textModel, { prompt: `${prompt}\nQuestion: ${requestBody.question}` });
    const answer = isRecord(output) && typeof output.response === "string" ? output.response.trim() : "Δεν υπάρχουν αρκετά στοιχεία για αξιόπιστη απάντηση.";
    return json({ answer }, 200, origin);
  } catch {
    return error("Η υπηρεσία ερωτήσεων δεν είναι διαθέσιμη.", 502, origin);
  }
}