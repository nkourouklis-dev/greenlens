/**
 * Real Azure OCR output for label photos used as regression fixtures.
 *
 * Kept out of any .test.ts so more than one test file can use the same
 * label without re-registering the other file's tests.
 */

/**
 * Nestlé Clusters Balance (barcode 7613287308870): an ingredient list
 * printed directly above a three-column nutrition table. Azure reads the
 * table column by column, so the heading arrives split across lines and
 * every value sits on a line of its own.
 */
export const NESTLE_CLUSTERS_OCR = "Balance\nΟΓΙΩΤΗΣ\nζι ψήσιμο\nNestlé®\nκαι γλυκά!\nΚαλή Διατροφή, Καλύτερη Ζωή\nΣυστατικά: Σιτάρι ολικής άλεσης\n63,3%, Ζάχαρη, Αμύγδαλα 9,2%, Αλεύρι\nσιταριού 5,3%, Σιρόπι γλυκόζης, Νιφάδες\nσιταριού 1,8%, Εκχύλισμα βύνης κριθαριού\n(κριθάρι, βύνη κριθαριού), Ιμβερτοποιη-\nμένο σιρόπι ζάχαρης, Νιφάδες βρώμης\n1,4%, Ανθρακικό ασβέστιο, Φοινικέλαιο,\nΑλάτι, Μέλι 0,3%, Αλεύρι ρυζιού 0,3%,\nΜελάσα, Φυσική αρωματική ύλη, Ρυθμιστής\nοξύτητας (φωσφορικά άλατα νατρίου),\nΣίδηρος, Βιταμίνη Β3, Β5, Β9, Β6, Β2.\nΠιθανόν να περιέχει γάλα, φιστίκια\nκαι άλλους ξηρούς καρπούς.\nΓια να παραχθούν 100g αυτού του προϊόντος\nέχουν χρησιμοποιηθεί 63,3g δημητριακά ολικής\nάλεσης.\n%\nΑνά 30g+\nΔΙΑΤΡΟΦΙΚΕΣ\nΑνά\nΑνά\n125ml\nΠΛΗΡΟΦΟΡΙΕΣ\n100g\n30g\nημιαποβουτυ-\nPOWER\nρωμένο γάλα\nΕνέργεια\n1652kJ\n496kJ\n750kJ\nREADY\n392kcal\n118kcal\n178kcal\nΛιπαρά\n7,3g\n2,2g\n4,2g\nεκ των οποίων\nκορεσμένα\n1,4g\n0,4g\n1,6g\nΥδατάνθρακες\n66,5g\n20,0g\n26,1g\nεκ των οποίων\nσάκχαρα\n19,9g\n6,0g\n11,8g\nΕδώδιμες ίνες\n9,6g\n2,9g\n2,9g\nΠρωτεΐνες\n10,3g\n3,1g\n7,4g\nΑλάτι\n0,91g\n0,27g\n0,42g\nΟι βιταμίνες του συμπλέγματος Β (Β2, Β3, Β5, Β6)\nσυμβάλλουν στη φυσιολογική λειτουργία των\nμεταβολικών διεργασιών που αποσκοπούν στην\nπαραγωγή ενέργειας. Στα πλαίσια μιας\nισορροπημένης διατροφής και ενός υγιεινού τρόπου ζωής.\nΒΙΤΑΜΙΝΕΣ &\nΜΕΤΑΛΛΑ\n(%Δ.Τ.Α .* )\nΡιβοφλαβίνη (Β2)\n1,18 mg (84%) 0,35 mg\n0,59 mg\nΝιασίνη (Β3)\n13,9 mg (87%)\n4,17mg\n4,29 mg\nΒιταμίνη Β6\n0,37 mg\nΦολικό οξύ (Β9)\n1,02 mg (73%) |0,31 mg\n182 μg (91%) 54,6 μg\n59,2 μg\nΠαντοθενικό οξύ (Β5) 4,46 mg (74%)\n1,34mg\n1,79 mg\nΑσβέστιο\n524 mg (66%)\n157 mg\n309 mg\nΣίδηρος\n11,7 mg (84%) |3,51mg\n3,57 mg\n*%Δ.Τ.Α .: Διατροφική Τιμή Αναφοράς σύμφωνα\nμε τον κανονισμό 1169/2011/ΕΚ.\nΕίναι καλό να μιλάτε";

/**
 * Gluten-free oat drink (barcode 5430003127100), side panel. A complete
 * ingredient list with NO "Ingredients:" heading — the product description
 * runs straight into it — followed by a gluten-free claim, a best-before
 * line and storage advice. All four of those things are printed on the same
 * panel as the list on most cartons, and together they were enough to get
 * the whole block thrown out as marketing copy.
 */
export const OAT_DRINK_OCR =
  "EN Gluten-free oat drink\n" +
  "with added calcium.\n" +
  "Water, gluten-free oats 11%,\n" +
  "rapeseed oil, acidity regulator\n" +
  "(dipotassium phosphate),\n" +
  "calcium, salt, emulsifier\n" +
  "(DATEM), stabilizer (gellan gum).\n" +
  "Gluten-free and no added sugars.\n" +
  "Best before: see on top.\n" +
  "Once opened, keep refrigerated\n" +
  "(max. 7 °C) for up to 5 days.";
