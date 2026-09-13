import assert from "node:assert/strict";
import test from "node:test";
import {
  fillMissingProductName,
  normalizeProductName,
  PRODUCT_NAME_MAX_LENGTH,
  type D1Like,
} from "./adminProducts";

test("normalizeProductName trims and collapses whitespace", () => {
  assert.equal(
    normalizeProductName("  Eubos   Body  Lotion "),
    "Eubos Body Lotion",
  );
});

test("normalizeProductName treats empty and null as clearing the name", () => {
  assert.equal(normalizeProductName("   "), null);
  assert.equal(normalizeProductName(null), null);
});

test("normalizeProductName rejects non-strings and over-long names", () => {
  assert.equal(normalizeProductName(42), undefined);
  assert.equal(normalizeProductName(undefined), undefined);
  assert.equal(
    normalizeProductName("x".repeat(PRODUCT_NAME_MAX_LENGTH + 1)),
    undefined,
  );
});

function recordingDb(options: { fail?: boolean } = {}) {
  const calls: Array<{ query: string; values: unknown[] }> = [];

  const db: D1Like = {
    prepare(query) {
      const statement = {
        bind(...values: unknown[]) {
          calls.push({ query, values });
          return statement;
        },
        async first() {
          return null;
        },
        async run() {
          if (options.fail) {
            throw new Error("d1 down");
          }
          return {};
        },
        async all() {
          return { results: [] };
        },
      };
      return statement;
    },
  };

  return { db, calls };
}

test("fillMissingProductName only updates rows without a name", async () => {
  const { db, calls } = recordingDb();

  await fillMissingProductName(db, "4021354034066", " Eubos  Lotion ");

  assert.equal(calls.length, 1);
  assert.match(calls[0].query, /product_name IS NULL/);
  assert.deepEqual(calls[0].values, ["Eubos Lotion", "4021354034066"]);
});

test("fillMissingProductName skips empty names and never throws", async () => {
  const empty = recordingDb();
  await fillMissingProductName(empty.db, "1", "  ");
  assert.equal(empty.calls.length, 0);

  const failing = recordingDb({ fail: true });
  await assert.doesNotReject(
    fillMissingProductName(failing.db, "1", "Eubos"),
  );
});
