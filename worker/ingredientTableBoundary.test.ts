import assert from "node:assert/strict";
import test from "node:test";
import { extractIngredientText } from "./ingredientText";

// Real scan (Lacta white chocolate, 2026-11-07): OCR read the table heading as
// "Διαθρεπτική Επισήμανση", no boundary phrase matched, and the whole table
// ended up inside the ingredient block, which was then refused as a table.
const lactaLabel = "GR Λευκή σοκολάτα με κομμάτια μπισκότου κακάο (12%) και κρέμα γεύση βανίλια\n(40%). Συστατικά: Ζάχαρη, φοινικέλαιο, βούτυρο κακάο, αποβουτυρωμένο ΓΑΛΑ σε\nacta\nσκόνη, αλεύρι ΣΙΤΟΥ, ορός ΓΆΛΑΚΤΟΣ σε σκόνη, βούτυρο ΓΆΛΑΚΤΟΣ,\nαποβουτυρωμένο κακάο σε σκόνη (0,7%), σιρόπι γλυκόζης-φρουκτόζης,\nγαλακτωματοποιητής (λεκιθίνες ΣΟΓΙΑΣ), άμυλο ΣΙΤΟΥ, διογκωτικά αρτοποιίας\n(ανθρακικά άλατα καλίου, ανθρακικά άλατα νατρίου, ανθρακικά άλατα αμμωνίου),\nαλάτι, αρωματικές ύλες, ρυθμιστής οξύτητας (υδροξείδιο του νατρίου).\nΜΠΟΡΕΙ ΝΑ ΠΕΡΙΕΧΕΙ ΞΗΡΟΥΣ ΚΑΡΠΟΥΣ.\nη ζέστη.\nΚαθαρό βάρος:\n℮ 100 g\nnack\nMindfully\nΔιαθρεπτική Επισήμανση\n100 g\n20 g\n% * / 20 g\nΕνέργεια\n2339 kJ / 560 kcal\n468 KJ / 112 kcal\n6 %\nΛιπαρά\n34 g\n6,8 g\n10 %\nεκ των οποίων κορεσμένα\n19 g\n3,8 g\n19 %\nΥδατάνθρακες\n59 g\n12 g\n5 %\nεκ των οποίων σάκχαρα\n54 g\n11 g\nΕδώδιμες ίνες\n0,5 g\n<0,1 g\nΠρωτεΐνες\n3,8 g\n0,8 g\n2 %\nΑλάτι\n0,32 g\n0,06 g\n1%";

test("a garbled nutrition heading does not pull the table into the ingredient list", () => {
  const result = extractIngredientText(lactaLabel, 0.95);

  assert.equal(result.isValid, true);
  assert.ok(result.ingredientText?.startsWith("Ζάχαρη, φοινικέλαιο"));
  assert.ok(result.ingredientText?.includes("υδροξείδιο του νατρίου"));
  assert.ok(!result.ingredientText?.includes("kcal"));
  assert.ok(!result.ingredientText?.includes("Καθαρό βάρος"));
});

test("the list ends at the first energy row when no heading survives OCR", () => {
  const result = extractIngredientText(
    "Συστατικά: Νερό, ζάχαρη, χυμός λεμονιού, αρωματικές ύλες.\nΕνέργεια\n180 kJ / 42 kcal\nΛιπαρά\n0 g",
    0.95,
  );

  assert.equal(result.isValid, true);
  assert.equal(
    result.ingredientText,
    "Νερό, ζάχαρη, χυμός λεμονιού, αρωματικές ύλες.",
  );
});
