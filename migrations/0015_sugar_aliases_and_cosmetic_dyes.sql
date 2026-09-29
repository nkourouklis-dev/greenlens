-- Follow-up to 0014. Syrups and cane sugars already scored as added sugar
-- (their label text contains "ζάχαρη"/"sugar"), but the ingredient card had no
-- entry to show for them. And three cosmetic dyes that appear on scanned
-- products. The remaining unmatched names are not ingredients at all (nutrient
-- rows, processing notes like "homogenized") and are deliberately left alone.

INSERT OR IGNORE INTO ingredient_aliases (alias, normalized_name) SELECT 'ιμβερτοποιημένο σιρόπι ζάχαρης', 'sugar' WHERE EXISTS (SELECT 1 FROM ingredient_knowledge WHERE normalized_name = 'sugar');
INSERT OR IGNORE INTO ingredient_aliases (alias, normalized_name) SELECT 'ιωδιωμένη ζάχαρη', 'sugar' WHERE EXISTS (SELECT 1 FROM ingredient_knowledge WHERE normalized_name = 'sugar');
INSERT OR IGNORE INTO ingredient_aliases (alias, normalized_name) SELECT 'iodized sugar', 'sugar' WHERE EXISTS (SELECT 1 FROM ingredient_knowledge WHERE normalized_name = 'sugar');
INSERT OR IGNORE INTO ingredient_aliases (alias, normalized_name) SELECT 'sugar syrup', 'sugar' WHERE EXISTS (SELECT 1 FROM ingredient_knowledge WHERE normalized_name = 'sugar');
INSERT OR IGNORE INTO ingredient_aliases (alias, normalized_name) SELECT 'σιρόπι κρυσταλλωμένης ζάχαρης', 'sugar' WHERE EXISTS (SELECT 1 FROM ingredient_knowledge WHERE normalized_name = 'sugar');
INSERT OR IGNORE INTO ingredient_aliases (alias, normalized_name) SELECT 'raw cane sugar', 'sugar' WHERE EXISTS (SELECT 1 FROM ingredient_knowledge WHERE normalized_name = 'sugar');
INSERT OR IGNORE INTO ingredient_aliases (alias, normalized_name) SELECT 'cane sugar', 'sugar' WHERE EXISTS (SELECT 1 FROM ingredient_knowledge WHERE normalized_name = 'sugar');
INSERT OR IGNORE INTO ingredient_aliases (alias, normalized_name) SELECT 'brown sugar', 'sugar' WHERE EXISTS (SELECT 1 FROM ingredient_knowledge WHERE normalized_name = 'sugar');
INSERT OR IGNORE INTO ingredient_aliases (alias, normalized_name) SELECT 'invert sugar syrup', 'sugar' WHERE EXISTS (SELECT 1 FROM ingredient_knowledge WHERE normalized_name = 'sugar');

INSERT OR IGNORE INTO ingredient_knowledge (normalized_name, category, short_description, benefits, concerns, evidence_level, source) VALUES
  ('ci 15985', 'colorant', 'CI 15985 (Sunset Yellow FCF) — συνθετική πορτοκαλοκίτρινη χρωστική για καλλυντικά.', '[]', '[]', 'medium', 'curated'),
  ('ci 19140', 'colorant', 'CI 19140 (ταρτραζίνη) — συνθετική κίτρινη χρωστική για καλλυντικά.', '[]', '[]', 'medium', 'curated'),
  ('ci 42051', 'colorant', 'CI 42051 (Patent Blue V) — συνθετική μπλε χρωστική για καλλυντικά.', '[]', '[]', 'medium', 'curated');

INSERT OR IGNORE INTO ingredient_aliases (alias, normalized_name) VALUES
  ('ci 15985', 'ci 15985'),
  ('ci 19140', 'ci 19140'),
  ('ci 42051', 'ci 42051');
