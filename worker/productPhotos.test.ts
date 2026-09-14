import assert from "node:assert/strict";
import test from "node:test";
import {
  deleteProductPhoto,
  type D1Like,
  type D1PreparedStatementLike,
} from "./productPhotos";

interface FakePhotoRow {
  id: number;
  barcode: string;
  r2_key: string;
}

/**
 * Answers the two statements deleteProductPhoto issues and records what it
 * actually removed, so the barcode scoping can be asserted rather than
 * assumed.
 */
function createFakeD1(rows: FakePhotoRow[]): {
  db: D1Like;
  rows: FakePhotoRow[];
} {
  const db: D1Like = {
    prepare(sql: string): D1PreparedStatementLike {
      let bound: unknown[] = [];

      const statement: D1PreparedStatementLike = {
        bind(...values: unknown[]) {
          bound = values;
          return statement;
        },
        async first<T>() {
          const [id, barcode] = bound;

          const match = rows.find(
            (row) => row.id === id && row.barcode === barcode,
          );

          return (match ? { r2_key: match.r2_key } : null) as T | null;
        },
        async run() {
          if (!sql.startsWith("DELETE")) {
            return undefined;
          }

          const [id, barcode] = bound;

          const index = rows.findIndex(
            (row) => row.id === id && row.barcode === barcode,
          );

          if (index >= 0) {
            rows.splice(index, 1);
          }

          return undefined;
        },
        async all<T>() {
          return { results: [] as T[] };
        },
      };

      return statement;
    },
  };

  return { db, rows };
}

test("deleting a photo returns its key so the object can be removed too", async () => {
  const { db, rows } = createFakeD1([
    { id: 7, barcode: "5201234567890", r2_key: "photos/a/front/1.jpg" },
    { id: 8, barcode: "5201234567890", r2_key: "photos/a/ingredients/2.jpg" },
  ]);

  const key = await deleteProductPhoto(db, "5201234567890", 7);

  assert.equal(key, "photos/a/front/1.jpg");
  assert.deepEqual(
    rows.map((row) => row.id),
    [8],
  );
});

test("an unknown photo deletes nothing and says so", async () => {
  const { db, rows } = createFakeD1([
    { id: 7, barcode: "5201234567890", r2_key: "photos/a/front/1.jpg" },
  ]);

  assert.equal(await deleteProductPhoto(db, "5201234567890", 99), null);
  assert.equal(rows.length, 1);
});

// The id alone is enough to name a row; requiring the barcode too means a
// mistyped request cannot delete a photo out of a different product.
test("a photo belonging to another barcode is not touched", async () => {
  const { db, rows } = createFakeD1([
    { id: 7, barcode: "5201234567890", r2_key: "photos/a/front/1.jpg" },
  ]);

  assert.equal(await deleteProductPhoto(db, "5209999999999", 7), null);
  assert.equal(rows.length, 1);
});
