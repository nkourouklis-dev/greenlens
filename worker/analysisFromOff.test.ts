import assert from "node:assert/strict";
import test from "node:test";
import worker from "./index";

/**
 * The OFF-skip path end to end through the real router: a complete Open Food
 * Facts record becomes a scored result with no photograph, and — the point of
 * the test — no Azure call and no Workers AI call anywhere on the way.
 */

const BARCODE = "5201234567890";

const OFF_PRODUCT = {
  code: BARCODE,
  product: {
    product_name: "Μπισκότα βρώμης",
    brands: "Δοκιμή",
    quantity: "200 g",
    ingredients_text_el:
      "Αλεύρι σίτου, νιφάδες βρώμης 20%, φυτικό λάδι (ηλιέλαιο), ζάχαρη, αλάτι",
    nutriscore_grade: "c",
    categories_tags: ["en:biscuits"],
    nutriments: {
      "energy-kj_100g": 1900,
      "energy-kcal_100g": 454,
      fat_100g: 18,
      "saturated-fat_100g": 3,
      carbohydrates_100g: 63,
      sugars_100g: 14,
      fiber_100g: 5,
      proteins_100g: 7,
      salt_100g: 0.7,
    },
  },
};

interface Harness {
  env: Record<string, unknown>;
  calls: { ai: number; azure: number; off: number; other: string[] };
  stored: { sql: string; bound: unknown[] }[];
  restore(): void;
}

function harness(offBody: unknown): Harness {
  const calls = { ai: 0, azure: 0, off: 0, other: [] as string[] };
  const stored: { sql: string; bound: unknown[] }[] = [];

  const db = {
    prepare(sql: string) {
      let bound: unknown[] = [];
      const statement = {
        bind(...values: unknown[]) {
          bound = values;
          return statement;
        },
        async first() {
          return null;
        },
        async all() {
          return { results: [] };
        },
        async raw() {
          return [];
        },
        async run() {
          stored.push({ sql, bound });
          return { success: true };
        },
      };
      return statement;
    },
    async batch() {
      return [];
    },
  };

  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input instanceof Request ? input.url : input);

    if (url.includes("openfoodfacts.org")) {
      calls.off += 1;
      return new Response(JSON.stringify(offBody), { status: 200 });
    }

    if (url.includes("openbeautyfacts.org")) {
      calls.off += 1;
      return new Response(JSON.stringify({ status: 0 }), { status: 200 });
    }

    if (/azure|cognitiveservices|microsoft/i.test(url)) {
      calls.azure += 1;
    } else {
      calls.other.push(url);
    }

    throw new Error(`unexpected network call: ${url}`);
  }) as typeof fetch;

  const env = {
    DB: db,
    AI: {
      async run() {
        calls.ai += 1;
        throw new Error("Workers AI must not be called on the OFF path");
      },
    },
    PHOTOS: {},
    AZURE_VISION_ENDPOINT: "https://example.cognitiveservices.azure.com",
    AZURE_VISION_KEY: "key",
    ADMIN_PASSWORD: "secret",
  };

  return {
    env,
    calls,
    stored,
    restore() {
      globalThis.fetch = originalFetch;
    },
  };
}

async function call(
  h: Harness,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  return worker.fetch(
    new Request(`https://api.test${path}`, {
      ...init,
      headers: {
        Origin: "https://greenlens.stoaops.com",
        ...(init?.headers ?? {}),
      },
    }),
    h.env as never,
    { waitUntil() {} } as never,
  );
}

test("availability reports a complete OFF record and calls nothing paid", async () => {
  const h = harness(OFF_PRODUCT);

  try {
    const response = await call(h, `/api/product/off/${BARCODE}`);
    const body = (await response.json()) as {
      availability: Record<string, unknown>;
      ingredientsText: string | null;
    };

    assert.equal(response.status, 200);
    assert.deepEqual(body.availability, {
      ingredients: true,
      nutrition: true,
      nutriScore: true,
      source: "openfoodfacts",
    });
    assert.match(body.ingredientsText ?? "", /βρώμης/);
    assert.equal(h.calls.ai, 0);
    assert.equal(h.calls.azure, 0);
  } finally {
    h.restore();
  }
});

test("a complete record is scored from OFF data with zero Azure or AI calls", async () => {
  const h = harness(OFF_PRODUCT);

  try {
    const response = await call(h, "/api/analysis/from-off", {
      method: "POST",
      body: JSON.stringify({ barcode: BARCODE }),
    });

    const body = (await response.json()) as {
      score: { score: number | null };
      dataSource?: string;
      nutritionSource?: string;
      contentCategory: string;
    };

    assert.equal(response.status, 200, JSON.stringify(body));
    assert.equal(body.contentCategory, "ingredients");
    assert.equal(body.dataSource, "off");
    assert.equal(body.nutritionSource, "openfoodfacts");
    assert.ok(typeof body.score.score === "number");

    assert.equal(h.calls.ai, 0, "no Workers AI call");
    assert.equal(h.calls.azure, 0, "no Azure call");
    assert.deepEqual(h.calls.other, [], "no other network call");

    // The OFF text is not stored as if it were OCR output.
    assert.equal(
      h.stored.some((entry) => /product_ocr/.test(entry.sql)),
      false,
    );
  } finally {
    h.restore();
  }
});

test("an incomplete record is refused so the client keeps the photo flow", async () => {
  const { nutriments: _omit, ...withoutNutrition } = OFF_PRODUCT.product;
  const h = harness({ code: BARCODE, product: withoutNutrition });

  try {
    const response = await call(h, "/api/analysis/from-off", {
      method: "POST",
      body: JSON.stringify({ barcode: BARCODE }),
    });

    assert.equal(response.status, 422);
    assert.equal(h.calls.ai, 0);
    assert.equal(h.calls.azure, 0);
  } finally {
    h.restore();
  }
});

test("an OFF outage answers 'nothing available', never an error", async () => {
  const h = harness(OFF_PRODUCT);
  const original = globalThis.fetch;

  globalThis.fetch = (async () => {
    throw new Error("network down");
  }) as typeof fetch;

  try {
    const response = await call(h, `/api/product/off/${BARCODE}`);
    const body = (await response.json()) as {
      availability: { ingredients: boolean; nutrition: boolean };
    };

    assert.equal(response.status, 200);
    assert.equal(body.availability.ingredients, false);
    assert.equal(body.availability.nutrition, false);
  } finally {
    globalThis.fetch = original;
    h.restore();
  }
});

test("a bad barcode is rejected", async () => {
  const h = harness(OFF_PRODUCT);

  try {
    const response = await call(h, "/api/analysis/from-off", {
      method: "POST",
      body: JSON.stringify({ barcode: "abc" }),
    });

    assert.equal(response.status, 400);
    assert.equal(h.calls.off, 0);
  } finally {
    h.restore();
  }
});
