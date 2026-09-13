import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import type { WorkerAnalysisResult } from "./analysis";
import {
  buildIngredientInsights,
  groundIngredientFindings,
  UNVERIFIED_INGREDIENT_DESCRIPTION,
} from "./ingredientInsights";
import type { D1Like, D1PreparedStatementLike } from "./ingredientKnowledge";
import { scoreInterpretation } from "./scoring";

/**
 * Root-cause regression tests for "Κετηλάρη" / "Εμμολσιωτικό": model-written
 * Greek surfacing as an ingredient's name and description.
 *
 * Run against the real knowledge dataset, not a fixture: every migration is
 * executed in order into an in-memory SQLite (the engine D1 is built on),
 * so the rows here are exactly the ones production has — the curated set
 * from 0001 and 0006, the 669-entry Open Food Facts import from 0003, and
 * the rule curation 0006 applies on top of it. A future import that ships a
 * fabricated field, or a code path that falls back to model prose, fails
 * here for every entry at once.
 */

type Finding = WorkerAnalysisResult["ingredientFindings"][number];

interface KnowledgeRow {
  normalized_name: string;
  category: string;
  short_description: string;
  concerns: string;
  source: string;
  rule_severity: string | null;
}

const migrationsDir = new URL("../migrations/", import.meta.url);
const sqlite = new DatabaseSync(":memory:");

for (const file of readdirSync(migrationsDir).filter((name) => name.endsWith(".sql")).sort()) {
  sqlite.exec(readFileSync(new URL(file, migrationsDir), "utf8"));
}

const knowledgeRows = sqlite
  .prepare("SELECT normalized_name, category, short_description, concerns, source, rule_severity FROM ingredient_knowledge")
  .all() as unknown as KnowledgeRow[];

const aliasSet = new Set(
  (sqlite.prepare("SELECT alias FROM ingredient_aliases").all() as Array<{ alias: string }>).map((row) => row.alias),
);

/** D1Like over the migrated SQLite — the real lookup SQL runs unchanged. */
const datasetDb: D1Like = {
  prepare(sql: string): D1PreparedStatementLike {
    const withValues = (values: unknown[]): D1PreparedStatementLike => ({
      bind: (...next: unknown[]) => withValues(next),
      async all<T>() {
        const results = sqlite.prepare(sql).all(...(values as string[]));
        return { results: results as unknown as T[] };
      },
    });

    return withValues([]);
  },
};

// Exactly what the model returned for the EUBOS scan.
const MODEL_TITLE = "Κετηλάρη";
const MODEL_EXPLANATION = "Εμμολσιωτικό";

function modelFinding(ingredientName: string, normalizedName: string): Finding {
  return {
    ingredientName,
    normalizedName,
    severity: "info",
    title: MODEL_TITLE,
    explanation: MODEL_EXPLANATION,
    evidenceType: "none",
    sourceName: null,
    sourceUrl: null,
    confidence: 0.5,
  };
}

async function groundAndBuild(findings: Finding[]) {
  const grounded = await groundIngredientFindings(findings, datasetDb);

  const analysis: WorkerAnalysisResult = {
    productType: "cosmetic",
    summary: "",
    positives: [],
    attentionItems: [],
    potentialAllergens: [],
    ingredientFindings: grounded,
    insufficientDataReasons: [],
    confidence: 0.8,
  };

  const score = scoreInterpretation("Aqua, Glycerin", 1, analysis);
  const insights = await buildIngredientInsights(analysis, score, datasetDb);

  return { grounded, insights };
}

function assertNoModelText(fields: string[], context: string) {
  for (const field of fields) {
    assert.ok(
      !field.includes(MODEL_TITLE) && !field.includes(MODEL_EXPLANATION),
      `model-written text leaked into ${context}: "${field}"`,
    );
  }
}

const GREEK = /[Ͱ-Ͽἀ-῿]/;

test("the dataset is the real migrated import: 50 curated + 669 Open Food Facts entries", () => {
  const count = (source: string) => knowledgeRows.filter((row) => row.source === source).length;

  assert.equal(count("curated"), 50);
  assert.equal(count("openfoodfacts"), 669);
});

