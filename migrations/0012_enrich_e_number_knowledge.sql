-- Enrichment pass over ingredient_knowledge for E-numbers that were bulk-
-- imported with empty concerns/benefits, or (worse) a placeholder
-- "ENNN food additive" description. Scope: substances with a genuinely
-- documented EU-regulatory or EFSA-reviewed health point to make, using
-- neutral, factual wording rather than the informal "Ακίνδυνο/Επικίνδυνο/
-- Καρκινογόνο" hazard labels some consumer sites use. The much larger set
-- of E-numbers with no established concern (most enzymes, gums, minerals,
-- gases, processing aids) is left with empty concerns — that is an honest
-- "nothing flagged", not a gap.

-- Southampton Six colorants: EU law (Reg. 1333/2008, Annex V) requires
-- these to carry "may have an adverse effect on activity and attention in
-- children" on the label, regardless of quantity.
UPDATE ingredient_knowledge SET
  short_description = 'Ταρτραζίνη — συνθετική κίτρινη χρωστική.',
  benefits = '["Εγκεκριμένο πρόσθετο στην ΕΕ (E102)"]',
  concerns = '["Μία από τις 6 χρωστικές (\"Southampton Six\") που υποχρεωτικά φέρουν στην ετικέτα την προειδοποίηση της ΕΕ \"μπορεί να επηρεάσει δυσμενώς τη δραστηριότητα και την προσοχή στα παιδιά\""]',
  evidence_level = 'high'
WHERE normalized_name = 'e102';

UPDATE ingredient_knowledge SET
  short_description = 'Κιτρινοπρασινωπό κινολίνης — συνθετική κίτρινη χρωστική.',
  benefits = '["Εγκεκριμένο πρόσθετο στην ΕΕ (E104)"]',
  concerns = '["Μία από τις 6 χρωστικές (\"Southampton Six\") που υποχρεωτικά φέρουν στην ετικέτα την προειδοποίηση της ΕΕ \"μπορεί να επηρεάσει δυσμενώς τη δραστηριότητα και την προσοχή στα παιδιά\""]',
  evidence_level = 'high'
WHERE normalized_name = 'e104';

UPDATE ingredient_knowledge SET
  short_description = 'Κίτρινο ηλιοβασιλέματος FCF — συνθετική πορτοκαλοκίτρινη χρωστική.',
  benefits = '["Εγκεκριμένο πρόσθετο στην ΕΕ (E110)"]',
  concerns = '["Μία από τις 6 χρωστικές (\"Southampton Six\") που υποχρεωτικά φέρουν στην ετικέτα την προειδοποίηση της ΕΕ \"μπορεί να επηρεάσει δυσμενώς τη δραστηριότητα και την προσοχή στα παιδιά\""]',
  evidence_level = 'high'
WHERE normalized_name = 'e110';

UPDATE ingredient_knowledge SET
  short_description = 'Αζωρουμπίνη (Καρμοϊσίνη) — συνθετική κόκκινη χρωστική.',
  benefits = '["Εγκεκριμένο πρόσθετο στην ΕΕ (E122)"]',
  concerns = '["Μία από τις 6 χρωστικές (\"Southampton Six\") που υποχρεωτικά φέρουν στην ετικέτα την προειδοποίηση της ΕΕ \"μπορεί να επηρεάσει δυσμενώς τη δραστηριότητα και την προσοχή στα παιδιά\""]',
  evidence_level = 'high'
WHERE normalized_name = 'e122';

UPDATE ingredient_knowledge SET
  short_description = 'Πονσώ 4R — συνθετική κόκκινη χρωστική.',
  benefits = '["Εγκεκριμένο πρόσθετο στην ΕΕ (E124)"]',
  concerns = '["Μία από τις 6 χρωστικές (\"Southampton Six\") που υποχρεωτικά φέρουν στην ετικέτα την προειδοποίηση της ΕΕ \"μπορεί να επηρεάσει δυσμενώς τη δραστηριότητα και την προσοχή στα παιδιά\""]',
  evidence_level = 'high'
WHERE normalized_name = 'e124';

