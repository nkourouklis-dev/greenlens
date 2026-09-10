import assert from "node:assert/strict";
import test from "node:test";
import {
  getProductVersion,
  listProductVersions,
  recordProductVersion,
  type D1Like,
  type D1PreparedStatementLike,
} from "./productVersions";

interface Captured {
  sql: string;
  values: unknown[];
}

function createFakeDb(
  captured: Captured[],
  rows: Record<string, unknown>[] = [],
): D1Like {
  return {
    prepare(sql: string): D1PreparedStatementLike {
      const statement: D1PreparedStatementLike = {
        bind(...values: unknown[]): D1PreparedStatementLike {
          captured.push({ sql, values });

          return {
            bind: statement.bind,
            async first<T>() {
              return (rows[0] ?? null) as T | null;
            },
            async run() {
              return { success: true };
            },
            async all<T>() {
              return { results: rows as T[] };
            },
          };
        },
        first: () => statement.bind().first(),
        run: () => statement.bind().run(),
        all: () => statement.bind().all(),
      };

      return statement;
    },
  };
}

test("score and band are denormalized out of the stored envelope", async () => {
  const captured: Captured[] = [];

  await recordProductVersion(createFakeDb(captured), {
    barcode: "5202399414023",
    source: "user_scan",
    analysisResult: { score: { score: 72.4, band: "good" } },
    applied: true,
  });

  assert.equal(captured.length, 1);
  assert.equal(captured[0].values[5], 72);
  assert.equal(captured[0].values[6], "good");
  assert.equal(captured[0].values[7], 1);
});

test("an envelope without a score still records a version", async () => {
  const captured: Captured[] = [];

  await recordProductVersion(createFakeDb(captured), {
    barcode: "5202399414023",
    source: "admin_edit",
    analysisResult: { summary: "χωρίς βαθμολογία" },
    applied: false,
  });

  assert.equal(captured[0].values[5], null);
  assert.equal(captured[0].values[6], null);
  assert.equal(captured[0].values[7], 0);
});

test("a write failure is swallowed rather than failing the scan", async () => {
  const failing: D1Like = {
    prepare() {
      throw new Error("D1 unavailable");
    },
  };

  await recordProductVersion(failing, {
    barcode: "5202399414023",
    source: "user_scan",
    analysisResult: {},
    applied: true,
  });
});

test("listing maps rows and reports the applied flag", async () => {
  const versions = await listProductVersions(
    createFakeDb(
      [],
      [
        {
          id: 4,
          barcode: "5202399414023",
          source: "user_scan",
          product_name: "Μπάρα",
          category: "ingredients",
          score: 61,
          band: "moderate",
          applied: 0,
          created_at: "2026-09-10 08:00:00",
        },
      ],
    ),
    "5202399414023",
  );

  assert.equal(versions.length, 1);
  assert.equal(versions[0].applied, false);
  assert.equal(versions[0].source, "user_scan");
  assert.equal(versions[0].productName, "Μπάρα");
});

test("a version with unparseable JSON reads as missing", async () => {
  const version = await getProductVersion(
    createFakeDb(
      [],
      [
        {
          id: 4,
          barcode: "5202399414023",
          source: "user_scan",
          product_name: null,
          category: null,
          score: null,
          band: null,
          applied: 1,
          created_at: "2026-09-10 08:00:00",
          analysis_result: "{not json",
        },
      ],
    ),
    4,
  );

  assert.equal(version, null);
});
