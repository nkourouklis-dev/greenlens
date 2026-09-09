import assert from "node:assert/strict";
import test from "node:test";
import {
  buildExecutiveSummary,
  buildIngredientInsights,
} from "./ingredientInsights";
import type { D1Like, D1PreparedStatementLike } from "./ingredientKnowledge";
import { classifyAllergenFindings } from "./allergens";
import { scoreInterpretation } from "./scoring";
import type { WorkerAnalysisResult } from "./analysis";

interface FakeEntry {
  category: string;
  short_description: string;
  benefits: string[];
  concerns: string[];
  evidence_level: string;
  aliases: string[];
}

// Stands in for D1 in a plain-Node test run (tsx --test, not the Workers
// runtime, so a real D1Database can't exist here). Mirrors the exact two
// queries lookupIngredientKnowledgeBatch issues: a join resolving aliases
// to their canonical entry, then a second lookup for that entry's full
// alias list — same shape the real ingredient_knowledge/ingredient_aliases
// tables answer.
function createFakeD1(entries: Record<string, FakeEntry>): D1Like {
  const aliasToCanonical = new Map<string, string>();

  for (const [canonical, entry] of Object.entries(entries)) {
    aliasToCanonical.set(canonical, canonical);

    for (const alias of entry.aliases) {
      aliasToCanonical.set(alias, canonical);
    }
  }

  return {
    prepare(sql: string): D1PreparedStatementLike {
      const isJoinQuery = sql.includes("JOIN ingredient_knowledge");

      const statement: D1PreparedStatementLike = {
        bind(...values: unknown[]): D1PreparedStatementLike {
          const boundValues = values as string[];

          return {
            bind: statement.bind,
            async all<T>() {
              if (isJoinQuery) {
                const results = boundValues.flatMap((alias) => {
                  const canonical = aliasToCanonical.get(alias);
                  const entry = canonical ? entries[canonical] : undefined;

                  if (!canonical || !entry) {
                    return [];
                  }

                  return [
                    {
                      alias,
                      normalized_name: canonical,
                      category: entry.category,
                      short_description: entry.short_description,
                      benefits: JSON.stringify(entry.benefits),
                      concerns: JSON.stringify(entry.concerns),
                      evidence_level: entry.evidence_level,
                    },
                  ];
                });

                return { results: results as T[] };
              }

              const results = boundValues.flatMap((canonical) => {
                const entry = entries[canonical];

                if (!entry) {
                  return [];
                }

                return [
                  { alias: canonical, normalized_name: canonical },
                  ...entry.aliases.map((alias) => ({
                    alias,
                    normalized_name: canonical,
                  })),
                ];
              });

              return { results: results as T[] };
            },
          };
        },
        all<T>() {
          return statement.bind().all<T>();
        },
      };

      return statement;
    },
  };
}

// Only "limonene" is seeded — matches the one static-registry entry these
// tests actually rely on; every other ingredient here (aqua, parfum,
// benzalkonium chloride) is deliberately left unmatched to exercise the
// no-curated-match fallback path.
const fakeDb = createFakeD1({
  limonene: {
    category: "fragrance",
    short_description:
      "Αρωματική ουσία φυσικής προέλευσης, συνηθισμένη σε εσπεριδοειδή.",
    benefits: ["Προσδίδει φρέσκο, εσπεριδοειδές άρωμα"],
    concerns: ["Αναγνωρισμένο αλλεργιογόνο αρωμάτων στην ΕΕ"],
    evidence_level: "high",
    aliases: ["d-limonene"],
  },
});

const base: WorkerAnalysisResult = {
  productType: "cosmetic",
  summary: "Δοκιμαστική περίληψη.",
  positives: ["Δεν εντοπίστηκαν παραβένια"],
  attentionItems: ["Περιέχει συνθετικό άρωμα"],
  potentialAllergens: ["Limonene", "Linalool"],
  ingredientFindings: [
    {
      ingredientName: "Aqua",
      normalizedName: "aqua",
      severity: "info",
      title: "Νερό",
      explanation: "Βάση του προϊόντος.",
      evidenceType: "none",
      sourceName: null,
      sourceUrl: null,
      confidence: 0.5,
    },
    {
      ingredientName: "Parfum",
      normalizedName: "parfum",
      severity: "attention",
      title: "Άρωμα",
      explanation: "Μείγμα αρωματικών ουσιών.",
      evidenceType: "label",
      sourceName: null,
      sourceUrl: null,
      confidence: 0.8,
    },
    {
      ingredientName: "Limonene",
      normalizedName: "limonene",
      severity: "attention",
      title: "Limonene",
      explanation: "Γνωστό αλλεργιογόνο αρωμάτων.",
      evidenceType: "regulatory",
      sourceName: null,
      sourceUrl: null,
      confidence: 0.9,
    },
  ],
  insufficientDataReasons: [],
  confidence: 0.8,
};

