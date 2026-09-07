import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAllergenNotice,
  classifyAllergenFindings,
  isAllergenDeclarationOnly,
  matchAllergenGroup,
  withoutAllergenOnlyItems,
} from "./allergens";

const finding = (over: Partial<{
  ingredientName: string;
  normalizedName: string;
  severity: "positive" | "info" | "attention" | "high_attention" | "unknown";
  title: string;
  explanation: string;
}> = {}) => ({
  ingredientName: "Πρωτεΐνη σίτου",
  normalizedName: "wheat protein",
  severity: "attention" as const,
  title: "Προσοχή σε σιτηρά",
  explanation: "Μπορεί να προκαλέσει αλλεργία.",
  ...over,
});

const displayName = (value: { ingredientName: string }) => value.ingredientName;

test("recognises Greek allergen names regardless of accents", () => {
  assert.equal(matchAllergenGroup("Πρωτεΐνη σίτου")?.key, "gluten");
  assert.equal(matchAllergenGroup("Γάλα")?.key, "milk");
  assert.equal(matchAllergenGroup("Αυγό")?.key, "eggs");
  assert.equal(matchAllergenGroup("Σουσάμι")?.key, "sesame");
  assert.equal(matchAllergenGroup("Αμύγδαλα")?.key, "nuts");
});

test("recognises English and E-number allergen names", () => {
  assert.equal(matchAllergenGroup("sulphur dioxide")?.key, "sulphites");
  assert.equal(matchAllergenGroup("E220")?.key, "sulphites");
  assert.equal(matchAllergenGroup("soy lecithin")?.key, "soybeans");
});

test("does not mistake look-alikes for allergens", () => {
  assert.equal(matchAllergenGroup("Γαλακτωματοποιητής"), null);
  assert.equal(matchAllergenGroup("Γαλακτικό οξύ"), null);
  assert.equal(matchAllergenGroup("Αλεύρι ρυζιού"), null);
  assert.equal(matchAllergenGroup("Ηλιόσπορος"), null);
  assert.equal(matchAllergenGroup("Μέλι"), null);
  assert.equal(matchAllergenGroup("Μελάσα"), null);
  assert.equal(matchAllergenGroup("Κανέλα"), null);
});

test("never treats a non-allergen ingredient as a declaration", () => {
  assert.equal(
    isAllergenDeclarationOnly(
      finding({
        ingredientName: "Methylparaben",
        normalizedName: "methylparaben",
        title: "Συντηρητικό",
        explanation: "Μπορεί να προκαλέσει αλλεργία.",
      }),
      "Methylparaben",
    ),
    false,
  );

  assert.equal(
    isAllergenDeclarationOnly(
      finding({
        ingredientName: "Sodium Laureth Sulfate",
        normalizedName: "sodium laureth sulfate",
        explanation: "Μπορεί να προκαλέσει αλλεργία και ερεθισμό.",
      }),
      "Sodium Laureth Sulfate",
    ),
    false,
  );
});

test("keeps the finding when a real concern is stated alongside the allergy", () => {
  assert.equal(
    isAllergenDeclarationOnly(
      finding({
        explanation: "Αλλεργιογόνο με μη δηλωμένη ποσότητα στην ετικέτα.",
      }),
      "Πρωτεΐνη σίτου",
    ),
    false,
  );

  assert.equal(
    isAllergenDeclarationOnly(
      finding({
        ingredientName: "Θειώδη",
        normalizedName: "sulphites",
        explanation: "Τεχνητό πρόσθετο που μπορεί να προκαλέσει αλλεργία.",
      }),
      "Θειώδη",
    ),
    false,
  );
});

test("leaves high_attention findings alone", () =>
  assert.equal(
    isAllergenDeclarationOnly(
      finding({ severity: "high_attention" }),
      "Πρωτεΐνη σίτου",
    ),
    false,
  ));

test("downgrades the cereal-bar allergens and merges them into one notice", () => {
  const result = classifyAllergenFindings(
    [
      finding(),
      finding({
        ingredientName: "Γάλα",
        normalizedName: "milk",
        title: "Προσοχή σε γαλακτοκομικά",
      }),
      finding({
        ingredientName: "Αυγό",
        normalizedName: "egg",
        title: "Προσοχή σε αυγό",
      }),
      finding({
        ingredientName: "Sulfur dioxide",
        normalizedName: "sulfur dioxide",
        title: "Προσοχή σε θειώδη",
      }),
      finding({
        ingredientName: "Σύκο",
        normalizedName: "fig",
        severity: "info",
        title: "Φυσικό συστατικό",
        explanation: "Αποξηραμένο φρούτο.",
      }),
    ],
    displayName,
  );

  assert.equal(
    result.findings.filter((item) => item.severity === "attention").length,
    0,
  );

  assert.deepEqual(result.notice?.labels, [
    "Γλουτένη (σιτηρά)",
    "Γαλακτοκομικά",
    "Αυγό",
    "Θειώδη",
  ]);

  assert.equal(
    result.notice?.headline,
    "Περιέχει γνωστά αλλεργιογόνα: Γλουτένη (σιτηρά), Γαλακτοκομικά, Αυγό, Θειώδη",
  );

  assert.equal(result.findings[0].title, "Δηλωμένο αλλεργιογόνο: Γλουτένη (σιτηρά)");
  assert.equal(result.findings[0].explanation, "");
  assert.equal(result.findings[4].title, "Φυσικό συστατικό");
});

test("keeps a genuinely problematic ingredient at attention", () => {
  const result = classifyAllergenFindings(
    [
      finding({
        ingredientName: "Methylparaben",
        normalizedName: "methylparaben",
        title: "Συντηρητικό υπό συζήτηση",
        explanation: "Ενδοκρινικός διαταράκτης σύμφωνα με μελέτες.",
      }),
    ],
    displayName,
  );

  assert.equal(result.findings[0].severity, "attention");
  assert.equal(result.notice, null);
});

test("reads allergens declared outside the findings list", () => {
  const result = classifyAllergenFindings(
    [finding({ ingredientName: "Σύκο", normalizedName: "fig", severity: "info" })],
    displayName,
    ["Σουσάμι"],
  );

  assert.deepEqual(result.notice?.labels, ["Σουσάμι"]);
});

test("keeps a cosmetic fragrance allergen outside the food-14 by its own name", () => {
  const result = classifyAllergenFindings(
    [finding({ ingredientName: "Σύκο", normalizedName: "fig", severity: "info" })],
    displayName,
    ["Limonene", "Linalool"],
  );

  assert.deepEqual(result.notice?.labels, ["Limonene", "Linalool"]);
});

test("does not duplicate a fragrance allergen already matched as a food group", () => {
  const result = classifyAllergenFindings([finding()], displayName, [
    "Πρωτεΐνη σίτου",
  ]);

  assert.deepEqual(result.notice?.labels, ["Γλουτένη (σιτηρά)"]);
});

test("returns no notice when nothing matches", () =>
  assert.equal(buildAllergenNotice(["Νερό", "Μέλι"]), null));

test("drops allergen-only summary bullets but keeps real ones", () =>
  assert.deepEqual(
    withoutAllergenOnlyItems([
      "Περιέχει γλουτένη, πιθανό αλλεργιογόνο",
      "Υψηλή περιεκτικότητα σε ζάχαρη",
      "Το γάλα μπορεί να προκαλέσει αλλεργία",
      "Σιτάρι με μη δηλωμένη ποσότητα",
    ]),
    ["Υψηλή περιεκτικότητα σε ζάχαρη", "Σιτάρι με μη δηλωμένη ποσότητα"],
  ));
