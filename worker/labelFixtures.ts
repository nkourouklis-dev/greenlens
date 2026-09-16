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

/**
 * Nutree date bar (barcode 5214001318704), nutrition panel only. Three
 * columns — per 100 g, per 50 g bar, %RI — and the OCR dropped the unit off
 * two of the per-100 g values (13,7, 33.7), which is exactly where a
 * reader that waits for a g ends up scoring the portion column instead.
 */
export const NUTREE_BAR_PANEL_OCR =
  "ΔΙΑΤΡΟΦΙΚΗ ΔΗΛΩΣΗ / NUTRITIONAL DECLARATION\n" +
  "Avá / Per\n" +
  "Avá / Per\n" +
  "П.П.А./RI .*\n" +
  "100g\n" +
  "50g\n" +
  "ανά μπάρα\n" +
  "ΕΝΕΡΓΕΙΑΚΗ ΑΞΙΑ /\n" +
  "1591KJ\n" +
  "795KJ\n" +
  "ENERGY\n" +
  "379kcal\n" +
  "189kcal\n" +
  "9,5%\n" +
  "ΛΙΠΑΡΑ/FAT\n" +
  "13,7\n" +
  "6,8g\n" +
  "9,7%\n" +
  "ΕΚ ΤΩΝ ΟΠΟΙΩΝ\n" +
  "ΚΟΡΕΣΜΕΝΑ/\n" +
  "9,0%\n" +
  "OF WHICH SATURATED\n" +
  "3,6g\n" +
  "1,8g\n" +
  "ΥΔΑΤΑΝΘΡΑΚΕΣ/\n" +
  "CARBOHYDRATES\n" +
  "41.4g\n" +
  "20,7g\n" +
  "9,0%\n" +
  "ΕΚ ΤΩΝ ΟΠΟΙΩΝ ΣΑΚΧΑΡΑ\n" +
  "OF WHICH SUGARS\n" +
  "33.7\n" +
  "16,8g\n" +
  "18,7°\n" +
  "ΕΔΩΔΙΜΕΣ ΙΝΕΣ/\n" +
  "DIETARY FIBER\n" +
  "9,1g\n" +
  "4,6g\n" +
  "19,2%\n" +
  "ΠΡΩΤΕΪΝΕΣ/PROTEIN\n" +
  "20,2g\n" +
  "10,1g\n" +
  "22,4°\n" +
  "AMATI/SALT\n" +
  "0,5g\n" +
  "0,25g\n" +
  "3,3%";

/**
 * Kaiser pilsner 500 ml can (barcode 5201309103033): ingredient list and a
 * per-100 ml nutrition table on the same panel, with the strength printed
 * as "ALC. 5,2%". Exactly as Azure returned it, including the misread
 * protein ("40,5g" — the can says 0,5 g) and a stray "500mle".
 *
 * Scored 100 as ingredients (the table failed an energy check that did not
 * count alcohol, so it was silently dropped) and 74 as nutrition (from the
 * model's copy of the table, which read 0,5 g of sugar as 5 g).
 */