UPDATE ingredient_knowledge SET
  short_description = 'Ερυθρό Allura AC — συνθετική κόκκινη χρωστική.',
  benefits = '["Εγκεκριμένο πρόσθετο στην ΕΕ (E129)"]',
  concerns = '["Μία από τις 6 χρωστικές (\"Southampton Six\") που υποχρεωτικά φέρουν στην ετικέτα την προειδοποίηση της ΕΕ \"μπορεί να επηρεάσει δυσμενώς τη δραστηριότητα και την προσοχή στα παιδιά\""]',
  evidence_level = 'high'
WHERE normalized_name = 'e129';

-- Other colorants with a documented point.
UPDATE ingredient_knowledge SET
  short_description = 'Διοξείδιο του τιτανίου — λευκή χρωστική/αδιαφανοποιητικό.',
  benefits = '[]',
  concerns = '["Δεν είναι πλέον εγκεκριμένο ως πρόσθετο τροφίμων στην ΕΕ από τον Αύγουστο 2022 (Καν. (ΕΕ) 2022/63), καθώς η EFSA δεν μπόρεσε να αποκλείσει γονοτοξικό κίνδυνο· ένα προϊόν με αυτή τη χρωστική στην ετικέτα δεν αντιστοιχεί σε νόμιμη σύνθεση εντός ΕΕ σήμερα"]',
  evidence_level = 'high'
WHERE normalized_name = 'e171';

UPDATE ingredient_knowledge SET
  short_description = 'Κοχενίλη / Καρμίνιο — φυσική κόκκινη χρωστική από το έντομο κοχενίλη.',
  benefits = '["Φυσικής προέλευσης χρωστική", "Εγκεκριμένο πρόσθετο στην ΕΕ (E120)"]',
  concerns = '["Ζωικής προέλευσης (δεν είναι vegan/vegetarian)", "Σπάνιες αλλεργικές αντιδράσεις έχουν αναφερθεί"]',
  evidence_level = 'high'
WHERE normalized_name = 'e120';

UPDATE ingredient_knowledge SET
  short_description = 'Λαμπρό κυανό FCF — συνθετική μπλε χρωστική.',
  benefits = '["Εγκεκριμένο πρόσθετο στην ΕΕ (E133)"]',
  concerns = '["Σπάνιες αλλεργικές αντιδράσεις έχουν αναφερθεί σε ευαίσθητα άτομα"]',
  evidence_level = 'medium'
WHERE normalized_name = 'e133';

UPDATE ingredient_knowledge SET
  short_description = 'Μπλε πατεντέ V — συνθετική μπλε χρωστική.',
  benefits = '["Εγκεκριμένο πρόσθετο στην ΕΕ (E131)"]',
  concerns = '["Σπάνιες περιπτώσεις αλλεργικής αντίδρασης (έως αναφυλαξία) έχουν καταγραφεί"]',
  evidence_level = 'medium'
WHERE normalized_name = 'e131';

UPDATE ingredient_knowledge SET
  short_description = 'Ανάτο / Μπιξίνη — φυσική πορτοκαλοκίτρινη χρωστική από σπόρους Bixa orellana.',
  benefits = '["Φυσικής προέλευσης χρωστική", "Εγκεκριμένο πρόσθετο στην ΕΕ (E160b)"]',
  concerns = '["Σπάνιες αλλεργικές αντιδράσεις έχουν αναφερθεί"]',
  evidence_level = 'medium'
WHERE normalized_name = 'e160b';

-- Sulphites (E220-228): the same EU-declared allergen group already
-- surfaced as its own notice (worker/allergens.ts) — the concern text here
-- explains *why*, for the ingredient card itself.
UPDATE ingredient_knowledge SET
  short_description = 'Διοξείδιο του θείου — συντηρητικό/αντιοξειδωτικό.',
  benefits = '["Εγκεκριμένο πρόσθετο στην ΕΕ (E220)", "Εμποδίζει την αλλοίωση και το σκούρο χρώμα"]',
  concerns = '["Δηλωμένο αλλεργιογόνο της ΕΕ — μπορεί να προκαλέσει αντιδράσεις σε ευαίσθητα άτομα, ιδίως ασθματικούς"]',
  evidence_level = 'high'
WHERE normalized_name = 'e220';

