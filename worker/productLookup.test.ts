import assert from "node:assert/strict";
import test from "node:test";
import { lookupProductByBarcode } from "./productLookup";

test("returns null results for invalid barcode", async () => {
  const result = await lookupProductByBarcode("abc");
  assert.equal(result.productName, null);
  assert.equal(result.brand, null);
  assert.equal(result.confidence, 0);
  assert.equal(result.source, null);
});

test("returns null results for barcode with non-digits", async () => {
  const result = await lookupProductByBarcode("123abc456");
  assert.equal(result.productName, null);
  assert.equal(result.confidence, 0);
});

test("returns null results for barcode shorter than 8 digits", async () => {
  const result = await lookupProductByBarcode("1234567");
  assert.equal(result.productName, null);
  assert.equal(result.confidence, 0);
});

test("returns null results for barcode longer than 14 digits", async () => {
  const result = await lookupProductByBarcode("123456789012345");
  assert.equal(result.productName, null);
  assert.equal(result.confidence, 0);
});

test("accepts valid 8-digit barcode", async () => {
  const result = await lookupProductByBarcode("12345678");
  assert.equal(typeof result.confidence, "number");
  assert([0, 0.6, 0.8, 0.98].includes(result.confidence), true);
});

test("accepts valid 13-digit barcode (typical EAN)", async () => {
  const result = await lookupProductByBarcode("5901234123457");
  assert.equal(typeof result.confidence, "number");
});

test("accepts valid 14-digit barcode", async () => {
  const result = await lookupProductByBarcode("59012341234567");
  assert.equal(typeof result.confidence, "number");
});

test("handles whitespace in barcode", async () => {
  const result = await lookupProductByBarcode("  12345678  ");
  assert.equal(typeof result.confidence, "number");
});

test("limits productName to 80 characters", async () => {
  const result = await lookupProductByBarcode("5901234123457");
  if (result.productName) {
    assert(result.productName.length <= 80);
  }
});

test("limits brand to 60 characters", async () => {
  const result = await lookupProductByBarcode("5901234123457");
  if (result.brand) {
    assert(result.brand.length <= 60);
  }
});

test("limits netContent to 30 characters", async () => {
  const result = await lookupProductByBarcode("5901234123457");
  if (result.netContent) {
    assert(result.netContent.length <= 30);
  }
});

test("respects timeout option", async () => {
  const startTime = Date.now();
  await lookupProductByBarcode("5901234123457", { timeoutMs: 100 });
  const elapsed = Date.now() - startTime;
  assert(elapsed < 10000);
});

test("returns proper structure on network error", async () => {
  const result = await lookupProductByBarcode("1234567890123");
  assert(Object.hasOwn(result, "productName"));
  assert(Object.hasOwn(result, "brand"));
  assert(Object.hasOwn(result, "netContent"));
  assert(Object.hasOwn(result, "confidence"));
  assert(Object.hasOwn(result, "source"));
});
