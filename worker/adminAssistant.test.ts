import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDraftPrompt,
  buildReportPrompt,
  parseAssistantDraft,
  type CatalogueFacts,
} from "./adminAssistant";

const facts: CatalogueFacts = {
  totalProducts: 12,
  byStatus: [{ status: "verified", count: 5 }],
  byCategory: [{ category: "ingredients", count: 12 }],
  byBand: [{ band: "good", count: 7 }],
  averageScore: 68,
  pendingReview: 7,
  unappliedVersions: 2,
  recentlyUpdated: [],
};

test("the report prompt carries the computed facts verbatim", () => {
  const prompt = buildReportPrompt(facts, "Τι περιμένει έλεγχο;");

  assert.ok(prompt.includes(JSON.stringify(facts)));
  assert.ok(prompt.includes("Τι περιμένει έλεγχο;"));
  assert.ok(prompt.includes("μόνο αριθμούς"));
});

test("the draft prompt lists the findings it may talk about", () => {
  const prompt = buildDraftPrompt({
    productName: "Μπάρα βρώμης",
    sourceText: "Βρώμη, ζάχαρη, αλάτι",
    findings: [
      {
        ingredientName: "Ζάχαρη",
        severity: "attention",
        title: "Προστιθέμενο σάκχαρο",
      },
    ],
    score: 61,
    band: "moderate",
  });

  assert.ok(prompt.includes("Βρώμη, ζάχαρη, αλάτι"));
  assert.ok(prompt.includes("Ζάχαρη [attention]"));
  assert.ok(prompt.includes("Μην αναφέρεις συστατικό"));
});

test("a draft wrapped in prose and code fences still parses", () => {
  const draft = parseAssistantDraft(
    'Ορίστε:\n```json\n{"summary":"Μπάρα δημητριακών.","overallVerdict":"Καλή επιλογή.","highlights":["Πηγή ινών"],"watchOutFor":[]}\n```',
  );

  assert.ok(draft);
  assert.equal(draft.summary, "Μπάρα δημητριακών.");
  assert.deepEqual(draft.highlights, ["Πηγή ινών"]);
  assert.deepEqual(draft.watchOutFor, []);
});

test("non-string list entries are dropped instead of rendered", () => {
  const draft = parseAssistantDraft(
    '{"summary":"Κείμενο.","overallVerdict":"","highlights":["Καλό",7,null,"  "],"watchOutFor":"όχι πίνακας"}',
  );

  assert.ok(draft);
  assert.deepEqual(draft.highlights, ["Καλό"]);
  assert.deepEqual(draft.watchOutFor, []);
});

test("output with no usable text is rejected", () => {
  assert.equal(parseAssistantDraft("Δεν μπορώ να βοηθήσω."), null);
  assert.equal(parseAssistantDraft('{"highlights":["a"]}'), null);
});
