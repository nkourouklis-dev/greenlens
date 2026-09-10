import {
  validateOcrRequest,
  type OcrResponse,
} from "./ocr";
import {
  extractWithAzureOcr,
} from "./azureOcr";
import {
  parseAnalysis,
  type WorkerAnalysisResult,
} from "./analysis";
import { isAllowedOrigin } from "./cors";
import {
  classifyAllergenFindings,
  withoutAllergenOnlyItems,
  type AllergenNotice,
} from "./allergens";
import {
  scoreInterpretation,
  scoringVersion,
  type WorkerScore,
} from "./scoring";
import {
  buildExecutiveSummary,
  buildIngredientInsights,
  type ExecutiveSummary,
  type IngredientInsight,
} from "./ingredientInsights";
import { type D1Like } from "./ingredientKnowledge";
import {
  loadScoringRules,
  matchScoringRules,
} from "./ingredientRules";
import {
  lookupCachedProduct,
  incrementProductScanCount,
  saveProductResult,
} from "./productCache";
import {
  ensureDraftProduct,
  hasProductPhoto,
  insertProductPhoto,
  listProductPhotos,
  pruneUserPhotos,
  isPhotoType,
  type PhotoType,
  type ProductPhotoRow,
} from "./productPhotos";
import {
  listAdminProducts,
  getAdminProduct,
  saveVerifiedProduct,
  deleteAdminProduct,
  validateVerifiedAnalysisResult,
  type AdminProductListItem,
  type AdminProductDetail,
} from "./adminProducts";
import {
  rescoreIngredientsResult,
  syncEnvelopeScoreMentions,
} from "./rescore";
import {
  buildDraftPrompt,
  buildReportPrompt,
  collectCatalogueFacts,
  parseAssistantDraft,
  type AssistantReply,
} from "./adminAssistant";
import {
  getProductVersion,
  listProductVersions,
  recordProductVersion,
  type ProductVersion,
  type ProductVersionSource,
  type ProductVersionSummary,
} from "./productVersions";
import {
  identifyPrompt,
  parseProductIdentity,
  type ProductIdentity,
} from "./identify";
import {
  lookupProductByBarcode,
} from "./productLookup";
import {
  extractIngredientText,
} from "./ingredientText";
import {
  evaluateContentGate,
} from "./contentGate";
import {
  filterIrrelevantSegments,
} from "./contentFilter";
import {
  detectContentCategoryHeuristic,
  buildCategoryClassificationPrompt,
  parseCategoryClassification,
  type ContentCategory,
  type ContentCategoryResult,
} from "./contentCategory";
import {
  extractNutritionData,
} from "./nutritionExtraction";
import {
  parseNutritionAnalysis,
  type WorkerNutritionResult,
} from "./nutritionAnalysis";
import {
  scoreNutrition,
} from "./nutritionScoring";
import {
  buildNutritionInsights,
  buildNutritionExecutiveSummary,
  type NutritionInsight,
} from "./nutritionInsights";
import {
  extractChemicalComposition,
} from "./chemicalExtraction";
import {
  parseChemicalAnalysis,
  type WorkerChemicalResult,
} from "./chemicalAnalysis";
import {
  scoreChemicalComposition,
} from "./chemicalScoring";
import {
  buildChemicalInsights,
  buildChemicalExecutiveSummary,
  type ChemicalInsight,
} from "./chemicalInsights";

type AzureVisionEnvironment = Env & {
  AZURE_VISION_ENDPOINT: string;
  AZURE_VISION_KEY: string;
  /**
   * Optional single-language hint for Azure's Read OCR (e.g. "el", "en").
   * Left unset by default: Azure auto-detects language per line when no
   * hint is given, which is what GreenLens labels need since they mix
   * Greek copy with Latin/English INCI ingredient names in the same
   * photo — forcing one language would very likely make the *other*
   * script read worse, not better. Only set this if testing on real
   * labels shows auto-detect is actually the weaker option.
   */
  AZURE_VISION_LANGUAGE?: string;
};

// Shared-secret gate for every /api/admin/* route (the bulk in-store photo
// capture flow) — set via `wrangler secret put ADMIN_PASSWORD`, so it
// never appears in wrangler.jsonc. Optional in the type because a fresh
// deployment before the secret is configured must fail closed (deny
// everyone) rather than the cast silently producing `undefined ===
// undefined` and letting an unauthenticated request through.
type AdminEnvironment = Env & {
  ADMIN_PASSWORD?: string;
};

const visionModel =
  "@cf/moondream/moondream3.1-9B-A2B";

const textModel =
  "@cf/meta/llama-4-scout-17b-16e-instruct";

const trustedOcrConfidence = 0.9;

// A real nutrition table needs this many numeric values with a unit.
const nutritionNumericUnitThreshold = 3;

type LabelType =
  | "ingredients"
  | "nutrition"
  | "mixed"
  | "unknown";

type LabelEvaluation = {
  ingredientText: string;
  nutritionMarkerCount: number;
  numericUnitCount: number;
  hasIngredientHeading: boolean;
  looksLikeIngredients: boolean;
  isNutritionTable: boolean;
  sectionWasSliced: boolean;
};

