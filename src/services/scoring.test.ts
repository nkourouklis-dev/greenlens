import assert from "node:assert/strict";
import test from "node:test";
import { scoreAnalysis, toBand } from "./scoring";
import type { NormalizedIngredient, StructuredAnalysis } from "../types";

const ingredient: NormalizedIngredient = { id: "water", originalName: "Water", normalizedName: "water", displayName: "Water", percentage: null, category: "base", aliases: [], confidence: 1 };
const valid: StructuredAnalysis = { productType: "food", summary: "", positives: [], attentionItems: [], potentialAllergens: [], ingredientFindings: [], insufficientDataReasons: [], confidence: 1 };
test("returns insufficient data with no ingredients", () => assert.equal(scoreAnalysis("", [], 1, valid).score, null));
test("does not deduct unsupported findings", () => assert.equal(scoreAnalysis("Water", [ingredient], 1, { ...valid, ingredientFindings: [{ ingredientName: "Water", normalizedName: "water", severity: "high_attention", title: "x", explanation: "x", evidenceType: "none", sourceName: null, sourceUrl: null, confidence: 1 }] }).score, null));
test("deduplicates deductions", () => assert.equal(scoreAnalysis("Water", [ingredient], 1, { ...valid, ingredientFindings: Array(2).fill({ ingredientName: "Water", normalizedName: "water", severity: "attention", title: "x", explanation: "x", evidenceType: "label", sourceName: null, sourceUrl: null, confidence: 1 }) }).deductions.length, 1));
test("maps score bands", () => { assert.equal(toBand(85), "excellent"); assert.equal(toBand(70), "good"); assert.equal(toBand(50), "moderate"); assert.equal(toBand(30), "attention"); assert.equal(toBand(0), "high_attention"); });