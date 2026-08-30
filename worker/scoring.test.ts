import assert from "node:assert/strict";
import test from "node:test";
import { scoreInterpretation, scoringVersion } from "./scoring";
import type { WorkerAnalysisResult } from "./analysis";

const base: WorkerAnalysisResult = { productType: "food", summary: "Επιβεβαιωμένο κείμενο.", positives: [], attentionItems: [], potentialAllergens: [], ingredientFindings: [], insufficientDataReasons: [], confidence: 0.9 };
test("returns null score for insufficient data", () => assert.equal(scoreInterpretation("", 0.9, base).score, null));
test("deduplicates and caps deductions", () => { const finding = { ingredientName: "x", normalizedName: "x", severity: "attention" as const, title: "x", explanation: "x", evidenceType: "label" as const, sourceName: null, sourceUrl: null, confidence: 0.9 }; assert.equal(scoreInterpretation("x", 0.9, { ...base, ingredientFindings: Array(8).fill(finding) }).deductions.length, 1); });
test("returns the scoring version", () => assert.equal(scoreInterpretation("x", 0.9, base).scoringVersion, scoringVersion));