UPDATE ingredient_knowledge SET
  short_description = 'Θειώδες νάτριο — συντηρητικό.',
  benefits = '["Εγκεκριμένο πρόσθετο στην ΕΕ (E221)"]',
  concerns = '["Δηλωμένο αλλεργιογόνο της ΕΕ — μπορεί να προκαλέσει αντιδράσεις σε ευαίσθητα άτομα, ιδίως ασθματικούς"]',
  evidence_level = 'high'
WHERE normalized_name = 'e221';

UPDATE ingredient_knowledge SET
  short_description = 'Όξινο θειώδες νάτριο — συντηρητικό.',
  benefits = '["Εγκεκριμένο πρόσθετο στην ΕΕ (E222)"]',
  concerns = '["Δηλωμένο αλλεργιογόνο της ΕΕ — μπορεί να προκαλέσει αντιδράσεις σε ευαίσθητα άτομα, ιδίως ασθματικούς"]',
  evidence_level = 'high'
WHERE normalized_name = 'e222';

UPDATE ingredient_knowledge SET
  short_description = 'Μεταδιθειώδες νάτριο — συντηρητικό.',
  benefits = '["Εγκεκριμένο πρόσθετο στην ΕΕ (E223)"]',
  concerns = '["Δηλωμένο αλλεργιογόνο της ΕΕ — μπορεί να προκαλέσει αντιδράσεις σε ευαίσθητα άτομα, ιδίως ασθματικούς"]',
  evidence_level = 'high'
WHERE normalized_name = 'e223';

UPDATE ingredient_knowledge SET
  short_description = 'Μεταδιθειώδες κάλιο — συντηρητικό.',
  benefits = '["Εγκεκριμένο πρόσθετο στην ΕΕ (E224)"]',
  concerns = '["Δηλωμένο αλλεργιογόνο της ΕΕ — μπορεί να προκαλέσει αντιδράσεις σε ευαίσθητα άτομα, ιδίως ασθματικούς"]',
  evidence_level = 'high'
WHERE normalized_name = 'e224';

UPDATE ingredient_knowledge SET
  short_description = 'Θειώδες ασβέστιο — συντηρητικό.',
  benefits = '["Εγκεκριμένο πρόσθετο στην ΕΕ (E226)"]',
  concerns = '["Δηλωμένο αλλεργιογόνο της ΕΕ — μπορεί να προκαλέσει αντιδράσεις σε ευαίσθητα άτομα, ιδίως ασθματικούς"]',
  evidence_level = 'high'
WHERE normalized_name = 'e226';

UPDATE ingredient_knowledge SET
  short_description = 'Όξινο θειώδες ασβέστιο — συντηρητικό.',
  benefits = '["Εγκεκριμένο πρόσθετο στην ΕΕ (E227)"]',
  concerns = '["Δηλωμένο αλλεργιογόνο της ΕΕ — μπορεί να προκαλέσει αντιδράσεις σε ευαίσθητα άτομα, ιδίως ασθματικούς"]',
  evidence_level = 'high'
WHERE normalized_name = 'e227';

UPDATE ingredient_knowledge SET
  short_description = 'Όξινο θειώδες κάλιο — συντηρητικό.',
  benefits = '["Εγκεκριμένο πρόσθετο στην ΕΕ (E228)"]',
  concerns = '["Δηλωμένο αλλεργιογόνο της ΕΕ — μπορεί να προκαλέσει αντιδράσεις σε ευαίσθητα άτομα, ιδίως ασθματικούς"]',
  evidence_level = 'high'
WHERE normalized_name = 'e228';

-- Benzoates: combined with ascorbic acid (vitamin C), trace benzene can
-- form under heat/light — an EFSA-documented reaction, not a property of
-- either substance alone.
UPDATE ingredient_knowledge SET
  short_description = 'Βενζοϊκό οξύ — συντηρητικό.',
  benefits = '["Εγκεκριμένο πρόσθετο στην ΕΕ (E210)"]',
  concerns = '["Σε συνδυασμό με ασκορβικό οξύ (βιταμίνη C) μπορεί να σχηματίσει ίχνη βενζολίου υπό συνθήκες θερμότητας/φωτός"]',
  evidence_level = 'medium'
WHERE normalized_name = 'e210';

