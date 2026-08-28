import assert from "node:assert/strict";
import test from "node:test";
import { parseAnalysis } from "./analysis";

const base = { productType: "food", summary: "Επιβεβαιωμένη λίστα.", positives: [], attentionItems: [], potentialAllergens: [], insufficientDataReasons: [], confidence: 0.8 };
test("rejects malformed structured findings", () => assert.equal(parseAnalysis(JSON.stringify({ ...base, ingredientFindings: [{ ingredientName: "x" }] })), null));
test("rejects high attention findings without evidence", () => assert.equal(parseAnalysis(JSON.stringify({ ...base, ingredientFindings: [{ ingredientName: "x", normalizedName: "x", severity: "high_attention", title: "x", explanation: "x", evidenceType: "none", sourceName: null, sourceUrl: null, confidence: 0.8 }] })), null));