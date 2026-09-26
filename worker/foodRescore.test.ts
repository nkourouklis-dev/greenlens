import assert from "node:assert/strict";
import test from "node:test";
import type { WorkerAnalysisResult } from "./analysis";
import { PARTIAL_EVALUATION_SCORE_CAP } from "./foodScore";
import type { D1Like, D1PreparedStatementLike } from "./ingredientKnowledge";
import {
  nutritionEvidenceForRecompute,
  rescoreFoodIngredients,
  storedLabelContext,
} from "./rescore";

/**
 * «Επανυπολογισμός» on a row already in the catalogue.
 *
 * Lurpak Soft was stored at 100 with no nutrition behind it. A recompute runs
 * no OCR and no model, so the only way it can pick the nutrition up is from
 * Open Food Facts (fetched now, for a row that predates stored evidence) or
 * from the evidence a later scan stored.
 */

const emptyDb: D1Like = {
  prepare(): D1PreparedStatementLike {
    const statement: D1PreparedStatementLike = {
      bind: () => statement,
      async first<T>() {
        return null as T | null;
      },
      async run() {
        return undefined;
      },
      async all<T>() {
        return { results: [] as T[] };
      },
    };

    return statement;
  },
};

const analysis: WorkerAnalysisResult = {
  productType: "food",
  summary: "Βούτυρο με ελαιόλαδο.",
  positives: [],
  attentionItems: [],
  potentialAllergens: ["γάλα"],
  ingredientFindings: [
    {
      ingredientName: "Βούτυρο",
      normalizedName: "butter",
      severity: "info",
      title: "Βούτυρο",
      explanation: "Γαλακτοκομικό λίπος.",
      evidenceType: "label",
      sourceName: null,
      sourceUrl: null,
      confidence: 0.9,
    },
  ],
  insufficientDataReasons: [],
  confidence: 0.9,
};

const LURPAK_OFF_FACTS = {
  energyKj: 2232,
  fat: 60,
  saturates: 23,
  carbohydrate: 0.4,
  sugars: null,
  fibre: null,
  protein: 0.3,
  salt: 0.01,
  fruitVegLegumesPct: 0,
  isBeverage: false,
  abv: null,
};

const LURPAK_TAGS = ["en:fats", "en:butters"];

const TEXT = "Βούτυρο (γάλα), ελαιόλαδο, αλάτι";

test("a legacy row with no stored evidence is capped until Open Food Facts is asked", async () => {
  const context = storedLabelContext({ sourceText: TEXT });

  const evidence = nutritionEvidenceForRecompute(context, null);

  assert.equal(evidence, null);

  const { score } = await rescoreFoodIngredients(emptyDb, analysis, TEXT, context, evidence);

  assert.equal(score.score, PARTIAL_EVALUATION_SCORE_CAP);
  assert.equal(
    score.notices.some((notice) => notice.code === "partial_no_nutrition"),
    true,
  );
});

test("the same row, with the barcode's Open Food Facts record fetched, is graded", async () => {
  const context = storedLabelContext({ sourceText: TEXT });

  const evidence = nutritionEvidenceForRecompute(context, {
    facts: LURPAK_OFF_FACTS,
    categoryTags: LURPAK_TAGS,
  });

  assert.equal(evidence?.source, "openfoodfacts");

  const { score } = await rescoreFoodIngredients(emptyDb, analysis, TEXT, context, evidence);

  assert.equal(score.nutritionEvaluation?.grade, "D");
  assert.equal(score.score, 64);
  assert.equal(score.band, "moderate");
});

test("evidence stored with the scan is used as it is, with no new lookup", async () => {
  const context = storedLabelContext({
    sourceText: TEXT,
    nutritionEvidence: {
      source: "openfoodfacts",
      facts: LURPAK_OFF_FACTS,
      categoryTags: LURPAK_TAGS,
    },
  });

  // `fresh` is null: nothing was fetched, and none was needed.
  const evidence = nutritionEvidenceForRecompute(context, null);

  const { score } = await rescoreFoodIngredients(emptyDb, analysis, TEXT, context, evidence);

  assert.equal(score.score, 64);
});

test("stored evidence that contradicts itself is dropped, not trusted", () => {
  const context = storedLabelContext({
    sourceText: TEXT,
    nutritionEvidence: {
      source: "openfoodfacts",
      facts: { ...LURPAK_OFF_FACTS, saturates: 90 },
      categoryTags: LURPAK_TAGS,
    },
  });

  assert.equal(context.storedEvidence, null);
});
