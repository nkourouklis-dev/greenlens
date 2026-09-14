import assert from "node:assert/strict";
import test from "node:test";
import {
  listScanFailures,
  recordScanFailure,
  type D1Like,
  type D1PreparedStatementLike,
} from "./scanFailures";

interface Recorded {
  sql: string;
  bound: unknown[];
}

function createFakeD1(options?: { throwOnPrepare?: boolean }): {
  db: D1Like;
  calls: Recorded[];
  rows: Record<string, unknown>[];
} {
  const calls: Recorded[] = [];
  const rows: Record<string, unknown>[] = [];

  const db: D1Like = {
    prepare(sql: string): D1PreparedStatementLike {
      if (options?.throwOnPrepare) {
        throw new Error("D1 is down");
      }

      let bound: unknown[] = [];

      const statement: D1PreparedStatementLike = {
        bind(...values: unknown[]) {
          bound = values;
          return statement;
        },
        async run() {
          calls.push({ sql, bound });
          return undefined;
        },
        async all<T>() {
          calls.push({ sql, bound });
          return { results: rows as T[] };
        },
      };

      return statement;
    },
  };

  return { db, calls, rows };
}

const failure = {
  barcode: "5430003127100",
  contentCategory: "ingredients",
  labelType: "unknown",
  reasons: ["Δεν εντοπίστηκε λίστα συστατικών σε αυτή τη φωτογραφία."],
  sourceText: "EN Gluten-free oat drink\nWater, gluten-free oats 11%",
  ocrConfidence: 0.91,
  requestId: "req-1",
};

test("a refusal is recorded with the text that was refused", async () => {
  const fake = createFakeD1();

  await recordScanFailure(fake.db, failure);

  assert.equal(fake.calls.length, 1);

  const [barcode, category, labelType, reasons, sourceText] =
    fake.calls[0].bound;

  assert.equal(barcode, "5430003127100");
  assert.equal(category, "ingredients");
  assert.equal(labelType, "unknown");
  assert.deepEqual(JSON.parse(String(reasons)), failure.reasons);
  assert.equal(sourceText, failure.sourceText);
});

// A scan that already failed to produce a score must not also fail to
// return. Recording is the last thing that should be able to break a
// request, so it swallows everything.
test("a broken log never breaks the scan that failed", async () => {
  const fake = createFakeD1({ throwOnPrepare: true });

  await recordScanFailure(fake.db, failure);
});

// An OCR run that wandered onto a magazine page must not be able to fill
// the database with one row.
test("a runaway OCR read is truncated", async () => {
  const fake = createFakeD1();

  await recordScanFailure(fake.db, {
    ...failure,
    sourceText: "α".repeat(12000),
  });

  const sourceText = String(fake.calls[0].bound[4]);

  assert.equal(sourceText.length, 4000);
});

test("a barcode-less scan is still recorded", async () => {
  const fake = createFakeD1();

  await recordScanFailure(fake.db, { ...failure, barcode: null });

  assert.equal(fake.calls[0].bound[0], null);
});

test("the listing parses reasons back and is bounded", async () => {
  const fake = createFakeD1();

  fake.rows.push({
    id: 1,
    barcode: null,
    content_category: "unknown",
    label_type: null,
    reasons: JSON.stringify(["Δεν αναγνωρίστηκε ο τύπος περιεχομένου."]),
    source_text: "…",
    ocr_confidence: 0.4,
    request_id: "req-2",
    created_at: "2026-09-14 10:00:00",
  });

  const listed = await listScanFailures(fake.db, 9999);

  assert.equal(listed.length, 1);
  assert.deepEqual(listed[0].reasons, [
    "Δεν αναγνωρίστηκε ο τύπος περιεχομένου.",
  ]);

  // Clamped, so a mistyped query parameter cannot ask for the whole table.
  assert.equal(fake.calls[0].bound[0], 200);
});

test("an unreadable reasons column does not break the listing", async () => {
  const fake = createFakeD1();

  fake.rows.push({
    id: 2,
    barcode: null,
    content_category: "ingredients",
    label_type: null,
    reasons: "not json",
    source_text: "…",
    ocr_confidence: null,
    request_id: null,
    created_at: "2026-09-14 10:00:00",
  });

  const listed = await listScanFailures(fake.db);

  assert.deepEqual(listed[0].reasons, []);
});
