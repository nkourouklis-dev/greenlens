-- Curated nutrient knowledge — a starting set, not a comprehensive
-- nutrition-science taxonomy. Unlike ingredient_knowledge (migrated
-- from an existing registry), nothing like this existed before: every
-- nutrition-path description came entirely from the AI's own wording
-- each time. Same JSON-array shape as ingredient_knowledge's
-- benefits/concerns, called 'guidance' here since a nutrient is rarely
-- purely good or bad the way an ingredient's concerns list implies.

CREATE TABLE nutrient_knowledge (
  normalized_name TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  short_description TEXT NOT NULL,
  guidance TEXT NOT NULL DEFAULT '[]',
  evidence_level TEXT NOT NULL CHECK (evidence_level IN ('high','medium','low')),
  applies_to TEXT NOT NULL DEFAULT 'human_food' CHECK (applies_to IN ('human_food','pet_food','both')),
  source TEXT NOT NULL DEFAULT 'curated',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_nutrient_knowledge_applies_to ON nutrient_knowledge(applies_to);

-- Same alias-lookup pattern as ingredient_aliases: each nutrient's own
-- normalized_name is also inserted here, pointing to itself.
CREATE TABLE nutrient_aliases (
  alias TEXT PRIMARY KEY,
  normalized_name TEXT NOT NULL REFERENCES nutrient_knowledge(normalized_name) ON DELETE CASCADE
);

CREATE INDEX idx_nutrient_aliases_target ON nutrient_aliases(normalized_name);

INSERT INTO nutrient_knowledge (normalized_name, display_name, short_description, guidance, evidence_level, applies_to) VALUES ('sugar', 'Ζάχαρη / Σάκχαρα', 'Απλοί υδατάνθρακες που προσδίδουν γλυκιά γεύση.', '["Οι διατροφικές οδηγίες της ΕΕ προτείνουν περιορισμό των ελεύθερων σακχάρων στη διατροφή", "Πάνω από 22.5g ανά 100g θεωρείται συνήθως υψηλή περιεκτικότητα (κατηγοριοποίηση UK FSA)"]', 'high', 'human_food');
INSERT INTO nutrient_knowledge (normalized_name, display_name, short_description, guidance, evidence_level, applies_to) VALUES ('saturated_fat', 'Κορεσμένα λιπαρά', 'Λιπαρά που σε υψηλή πρόσληψη συνδέονται με αυξημένη χοληστερόλη.', '["Πάνω από 5g ανά 100g θεωρείται συνήθως υψηλή περιεκτικότητα (κατηγοριοποίηση UK FSA)"]', 'high', 'human_food');
INSERT INTO nutrient_knowledge (normalized_name, display_name, short_description, guidance, evidence_level, applies_to) VALUES ('sodium', 'Νάτριο / Αλάτι', 'Απαραίτητο μέταλλο σε μικρές ποσότητες· η υπερβολική πρόσληψη συνδέεται με αυξημένη αρτηριακή πίεση.', '["Πάνω από 1.5g αλατιού (περίπου 0.6g νατρίου) ανά 100g θεωρείται συνήθως υψηλή περιεκτικότητα (κατηγοριοποίηση UK FSA)"]', 'high', 'human_food');
INSERT INTO nutrient_knowledge (normalized_name, display_name, short_description, guidance, evidence_level, applies_to) VALUES ('trans_fat', 'Τρανς λιπαρά', 'Βιομηχανικά υδρογονωμένα λιπαρά.', '["Οι περισσότερες διατροφικές αρχές συστήνουν ελαχιστοποίηση της πρόσληψης τρανς λιπαρών"]', 'high', 'human_food');
INSERT INTO nutrient_knowledge (normalized_name, display_name, short_description, guidance, evidence_level, applies_to) VALUES ('fiber', 'Φυτικές ίνες', 'Μη εύπεπτος υδατάνθρακας που συμβάλλει στην πεπτική λειτουργία.', '["Υψηλότερη περιεκτικότητα θεωρείται γενικά θετικό χαρακτηριστικό στη διατροφή"]', 'high', 'human_food');
INSERT INTO nutrient_knowledge (normalized_name, display_name, short_description, guidance, evidence_level, applies_to) VALUES ('protein', 'Πρωτεΐνη', 'Βασικό μακροθρεπτικό συστατικό για την ανάπτυξη και επιδιόρθωση ιστών.', '[]', 'high', 'both');

INSERT INTO nutrient_aliases (alias, normalized_name) VALUES ('sugar', 'sugar');
INSERT INTO nutrient_aliases (alias, normalized_name) VALUES ('sugars', 'sugar');
INSERT INTO nutrient_aliases (alias, normalized_name) VALUES ('sugars total', 'sugar');
INSERT INTO nutrient_aliases (alias, normalized_name) VALUES ('total sugars', 'sugar');
INSERT INTO nutrient_aliases (alias, normalized_name) VALUES ('ζαχαρα', 'sugar');
INSERT INTO nutrient_aliases (alias, normalized_name) VALUES ('ζάχαρη', 'sugar');
INSERT INTO nutrient_aliases (alias, normalized_name) VALUES ('σακχαρα', 'sugar');
INSERT INTO nutrient_aliases (alias, normalized_name) VALUES ('σάκχαρα', 'sugar');
INSERT INTO nutrient_aliases (alias, normalized_name) VALUES ('saturated_fat', 'saturated_fat');
INSERT INTO nutrient_aliases (alias, normalized_name) VALUES ('saturated fat', 'saturated_fat');
INSERT INTO nutrient_aliases (alias, normalized_name) VALUES ('saturated fatty acids', 'saturated_fat');
INSERT INTO nutrient_aliases (alias, normalized_name) VALUES ('κορεσμενα λιπαρα', 'saturated_fat');
INSERT INTO nutrient_aliases (alias, normalized_name) VALUES ('κορεσμένα λιπαρά', 'saturated_fat');
INSERT INTO nutrient_aliases (alias, normalized_name) VALUES ('sodium', 'sodium');
INSERT INTO nutrient_aliases (alias, normalized_name) VALUES ('salt', 'sodium');
INSERT INTO nutrient_aliases (alias, normalized_name) VALUES ('αλατι', 'sodium');
INSERT INTO nutrient_aliases (alias, normalized_name) VALUES ('αλάτι', 'sodium');
INSERT INTO nutrient_aliases (alias, normalized_name) VALUES ('natrio', 'sodium');
INSERT INTO nutrient_aliases (alias, normalized_name) VALUES ('νάτριο', 'sodium');
INSERT INTO nutrient_aliases (alias, normalized_name) VALUES ('trans_fat', 'trans_fat');
INSERT INTO nutrient_aliases (alias, normalized_name) VALUES ('trans fat', 'trans_fat');
INSERT INTO nutrient_aliases (alias, normalized_name) VALUES ('trans fatty acids', 'trans_fat');
INSERT INTO nutrient_aliases (alias, normalized_name) VALUES ('υδρογονωμενα λιπαρα', 'trans_fat');
INSERT INTO nutrient_aliases (alias, normalized_name) VALUES ('υδρογονωμένα λιπαρά', 'trans_fat');
INSERT INTO nutrient_aliases (alias, normalized_name) VALUES ('fiber', 'fiber');
INSERT INTO nutrient_aliases (alias, normalized_name) VALUES ('fibre', 'fiber');
INSERT INTO nutrient_aliases (alias, normalized_name) VALUES ('dietary fiber', 'fiber');
INSERT INTO nutrient_aliases (alias, normalized_name) VALUES ('dietary fibre', 'fiber');
INSERT INTO nutrient_aliases (alias, normalized_name) VALUES ('φυτικες ινες', 'fiber');
INSERT INTO nutrient_aliases (alias, normalized_name) VALUES ('φυτικές ίνες', 'fiber');
INSERT INTO nutrient_aliases (alias, normalized_name) VALUES ('protein', 'protein');
INSERT INTO nutrient_aliases (alias, normalized_name) VALUES ('proteins', 'protein');
INSERT INTO nutrient_aliases (alias, normalized_name) VALUES ('πρωτεϊνη', 'protein');
INSERT INTO nutrient_aliases (alias, normalized_name) VALUES ('πρωτεΐνη', 'protein');
