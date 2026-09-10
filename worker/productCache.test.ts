import assert from "node:assert/strict";
import test from "node:test";
import {
  lookupCachedProduct,
  incrementProductScanCount,
  saveProductResult,
  type D1Like,
  type D1PreparedStatementLike,
} from "./productCache";

interface FakeRow {
  barcode: string;
  product_name: string | null;
  category: string;
  analysis_result: string;
  status: string;
  source: string;
  scan_count: number;
}

interface FakeVersion {
  barcode: string;
  source: string;
  applied: number;
}

/**
 * Minimal in-memory stand-in for the `products` table, covering exactly the
 * query shapes productCache.ts issues: SELECT-by-barcode (first()), UPDATE
 * scan_count (run()), the INSERT ... ON CONFLICT upsert (run()), and the
 * product_versions INSERT the save path appends. Good enough to test the
 * module's logic without a real D1Database, which can't be constructed
 * under plain Node (tsx --test).
 */
function createFakeDb(
  rows: Map<string, FakeRow> = new Map(),
  versions: FakeVersion[] = [],
): D1Like {
  return {
    prepare(sql: string): D1PreparedStatementLike {
      const isSelect = sql.trimStart().startsWith("SELECT");
      const isUpdate = sql.trimStart().startsWith("UPDATE");
      const isVersionInsert = sql.includes("product_versions");
      const isInsert =
        sql.trimStart().startsWith("INSERT") && !isVersionInsert;

      const statement: D1PreparedStatementLike = {
        bind(...values: unknown[]): D1PreparedStatementLike {
          return {
            bind: statement.bind,
            async first<T>() {
              if (!isSelect) {
                return null;
              }

              const barcode = values[0] as string;
              const row = rows.get(barcode);
              return (row ?? null) as T | null;
            },
            async run() {
              if (isVersionInsert) {
                const [barcode, source] = values as [string, string];

                versions.push({
                  barcode,
                  source,
                  applied: values[7] as number,
                });

                return { success: true };
              }

              if (isUpdate) {
                const barcode = values[values.length - 1] as string;
                const row = rows.get(barcode);

                if (row) {
                  row.scan_count += 1;
                }

                return { success: true };
              }

              if (isInsert) {
                const [barcode, productName, category, analysisResult] =
                  values as [string, string | null, string, string];

                const existing = rows.get(barcode);

                if (existing && existing.status === "verified") {
                  return { success: true };
                }

                rows.set(barcode, {
                  barcode,
                  // Mirrors the COALESCE in the real upsert.
                  product_name: productName ?? existing?.product_name ?? null,
                  category,
                  analysis_result: analysisResult,
                  status: existing?.status ?? "ai_generated",
                  source: existing?.source ?? "user_scan",
                  scan_count: existing?.scan_count ?? 1,
                });

                return { success: true };
              }

              return { success: true };
            },
          };
        },
        first<T>() {
          return statement.bind().first<T>();
        },
        run() {
          return statement.bind().run();
        },
      };

      return statement;
    },
  };
}

const sampleResult = {
  productType: "cosmetic",
  score: { score: 82, band: "good" },
  contentCategory: "ingredients",
};

test("cache hit: returns the stored result without recomputation and reports the right shape", async () => {
  const db = createFakeDb(
    new Map([
      [
        "5202399414023",
        {
          barcode: "5202399414023",
          product_name: null,
          category: "ingredients",
          analysis_result: JSON.stringify(sampleResult),
          status: "ai_generated",
          source: "user_scan",
          scan_count: 3,
        },
      ],
    ]),
  );

  const cached = await lookupCachedProduct(db, "5202399414023");

  assert.ok(cached, "expected a cache hit");
  assert.equal(cached?.category, "ingredients");
  assert.equal(cached?.scanCount, 3);
  assert.deepEqual(cached?.analysisResult, sampleResult);
});

test("cache miss: an unseen barcode returns null", async () => {
  const db = createFakeDb();

  const cached = await lookupCachedProduct(db, "0000000000000");

  assert.equal(cached, null);
});

test("cache miss then save: the barcode is a hit on the next lookup", async () => {
  const db = createFakeDb();

  const before = await lookupCachedProduct(db, "5202399414023");
  assert.equal(before, null, "expected a miss before saving");

  await saveProductResult(db, {
    barcode: "5202399414023",
    category: "ingredients",
    analysisResult: sampleResult,
  });

  const after = await lookupCachedProduct(db, "5202399414023");
  assert.ok(after, "expected a hit after saving");
  assert.equal(after?.category, "ingredients");
  assert.equal(after?.status, "ai_generated");
  assert.equal(after?.source, "user_scan");
  assert.deepEqual(after?.analysisResult, sampleResult);
});

test("incrementProductScanCount bumps the stored count", async () => {
  const db = createFakeDb(
    new Map([
      [
        "5202399414023",
        {
          barcode: "5202399414023",
          product_name: null,
          category: "ingredients",
          analysis_result: JSON.stringify(sampleResult),
          status: "ai_generated",
          source: "user_scan",
          scan_count: 1,
        },
      ],
    ]),
  );

  await incrementProductScanCount(db, "5202399414023");
  const after = await lookupCachedProduct(db, "5202399414023");

  assert.equal(after?.scanCount, 2);
});

