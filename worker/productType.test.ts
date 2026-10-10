import assert from "node:assert/strict";
import test from "node:test";
import { detectProductType } from "./productType";

test("a barrier cream list is a cosmetic, so no nutrition table is asked for", () => {
  assert.equal(
    detectProductType(
      "Aqua, Paraffinum liquidum, Zinc oxide, Paraffin, Lanolin, Ozokerite, Sorbitan sesquioleate, Benzyl benzoate, Synthetic beeswax, Benzyl alcohol, Propylene glycol, Parfum, BHA, Citric acid, BHT",
    ),
    "cosmetic",
  );
});

test("a drink list stays a food", () => {
  assert.equal(
    detectProductType("water, carbon dioxide, sweeteners: sucralose, sugar"),
    "food",
  );
});
