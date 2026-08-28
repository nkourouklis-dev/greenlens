import assert from "node:assert/strict";
import test from "node:test";
import { parseOcrModelOutput, validateOcrRequest } from "./ocr";

test("accepts a valid model JSON result", () => {
  assert.deepEqual(parseOcrModelOutput('{"rawText":"Ingredients: water","confidence":0.91}'), { rawText: "Ingredients: water", confidence: 0.91 });
});

test("rejects malformed model output", () => {
  assert.equal(parseOcrModelOutput('{"rawText": 1, "confidence": 0.9}'), null);
});

test("rejects an empty OCR transcription", () => {
  assert.equal(parseOcrModelOutput('{"rawText":"   ","confidence":0.9}'), null);
});

test("rejects invalid OCR confidence", () => {
  assert.equal(parseOcrModelOutput('{"rawText":"Ingredients","confidence":1.1}'), null);
});

test("rejects a missing image", () => {
  assert.equal(validateOcrRequest(null, "0000000000000", "product-1"), "Λείπει η εικόνα της ετικέτας.");
});

test("rejects unsupported image MIME types", () => {
  const image = new File(["test"], "label.gif", { type: "image/gif" });
  assert.equal(validateOcrRequest(image, "0000000000000", "product-1"), "Ο τύπος εικόνας δεν υποστηρίζεται.");
});