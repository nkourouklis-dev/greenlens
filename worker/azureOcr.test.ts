import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import {
  AzureOcrError,
  assertAzureOcrConfigured,
  extractWithAzureOcr,
  type AzureOcrErrorCode,
} from "./azureOcr";

const realFetch = globalThis.fetch;
const realConsoleError = console.error;

afterEach(() => {
  globalThis.fetch = realFetch;
  console.error = realConsoleError;
});

const image = new File(["x"], "label.jpg", { type: "image/jpeg" });
const ENDPOINT = "https://example.cognitiveservices.azure.com/";
const KEY = "secret-key-value";

function mockFetch(status: number, body: unknown) {
  globalThis.fetch = (async () =>
    new Response(JSON.stringify(body), { status })) as typeof fetch;
}

async function failure(): Promise<AzureOcrError> {
  try {
    await extractWithAzureOcr(image, ENDPOINT, KEY);
  } catch (caught) {
    assert.ok(caught instanceof AzureOcrError, String(caught));

    return caught;
  }

  assert.fail("expected extractWithAzureOcr to throw");
}

const statusCases: Array<[number, AzureOcrErrorCode, number]> = [
  [401, "ocr_credentials_rejected", 502],
  [403, "ocr_access_blocked", 502],
  [404, "ocr_endpoint_not_found", 502],
  [429, "ocr_rate_limited", 429],
  [500, "ocr_unavailable", 503],
  [503, "ocr_unavailable", 503],
  [400, "ocr_failed", 502],
];

for (const [status, code, httpStatus] of statusCases) {
  test(`maps Azure ${status} to ${code}`, async () => {
    console.error = () => {};
    mockFetch(status, { error: { code: "X", message: "provider text" } });

    const error = await failure();

    assert.equal(error.code, code);
    assert.equal(error.httpStatus, httpStatus);
  });
}

test("logs Azure status and code but never the key", async () => {
  const logged: unknown[][] = [];
  console.error = (...args: unknown[]) => {
    logged.push(args);
  };
  mockFetch(401, {
    error: { code: "401", message: "Access denied due to invalid subscription key" },
  });

  await failure();

  const entry = logged.find((args) => args[0] === "azure_ocr_http_error");
  assert.ok(entry);
  const details = entry[1] as Record<string, unknown>;
  assert.equal(details.status, 401);
  assert.equal(details.ocrCode, "ocr_credentials_rejected");
  assert.equal(details.providerCode, "401");
  assert.ok(!JSON.stringify(logged).includes(KEY));
});

test("401 and 403 have different messages", async () => {
  console.error = () => {};
  mockFetch(401, {});
  const unauthorized = await failure();
  mockFetch(403, {});
  const forbidden = await failure();

  assert.notEqual(unauthorized.message, forbidden.message);
});

test("a network failure maps to ocr_network", async () => {
  globalThis.fetch = (async () => {
    throw new TypeError("fetch failed");
  }) as typeof fetch;

  assert.equal((await failure()).code, "ocr_network");
});

test("an aborted request maps to ocr_timeout", async () => {
  globalThis.fetch = (async () => {
    throw new DOMException("aborted", "AbortError");
  }) as typeof fetch;

  assert.equal((await failure()).code, "ocr_timeout");
});

test("a 200 with no text maps to ocr_no_text", async () => {
  mockFetch(200, { readResult: { blocks: [] } });

  assert.equal((await failure()).code, "ocr_no_text");
});

test("missing key or endpoint fails before any request is sent", async () => {
  let called = false;
  globalThis.fetch = (async () => {
    called = true;

    return new Response("{}");
  }) as typeof fetch;

  for (const [endpoint, key] of [
    [ENDPOINT, ""],
    [ENDPOINT, "   "],
    ["", KEY],
  ]) {
    await assert.rejects(
      extractWithAzureOcr(image, endpoint, key),
      (caught: unknown) =>
        caught instanceof AzureOcrError && caught.code === "ocr_not_configured",
    );
  }

  assert.equal(called, false);
});

test("assertAzureOcrConfigured accepts a complete configuration", () => {
  assert.doesNotThrow(() => assertAzureOcrConfigured(ENDPOINT, KEY));
  assert.throws(() => assertAzureOcrConfigured(undefined, KEY));
  assert.throws(() => assertAzureOcrConfigured(ENDPOINT, undefined));
});