export const KAISER_PILSNER_OCR =
  "ΠΟΙΚΙΛΙΕΣ\nΛΥΚΙΣΚΟΥ\nΕΙΔΗ\nΚΡΙΘΑΡΙΟΥ\nT\n3-6℃\nΚΥΡΙΑΡΧΟΣ\nΑΡΩΜΑΤΙΚΟΣ\nΙΔΑΝΙΚΗ\nΘΕΡΜΟΚΡΑΣΙΑ\nΛΥΚΙΣΚΟΣ\nTRADITION\nΜΠΥΡΑ PILSNER. ΠΑΡΑΓΕΤΑΙ ΚΑΙ ΣΥΣΚΕΥΑΖΕΤΑΙ ΑΠΟ ΤΗΝ\nΟΛΥΜΠΙΑΚΗ ΖΥΘΟΠΟΙΙΑ Α.Ε., 70° ΧΛΜ. Ν.Ε.Ο. ΑΘΗΝΩΝ-ΛΑΜΙΑΣ,\nΡΙΤΣΩΝΑ ΕΥΒΟΙΑΣ, Τ.Κ .: 32009, ΕΛΛΑΔΑ. ΣΥΣΤΑΤΙΚΑ: ΝΕΡΟ, ΒΥΝΗ\nΚΡΙΘΑΡΙΟΥ, ΛΥΚΙΣΚΟΣ, ΜΑΓΙΑ. ΠΡΟΣΤΑΤΕΨΤΕ ΤΟ ΠΕΡΙΒΑΛΛΟΝ.\nΜΗΝ ΠΕΤΑΤΕ ΤΑ ΑΔΕΙΑ ΚΟΥΤΙΑ ΟΠΟΥΔΗΠΟΤΕ. KEEP THE ENVIRON-\nMENT CLEAN. PLEASE DO NOT LITTER. ΓΡΑΜΜΗ ΚΑΤΑΝΑΛΩΤΩΝ:\nSCAN FOR ME\nΔΙΑΤΡΟΦΙΚΗ ΔΗΛΩΣΗ ΑΝΑ 100ml\nΑΠΟΛΑΥΣΤΕ ΥΠΕΡΙΝΑ\nΕΝΕΡΓΕΙΑ:\n172KJ/\n41kcal\nΛΙΠΑΡΑ:\n0g\nΕΚ ΤΩΝ ΟΠΟΙΩΝ ΚΟΡΕΣΜΕΝΑ:\n0g\nΥΔΑΤΑΝΘΡΑΚΕΣ:\n2,8g\n500mle\nΕΚ ΤΩΝ ΟΠΟΙΩΝ ΣΑΚΧΑΡΑ:\n0,5g\nΠΡΩΤΕΪΝΕΣ:\n40,5g\nΑΛΑΤΙ:\n0g\nALC. 5,2%\nΤΟ ΤΕΛΟΣ: ΒΛΕΠΕΤΕ ΒΑΣΗ ΚΟΥΤΙΟΥ.\n5 201309 103033 >";

/**
 * Kri Kri High Protein Super Spoon (barcode 5202234632322): Azure interleaved
 * the bilingual ingredient list with the nutrition table, so the protein row
 * name arrives at the end of a line of ingredients that also says "sugar".
 */
export const KRI_KRI_INTERLEAVED_OCR =
  "nn!\nΕπιδόρπιο στραγγιστού γιαουρτιού με μπανάνα, κομμάτια μαύρης\nΔΙΑΤΡΟΦΙΚΗ ΕΠΙΣΗΜΑΝΣΗ / NUTRITION D\nΤΙ\nσοκολάτας και βρώμη. Συστατικά: Στραγγιστό γιαούρτι 0% λιπαρών\nης\n(86%) (Συμπυκνωμένο και φρέσκο αποβουτυρωμένο γάλα αγελάδος,\nανά/\nκαλλιέργεια γιαούρτης), νερό, ζάχαρη, πουρές μπανάνας (1.3%),\nper 100g\nκομμάτια μαύρης σοκολάτας (κακαόμαζα, βούτυρο κακάο, ζάχαρη) (1%),\nΕνέργεια/Energy\n340KJ/80kcal\nκομμάτια κέικ [αυγό, αλεύρι σίτου (γλουτένη), άμυλο σίτου (γλουτένη), Λιπαρά/Fat\n0.8g\nr\nάμυλο καλαμποκιού, αλάτι] (0.6%), πίτουρο βρώμης (0.2%), άμυλο\nαραβοσίτου, σταθεροποιητής (πηκτίνη), φυσικές αρωματικές ύλες,\nΕκτων οποίων κορεσμένα/\nεια,\nσυμπυκνωμένος χυμός καρότου, κολοκύθας και λεμονιού. Λιπαρά:\nOf which saturates\n0.4g\nα\n0.8%, Ολικά στερεά: 20% min. Προέλευση γάλακτος: Ε.Ε.\nΥδατάνθρακες/Carbohydrate\n9.4g\nStrained yogurt dessert with banana, dark chocolate splits and oat. Εκτων οποίων σάκχαρα/\nIngredients: Strained Yogurt 0% fat (86%) (Concentrated and fresh skimmed\ncow's milk, yogurt culture), water, sugar, banana puree (1.3%), dark chocolate\nOf which sugars\n7.9g\nsplits (cocoa mass, cocoa butter, sugar) (1%), cake (egg, wheat flour Πρωτεΐνες/Protein\n8.8g\n(gluten), wheat starch (gluten), maize starch, salt) (0.6%), oat bran (0.2%),\nΑλάτι/Salt\n0.13g\nmaize starch, stabilizer (pectin), natural flavourings, carrot, pumpkin and\nlemon juice concentrate. Fat: 0.8%, Total Solids: 20% min. Milk origin: E.U.\nιμή Επικοινωνίας\nGR\n45.883\n-ΧΩΡΙΣ ΧΡΕΩΣΗ-\nEC\n0 300 3233\nΠαράγεται και συσκευάζεται στην Ελλάδα/\nProduced and packed in Greece\n5\n202234\n632322";

