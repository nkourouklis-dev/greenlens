-- Curated ingredient knowledge, migrated 1:1 from the static registry
-- that used to live at worker/ingredientKnowledge.ts (REGISTRY object).
-- benefits/concerns are stored as JSON arrays (never queried element-
-- wise, always read back whole), matching the TS shape exactly.

CREATE TABLE ingredient_knowledge (
  normalized_name TEXT PRIMARY KEY,
  category TEXT NOT NULL CHECK (category IN ('preservative','fragrance','colorant','humectant','surfactant','emollient','antioxidant','active','other')),
  short_description TEXT NOT NULL,
  benefits TEXT NOT NULL DEFAULT '[]',
  concerns TEXT NOT NULL DEFAULT '[]',
  evidence_level TEXT NOT NULL CHECK (evidence_level IN ('high','medium','low')),
  source TEXT NOT NULL DEFAULT 'curated',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_ingredient_knowledge_category ON ingredient_knowledge(category);

-- Alias lookup. Each ingredient's own normalized_name is also inserted
-- here (pointing to itself), so a single query resolves both canonical
-- names and known alternative spellings/E-numbers — the same shape as
-- the in-memory ALIAS_INDEX worker/ingredientKnowledge.ts built today.
CREATE TABLE ingredient_aliases (
  alias TEXT PRIMARY KEY,
  normalized_name TEXT NOT NULL REFERENCES ingredient_knowledge(normalized_name) ON DELETE CASCADE
);

CREATE INDEX idx_ingredient_aliases_target ON ingredient_aliases(normalized_name);

INSERT INTO ingredient_knowledge (normalized_name, category, short_description, benefits, concerns, evidence_level) VALUES ('aqua', 'other', 'Νερό, η βάση των περισσότερων προϊόντων.', '["Διαλύτης για τα υπόλοιπα συστατικά"]', '[]', 'high');
INSERT INTO ingredient_knowledge (normalized_name, category, short_description, benefits, concerns, evidence_level) VALUES ('glycerin', 'humectant', 'Ενυδατικό συστατικό φυσικής ή συνθετικής προέλευσης.', '["Συγκρατεί την υγρασία στο δέρμα", "Καλά ανεκτό από τους περισσότερους τύπους δέρματος"]', '[]', 'high');
INSERT INTO ingredient_knowledge (normalized_name, category, short_description, benefits, concerns, evidence_level) VALUES ('parfum', 'fragrance', 'Μείγμα αρωματικών ουσιών, η ακριβής σύσταση δεν δηλώνεται.', '["Βελτιώνει την αισθητηριακή εμπειρία του προϊόντος"]', '["Συχνή αιτία ερεθισμού ή ευαισθητοποίησης του δέρματος", "Η ακριβής σύνθεση δεν είναι διαφανής στον καταναλωτή"]', 'high');
INSERT INTO ingredient_knowledge (normalized_name, category, short_description, benefits, concerns, evidence_level) VALUES ('limonene', 'fragrance', 'Αρωματική ουσία φυσικής προέλευσης, συνηθισμένη σε εσπεριδοειδή.', '["Προσδίδει φρέσκο, εσπεριδοειδές άρωμα"]', '["Αναγνωρισμένο αλλεργιογόνο αρωμάτων στην ΕΕ", "Μπορεί να οξειδωθεί και να γίνει πιο ευαισθητοποιητικό με την έκθεση στον αέρα"]', 'high');
INSERT INTO ingredient_knowledge (normalized_name, category, short_description, benefits, concerns, evidence_level) VALUES ('linalool', 'fragrance', 'Αρωματική ουσία φυσικής προέλευσης, κοινή σε λεβάντα.', '["Προσδίδει ήπιο, ανθικό άρωμα"]', '["Αναγνωρισμένο αλλεργιογόνο αρωμάτων στην ΕΕ", "Μπορεί να προκαλέσει ευαισθητοποίηση όταν οξειδωθεί"]', 'high');
INSERT INTO ingredient_knowledge (normalized_name, category, short_description, benefits, concerns, evidence_level) VALUES ('coumarin', 'fragrance', 'Αρωματική ουσία με χαρακτηριστική μυρωδιά βανίλιας/σανού.', '["Προσδίδει γλυκιά, θερμή νότα στο άρωμα"]', '["Αναγνωρισμένο αλλεργιογόνο αρωμάτων στην ΕΕ"]', 'high');
INSERT INTO ingredient_knowledge (normalized_name, category, short_description, benefits, concerns, evidence_level) VALUES ('citronellol', 'fragrance', 'Αρωματική ουσία φυσικής προέλευσης από γεράνι/σιτρονέλα.', '["Προσδίδει ανθικό, εσπεριδοειδές άρωμα"]', '["Αναγνωρισμένο αλλεργιογόνο αρωμάτων στην ΕΕ"]', 'high');
INSERT INTO ingredient_knowledge (normalized_name, category, short_description, benefits, concerns, evidence_level) VALUES ('geraniol', 'fragrance', 'Αρωματική ουσία φυσικής προέλευσης, κοινή σε τριαντάφυλλο.', '["Προσδίδει ανθικό άρωμα"]', '["Αναγνωρισμένο αλλεργιογόνο αρωμάτων στην ΕΕ"]', 'high');
INSERT INTO ingredient_knowledge (normalized_name, category, short_description, benefits, concerns, evidence_level) VALUES ('citral', 'fragrance', 'Αρωματική ουσία με έντονο άρωμα λεμονιού.', '["Προσδίδει έντονο εσπεριδοειδές άρωμα"]', '["Αναγνωρισμένο αλλεργιογόνο αρωμάτων στην ΕΕ"]', 'high');
INSERT INTO ingredient_knowledge (normalized_name, category, short_description, benefits, concerns, evidence_level) VALUES ('eugenol', 'fragrance', 'Αρωματική ουσία με άρωμα γαρίφαλου.', '["Προσδίδει καρυκευμένη, ξυλώδη νότα"]', '["Αναγνωρισμένο αλλεργιογόνο αρωμάτων στην ΕΕ"]', 'high');
INSERT INTO ingredient_knowledge (normalized_name, category, short_description, benefits, concerns, evidence_level) VALUES ('butylphenyl methylpropional', 'fragrance', 'Συνθετική αρωματική ουσία γνωστή και ως Lilial.', '["Προσδίδει άρωμα κυκλαμίνου"]', '["Απαγορευμένο συστατικό σε καλλυντικά στην ΕΕ από το 2022 λόγω πιθανής τοξικότητας στην αναπαραγωγή", "Η παρουσία του σε ένα προϊόν χρειάζεται προσοχή"]', 'high');
INSERT INTO ingredient_knowledge (normalized_name, category, short_description, benefits, concerns, evidence_level) VALUES ('alpha-isomethyl ionone', 'fragrance', 'Συνθετική αρωματική ουσία με άρωμα βιολέτας.', '["Προσδίδει ανθική, πούδρινη νότα"]', '["Αναγνωρισμένο αλλεργιογόνο αρωμάτων στην ΕΕ"]', 'high');
INSERT INTO ingredient_knowledge (normalized_name, category, short_description, benefits, concerns, evidence_level) VALUES ('benzyl alcohol', 'preservative', 'Χρησιμοποιείται ως συντηρητικό και διαλύτης αρωμάτων.', '["Αποτρέπει την ανάπτυξη μικροοργανισμών στο προϊόν"]', '["Πιθανό αλλεργιογόνο σε ευαίσθητα άτομα"]', 'medium');
INSERT INTO ingredient_knowledge (normalized_name, category, short_description, benefits, concerns, evidence_level) VALUES ('benzyl salicylate', 'fragrance', 'Αρωματική ουσία που χρησιμοποιείται και ως φίλτρο UV σε άρωμα.', '["Σταθεροποιεί άλλα αρωματικά συστατικά"]', '["Αναγνωρισμένο αλλεργιογόνο αρωμάτων στην ΕΕ"]', 'medium');
INSERT INTO ingredient_knowledge (normalized_name, category, short_description, benefits, concerns, evidence_level) VALUES ('benzyl benzoate', 'fragrance', 'Φυσικό συστατικό που λειτουργεί ως διαλύτης αρώματος.', '["Σταθεροποιεί το άρωμα του προϊόντος"]', '["Αναγνωρισμένο αλλεργιογόνο αρωμάτων στην ΕΕ"]', 'medium');
INSERT INTO ingredient_knowledge (normalized_name, category, short_description, benefits, concerns, evidence_level) VALUES ('phenoxyethanol', 'preservative', 'Ευρέως χρησιμοποιούμενο συντηρητικό σε καλλυντικά.', '["Αποτελεσματικό κατά βακτηρίων και μυκήτων", "Θεωρείται ήπια εναλλακτική των parabens"]', '["Σε σπάνιες περιπτώσεις μπορεί να ερεθίσει ευαίσθητο δέρμα"]', 'high');
INSERT INTO ingredient_knowledge (normalized_name, category, short_description, benefits, concerns, evidence_level) VALUES ('sodium benzoate', 'preservative', 'Κοινό συντηρητικό σε τρόφιμα και καλλυντικά.', '["Παρατείνει τη διάρκεια ζωής του προϊόντος", "Εγκεκριμένο πρόσθετο στην ΕΕ (E211)"]', '["Σε συνδυασμό με ασκορβικό οξύ μπορεί να σχηματίσει ίχνη βενζολίου υπό συγκεκριμένες συνθήκες"]', 'medium');
INSERT INTO ingredient_knowledge (normalized_name, category, short_description, benefits, concerns, evidence_level) VALUES ('potassium sorbate', 'preservative', 'Ήπιο συντηρητικό κατά μυκήτων και ζυμών.', '["Καλά ανεκτό από τους περισσότερους καταναλωτές", "Εγκεκριμένο πρόσθετο στην ΕΕ (E202)"]', '[]', 'medium');
INSERT INTO ingredient_knowledge (normalized_name, category, short_description, benefits, concerns, evidence_level) VALUES ('methylparaben', 'preservative', 'Συντηρητικό από την οικογένεια των parabens.', '["Αποτελεσματικό κατά βακτηρίων και μυκήτων"]', '["Πιθανή ορμονική δράση σε πολύ υψηλές συγκεντρώσεις κατά μελέτες", "Ορισμένοι καταναλωτές προτιμούν προϊόντα χωρίς parabens"]', 'medium');
INSERT INTO ingredient_knowledge (normalized_name, category, short_description, benefits, concerns, evidence_level) VALUES ('propylparaben', 'preservative', 'Συντηρητικό από την οικογένεια των parabens.', '["Αποτελεσματικό κατά βακτηρίων και μυκήτων"]', '["Πιθανή ορμονική δράση σε πολύ υψηλές συγκεντρώσεις κατά μελέτες", "Περιορισμένη χρήση σε προϊόντα για παιδιά κάτω των 3 ετών βάσει κανονισμού ΕΕ"]', 'medium');
INSERT INTO ingredient_knowledge (normalized_name, category, short_description, benefits, concerns, evidence_level) VALUES ('sodium lauryl sulfate', 'surfactant', 'Ισχυρό απορρυπαντικό/αφριστικό συστατικό.', '["Αποτελεσματικός καθαρισμός και δημιουργία αφρού"]', '["Μπορεί να αφυδατώσει ή να ερεθίσει ευαίσθητο δέρμα με συχνή χρήση"]', 'medium');
INSERT INTO ingredient_knowledge (normalized_name, category, short_description, benefits, concerns, evidence_level) VALUES ('sodium laureth sulfate', 'surfactant', 'Ηπιότερη παραλλαγή θειικού απορρυπαντικού.', '["Καθαρισμός με αφρό, γενικά ηπιότερο από το SLS"]', '["Μπορεί να περιέχει ίχνη 1,4-διοξανίου ως παραπροϊόν παρασκευής"]', 'medium');
INSERT INTO ingredient_knowledge (normalized_name, category, short_description, benefits, concerns, evidence_level) VALUES ('cocamidopropyl betaine', 'surfactant', 'Ήπιο αφριστικό συστατικό από φυσικά έλαια.', '["Ήπιος καθαρισμός", "Μειώνει τον ερεθισμό από ισχυρότερα απορρυπαντικά στο ίδιο προϊόν"]', '["Σπάνια αιτία επαφικής αλλεργίας"]', 'medium');
INSERT INTO ingredient_knowledge (normalized_name, category, short_description, benefits, concerns, evidence_level) VALUES ('dimethicone', 'emollient', 'Σιλικόνη που προσδίδει απαλή, λεία υφή.', '["Δημιουργεί προστατευτικό φιλμ στο δέρμα", "Βελτιώνει την απλωσιμότητα του προϊόντος"]', '["Μη βιοδιασπώμενο· ορισμένοι καταναλωτές το αποφεύγουν για περιβαλλοντικούς λόγους"]', 'medium');
INSERT INTO ingredient_knowledge (normalized_name, category, short_description, benefits, concerns, evidence_level) VALUES ('cetearyl alcohol', 'emollient', 'Λιπαρή αλκοόλη που σταθεροποιεί γαλακτώματα (δεν στεγνώνει το δέρμα).', '["Σταθεροποιεί κρέμες και γαλακτώματα", "Απαλύνει την υφή του προϊόντος"]', '[]', 'high');
INSERT INTO ingredient_knowledge (normalized_name, category, short_description, benefits, concerns, evidence_level) VALUES ('cetyl alcohol', 'emollient', 'Λιπαρή αλκοόλη με μαλακτική δράση.', '["Απαλύνει και σταθεροποιεί το προϊόν"]', '[]', 'high');
INSERT INTO ingredient_knowledge (normalized_name, category, short_description, benefits, concerns, evidence_level) VALUES ('stearyl alcohol', 'emollient', 'Λιπαρή αλκοόλη που πυκνώνει και σταθεροποιεί.', '["Βελτιώνει την υφή και τη σταθερότητα"]', '[]', 'high');
INSERT INTO ingredient_knowledge (normalized_name, category, short_description, benefits, concerns, evidence_level) VALUES ('butyrospermum parkii', 'emollient', 'Βούτυρο καριτέ, πλούσιο μαλακτικό φυσικής προέλευσης.', '["Έντονα ενυδατικό και μαλακτικό", "Καλά ανεκτό από τους περισσότερους τύπους δέρματος"]', '[]', 'high');
INSERT INTO ingredient_knowledge (normalized_name, category, short_description, benefits, concerns, evidence_level) VALUES ('tocopherol', 'antioxidant', 'Βιταμίνη Ε, φυσικό αντιοξειδωτικό.', '["Προστατεύει το προϊόν και το δέρμα από οξειδωτική φθορά"]', '[]', 'high');
INSERT INTO ingredient_knowledge (normalized_name, category, short_description, benefits, concerns, evidence_level) VALUES ('tocopheryl acetate', 'antioxidant', 'Σταθερή μορφή βιταμίνης Ε.', '["Αντιοξειδωτική δράση", "Καλά ανεκτό από τους περισσότερους τύπους δέρματος"]', '[]', 'high');
INSERT INTO ingredient_knowledge (normalized_name, category, short_description, benefits, concerns, evidence_level) VALUES ('ascorbic acid', 'antioxidant', 'Βιταμίνη C, δραστικό αντιοξειδωτικό συστατικό.', '["Αντιοξειδωτική δράση", "Βοηθά στη φωτεινότητα της επιδερμίδας"]', '["Μπορεί να ερεθίσει πολύ ευαίσθητο δέρμα σε υψηλές συγκεντρώσεις"]', 'high');
INSERT INTO ingredient_knowledge (normalized_name, category, short_description, benefits, concerns, evidence_level) VALUES ('niacinamide', 'active', 'Μορφή βιταμίνης Β3 με πολλαπλά οφέλη για το δέρμα.', '["Ενισχύει το φραγμό του δέρματος", "Βοηθά στην ομοιόμορφη υφή της επιδερμίδας"]', '[]', 'high');
INSERT INTO ingredient_knowledge (normalized_name, category, short_description, benefits, concerns, evidence_level) VALUES ('hyaluronic acid', 'humectant', 'Ισχυρά ενυδατικό μόριο που συγκρατεί νερό.', '["Έντονη ενυδάτωση", "Καλά ανεκτό από τους περισσότερους τύπους δέρματος"]', '[]', 'high');
INSERT INTO ingredient_knowledge (normalized_name, category, short_description, benefits, concerns, evidence_level) VALUES ('panthenol', 'humectant', 'Προβιταμίνη Β5 με καταπραϋντική και ενυδατική δράση.', '["Καταπραΰνει το δέρμα", "Ενισχύει την ενυδάτωση"]', '[]', 'high');
INSERT INTO ingredient_knowledge (normalized_name, category, short_description, benefits, concerns, evidence_level) VALUES ('retinol', 'active', 'Παράγωγο βιταμίνης Α με δράση κατά της γήρανσης.', '["Βοηθά στην ανανέωση του δέρματος"]', '["Μπορεί να προκαλέσει ερεθισμό ή φωτοευαισθησία, ειδικά στην αρχή της χρήσης", "Αντενδείκνυται κατά την εγκυμοσύνη σύμφωνα με γενικές συστάσεις δερματολόγων"]', 'high');
INSERT INTO ingredient_knowledge (normalized_name, category, short_description, benefits, concerns, evidence_level) VALUES ('salicylic acid', 'active', 'Βήτα-υδροξυοξύ (BHA) με απολεπιστική δράση.', '["Καθαρίζει τους πόρους", "Χρήσιμο σε δέρμα με τάση ακμής"]', '["Μπορεί να ερεθίσει ευαίσθητο δέρμα", "Αποφυγή σε υψηλές συγκεντρώσεις κατά την εγκυμοσύνη σύμφωνα με γενικές συστάσεις"]', 'high');
INSERT INTO ingredient_knowledge (normalized_name, category, short_description, benefits, concerns, evidence_level) VALUES ('titanium dioxide', 'colorant', 'Λευκό ορυκτό χρησιμοποιούμενο ως χρωστική ή αντηλιακό φίλτρο.', '["Προσφέρει κάλυψη ή φυσική προστασία από την υπεριώδη ακτινοβολία"]', '["Σε μορφή νανοσωματιδίων και εισπνεόμενη σκόνη υπόκειται σε ειδικές οδηγίες επισήμανσης στην ΕΕ"]', 'high');
INSERT INTO ingredient_knowledge (normalized_name, category, short_description, benefits, concerns, evidence_level) VALUES ('sodium chloride', 'other', 'Αλάτι, χρησιμοποιείται ως πυκνωτικό ή γευστικό συστατικό.', '["Ρυθμίζει την υφή σε καλλυντικά", "Απαραίτητο θρεπτικό στοιχείο σε τρόφιμα με μέτρια κατανάλωση"]', '["Υπερβολική πρόσληψη από τρόφιμα συνδέεται με αυξημένη αρτηριακή πίεση"]', 'high');
INSERT INTO ingredient_knowledge (normalized_name, category, short_description, benefits, concerns, evidence_level) VALUES ('citric acid', 'other', 'Φυσικό οξύ που ρυθμίζει το pH ή προσθέτει γεύση.', '["Σταθεροποιεί προϊόντα και τρόφιμα", "Εγκεκριμένο πρόσθετο στην ΕΕ (E330)"]', '[]', 'high');
INSERT INTO ingredient_knowledge (normalized_name, category, short_description, benefits, concerns, evidence_level) VALUES ('xanthan gum', 'other', 'Φυσικό πυκνωτικό από ζύμωση.', '["Σταθεροποιεί την υφή προϊόντων και τροφίμων", "Εγκεκριμένο πρόσθετο στην ΕΕ (E415)"]', '[]', 'high');
INSERT INTO ingredient_knowledge (normalized_name, category, short_description, benefits, concerns, evidence_level) VALUES ('alcohol denat', 'other', 'Μετουσιωμένη αλκοόλη, χρησιμοποιείται ως διαλύτης ή για γρήγορο στέγνωμα.', '["Βοηθά τα υπόλοιπα συστατικά να απλωθούν και να στεγνώσουν γρήγορα"]', '["Μπορεί να αφυδατώσει ξηρό ή ευαίσθητο δέρμα με συχνή χρήση"]', 'medium');
INSERT INTO ingredient_knowledge (normalized_name, category, short_description, benefits, concerns, evidence_level) VALUES ('aspartame', 'other', 'Τεχνητή γλυκαντική ουσία χαμηλών θερμίδων.', '["Προσφέρει γλυκιά γεύση με ελάχιστες θερμίδες"]', '["Ακατάλληλο για άτομα με φαινυλκετονουρία", "Παραμένει αντικείμενο συζήτησης σε ορισμένες μελέτες μακροχρόνιας κατανάλωσης"]', 'medium');
INSERT INTO ingredient_knowledge (normalized_name, category, short_description, benefits, concerns, evidence_level) VALUES ('monosodium glutamate', 'other', 'Ενισχυτικό γεύσης (umami) ευρείας χρήσης σε τρόφιμα.', '["Ενισχύει τη γεύση χωρίς προσθήκη αλατιού"]', '["Σε ορισμένα άτομα έχει αναφερθεί ευαισθησία με ήπια συμπτώματα"]', 'medium');
INSERT INTO ingredient_knowledge (normalized_name, category, short_description, benefits, concerns, evidence_level) VALUES ('sodium nitrite', 'preservative', 'Συντηρητικό αλλαντικών που αποτρέπει την αλλοίωση.', '["Προστατεύει από επικίνδυνα βακτήρια όπως το κλωστρίδιο του βοτουλισμού"]', '["Μπορεί να σχηματίσει νιτροζαμίνες υπό ορισμένες συνθήκες μαγειρέματος", "Συστήνεται μέτρια κατανάλωση επεξεργασμένου κρέατος"]', 'high');
INSERT INTO ingredient_knowledge (normalized_name, category, short_description, benefits, concerns, evidence_level) VALUES ('palm oil', 'other', 'Φυτικό έλαιο ευρείας χρήσης σε τρόφιμα και καλλυντικά.', '["Σταθερό στη θερμότητα, χρήσιμο για την υφή του προϊόντος"]', '["Η καλλιέργειά του συνδέεται με περιβαλλοντικές επιπτώσεις όταν δεν προέρχεται από πιστοποιημένη βιώσιμη πηγή"]', 'medium');

INSERT INTO ingredient_aliases (alias, normalized_name) VALUES ('aqua', 'aqua');
INSERT INTO ingredient_aliases (alias, normalized_name) VALUES ('water', 'aqua');
INSERT INTO ingredient_aliases (alias, normalized_name) VALUES ('eau', 'aqua');
INSERT INTO ingredient_aliases (alias, normalized_name) VALUES ('νερο', 'aqua');
INSERT INTO ingredient_aliases (alias, normalized_name) VALUES ('νερό', 'aqua');
INSERT INTO ingredient_aliases (alias, normalized_name) VALUES ('glycerin', 'glycerin');
INSERT INTO ingredient_aliases (alias, normalized_name) VALUES ('glycerine', 'glycerin');
INSERT INTO ingredient_aliases (alias, normalized_name) VALUES ('glycerol', 'glycerin');
INSERT INTO ingredient_aliases (alias, normalized_name) VALUES ('γλυκερινη', 'glycerin');
INSERT INTO ingredient_aliases (alias, normalized_name) VALUES ('γλυκερίνη', 'glycerin');
INSERT INTO ingredient_aliases (alias, normalized_name) VALUES ('parfum', 'parfum');
INSERT INTO ingredient_aliases (alias, normalized_name) VALUES ('fragrance', 'parfum');
INSERT INTO ingredient_aliases (alias, normalized_name) VALUES ('aroma', 'parfum');
INSERT INTO ingredient_aliases (alias, normalized_name) VALUES ('αρωμα', 'parfum');
INSERT INTO ingredient_aliases (alias, normalized_name) VALUES ('άρωμα', 'parfum');
INSERT INTO ingredient_aliases (alias, normalized_name) VALUES ('perfume', 'parfum');
INSERT INTO ingredient_aliases (alias, normalized_name) VALUES ('limonene', 'limonene');
INSERT INTO ingredient_aliases (alias, normalized_name) VALUES ('d-limonene', 'limonene');
INSERT INTO ingredient_aliases (alias, normalized_name) VALUES ('linalool', 'linalool');
INSERT INTO ingredient_aliases (alias, normalized_name) VALUES ('coumarin', 'coumarin');
INSERT INTO ingredient_aliases (alias, normalized_name) VALUES ('citronellol', 'citronellol');
INSERT INTO ingredient_aliases (alias, normalized_name) VALUES ('geraniol', 'geraniol');
INSERT INTO ingredient_aliases (alias, normalized_name) VALUES ('citral', 'citral');
INSERT INTO ingredient_aliases (alias, normalized_name) VALUES ('eugenol', 'eugenol');
INSERT INTO ingredient_aliases (alias, normalized_name) VALUES ('butylphenyl methylpropional', 'butylphenyl methylpropional');
INSERT INTO ingredient_aliases (alias, normalized_name) VALUES ('lilial', 'butylphenyl methylpropional');
INSERT INTO ingredient_aliases (alias, normalized_name) VALUES ('butylphenyl methylpropionaldehyde', 'butylphenyl methylpropional');
INSERT INTO ingredient_aliases (alias, normalized_name) VALUES ('alpha-isomethyl ionone', 'alpha-isomethyl ionone');
INSERT INTO ingredient_aliases (alias, normalized_name) VALUES ('alpha isomethyl ionone', 'alpha-isomethyl ionone');
INSERT INTO ingredient_aliases (alias, normalized_name) VALUES ('benzyl alcohol', 'benzyl alcohol');
INSERT INTO ingredient_aliases (alias, normalized_name) VALUES ('benzyl salicylate', 'benzyl salicylate');
INSERT INTO ingredient_aliases (alias, normalized_name) VALUES ('benzyl benzoate', 'benzyl benzoate');
INSERT INTO ingredient_aliases (alias, normalized_name) VALUES ('phenoxyethanol', 'phenoxyethanol');
INSERT INTO ingredient_aliases (alias, normalized_name) VALUES ('phenoxethol', 'phenoxyethanol');
INSERT INTO ingredient_aliases (alias, normalized_name) VALUES ('sodium benzoate', 'sodium benzoate');
INSERT INTO ingredient_aliases (alias, normalized_name) VALUES ('e211', 'sodium benzoate');
INSERT INTO ingredient_aliases (alias, normalized_name) VALUES ('potassium sorbate', 'potassium sorbate');
INSERT INTO ingredient_aliases (alias, normalized_name) VALUES ('e202', 'potassium sorbate');
INSERT INTO ingredient_aliases (alias, normalized_name) VALUES ('methylparaben', 'methylparaben');
INSERT INTO ingredient_aliases (alias, normalized_name) VALUES ('methyl paraben', 'methylparaben');
INSERT INTO ingredient_aliases (alias, normalized_name) VALUES ('propylparaben', 'propylparaben');
INSERT INTO ingredient_aliases (alias, normalized_name) VALUES ('propyl paraben', 'propylparaben');
INSERT INTO ingredient_aliases (alias, normalized_name) VALUES ('sodium lauryl sulfate', 'sodium lauryl sulfate');
INSERT INTO ingredient_aliases (alias, normalized_name) VALUES ('sls', 'sodium lauryl sulfate');
INSERT INTO ingredient_aliases (alias, normalized_name) VALUES ('sodium laureth sulfate', 'sodium laureth sulfate');
INSERT INTO ingredient_aliases (alias, normalized_name) VALUES ('sles', 'sodium laureth sulfate');
INSERT INTO ingredient_aliases (alias, normalized_name) VALUES ('cocamidopropyl betaine', 'cocamidopropyl betaine');
INSERT INTO ingredient_aliases (alias, normalized_name) VALUES ('dimethicone', 'dimethicone');
INSERT INTO ingredient_aliases (alias, normalized_name) VALUES ('polydimethylsiloxane', 'dimethicone');
INSERT INTO ingredient_aliases (alias, normalized_name) VALUES ('cetearyl alcohol', 'cetearyl alcohol');
INSERT INTO ingredient_aliases (alias, normalized_name) VALUES ('cetostearyl alcohol', 'cetearyl alcohol');
INSERT INTO ingredient_aliases (alias, normalized_name) VALUES ('cetyl alcohol', 'cetyl alcohol');
INSERT INTO ingredient_aliases (alias, normalized_name) VALUES ('stearyl alcohol', 'stearyl alcohol');
INSERT INTO ingredient_aliases (alias, normalized_name) VALUES ('butyrospermum parkii', 'butyrospermum parkii');
INSERT INTO ingredient_aliases (alias, normalized_name) VALUES ('shea butter', 'butyrospermum parkii');
INSERT INTO ingredient_aliases (alias, normalized_name) VALUES ('tocopherol', 'tocopherol');
INSERT INTO ingredient_aliases (alias, normalized_name) VALUES ('vitamin e', 'tocopherol');
INSERT INTO ingredient_aliases (alias, normalized_name) VALUES ('tocopheryl acetate', 'tocopheryl acetate');
INSERT INTO ingredient_aliases (alias, normalized_name) VALUES ('vitamin e acetate', 'tocopheryl acetate');
INSERT INTO ingredient_aliases (alias, normalized_name) VALUES ('tocopherol acetate', 'tocopheryl acetate');
INSERT INTO ingredient_aliases (alias, normalized_name) VALUES ('ascorbic acid', 'ascorbic acid');
INSERT INTO ingredient_aliases (alias, normalized_name) VALUES ('vitamin c', 'ascorbic acid');
INSERT INTO ingredient_aliases (alias, normalized_name) VALUES ('niacinamide', 'niacinamide');
INSERT INTO ingredient_aliases (alias, normalized_name) VALUES ('vitamin b3', 'niacinamide');
INSERT INTO ingredient_aliases (alias, normalized_name) VALUES ('nicotinamide', 'niacinamide');
INSERT INTO ingredient_aliases (alias, normalized_name) VALUES ('hyaluronic acid', 'hyaluronic acid');
INSERT INTO ingredient_aliases (alias, normalized_name) VALUES ('sodium hyaluronate', 'hyaluronic acid');
INSERT INTO ingredient_aliases (alias, normalized_name) VALUES ('panthenol', 'panthenol');
INSERT INTO ingredient_aliases (alias, normalized_name) VALUES ('d-panthenol', 'panthenol');
INSERT INTO ingredient_aliases (alias, normalized_name) VALUES ('provitamin b5', 'panthenol');
INSERT INTO ingredient_aliases (alias, normalized_name) VALUES ('retinol', 'retinol');
INSERT INTO ingredient_aliases (alias, normalized_name) VALUES ('vitamin a', 'retinol');
INSERT INTO ingredient_aliases (alias, normalized_name) VALUES ('salicylic acid', 'salicylic acid');
INSERT INTO ingredient_aliases (alias, normalized_name) VALUES ('bha', 'salicylic acid');
INSERT INTO ingredient_aliases (alias, normalized_name) VALUES ('titanium dioxide', 'titanium dioxide');
INSERT INTO ingredient_aliases (alias, normalized_name) VALUES ('ci 77891', 'titanium dioxide');
INSERT INTO ingredient_aliases (alias, normalized_name) VALUES ('sodium chloride', 'sodium chloride');
INSERT INTO ingredient_aliases (alias, normalized_name) VALUES ('salt', 'sodium chloride');
INSERT INTO ingredient_aliases (alias, normalized_name) VALUES ('αλατι', 'sodium chloride');
INSERT INTO ingredient_aliases (alias, normalized_name) VALUES ('αλάτι', 'sodium chloride');
INSERT INTO ingredient_aliases (alias, normalized_name) VALUES ('citric acid', 'citric acid');
INSERT INTO ingredient_aliases (alias, normalized_name) VALUES ('e330', 'citric acid');
INSERT INTO ingredient_aliases (alias, normalized_name) VALUES ('κιτρικο οξυ', 'citric acid');
INSERT INTO ingredient_aliases (alias, normalized_name) VALUES ('κιτρικό οξύ', 'citric acid');
INSERT INTO ingredient_aliases (alias, normalized_name) VALUES ('xanthan gum', 'xanthan gum');
INSERT INTO ingredient_aliases (alias, normalized_name) VALUES ('e415', 'xanthan gum');
INSERT INTO ingredient_aliases (alias, normalized_name) VALUES ('alcohol denat', 'alcohol denat');
INSERT INTO ingredient_aliases (alias, normalized_name) VALUES ('denatured alcohol', 'alcohol denat');
INSERT INTO ingredient_aliases (alias, normalized_name) VALUES ('alcohol denat.', 'alcohol denat');
INSERT INTO ingredient_aliases (alias, normalized_name) VALUES ('aspartame', 'aspartame');
INSERT INTO ingredient_aliases (alias, normalized_name) VALUES ('e951', 'aspartame');
INSERT INTO ingredient_aliases (alias, normalized_name) VALUES ('monosodium glutamate', 'monosodium glutamate');
INSERT INTO ingredient_aliases (alias, normalized_name) VALUES ('msg', 'monosodium glutamate');
INSERT INTO ingredient_aliases (alias, normalized_name) VALUES ('e621', 'monosodium glutamate');
INSERT INTO ingredient_aliases (alias, normalized_name) VALUES ('sodium nitrite', 'sodium nitrite');
INSERT INTO ingredient_aliases (alias, normalized_name) VALUES ('e250', 'sodium nitrite');
INSERT INTO ingredient_aliases (alias, normalized_name) VALUES ('palm oil', 'palm oil');
INSERT INTO ingredient_aliases (alias, normalized_name) VALUES ('elaeis guineensis oil', 'palm oil');