UPDATE ingredient_knowledge SET
  short_description = 'Βενζοϊκό κάλιο — συντηρητικό.',
  benefits = '["Εγκεκριμένο πρόσθετο στην ΕΕ (E212)"]',
  concerns = '["Σε συνδυασμό με ασκορβικό οξύ (βιταμίνη C) μπορεί να σχηματίσει ίχνη βενζολίου υπό συνθήκες θερμότητας/φωτός"]',
  evidence_level = 'medium'
WHERE normalized_name = 'e212';

UPDATE ingredient_knowledge SET
  short_description = 'Βενζοϊκό ασβέστιο — συντηρητικό.',
  benefits = '["Εγκεκριμένο πρόσθετο στην ΕΕ (E213)"]',
  concerns = '["Σε συνδυασμό με ασκορβικό οξύ (βιταμίνη C) μπορεί να σχηματίσει ίχνη βενζολίου υπό συνθήκες θερμότητας/φωτός"]',
  evidence_level = 'medium'
WHERE normalized_name = 'e213';

-- Parabens: E216/E217 lost their EU food-additive approval in 2006;
-- E214/E215 remain approved.
UPDATE ingredient_knowledge SET
  short_description = 'Αιθυλ-παραβένη (p-υδροξυβενζοϊκό αιθύλιο) — συντηρητικό.',
  benefits = '["Εγκεκριμένο πρόσθετο στην ΕΕ (E214)"]',
  concerns = '[]',
  evidence_level = 'medium'
WHERE normalized_name = 'e214';

UPDATE ingredient_knowledge SET
  short_description = 'Προπυλ-παραβένη (p-υδροξυβενζοϊκό προπύλιο) — συντηρητικό.',
  benefits = '[]',
  concerns = '["Δεν είναι πλέον εγκεκριμένο ως πρόσθετο τροφίμων στην ΕΕ από το 2006, λόγω ανησυχιών για ενδοκρινική δράση"]',
  evidence_level = 'high'
WHERE normalized_name = 'e216';

-- Nitrites/nitrates: cured-meat preservatives; nitrosamine formation is
-- the documented mechanism behind the IARC "processed meat" classification.
UPDATE ingredient_knowledge SET
  short_description = 'Νιτρώδες κάλιο — συντηρητικό επεξεργασμένου κρέατος.',
  benefits = '["Προστατεύει από το κλωστρίδιο του βοτουλισμού"]',
  concerns = '["Μπορεί να σχηματίσει νιτροζαμίνες υπό συνθήκες υψηλής θερμοκρασίας μαγειρέματος", "Συστήνεται μέτρια κατανάλωση επεξεργασμένου κρέατος"]',
  evidence_level = 'high'
WHERE normalized_name = 'e249';

UPDATE ingredient_knowledge SET
  short_description = 'Νιτρικό νάτριο — συντηρητικό επεξεργασμένου κρέατος.',
  benefits = '["Προστατεύει από το κλωστρίδιο του βοτουλισμού"]',
  concerns = '["Μπορεί να μετατραπεί σε νιτρώδες και να σχηματίσει νιτροζαμίνες υπό συνθήκες υψηλής θερμοκρασίας μαγειρέματος", "Συστήνεται μέτρια κατανάλωση επεξεργασμένου κρέατος"]',
  evidence_level = 'high'
WHERE normalized_name = 'e251';

UPDATE ingredient_knowledge SET
  short_description = 'Νιτρικό κάλιο — συντηρητικό επεξεργασμένου κρέατος.',
  benefits = '["Προστατεύει από το κλωστρίδιο του βοτουλισμού"]',
  concerns = '["Μπορεί να μετατραπεί σε νιτρώδες και να σχηματίσει νιτροζαμίνες υπό συνθήκες υψηλής θερμοκρασίας μαγειρέματος", "Συστήνεται μέτρια κατανάλωση επεξεργασμένου κρέατος"]',
  evidence_level = 'high'
WHERE normalized_name = 'e252';

