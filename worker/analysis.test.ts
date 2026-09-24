import assert from "node:assert/strict";
import test from "node:test";
import { parseAnalysis } from "./analysis";

const base = { productType: "food", summary: "Επιβεβαιωμένη λίστα.", positives: [], attentionItems: [], potentialAllergens: [], insufficientDataReasons: [], confidence: 0.8 };
test("rejects malformed structured findings", () => assert.equal(parseAnalysis(JSON.stringify({ ...base, ingredientFindings: [{ ingredientName: "x" }] })), null));
test("rejects high attention findings without evidence", () => assert.equal(parseAnalysis(JSON.stringify({ ...base, ingredientFindings: [{ ingredientName: "x", normalizedName: "x", severity: "high_attention", title: "x", explanation: "x", evidenceType: "none", sourceName: null, sourceUrl: null, confidence: 0.8 }] })), null));
const compactFinding = { ingredientName: "Sugar", normalizedName: "sugar", severity: "attention", title: "Ζάχαρη", explanation: "Πρόσθετη ζάχαρη." };
test("a compact finding without the optional fields takes their defaults", () => {
  const parsed = parseAnalysis(JSON.stringify({ ...base, ingredientFindings: [compactFinding] }));
  assert.deepEqual(parsed?.ingredientFindings[0], { ...compactFinding, evidenceType: "none", sourceName: null, sourceUrl: null, confidence: 0.5 });
});
test("an optional field that is present is still validated", () => {
  assert.equal(parseAnalysis(JSON.stringify({ ...base, ingredientFindings: [{ ...compactFinding, confidence: 7 }] })), null);
  assert.equal(parseAnalysis(JSON.stringify({ ...base, ingredientFindings: [{ ...compactFinding, sourceUrl: "http://x.test" }] })), null);
  assert.equal(parseAnalysis(JSON.stringify({ ...base, ingredientFindings: [{ ...compactFinding, severity: "high_attention" }] })), null);
});

test("blank list entries no longer sink an otherwise valid reply", () => {
  const parsed = parseAnalysis(JSON.stringify({ ...base, positives: [""], attentionItems: ["υψηλή ζάχαρη", "  "], ingredientFindings: [compactFinding] }));
  assert.deepEqual(parsed?.positives, []);
  assert.deepEqual(parsed?.attentionItems, ["υψηλή ζάχαρη"]);
});
test("a blank finding title or explanation falls back to the ingredient name", () => {
  const parsed = parseAnalysis(JSON.stringify({ ...base, ingredientFindings: [{ ...compactFinding, title: "", explanation: "" }] }));
  assert.equal(parsed?.ingredientFindings[0].title, "Sugar");
  assert.equal(parsed?.ingredientFindings[0].explanation, "Sugar");
});
test("a finding with no ingredient name at all is still rejected", () => {
  assert.equal(parseAnalysis(JSON.stringify({ ...base, ingredientFindings: [{ ...compactFinding, ingredientName: "", title: "" }] })), null);
});