test("a verified entry survives a routine rescan save", async () => {
  const db = createFakeDb(
    new Map([
      [
        "5202399414023",
        {
          barcode: "5202399414023",
          product_name: "Herbarium Antiseptic Gel",
          category: "ingredients",
          analysis_result: JSON.stringify(sampleResult),
          status: "verified",
          source: "user_scan",
          scan_count: 10,
        },
      ],
    ]),
  );

  await saveProductResult(db, {
    barcode: "5202399414023",
    category: "ingredients",
    analysisResult: { ...sampleResult, score: { score: 40, band: "attention" } },
  });

  const after = await lookupCachedProduct(db, "5202399414023");

  assert.equal(after?.status, "verified");
  assert.deepEqual(after?.analysisResult, sampleResult);
});

test("lookup falls back to no-cache on a D1 failure instead of throwing", async () => {
  const throwingDb: D1Like = {
    prepare() {
      throw new Error("simulated D1 outage");
    },
  };

  const cached = await lookupCachedProduct(throwingDb, "5202399414023");

  assert.equal(cached, null);
});

test("save swallows a D1 failure instead of throwing", async () => {
  const throwingDb: D1Like = {
    prepare() {
      throw new Error("simulated D1 outage");
    },
  };

  await assert.doesNotReject(() =>
    saveProductResult(throwingDb, {
      barcode: "5202399414023",
      category: "ingredients",
      analysisResult: sampleResult,
    }),
  );
});

test("increment swallows a D1 failure instead of throwing", async () => {
  const throwingDb: D1Like = {
    prepare() {
      throw new Error("simulated D1 outage");
    },
  };

  await assert.doesNotReject(() =>
    incrementProductScanCount(throwingDb, "5202399414023"),
  );
});

test("an empty barcode is never looked up", async () => {
  const db = createFakeDb();
  const cached = await lookupCachedProduct(db, "");

  assert.equal(cached, null);
});

test("a malformed cached row (bad JSON) degrades to a miss instead of throwing", async () => {
  const db = createFakeDb(
    new Map([
      [
        "5202399414023",
        {
          barcode: "5202399414023",
          product_name: null,
          category: "ingredients",
          analysis_result: "{not valid json",
          status: "ai_generated",
          source: "user_scan",
          scan_count: 1,
        },
      ],
    ]),
  );

  const cached = await lookupCachedProduct(db, "5202399414023");

  assert.equal(cached, null);
});

test("a row with an unrecognised category degrades to a miss instead of throwing", async () => {
  const db = createFakeDb(
    new Map([
      [
        "5202399414023",
        {
          barcode: "5202399414023",
          product_name: null,
          category: "not-a-real-category",
          analysis_result: JSON.stringify(sampleResult),
          status: "ai_generated",
          source: "user_scan",
          scan_count: 1,
        },
      ],
    ]),
  );

  const cached = await lookupCachedProduct(db, "5202399414023");

  assert.equal(cached, null);
});

test("a scan of a verified product is kept as an unapplied version", async () => {
  const rows = new Map([
    [
      "5202399414023",
      {
        barcode: "5202399414023",
        product_name: "Επιβεβαιωμένο",
        category: "ingredients",
        analysis_result: JSON.stringify(sampleResult),
        status: "verified",
        source: "user_scan",
        scan_count: 4,
      },
    ],
  ]);

  const versions: FakeVersion[] = [];

  await saveProductResult(createFakeDb(rows, versions), {
    barcode: "5202399414023",
    category: "ingredients",
    analysisResult: { score: { score: 41, band: "attention" } },
  });

  // The live row is untouched, but the scan is not lost: it is exactly what
  // the admin needs to look at and decide whether to promote.
  assert.equal(rows.get("5202399414023")?.product_name, "Επιβεβαιωμένο");
  assert.equal(versions.length, 1);
  assert.equal(versions[0].applied, 0);
  assert.equal(versions[0].source, "user_scan");
});

test("a save that lands records an applied version", async () => {
  const versions: FakeVersion[] = [];

  await saveProductResult(createFakeDb(new Map(), versions), {
    barcode: "5202399414023",
    category: "ingredients",
    analysisResult: sampleResult,
    versionSource: "admin_analyze",
  });

  assert.equal(versions.length, 1);
  assert.equal(versions[0].applied, 1);
  assert.equal(versions[0].source, "admin_analyze");
});

test("a rescan without a name keeps the one already on file", async () => {
  const rows = new Map([
    [
      "5202399414023",
      {
        barcode: "5202399414023",
        product_name: "Μπάρα βρώμης",
        category: "ingredients",
        analysis_result: JSON.stringify(sampleResult),
        status: "ai_generated",
        source: "user_scan",
        scan_count: 2,
      },
    ],
  ]);

  await saveProductResult(createFakeDb(rows), {
    barcode: "5202399414023",
    category: "ingredients",
    analysisResult: sampleResult,
  });

  assert.equal(rows.get("5202399414023")?.product_name, "Μπάρα βρώμης");
});