-- Antioxidants BHA/BHT/TBHQ: EFSA re-evaluations flagged these specifically
-- (unlike the tocopherols/ascorbates around them), with lowered ADIs.
UPDATE ingredient_knowledge SET
  short_description = 'Βουτυλιωμένη υδροξυανισόλη (BHA) — συνθετικό αντιοξειδωτικό.',
  benefits = '["Εγκεκριμένο πρόσθετο στην ΕΕ (E320)", "Καθυστερεί την τάγγιση λιπαρών"]',
  concerns = '["Η EFSA χαμήλωσε το αποδεκτό ημερήσιο όριο πρόσληψης μετά από επαναξιολόγηση το 2011· ταξινομείται από τον IARC ως πιθανώς καρκινογόνο για τον άνθρωπο (ομάδα 2Β)"]',
  evidence_level = 'high'
WHERE normalized_name = 'e320';

UPDATE ingredient_knowledge SET
  short_description = 'Βουτυλιωμένο υδροξυτολουόλιο (BHT) — συνθετικό αντιοξειδωτικό.',
  benefits = '["Εγκεκριμένο πρόσθετο στην ΕΕ (E321)", "Καθυστερεί την τάγγιση λιπαρών"]',
  concerns = '["Συζητούνται πιθανές ενδοκρινικές επιδράσεις σε μελέτες σε ζώα σε υψηλές δόσεις· η EFSA διατηρεί το αποδεκτό ημερήσιο όριο πρόσληψης"]',
  evidence_level = 'medium'
WHERE normalized_name = 'e321';

UPDATE ingredient_knowledge SET
  short_description = 'Τριτ-βουτυλυδροκινόνη (TBHQ) — συνθετικό αντιοξειδωτικό.',
  benefits = '["Εγκεκριμένο πρόσθετο στην ΕΕ (E319)", "Καθυστερεί την τάγγιση λιπαρών"]',
  concerns = '["Σε μελέτες σε ζώα σε υψηλές δόσεις έχουν αναφερθεί επιδράσεις· η EFSA διατηρεί το αποδεκτό ημερήσιο όριο πρόσληψης"]',
  evidence_level = 'medium'
WHERE normalized_name = 'e319';

-- Phosphates: EFSA's 2019 re-evaluation found the margin between typical
-- high intake and the safe threshold narrower than previously thought.
UPDATE ingredient_knowledge SET
  short_description = 'Διφωσφορικά άλατα — γαλακτωματοποιητές/διογκωτικά.',
  benefits = '["Εγκεκριμένο πρόσθετο στην ΕΕ (E450)"]',
  concerns = '["Η EFSA (2019) επισήμανε ότι σε άτομα με υψηλή συνολική πρόσληψη φωσφορικών από διάφορες πηγές το περιθώριο ασφαλείας είναι στενότερο απ'' ό,τι θεωρούνταν"]',
  evidence_level = 'medium'
WHERE normalized_name = 'e450';

UPDATE ingredient_knowledge SET
  short_description = 'Τριφωσφορικά άλατα — σταθεροποιητές/συγκρατητές υγρασίας.',
  benefits = '["Εγκεκριμένο πρόσθετο στην ΕΕ (E451)"]',
  concerns = '["Η EFSA (2019) επισήμανε ότι σε άτομα με υψηλή συνολική πρόσληψη φωσφορικών από διάφορες πηγές το περιθώριο ασφαλείας είναι στενότερο απ'' ό,τι θεωρούνταν"]',
  evidence_level = 'medium'
WHERE normalized_name = 'e451';

UPDATE ingredient_knowledge SET
  short_description = 'Πολυφωσφορικά άλατα — σταθεροποιητές/συγκρατητές υγρασίας.',
  benefits = '["Εγκεκριμένο πρόσθετο στην ΕΕ (E452)"]',
  concerns = '["Η EFSA (2019) επισήμανε ότι σε άτομα με υψηλή συνολική πρόσληψη φωσφορικών από διάφορες πηγές το περιθώριο ασφαλείας είναι στενότερο απ'' ό,τι θεωρούνταν"]',
  evidence_level = 'medium'
WHERE normalized_name = 'e452';

-- Carrageenan: food-grade carrageenan is EFSA-approved, but its
-- degraded/lower-molecular-weight form (not the food additive) is what
-- animal-study digestive concerns are about — worth the distinction.
UPDATE ingredient_knowledge SET
  short_description = 'Καραγενάνη — πυκνωτικό/σταθεροποιητικό από φύκια.',
  benefits = '["Φυσικής προέλευσης", "Εγκεκριμένο πρόσθετο στην ΕΕ (E407)"]',
  concerns = '["Ορισμένες μελέτες σε ζώα συνδέουν την αποικοδομημένη μορφή (διαφορετική από το εγκεκριμένο πρόσθετο τροφίμων) με ερεθισμό του πεπτικού συστήματος"]',
  evidence_level = 'medium'