const validText =
  "Aqua, Parfum, Limonene, Linalool, Glycerin";

test("insights carry a scoreImpact that matches the Worker's own deductions", async () => {
  const score = scoreInterpretation(validText, 0.9, base);
  const insights = await buildIngredientInsights(base, score, fakeDb);

  const parfum = insights.find((insight) => insight.normalizedName === "parfum");
  const matchingDeduction = score.deductions.find((deduction) => deduction.code === "attention:parfum");

  assert.ok(parfum);
  assert.ok(matchingDeduction);
  assert.equal(parfum?.scoreImpact, -matchingDeduction!.points);
});

test("ingredients with no deduction get a zero score impact", async () => {
  const score = scoreInterpretation(validText, 0.9, base);
  const insights = await buildIngredientInsights(base, score, fakeDb);

  const aqua = insights.find((insight) => insight.normalizedName === "aqua");

  assert.equal(aqua?.scoreImpact, 0);
  assert.equal(aqua?.rating, "neutral");
});

test("known ingredients are enriched from D1", async () => {
  const score = scoreInterpretation(validText, 0.9, base);
  const insights = await buildIngredientInsights(base, score, fakeDb);

  const limonene = insights.find((insight) => insight.normalizedName === "limonene");

  assert.equal(limonene?.category, "fragrance");
  assert.ok(limonene && limonene.concerns.length > 0);
  assert.equal(limonene?.evidenceLevel, "high");
});

test("deduplicates repeated ingredient findings", async () => {
  const score = scoreInterpretation(validText, 0.9, {
    ...base,
    ingredientFindings: [
      ...base.ingredientFindings,
      base.ingredientFindings[1],
    ],
  });

  const insights = await buildIngredientInsights(
    {
      ...base,
      ingredientFindings: [
        ...base.ingredientFindings,
        base.ingredientFindings[1],
      ],
    },
    score,
    fakeDb,
  );

  assert.equal(
    insights.filter((insight) => insight.normalizedName === "parfum").length,
    1,
  );
});

test("executive summary counts ingredients by severity", async () => {
  const score = scoreInterpretation(validText, 0.9, base);
  const insights = await buildIngredientInsights(base, score, fakeDb);
  const summary = buildExecutiveSummary(base, score, insights);

  assert.equal(summary.safeIngredients, 1);
  assert.equal(summary.cautionIngredients, 2);
  assert.equal(summary.highImpactIngredients, 0);
});

test("executive summary highlights absence of parabens and sulfates", async () => {
  const score = scoreInterpretation(validText, 0.9, base);
  const insights = await buildIngredientInsights(base, score, fakeDb);
  const summary = buildExecutiveSummary(base, score, insights);

  assert.ok(summary.highlights.includes("Δεν εντοπίστηκαν parabens"));
  assert.ok(summary.highlights.includes("Δεν εντοπίστηκαν sulfates"));
});

test("executive summary no longer repeats allergens in watchOutFor", async () => {
  // Declared allergens get their own notice above the summary now (see
  // worker/allergens.ts) instead of a generic watchOutFor line, so a
  // near-duplicate sentence doesn't appear in both places.
  const score = scoreInterpretation(validText, 0.9, base);
  const insights = await buildIngredientInsights(base, score, fakeDb);
  const summary = buildExecutiveSummary(base, score, insights);

  assert.ok(
    !summary.watchOutFor.some((item) => item.includes("αλλεργιογόνα")),
  );
});

test("cosmetic fragrance allergens outside the EU food-14 still surface in the notice", () => {
  // Limonene/Linalool are on the EU's separate 26-substance cosmetic
  // fragrance-allergen list, not the food list this registry recognises by
  // group — they must still show up, just via the raw-name fallback rather
  // than a matched group.
  const { notice } = classifyAllergenFindings(
    base.ingredientFindings,
    (finding) => finding.ingredientName,
    base.potentialAllergens,
  );

  assert.ok(notice !== null);
  assert.ok(notice?.labels.includes("Limonene"));
  assert.ok(notice?.labels.includes("Linalool"));
});