type JsonBody =
  | OcrResponse
  | WorkerAnalysisResult
  | (WorkerAnalysisResult & {
      score: WorkerScore;
      ingredientInsights: IngredientInsight[];
      executiveSummary: ExecutiveSummary;
      allergenNotice: AllergenNotice | null;
      contentCategory: "ingredients";
    })
  | (WorkerNutritionResult & {
      score: WorkerScore;
      nutritionInsights: NutritionInsight[];
      executiveSummary: ExecutiveSummary;
      allergenNotice: AllergenNotice | null;
      contentCategory: "nutrition";
    })
  | (WorkerChemicalResult & {
      score: WorkerScore;
      chemicalInsights: ChemicalInsight[];
      executiveSummary: ExecutiveSummary;
      contentCategory: "chemical_composition";
    })
  | {
      contentCategory: "unknown";
      message: string;
      insufficientDataReasons: string[];
    }
  | {
      status: "ok";
      service: "greenlens-ocr";
    }
  | {
      answer: string;
    }
  | ProductIdentity
  | { found: false }
  | {
      found: true;
      result: JsonBody;
      productName: string | null;
      photoUrl: string | null;
    }
  | { r2Key: string }
  | { photos: ProductPhotoRow[] }
  | {
      items: AdminProductListItem[];
      page: number;
      pageSize: number;
      totalCount: number;
    }
  | { product: AdminProductDetail | null }
  | { versions: ProductVersionSummary[] }
  | { version: ProductVersion }
  | { assistant: AssistantReply }
  | { success: true };

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

    // Every /api/admin/* route (the bulk in-store photo capture flow) is
    // gated by the same shared-secret check, dispatched as one sub-router
    // so the auth check can never accidentally be skipped on a route added
    // here later.
    if (url.pathname.startsWith("/api/admin/")) {
      return runAdminRequest(
        request,
        url,
        env,
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

    // Barcode-only cache check, used before the user is asked to
    // photograph anything: lets the scan screen skip straight to a known
    // product's stored result instead of always sending them through
    // OCR/AI first (that only happened once /api/analysis/run itself ran,
    // which requires confirmed ingredient text the app doesn't have yet
    // at this point in the flow).
    const cacheBarcode = matchProductCachePath(url.pathname);

    if (
      request.method === "GET" &&
      cacheBarcode !== null
    ) {
      return runProductCacheLookup(
        cacheBarcode,
        url,
        env,
        origin,
        requestId,
      );
    }

    // Public, unauthenticated read of a product's photo. Deliberately
    // separate from /api/admin/photos/file: that one is keyed on an R2
    // object key and gated by the admin secret, while this one takes a
    // barcode and serves whatever shot the catalogue has for it, so a
    // plain <img src> in the app works with no header and no JS.
    const photoBarcode = matchProductPhotoPath(url.pathname);

    if (
      request.method === "GET" &&
      photoBarcode !== null
    ) {
      return runProductPhoto(
        photoBarcode,
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

// Returns the barcode segment of /api/product/cache/<barcode>, or null if
// the path doesn't match that shape. The barcode is a URL path segment, so
// it comes back percent-decoded like any other.
function matchProductCachePath(
  pathname: string,
): string | null {
  const segments = pathname.split("/");

  const matches =
    segments.length === 5 &&
    segments[0] === "" &&
    segments[1] === "api" &&
    segments[2] === "product" &&
    segments[3] === "cache" &&
    segments[4].length > 0;

  if (!matches) {
    return null;
  }

  try {
    return decodeURIComponent(segments[4]);
  } catch {
    return null;
  }
}

// Returns the barcode segment of /api/product/photo/<barcode>.
function matchProductPhotoPath(
  pathname: string,
): string | null {
  const segments = pathname.split("/");

  const matches =
    segments.length === 5 &&
    segments[0] === "" &&
    segments[1] === "api" &&
    segments[2] === "product" &&
    segments[3] === "photo" &&
    segments[4].length > 0;

  if (!matches) {
    return null;
  }

  try {
    return decodeURIComponent(segments[4]);
  } catch {
    return null;
  }
}

/**
 * Serves one photo for a barcode, preferring a front-of-pack shot and
 * falling back to the ingredient label — the packaging shot is what makes
 * a history row recognisable at a glance, and the label is better than a
 * blank square when that's all there is.
 *
 * Cached hard at the edge: a product photo for a barcode changes about as
 * often as the packaging does, and the app asks for it on every scan of a
 * known product.
 */
async function runProductPhoto(
  barcode: string,
  env: Env,
  origin: string | null,
  requestId: string,
): Promise<Response> {
  let photos: ProductPhotoRow[];

  try {
    photos = await listProductPhotos(env.DB, barcode);
  } catch (caughtError) {
    console.error("product_photo_lookup_failed", {
      requestId,
      barcode,
      message:
        caughtError instanceof Error
          ? caughtError.message
          : String(caughtError).slice(0, 300),
    });

    return error(
      "Η φωτογραφία δεν βρέθηκε.",
      404,
      origin,
      requestId,
    );
  }

  const chosen =
    photos.find((photo) => photo.photoType === "front") ??
    photos.find((photo) => photo.photoType === "ingredients") ??
    photos[0];

  if (!chosen) {
    return error(
      "Η φωτογραφία δεν βρέθηκε.",
      404,
      origin,
      requestId,
    );
  }

  const object = await env.PHOTOS.get(chosen.r2Key);

  if (!object) {
    return error(
      "Η φωτογραφία δεν βρέθηκε.",
      404,
      origin,
      requestId,
    );
  }

  const headers = new Headers({
    "content-type":
      object.httpMetadata?.contentType || "image/jpeg",
    "cache-control": "public, max-age=86400",
    "x-request-id": requestId,
  });

  if (origin) {
    headers.set("access-control-allow-origin", origin);
  }

  return new Response(object.body, { status: 200, headers });
}

async function runProductCacheLookup(
  barcode: string,
  url: URL,
  env: Env,
  origin: string | null,
  requestId: string,
): Promise<Response> {
  const cached = await lookupCachedProduct(
    env.DB,
    barcode,
  );

  if (!cached) {
    return json(
      { found: false },
      200,
      origin,
      requestId,
    );
  }

  await incrementProductScanCount(env.DB, barcode);

  console.log("product_cache_hit_via_lookup", {
    requestId,
    barcode,
    category: cached.category,
    scanCount: cached.scanCount + 1,
  });

  // productName and photoUrl travel next to the analysis, not inside it:
  // they live in their own columns/bucket, and without them a cache hit
  // gave the app a scored product with no name and no picture to show in
  // the scan history.
  const photoUrl = (await hasProductPhoto(env.DB, barcode))
    ? `${url.origin}/api/product/photo/${encodeURIComponent(barcode)}`
    : null;

  // Written by saveProductResult from a response this same endpoint
  // family already validated and returned once — safe to replay as-is.
  return json(
    {
      found: true,
      result: cached.analysisResult as JsonBody,
      productName: cached.productName,
      photoUrl,
    },
    200,
    origin,
    requestId,
  );
}

// Matches /api/admin/photos/<barcode> (both the POST upload and GET list
// routes share this path — method decides which). Deliberately excludes
// the literal segment "file", which is the separate serve-a-photo route
// (its key comes from a query param, not a path segment, since an R2 key
// contains internal slashes that would break simple segment matching).
function matchAdminPhotosPath(
  pathname: string,
): string | null {
  const segments = pathname.split("/");

  const matches =
    segments.length === 5 &&
    segments[0] === "" &&
    segments[1] === "api" &&
    segments[2] === "admin" &&
    segments[3] === "photos" &&
    segments[4].length > 0 &&
    segments[4] !== "file";

  if (!matches) {
    return null;
  }

  try {
    return decodeURIComponent(segments[4]);
  } catch {
    return null;
  }
}

// Matches /api/admin/products/<barcode> exactly — the PIM detail/edit/
// delete route (GET/PUT/DELETE; method decides which).
function matchAdminProductPath(
  pathname: string,
): string | null {
  const segments = pathname.split("/");

  const matches =
    segments.length === 5 &&
    segments[0] === "" &&
    segments[1] === "api" &&
    segments[2] === "admin" &&
    segments[3] === "products" &&
    segments[4].length > 0;

  if (!matches) {
    return null;
  }

  try {
    return decodeURIComponent(segments[4]);
  } catch {
    return null;
  }
}

// Matches /api/admin/products/<barcode>/analyze.
function matchAdminProductAnalyzePath(
  pathname: string,
): string | null {
  const segments = pathname.split("/");

  const matches =
    segments.length === 6 &&
    segments[0] === "" &&
    segments[1] === "api" &&
    segments[2] === "admin" &&
    segments[3] === "products" &&
    segments[4].length > 0 &&
    segments[5] === "analyze";

  if (!matches) {
    return null;
  }

  try {
    return decodeURIComponent(segments[4]);
  } catch {
    return null;
  }
}

// Matches /api/admin/products/<barcode>/versions — the version log for one
// product (GET), and the restore of one of its entries (POST with an id in
// the body).
function matchAdminProductVersionsPath(
  pathname: string,
): string | null {
  const segments = pathname.split("/");

  const matches =
    segments.length === 6 &&
    segments[0] === "" &&
    segments[1] === "api" &&
    segments[2] === "admin" &&
    segments[3] === "products" &&
    segments[4].length > 0 &&
    segments[5] === "versions";

  if (!matches) {
    return null;
  }

  try {
    return decodeURIComponent(segments[4]);
  } catch {
    return null;
  }
}

/**
 * The version log for one barcode. `?id=` returns that single version with
 * its full stored envelope; without it, the list of headers only (see
 * worker/productVersions.ts for why the payload is left out of the list).
 */
async function runAdminListVersions(
  barcode: string,
  url: URL,
  env: Env,
  origin: string | null,
  requestId: string,
): Promise<Response> {
  const requestedId = url.searchParams.get("id");

  try {
    if (requestedId !== null) {
      const parsedId = Number(requestedId);

      if (!Number.isInteger(parsedId)) {
        return error(
          "Μη έγκυρο id έκδοσης.",
          400,
          origin,
          requestId,
        );
      }

      const version = await getProductVersion(env.DB, parsedId);

      // Checked rather than trusted: the id comes from the query string, so
      // without this an admin URL for one barcode could read another's.
      if (!version || version.barcode !== barcode) {
        return error(
          "Η έκδοση δεν βρέθηκε.",
          404,
          origin,
          requestId,
        );
      }

      return json({ version }, 200, origin, requestId);
    }

    const versions = await listProductVersions(env.DB, barcode);

    return json({ versions }, 200, origin, requestId);
  } catch (caughtError) {
    console.error("admin_versions_list_failed", {
      requestId,
      barcode,
      message:
        caughtError instanceof Error
          ? caughtError.message
          : String(caughtError).slice(0, 300),
    });

    return error(
      "Το ιστορικό εκδόσεων δεν φορτώθηκε.",
      502,
      origin,
      requestId,
    );
  }
}

/**
 * Promotes a stored version back into the live row. The restore itself is
 * appended as a new version rather than rewinding the log: what the product
 * showed between then and now stays part of its history.
 *
 * The restored row is marked verified — a human deliberately chose it,
 * which is exactly what that status means, and it protects the choice from
 * being overwritten by the next routine scan.
 */
async function runAdminRestoreVersion(
  barcode: string,
  request: Request,
  env: Env,
  origin: string | null,
  requestId: string,
): Promise<Response> {
  const body = await readJson(request);

  const versionId =
    isRecord(body) && typeof body.versionId === "number"
      ? body.versionId
      : null;

  if (versionId === null || !Number.isInteger(versionId)) {
    return error(
      "Λείπει το id της έκδοσης.",
      400,
      origin,
      requestId,
    );
  }

  try {
    const version = await getProductVersion(env.DB, versionId);

    if (!version || version.barcode !== barcode) {
      return error(
        "Η έκδοση δεν βρέθηκε.",
        404,
        origin,
        requestId,
      );
    }

    if (
      typeof version.analysisResult !== "object" ||
      version.analysisResult === null
    ) {
      return error(
        "Η έκδοση δεν περιέχει έγκυρη ανάλυση.",
        422,
        origin,
        requestId,
      );
    }

    await saveVerifiedProduct(env.DB, {
      barcode,
      category: version.category ?? undefined,
      analysisResult: version.analysisResult as Record<string, unknown>,
    });

    await recordProductVersion(env.DB, {
      barcode,
      source: "restore",
      productName: version.productName,
      category: version.category,
      analysisResult: version.analysisResult,
      applied: true,
    });

    const product = await getAdminProduct(env.DB, barcode);

    if (!product) {
      return error(
        "Το προϊόν δεν βρέθηκε.",
        404,
        origin,
        requestId,
      );
    }

    console.log("admin_version_restored", {
      requestId,
      barcode,
      versionId,
    });

    return json({ product }, 200, origin, requestId);
  } catch (caughtError) {
    console.error("admin_version_restore_failed", {
      requestId,
      barcode,
      versionId,
      message:
        caughtError instanceof Error
          ? caughtError.message
          : String(caughtError).slice(0, 300),
    });

    return error(
      "Η επαναφορά απέτυχε.",
      502,
      origin,
      requestId,
    );
  }
}

/**
 * POST /api/admin/assist — the PIM assistant (see worker/adminAssistant.ts).
 *
 * `mode: "draft"` needs a barcode and writes editorial copy for it.
 * `mode: "report"` needs a question and answers it from SQL aggregates.
 * Runs on the same Workers AI text model as the analysis pipeline, so it
 * adds no new dependency or key.
 */
async function runAdminAssist(
  request: Request,
  env: Env,
  origin: string | null,
  requestId: string,
): Promise<Response> {
  const body = await readJson(request);

  if (!isRecord(body)) {
    return error(
      "Το αίτημα δεν είναι έγκυρο.",
      400,
      origin,
      requestId,
    );
  }

  const mode = body.mode === "draft" ? "draft" : "report";

  try {
    if (mode === "draft") {
      return await runAssistDraft(body, env, origin, requestId);
    }

    return await runAssistReport(body, env, origin, requestId);
  } catch (caughtError) {
    console.error("admin_assist_failed", {
      requestId,
      mode,
      message:
        caughtError instanceof Error
          ? caughtError.message
          : String(caughtError).slice(0, 300),
    });

    return error(
      "Ο βοηθός δεν απάντησε. Δοκιμάστε ξανά.",
      502,
      origin,
      requestId,
    );
  }
}

async function runAssistDraft(
  body: Record<string, unknown>,
  env: Env,
  origin: string | null,
  requestId: string,
): Promise<Response> {
  const barcode =
    typeof body.barcode === "string" ? body.barcode.trim() : "";

  if (!barcode) {
    return error(
      "Λείπει το barcode.",
      400,
      origin,
      requestId,
    );
  }

  const product = await getAdminProduct(env.DB, barcode);

  if (!product || !isRecord(product.analysisResult)) {
    return error(
      "Το προϊόν δεν έχει ανάλυση για να γράψει ο βοηθός.",
      404,
      origin,
      requestId,
    );
  }

  const analysisResult = product.analysisResult;

  const findings = Array.isArray(analysisResult.ingredientFindings)
    ? analysisResult.ingredientFindings
        .filter(isRecord)
        .map((finding) => ({
          ingredientName:
            typeof finding.ingredientName === "string"
              ? finding.ingredientName
              : "",
          severity:
            typeof finding.severity === "string"
              ? finding.severity
              : "unknown",
          title: typeof finding.title === "string" ? finding.title : "",
        }))
    : [];

  const score = isRecord(analysisResult.score)
    ? analysisResult.score
    : {};

  const prompt = buildDraftPrompt({
    productName: product.productName,
    sourceText:
      typeof analysisResult.sourceText === "string"
        ? analysisResult.sourceText
        : "",
    findings,
    score: typeof score.score === "number" ? score.score : null,
    band: typeof score.band === "string" ? score.band : null,
  });

  const modelOutput = await env.AI.run(textModel, {
    messages: [
      {
        role: "system",
        content:
          "You are a Greek-language product copywriter. You always return a single valid JSON object and nothing else.",
      },
      { role: "user", content: prompt },
    ],
    max_tokens: 700,
    temperature: 0.3,
  });

  const modelText = extractModelText(modelOutput);

  const draft = modelText
    ? parseAssistantDraft(stripCodeFences(modelText))
    : null;

  if (!draft) {
    return error(
      "Ο βοηθός δεν επέστρεψε αξιοποιήσιμο κείμενο. Δοκιμάστε ξανά.",
      502,
      origin,
      requestId,
    );
  }

  console.log("admin_assist_draft", {
    requestId,
    barcode,
    highlights: draft.highlights.length,
  });

  return json(
    { assistant: { mode: "draft", text: null, draft, facts: null } },
    200,
    origin,
    requestId,
  );
}

async function runAssistReport(
  body: Record<string, unknown>,
  env: Env,
  origin: string | null,
  requestId: string,
): Promise<Response> {
  const question =
    typeof body.question === "string" ? body.question.trim() : "";

  if (!question) {
    return error(
      "Λείπει η ερώτηση.",
      400,
      origin,
      requestId,
    );
  }

  const facts = await collectCatalogueFacts(env.DB);

  const modelOutput = await env.AI.run(textModel, {
    messages: [
      {
        role: "system",
        content:
          "You are a catalogue analyst. You answer in Greek using only the numbers you are given.",
      },
      { role: "user", content: buildReportPrompt(facts, question.slice(0, 500)) },
    ],
    max_tokens: 600,
    temperature: 0.2,
  });

  const text = extractModelText(modelOutput);

  if (!text) {
    return error(
      "Ο βοηθός δεν απάντησε. Δοκιμάστε ξανά.",
      502,
      origin,
      requestId,
    );
  }

  console.log("admin_assist_report", {
    requestId,
    totalProducts: facts.totalProducts,
  });

  return json(
    {
      assistant: {
        mode: "report",
        text: stripCodeFences(text),
        draft: null,
        facts,
      },
    },
    200,
    origin,
    requestId,
  );
}

/**
 * Sub-router for the whole /api/admin/* surface (the bulk in-store photo
 * capture flow, and the PIM list/detail/edit screens built on top of it).
 * Every route here shares one gate: a shared-secret header checked before
 * any route is even matched, so a new route added below can never
 * accidentally ship unauthenticated.
 */
async function runAdminRequest(
  request: Request,
  url: URL,
  env: Env,
  origin: string | null,
  requestId: string,
): Promise<Response> {
  const adminEnv = env as AdminEnvironment;
  const providedPassword = request.headers.get(
    "X-Admin-Password",
  );

  // Fails closed on both sides: no secret configured yet, or a
  // missing/wrong header, are treated identically as "not authorized" —
  // never distinguished in the response, so a caller can't probe whether
  // the secret has been set up yet.
  if (
    !adminEnv.ADMIN_PASSWORD ||
    !providedPassword ||
    providedPassword !== adminEnv.ADMIN_PASSWORD
  ) {
    return error(
      "Μη εξουσιοδοτημένο αίτημα.",
      401,
      origin,
      requestId,
    );
  }

  const photosBarcode = matchAdminPhotosPath(
    url.pathname,
  );

  if (photosBarcode !== null) {
    if (request.method === "POST") {
      return runAdminUploadPhoto(
        photosBarcode,
        request,
        env,
        origin,
        requestId,
      );
    }

    if (request.method === "GET") {
      return runAdminListPhotos(
        photosBarcode,
        env,
        origin,
        requestId,
      );
    }
  }

  if (
    request.method === "GET" &&
    url.pathname === "/api/admin/photos/file"
  ) {
    return runAdminServePhoto(
      url,
      env,
      origin,
      requestId,
    );
  }

  if (
    request.method === "GET" &&
    url.pathname === "/api/admin/products"
  ) {
    return runAdminListProducts(
      url,
      env,
      origin,
      requestId,
    );
  }

  const analyzeBarcode = matchAdminProductAnalyzePath(
    url.pathname,
  );

  if (
    analyzeBarcode !== null &&
    request.method === "POST"
  ) {
    return runAdminAnalyzeProduct(
      analyzeBarcode,
      env,
      origin,
      requestId,
    );
  }

  const versionsBarcode = matchAdminProductVersionsPath(
    url.pathname,
  );

  if (versionsBarcode !== null) {
    if (request.method === "GET") {
      return runAdminListVersions(
        versionsBarcode,
        url,
        env,
        origin,
        requestId,
      );
    }

    if (request.method === "POST") {
      return runAdminRestoreVersion(
        versionsBarcode,
        request,
        env,
        origin,
        requestId,
      );
    }
  }

  if (
    request.method === "POST" &&
    url.pathname === "/api/admin/assist"
  ) {
    return runAdminAssist(
      request,
      env,
      origin,
      requestId,
    );
  }

  const productBarcode = matchAdminProductPath(
    url.pathname,
  );

  if (productBarcode !== null) {
    if (request.method === "GET") {
      return runAdminGetProduct(
        productBarcode,
        env,
        origin,
        requestId,
      );
    }

    if (request.method === "PUT") {
      return runAdminUpdateProduct(
        productBarcode,
        request,
        env,
        origin,
        requestId,
      );
    }

    if (request.method === "DELETE") {
      return runAdminDeleteProduct(
        productBarcode,
        env,
        origin,
        requestId,
      );
    }
  }

  return error(
    "Η διαδρομή δεν βρέθηκε.",
    404,
    origin,
    requestId,
  );
}

async function runAdminUploadPhoto(
  barcode: string,
  request: Request,
  env: Env,
  origin: string | null,
  requestId: string,
): Promise<Response> {
  const contentType =
    request.headers.get("content-type") ?? "";

  if (!contentType.includes("multipart/form-data")) {
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
    imageValue instanceof File ? imageValue : null;

  const photoTypeValue = readTextField(
    formData,
    "photoType",
  );

  if (!image) {
    return error(
      "Λείπει η φωτογραφία.",
      400,
      origin,
      requestId,
    );
  }

  if (!isPhotoType(photoTypeValue)) {
    return error(
      "Μη έγκυρος τύπος φωτογραφίας.",
      400,
      origin,
      requestId,
    );
  }

  const photoType: PhotoType = photoTypeValue;

  // photos/{barcode}/{photo_type}/{timestamp}.jpg — timestamp keeps a
  // retake from overwriting the previous shot, so nothing is lost if the
  // admin/PIM (built later) ever needs to compare or recover an old one.
  const r2Key = `photos/${barcode}/${photoType}/${Date.now()}.jpg`;

  try {
    await env.PHOTOS.put(
      r2Key,
      await image.arrayBuffer(),
      {
        httpMetadata: {
          contentType: image.type || "image/jpeg",
        },
      },
    );

    await insertProductPhoto(env.DB, {
      barcode,
      photoType,
      r2Key,
    });
  } catch (caughtError) {
    console.error("admin_photo_upload_failed", {
      requestId,
      barcode,
      photoType,
      message:
        caughtError instanceof Error
          ? caughtError.message
          : String(caughtError).slice(0, 300),
    });

    return error(
      "Η αποθήκευση της φωτογραφίας απέτυχε.",
      502,
      origin,
      requestId,
    );
  }

  // Best-effort (see ensureDraftProduct) — the photo above is already
  // safely recorded either way.
  await ensureDraftProduct(env.DB, barcode);

  console.log("admin_photo_uploaded", {
    requestId,
    barcode,
    photoType,
    r2Key,
  });

  return json(
    { r2Key },
    200,
    origin,
    requestId,
  );
}

async function runAdminListPhotos(
  barcode: string,
  env: Env,
  origin: string | null,
  requestId: string,
): Promise<Response> {
  try {
    const photos = await listProductPhotos(
      env.DB,
      barcode,
    );

    return json(
      { photos },
      200,
      origin,
      requestId,
    );
  } catch (caughtError) {
    console.error("admin_photo_list_failed", {
      requestId,
      barcode,
      message:
        caughtError instanceof Error
          ? caughtError.message
          : String(caughtError).slice(0, 300),
    });

    return error(
      "Η λίστα φωτογραφιών δεν φορτώθηκε.",
      502,
      origin,
      requestId,
    );
  }
}

// Streams an object straight from R2, gated behind the same
// X-Admin-Password check as the rest of /api/admin/* (see runAdminRequest)
// — the simplest option that needed no extra Cloudflare dashboard setup
// (a public R2 bucket/custom domain would also have meant reasoning about
// a second, separate access-control story for the same photos). The
// tradeoff: a plain `<img src>` can't attach a custom header, so the
// future admin/PIM viewer will need to fetch this with JS and render the
// result as a blob URL rather than pointing an <img> tag at it directly.
async function runAdminServePhoto(
  url: URL,
  env: Env,
  origin: string | null,
  requestId: string,
): Promise<Response> {
  const key = url.searchParams.get("key");

  if (!key) {
    return error(
      "Λείπει η παράμετρος key.",
      400,
      origin,
      requestId,
    );
  }

  // Every key this endpoint should ever be asked for was minted by
  // runAdminUploadPhoto under this exact prefix — rejecting anything else
  // keeps this from being usable to read arbitrary objects elsewhere in
  // the bucket.
  if (!key.startsWith("photos/")) {
    return error(
      "Μη έγκυρη παράμετρος key.",
      400,
      origin,
      requestId,
    );
  }

  let object: R2ObjectBody | null;

  try {
    object = await env.PHOTOS.get(key);
  } catch (caughtError) {
    console.error("admin_photo_fetch_failed", {
      requestId,
      key,
      message:
        caughtError instanceof Error
          ? caughtError.message
          : String(caughtError).slice(0, 300),
    });

    return error(
      "Η ανάκτηση της φωτογραφίας απέτυχε.",
      502,
      origin,
      requestId,
    );
  }

  if (!object) {
    return error(
      "Η φωτογραφία δεν βρέθηκε.",
      404,
      origin,
      requestId,
    );
  }

  return new Response(object.body, {
    status: 200,
    headers: {
      "content-type":
        object.httpMetadata?.contentType ??
        "image/jpeg",
      "cache-control": "private, max-age=3600",
      ...corsHeaders(origin),
    },
  });
}

async function runAdminListProducts(
  url: URL,
  env: Env,
  origin: string | null,
  requestId: string,
): Promise<Response> {
  const pageParam = Number.parseInt(
    url.searchParams.get("page") ?? "1",
    10,
  );

  try {
    const list = await listAdminProducts(env.DB, {
      status: url.searchParams.get("status") ?? undefined,
      barcodeSearch:
        url.searchParams.get("search") ?? undefined,
      page: Number.isFinite(pageParam) ? pageParam : 1,
    });

    return json(list, 200, origin, requestId);
  } catch (caughtError) {
    console.error("admin_product_list_failed", {
      requestId,
      message:
        caughtError instanceof Error
          ? caughtError.message
          : String(caughtError).slice(0, 300),
    });

    return error(
      "Η λίστα προϊόντων δεν φορτώθηκε.",
      502,
      origin,
      requestId,
    );
  }
}

async function runAdminGetProduct(
  barcode: string,
  env: Env,
  origin: string | null,
  requestId: string,
): Promise<Response> {
  try {
    const product = await getAdminProduct(env.DB, barcode);

    if (!product) {
      return error(
        "Το προϊόν δεν βρέθηκε.",
        404,
        origin,
        requestId,
      );
    }

    return json({ product }, 200, origin, requestId);
  } catch (caughtError) {
    console.error("admin_product_get_failed", {
      requestId,
      barcode,
      message:
        caughtError instanceof Error
          ? caughtError.message
          : String(caughtError).slice(0, 300),
    });

    return error(
      "Το προϊόν δεν φορτώθηκε.",
      502,
      origin,
      requestId,
    );
  }
}

async function runAdminUpdateProduct(
  barcode: string,
  request: Request,
  env: Env,
  origin: string | null,
  requestId: string,
): Promise<Response> {
  const body = await readJson(request);

  if (!isRecord(body)) {
    return error(
      "Το αίτημα δεν είναι έγκυρο.",
      400,
      origin,
      requestId,
    );
  }

  const validated = validateVerifiedAnalysisResult(
    body.analysisResult,
  );

  if (!validated) {
    return error(
      "Το αποτέλεσμα ανάλυσης δεν έχει έγκυρη μορφή. Ελέγξτε ότι κάθε πεδίο (περίληψη, ευρήματα, κείμενο συστατικών) είναι συμπληρωμένο σωστά.",
      422,
      origin,
      requestId,
    );
  }

  const category =
    typeof body.category === "string"
      ? body.category
      : undefined;

  try {
    // The score is never taken from the form. It is recomputed here from
    // the confirmed ingredient text with the same rules the live scan uses,
    // so an edited findings list can't leave a stale score (and stale
    // deductions) behind it — see rescore.ts.
    const rescored = await rescoreIngredientsResult(
      env.DB,
      validated.core,
      validated.sourceText,
    );

    console.log("admin_product_rescored", {
      requestId,
      barcode,
      score: rescored.score.score,
      band: rescored.score.band,
      deductions: rescored.score.deductions.length,
      ruleMatches: rescored.ruleMatches.length,
    });

    await saveVerifiedProduct(env.DB, {
      barcode,
      category,
      analysisResult: {
        // The recompute can move the number, so any prose that quotes it —
        // the assistant's "μία πρόταση που δικαιολογεί τη βαθμολογία" above
        // all — is brought along with it (see syncEnvelopeScoreMentions).
        ...syncEnvelopeScoreMentions(
          validated.envelope,
          rescored.score,
        ),
        score: rescored.score,
        ingredientInsights: rescored.ingredientInsights,
      },
    });

    const product = await getAdminProduct(env.DB, barcode);

    if (!product) {
      return error(
        "Το προϊόν δεν βρέθηκε.",
        404,
        origin,
        requestId,
      );
    }

    await recordProductVersion(env.DB, {
      barcode,
      source: "admin_edit",
      productName: product.productName,
      category: product.category,
      analysisResult: product.analysisResult,
      applied: true,
    });

    console.log("admin_product_verified", {
      requestId,
      barcode,
    });

    return json({ product }, 200, origin, requestId);
  } catch (caughtError) {
    console.error("admin_product_update_failed", {
      requestId,
      barcode,
      message:
        caughtError instanceof Error
          ? caughtError.message
          : String(caughtError).slice(0, 300),
    });

    return error(
      "Η αποθήκευση απέτυχε.",
      502,
      origin,
      requestId,
    );
  }
}

async function runAdminDeleteProduct(
  barcode: string,
  env: Env,
  origin: string | null,
  requestId: string,
): Promise<Response> {
  try {
    await deleteAdminProduct(env.DB, env.PHOTOS, barcode);

    console.log("admin_product_deleted", {
      requestId,
      barcode,
    });

    return json(
      { success: true },
      200,
      origin,
      requestId,
    );
  } catch (caughtError) {
    console.error("admin_product_delete_failed", {
      requestId,
      barcode,
      message:
        caughtError instanceof Error
          ? caughtError.message
          : String(caughtError).slice(0, 300),
    });

    return error(
      "Η διαγραφή απέτυχε.",
      502,
      origin,
      requestId,
    );
  }
}

/**
 * Re-runs OCR + AI analysis for a draft product from its already-captured
 * photos in R2 — the PIM's "Ανάλυση τώρα" button. Reuses the exact same
 * analyzeIngredientsCore/analyzeNutritionCore pipeline the live
 * /api/analysis/run endpoint uses (including its cache-write, which is
 * also what correctly flips a 'draft' row to 'ai_generated' — see the
 * comment on saveProductResult), so nothing about the analysis itself is
 * duplicated here — this function only sources the OCR input differently
 * (an R2 object instead of a live upload).
 *
 * Category is chosen from whichever photo exists: an 'ingredients' photo
 * wins over a 'nutrition' one if both are present, since ingredients is
 * this app's primary path. There is no chemical_composition option here
 * — the capture flow's photo_type enum (front/ingredients/nutrition/
 * other) has no slot for it, so a chemical-composition product can't
 * reach this endpoint with an analyzable photo at all.
 */
async function runAdminAnalyzeProduct(
  barcode: string,
  env: Env,
  origin: string | null,
  requestId: string,
): Promise<Response> {
  let photos: ProductPhotoRow[];

  try {
    photos = await listProductPhotos(env.DB, barcode);
  } catch (caughtError) {
    console.error("admin_analyze_photo_lookup_failed", {
      requestId,
      barcode,
      message:
        caughtError instanceof Error
          ? caughtError.message
          : String(caughtError).slice(0, 300),
    });

    return error(
      "Δεν ήταν δυνατή η ανάκτηση των φωτογραφιών.",
      502,
      origin,
      requestId,
    );
  }

  const ingredientsPhoto = photos.find(
    (photo) => photo.photoType === "ingredients",
  );

  const nutritionPhoto = photos.find(
    (photo) => photo.photoType === "nutrition",
  );

  const chosen = ingredientsPhoto
    ? { category: "ingredients" as const, photo: ingredientsPhoto }
    : nutritionPhoto
      ? { category: "nutrition" as const, photo: nutritionPhoto }
      : null;

  if (!chosen) {
    return error(
      "Δεν υπάρχει φωτογραφία συστατικών ή διατροφικού πίνακα για αυτό το barcode.",
      400,
      origin,
      requestId,
    );
  }

  const azureEnv = env as AzureVisionEnvironment;

  if (
    !azureEnv.AZURE_VISION_ENDPOINT ||
    !azureEnv.AZURE_VISION_KEY
  ) {
    return error(
      "Η υπηρεσία OCR δεν έχει ρυθμιστεί σωστά στον διακομιστή (AZURE_VISION).",
      503,
      origin,
      requestId,
    );
  }

  let object: R2ObjectBody | null;

  try {
    object = await env.PHOTOS.get(chosen.photo.r2Key);
  } catch (caughtError) {
    console.error("admin_analyze_photo_fetch_failed", {
      requestId,
      barcode,
      r2Key: chosen.photo.r2Key,
      message:
        caughtError instanceof Error
          ? caughtError.message
          : String(caughtError).slice(0, 300),
    });

    return error(
      "Η ανάκτηση της φωτογραφίας απέτυχε.",
      502,
      origin,
      requestId,
    );
  }

  if (!object) {
    return error(
      "Η φωτογραφία δεν βρέθηκε στο αποθηκευτικό χώρο.",
      404,
      origin,
      requestId,
    );
  }

  const imageFile = new File(
    [await object.arrayBuffer()],
    "capture.jpg",
    {
      type: object.httpMetadata?.contentType || "image/jpeg",
    },
  );

  let ocrResult: OcrResponse;

  try {
    ocrResult = await extractWithAzureOcr(
      imageFile,
      azureEnv.AZURE_VISION_ENDPOINT,
      azureEnv.AZURE_VISION_KEY,
      azureEnv.AZURE_VISION_LANGUAGE,
    );
  } catch (caughtError) {
    console.error("admin_analyze_ocr_failed", {
      requestId,
      barcode,
      message:
        caughtError instanceof Error
          ? caughtError.message
          : String(caughtError).slice(0, 300),
    });

    return error(
      caughtError instanceof Error
        ? caughtError.message
        : "Το OCR απέτυχε.",
      502,
      origin,
      requestId,
    );
  }

  // Best-effort only — a lookup miss or D1 failure just means the noise
  // filter below has no title to match against, same as any other scan.
  const cachedForTitle = await lookupCachedProduct(env.DB, barcode);
  const productTitle = cachedForTitle?.productName ?? undefined;

  const outcome =
    chosen.category === "ingredients"
      ? await analyzeIngredientsCore(
          barcode,
          ocrResult.rawText,
          ocrResult.confidence,
          ocrResult.labelType,
          env,
          requestId,
          productTitle,
          "admin_analyze",
        )
      : await analyzeNutritionCore(
          barcode,
          ocrResult.rawText,
          ocrResult.confidence,
          env,
          requestId,
          productTitle,
          "admin_analyze",
        );

  if (!outcome.ok) {
    if (outcome.kind === "insufficient") {
      return error(
        outcome.reasons.join(" ") ||
          "Δεν υπήρχαν αρκετά στοιχεία στη φωτογραφία για ανάλυση.",
        422,
        origin,
        requestId,
      );
    }

    return error(
      outcome.kind === "model_failed"
        ? "Η ανάλυση δεν ολοκληρώθηκε αξιόπιστα. Δοκιμάστε ξανά."
        : "Η ανάλυση δεν ολοκληρώθηκε. Δοκιμάστε ξανά.",
      502,
      origin,
      requestId,
    );
  }

  const product = await getAdminProduct(env.DB, barcode);

  console.log("admin_product_analyzed", {
    requestId,
    barcode,
    category: chosen.category,
  });

  return json({ product }, 200, origin, requestId);
}

/**
 * Keeps a user's label photo in the shared catalogue, so a later scan of
 * the same barcode by anyone can show a picture, and so the PIM has
 * something real to review the analysis against.
 *
 * Only the newest user photo per label type survives (pruneUserPhotos):
 * a popular barcode should not turn into a pile of near-identical shots.
 * Photos captured by the admin flow are left alone — those are curated.
 *
 * Entirely best-effort. Every failure is logged and swallowed: the OCR
 * result in the caller's hand is what the user asked for, and losing a
 * photo must never cost them that.
 */
async function storeScanPhoto(
  env: Env,
  params: {
    barcode: string;
    image: File;
    labelType: LabelType;
    requestId: string;
  },
): Promise<void> {
  const barcode = params.barcode.trim();

  if (!barcode) {
    return;
  }

  const photoType: PhotoType =
    params.labelType === "nutrition"
      ? "nutrition"
      : "ingredients";

  const r2Key = `photos/${barcode}/${photoType}/${Date.now()}.jpg`;

  try {
    await env.PHOTOS.put(r2Key, await params.image.arrayBuffer(), {
      httpMetadata: {
        contentType: params.image.type || "image/jpeg",
      },
    });
  } catch (caughtError) {
    console.error("scan_photo_upload_failed", {
      requestId: params.requestId,
      barcode,
      message:
        caughtError instanceof Error
          ? caughtError.message
          : String(caughtError).slice(0, 300),
    });

    return;
  }

  try {
    const staleKeys = await pruneUserPhotos(
      env.DB,
      barcode,
      photoType,
    );

    await insertProductPhoto(env.DB, {
      barcode,
      photoType,
      r2Key,
      uploadedBy: "user_scan",
    });

    await ensureDraftProduct(env.DB, barcode);

    // After the new row is safely in place, so a failure here leaves an
    // extra object in the bucket rather than a row pointing at nothing.
    for (const key of staleKeys) {
      await env.PHOTOS.delete(key);
    }

    console.log("scan_photo_stored", {
      requestId: params.requestId,
      barcode,
      photoType,
      replaced: staleKeys.length,
    });
  } catch (caughtError) {
    console.error("scan_photo_record_failed", {
      requestId: params.requestId,
      barcode,
      message:
        caughtError instanceof Error
          ? caughtError.message
          : String(caughtError).slice(0, 300),
    });
  }
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
    !contentType.includes(
      "multipart/form-data",
    )
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
    formData =
      await request.formData();
  } catch {
    return error(
      "Το multipart payload δεν είναι έγκυρο.",
      400,
      origin,
      requestId,
    );
  }

  const imageValue =
    formData.get("image");

  const image =
    imageValue instanceof File
      ? imageValue
      : null;

  const barcode =
    readTextField(
      formData,
      "barcode",
    );

  const productId =
    readTextField(
      formData,
      "productId",
    );

  const validationError =
    validateOcrRequest(
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

  console.log("ocr_image_received", {
    requestId,
    provider: "azure-ai-vision",
    fileName: image.name,
    fileType: image.type,
    fileSizeBytes: image.size,
  });

  const azureEnv =
    env as AzureVisionEnvironment;

  if (
    !azureEnv.AZURE_VISION_ENDPOINT ||
    !azureEnv.AZURE_VISION_KEY
  ) {
    console.error(
      "azure_ocr_configuration_missing",
      {
        requestId,
        hasEndpoint: Boolean(
          azureEnv.AZURE_VISION_ENDPOINT,
        ),
        hasKey: Boolean(
          azureEnv.AZURE_VISION_KEY,
        ),
      },
    );

    // Distinct wording from the frontend configuration message, so the two
    // can never be confused again while debugging.
    return error(
      "Η υπηρεσία OCR δεν έχει ρυθμιστεί σωστά στον διακομιστή (AZURE_VISION).",
      503,
      origin,
      requestId,
    );
  }

  try {
    const startedAt = Date.now();

    const result =
      await extractWithAzureOcr(
        image,
        azureEnv.AZURE_VISION_ENDPOINT,
        azureEnv.AZURE_VISION_KEY,
        azureEnv.AZURE_VISION_LANGUAGE,
      );

    const evaluation =
      evaluateLabelText(result.rawText);

    // Same authoritative validator used by /api/analysis/run and the
    // ingredients review screen — one source of truth for "is this really
    // an ingredient list", instead of a second, ad hoc rule set here.
    const extraction = extractIngredientText(
      result.rawText,
      result.confidence,
    );

    // Quality signals only — never used to block the flow. A low-confidence
    // read still returns 200 with the raw OCR text so the user can always
    // continue; retaking the photo stays available but optional.
    const ambiguousNutritionLabel =
      result.labelType === "nutrition" &&
      !(
        evaluation.hasIngredientHeading &&
        evaluation.looksLikeIngredients
      );

    const extractionQuality: "high" | "low" =
      extraction.isValid &&
      extraction.confidence >= 0.6 &&
      !ambiguousNutritionLabel &&
      !looksLikeSyntheticNutritionText(
        result.rawText,
      )
        ? "high"
        : "low";

    console.log("ocr_model_completed", {
      requestId,
      endpoint: "/api/ocr/extract",
      provider: "azure-ai-vision",
      durationMs:
        Date.now() - startedAt,
      parsedLabelType:
        result.labelType,
      parsedTextLength:
        result.rawText.length,
      ingredientSectionLength:
        evaluation.ingredientText.length,
      nutritionMarkerCount:
        evaluation.nutritionMarkerCount,
      numericUnitCount:
        evaluation.numericUnitCount,
      hasIngredientHeading:
        evaluation.hasIngredientHeading,
      confidence:
        result.confidence,
      extractionConfidence:
        extraction.confidence,
      extractionValid:
        extraction.isValid,
      extractionQuality,
      status: "success",
    });

    // The label the user just photographed is the catalogue's best chance
    // at a picture for this barcode, so it is kept — never at the cost of
    // the response, which is why this is awaited but can only log on
    // failure. See storeScanPhoto for what is (and isn't) retained.
    await storeScanPhoto(env, {
      barcode: barcode ?? "",
      image,
      labelType: result.labelType,
      requestId,
    });

    return json(
      result,
      200,
      origin,
      requestId,
    );
  } catch (caughtError) {
    console.error(
      "ocr_extract_failed",
      {
        requestId,
        provider:
          "azure-ai-vision",
        name:
          caughtError instanceof Error
            ? caughtError.name
            : "unknown",
        message:
          caughtError instanceof Error
            ? caughtError.message
            : String(
                caughtError,
              ).slice(0, 300),
      },
    );

    return error(
      caughtError instanceof Error
        ? caughtError.message
        : "Δεν ήταν δυνατή η ανάγνωση της ετικέτας.",
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
      "GET, POST, PUT, DELETE, OPTIONS";
    headers["Access-Control-Allow-Headers"] =
      "Content-Type, X-Admin-Password";
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

interface AnalysisRequestBody {
  productId: string;
  barcode: string;
  productType:
    | "food"
    | "cosmetic"
    | "unknown";
  confirmedIngredientText: string;
  normalizedIngredients: unknown[];
  ocrConfidence: number;
  ocrLabelType?: LabelType;
  ocrTextLength?: number;
  categoryOverride?: ContentCategory;
  // Product title/brand already known from an earlier step (barcode lookup
  // or vision identify), if any — used only to filter that same text out of
  // the extracted ingredients/nutrition/chemical block when OCR captures it
  // there too. Never treated as authoritative; a missing value just means
  // that particular filter has nothing to compare against.
  productTitle?: string;
}

function isAnalysisRequest(
  value: unknown,
): value is AnalysisRequestBody {
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
    value.ocrConfidence <= 1 &&
    (value.ocrLabelType === undefined ||
      value.ocrLabelType === "ingredients" ||
      value.ocrLabelType === "nutrition" ||
      value.ocrLabelType === "mixed" ||
      value.ocrLabelType === "unknown") &&
    (value.ocrTextLength === undefined ||
      typeof value.ocrTextLength === "number") &&
    (value.categoryOverride === undefined ||
      value.categoryOverride === "ingredients" ||
      value.categoryOverride === "nutrition" ||
      value.categoryOverride === "chemical_composition" ||
      value.categoryOverride === "unknown") &&
    (value.productTitle === undefined ||
      (typeof value.productTitle === "string" &&
        value.productTitle.length <= 200))
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

function insufficientAnalysis(
  reasons?: string[],
): WorkerAnalysisResult {
  return {
    productType: "unknown",
    summary:
      "Δεν υπάρχουν αρκετά στοιχεία για αξιόπιστη ανάλυση.",
    positives: [],
    attentionItems: [],
    potentialAllergens: [],
    ingredientFindings: [],
    insufficientDataReasons:
      reasons && reasons.length > 0
        ? reasons
        : [
            "Λείπει επιβεβαιωμένη και επαρκής λίστα συστατικών.",
          ],
    confidence: 0,
  };
}

function insufficientScore(
  reasons: string[],
  ocrConfidence: number,
): WorkerScore {
  return {
    score: null,
    band: "insufficient_data",
    deductions: [],
    bonuses: [],
    confidence: ocrConfidence,
    lowConfidenceReason: null,
    insufficientDataReasons: reasons,
    scoringVersion,
  };
}

// Builds the same response envelope as a successful analysis (result +
// score + ingredientInsights + executiveSummary), just filled with
// "insufficient data" values. Every early-return in runAnalysis must go
// through this instead of returning insufficientAnalysis() bare — a
// response missing `score` reads to the client as a malformed/unknown
// response and gets replaced with a generic, unhelpful placeholder instead
// of the specific reason computed here.
async function insufficientResponse(
  reasons: string[] | undefined,
  ocrConfidence: number,
  db: D1Like,
  origin: string | null,
  requestId: string,
): Promise<Response> {
  const result = insufficientAnalysis(reasons);
  const score = insufficientScore(
    result.insufficientDataReasons,
    ocrConfidence,
  );
  // result.ingredientFindings is always empty on this path, so this never
  // actually reaches D1 — kept as a real call (not skipped) so this stays
  // the single code path building an ingredients response envelope.
  const ingredientInsights = await buildIngredientInsights(
    result,
    score,
    db,
  );
  const executiveSummary = buildExecutiveSummary(
    result,
    score,
    ingredientInsights,
  );

  return json(
    {
      ...result,
      score,
      ingredientInsights,
      executiveSummary,
      contentCategory: "ingredients",
    },
    200,
    origin,
    requestId,
  );
}

function unknownCategoryResponse(
  origin: string | null,
  requestId: string,
): Response {
  return json(
    {
      contentCategory: "unknown",
      message:
        "Δεν αναγνωρίστηκε ο τύπος περιεχομένου - δοκίμασε να φωτογραφίσεις πιο καθαρά τη λίστα συστατικών/διατροφικό πίνακα.",
      insufficientDataReasons: [
        "Δεν αναγνωρίστηκε ο τύπος περιεχομένου.",
      ],
    },
    200,
    origin,
    requestId,
  );
}

function nutritionInsufficientResponse(
  reasons: string[],
  ocrConfidence: number,
  origin: string | null,
  requestId: string,
): Response {
  const result: WorkerNutritionResult = {
    subtype: "unknown",
    summary:
      "Δεν υπάρχουν αρκετά στοιχεία για αξιόπιστη διατροφική ανάλυση.",
    positives: [],
    attentionItems: [],
    nutritionFindings: [],
    insufficientDataReasons:
      reasons.length > 0
        ? reasons
        : [
            "Λείπει επιβεβαιωμένος και επαρκής διατροφικός πίνακας.",
          ],
    confidence: 0,
  };

  const score = insufficientScore(
    result.insufficientDataReasons,
    ocrConfidence,
  );

  const nutritionInsights = buildNutritionInsights(
    result,
    score,
  );

  const executiveSummary = buildNutritionExecutiveSummary(
    result,
    score,
  );

  return json(
    {
      ...result,
      score,
      nutritionInsights,
      executiveSummary,
      allergenNotice: null,
      contentCategory: "nutrition",
    },
    200,
    origin,
    requestId,
  );
}

function chemicalInsufficientResponse(
  reasons: string[],
  ocrConfidence: number,
  origin: string | null,
  requestId: string,
): Response {
  const result: WorkerChemicalResult = {
    sourceType: "unknown",
    summary:
      "Δεν υπάρχουν αρκετά στοιχεία για αξιόπιστη χημική ανάλυση.",
    positives: [],
    attentionItems: [],
    chemicalFindings: [],
    insufficientDataReasons:
      reasons.length > 0
        ? reasons
        : [
            "Λείπει επιβεβαιωμένη και επαρκής χημική ανάλυση.",
          ],
    confidence: 0,
  };

  const score = insufficientScore(
    result.insufficientDataReasons,
    ocrConfidence,
  );

  const chemicalInsights = buildChemicalInsights(
    result,
    score,
  );

  const executiveSummary = buildChemicalExecutiveSummary(
    result,
    score,
  );

  return json(
    {
      ...result,
      score,
      chemicalInsights,
      executiveSummary,
      contentCategory: "chemical_composition",
    },
    200,
    origin,
    requestId,
  );
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

  // Shared product cache: a barcode that already has a complete, previously
  // computed analysis skips OCR/AI entirely and replays that result. A
  // cache miss (including any D1 failure — lookupCachedProduct degrades to
  // null rather than throwing) falls straight through to the normal flow
  // below, unchanged.
  const cached = await lookupCachedProduct(
    env.DB,
    requestBody.barcode,
  );

  if (cached) {
    await incrementProductScanCount(
      env.DB,
      requestBody.barcode,
    );

    console.log("product_cache_hit", {
      requestId,
      barcode: requestBody.barcode,
      category: cached.category,
      scanCount: cached.scanCount + 1,
    });

    // Written by saveProductResult below from a response this same
    // endpoint already validated and returned once — safe to replay as-is.
    return json(
      cached.analysisResult as JsonBody,
      200,
      origin,
      requestId,
    );
  }

  const confirmedText =
    requestBody.confirmedIngredientText.trim();

  // Only gate on the raw confirmed text here. normalizedIngredients is a
  // client-computed convenience array (naive comma-splitting) that can be
  // empty even when the text itself is a perfectly valid ingredient list
  // (e.g. OCR text missing commas) — extractIngredientText below is the
  // real, authoritative validator for that.
  if (!confirmedText) {
    return insufficientResponse(
      undefined,
      requestBody.ocrConfidence,
      env.DB,
      origin,
      requestId,
    );
  }

  const category = await resolveContentCategory(
    confirmedText,
    requestBody.categoryOverride,
    env,
    requestId,
  );

  console.log("content_category_resolved", {
    requestId,
    category: category.category,
    confidence: category.confidence,
    source: category.source,
  });

  switch (category.category) {
    case "ingredients":
      return runIngredientsAnalysis(
        requestBody,
        confirmedText,
        env,
        origin,
        requestId,
      );
    case "nutrition":
      return runNutritionAnalysis(
        requestBody,
        confirmedText,
        env,
        origin,
        requestId,
      );
    case "chemical_composition":
      return runChemicalAnalysisPath(
        requestBody,
        confirmedText,
        env,
        origin,
        requestId,
      );
    default:
      return unknownCategoryResponse(origin, requestId);
  }
}

// Resolution order: an explicit client override wins outright; otherwise the
// cheap deterministic heuristic; only when that is inconclusive does one AI
// classification call run. Keeps the common case (heuristic decides) free of
// extra latency/cost.
async function resolveContentCategory(
  confirmedText: string,
  categoryOverride: ContentCategory | undefined,
  env: Env,
  requestId: string,
): Promise<ContentCategoryResult> {
  if (
    categoryOverride === "ingredients" ||
    categoryOverride === "nutrition" ||
    categoryOverride === "chemical_composition"
  ) {
    return { category: categoryOverride, confidence: 1, source: "override" };
  }

  const heuristic = detectContentCategoryHeuristic(confirmedText);

  if (heuristic.category !== "unknown") {
    return heuristic;
  }

  try {
    const modelOutput = await env.AI.run(textModel, {
      messages: [
        {
          role: "system",
          content:
            "You are a label-content classifier. You always return a single valid JSON object and nothing else.",
        },
        {
          role: "user",
          content: buildCategoryClassificationPrompt(confirmedText),
        },
      ],
      max_tokens: 64,
      temperature: 0,
    });

    const modelText = extractModelText(modelOutput);
    const cleanedText = modelText ? stripCodeFences(modelText) : null;

    const aiCategory =
      parseCategoryClassification(modelOutput) ??
      (cleanedText ? parseCategoryClassification(cleanedText) : null);

    console.log("content_category_ai_fallback", {
      requestId,
      aiCategory,
    });

    if (aiCategory && aiCategory !== "unknown") {
      return { category: aiCategory, confidence: 0.6, source: "ai" };
    }
  } catch (caughtError) {
    console.error("content_category_ai_failed", {
      requestId,
      message:
        caughtError instanceof Error
          ? caughtError.message
          : String(caughtError).slice(0, 200),
    });
  }

  return { category: "unknown", confidence: 0, source: "ai" };
}

type IngredientsAnalysisOutcome =
  | {
      ok: true;
      responseBody: WorkerAnalysisResult & {
        score: WorkerScore;
        ingredientInsights: IngredientInsight[];
        executiveSummary: ExecutiveSummary;
        allergenNotice: AllergenNotice | null;
        contentCategory: "ingredients";
      };
    }
  | { ok: false; kind: "insufficient"; reasons: string[] }
  | { ok: false; kind: "model_failed" }
  | { ok: false; kind: "exception" };

/**
 * The actual OCR-text-in, scored-result-out ingredients pipeline — same
 * prompt, parsing, allergen handling, scoring and cache-write regardless
 * of caller. Shared by the live /api/analysis/run endpoint
 * (runIngredientsAnalysis below, a thin Response-shaping wrapper) and the
 * admin re-analyze endpoint (runAdminAnalyzeProduct), so a photo captured
 * by the bulk in-store flow and later analyzed from the PIM goes through
 * the exact same logic a live scan would.
 */
async function analyzeIngredientsCore(
  barcode: string,
  confirmedText: string,
  ocrConfidence: number,
  ocrLabelType: LabelType,
  env: Env,
  requestId: string,
  productTitle?: string,
  // Which route asked for this analysis, recorded on the version row. Both
  // callers run the identical pipeline, so this is the only thing that
  // distinguishes an admin re-analysis from a user's scan afterwards.
  versionSource: ProductVersionSource = "user_scan",
): Promise<IngredientsAnalysisOutcome> {
  // Single shared evaluation of the label text, identical to the OCR gate.
  const evaluation =
    evaluateLabelText(confirmedText);

  const analysisText =
    evaluation.ingredientText.length >= 15
      ? evaluation.ingredientText
      : confirmedText;

  // Deterministic extraction and validation of ingredient text. Uses the
  // real OCR confidence (not the trusted-threshold constant used below for
  // the ocrConfirmedIngredients gate) so extraction.confidence reflects how
  // reliable this specific read actually was, instead of always assuming
  // the best case.
  const extraction = extractIngredientText(
    analysisText,
    ocrConfidence,
  );

  const reasons = Array.isArray(
    extraction.reasons,
  )
    ? extraction.reasons
    : [];

  // Send the model only the isolated ingredient block when the validator
  // managed to isolate one (it strips marketing claims, storage/usage
  // instructions and manufacturer noise). Falls back to the broader
  // section text for the override path, where extraction.ingredientText is
  // null but the text is still allowed through on other evidence.
  const modelInputText =
    extraction.ingredientText ?? analysisText;

  const nutritionOnlyRejection =
    reasons.length > 0 &&
    reasons.every(isNutritionRejectionReason);

  // The OCR step may or may not forward its verdict. "mixed" means a label
  // that carries both an ingredient list and a nutrition table, which is
  // exactly the case that must be allowed through.
  const ocrSaysIngredients =
    ocrLabelType === "ingredients" ||
    ocrLabelType === "mixed";

  const ocrConfirmedIngredients =
    ocrSaysIngredients &&
    ocrConfidence >= trustedOcrConfidence;

  // Independent, deterministic evidence computed here on the server.
  // This does not depend on what the client chose to send.
  const textLooksLikeIngredients =
    evaluation.looksLikeIngredients &&
    !evaluation.isNutritionTable &&
    evaluation.numericUnitCount <
      nutritionNumericUnitThreshold;

  // Override a nutrition-only rejection when our own analysis of the text
  // disagrees with it, unless OCR explicitly said this is a nutrition table.
  const overrideNutritionRejection =
    !extraction.isValid &&
    nutritionOnlyRejection &&
    textLooksLikeIngredients &&
    ocrLabelType !== "nutrition";

  const overrideReason = !overrideNutritionRejection
    ? null
    : ocrConfirmedIngredients
      ? "ocr_confirmed_ingredients"
      : "server_text_evidence";

  // A nutrition-only rejection overridden by our own evidence is accepted
  // on strength proportional to *why* it was overridden: OCR itself having
  // confidently called this "ingredients" is strong corroborating evidence,
  // while disagreeing with the deterministic validator on text shape alone
  // is weaker. Feeding this through the same evaluateContentGate used below
  // (and by the nutrition/chemical paths) means there is exactly one place
  // that decides "confident enough to score" for every acceptance route,
  // instead of the override silently bypassing that decision.
  const effectiveExtraction = overrideNutritionRejection
    ? {
        isValid: true,
        confidence:
          overrideReason === "ocr_confirmed_ingredients"
            ? ocrConfidence
            : Math.min(ocrConfidence * 0.6, 0.6),
        reasons: [] as string[],
      }
    : extraction;

  const gate = evaluateContentGate(effectiveExtraction);

  console.log("ingredient_validation_diagnostics", {
    requestId,
    endpoint: "/api/analysis/run",
    ocrLabelType,
    ocrConfidence,
    confirmedTextLength: confirmedText.length,
    analysisTextLength: analysisText.length,
    sectionWasSliced: evaluation.sectionWasSliced,
    nutritionMarkerCount:
      evaluation.nutritionMarkerCount,
    numericUnitCount:
      evaluation.numericUnitCount,
    hasIngredientHeading:
      evaluation.hasIngredientHeading,
    looksLikeIngredients:
      evaluation.looksLikeIngredients,
    isNutritionTable:
      evaluation.isNutritionTable,
    validationValid: extraction.isValid === true,
    validationReasons: reasons,
    overrideApplied: overrideNutritionRejection,
    overrideReason,
    gatePassed: gate.passed,
    gateConfidence: gate.confidence,
  });

  // Single decision point: either this passes the gate and gets a full
  // score + allergen list + verdict, or it doesn't and the caller renders
  // only the reasons below — never both at once.
  if (!gate.passed) {
    console.log(
      "ingredient_validation_rejected",
      {
        requestId,
        reasons,
        gateReasons: gate.reasons,
        textLength: analysisText.length,
        ocrLabelType,
        ocrConfidence,
        nutritionMarkerCount:
          evaluation.nutritionMarkerCount,
        numericUnitCount:
          evaluation.numericUnitCount,
      },
    );

    return {
      ok: false,
      kind: "insufficient",
      reasons: extraction.isValid
        ? [
            "Δεν εντοπίστηκε ένδειξη «Συστατικά» στο κείμενο — η ανάγνωση μπορεί να είναι αβέβαιη. Ξαναφωτογράφισε την πίσω πλευρά της συσκευασίας.",
          ]
        : [
            "Δεν εντοπίστηκε λίστα συστατικών σε αυτή τη φωτογραφία. Ξαναφωτογράφισε την πίσω πλευρά της συσκευασίας.",
          ],
    };
  }

  if (overrideNutritionRejection) {
    console.log(
      "ingredient_validation_overridden",
      {
        requestId,
        reasons,
        overrideReason,
        ocrLabelType,
        ocrConfidence,
        analysisTextLength: analysisText.length,
        nutritionMarkerCount:
          evaluation.nutritionMarkerCount,
        numericUnitCount:
          evaluation.numericUnitCount,
      },
    );
  }

  // Deterministic filter: drops the product's own brand/title, legal/
  // origin boilerplate and meaningless short codes before this text ever
  // reaches the model, so none of it can be mistaken for an ingredient.
  const filtered = filterIrrelevantSegments(
    modelInputText,
    "ingredients",
    { productTitle },
  );

  const filteredModelInputText =
    filtered.text.trim().length >= 12
      ? filtered.text
      : modelInputText;

  if (filtered.removedSegments.length > 0) {
    console.log("ingredient_noise_filtered", {
      requestId,
      removedSegments: filtered.removedSegments,
    });
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
    "- Ignore any nutrition declaration values (energy, fat, carbohydrates, protein, vitamins with amounts).",
    "- If the provided text contains no actual ingredient names, return empty arrays and explain in insufficientDataReasons.",
    "- Ignore brand names, manufacturer/legal/country-of-origin text, and meaningless short codes or symbols — these are not ingredients.",
    "- Being a recognised EU allergen (gluten/cereals, milk, egg, sulphites, nuts, peanuts, sesame, soy, fish, crustaceans, molluscs, celery, mustard, lupin) is NOT by itself a problem.",
    '- For such an ingredient use severity "info" and describe what it is, not that it can cause an allergy — the app shows the allergen list separately.',
    "- Reserve attention/high_attention for a real problem: artificial additives, excessive sugar/salt/fat, a substance with a documented safety concern, or an undeclared quantity.",
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
    filteredModelInputText,
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
      return { ok: false, kind: "model_failed" };
    }

    const detectedType =
      detectProductType(analysisText);

    if (detectedType !== "unknown") {
      result.productType = detectedType;
    }

    // Fold every "Προσοχή σε [γάλα/σιτάρι/αυγό]" finding into one notice
    // *before* scoring, so the score sees them as the information they are
    // and the UI renders one line instead of four identical cards.
    const allergens = classifyAllergenFindings(
      result.ingredientFindings,
      (finding) => finding.ingredientName,
      result.potentialAllergens,
    );

    result.ingredientFindings = allergens.findings;

    result.attentionItems = withoutAllergenOnlyItems(
      result.attentionItems,
    );

    // No caveat to surface here any more: reaching this point already means
    // the content gate above passed, so there is no "shown despite shaky
    // evidence" state left to flag — a caller only ever sees a full score
    // (this path) or the gate's rejection reasons (the early return above),
    // never both.
    // Deductions come from the label text matched against curated rules, not
    // from the model's severities — see ingredientRules.ts for why.
    const ruleSet = await loadScoringRules(env.DB);

    const ruleMatches = matchScoringRules(
      analysisText,
      ruleSet,
    );

    console.log("scoring_rules_matched", {
      requestId,
      endpoint: "/api/analysis/run",
      aliasesLoaded: ruleSet.aliases.length,
      matched: ruleMatches.map((match) => ({
        ingredient: match.rule.normalizedName,
        position: match.position,
        points: match.weightedPoints,
      })),
    });

    const score = scoreInterpretation(
      analysisText,
      ocrConfidence,
      result,
      {
        extractionConfidence: gate.confidence,
        lowConfidenceReason: null,
        ruleMatches,
      },
    );

    // Explanation-only enrichment layer. It reads `result` (the AI's
    // findings) and `score` (the Worker's own deductions) but never
    // computes or overrides a score itself — see ingredientInsights.ts.
    const ingredientInsights = await buildIngredientInsights(
      result,
      score,
      env.DB,
      ruleMatches,
    );

    const executiveSummary = buildExecutiveSummary(
      result,
      score,
      ingredientInsights,
    );

    const responseBody = {
      ...result,
      score,
      ingredientInsights,
      executiveSummary,
      allergenNotice: allergens.notice,
      contentCategory: "ingredients" as const,
      // The exact text the score was computed from. Persisted so the PIM
      // can recompute the score after an edit without re-running OCR, and
      // so a stored score stays reproducible from its own input.
      sourceText: analysisText,
    };

    // Only cache a genuinely complete, scored result — score.score can
    // still be null here (insufficient_data band) even after a valid AI
    // parse, e.g. on shaky OCR confidence, and that verdict is about this
    // particular photo, not the product itself. Caching it would freeze a
    // future, much clearer scan of the same barcode into the same
    // "insufficient data" answer forever.
    if (score.score !== null) {
      await saveProductResult(env.DB, {
        barcode,
        productName: productTitle ?? null,
        category: "ingredients",
        analysisResult: responseBody,
        versionSource,
      });
    }

    return { ok: true, responseBody };
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

    return { ok: false, kind: "exception" };
  }
}

async function runIngredientsAnalysis(
  requestBody: AnalysisRequestBody,
  confirmedText: string,
  env: Env,
  origin: string | null,
  requestId: string,
): Promise<Response> {
  const outcome = await analyzeIngredientsCore(
    requestBody.barcode,
    confirmedText,
    requestBody.ocrConfidence,
    requestBody.ocrLabelType ?? "unknown",
    env,
    requestId,
    requestBody.productTitle,
  );

  if (!outcome.ok) {
    if (outcome.kind === "insufficient") {
      return insufficientResponse(
        outcome.reasons,
        requestBody.ocrConfidence,
        env.DB,
        origin,
        requestId,
      );
    }

    return error(
      outcome.kind === "model_failed"
        ? "Η ανάλυση δεν ολοκληρώθηκε αξιόπιστα. Δοκιμάστε ξανά."
        : "Η ανάλυση δεν ολοκληρώθηκε. Δοκιμάστε ξανά.",
      502,
      origin,
      requestId,
    );
  }

  return json(
    outcome.responseBody,
    200,
    origin,
    requestId,
  );
}

type NutritionAnalysisOutcome =
  | {
      ok: true;
      responseBody: WorkerNutritionResult & {
        score: WorkerScore;
        nutritionInsights: NutritionInsight[];
        executiveSummary: ExecutiveSummary;
        allergenNotice: AllergenNotice | null;
        contentCategory: "nutrition";
      };
    }
  | { ok: false; kind: "insufficient"; reasons: string[] }
  | { ok: false; kind: "model_failed" }
  | { ok: false; kind: "exception" };

/**
 * Same role as analyzeIngredientsCore, for the nutrition path — shared by
 * the live endpoint (runNutritionAnalysis, a thin wrapper) and the admin
 * re-analyze endpoint.
 */
async function analyzeNutritionCore(
  barcode: string,
  confirmedText: string,
  ocrConfidence: number,
  env: Env,
  requestId: string,
  productTitle?: string,
  versionSource: ProductVersionSource = "user_scan",
): Promise<NutritionAnalysisOutcome> {
  const extraction = extractNutritionData(
    confirmedText,
    ocrConfidence,
  );

  // Same shared decision point as the ingredients path: pass, or render
  // only the reasons below — never a score alongside a low-confidence
  // message.
  const gate = evaluateContentGate(extraction);

  if (!gate.passed) {
    console.log("nutrition_validation_rejected", {
      requestId,
      reasons: extraction.reasons,
      gateReasons: gate.reasons,
      textLength: confirmedText.length,
      ocrConfidence,
    });

    return {
      ok: false,
      kind: "insufficient",
      reasons: gate.reasons,
    };
  }

  const modelInputText =
    extraction.nutritionText ?? confirmedText;

  const filtered = filterIrrelevantSegments(
    modelInputText,
    "nutrition",
    { productTitle },
  );

  const filteredModelInputText =
    filtered.text.trim().length >= 12
      ? filtered.text
      : modelInputText;

  if (filtered.removedSegments.length > 0) {
    console.log("nutrition_noise_filtered", {
      requestId,
      removedSegments: filtered.removedSegments,
    });
  }

  const prompt = [
    "Analyze the confirmed nutrition information below.",
    "",
    "Return ONLY this exact JSON structure:",
    "{",
    '  "subtype": "human_food",',
    '  "summary": "short neutral summary in Greek",',
    '  "positives": ["short Greek phrase"],',
    '  "attentionItems": ["short Greek phrase"],',
    '  "nutritionFindings": [',
    "    {",
    '      "nutrient": "Ζάχαρη",',
    '      "normalizedName": "sugar",',
    '      "amount": "12g ανά 100g",',
    '      "severity": "attention",',
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
    "- subtype must be exactly one of: human_food, pet_food, unknown.",
    "- Infer subtype from the text itself (mentions of dogs/cats/pet food vs ordinary human nutrition facts).",
    "- severity must be exactly one of: positive, info, attention, high_attention, unknown.",
    "- evidenceType must be exactly one of: regulatory, scientific, label, none.",
    "- confidence must be a number between 0 and 1.",
    "- sourceName and sourceUrl must be null unless you have verified evidence.",
    '- amount should carry the value and unit exactly as printed (e.g. "12g", "450 kcal ανά 100g"), or null if not given.',
    "",
    "Content rules:",
    "- Only analyze nutrients/values that appear in the provided text.",
    "- Never invent nutrients that are not in the provided text.",
    "- Flag high sugar, high saturated fat, high salt/sodium and artificial additives (E-numbers) as attention or high_attention with a clear Greek explanation.",
    "- Ignore brand names, manufacturer/legal/country-of-origin text, and meaningless short codes or symbols — these are not nutrients.",
    "- Judge criteria appropriate to the inferred subtype — pet food and human food have different healthy ranges; do not apply human dietary guidance to pet food or vice versa.",
    '- Being a recognised EU allergen (gluten/cereals, milk, egg, sulphites, nuts, peanuts, sesame, soy, fish, crustaceans, molluscs, celery, mustard, lupin) is NOT by itself a problem: use severity "info" for it, since the app shows the allergen list separately.',
    "- Do not calculate a score.",
    "- Do not claim unconditional product safety.",
    "- Do not provide medical advice.",
    "- Do not make pregnancy or child-safety conclusions.",
    "- Do not invent regulatory status, source names or URLs.",
    '- Use severity "unknown" and evidenceType "none" when evidence is unavailable.',
    "- Write summary, title and explanation in Greek.",
    "- Include between 4 and 12 entries in nutritionFindings, covering every value present in the text.",
    "- Keep title under 40 characters.",
    "- Keep explanation under 120 characters.",
    "- Return ONLY the JSON object. No commentary. No Markdown. No code fences.",
    "",
    "Confirmed nutrition information:",
    filteredModelInputText,
  ].join("\n");

  try {
    const startedAt = Date.now();

    const modelOutput = await env.AI.run(textModel, {
      messages: [
        {
          role: "system",
          content:
            "You are a nutrition analysis assistant. You always return a single valid JSON object and nothing else.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      max_tokens: 2048,
      temperature: 0.2,
    });

    const modelText = extractModelText(modelOutput);
    const cleanedText = modelText ? stripCodeFences(modelText) : null;

    const result =
      parseNutritionAnalysis(modelOutput) ??
      (cleanedText ? parseNutritionAnalysis(cleanedText) : null);

    console.log("nutrition_analysis_model_completed", {
      requestId,
      model: textModel,
      durationMs: Date.now() - startedAt,
      parsed: result !== null,
      findings: result?.nutritionFindings?.length ?? 0,
      extractedLength: modelText?.length ?? 0,
    });

    if (!result) {
      return { ok: false, kind: "model_failed" };
    }

    // Identical allergen handling to the ingredients path, so a nutrition
    // label never penalises or repeats a declared allergen either.
    const allergens = classifyAllergenFindings(
      result.nutritionFindings,
      (finding) => finding.nutrient,
    );

    result.nutritionFindings = allergens.findings;

    result.attentionItems = withoutAllergenOnlyItems(
      result.attentionItems,
    );

    const score = scoreNutrition(
      modelInputText,
      ocrConfidence,
      result,
      { extractionConfidence: extraction.confidence },
    );

    const nutritionInsights = buildNutritionInsights(
      result,
      score,
    );

    const executiveSummary = buildNutritionExecutiveSummary(
      result,
      score,
    );

    const responseBody = {
      ...result,
      score,
      nutritionInsights,
      executiveSummary,
      allergenNotice: allergens.notice,
      contentCategory: "nutrition" as const,
    };

    // See the matching comment in runIngredientsAnalysis: score.score can
    // be null (insufficient_data) on a valid parse with shaky evidence,
    // and that's a fact about this scan, not the product.
    if (score.score !== null) {
      await saveProductResult(env.DB, {
        barcode,
        productName: productTitle ?? null,
        category: "nutrition",
        analysisResult: responseBody,
        versionSource,
      });
    }

    return { ok: true, responseBody };
  } catch (caughtError) {
    console.error("nutrition_analysis_run_failed", {
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

    return { ok: false, kind: "exception" };
  }
}

async function runNutritionAnalysis(
  requestBody: AnalysisRequestBody,
  confirmedText: string,
  env: Env,
  origin: string | null,
  requestId: string,
): Promise<Response> {
  const outcome = await analyzeNutritionCore(
    requestBody.barcode,
    confirmedText,
    requestBody.ocrConfidence,
    env,
    requestId,
    requestBody.productTitle,
  );

  if (!outcome.ok) {
    if (outcome.kind === "insufficient") {
      return nutritionInsufficientResponse(
        outcome.reasons,
        requestBody.ocrConfidence,
        origin,
        requestId,
      );
    }

    return error(
      outcome.kind === "model_failed"
        ? "Η ανάλυση δεν ολοκληρώθηκε αξιόπιστα. Δοκιμάστε ξανά."
        : "Η ανάλυση δεν ολοκληρώθηκε. Δοκιμάστε ξανά.",
      502,
      origin,
      requestId,
    );
  }

  return json(
    outcome.responseBody,
    200,
    origin,
    requestId,
  );
}

async function runChemicalAnalysisPath(
  requestBody: AnalysisRequestBody,
  confirmedText: string,
  env: Env,
  origin: string | null,
  requestId: string,
): Promise<Response> {
  const ocrConfidence = requestBody.ocrConfidence;

  const extraction = extractChemicalComposition(
    confirmedText,
    ocrConfidence,
  );

  // Same shared decision point as the ingredients/nutrition paths.
  const gate = evaluateContentGate(extraction);

  if (!gate.passed) {
    console.log("chemical_validation_rejected", {
      requestId,
      reasons: extraction.reasons,
      gateReasons: gate.reasons,
      textLength: confirmedText.length,
      ocrConfidence,
    });

    return chemicalInsufficientResponse(
      gate.reasons,
      ocrConfidence,
      origin,
      requestId,
    );
  }

  const modelInputText =
    extraction.chemicalText ?? confirmedText;

  // No short-code filtering here — bare element symbols (Pb, Ca, Fe...) are
  // this category's actual content, not noise.
  const filtered = filterIrrelevantSegments(
    modelInputText,
    "chemical_composition",
    { productTitle: requestBody.productTitle },
  );

  const filteredModelInputText =
    filtered.text.trim().length >= 12
      ? filtered.text
      : modelInputText;

  if (filtered.removedSegments.length > 0) {
    console.log("chemical_noise_filtered", {
      requestId,
      removedSegments: filtered.removedSegments,
    });
  }

  const prompt = [
    "Analyze the confirmed chemical composition data below.",
    "",
    "Return ONLY this exact JSON structure:",
    "{",
    '  "sourceType": "drinking_water",',
    '  "summary": "short neutral summary in Greek",',
    '  "positives": ["short Greek phrase"],',
    '  "attentionItems": ["short Greek phrase"],',
    '  "chemicalFindings": [',
    "    {",
    '      "substance": "Νιτρικά (NO3)",',
    '      "normalizedName": "nitrate",',
    '      "concentration": "12 mg/L",',
    '      "referenceLimit": "≤ 50 mg/L (EU 2020/2184)",',
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
    "- sourceType must be exactly one of: drinking_water, mineral_water, raw_material, unknown.",
    "- Infer sourceType from the text itself.",
    "- severity must be exactly one of: positive, info, attention, high_attention, unknown.",
    "- evidenceType must be exactly one of: regulatory, scientific, label, none.",
    "- confidence must be a number between 0 and 1.",
    "- sourceName and sourceUrl must be null unless you have verified evidence.",
    '- concentration should carry the value and unit exactly as printed (e.g. "12 mg/L"), or null if not given.',
    "- referenceLimit must be null unless you have verified, cite-worthy evidence for a real safety/regulatory limit for that exact substance and sourceType — never invent a plausible-sounding number.",
    "",
    "Content rules:",
    "- Only analyze elements/compounds that appear in the provided text.",
    "- Never invent substances that are not in the provided text.",
    "- Ignore brand names and manufacturer/legal/country-of-origin text — these are not chemical substances.",
    "- Flag concentrations that exceed a well-established safety/regulatory limit as attention or high_attention, citing the limit in referenceLimit and explanation when you do.",
    "- When you are not certain a concentration is unsafe, use severity info or unknown rather than attention — do not guess at toxicity.",
    "- Do not calculate a score.",
    "- Do not claim unconditional product safety.",
    "- Do not provide medical advice.",
    "- Do not invent regulatory status, source names or URLs.",
    '- Use severity "unknown" and evidenceType "none" when evidence is unavailable.',
    "- Write summary, title and explanation in Greek.",
    "- Include between 3 and 12 entries in chemicalFindings, covering every value present in the text.",
    "- Keep title under 40 characters.",
    "- Keep explanation under 120 characters.",
    "- Return ONLY the JSON object. No commentary. No Markdown. No code fences.",
    "",
    "Confirmed chemical composition data:",
    filteredModelInputText,
  ].join("\n");

  try {
    const startedAt = Date.now();

    const modelOutput = await env.AI.run(textModel, {
      messages: [
        {
          role: "system",
          content:
            "You are a chemical composition analysis assistant. You always return a single valid JSON object and nothing else.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      max_tokens: 2048,
      temperature: 0.2,
    });

    const modelText = extractModelText(modelOutput);
    const cleanedText = modelText ? stripCodeFences(modelText) : null;

    const result =
      parseChemicalAnalysis(modelOutput) ??
      (cleanedText ? parseChemicalAnalysis(cleanedText) : null);

    console.log("chemical_analysis_model_completed", {
      requestId,
      model: textModel,
      durationMs: Date.now() - startedAt,
      parsed: result !== null,
      findings: result?.chemicalFindings?.length ?? 0,
      extractedLength: modelText?.length ?? 0,
    });

    if (!result) {
      return error(
        "Η ανάλυση δεν ολοκληρώθηκε αξιόπιστα. Δοκιμάστε ξανά.",
        502,
        origin,
        requestId,
      );
    }

    // A chemical composition label lists substances, so it resolves against
    // the same curated rule table the ingredients path uses.
    const chemicalRuleSet = await loadScoringRules(env.DB);

    const score = scoreChemicalComposition(
      modelInputText,
      ocrConfidence,
      result,
      {
        extractionConfidence: extraction.confidence,
        ruleMatches: matchScoringRules(
          modelInputText,
          chemicalRuleSet,
        ),
      },
    );

    const chemicalInsights = buildChemicalInsights(
      result,
      score,
    );

    const executiveSummary = buildChemicalExecutiveSummary(
      result,
      score,
    );

    const responseBody = {
      ...result,
      score,
      chemicalInsights,
      executiveSummary,
      contentCategory: "chemical_composition" as const,
    };

    // See the matching comment in runIngredientsAnalysis: score.score can
    // be null (insufficient_data) on a valid parse with shaky evidence,
    // and that's a fact about this scan, not the product.
    if (score.score !== null) {
      await saveProductResult(env.DB, {
        barcode: requestBody.barcode,
        category: "chemical_composition",
        analysisResult: responseBody,
      });
    }

    return json(
      responseBody,
      200,
      origin,
      requestId,
    );
  } catch (caughtError) {
    console.error("chemical_analysis_run_failed", {
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

  const barcode =
    readTextField(
      formData,
      "barcode",
    );

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
    let identity: ProductIdentity | null = null;

    // Try barcode lookup first if provided
    if (barcode) {
      const lookupStarted = Date.now();
      const barcodeResult =
        await lookupProductByBarcode(barcode);

      console.log(
        "product_lookup_completed",
        {
          requestId,
          provider: barcodeResult.source,
          durationMs: Date.now() - lookupStarted,
          found: barcodeResult.source !== null,
          hasName: Boolean(
            barcodeResult.productName,
          ),
          hasBrand: Boolean(
            barcodeResult.brand,
          ),
        },
      );

      if (barcodeResult.source) {
        identity = barcodeResult;
      }
    }

    // Fall back to AI if barcode lookup didn't find result
    if (!identity) {
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
          max_tokens: 256,
          stream: false,
        },
      );

      identity =
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
    }

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
    "βιταμινη d",
    "βιταμίνη d",
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

function countNutritionMarkers(
  value: string,
): number {
  const normalized = value.toLowerCase();

  return nutritionMarkers.filter((marker) =>
    normalized.includes(marker),
  ).length;
}

// Nutrition tables always carry numeric values with units next to the markers.
// Ingredient lists mention the same words without measurement pairs.
function countNumericUnits(
  value: string,
): number {
  const normalized = value.toLowerCase();

  const matches =
    normalized.match(
      /\d+(?:[.,]\d+)?\s*(kcal|kj|mg|µg|μg|g\b|γρ|ml|%)/g,
    ) ?? [];

  return matches.length;
}

function hasIngredientHeading(
  value: string,
): boolean {
  return /(συστατικ[άα]|ingredients|ingr\.|inci)/i.test(
    value,
  );
}

// Isolates the ingredient part of a full label scan so that an adjacent
// nutrition declaration cannot poison the validation.
function extractIngredientSection(
  value: string,
): { text: string; sliced: boolean } {
  const headingPattern =
    /(συστατικ[άα]|ingredients|ingr\.|inci)\s*[:\-–]?/i;

  const headingMatch =
    headingPattern.exec(value);

  let sliced = false;
  let section = value;

  if (headingMatch && headingMatch.index > 0) {
    section = value.slice(headingMatch.index);
    sliced = true;
  }

  const nutritionHeadingPattern =
    /(διατροφικ[ήη]\s+(δήλωση|αξία|πληροφορ)|nutrition\s+(declaration|information|facts)|αν[άα]\s*100\s*(g|gr|γρ|ml)|per\s*100\s*(g|ml))/i;

  const nutritionMatch =
    nutritionHeadingPattern.exec(section);

  // Cut the trailing nutrition block only when a meaningful ingredient
  // part precedes it. If the nutrition block comes first, nothing is cut
  // and the real nutrition-table protection stays active.
  if (
    nutritionMatch &&
    nutritionMatch.index > 40
  ) {
    section = section.slice(
      0,
      nutritionMatch.index,
    );

    sliced = true;
  }

  return {
    text: section.trim(),
    sliced,
  };
}

function evaluateLabelText(
  value: string,
): LabelEvaluation {
  const section = extractIngredientSection(value);

  const text =
    section.text.length >= 15
      ? section.text
      : value.trim();

  const markerCount =
    countNutritionMarkers(text);

  const numericUnitCount =
    countNumericUnits(text);

  const headingPresent =
    hasIngredientHeading(text);

  const looksLikeIngredients =
    !isHeadingOnlyText(text) &&
    looksLikeIngredientList(text);

  // A real nutrition table needs both vocabulary and measured values.
  // Ingredient lists that merely mention "βιταμίνη C" are no longer rejected.
  const isNutrition =
    markerCount >= 2 &&
    numericUnitCount >=
      nutritionNumericUnitThreshold &&
    !(headingPresent && looksLikeIngredients);

  return {
    ingredientText: text,
    nutritionMarkerCount: markerCount,
    numericUnitCount,
    hasIngredientHeading: headingPresent,
    looksLikeIngredients,
    isNutritionTable: isNutrition,
    sectionWasSliced: section.sliced,
  };
}

function isNutritionRejectionReason(
  reason: unknown,
): boolean {
  if (typeof reason !== "string") {
    return false;
  }

  const normalized = reason.toLowerCase();

  return (
    normalized.includes("διατροφικ") ||
    normalized.includes("nutrition")
  );
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
