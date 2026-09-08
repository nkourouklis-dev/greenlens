import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateContentGate,
  MIN_CONTENT_CONFIDENCE,
} from "./contentGate";

test("fails the gate when extraction itself is invalid, using its own reasons", () => {
  const result = evaluateContentGate({
    isValid: false,
    confidence: 0,
    reasons: ["Δεν εντοπίστηκε λίστα συστατικών."],
  });

  assert.equal(result.passed, false);
  assert.deepEqual(result.reasons, ["Δεν εντοπίστηκε λίστα συστατικών."]);
});

test("falls back to a default reason when an invalid extraction carries none", () => {
  const result = evaluateContentGate({
    isValid: false,
    confidence: 0,
    reasons: [],
  });

  assert.equal(result.passed, false);
  assert.equal(result.reasons.length, 1);
});

test("fails the gate when extraction is valid but confidence is below the threshold", () => {
  const result = evaluateContentGate({
    isValid: true,
    confidence: MIN_CONTENT_CONFIDENCE - 0.01,
    reasons: [],
  });

  assert.equal(result.passed, false);
  assert.ok(result.reasons.length > 0);
});

test("passes the gate when extraction is valid and confidence meets the threshold", () => {
  const result = evaluateContentGate({
    isValid: true,
    confidence: MIN_CONTENT_CONFIDENCE,
    reasons: [],
  });

  assert.equal(result.passed, true);
  assert.deepEqual(result.reasons, []);
});

test("passes the gate for a high-confidence valid extraction", () => {
  const result = evaluateContentGate({
    isValid: true,
    confidence: 0.95,
    reasons: [],
  });

  assert.equal(result.passed, true);
});

test("a passed gate and a failed gate are never both true — a caller only sees one branch", () => {
  const passing = evaluateContentGate({
    isValid: true,
    confidence: 0.9,
    reasons: [],
  });
  const failing = evaluateContentGate({
    isValid: true,
    confidence: 0.1,
    reasons: [],
  });

  // The failing case must carry a message to show, and the passing case
  // must not — a caller can render exactly one branch's worth of UI.
  assert.equal(passing.passed, true);
  assert.deepEqual(passing.reasons, []);
  assert.equal(failing.passed, false);
  assert.ok(failing.reasons.length > 0);
});

test("respects a custom minimum confidence", () => {
  const result = evaluateContentGate(
    { isValid: true, confidence: 0.7, reasons: [] },
    0.8,
  );

  assert.equal(result.passed, false);
});
