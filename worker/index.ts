import {
  parseOcrModelOutput,
  validateOcrRequest,
  type OcrResponse,
} from "./ocr";
import {
  parseAnalysis,
  type WorkerAnalysisResult,
} from "./analysis";
import { isAllowedOrigin } from "./cors";
import {
  scoreInterpretation,
  type WorkerScore,
} from "./scoring";
import {
  identifyPrompt,
  parseProductIdentity,
  type ProductIdentity,
} from "./identify";

const visionModel =
  "@cf/moondream/moondream3.1-9B-A2B";

const textModel =
  "@cf/meta/llama-4-scout-17b-16e-instruct";

const ocrPrompt = [
  "Read literal visible text on the product label.",
  "",
  "Rules:",
  "- Prioritize headings: Συστατικά, Ingredients, INGREDIENTS, INCI.",
  "- Read nutrition separately when visible.",
  "- Never label nutrition fields as ingredients.",
  "- Never invent missing words, ingredients, vitamins or quantities.",
  "- Never complete partially visible text.",
  "- Use [unreadable] when text is unclear.",
  "- Do not describe packaging.",
  "- Do not provide analysis.",
  "- Do not provide medical advice.",
  "- Do not provide safety conclusions.",
  "- Do not calculate a score.",
  "- Return ONLY a valid JSON object. Do not add any text before or after the JSON.",
  "- Do not use Markdown code fences.",
  '- If the label is completely unreadable, return EXACTLY this JSON: {"labelType": "unknown", "ingredients": [], "nutritionText": "", "unreadableSegments": ["UNREADABLE_INGREDIENTS_LABEL"]}',
  "",
  "Required JSON structure:",
  "{",
  '  "labelType": "ingredients",',
  '  "ingredients": ["item1", "item2"],',
  '  "nutritionText": "raw nutrition text here if any",',
  '  "unreadableSegments": []',
  "}",
  "",
  "The labelType value must be exactly one of: ingredients, nutrition, mixed, unknown.",
  "Never repeat the same ingredient more than once.",
  "Include at most 40 ingredients.",
  "Stop immediately after closing the JSON object.",
].join("\n");

type JsonBody =
  | OcrResponse
  | WorkerAnalysisResult
  | (WorkerAnalysisResult & { score: WorkerScore })
  | {
      status: "ok";
      service: "greenlens-ocr";
    }
  | {
      answer: string;
    }
  | ProductIdentity;

export default {
  async fetch(
    request: Request,
    env: Env,
  ): Promise<Response> {
    const origin = request.headers.get("Origin");
    const requestId = crypto.randomUUID();

    if (origin && !isAllowedOrigin(origin)) {
      return error(
        "Η προέλευση του αιτήματος δεν επιτρέπεται.",
        403,
        origin,
        requestId,
      );
    }

    if (request.method === "OPTIONS") {
      return handleOptions(origin);
    }

    const url = new URL(request.url);

    if (
      request.method === "GET" &&
      url.pathname === "/api/health"
    ) {
      return json(
        {
          status: "ok",
          service: "greenlens-ocr",
        },
        200,
        origin,
        requestId,
      );
    }

    if (
      request.method === "POST" &&
      url.pathname === "/api/product/identify"
    ) {
      return runIdentify(
        request,
        env,
        origin,
        requestId,
      );
    }

    if (
      request.method === "POST" &&
      url.pathname === "/api/analysis/run"
    ) {
      return runAnalysis(
        request,
        env,
        origin,
        requestId,
      );
    }

    if (
      request.method === "POST" &&
      isChatPath(url.pathname)
    ) {
      return runChat(request, origin, requestId);
    }

    if (
      request.method !== "POST" ||
      url.pathname !== "/api/ocr/extract"
    ) {
      return error(
        "Η διαδρομή δεν βρέθηκε.",
        404,
        origin,
        requestId,
      );
    }

    return runOcr(request, env, origin, requestId);
  },
} satisfies ExportedHandler<Env>;

function isChatPath(pathname: string): boolean {
  const segments = pathname.split("/");

  return (
    segments.length === 5 &&
    segments[0] === "" &&
    segments[1] === "api" &&
    segments[2] === "products" &&
    segments[3].length > 0 &&
    segments[4] === "chat"
  );
}

