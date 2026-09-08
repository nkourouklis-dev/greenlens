import assert from "node:assert/strict";
import test from "node:test";
import { filterIrrelevantSegments } from "./contentFilter";

test("keeps a clean comma-separated ingredient list untouched", () => {
  const result = filterIrrelevantSegments(
    "Aqua, Glycerin, Parfum, Tocopheryl Acetate",
    "ingredients",
  );

  assert.equal(
    result.text,
    "Aqua, Glycerin, Parfum, Tocopheryl Acetate",
  );
  assert.deepEqual(result.removedSegments, []);
});

test("drops legal/origin boilerplate in English mixed in with real ingredients", () => {
  const result = filterIrrelevantSegments(
    "Aqua, Glycerin, Made in EU, Parfum, Distributed by ACME Ltd",
    "ingredients",
  );

  assert.equal(result.text, "Aqua, Glycerin, Parfum");
  assert.ok(result.removedSegments.some((s) => s.includes("Made in EU")));
  assert.ok(
    result.removedSegments.some((s) => s.includes("Distributed by")),
  );
});

test("drops French legal/origin boilerplate", () => {
  const result = filterIrrelevantSegments(
    "Aqua, Glycerin, Fabriqué en U.E., Responsable légal: ACME SARL",
    "ingredients",
  );

  assert.equal(result.text, "Aqua, Glycerin");
});

test("drops Greek legal/origin boilerplate", () => {
  const result = filterIrrelevantSegments(
    "Νερό, Γλυκερίνη, Παρασκευάζεται στην Ελλάδα, Διανέμεται από ΑΒΓ ΑΕ",
    "ingredients",
  );

  assert.equal(result.text, "Νερό, Γλυκερίνη");
});

test("drops a bare 2-3 character packaging/recycling code", () => {
  const result = filterIrrelevantSegments(
    "Aqua, Glycerin, PET, EU",
    "ingredients",
  );

  assert.equal(result.text, "Aqua, Glycerin");
});

test("drops a lone digit or symbol segment with no letters", () => {
  const result = filterIrrelevantSegments(
    "Aqua, Glycerin, 05",
    "ingredients",
  );

  assert.equal(result.text, "Aqua, Glycerin");
});

test("does not drop a genuine 3-letter ingredient word", () => {
  const result = filterIrrelevantSegments(
    "Aqua, Oil, Wax",
    "ingredients",
  );

  assert.equal(result.text, "Aqua, Oil, Wax");
});

test("drops a segment that exactly matches the known product title", () => {
  const result = filterIrrelevantSegments(
    "Aqua, Glycerin, Herbarium Antiseptic Gel",
    "ingredients",
    { productTitle: "Herbarium Antiseptic Gel" },
  );

  assert.equal(result.text, "Aqua, Glycerin");
});

test("drops a segment that exactly matches the known brand", () => {
  const result = filterIrrelevantSegments(
    "Aqua, Glycerin, Herbarium",
    "ingredients",
    { brand: "Herbarium" },
  );

  assert.equal(result.text, "Aqua, Glycerin");
});

test("does not drop an ingredient that merely shares a word with the product title", () => {
  const result = filterIrrelevantSegments(
    "Extra Virgin Olive Oil, Salt, Vinegar",
    "ingredients",
    { productTitle: "Extra Virgin Olive Oil 500ml" },
  );

  assert.equal(result.text, "Extra Virgin Olive Oil, Salt, Vinegar");
});

test("does not filter short element symbols for chemical_composition", () => {
  const result = filterIrrelevantSegments(
    "Ca: 45 mg/L, Mg: 12 mg/L, Pb: 0.001 mg/L",
    "chemical_composition",
  );

  assert.equal(
    result.text,
    "Ca: 45 mg/L, Mg: 12 mg/L, Pb: 0.001 mg/L",
  );
  assert.deepEqual(result.removedSegments, []);
});

test("still drops legal/origin boilerplate lines for chemical_composition", () => {
  const result = filterIrrelevantSegments(
    "Ca: 45 mg/L\nMade in EU\nMg: 12 mg/L",
    "chemical_composition",
  );

  assert.equal(result.text, "Ca: 45 mg/L, Mg: 12 mg/L");
});

test("filters noise from a nutrition block while keeping real values", () => {
  const result = filterIrrelevantSegments(
    "Ενέργεια 450kcal\nΛιπαρά 12g\nMade in EU\nΣάκχαρα 8g",
    "nutrition",
  );

  assert.equal(
    result.text,
    "Ενέργεια 450kcal, Λιπαρά 12g, Σάκχαρα 8g",
  );
});

test("leaves a single-segment block with no delimiters alone unless it is itself boilerplate", () => {
  const clean = filterIrrelevantSegments(
    "A short nutrition note with no commas at all",
    "nutrition",
  );
  assert.equal(
    clean.text,
    "A short nutrition note with no commas at all",
  );

  const boilerplateOnly = filterIrrelevantSegments(
    "Made in EU",
    "ingredients",
  );
  assert.equal(boilerplateOnly.text, "");
});

test("handles empty input without throwing", () => {
  const result = filterIrrelevantSegments("", "ingredients");
  assert.equal(result.text, "");
  assert.deepEqual(result.removedSegments, []);
});
