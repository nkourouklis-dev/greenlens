import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDeterministicAnalysis,
  splitIngredientNames,
} from "./deterministicAnalysis";
import type { D1Like } from "./ingredientKnowledge";

const emptyDb: D1Like = {
  prepare: () => ({
    bind: () => ({
      all: async () => ({ results: [] }),
      first: async () => null,
    }),
  }),
} as unknown as D1Like;

test("food list: nesting, percentages and class prefixes are flattened", () => {
  const names = splitIngredientNames(
    "Φιλέτο στήθος κοτόπουλου 63%, πανάρισμα [αλεύρι σίτου, αλάτι, γαλακτωματοποιητής: κόμμι γκουάρ, χρωστικές ουσίες (κουρκουμίνη, εκχύλισμα πάπρικας)], νερό, ηλιέλαιο.",
  );

  assert.deepEqual(names, [
    "Φιλέτο στήθος κοτόπουλου",
    "πανάρισμα",
    "αλεύρι σίτου",
    "αλάτι",
    "κόμμι γκουάρ",
    "χρωστικές ουσίες",
    "κουρκουμίνη",
    "εκχύλισμα πάπρικας",
    "νερό",
    "ηλιέλαιο",
  ]);
});

test("a decimal comma is a number, not a separator", () => {
  assert.deepEqual(
    splitIngredientNames("κακάο σε σκόνη (0,7%), σιρόπι γλυκόζης-φρουκτόζης"),
    ["κακάο σε σκόνη", "σιρόπι γλυκόζης-φρουκτόζης"],
  );
});

test("cosmetic INCI list: Aqua (Water), CI colours and +/- markers", () => {
  const names = splitIngredientNames(
    "Aqua (Water), Glycerin, Cetearyl Alcohol, Parfum, Linalool +/- CI 77891",
  );

  assert.deepEqual(names, [
    "Aqua",
    "Water",
    "Glycerin",
    "Cetearyl Alcohol",
    "Parfum",
    "Linalool",
    "CI 77891",
  ]);
});

test("the analysis is complete without any model and caps findings at 12", async () => {
  const text = Array.from({ length: 30 }, (_, i) => `ingredient${i}`).join(", ");

  const result = await buildDeterministicAnalysis({
    ingredientText: text,
    ruleMatches: [],
    productType: "cosmetic",
    confidence: 0.9,
    db: emptyDb,
  });

  assert.equal(result.ingredientFindings.length, 12);
  assert.equal(result.productType, "cosmetic");
  assert.equal(result.confidence, 0.9);
  assert.ok(result.summary.length > 0);
});

test("a rule match is always flagged and ranked ahead of plain ingredients", async () => {
  const result = await buildDeterministicAnalysis({
    ingredientText: "νερό, ζάχαρη, αλάτι, φοινικέλαιο",
    ruleMatches: [
      {
        rule: {
          normalizedName: "palm oil",
          severity: "caution",
          penaltyPoints: 8,
          bulkWeighted: false,
          ruleGroup: null,
          shortDescription: "Φοινικέλαιο.",
          concerns: ["Υψηλά κορεσμένα λιπαρά"],
        },
        matchedAlias: "φοινικέλαιο",
        position: 3,
        weightedPoints: 8,
        declaredPercent: null,
      },
    ],
    productType: "food",
    confidence: 0.95,
    db: emptyDb,
  });

  assert.equal(result.ingredientFindings[0].ingredientName, "φοινικέλαιο");
  assert.equal(result.ingredientFindings[0].severity, "attention");
  assert.deepEqual(result.attentionItems, [
    "φοινικέλαιο: Υψηλά κορεσμένα λιπαρά",
  ]);
});