async function runOcr(
  request: Request,
  env: Env,
  origin: string | null,
  requestId: string,
): Promise<Response> {
  const contentType =
    request.headers.get("content-type") ?? "";

  if (
    !contentType.includes("multipart/form-data")
  ) {
    return error(
      "Απαιτείται multipart/form-data.",
      400,
      origin,
      requestId,
    );
  }

  let formData: FormData;

  try {
    formData = await request.formData();
  } catch {
    return error(
      "Το multipart payload δεν είναι έγκυρο.",
      400,
      origin,
      requestId,
    );
  }

  const imageValue = formData.get("image");

  const image =
    imageValue instanceof File
      ? imageValue
      : null;

  const barcode = readTextField(
    formData,
    "barcode",
  );

  const productId = readTextField(
    formData,
    "productId",
  );

  const validationError = validateOcrRequest(
    image,
    barcode,
    productId,
  );

  if (validationError) {
    return error(
      validationError,
      400,
      origin,
      requestId,
    );
  }

  if (!image) {
    return error(
      "Λείπει η εικόνα της ετικέτας.",
      400,
      origin,
      requestId,
    );
  }

  try {
    const imageDataUri =
      await fileToDataUri(image);

    const startedAt = Date.now();

    const modelOutput = await env.AI.run(
      visionModel,
      {
        task: "query",
        image: imageDataUri,
        question: ocrPrompt,
        reasoning: false,
        temperature: 0,
        max_tokens: 1024,
        stream: false,
      },
    );

    const rawModelText =
      extractModelText(modelOutput);

    if (
      rawModelText &&
      hasRepetitionLoop(rawModelText)
    ) {
      console.log("ocr_repetition_loop", {
        requestId,
        durationMs: Date.now() - startedAt,
        rawLength: rawModelText.length,
      });

      return error(
        "Η ανάγνωση της ετικέτας απέτυχε. Φωτογραφίστε ξανά πιο κοντά και με σταθερό χέρι.",
        422,
        origin,
        requestId,
      );
    }

    const result =
      parseOcrModelOutput(modelOutput);

    console.log("ocr_model_completed", {
      requestId,
      endpoint: "/api/ocr/extract",
      model: visionModel,
      durationMs: Date.now() - startedAt,
      outputType: typeof modelOutput,
      outputKeys:
        typeof modelOutput === "object" &&
        modelOutput !== null
          ? Object.keys(modelOutput)
          : [],
      parsedLabelType: result?.labelType ?? null,
      parsedTextLength:
        result?.rawText?.length ?? 0,
      status: "success",
    });

    if (isUnreadableModelOutput(modelOutput)) {
      return error(
        "Δεν εντοπίστηκε καθαρή λίστα συστατικών. Φωτογραφίστε κοντά και κάθετα μόνο την περιοχή που γράφει «Συστατικά», «Ingredients» ή «INCI».",
        422,
        origin,
        requestId,
      );
    }

    if (!result) {
      return error(
        "Η ανάγνωση της ετικέτας δεν επέστρεψε έγκυρα δεδομένα.",
        502,
        origin,
        requestId,
      );
    }

    if (result.labelType === "nutrition") {
      return error(
        "Εντοπίστηκε διατροφικός πίνακας, όχι λίστα συστατικών. Φωτογραφίστε και τη λίστα συστατικών.",
        422,
        origin,
        requestId,
      );
    }

    if (isNutritionTable(result.rawText)) {
      return error(
        "Φωτογραφήσατε τον διατροφικό πίνακα. Η λίστα συστατικών βρίσκεται συνήθως δίπλα ή κάτω από αυτόν, μετά τη λέξη «Συστατικά».",
        422,
        origin,
        requestId,
      );
    }

    if (
      isHeadingOnlyText(result.rawText) ||
      !looksLikeIngredientList(result.rawText)
    ) {
      return error(
        "Δεν εντοπίστηκε λίστα συστατικών. Φωτογραφίστε την περιοχή κάτω από τη λέξη «Συστατικά» ή «Ingredients».",
        422,
        origin,
        requestId,
      );
    }

    if (
      looksLikeSyntheticNutritionText(
        result.rawText,
      )
    ) {
      return error(
        "Η ανάγνωση δεν ήταν αρκετά αξιόπιστη. Φωτογραφίστε ξανά τη λίστα συστατικών με καλύτερο φωτισμό.",
        422,
        origin,
        requestId,
      );
    }

    return json(result, 200, origin, requestId);
  } catch (caughtError) {
    console.error("ocr_extract_failed", {
      requestId,
      name:
        caughtError instanceof Error
          ? caughtError.name
          : "unknown",
      message:
        caughtError instanceof Error
          ? caughtError.message
          : String(caughtError).slice(0, 300),
    });

    return error(
      "Δεν ήταν δυνατή η ανάγνωση της ετικέτας.",
      502,
      origin,
      requestId,
    );
  }
}