WHERE normalized_name = 'e407';

-- Sweeteners beyond aspartame/acesulfame, which already have entries.
UPDATE ingredient_knowledge SET
  short_description = 'Κυκλαμικό οξύ και άλατα — τεχνητό γλυκαντικό.',
  benefits = '["Εγκεκριμένο πρόσθετο στην ΕΕ (E952)", "Χωρίς θερμίδες"]',
  concerns = '["Απαγορευμένο ως πρόσθετο τροφίμων στις ΗΠΑ από το 1969· παραμένει εγκεκριμένο στην ΕΕ με καθορισμένο αποδεκτό ημερήσιο όριο"]',
  evidence_level = 'medium'
WHERE normalized_name = 'e952';

UPDATE ingredient_knowledge SET
  short_description = 'Σακχαρίνη — τεχνητό γλυκαντικό.',
  benefits = '["Εγκεκριμένο πρόσθετο στην ΕΕ (E954)", "Χωρίς θερμίδες"]',
  concerns = '["Παλαιότερες μελέτες σε αρουραίους την είχαν συνδέσει με καρκίνο της ουροδόχου κύστης· ο μηχανισμός κρίθηκε μη σχετικός για τον άνθρωπο και αφαιρέθηκε από τις λίστες πιθανών καρκινογόνων"]',
  evidence_level = 'medium'
WHERE normalized_name = 'e954';

UPDATE ingredient_knowledge SET
  short_description = 'Σουκραλόζη — τεχνητό γλυκαντικό.',
  benefits = '["Εγκεκριμένο πρόσθετο στην ΕΕ (E955)", "Χωρίς θερμίδες", "Σταθερή στη θερμότητα"]',
  concerns = '["Ο ΠΟΥ δεν συστήνει τα μη ζαχαρούχα γλυκαντικά για έλεγχο βάρους"]',
  evidence_level = 'medium'
WHERE normalized_name = 'e955';

UPDATE ingredient_knowledge SET
  short_description = 'Γλυκοζίτες στεβιόλης (στέβια) — φυσικό γλυκαντικό.',
  benefits = '["Φυτικής προέλευσης", "Εγκεκριμένο πρόσθετο στην ΕΕ (E960)", "Χωρίς θερμίδες"]',
  concerns = '["Ο ΠΟΥ δεν συστήνει τα μη ζαχαρούχα γλυκαντικά για έλεγχο βάρους"]',
  evidence_level = 'medium'
WHERE normalized_name = 'e960';

-- EDTA: a chelating agent — its documented effect is on mineral
-- absorption at sustained high intake, not toxicity of the molecule itself.
UPDATE ingredient_knowledge SET
  short_description = 'Αιθυλενοδιαμινοτετραοξικό ασβεστιονάτριο (EDTA) — συντηρητικό/σταθεροποιητικό.',
  benefits = '["Εγκεκριμένο πρόσθετο στην ΕΕ (E385)", "Σταθεροποιεί χρώμα και γεύση δεσμεύοντας ίχνη μετάλλων"]',
  concerns = '["Σε παρατεταμένη υψηλή πρόσληψη μπορεί να δεσμεύσει και να μειώσει την απορρόφηση ασβεστίου/σιδήρου"]',
  evidence_level = 'medium'
WHERE normalized_name = 'e385';

-- --- Data-quality fixes: rows carrying a placeholder description, or (for
-- --- e103/e128/e143/e152) a false "εγκεκριμένο στην ΕΕ" claim for a
-- --- colorant that is not on the EU's current approved list at all.
UPDATE ingredient_knowledge SET
  short_description = 'Χρυσοΐνη — συνθετική πορτοκαλοκίτρινη χρωστική.',
  benefits = '[]',
  concerns = '["Δεν περιλαμβάνεται στη λίστα εγκεκριμένων προσθέτων τροφίμων της ΕΕ"]',
  evidence_level = 'medium'
WHERE normalized_name = 'e103';