test("every knowledge entry grounds to its own stored description, never the model's", async () => {
  const { grounded, insights } = await groundAndBuild(
    knowledgeRows.map((row) => modelFinding(row.normalized_name, row.normalized_name)),
  );

  knowledgeRows.forEach((row, index) => {
    assert.equal(grounded[index].title, row.normalized_name);
    assert.equal(grounded[index].explanation, row.short_description);

    const insight = insights.find((item) => item.normalizedName === row.normalized_name);
    assert.ok(insight, `no insight for ${row.normalized_name}`);
    assert.equal(insight.shortDescription, row.short_description);
    assert.equal(insight.category, row.category);
    assertNoModelText([insight.shortDescription, insight.whyRated], row.normalized_name);
  });
});

test("OFF entries without a Greek name keep their English name — no Greek placeholder is generated", async () => {
  const englishOnly = knowledgeRows.filter(
    (row) => row.source === "openfoodfacts" && !GREEK.test(row.short_description),
  );

  // Audited against static.openfoodfacts.org's additives.json: 68 entries
  // with no `el` name, 13 whose `el` name is itself English, and e126, which
  // the taxonomy has since dropped.
  assert.equal(englishOnly.length, 82);

  const { grounded, insights } = await groundAndBuild(
    englishOnly.map((row) => modelFinding(row.normalized_name, row.normalized_name)),
  );

  englishOnly.forEach((row, index) => {
    const insight = insights.find((item) => item.normalizedName === row.normalized_name)!;

    for (const field of [grounded[index].title, grounded[index].explanation, insight.shortDescription, insight.whyRated]) {
      assert.ok(!GREEK.test(field), `${row.normalized_name} got Greek text it has no source for: "${field}"`);
    }
  });
});

test("OFF import rows carry no safety judgement unless a curated scoring rule added one", () => {
  for (const row of knowledgeRows) {
    if (row.source === "openfoodfacts" && row.rule_severity === null) {
      assert.equal(row.concerns, "[]", `${row.normalized_name} has uncurated concerns`);
    }
  }
});

test("ingredients absent from the dataset get the unverified notice, not model-written Greek", async () => {
  // Real INCI names from the EUBOS label that have no knowledge entry.
  const unknown = [
    "Cetearyl",
    "Cetearyl Ethylhexanoate",
    "Isohexadecane",
    "Sodium Cetearyl Sulfate",
    "Serine",
  ].filter((name) => !aliasSet.has(name.toLowerCase()));

  assert.ok(unknown.includes("Cetearyl"));

  const { grounded, insights } = await groundAndBuild(
    unknown.map((name) => modelFinding(name, name.toLowerCase())),
  );

  unknown.forEach((name, index) => {
    const insight = insights.find((item) => item.normalizedName === name.toLowerCase())!;

    assert.equal(grounded[index].title, name);
    assert.equal(grounded[index].explanation, UNVERIFIED_INGREDIENT_DESCRIPTION);
    assert.equal(insight.shortDescription, "");
    assert.equal(insight.whyRated, UNVERIFIED_INGREDIENT_DESCRIPTION);
    assert.equal(insight.category, "other");
    assertNoModelText([grounded[index].title, grounded[index].explanation, insight.shortDescription, insight.whyRated], name);
  });
});

test("Cetearyl Alcohol resolves to its curated entry by INCI name and by its verified Greek name", async () => {
  const { insights } = await groundAndBuild([
    modelFinding("Cetearyl Alcohol", "cetearyl alcohol"),
    modelFinding("Κετεαρυλική Αλκοόλη", "κετεαρυλική αλκοόλη"),
  ]);

  const curated = knowledgeRows.find((row) => row.normalized_name === "cetearyl alcohol")!;

  for (const insight of insights) {
    assert.equal(insight.category, "emollient");
    assert.equal(insight.shortDescription, curated.short_description);
  }

  assert.ok(insights[0].aliases.includes("κετεαρυλική αλκοόλη"));
});
