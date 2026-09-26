import assert from "node:assert/strict";
import test from "node:test";
import {
  CACHE_SCHEMA_VERSION,
  lookupProductByBarcode,
  type D1Like,
  type D1PreparedStatementLike,
} from "./productLookup";

/**
 * Caching what Open Food Facts said about a barcode.
 *
 * The lookup runs twice on the critical path of a scan — once to name the
 * product, once as the nutrition fallback for a label photographed without
 * its table — and people re-scan the same products constantly. These tests
 * hold the cache to the rule that matters most: it may save a request, but
 * it must never be able to break the lookup it is speeding up.
 */

interface CacheRow {
  barcode: string;
  schema_version: number;
  result: string;
  found: number;
  fetched_at_ms: number;
}

function createFakeD1(rows: CacheRow[]): {
  db: D1Like;
  rows: CacheRow[];
  reads: number;
  writes: number;
} {
  const state = { reads: 0, writes: 0 };

  const db: D1Like = {
    prepare(sql: string): D1PreparedStatementLike {
      let bound: unknown[] = [];

      const statement: D1PreparedStatementLike = {
        bind(...values: unknown[]) {
          bound = values;
          return statement;
        },
        async first<T>() {
          state.reads += 1;

          const [barcode, schemaVersion] = bound;

          const row = rows.find(
            (candidate) =>
              candidate.barcode === barcode &&
              candidate.schema_version === schemaVersion,
          );

          return (row ?? null) as T | null;
        },
        async run() {
          if (!sql.startsWith("INSERT")) {
            return undefined;
          }

          state.writes += 1;

          const [barcode, schema_version, result, found, fetched_at_ms] =
            bound as [string, number, string, number, number];

          const existing = rows.findIndex(
            (candidate) => candidate.barcode === barcode,
          );

          const row = {
            barcode,
            schema_version,
            result,
            found,
            fetched_at_ms,
          };

          if (existing >= 0) {
            rows[existing] = row;
          } else {
            rows.push(row);
          }

          return undefined;
        },
      };

      return statement;
    },
  };

  return {
    db,
    rows,
    get reads() {
      return state.reads;
    },
    get writes() {
      return state.writes;
    },
  };
}

const CACHED_NESTLE: CacheRow = {
  barcode: "7613287308870",
  schema_version: CACHE_SCHEMA_VERSION,
  found: 1,
  fetched_at_ms: Date.now(),
  result: JSON.stringify({
    productName: "NESTLE CLUSTERS",
    brand: "Nestlé",
    netContent: "325 g",
    nutritionPanel: {
      readings: [{ key: "sugars", gramsPer100: 19.9, declared: "19.9 g" }],
      isBeverage: false,
    },
    confidence: 0.98,
    source: "openfoodfacts",
  }),
};

test("a fresh cached answer is served without calling out", async () => {
  const fake = createFakeD1([CACHED_NESTLE]);

  const result = await lookupProductByBarcode("7613287308870", {
    db: fake.db,
    // A timeout this short would fail any real request, so a pass here is
    // proof nothing was fetched.
    timeoutMs: 1,
  });

  assert.equal(result.source, "openfoodfacts");
  assert.equal(result.productName, "NESTLE CLUSTERS");
  assert.equal(result.nutritionPanel?.readings[0].gramsPer100, 19.9);
  assert.equal(fake.writes, 0);
});

test("an expired hit is not served", async () => {
  const fake = createFakeD1([
    {
      ...CACHED_NESTLE,
      // Older than the 30-day hit lifetime.
      fetched_at_ms: Date.now() - 40 * 24 * 60 * 60 * 1000,
    },
  ]);

  const result = await lookupProductByBarcode("7613287308870", {
    db: fake.db,
    timeoutMs: 1,
  });

  // The refetch times out at 1 ms, which is exactly the point: the stale row
  // was refused rather than handed back.
  assert.equal(result.source, null);
});

// "OFF has never heard of this barcode" is worth remembering — but it is
// also the answer most likely to change, since anyone can add the product
// tomorrow. A day, not a month.
test("a cached miss is served, and expires much sooner than a hit", async () => {
  const miss: CacheRow = {
    barcode: "5201109003724",
    schema_version: CACHE_SCHEMA_VERSION,
    found: 0,
    fetched_at_ms: Date.now(),
    result: JSON.stringify({
      productName: null,
      brand: null,
      netContent: null,
      nutritionPanel: null,
      confidence: 0,
      source: null,
    }),
  };

  const fresh = createFakeD1([miss]);

  assert.equal(
    (await lookupProductByBarcode("5201109003724", { db: fresh.db })).source,
    null,
  );
  assert.equal(fresh.writes, 0, "a fresh miss should not be refetched");

  // Two days old: still well inside a hit's lifetime, past a miss's.
  const stale = createFakeD1([
    { ...miss, fetched_at_ms: Date.now() - 2 * 24 * 60 * 60 * 1000 },
  ]);

  await lookupProductByBarcode("5201109003724", {
    db: stale.db,
    timeoutMs: 1,
  });

  assert.equal(stale.reads, 1);
});

// Rows written by older extraction code describe fields that code no longer
// produces; serving them would be worse than asking again.
test("a row from an older cache schema is ignored", async () => {
  const fake = createFakeD1([{ ...CACHED_NESTLE, schema_version: 0 }]);

  const result = await lookupProductByBarcode("7613287308870", {
    db: fake.db,
    timeoutMs: 1,
  });

  assert.equal(result.source, null);
});

test("a broken cache never breaks the lookup", async () => {
  const exploding: D1Like = {
    prepare() {
      throw new Error("D1 is down");
    },
  };

  const result = await lookupProductByBarcode("7613287308870", {
    db: exploding,
    timeoutMs: 1,
  });

  // Falls through to the network, which times out here — the point is that
  // it returned a result at all instead of throwing.
  assert.equal(result.source, null);
  assert.equal(result.confidence, 0);
});

test("an invalid barcode is never cached or looked up", async () => {
  const fake = createFakeD1([]);

  const result = await lookupProductByBarcode("abc", { db: fake.db });

  assert.equal(result.source, null);
  assert.equal(fake.reads, 0);
  assert.equal(fake.writes, 0);
});
