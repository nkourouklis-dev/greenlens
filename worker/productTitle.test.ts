import assert from "node:assert/strict";
import test from "node:test";
import {
  collapseRepeatedTitle,
  composeDisplayTitle,
} from "../src/utils/productTitle";

// "LURPAK LURPAK" (5740900401655): the model returned brand "Lurpak" and name
// "LURPAK", and the two were joined without asking whether the second already
// said the first.
test("the brand is not repeated when the name is the brand", () => {
  assert.equal(composeDisplayTitle("Lurpak", "LURPAK"), "LURPAK");
  assert.equal(composeDisplayTitle("LURPAK", "  lurpak "), "lurpak");
});

test("the brand is not repeated when the name already contains it", () => {
  assert.equal(composeDisplayTitle("Lurpak", "Lurpak Soft με ελαιόλαδο"), "Lurpak Soft με ελαιόλαδο");
  assert.equal(composeDisplayTitle("Kaiser", "Pilsner Kaiser"), "Pilsner Kaiser");
});

test("it works across accents and Greek capitals", () => {
  assert.equal(composeDisplayTitle("ΔΕΛΤΑ", "Δέλτα Γάλα"), "Δέλτα Γάλα");
  assert.equal(composeDisplayTitle("Νουνού", "ΝΟΥΝΟΥ"), "ΝΟΥΝΟΥ");
});

test("different brand and name are both kept, in order", () => {
  assert.equal(composeDisplayTitle("Nestlé", "Clusters"), "Nestlé Clusters");
});

test("a brand is matched as whole words, not as a fragment of one", () => {
  assert.equal(composeDisplayTitle("Mi", "Milk"), "Mi Milk");
});

test("a missing half leaves the other alone", () => {
  assert.equal(composeDisplayTitle(null, "Clusters"), "Clusters");
  assert.equal(composeDisplayTitle("Lurpak", null), "Lurpak");
  assert.equal(composeDisplayTitle(undefined, undefined), "");
});

test("a title already stored twice is collapsed; anything else is untouched", () => {
  assert.equal(collapseRepeatedTitle("LURPAK LURPAK"), "LURPAK");
  assert.equal(collapseRepeatedTitle("Lurpak  lurpak"), "Lurpak");
  assert.equal(collapseRepeatedTitle("Coca Cola Coca Cola"), "Coca Cola");
  assert.equal(collapseRepeatedTitle("Coca Cola Zero"), "Coca Cola Zero");
});
