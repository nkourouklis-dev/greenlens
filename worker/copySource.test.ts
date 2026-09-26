import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDraftPrompt,
  copyWasEdited,
  readCopySource,
} from "./adminAssistant";
import { applyAssistantDraftCopy } from "./adminProducts";

/**
 * The catalogue copy follows the numbers on its own — after a scan, an
 * analysis, a recompute, a save that changed the score — but a person's
 * wording is never overwritten without their asking. What tells the two apart
 * is `copySource`, set by the assistant ("auto") or by a save that changed
 * the words ("manual").
 */

const stored = {
  summary: "Μαρμελάδα μήλου.",
  executiveSummary: {
    overallVerdict: "Βαθμολογείται με 64/100.",
    highlights: ["Χωρίς συντηρητικά"],
    watchOutFor: ["Σάκχαρα: 40 g ανά 100 g"],
  },
};

test("a save that leaves the words alone is not an edit, whatever else it changed", () => {
  assert.equal(
    copyWasEdited(stored, {
      ...stored,
      score: { score: 70 },
      sourceText: "Μήλο 51%",
    }),
    false,
  );
});

test("changing any of the four fields is an edit", () => {
  assert.equal(copyWasEdited(stored, { ...stored, summary: "Άλλο." }), true);

  assert.equal(
    copyWasEdited(stored, {
      ...stored,
      executiveSummary: { ...stored.executiveSummary, highlights: [] },
    }),
    true,
  );

  assert.equal(
    copyWasEdited(stored, {
      ...stored,
      executiveSummary: {
        ...stored.executiveSummary,
        overallVerdict: "Καλό προϊόν.",
      },
    }),
    true,
  );
});

test("whitespace around a field is not an edit", () => {
  assert.equal(
    copyWasEdited(stored, { ...stored, summary: "  Μαρμελάδα μήλου. " }),
    false,
  );
});

test("copySource is read back only when it is one of the two known values", () => {
  assert.equal(readCopySource({ copySource: "manual" }), "manual");
  assert.equal(readCopySource({ copySource: "auto" }), "auto");
  assert.equal(readCopySource({ copySource: "robot" }), null);
  assert.equal(readCopySource({}), null);
  assert.equal(readCopySource(null), null);
});

test("the draft prompt warns that the name may be misread and asks for a summary from the ingredients", () => {
  const prompt = buildDraftPrompt({
    productName: "St DALFOUR MýÑo & Kavéla",
    sourceText: "ΜΗΛΟ 51%, ΚΑΝΕΛΑ",
    findings: [],
    score: 64,
    band: "moderate",
  });

  assert.match(prompt, /ενδέχεται να έχει λάθη ανάγνωσης/);
  assert.match(prompt, /Μην αντιγράφεις το ΟΝΟΜΑ στο summary/);
});

test("a verified row is only written when the caller says its copy is not a person's", async () => {
  const calls: unknown[][] = [];

  const db = {
    prepare(sql: string) {
      const statement = {
        bind(...values: unknown[]) {
          calls.push([sql, ...values]);
          return statement;
        },
        async first() {
          return null;
        },
        async run() {
          return undefined;
        },
      };

      return statement;
    },
  };

  await applyAssistantDraftCopy(db, "1", { a: 1 });
  await applyAssistantDraftCopy(db, "2", { a: 1 }, { includeVerified: true });

  assert.match(String(calls[0][0]), /status != 'verified' OR \? = 1/);
  assert.equal(calls[0][3], 0);
  assert.equal(calls[1][3], 1);
});
