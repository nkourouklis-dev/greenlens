import test from "node:test";
import assert from "node:assert/strict";
import {
  matchScoringRules,
  type RuleSet,
  type ScoringRule,
} from "./ingredientRules";

function rule(
  normalizedName: string,
  penaltyPoints: number,
  overrides: Partial<ScoringRule> = {},
): ScoringRule {
  return {
    normalizedName,
    severity: "caution",
    penaltyPoints,
    bulkWeighted: false,
    ruleGroup: null,
    shortDescription: normalizedName,
    concerns: [],
    ...overrides,
  };
}

function ruleSet(
  entries: Array<[string, ScoringRule]>,
): RuleSet {
  return {
    aliases: entries
      .map(([alias, value]) => ({
        alias,
        rule: value,
      }))
      .sort(
        (left, right) =>
          right.alias.length - left.alias.length,
      ),
  };
}

const SUGAR = rule("sugar", 25, {
  severity: "high_concern",
  bulkWeighted: true,
  ruleGroup: "added_sugar",
});

const SWEETENERS = ruleSet([
  [
    "ασπαρτάμη",
    rule("aspartame", 15, {
      ruleGroup: "artificial_sweetener",
    }),
  ],
  [
    "ακεσουλφάμη κ",
    rule("acesulfame k", 15, {
      ruleGroup: "artificial_sweetener",
    }),
  ],
  [
    "κυκλαμικό νάτριο",
    rule("sodium cyclamate", 15, {
      ruleGroup: "artificial_sweetener",
    }),
  ],
  ["φωσφορικό οξύ", rule("phosphoric acid", 8)],
  ["ε 150d", rule("caramel colour e150d", 8)],
]);

test("matches a Greek ingredient in its declined form", () => {
  const matches = matchScoringRules(
    "Συστατικά: νερό, σιρόπι γλυκόζης-φρουκτόζης, αλάτι",
    ruleSet([
      [
        "σιρόπι γλυκόζης-φρουκτόζης",
        rule("glucose-fructose syrup", 28),
      ],
    ]),
  );

  assert.equal(matches.length, 1);
  assert.equal(
    matches[0].rule.normalizedName,
    "glucose-fructose syrup",
  );
});

test("does not match an alias buried inside a longer word", () => {
  const matches = matchScoringRules(
    "Συστατικά: αλευρι σιταριου ολικης",
    ruleSet([["αλάτι", rule("sodium chloride", 8)]]),
  );

  assert.equal(matches.length, 0);
});

test("a longer alias claims the text, so its parts do not match again", () => {
  const matches = matchScoringRules(
    "Συστατικά: νερό, σιρόπι γλυκόζης-φρουκτόζης",
    ruleSet([
      [
        "σιρόπι γλυκόζης-φρουκτόζης",
        rule("glucose-fructose syrup", 28, {
          ruleGroup: "added_sugar",
        }),
      ],
      [
        "φρουκτόζη",
        rule("fructose", 15, {
          ruleGroup: "added_sugar",
        }),
      ],
    ]),
  );

  assert.equal(matches.length, 1);
  assert.equal(
    matches[0].rule.normalizedName,
    "glucose-fructose syrup",
  );
});

test("charges a rule group once, at its costliest member", () => {
  const matches = matchScoringRules(
    "Συστατικά: νερό, γλυκαντικά (κυκλαμικό νάτριο, ακεσουλφάμη κ, ασπαρτάμη)",
    SWEETENERS,
  );

  const sweeteners = matches.filter(
    (match) =>
      match.rule.ruleGroup === "artificial_sweetener",
  );

  assert.equal(sweeteners.length, 1);
  assert.equal(sweeteners[0].weightedPoints, 15);
});

test("weights a bulk ingredient by its position in the list", () => {
  const early = matchScoringRules(
    "Συστατικά: νερό, ζάχαρη, αρωματικές ύλες",
    ruleSet([["ζάχαρη", SUGAR]]),
  );

  const late = matchScoringRules(
    "Συστατικά: νερό, αλεύρι, γάλα, κακάο, βανίλια, ζάχαρη",
    ruleSet([["ζάχαρη", SUGAR]]),
  );

  assert.equal(early[0].position, 1);
  assert.equal(early[0].weightedPoints, 40);

  assert.equal(late[0].position, 5);
  assert.equal(late[0].weightedPoints, 25);
});

test("a trace additive is not position-weighted", () => {
  const matches = matchScoringRules(
    "Συστατικά: νερό, φωσφορικό οξύ",
    ruleSet([
      ["φωσφορικό οξύ", rule("phosphoric acid", 8)],
    ]),
  );

  assert.equal(matches[0].weightedPoints, 8);
});

// The regression this whole layer exists for: scanned an hour apart, the
// full-sugar variant scored 96 and the zero-sugar one 92, because the model
// happened to flag one fewer item on the full-sugar run.
test("full-sugar cola is penalised far more than its zero-sugar variant", () => {
  const fullSugar = matchScoringRules(
    "Συστατικά: νερό, ζάχαρη, διοξείδιο του άνθρακα, χρωστική ε 150d, φωσφορικό οξύ, φυσικές αρωματικές ύλες",
    ruleSet([
      ["ζάχαρη", SUGAR],
      ["φωσφορικό οξύ", rule("phosphoric acid", 8)],
      ["ε 150d", rule("caramel colour e150d", 8)],
    ]),
  );

  const zeroSugar = matchScoringRules(
    "Συστατικά: νερό, διοξείδιο του άνθρακα, χρωστική ε 150d, φωσφορικό οξύ, γλυκαντικά (κυκλαμικό νάτριο, ακεσουλφάμη κ, ασπαρτάμη), φυσικές αρωματικές ύλες",
    SWEETENERS,
  );

  const total = (
    matches: ReturnType<typeof matchScoringRules>,
  ) =>
    matches.reduce(
      (sum, match) => sum + match.weightedPoints,
      0,
    );

  assert.equal(total(fullSugar), 56);
  assert.equal(total(zeroSugar), 31);

  assert.ok(
    total(fullSugar) > total(zeroSugar),
    "full-sugar cola must never outscore its zero-sugar variant",
  );
});

test("an empty rule set matches nothing rather than throwing", () => {
  assert.deepEqual(
    matchScoringRules("Συστατικά: νερό, ζάχαρη", {
      aliases: [],
    }),
    [],
  );
});
