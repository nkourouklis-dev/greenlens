import assert from "node:assert/strict";
import test from "node:test";
import type { WorkerAnalysisResult } from "./analysis";
import type {
  D1Like,
  D1PreparedStatementLike,
} from "./ingredientKnowledge";
import {
  ingredientTextFromFindings,
  rescoreIngredientsResult,
  syncEnvelopeScoreMentions,
  syncScoreMentions,
} from "./rescore";
import type { WorkerScore } from "./scoring";
import { validateVerifiedAnalysisResult } from "./adminProducts";

interface FakeRuleRow {
  alias: string;
  normalized_name: string;
  rule_severity: string;
  penalty_points: number;
  bulk_weighted: number;
  rule_group: string | null;
  short_description: string;
  concerns: string;
}

const SUGAR_ROW: FakeRuleRow = {
  alias: "ζάχαρη",
  normalized_name: "sugar",
  rule_severity: "high_concern",
  penalty_points: 25,
  bulk_weighted: 1,
  rule_group: "added_sugar",
  short_description: "Προστιθέμενη ζάχαρη",
  concerns: JSON.stringify(["Υψηλή πρόσληψη προστιθέμενων σακχάρων"]),
};

/**
 * Answers the scoring-rules query and nothing else — the knowledge lookup
 * behind buildIngredientInsights degrades to "no curated entry" on an empty
 * result, which is all these tests need from it.
 */
function createFakeD1(rows: FakeRuleRow[]): D1Like {
  return {
    prepare(sql: string): D1PreparedStatementLike {
      const isRulesQuery = sql.includes("penalty_points > 0");

      const statement: D1PreparedStatementLike = {
        bind: () => statement,
        async first<T>() {
          return null as T | null;
        },
        async run() {
          return undefined;
        },
        async all<T>() {
          return {
            results: (isRulesQuery ? rows : []) as T[],
          };
        },
      };

      return statement;
    },
  };
}

const sugarFinding = {
  ingredientName: "Ζάχαρη",
  normalizedName: "sugar",
  severity: "attention" as const,
  title: "Ζάχαρη",
  explanation: "Προστιθέμενο σάκχαρο.",
  evidenceType: "label" as const,
  sourceName: null,
  sourceUrl: null,
  confidence: 0.9,
};

const oatFinding = {
  ingredientName: "Βρώμη",
  normalizedName: "oats",
  severity: "positive" as const,
  title: "Βρώμη",
  explanation: "Πηγή φυτικών ινών.",
  evidenceType: "label" as const,
  sourceName: null,
  sourceUrl: null,
  confidence: 0.9,
};

const analysis: WorkerAnalysisResult = {
  productType: "food",
  summary: "Μπάρα δημητριακών.",
  positives: [],
  attentionItems: [],
  potentialAllergens: [],
  ingredientFindings: [sugarFinding, oatFinding],
  insufficientDataReasons: [],
  confidence: 0.9,
};

test("scores from the label text, not from a submitted score", async () => {
  const { score } = await rescoreIngredientsResult(
    createFakeD1([SUGAR_ROW]),
    analysis,
    "Ζάχαρη, βρώμη, αλάτι",
  );

  // 25 penalty points, weighted 1.6 for a first-position ingredient.
  assert.equal(score.score, 60);
  assert.equal(score.band, "moderate");
  assert.deepEqual(
    score.deductions.map((deduction) => deduction.code),
    ["high_concern:sugar"],
  );
});

test("text without the rule ingredient scores higher", async () => {
  const withSugar = await rescoreIngredientsResult(
    createFakeD1([SUGAR_ROW]),
    analysis,
    "Ζάχαρη, βρώμη, αλάτι",
  );

  const corrected = await rescoreIngredientsResult(
    createFakeD1([SUGAR_ROW]),
    analysis,
    "Βρώμη, αλάτι, κανέλα",
  );

  assert.ok(
    !corrected.score.deductions.some(
      (deduction) => deduction.code === "high_concern:sugar",
    ),
  );
  assert.ok(
    (corrected.score.score ?? 0) > (withSugar.score.score ?? 0),
  );
});

