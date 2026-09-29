-- Correction to 0014. Two things it got wrong:
--
-- 1. The E900-E999 range mixes sweeteners, glazing agents, flour treatments and
--    gases, so labelling all of it "γλυκαντικό ή βοηθητικό πρόσθετο" was
--    wrong for most of it (E917 potassium iodate is a flour treatment agent).
--    Those rows say "πρόσθετο τροφίμων" instead. A range only names a class
--    reliably where the numbering follows function (colours, preservatives).
-- 2. "potassium iodate" duplicated E917, which already carries that name.

UPDATE ingredient_knowledge SET short_description = 'Διμεθυλοπολυσιλοξάνη και Μεθυλοφαινυλοπολυσιλοξάνη — πρόσθετο τροφίμων (E900).' WHERE normalized_name = 'e900';
UPDATE ingredient_knowledge SET short_description = 'Διμεθυλοπολυσιλοξανιο — πρόσθετο τροφίμων (E900A).' WHERE normalized_name = 'e900a';
UPDATE ingredient_knowledge SET short_description = 'Μεθυλφαινυλπολυσιλοξάνη — πρόσθετο τροφίμων (E900B).' WHERE normalized_name = 'e900b';
UPDATE ingredient_knowledge SET short_description = 'Κηρος μελισσων — πρόσθετο τροφίμων (E901).' WHERE normalized_name = 'e901';
UPDATE ingredient_knowledge SET short_description = 'Κανδελιλλικος κηρος — πρόσθετο τροφίμων (E902).' WHERE normalized_name = 'e902';
UPDATE ingredient_knowledge SET short_description = 'Καρναουβικος κηρος — πρόσθετο τροφίμων (E903).' WHERE normalized_name = 'e903';
UPDATE ingredient_knowledge SET short_description = 'Σελακ — πρόσθετο τροφίμων (E904).' WHERE normalized_name = 'e904';
UPDATE ingredient_knowledge SET short_description = 'Συνθετικός κηρός — πρόσθετο τροφίμων (E905).' WHERE normalized_name = 'e905';
UPDATE ingredient_knowledge SET short_description = 'Mineral oil — πρόσθετο τροφίμων (E905A).' WHERE normalized_name = 'e905a';
UPDATE ingredient_knowledge SET short_description = 'Βαζελίνη — πρόσθετο τροφίμων (E905B).' WHERE normalized_name = 'e905b';
UPDATE ingredient_knowledge SET short_description = 'Κερί πετρελαίου — πρόσθετο τροφίμων (E905C).' WHERE normalized_name = 'e905c';
UPDATE ingredient_knowledge SET short_description = 'Μικροκρυσταλλικος κηρος — πρόσθετο τροφίμων (E905CI).' WHERE normalized_name = 'e905ci';
UPDATE ingredient_knowledge SET short_description = 'Paraffin wax — πρόσθετο τροφίμων (E905CII).' WHERE normalized_name = 'e905cii';
UPDATE ingredient_knowledge SET short_description = 'Υψηλής ιξώδους ορυκτό έλαιο — πρόσθετο τροφίμων (E905D).' WHERE normalized_name = 'e905d';
UPDATE ingredient_knowledge SET short_description = 'Μέσης ιξώδους ορυκτό έλαιο — πρόσθετο τροφίμων (E905E).' WHERE normalized_name = 'e905e';
UPDATE ingredient_knowledge SET short_description = 'Ορυκτό έλαιο με μέτρια και χαμηλή ιξώδες κλάση II — πρόσθετο τροφίμων (E905F).' WHERE normalized_name = 'e905f';
UPDATE ingredient_knowledge SET short_description = 'Ορυκτό έλαιο με μέτρια και χαμηλή ιξώδες κλάση III — πρόσθετο τροφίμων (E905G).' WHERE normalized_name = 'e905g';
UPDATE ingredient_knowledge SET short_description = 'Ρητίνη βενζόης — πρόσθετο τροφίμων (E906).' WHERE normalized_name = 'e906';
UPDATE ingredient_knowledge SET short_description = 'Υδρογονωμενο πολυ-1-δεκενιο — πρόσθετο τροφίμων (E907).' WHERE normalized_name = 'e907';
UPDATE ingredient_knowledge SET short_description = 'Κερί πίτουρου ρυζιού — πρόσθετο τροφίμων (E908).' WHERE normalized_name = 'e908';
UPDATE ingredient_knowledge SET short_description = 'Σπερματσέτι — πρόσθετο τροφίμων (E909).' WHERE normalized_name = 'e909';
UPDATE ingredient_knowledge SET short_description = 'Εστέρας κεριού — πρόσθετο τροφίμων (E910).' WHERE normalized_name = 'e910';
UPDATE ingredient_knowledge SET short_description = 'Μεθυλικός εστέρας λιπαρών οξέων — πρόσθετο τροφίμων (E911).' WHERE normalized_name = 'e911';
UPDATE ingredient_knowledge SET short_description = 'Εστερες του μοντανικου οξεος — πρόσθετο τροφίμων (E912).' WHERE normalized_name = 'e912';
UPDATE ingredient_knowledge SET short_description = 'Λανολίνη — πρόσθετο τροφίμων (E913).' WHERE normalized_name = 'e913';
UPDATE ingredient_knowledge SET short_description = 'Κηρός οξειδωμένων πολυαιθυλενιων — πρόσθετο τροφίμων (E914).' WHERE normalized_name = 'e914';
UPDATE ingredient_knowledge SET short_description = 'Εστέρες της κολοφωνίας — πρόσθετο τροφίμων (E915).' WHERE normalized_name = 'e915';
UPDATE ingredient_knowledge SET short_description = 'Ιωδικό ασβέστιο — πρόσθετο τροφίμων (E916).' WHERE normalized_name = 'e916';
UPDATE ingredient_knowledge SET short_description = 'Ιωδικό κάλιο — πρόσθετο τροφίμων (E917).' WHERE normalized_name = 'e917';
UPDATE ingredient_knowledge SET short_description = 'Οξείδια του αζώτου — πρόσθετο τροφίμων (E918).' WHERE normalized_name = 'e918';
UPDATE ingredient_knowledge SET short_description = 'Χλωριούχο νιτροσύλιο — πρόσθετο τροφίμων (E919).' WHERE normalized_name = 'e919';
UPDATE ingredient_knowledge SET short_description = 'L-κυστεϊνη — πρόσθετο τροφίμων (E920).' WHERE normalized_name = 'e920';
UPDATE ingredient_knowledge SET short_description = 'Μονοϋδρική υδροχλωρική L-κυστεΐνη — πρόσθετο τροφίμων (E921).' WHERE normalized_name = 'e921';
UPDATE ingredient_knowledge SET short_description = 'Υπερσουλφικό κάλιο — πρόσθετο τροφίμων (E922).' WHERE normalized_name = 'e922';
UPDATE ingredient_knowledge SET short_description = 'Υπερσουλφονικό αμμώνιο — πρόσθετο τροφίμων (E923).' WHERE normalized_name = 'e923';
UPDATE ingredient_knowledge SET short_description = 'Βρωμικό κάλιο — πρόσθετο τροφίμων (E924).' WHERE normalized_name = 'e924';
UPDATE ingredient_knowledge SET short_description = 'Βρωμικό κάλιο — πρόσθετο τροφίμων (E924A).' WHERE normalized_name = 'e924a';
UPDATE ingredient_knowledge SET short_description = 'Βρωμικό ασβέστιο — πρόσθετο τροφίμων (E924B).' WHERE normalized_name = 'e924b';
UPDATE ingredient_knowledge SET short_description = 'Χλώριο — πρόσθετο τροφίμων (E925).' WHERE normalized_name = 'e925';
UPDATE ingredient_knowledge SET short_description = 'Διοξείδιο του χλωρίου — πρόσθετο τροφίμων (E926).' WHERE normalized_name = 'e926';
UPDATE ingredient_knowledge SET short_description = 'Αζοδικαρβοναμίδιο και Καρβαμίδιο — πρόσθετο τροφίμων (E927).' WHERE normalized_name = 'e927';
UPDATE ingredient_knowledge SET short_description = 'Αζοδικαρβοναμίδιο — πρόσθετο τροφίμων (E927A).' WHERE normalized_name = 'e927a';
UPDATE ingredient_knowledge SET short_description = 'Καρβαμιδιο — πρόσθετο τροφίμων (E927B).' WHERE normalized_name = 'e927b';
UPDATE ingredient_knowledge SET short_description = 'Υπεροξείδιο του βενζοϋλίου — πρόσθετο τροφίμων (E928).' WHERE normalized_name = 'e928';
UPDATE ingredient_knowledge SET short_description = 'Acetone peroxide — πρόσθετο τροφίμων (E929).' WHERE normalized_name = 'e929';
UPDATE ingredient_knowledge SET short_description = 'Υπεροξείδιο του ασβεστίου — πρόσθετο τροφίμων (E930).' WHERE normalized_name = 'e930';
UPDATE ingredient_knowledge SET short_description = 'Nitrogen — πρόσθετο τροφίμων (E931).' WHERE normalized_name = 'e931';
UPDATE ingredient_knowledge SET short_description = 'Οξείδιο του αζώτου — πρόσθετο τροφίμων (E932).' WHERE normalized_name = 'e932';
UPDATE ingredient_knowledge SET short_description = 'Αργο — πρόσθετο τροφίμων (E938).' WHERE normalized_name = 'e938';
UPDATE ingredient_knowledge SET short_description = 'Ηλιο — πρόσθετο τροφίμων (E939).' WHERE normalized_name = 'e939';
UPDATE ingredient_knowledge SET short_description = 'Διφθοροδιχλωρομεθάνιο — πρόσθετο τροφίμων (E940).' WHERE normalized_name = 'e940';
UPDATE ingredient_knowledge SET short_description = 'Αζωτο — πρόσθετο τροφίμων (E941).' WHERE normalized_name = 'e941';
UPDATE ingredient_knowledge SET short_description = 'Υποξειδιο του αζωτου — πρόσθετο τροφίμων (E942).' WHERE normalized_name = 'e942';
UPDATE ingredient_knowledge SET short_description = 'Βουτανιο — πρόσθετο τροφίμων (E943A).' WHERE normalized_name = 'e943a';
UPDATE ingredient_knowledge SET short_description = 'Ισοβουτανιο — πρόσθετο τροφίμων (E943B).' WHERE normalized_name = 'e943b';
UPDATE ingredient_knowledge SET short_description = 'Προπανιο — πρόσθετο τροφίμων (E944).' WHERE normalized_name = 'e944';
UPDATE ingredient_knowledge SET short_description = 'Χλωροπενταφθοροαιθάνιο — πρόσθετο τροφίμων (E945).' WHERE normalized_name = 'e945';
UPDATE ingredient_knowledge SET short_description = 'Οκταφθοροκυκλοβουτάνιο — πρόσθετο τροφίμων (E946).' WHERE normalized_name = 'e946';
UPDATE ingredient_knowledge SET short_description = 'Οξυγονο — πρόσθετο τροφίμων (E948).' WHERE normalized_name = 'e948';
UPDATE ingredient_knowledge SET short_description = 'Υδρογόνο — πρόσθετο τροφίμων (E949).' WHERE normalized_name = 'e949';
UPDATE ingredient_knowledge SET short_description = 'Ισομάλτ — πρόσθετο τροφίμων (E953).' WHERE normalized_name = 'e953';
UPDATE ingredient_knowledge SET short_description = 'Αλιτάμη — πρόσθετο τροφίμων (E956).' WHERE normalized_name = 'e956';
UPDATE ingredient_knowledge SET short_description = 'Θαυματίνη — πρόσθετο τροφίμων (E957).' WHERE normalized_name = 'e957';
UPDATE ingredient_knowledge SET short_description = 'Γλυκυρριζίνη — πρόσθετο τροφίμων (E958).' WHERE normalized_name = 'e958';
UPDATE ingredient_knowledge SET short_description = 'Νεοεσπεριδινη dc — πρόσθετο τροφίμων (E959).' WHERE normalized_name = 'e959';
UPDATE ingredient_knowledge SET short_description = 'Γλυκοσίδες στεβιόλης από Στέβια — πρόσθετο τροφίμων (E960A).' WHERE normalized_name = 'e960a';
UPDATE ingredient_knowledge SET short_description = 'Rebaudioside from multiple gene donors expressed in Yarrowia lipolityca — πρόσθετο τροφίμων (E960B).' WHERE normalized_name = 'e960b';
UPDATE ingredient_knowledge SET short_description = 'Enzymatically produced steviol glycosides — πρόσθετο τροφίμων (E960C).' WHERE normalized_name = 'e960c';
UPDATE ingredient_knowledge SET short_description = 'Γλυκοζυλιωμένα γλυκοσίδια στεβιόλης — πρόσθετο τροφίμων (E960D).' WHERE normalized_name = 'e960d';
UPDATE ingredient_knowledge SET short_description = 'Νεοταμη — πρόσθετο τροφίμων (E961).' WHERE normalized_name = 'e961';
UPDATE ingredient_knowledge SET short_description = 'Αλας ασπαρταμης-ακεσουλφαμης — πρόσθετο τροφίμων (E962).' WHERE normalized_name = 'e962';
UPDATE ingredient_knowledge SET short_description = 'Ταγατόζη — πρόσθετο τροφίμων (E963).' WHERE normalized_name = 'e963';
UPDATE ingredient_knowledge SET short_description = 'Σιρόπι πολυγλυκιτόλης — πρόσθετο τροφίμων (E964).' WHERE normalized_name = 'e964';
UPDATE ingredient_knowledge SET short_description = 'D-Μαλτιτόλη — πρόσθετο τροφίμων (E965I).' WHERE normalized_name = 'e965i';
UPDATE ingredient_knowledge SET short_description = 'Σιρόπι μαλτιτόλης — πρόσθετο τροφίμων (E965II).' WHERE normalized_name = 'e965ii';
UPDATE ingredient_knowledge SET short_description = 'Λακτιτολη — πρόσθετο τροφίμων (E966).' WHERE normalized_name = 'e966';
UPDATE ingredient_knowledge SET short_description = 'Ξυλιτολη — πρόσθετο τροφίμων (E967).' WHERE normalized_name = 'e967';
UPDATE ingredient_knowledge SET short_description = 'Ερυθριτολη — πρόσθετο τροφίμων (E968).' WHERE normalized_name = 'e968';
UPDATE ingredient_knowledge SET short_description = 'Advantame — πρόσθετο τροφίμων (E969).' WHERE normalized_name = 'e969';
UPDATE ingredient_knowledge SET short_description = 'Εκχυλισμα κιλαϊας — πρόσθετο τροφίμων (E999).' WHERE normalized_name = 'e999';

