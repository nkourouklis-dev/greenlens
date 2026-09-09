-- Deterministic scoring rules on top of the existing ingredient knowledge.
--
-- Until now `scoreInterpretation` took its severities straight from the
-- model's `ingredientFindings`, which made the score a function of how many
-- items the model happened to flag on a given run rather than of what the
-- product actually contains. Two Coca-Cola variants scanned an hour apart
-- landed at 96 (full sugar) and 92 (zero sugar) — the full-sugar one scored
-- *higher* purely because the model flagged one fewer item on that run.
--
-- Scoring now resolves against this table instead. Three new columns:
--
--   rule_severity   how bad this ingredient is, decided here and not by the
--                   model. 'neutral' (the default) costs nothing, so all
--                   ~714 existing rows stay score-neutral until given a rule.
--   penalty_points  points deducted from 100 when present.
--   bulk_weighted   1 for ingredients whose harm scales with how much of the
--                   product they are (sugar, palm oil, salt) — their penalty
--                   is multiplied by where they sit in the ingredient list,
--                   since EU labelling mandates descending-quantity order.
--                   0 for trace additives, where position says nothing.
--   rule_group      ingredients that are the same problem wearing different
--                   names. Only the highest-penalty member of a group is
--                   charged, once — otherwise a drink listing three
--                   sweeteners would be penalised three times for having
--                   been sweetened once.
--
-- Additives already arrived via 0003_import_off_additives.sql, canonicalised
-- by E-number with English aliases and unaccented Greek descriptions. So the
-- additive rules below are UPDATEs keyed on E-number, not INSERTs, and every
-- alias here is INSERT OR IGNORE — a good part of what a label actually
-- says in Greek is still missing from that import, but some of it is not,
-- and a plain INSERT aborts the whole migration on the first collision.
ALTER TABLE ingredient_knowledge ADD COLUMN rule_severity TEXT NOT NULL DEFAULT 'neutral';
ALTER TABLE ingredient_knowledge ADD COLUMN penalty_points INTEGER NOT NULL DEFAULT 0;
ALTER TABLE ingredient_knowledge ADD COLUMN bulk_weighted INTEGER NOT NULL DEFAULT 0;
ALTER TABLE ingredient_knowledge ADD COLUMN rule_group TEXT;

-- Food staples the knowledge base never had an entry for, which is exactly
-- why every scanned food product scored in the nineties: the things that
-- actually make a soft drink or a biscuit unhealthy had no row to be
-- penalised through.
INSERT INTO ingredient_knowledge (normalized_name, category, short_description, benefits, concerns, evidence_level, rule_severity, penalty_points, bulk_weighted, rule_group) VALUES
('sugar', 'other', 'Πρόσθετη ζάχαρη', '[]', '["Υψηλή πρόσληψη συνδέεται με παχυσαρκία, διαβήτη τύπου 2 και τερηδόνα","Ο ΠΟΥ συστήνει έως 10% της ημερήσιας ενέργειας από ελεύθερα σάκχαρα"]', 'high', 'high_concern', 25, 1, 'added_sugar'),
('glucose-fructose syrup', 'other', 'Σιρόπι γλυκόζης-φρουκτόζης', '[]', '["Φθηνή πηγή ελεύθερων σακχάρων, δείκτης υπερεπεξεργασμένου τροφίμου","Υψηλή πρόσληψη φρουκτόζης επιβαρύνει το ήπαρ"]', 'high', 'high_concern', 28, 1, 'added_sugar'),
('fructose', 'other', 'Φρουκτόζη ως πρόσθετο σάκχαρο', '[]', '["Μεταβολίζεται στο ήπαρ· υψηλή πρόσληψη συνδέεται με λιπώδη διήθηση"]', 'medium', 'caution', 15, 1, 'added_sugar'),
('caffeine', 'other', 'Καφεΐνη', '["Αυξάνει προσωρινά την εγρήγορση"]', '["Δεν συνιστάται σε παιδιά και εγκύους","Μπορεί να επηρεάσει τον ύπνο"]', 'high', 'caution', 5, 0, NULL),
('sunflower oil', 'other', 'Ηλιέλαιο', '["Πηγή βιταμίνης E","Πολύ λιγότερα κορεσμένα από το φοινικέλαιο"]', '[]', 'high', 'neutral', 0, 0, NULL);

