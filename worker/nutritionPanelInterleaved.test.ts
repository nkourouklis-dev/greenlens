import assert from "node:assert/strict";
import test from "node:test";
import { inspectNutritionPanel } from "./nutritionPanel";

// Minerva spread (5201106273656), scan of 2026-10-05: Azure read every
// number, but interleaved the table with the ingredient text. "Λιπαρά, εκ
// των οποίων 80g" lost its row name to the comma, and "Υδατάνθρακες," was
// glued to the line above it, which says "Ολικά λιπαρά" — so the fat was
// missing, the energy check failed and the photo was refused as unreadable.
const MINERVA = "Διατροφική δήλωση\nανά μερίδα % ΠΠΑ*\nΔΙΑΤΗΡΕΙΤΑΙ ΣΕ ΨΥΓΕΙΟ\nανά 100g\n10g\nανά μερίδα\nΑνάμικτη λιπαρή ύλη με 57% βούτυρο τ. Κερκύρας\nΕνέργεια 2.977kJ/724kcal 298kJ/72kcal\n4%\nΑΝΑΛΑΤΟ\nΣυστατικά: Βούτυρο τ. Κερκύρας 57%,\nΛιπαρά, εκ των οποίων 80g\n8g\n11%\nΑραβοσιτέλαιο (σύνολο λιπαρών 80% *** ), Νερό,\nΚορεσμένα\n36g\n3,6g\n18%\nΒουτυρόγαλα σε σκόνη, Συντηρητικό: σορβικό\nΜονοακόρεστα\n22g\n2,2g\nκάλιο, Μέσο οξίνισης: γαλακτικό οξύ.\nΠολυακόρεστα\n22g\n2,2g\n*** Ολικά λιπαρά 80% εκ των οποίων 49% λιπαρά\nΥδατάνθρακες,\n0,04g\n0%\nβουτύρου & 31% φυτικά λιπαρά.\n0,4g\nΑπλώνεται εύκολα απευθείας από το\nεκ των οποίων\nΣάκχαρα\n0,4g\n0,04g\n0%\nψυγείο. Φυσική πηγή βιταμινών A, D και E.\n32% λιγότερα κορεσμένα από το βούτυρο.\nΕδώδιμες ίνες\n0g\n0g\nΠλούσια γεύση βουτύρου τ. Κέρκυρας.\nΠρωτεΐνες\n0,6g\n0,06g\n0%\nΙδανικό για όλες τις χρήσεις (επάλειψη,\nμαγειρική και ζαχαροπλαστική).\n0g\nΠαρασκευάζεται στην Ελλάδα από τη ΜΙΝΕΡΒΑ Α.Ε.\n(*) Προσλαμβανόμενη ποσότητα αναφοράς ενός\nΑλάτι\n0g\n0%\nΕΛΑΙΟΥΡΓΙΚΩΝ ΕΠΙΧΕΙΡΗΣΕΩΝ ΚΑΙ ΤΡΟΦΙΜΩΝ.\nμέσου ενήλικα (8.400 kJ / 2.000 kcal)\nΤΑΤΟΪΟΥ 165 & ΟΔΥΣΣΕΩΣ, ΜΕΤΑΜΟΡΦΩΣΗ ΑΤΤΙΚΗΣ.\nwww.minervahorio.gr\nΑνάλωση κατά\nανά 100g ανά μερίδα 10g\n% ΔΤΑ **\nπροτίμηση πριν από:\nava 100 g\nβλέπε συσκευασία.\nΒιταμίνη Α\n440μg\n55%\nΕΠΙΚΟΙΝΩΝΙΑΣ\nΒιταμίνη D\n2μg\n44μg\nΓΡΑΜΜΗ\n0,2ug\n34%\nΚΑΤΑΝΑΛΩΤΩΝ\nΒιταμίνη Ε\n5mg\n0,5mg\n38%\n800 11 28282\n500107986\n5 201106 273656\nΧΩΡΙΣ ΧΡΕΩΣΗ:\n( ** ) Διατροφική τιμή αναφοράς\nΗ συσκευασία περιέχει 22 μερίδες των 10g.\nΚΑΘΑΡΟ ΒΑΡΟΣ\n225g ℮";

test("a table interleaved with ingredient text still reads fat and the other rows", () => {
  const read = inspectNutritionPanel(MINERVA);

  assert.ok(read.panel, "the table should be scoreable");
  assert.equal(read.values.fat, 80);
  assert.equal(read.values.saturates, 36);
  assert.equal(read.values.sugars, 0.4);
  assert.equal(read.values.protein, 0.6);
});