function handleOptions(
  origin: string | null,
): Response {
  if (!origin || !isAllowedOrigin(origin)) {
    return new Response(null, {
      status: 403,
      headers: {
        Vary: "Origin",
      },
    });
  }

  return new Response(null, {
    status: 204,
    headers: corsHeaders(origin),
  });
}

function readTextField(
  formData: FormData,
  name: string,
): string | null {
  const value = formData.get(name);

  return typeof value === "string"
    ? value
    : null;
}

function json(
  body: JsonBody,
  status: number,
  origin: string | null,
  requestId?: string,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type":
        "application/json; charset=utf-8",
      ...corsHeaders(origin),
      ...(requestId
        ? { "x-request-id": requestId }
        : {}),
    },
  });
}

function error(
  message: string,
  status: number,
  origin: string | null,
  requestId?: string,
): Response {
  return new Response(
    JSON.stringify({
      error: message,
    }),
    {
      status,
      headers: {
        "content-type":
          "application/json; charset=utf-8",
        ...corsHeaders(origin),
        ...(requestId
          ? { "x-request-id": requestId }
          : {}),
      },
    },
  );
}

function corsHeaders(
  origin: string | null,
): Record<string, string> {
  const headers: Record<string, string> = {
    Vary: "Origin",
  };

  if (origin && isAllowedOrigin(origin)) {
    headers["Access-Control-Allow-Origin"] =
      origin;
    headers["Access-Control-Allow-Methods"] =
      "GET, POST, OPTIONS";
    headers["Access-Control-Allow-Headers"] =
      "Content-Type";
  }

  return headers;
}

async function readJson(
  request: Request,
): Promise<unknown> {
  try {
    return (await request.json()) as unknown;
  } catch {
    return null;
  }
}

function isAnalysisRequest(
  value: unknown,
): value is {
  productId: string;
  barcode: string;
  productType:
    | "food"
    | "cosmetic"
    | "unknown";
  confirmedIngredientText: string;
  normalizedIngredients: unknown[];
  ocrConfidence: number;
} {
  return (
    isRecord(value) &&
    isText(value.productId) &&
    isText(value.barcode) &&
    (value.productType === "food" ||
      value.productType === "cosmetic" ||
      value.productType === "unknown") &&
    typeof value.confirmedIngredientText ===
      "string" &&
    value.confirmedIngredientText.length <=
      12_000 &&
    Array.isArray(value.normalizedIngredients) &&
    value.normalizedIngredients.length <= 200 &&
    typeof value.ocrConfidence === "number" &&
    value.ocrConfidence >= 0 &&
    value.ocrConfidence <= 1
  );
}

function isChatRequest(
  value: unknown,
): value is {
  question: string;
  conversationHistory: Array<{
    context?: unknown;
  }>;
} {
  return (
    isRecord(value) &&
    isText(value.question) &&
    value.question.length <= 2_000 &&
    Array.isArray(value.conversationHistory) &&
    value.conversationHistory.length <= 20
  );
}

function insufficientAnalysis(): WorkerAnalysisResult {
  return {
    productType: "unknown",
    summary:
      "Δεν υπάρχουν αρκετά στοιχεία για αξιόπιστη ανάλυση.",
    positives: [],
    attentionItems: [],
    potentialAllergens: [],
    ingredientFindings: [],
    insufficientDataReasons: [
      "Λείπει επιβεβαιωμένη και επαρκής λίστα συστατικών.",
    ],
    confidence: 0,
  };
}

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === "object" && value !== null
  );
}

function isText(
  value: unknown,
): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0
  );
}

