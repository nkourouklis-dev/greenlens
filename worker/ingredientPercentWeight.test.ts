import assert from "node:assert/strict";
import test from "node:test";
import { matchScoringRules, type RuleSet } from "./ingredientRules";

/**
 * Bulk-weighted penalties read the quantity the list declares, when it
 * declares one, instead of guessing it from the ingredient's place in the
 * list. Additive-type penalties stay flat: they are charged for being there,
 * and no label says how much of an emulsifier a product contains.
 */

function ruleSet(bulkWeighted: boolean): RuleSet {
  return {
    aliases: [
      {
        alias: "φοινικέλαιο",
        rule: {
          normalizedName: "palm oil",
          severity: "caution",
          penaltyPoints: 10,
          bulkWeighted,
          ruleGroup: null,
          shortDescription: "Φοινικέλαιο",
          concerns: [],
        },
      },
    ],
  };
}

function points(text: string, bulkWeighted = true): number | undefined {
  return matchScoringRules(text, ruleSet(bulkWeighted))[0]?.weightedPoints;
}

test("a large declared share weighs as much as the first list positions do", () => {
  // Fourth in the list would be ×1.2 by position; 30 % is "most of it".
  assert.equal(points("νερό, ζάχαρη, αλάτι, φοινικέλαιο 30%"), 16);
});

test("a trace share weighs less than any position would give it", () => {
  // Second in the list would be ×1.6 by position; 0,3 % is a trace.
  assert.equal(points("νερό, φοινικέλαιο (0,3%), ζάχαρη"), 5);
});

test("the middle of the ladder", () => {
  assert.equal(points("νερό, φοινικέλαιο 12%"), 12);
  assert.equal(points("νερό, φοινικέλαιο 2 %"), 10);
});

test("with no percentage the position still decides, as before", () => {
  assert.equal(points("φοινικέλαιο, νερό"), 16);
  assert.equal(points("νερό, ζάχαρη, αλάτι, φοινικέλαιο"), 12);
  assert.equal(points("νερό, ζάχαρη, αλάτι, γάλα, αλεύρι, φοινικέλαιο"), 10);
});

test("a percentage belongs to the ingredient before it, not the next segment", () => {
  // The 30 % is sugar's; the palm oil has none stated.
  assert.equal(points("νερό, φοινικέλαιο, ζάχαρη 30%"), 16);
});

test("a flat penalty ignores any percentage", () => {
  assert.equal(points("νερό, φοινικέλαιο 0,3%", false), 10);
  assert.equal(points("φοινικέλαιο 30%, νερό", false), 10);
});

test("the declared share is kept on the match", () => {
  const [match] = matchScoringRules("νερό, φοινικέλαιο 12,5%", ruleSet(true));

  assert.equal(match.declaredPercent, 12.5);
});
