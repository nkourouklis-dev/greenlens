import assert from "node:assert/strict";
import test from "node:test";
import { claimHighlights, detectLabelClaims, withLabelClaims } from "./labelClaims";

// Barcode 5214001318841, as Azure clipped it on the curved pack.
const FRONT = "ΧΩΡΙΣ ΓΛΟΥΤΕΝΗ & ΠΡΟΣΘΗΚΗ ΖΑΧΑΡΗΣ, ΜΕ ΒΑΣΙΛΙΚΟΥΣ ΧΟΥΡΜΑΔΕΣ";
const TAIL = "Αλάτι ΧΡΩΣΤΙΚΕΣ ΚΑΙ ΠΡΟΣΘΕΤΑ Coc ΟΡΙΣ ΣΥΝΤΗΡΗΤΙΚΑ, ΧΡΩΣΤΙΚΕΣ ΚΑΙ ΠΡΟΣΘΕΤΑ";

test("claims of absence become positives", () => {
  assert.deepEqual(claimHighlights(detectLabelClaims([FRONT, TAIL])), [
    "Χωρίς γλουτένη",
    "Χωρίς προστιθέμενη ζάχαρη",
    "Χωρίς συντηρητικά, χρωστικές και πρόσθετα",
  ]);
});

test("no claim, no positive", () => {
  assert.deepEqual(
    claimHighlights(detectLabelClaims(["Συστατικά: ζάχαρη, αλάτι, χρωστική E150"])),
    [],
  );
});

test("a caution that repeats the claim is dropped, an E-number stays", () => {
  const summary = withLabelClaims(
    {
      overallVerdict: "",
      safeIngredients: 0,
      cautionIngredients: 0,
      highImpactIngredients: 0,
      highlights: ["Πρωτεΐνη αρακά"],
      watchOutFor: ["Χρωστικές και πρόσθετα", "Χρωστική E150d"],
    },
    [TAIL],
  );

  assert.deepEqual(summary.watchOutFor, ["Χρωστική E150d"]);
  assert.equal(summary.highlights[0], "Χωρίς συντηρητικά, χρωστικές και πρόσθετα");
});

test("a gluten-free claim is detected and lifts only gluten out of the notice", async () => {
  const { buildAllergenNotice, withoutClaimedFreeGroups } = await import("./allergens");

  assert.equal(detectLabelClaims([FRONT]).noGluten, true);
  assert.equal(detectLabelClaims(["Συστατικά: αλεύρι σίτου"]).noGluten, false);

  const notice = buildAllergenNotice(["Φυτική Ίνα Βρώμης", "Γάλα"]);

  assert.deepEqual(notice?.keys, ["gluten", "milk"]);
  assert.deepEqual(withoutClaimedFreeGroups(notice, ["gluten"])?.keys, ["milk"]);
  assert.equal(
    withoutClaimedFreeGroups(buildAllergenNotice(["Φυτική Ίνα Βρώμης"]), ["gluten"]),
    null,
  );
});