-- Sweeteners. Grouped so that a "light" drink listing cyclamate, acesulfame K
-- and aspartame is charged once for being artificially sweetened.
UPDATE ingredient_knowledge SET rule_severity = 'caution', penalty_points = 15, rule_group = 'artificial_sweetener',
  short_description = 'Τεχνητό γλυκαντικό',
  concerns = '["Ο ΠΟΥ δεν συστήνει τα μη ζαχαρούχα γλυκαντικά για έλεγχο βάρους"]'
WHERE normalized_name IN ('e950', 'e952', 'e954', 'e955', 'aspartame');

-- Polyols: mild, and the concern is digestive rather than metabolic.
UPDATE ingredient_knowledge SET rule_severity = 'caution', penalty_points = 6, rule_group = 'polyol',
  short_description = 'Γλυκαντικό πολυόλης',
  concerns = '["Καθαρτική δράση σε μεγάλες ποσότητες"]'
WHERE normalized_name IN ('e965', 'e420');

UPDATE ingredient_knowledge SET rule_severity = 'caution', penalty_points = 8,
  short_description = 'Φωσφορικό οξύ (μέσο οξίνισης)',
  concerns = '["Συνδέεται με διάβρωση της αδαμαντίνης","Υψηλή πρόσληψη φωσφορικών συνδέεται με μειωμένη οστική πυκνότητα"]'
WHERE normalized_name = 'e338';

UPDATE ingredient_knowledge SET rule_severity = 'caution', penalty_points = 8,
  short_description = 'Καραμελόχρωμα θειώδους αμμωνίας (E150d)',
  concerns = '["Η παρασκευή του παράγει 4-μεθυλιμιδαζόλιο, ουσία υπό διερεύνηση","Δείκτης υπερεπεξεργασίας"]'
WHERE normalized_name = 'e150d';

UPDATE ingredient_knowledge SET rule_severity = 'caution', penalty_points = 8,
  short_description = 'Διφωσφορικά άλατα (E450)',
  concerns = '["Δείκτης υπερεπεξεργασμένου τροφίμου κατά NOVA","Συμβάλλει στη συνολική πρόσληψη φωσφορικών"]'
WHERE normalized_name = 'e450';

-- Nitrites in cured meat: the one food additive with a WHO Group 1
-- classification behind it.
UPDATE ingredient_knowledge SET rule_severity = 'high_concern', penalty_points = 20 WHERE normalized_name IN ('sodium nitrite', 'e250');

UPDATE ingredient_knowledge SET rule_severity = 'caution', penalty_points = 12, bulk_weighted = 1 WHERE normalized_name = 'palm oil';
UPDATE ingredient_knowledge SET rule_severity = 'caution', penalty_points = 8, bulk_weighted = 1, rule_group = 'salt' WHERE normalized_name = 'sodium chloride';
UPDATE ingredient_knowledge SET rule_severity = 'caution', penalty_points = 8 WHERE normalized_name IN ('monosodium glutamate', 'e621');

-- Cosmetics rules, against the INCI entries from 0001.
UPDATE ingredient_knowledge SET rule_severity = 'high_concern', penalty_points = 30 WHERE normalized_name = 'butylphenyl methylpropional';
UPDATE ingredient_knowledge SET rule_severity = 'caution', penalty_points = 8 WHERE normalized_name = 'sodium lauryl sulfate';
UPDATE ingredient_knowledge SET rule_severity = 'caution', penalty_points = 5 WHERE normalized_name = 'sodium laureth sulfate';
UPDATE ingredient_knowledge SET rule_severity = 'caution', penalty_points = 5 WHERE normalized_name = 'alcohol denat';
UPDATE ingredient_knowledge SET rule_severity = 'caution', penalty_points = 10, rule_group = 'paraben' WHERE normalized_name IN ('methylparaben', 'propylparaben');