test("position weighting follows the edited text", async () => {
  const first = await rescoreIngredientsResult(
    createFakeD1([SUGAR_ROW]),
    analysis,
    "Ζάχαρη, βρώμη, αλάτι",
  );

  const last = await rescoreIngredientsResult(
    createFakeD1([SUGAR_ROW]),
    analysis,
    "Βρώμη, αλάτι, κανέλα, ζάχαρη",
  );

  assert.ok(
    (last.score.score ?? 0) > (first.score.score ?? 0),
    "an ingredient listed last is present in smaller quantity",
  );
});

test("insights carry the recomputed deduction", async () => {
  const { ingredientInsights } = await rescoreIngredientsResult(
    createFakeD1([SUGAR_ROW]),
    analysis,
    "Ζάχαρη, βρώμη, αλάτι",
  );

  const sugar = ingredientInsights.find(
    (insight) => insight.normalizedName === "sugar",
  );

  assert.ok(sugar);
  assert.ok(sugar.scoreImpact < 0);
});

test("empty text yields no score rather than a stale one", async () => {
  const { score } = await rescoreIngredientsResult(
    createFakeD1([SUGAR_ROW]),
    analysis,
    "",
  );

  assert.equal(score.score, null);
  assert.equal(score.band, "insufficient_data");
});

test("findings fallback keeps label order and comma separation", () =>
  assert.equal(
    ingredientTextFromFindings(analysis),
    "Ζάχαρη, Βρώμη",
  ));

test("a submission without sourceText is rejected", () =>
  assert.equal(
    validateVerifiedAnalysisResult({
      ...analysis,
      executiveSummary: { overallVerdict: "x", highlights: [] },
    }),
    null,
  ));

test("a submission's own score is not carried into storage", () => {
  const validated = validateVerifiedAnalysisResult({
    ...analysis,
    sourceText: "Ζάχαρη, βρώμη",
    score: { score: 99, band: "excellent" },
    executiveSummary: { overallVerdict: "x", highlights: [] },
  });

  assert.ok(validated);
  assert.equal(validated.sourceText, "Ζάχαρη, βρώμη");
  assert.equal(validated.envelope.score, undefined);
});

function fakeScore(
  score: number | null,
  band: WorkerScore["band"],
): WorkerScore {
  return { score, band, deductions: [] } as WorkerScore;
}

test("a quoted score is rewritten to the recomputed one", () =>
  assert.equal(
    syncScoreMentions(
      "Βαθμολογείται με 92/100 για την εξαιρετική του σύνθεση.",
      95,
      "Εξαιρετική επιλογή",
    ),
    "Βαθμολογείται με 95/100 για την εξαιρετική του σύνθεση.",
  ));

test("a score written without /100 is rewritten too", () =>
  assert.equal(
    syncScoreMentions("Βαθμολογία: 92 στα συστατικά.", 78, "Καλή επιλογή"),
    "Βαθμολογία: 78 στα συστατικά.",
  ));

test("prose without a score claim is left untouched", () => {
  const text = "Περιέχει 100 γρ. βρώμης ανά συσκευασία.";

  assert.equal(
    syncScoreMentions(text, 40, "Μέτρια επιλογή"),
    text,
  );
});

test("a score claim is dropped when the recompute has no score", () =>
  assert.equal(
    syncScoreMentions(
      "Καλή σύνθεση. Βαθμολογείται με 92/100.",
      null,
      "Ανεπαρκή στοιχεία",
    ),
    "Καλή σύνθεση.",
  ));

test("a text that was only a score claim falls back to the band verdict", () =>
  assert.equal(
    syncScoreMentions(
      "Βαθμολογείται με 92/100.",
      null,
      "Ανεπαρκή στοιχεία",
    ),
    "Ανεπαρκή στοιχεία",
  ));

test("the whole envelope's free text follows the new score", () => {
  const synced = syncEnvelopeScoreMentions(
    {
      summary: "Μπάρα δημητριακών.",
      executiveSummary: {
        overallVerdict: "Βαθμολογείται με 92/100.",
        highlights: ["Πηγή ινών", "Σκορ 92/100"],
        watchOutFor: [],
      },
    },
    fakeScore(95, "excellent"),
  );

  const summary = synced.executiveSummary as Record<string, unknown>;

  assert.equal(synced.summary, "Μπάρα δημητριακών.");
  assert.equal(summary.overallVerdict, "Βαθμολογείται με 95/100.");
  assert.deepEqual(summary.highlights, [
    "Πηγή ινών",
    "Σκορ 95/100",
  ]);
});