/**
 * Kaiser pilsner 330 ml can (barcode 5201309103040), nutrition photo. The can
 * curves, the value column sits half a line below the names, and Azure emits
 * every value one row late: "ΛΙΠΑΡΑ:" is followed by the energy, and so on.
 */
export const KAISER_330_OFFSET_OCR =
  "ΜΠΥΡΑ PILSNER. ΠΑΡΑΓΕΤΑΙ ΚΑΙ ΣΥΣΚΕΥΑΖΕΤΑΙ Α\nΟΛΥΜΠΙΑΚΗ ΖΥΘΟΠΟΙΙΑ Α.Ε., 70° ΧΛΜ. N.Ε.Ο. Α\nΛΑΜΙΑΣ, ΡΙΤΣΩΝΑ ΕΥΒΟΙΑΣ, Τ.Κ .: 32009, ΕΛΛΑΔΑ. ΣΥΣ\nΝΕΡΟ, ΒΥΝΗ ΚΡΙΘΑΡΙΟΥ, ΛΥΚΙΣΚΟΣ, ΜΑΓΙΑ. ΑΝΑΛΩΣ\nΠΡΟΤΙΜΗΣΗ ΠΡΙΝ ΑΠΟ ΤΟ ΤΕΛΟΣ: ΒΛΕΠΕΤΕ ΒΑΣΗ\nBEST BEFORE END: SEE BOTTOM. ΠPOETATE\nΠΕΡΙΒΑΛΛΟΝ. ΜΗΝ ΠΕΤΑΤΕ ΤΑ ΑΔΕΙΑ\nΚΟΥΤΙΑ ΟΠΟΥΔΗΠΟΤΕ. KEEP THE ENVI-\nRONMENT CLEAN. PLEASE DO NOT LITTER.\nΓΡΑΜΜΗ ΚΑΤΑΝΑΛΩΤΩΝ: 800 11 20154\n(ΧΩΡΙΣ ΧΡΕΩΣΗ). ΑΠΟΛΑΥΣΤΕ ΥΠΕΥΘΥΝΑ\nWWW.KAISER.GR/PACKAGING\nΔΙΑΤΡΟΦΙΚΗ ΔΗΛΩΣΗ\nΕΝΕΡΓΕΙΑ:\nANA 100ml\nΛΙΠΑΡΑ:\n172kJ/41kcal\nΕΚ ΤΩΝ ΟΠΟΙΩΝ ΚΟΡΕΣΜΕΝΑ:\n0g\nΥΔΑΤΑΝΘΡΑΚΕΣ:\n0g\nΕΚ ΤΩΝ ΟΠΟΙΩΝ ΣΑΚΧΑΡΑ:\n2,8g\nΠΡΩΤΕΪΝΕΣ:\nΑΛΑΤΙ:\n0,5g\n330ML ℮\n<0,5g\n0g\nALC. 5,2%VOI\n18+\nALÙ";
