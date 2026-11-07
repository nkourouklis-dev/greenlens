import assert from "node:assert/strict";
import test from "node:test";
import { reviewState, splitAroundBlock } from "../src/utils/reviewState";

const base = { confidence: 0.95, categoryOverride: undefined, isMerge: false };

// The Lacta white chocolate reading from 2026-11-07: list + table, garbled heading.
const mixedLabel =
  "Συστατικά: Ζάχαρη, φοινικέλαιο, βούτυρο κακάο, αλεύρι ΣΙΤΟΥ, αλάτι.\nΚαθαρό βάρος:\n℮ 100 g\nΔιαθρεπτική Επισήμανση\n100 g\nΕνέργεια\n2339 kJ / 560 kcal\nΛιπαρά\n34 g\nεκ των οποίων κορεσμένα\n19 g\nΥδατάνθρακες\n59 g\nεκ των οποίων σάκχαρα\n54 g\nΠρωτεΐνες\n3,8 g\nΑλάτι\n0,32 g";

test("a list with a table is ready, never an error", () => {
  const state = reviewState({ ...base, text: mixedLabel });

  assert.equal(state.kind, "ready");
  assert.equal(state.canContinue, true);
  assert.equal(state.hasTable, true);
  assert.equal(state.suggestedCategory, "ingredients");
  assert.ok(state.ingredientBlock?.startsWith("Ζάχαρη"));
});

test("a cosmetic INCI list is ready", () => {
  const state = reviewState({
    ...base,
    text: "Ingredients: Aqua, Glycerin, Cetearyl Alcohol, Parfum, Phenoxyethanol, Linalool.",
  });

  assert.equal(state.kind, "ready");
  assert.equal(state.hasTable, false);
});

test("a table alone offers both choices and suggests scoring it as nutrition", () => {
  const state = reviewState({
    ...base,
    text: "ΔΙΑΤΡΟΦΙΚΗ ΕΠΙΣΗΜΑΝΣΗ ΑΝΑ 100g\nΕνέργεια\n280kJ /67kcal\nΛιπαρά\n3,7g\nΕκ των οποίων κορεσμένα\n2,8g\nΥδατάνθρακες\n4,8g\nΕκ των οποίων σάκχαρα\n4,8g\nΠρωτεΐνες\n3,6g\nΑλάτι\n0,1g",
  });

  assert.equal(state.kind, "table_only");
  assert.equal(state.canContinue, true);
  assert.equal(state.suggestedCategory, "nutrition");
});

test("a front-of-pack photo with no data asks for a retake", () => {
  const state = reviewState({
    ...base,
    text: "Attiki\nΠίττας\nαπό το 1928\nμέλι ελάτης\nελληνικό",
  });

  assert.equal(state.kind, "nothing");
  assert.equal(state.canContinue, false);
});

test("a two-item list is flagged as possibly cut off but can continue", () => {
  const state = reviewState({ ...base, text: "Συστατικά: Νερό, αλάτι." });

  assert.equal(state.kind, "incomplete");
  assert.equal(state.canContinue, true);
});

test("an explicit category or a merge is respected", () => {
  assert.equal(
    reviewState({ ...base, text: "κάτι", categoryOverride: "nutrition" }).kind,
    "ready",
  );
  assert.equal(reviewState({ ...base, text: "κάτι", isMerge: true }).kind, "ready");
});

test("the detected block is highlighted only when it is verbatim", () => {
  assert.deepEqual(splitAroundBlock("a b c", "b"), { before: "a ", block: "b", after: " c" });
  assert.equal(splitAroundBlock("a b c", "x"), null);
  assert.equal(splitAroundBlock("a b c", null), null);
});
