import assert from "node:assert/strict";
import test from "node:test";
import { isGarbled, isUnusableCopy, isVague, usableCopyLines } from "./copyQuality";
import { parseAssistantDraft } from "./adminAssistant";

test("a word with an underscore or mixed Greek and Latin letters is garbled", () => {
  assert.equal(isGarbled("Φυσικά εκ_extracts"), true);
  assert.equal(isGarbled("Φυσικάextracts"), true);
});

test("legitimate mixed lines are not garbled", () => {
  assert.equal(isGarbled("Δεν εντοπίστηκαν parabens"), false);
  assert.equal(isGarbled("Βιταμίνη C και E330"), false);
  assert.equal(isGarbled("Linalool: αλλεργιογόνο άρωμα"), false);
});

test("lines that name no ingredient and no reason are vague", () => {
  assert.equal(isVague("Χημικές ουσίες"), true);
  assert.equal(isVague("Πτητικές οργανικές ενώσεις."), true);
  assert.equal(isVague("Θρεπτικά συστατικά"), true);
  assert.equal(isVague("Sodium Laureth Sulfate: ερεθίζει το δέρμα"), false);
});

test("usableCopyLines keeps only lines a person should read", () => {
  assert.deepEqual(
    usableCopyLines([
      "Φυσικά εκ_extracts",
      "Θρεπτικά συστατικά",
      "Δεν εντοπίστηκαν parabens",
      "",
    ]),
    ["Δεν εντοπίστηκαν parabens"],
  );
  assert.equal(isUnusableCopy("   "), true);
});

test("an assistant draft drops broken and vague lines", () => {
  const draft = parseAssistantDraft(
    JSON.stringify({
      summary: "Κρέμα προσώπου για ευαίσθητο δέρμα.",
      overallVerdict: "Καλή επιλογή.",
      highlights: ["Φυσικά εκ_extracts", "Χωρίς parabens"],
      watchOutFor: ["Χημικές ουσίες"],
    }),
  );

  assert.deepEqual(draft?.highlights, ["Χωρίς parabens"]);
  assert.deepEqual(draft?.watchOutFor, []);
});
