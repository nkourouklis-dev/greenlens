-- Verified Greek name for Cetearyl Alcohol (INCI), hand-checked, stored as
-- an alias of the existing curated entry from migration 0001.
--
-- Background: the ingredient card for "Cetearyl" showed "Κετηλάρη" /
-- "Εμμολσιωτικό". Neither came from this table or from the Open Food Facts
-- import (cetearyl alcohol is a cosmetic INCI name, not a food additive, and
-- appears nowhere in OFF's additives taxonomy). Both were the analysis
-- model's own improvised Greek, used as a fallback when "Cetearyl" — split
-- off "Alcohol" by a line break — matched no entry here. See
-- groundIngredientFindings in worker/ingredientInsights.ts.
--
-- There is no separate Greek-name column: aliases are the one place a name
-- resolves to a curated entry, and the card lists them next to the
-- category ("Μαλακτικό · κετεαρυλική αλκοόλη"). Stored lowercased, the
-- form lookupIngredientKnowledgeBatch normalizes lookups to.
INSERT OR IGNORE INTO ingredient_aliases (alias, normalized_name)
VALUES ('κετεαρυλική αλκοόλη', 'cetearyl alcohol');