async function runAnalysis(
  request: Request,
  env: Env,
  origin: string | null,
  requestId: string,
): Promise<Response> {
  const requestBody = await readJson(request);

  if (!isAnalysisRequest(requestBody)) {
    return error(
      "Το αίτημα ανάλυσης δεν είναι έγκυρο.",
      400,
      origin,
      requestId,
    );
  }

  const confirmedText =
    requestBody.confirmedIngredientText.trim();

  if (
    !confirmedText ||
    requestBody.normalizedIngredients.length === 0
  ) {
    return json(
      insufficientAnalysis(),
      200,
      origin,
      requestId,
    );
  }

  if (
    looksLikeJsonWrapper(confirmedText) ||
    looksLikeMojibake(confirmedText) ||
    looksLikeSyntheticNutritionText(
      confirmedText,
    ) ||
    isHeadingOnlyText(confirmedText) ||
    !looksLikeIngredientList(confirmedText)
  ) {
    return json(
      insufficientAnalysis(),
      200,
      origin,
      requestId,
    );
  }

  const prompt = [
    "Analyze the confirmed ingredient list below.",
    "",
    "Return ONLY this exact JSON structure:",
    "{",
    '  "productType": "food",',
    '  "summary": "short neutral summary in Greek",',
    '  "positives": ["short Greek phrase"],',
    '  "attentionItems": ["short Greek phrase"],',
    '  "potentialAllergens": ["ingredient name"],',
    '  "ingredientFindings": [',
    "    {",
    '      "ingredientName": "AQUA",',
    '      "normalizedName": "aqua",',
    '      "severity": "info",',
    '      "title": "short Greek title",',
    '      "explanation": "short Greek explanation",',
    '      "evidenceType": "none",',
    '      "sourceName": null,',
    '      "sourceUrl": null,',
    '      "confidence": 0.5',
    "    }",
    "  ],",
    '  "insufficientDataReasons": [],',
    '  "confidence": 0.6',
    "}",
    "",
    "Field rules:",
    "- productType must be exactly one of: food, cosmetic, unknown.",
    "- Use food for anything edible or drinkable, including vinegar, oil, sauces, drinks and snacks.",
    "- Use cosmetic for creams, lotions, shampoos, soaps and skincare.",
    "- Use unknown only when the category is genuinely unclear.",
    "- Determine productType from the actual ingredients, not from the example above.",
    "- severity must be exactly one of: positive, info, attention, high_attention, unknown.",
    "- evidenceType must be exactly one of: regulatory, scientific, label, none.",
    "- confidence must be a number between 0 and 1.",
    "- sourceName and sourceUrl must be null unless you have verified evidence.",
    "",
    "Content rules:",
    "- Only analyze ingredients that appear in the provided text.",
    "- Never add ingredients that are not in the provided list.",
    "- If the provided text contains no actual ingredient names, return empty arrays and explain in insufficientDataReasons.",
    "- Do not calculate a score.",
    "- Do not claim unconditional product safety.",
    "- Do not provide medical advice.",
    "- Do not make pregnancy or child-safety conclusions.",
    "- Do not claim toxicity or carcinogenicity without verified evidence.",
    "- Do not invent regulatory status.",
    "- Do not invent source names or URLs.",
    '- Use severity "unknown" and evidenceType "none" when evidence is unavailable.',
    "- Write summary, title and explanation in Greek.",
    "- Include between 8 and 12 entries in ingredientFindings.",
    "- Always include every ingredient listed in potentialAllergens.",
    "- Also include preservatives, fragrances, additives and notable active ingredients.",
    "- Keep title under 40 characters.",
    "- Keep explanation under 120 characters.",
    "- Return ONLY the JSON object. No commentary. No Markdown. No code fences.",
    "",
    "Confirmed ingredients:",
    confirmedText,
  ].join("\n");

  try {
    const startedAt = Date.now();

    const modelOutput = await env.AI.run(
      textModel,
      {
        messages: [
          {
            role: "system",
            content:
              "You are an ingredient analysis assistant. You always return a single valid JSON object and nothing else.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        max_tokens: 2048,
        temperature: 0.2,
      },
    );

    const modelText =
      extractModelText(modelOutput);

    const cleanedText = modelText
      ? stripCodeFences(modelText)
      : null;

    const result =
      parseAnalysis(modelOutput) ??
      (cleanedText
        ? parseAnalysis(cleanedText)
        : null);

    console.log("analysis_model_completed", {
      requestId,
      endpoint: "/api/analysis/run",
      model: textModel,
      durationMs: Date.now() - startedAt,
      outputType: typeof modelOutput,
      outputKeys:
        typeof modelOutput === "object" &&
        modelOutput !== null
          ? Object.keys(modelOutput)
          : [],
      parsed: result !== null,
      findings:
        result?.ingredientFindings?.length ?? 0,
      extractedLength: modelText?.length ?? 0,
      sample: modelText?.slice(0, 400) ?? null,
      status: "success",
    });

    if (!result) {
      return error(
        "Η ανάλυση δεν ολοκληρώθηκε αξιόπιστα. Δοκιμάστε ξανά.",
        502,
        origin,
        requestId,
      );
    }

    const detectedType =
      detectProductType(confirmedText);

    if (detectedType !== "unknown") {
      result.productType = detectedType;
    }

    const score = scoreInterpretation(
      confirmedText,
      requestBody.ocrConfidence,
      result,
    );

    return json(
      {
        ...result,
        score,
      },
      200,
      origin,
      requestId,
    );
  } catch (caughtError) {
    console.error("analysis_run_failed", {
      requestId,
      name:
        caughtError instanceof Error
          ? caughtError.name
          : "unknown",
      message:
        caughtError instanceof Error
          ? caughtError.message
          : String(caughtError).slice(0, 300),
    });

    return error(
      "Η ανάλυση δεν ολοκληρώθηκε. Δοκιμάστε ξανά.",
      502,
      origin,
      requestId,
    );
  }
}

async function runChat(
  request: Request,
  origin: string | null,
  requestId: string,
): Promise<Response> {
  const requestBody = await readJson(request);

  if (!isChatRequest(requestBody)) {
    return error(
      "Το αίτημα συνομιλίας δεν είναι έγκυρο.",
      400,
      origin,
      requestId,
    );
  }

  return json(
    {
      answer:
        "Η συνομιλία θα είναι διαθέσιμη όταν αποθηκευτεί με ασφάλεια η ανάλυση του προϊόντος.",
    },
    200,
    origin,
    requestId,
  );
}

async function runIdentify(
  request: Request,
  env: Env,
  origin: string | null,
  requestId: string,
): Promise<Response> {
  const contentType =
    request.headers.get("content-type") ?? "";

  if (
    !contentType.includes("multipart/form-data")
  ) {
    return error(
      "Απαιτείται multipart/form-data.",
      400,
      origin,
      requestId,
    );
  }

  let formData: FormData;

  try {
    formData = await request.formData();
  } catch {
    return error(
      "Το multipart payload δεν είναι έγκυρο.",
      400,
      origin,
      requestId,
    );
  }

  const imageValue = formData.get("image");

  const image =
    imageValue instanceof File
      ? imageValue
      : null;

  if (!image) {
    return error(
      "Λείπει η εικόνα του προϊόντος.",
      400,
      origin,
      requestId,
    );
  }

  if (
    image.size === 0 ||
    image.size > 5 * 1024 * 1024
  ) {
    return error(
      "Το μέγεθος της εικόνας δεν επιτρέπεται.",
      400,
      origin,
      requestId,
    );
  }

  try {
    const imageDataUri =
      await fileToDataUri(image);

    const startedAt = Date.now();

    const modelOutput = await env.AI.run(
      visionModel,
      {
        task: "query",
        image: imageDataUri,
        question: identifyPrompt,
        reasoning: false,
        temperature: 0,
        max_tokens: 512,
        stream: false,
      },
    );

    const identity =
      parseProductIdentity(modelOutput);

    console.log("identify_completed", {
      requestId,
      endpoint: "/api/product/identify",
      model: visionModel,
      durationMs: Date.now() - startedAt,
      found: identity !== null,
      hasName: Boolean(identity?.productName),
      hasBrand: Boolean(identity?.brand),
      status: "success",
    });

    if (!identity) {
      return error(
        "Δεν αναγνωρίστηκε το όνομα του προϊόντος.",
        422,
        origin,
        requestId,
      );
    }

    return json(
      identity,
      200,
      origin,
      requestId,
    );
  } catch (caughtError) {
    console.error("identify_failed", {
      requestId,
      name:
        caughtError instanceof Error
          ? caughtError.name
          : "unknown",
      message:
        caughtError instanceof Error
          ? caughtError.message
          : String(caughtError).slice(0, 300),
    });

    return error(
      "Δεν ήταν δυνατή η αναγνώριση του προϊόντος.",
      502,
      origin,
      requestId,
    );
  }
}

async function fileToDataUri(
  file: File,
): Promise<string> {
  const mimeType = file.type || "image/jpeg";
  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);

  let binary = "";
  const chunkSize = 8192;

  for (
    let offset = 0;
    offset < bytes.length;
    offset += chunkSize
  ) {
    const end = Math.min(
      offset + chunkSize,
      bytes.length,
    );

    const chunk = bytes.subarray(offset, end);

    binary += String.fromCharCode(
      ...Array.from(chunk),
    );
  }

  const base64 = btoa(binary);

  return "data:" + mimeType + ";base64," + base64;
}

function extractModelText(
  value: unknown,
  depth: number = 0,
): string | null {
  if (depth > 4) {
    return null;
  }

  if (typeof value === "string") {
    return value.trim() || null;
  }

  if (!isRecord(value)) {
    return null;
  }

  if (Array.isArray(value.choices)) {
    for (const choice of value.choices) {
      if (!isRecord(choice)) {
        continue;
      }

      if (isRecord(choice.message)) {
        const message = choice.message;

        if (
          typeof message.content === "string" &&
          message.content.trim()
        ) {
          return message.content.trim();
        }

        if (Array.isArray(message.content)) {
          for (const part of message.content) {
            if (
              isRecord(part) &&
              typeof part.text === "string" &&
              part.text.trim()
            ) {
              return part.text.trim();
            }
          }
        }

        if (
          typeof message.reasoning_content ===
            "string" &&
          message.reasoning_content.trim()
        ) {
          return message.reasoning_content.trim();
        }

        if (
          typeof message.reasoning === "string" &&
          message.reasoning.trim()
        ) {
          return message.reasoning.trim();
        }
      }

      if (
        typeof choice.text === "string" &&
        choice.text.trim()
      ) {
        return choice.text.trim();
      }

      if (
        isRecord(choice.delta) &&
        typeof choice.delta.content ===
          "string" &&
        choice.delta.content.trim()
      ) {
        return choice.delta.content.trim();
      }
    }
  }

  const candidates = [
    value.answer,
    value.response,
    value.description,
    value.text,
    value.output,
    value.content,
  ];

  for (const candidate of candidates) {
    if (
      typeof candidate === "string" &&
      candidate.trim()
    ) {
      return candidate.trim();
    }
  }

  if ("result" in value) {
    const nested = extractModelText(
      value.result,
      depth + 1,
    );

    if (nested) {
      return nested;
    }
  }

  return null;
}

function isUnreadableModelOutput(
  value: unknown,
): boolean {
  const text = extractModelText(value);

  if (!text) {
    return true;
  }

  const upper = text.toUpperCase();

  return (
    upper.includes(
      "UNREADABLE_INGREDIENTS_LABEL",
    ) ||
    upper.split("CARBOHYDRATE").length > 10 ||
    upper.split("ENERGY").length > 10
  );
}

function looksLikeJsonWrapper(
  value: string,
): boolean {
  const trimmedValue = value.trim();

  return (
    trimmedValue.startsWith('{"rawText"') ||
    trimmedValue.startsWith("{'rawText'") ||
    trimmedValue.includes('"labelType"') ||
    trimmedValue.includes('"unreadableSegments"')
  );
}

function looksLikeMojibake(
  value: string,
): boolean {
  const mojibakeRegex =
    /\u00CE[\u0080-\u00BF]|\u00CF[\u0080-\u00BF]|\u00C2[\u0080-\u00BF]|\u00C3[\u0080-\u00BF]|\uFFFD|\u00E2\u20AC/;

  return mojibakeRegex.test(value);
}

function looksLikeSyntheticNutritionText(
  value: string,
): boolean {
  const normalizedValue =
    value.toLocaleLowerCase("el-GR");

  const suspiciousTerms = [
    "niacin",
    "νιασίνη",
    "νιασινη",
    "vitamin a",
    "βιταμίνη α",
    "βιταμινη α",
    "thiamine",
    "θειαμίνη",
    "θειαμινη",
    "riboflavin",
    "ριβοφλαβίνη",
    "ριβοφλαβινη",
    "pantothenic acid",
    "παντοθενικό οξύ",
    "παντοθενικο οξυ",
    "biotin",
    "βιοτίνη",
    "βιοτινη",
    "vitamin k",
    "βιταμίνη κ",
    "βιταμινη κ",
    "vitamin d",
    "βιταμίνη d",
    "βιταμινη d",
  ];

  const matchedTerms = suspiciousTerms.filter(
    (term) => normalizedValue.includes(term),
  ).length;

  const numbers =
    normalizedValue.match(
      /\b\d+(?:[.,]\d+)?\b/g,
    ) ?? [];

  const repeatedNumberCounts = new Map<
    string,
    number
  >();

  for (const number of numbers) {
    const normalizedNumber = number.replace(
      ",",
      ".",
    );

    repeatedNumberCounts.set(
      normalizedNumber,
      (repeatedNumberCounts.get(
        normalizedNumber,
      ) ?? 0) + 1,
    );
  }

  const hasHighlyRepeatedNumber = Array.from(
    repeatedNumberCounts.values(),
  ).some((count) => count >= 5);

  return (
    matchedTerms >= 5 && hasHighlyRepeatedNumber
  );
}

function stripCodeFences(value: string): string {
  let text = value.trim();

  if (text.startsWith("```")) {
    const firstNewline = text.indexOf("\n");

    if (firstNewline >= 0) {
      text = text.slice(firstNewline + 1);
    } else {
      text = text.slice(3);
    }
  }

  if (text.endsWith("```")) {
    text = text.slice(0, -3);
  }

  text = text.trim();

  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");

  if (
    firstBrace >= 0 &&
    lastBrace > firstBrace
  ) {
    return text.slice(
      firstBrace,
      lastBrace + 1,
    );
  }

  return text;
}

function isHeadingOnlyText(
  value: string,
): boolean {
  const normalized = value
    .toLowerCase()
    .replace(/[^\p{L}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

  const headingTerms = [
    "συστατικα",
    "συστατικά",
    "ingredients",
    "inci",
    "ingredient list",
  ];

  const words = normalized
    .split(" ")
    .filter(Boolean);

  if (words.length === 0) {
    return true;
  }

  const nonHeadingWords = words.filter(
    (word) =>
      !headingTerms.some((term) =>
        term.includes(word),
      ),
  );

  return nonHeadingWords.length < 3;
}

function looksLikeIngredientList(
  value: string,
): boolean {
  const normalized = value
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

  if (normalized.length < 15) {
    return false;
  }

  const noiseTerms = [
    "www.",
    "http",
    "cleanright",
    "tel:",
    "s.a.",
    "a.b.e.e",
    "ltd",
    "gmbh",
    "made in",
    "distributed by",
    "imported by",
  ];

  const noiseMatches = noiseTerms.filter(
    (term) => normalized.includes(term),
  ).length;

  const letters =
    normalized.match(/[\p{L}]/gu)?.length ?? 0;

  if (noiseMatches >= 2 && letters < 60) {
    return false;
  }

  const nutritionMarkers = [
    "ενέργεια",
    "energy",
    "kcal",
    "kj",
    "λιπαρά",
    "λιπαρα",
    "υδατάνθρακες",
    "υδατανθρακες",
    "πρωτεΐνες",
    "πρωτεινες",
    "ανά 100",
    "per 100",
    "βιταμίνη",
    "βιταμινη",
    "vitamin",
    "%rda",
    "θιαμίνη",
    "ριβοφλαβίνη",
  ];

  const nutritionMatches =
    nutritionMarkers.filter((marker) =>
      normalized.includes(marker),
    ).length;

  if (nutritionMatches >= 3) {
    return false;
  }

  const parts = normalized
    .split(/[,;:]/)
    .map((part) => part.trim())
    .filter((part) => part.length >= 3);

  if (parts.length >= 3) {
    return true;
  }

  const ingredientMarkers = [
    "aqua",
    "water",
    "glycerin",
    "alcohol",
    "acid",
    "sodium",
    "potassium",
    "calcium",
    "oil",
    "extract",
    "parfum",
    "fragrance",
    "oxide",
    "sulfate",
    "sulphite",
    "chloride",
    "citrate",
    "butter",
    "cetearyl",
    "phenoxyethanol",
    "preservative",
    "vinegar",
    "νερό",
    "νερο",
    "έλαιο",
    "ελαιο",
    "οξύ",
    "οξυ",
    "άρωμα",
    "αρωμα",
    "ζάχαρη",
    "ζαχαρη",
    "αλάτι",
    "αλατι",
    "ξύδι",
    "ξυδι",
    "συντηρητικό",
    "συντηρητικο",
    "νάτριο",
    "νατριο",
    "οίνο",
    "οινο",
    "αλεύρι",
    "αλευρι",
    "γάλα",
    "γαλα",
  ];

  return ingredientMarkers.some((marker) =>
    normalized.includes(marker),
  );
}

function isNutritionTable(
  value: string,
): boolean {
  const normalized = value.toLowerCase();

  const nutritionMarkers = [
    "ενέργεια",
    "ενεργεια",
    "energy",
    "kcal",
    "kj",
    "λιπαρά",
    "λιπαρα",
    "υδατάνθρακες",
    "υδατανθρακες",
    "carbohydrate",
    "σάκχαρα",
    "σακχαρα",
    "sugars",
    "πρωτεΐνες",
    "πρωτεινες",
    "protein",
    "εδώδιμες ίνες",
    "fibre",
    "ανά 100",
    "per 100",
    "διατροφική δήλωση",
    "nutrition declaration",
    "βιταμίνη",
    "βιταμινη",
    "vitamin",
    "θειαμίνη",
    "ριβοφλαβίνη",
    "νιασίνη",
  ];

  const matches = nutritionMarkers.filter(
    (marker) => normalized.includes(marker),
  ).length;

  return matches >= 2;
}

function detectProductType(
  text: string,
): "food" | "cosmetic" | "unknown" {
  const normalized = text.toLowerCase();

  const foodMarkers = [
    "ξύδι",
    "ξυδι",
    "vinegar",
    "οίνο",
    "οινο",
    "wine",
    "αλεύρι",
    "αλευρι",
    "flour",
    "ζάχαρη",
    "ζαχαρη",
    "sugar",
    "γάλα",
    "γαλα",
    "milk",
    "τυρί",
    "τυρι",
    "cheese",
    "ελαιόλαδο",
    "ελαιολαδο",
    "olive oil",
    "ντομάτα",
    "ντοματα",
    "tomato",
    "κρεμμύδι",
    "κρεμμυδι",
    "onion",
    "σκόρδο",
    "σκορδο",
    "garlic",
    "αλάτι",
    "αλατι",
    "salt",
    "πιπέρι",
    "πιπερι",
    "pepper",
    "κακάο",
    "κακαο",
    "cocoa",
    "σιτάρι",
    "σιταρι",
    "wheat",
    "βούτυρο",
    "βουτυρο",
    "yeast",
    "μαγιά",
    "μαγια",
    "starch",
    "άμυλο",
    "αμυλο",
  ];

  const cosmeticMarkers = [
    "aqua",
    "cetearyl",
    "phenoxyethanol",
    "dimethicone",
    "parfum",
    "sodium laureth",
    "sodium lauryl",
    "panthenol",
    "tocopheryl",
    "butyrospermum",
    "hyaluronic",
    "niacinamide",
    "isohexadecane",
    "cocamidopropyl",
    "benzyl alcohol",
    "linalool",
    "limonene",
    "citronellol",
  ];

  const foodScore = foodMarkers.filter(
    (marker) => normalized.includes(marker),
  ).length;

  const cosmeticScore = cosmeticMarkers.filter(
    (marker) => normalized.includes(marker),
  ).length;

  if (foodScore === 0 && cosmeticScore === 0) {
    return "unknown";
  }

  if (foodScore > cosmeticScore) {
    return "food";
  }

  if (cosmeticScore > foodScore) {
    return "cosmetic";
  }

  return "unknown";
}

function hasRepetitionLoop(
  value: string,
): boolean {
  const items = value
    .split(/[",\n]/)
    .map((item) => item.trim().toLowerCase())
    .filter((item) => item.length >= 3);

  if (items.length < 10) {
    return false;
  }

  const counts = new Map<string, number>();

  for (const item of items) {
    counts.set(
      item,
      (counts.get(item) ?? 0) + 1,
    );
  }

  const maxCount = Math.max(
    ...Array.from(counts.values()),
  );

  return maxCount >= 8;
}