DELETE FROM ingredient_aliases WHERE normalized_name = 'potassium iodate' AND alias <> 'ιωδικό κάλιο';
DELETE FROM ingredient_knowledge WHERE normalized_name = 'potassium iodate';
UPDATE ingredient_knowledge SET short_description = 'Ιωδικό κάλιο — πηγή ιωδίου (προστίθεται στο ιωδιωμένο αλάτι) και βελτιωτικό αλεύρων (E917).' WHERE normalized_name = 'e917';

-- 3. Four more rows from 0014 duplicated entries that already existed under
--    another key (their names were already aliases of those entries), so the
--    new row could never be reached. Dropped; the existing entries get the
--    plain-language wording instead.
DELETE FROM ingredient_knowledge WHERE normalized_name IN ('vitamin e', 'triethyl citrate', 'magnesium citrate', 'propylene glycol');
UPDATE ingredient_knowledge SET short_description = 'Προπυλενογλυκόλη — ενυδατικό συστατικό και διαλύτης (E1520).' WHERE normalized_name = 'e1520';
UPDATE ingredient_knowledge SET short_description = 'Κιτρικός τριαιθυλεστέρας — σταθεροποιεί το άρωμα και βοηθά στην εξουδετέρωση οσμών· ως πρόσθετο τροφίμων E1505.' WHERE normalized_name = 'e1505';
UPDATE ingredient_knowledge SET short_description = 'Κιτρικό μαγνήσιο — άλας μαγνησίου, πηγή μαγνησίου και ρυθμιστής οξύτητας (E345).' WHERE normalized_name = 'e345';