UPDATE ingredient_knowledge SET
  short_description = 'Ερυθρό 2G — συνθετική κόκκινη χρωστική.',
  benefits = '[]',
  concerns = '["Ανακλήθηκε η έγκρισή του ως πρόσθετο τροφίμων στην ΕΕ το 2007, καθώς ο κύριος μεταβολίτης του (ανιλίνη) δεν αποκλείστηκε ως γονοτοξικός/καρκινογόνος"]',
  evidence_level = 'high'
WHERE normalized_name = 'e128';

UPDATE ingredient_knowledge SET
  short_description = 'Πράσινο FCF (Fast Green FCF) — συνθετική πράσινη χρωστική.',
  benefits = '[]',
  concerns = '["Δεν περιλαμβάνεται στη λίστα εγκεκριμένων προσθέτων τροφίμων της ΕΕ (επιτρέπεται σε άλλες χώρες, π.χ. ΗΠΑ)"]',
  evidence_level = 'medium'
WHERE normalized_name = 'e143';

UPDATE ingredient_knowledge SET
  short_description = 'Μαύρος άνθρακας (φυτικής/ορυκτής προέλευσης) — μαύρη χρωστική.',
  benefits = '[]',
  concerns = '["Δεν περιλαμβάνεται στη λίστα εγκεκριμένων προσθέτων τροφίμων της ΕΕ"]',
  evidence_level = 'medium'
WHERE normalized_name = 'e152';

UPDATE ingredient_knowledge SET
  short_description = 'Χλωροφύλλες/χλωροφυλλίνες σύμπλοκα χαλκού — πράσινη χρωστική.',
  benefits = '["Εγκεκριμένο πρόσθετο στην ΕΕ (E141)"]',
  concerns = '[]',
  evidence_level = 'low'
WHERE normalized_name = 'e141';

UPDATE ingredient_knowledge SET
  short_description = '5′-φωσφορική ριβοφλαβίνη — παράγωγο βιταμίνης Β2, χρησιμοποιείται και ως χρωστική.',
  benefits = '["Εγκεκριμένο πρόσθετο στην ΕΕ (E101a)"]',
  concerns = '[]',
  evidence_level = 'low'
WHERE normalized_name = 'e101a';

UPDATE ingredient_knowledge SET
  short_description = 'Κόμμι ακακίας, τροποποιημένη μορφή — σταθεροποιητικό/γαλακτωματοποιητής.',
  benefits = '["Εγκεκριμένο πρόσθετο στην ΕΕ (E414)"]',
  concerns = '[]',
  evidence_level = 'low'
WHERE normalized_name = 'e414a';

UPDATE ingredient_knowledge SET
  short_description = 'Εκχύλισμα κιλάγιας (Quillaia) — φυσικός γαλακτωματοποιητής/αφριστικό.',
  benefits = '["Φυτικής προέλευσης", "Εγκεκριμένο πρόσθετο στην ΕΕ (E999)"]',
  concerns = '[]',
  evidence_level = 'low'
WHERE normalized_name = 'exxx';

UPDATE ingredient_knowledge SET
  short_description = 'Πολυφωσφορικό νάτριο ασβεστίου — σταθεροποιητικό.',
  benefits = '["Εγκεκριμένο πρόσθετο στην ΕΕ (E543)"]',
  concerns = '["Μέρος της ίδιας οικογένειας φωσφορικών προσθέτων που η EFSA (2019) επισήμανε ότι σε υψηλή συνολική πρόσληψη έχουν στενότερο περιθώριο ασφαλείας απ'' ό,τι θεωρούνταν"]',
  evidence_level = 'medium'
WHERE normalized_name = 'e543';

-- "e15x" is not a real, single EU E-number (it was a mis-scraped grouping
-- placeholder for the E150 caramel-colour family, a-d, which already have
-- their own correct rows) — mark it as such rather than leave a fabricated
-- "food additive" description standing.
UPDATE ingredient_knowledge SET
  short_description = 'Δεν αντιστοιχεί σε συγκεκριμένο κωδικό E — πιθανή αναφορά στην οικογένεια καραμελόχρωμα E150a–E150d.',
  benefits = '[]',
  concerns = '[]',
  evidence_level = 'low'
WHERE normalized_name = 'e15x';