-- Declared EU fragrance allergens. Individually minor and almost always
-- present as a set, so they share a group: a product is penalised for being
-- fragranced, not once per molecule on the label.
UPDATE ingredient_knowledge SET rule_severity = 'caution', penalty_points = 5, rule_group = 'fragrance_allergen'
WHERE normalized_name IN ('limonene', 'linalool', 'coumarin', 'citronellol', 'geraniol', 'citral', 'eugenol', 'alpha-isomethyl ionone', 'benzyl salicylate', 'benzyl benzoate');

UPDATE ingredient_knowledge SET rule_severity = 'caution', penalty_points = 6, rule_group = 'fragrance_allergen' WHERE normalized_name = 'parfum';

-- Greek aliases. The OFF import brought English names and E-numbers; a Greek
-- label writes "ζάχαρη" and "φωσφορικό οξύ", accented or not depending on the
-- printing, so both spellings are registered.
INSERT OR IGNORE INTO ingredient_aliases (alias, normalized_name) VALUES
('sugar', 'sugar'),
('ζάχαρη', 'sugar'),
('ζαχαρη', 'sugar'),
('σακχαρόζη', 'sugar'),
('σακχαροζη', 'sugar'),
('sucrose', 'sugar'),
('saccharose', 'sugar'),
('glucose-fructose syrup', 'glucose-fructose syrup'),
('σιρόπι γλυκόζης-φρουκτόζης', 'glucose-fructose syrup'),
('σιροπι γλυκοζης-φρουκτοζης', 'glucose-fructose syrup'),
('σιρόπι γλυκόζης φρουκτόζης', 'glucose-fructose syrup'),
('high fructose corn syrup', 'glucose-fructose syrup'),
('hfcs', 'glucose-fructose syrup'),
('isoglucose', 'glucose-fructose syrup'),
('ισογλυκόζη', 'glucose-fructose syrup'),
('ισογλυκοζη', 'glucose-fructose syrup'),
('fructose', 'fructose'),
('φρουκτόζη', 'fructose'),
('φρουκτοζη', 'fructose'),
('caffeine', 'caffeine'),
('καφεΐνη', 'caffeine'),
('καφεινη', 'caffeine'),
('sunflower oil', 'sunflower oil'),
('ηλιέλαιο', 'sunflower oil'),
('ηλιελαιο', 'sunflower oil'),
('helianthus annuus seed oil', 'sunflower oil'),
('ακεσουλφάμη κ', 'e950'),
('ακεσουλφαμη κ', 'e950'),
('κυκλαμικό νάτριο', 'e952'),
('κυκλαμικο νατριο', 'e952'),
('σακχαρίνη', 'e954'),
('σακχαρινη', 'e954'),
('σουκραλόζη', 'e955'),
('σουκραλοζη', 'e955'),
('ασπαρτάμη', 'aspartame'),
('ασπαρταμη', 'aspartame'),
('φωσφορικό οξύ', 'e338'),
('φωσφορικο οξυ', 'e338'),
('καραμελόχρωμα', 'e150d'),
('καραμελοχρωμα', 'e150d'),
('ε150d', 'e150d'),
('e 150d', 'e150d'),
('ε 150d', 'e150d'),
('μαλτιτόλη', 'e965'),
('μαλτιτολη', 'e965'),
('σορβιτόλη', 'e420'),
('σορβιτολη', 'e420'),
('διφωσφορικά', 'e450'),
('διφωσφορικα', 'e450'),
('φοινικέλαιο', 'palm oil'),
('φοινικελαιο', 'palm oil');