test("does not repeat the explanation as a concern for an unregistered ingredient", async () => {
  // Benzalkonium Chloride has no entry in ingredient_knowledge (D1).
  // Before this fix, the fallback set concerns to [finding.explanation] —
  // the exact same sentence whyRated already shows — so the card rendered
  // it a second time under "ΣΗΜΕΙΑ ΠΡΟΣΟΧΗΣ" for no added information.
  const unregistered: WorkerAnalysisResult = {
    ...base,
    ingredientFindings: [
      {
        ingredientName: "Benzalkonium Chloride",
        normalizedName: "benzalkonium chloride",
        severity: "attention",
        title: "Προσοχή σε αλλεργίες",
        explanation: "Μπορεί να προκαλέσει αλλεργικές αντιδράσεις.",
        evidenceType: "label",
        sourceName: null,
        sourceUrl: null,
        confidence: 0.8,
      },
    ],
  };

  const score = scoreInterpretation(validText, 0.9, unregistered);
  const insights = await buildIngredientInsights(unregistered, score, fakeDb);
  const insight = insights[0];

  assert.equal(insight.whyRated, "Μπορεί να προκαλέσει αλλεργικές αντιδράσεις.");
  assert.deepEqual(insight.concerns, []);
  assert.deepEqual(insight.benefits, []);
});

test("a D1 failure degrades to no curated match instead of throwing", async () => {
  const throwingDb: D1Like = {
    prepare() {
      throw new Error("simulated D1 outage");
    },
  };

  const score = scoreInterpretation(validText, 0.9, base);
  const insights = await buildIngredientInsights(base, score, throwingDb);

  const limonene = insights.find((insight) => insight.normalizedName === "limonene");

  // No crash and no curated data leaks through — same shape as a genuine
  // no-match, not the fake DB's fixture data.
  assert.ok(limonene);
  assert.deepEqual(limonene?.concerns, []);
  assert.deepEqual(limonene?.benefits, []);
});

test("executive summary verdict matches the score band", async () => {
  const score = scoreInterpretation(validText, 0.9, base);
  const insights = await buildIngredientInsights(base, score, fakeDb);
  const summary = buildExecutiveSummary(base, score, insights);

  assert.equal(typeof summary.overallVerdict, "string");
  assert.ok(summary.overallVerdict.length > 0);
});

// Rule deductions are keyed on the curated ingredient ("high_concern:sugar")
// while the model names the same thing freely ("Γλυκαντικά και ζάχαρη").
// Before these were linked, every card reported a zero impact while the score
// breakdown listed real penalties.
test("a rule deduction reaches the card for the ingredient it penalised", async () => {
  const analysis: WorkerAnalysisResult = {
    ...base,
    productType: "food",
    ingredientFindings: [
      {
        ingredientName: "Ζάχαρη",
        normalizedName: "ζάχαρη",
        severity: "info",
        title: "Γλυκαντικό",
        explanation: "Προσθέτει γλυκύτητα.",
        evidenceType: "none",
        sourceName: null,
        sourceUrl: null,
        confidence: 0.5,
      },
    ],
  };

  const ruleMatches = [
    {
      rule: {
        normalizedName: "sugar",
        severity: "high_concern" as const,
        penaltyPoints: 25,
        bulkWeighted: true,
        ruleGroup: "added_sugar",
        shortDescription: "Πρόσθετη ζάχαρη",
        concerns: ["Υψηλή πρόσληψη συνδέεται με παχυσαρκία"],
      },
      matchedAlias: "ζάχαρη",
      position: 1,
      weightedPoints: 40,
    },
  ];

  const score = scoreInterpretation(
    "Νερό, ζάχαρη, αρωματικές ύλες",
    0.9,
    analysis,
    { ruleMatches },
  );

  const insights = await buildIngredientInsights(
    analysis,
    score,
    fakeDb,
    ruleMatches,
  );

  assert.equal(score.score, 60);
  assert.equal(insights[0].scoreImpact, -40);

  // The model called it merely informational; the rule outranks that.
  assert.equal(insights[0].rating, "caution");
});
