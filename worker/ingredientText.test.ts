import assert from "node:assert/strict";
import test from "node:test";
import {
  cleanIngredientText,
  extractIngredientText,
} from "./ingredientText";
import { NESTLE_CLUSTERS_OCR, OAT_DRINK_OCR } from "./labelFixtures";

// Test 1: Greek heading inline
test("extracts Greek heading with inline ingredients", () => {
  const text =
    "Συστατικά: νερό, ζάχαρη, αλάτι";
  const result = extractIngredientText(text, 0.95);
  assert(result.isValid);
  assert.equal(result.labelType, "ingredients");
  assert(result.ingredientText?.includes("νερό"));
});

// Test 2: English heading and next line
test("extracts English heading with ingredients on next line", () => {
  const text =
    "INGREDIENTS\nWater, sugar, citric acid";
  const result = extractIngredientText(text, 0.95);
  assert(result.isValid);
  assert.equal(result.labelType, "ingredients");
  assert(result.ingredientText?.includes("Water"));
});

// Test 3: INCI cosmetic list
test("extracts INCI cosmetic ingredient list", () => {
  const text =
    "INCI: Aqua, Glycerin, Cetearyl Alcohol, Parfum";
  const result = extractIngredientText(text, 0.95);
  assert(result.isValid);
  assert.equal(result.labelType, "ingredients");
});

// Test 4: Cleaning composition with Greek
test("extracts cleaning product composition", () => {
  const text =
    "Σύνθεση: <5% ανιονικά τασιενεργά, άρωμα, συντηρητικό";
  const result = extractIngredientText(text, 0.95);
  assert(result.isValid);
  assert.equal(result.labelType, "ingredients");
});

// Test 5: Mixed ingredients and nutrition
test("detects mixed section with ingredients and nutrition", () => {
  const text =
    "Συστατικά: νερό, ζάχαρη\nDietary information:\nEnergy: 100 kcal";
  const result = extractIngredientText(text, 0.95);
  assert(result.isValid);
  assert.equal(result.labelType, "mixed");
  assert(result.ingredientText?.includes("νερό"));
  assert(!result.ingredientText?.includes("Energy"));
});

// Test 6: Nutrition table only
test("rejects nutrition-only table", () => {
  const text =
    "Per 100g\nEnergy: 100 kcal\nProtein: 5g\nFat: 3g";
  const result = extractIngredientText(text, 0.95);
  assert(!result.isValid);
  assert.equal(result.labelType, "nutrition");
});

// Test 7: Website text only
test("rejects website/contact information", () => {
  const text = "vikos.com\nwww.example.com\nTel: +30 210 1234567";
  const result = extractIngredientText(text, 0.95);
  assert(!result.isValid);
  assert(
    result.reasons.some((r) =>
      r.includes("θόρυβος"),
    ),
  );
});

// Test 8: Real bad OCR example
test("rejects real OCR failure with noise", () => {
  const text =
    "L17 4.68\n" +
    "Συνιστάται η φυλακη\n" +
    "δροσερό μαζί και από δομές\n" +
    "vikos.com\n" +
    "SUITABLE FOR A LOW SODIUM DIET\n" +
    "ΨΗΣΤΑ ΣΕ ΑΛΑΤΑ";
  const result = extractIngredientText(text, 0.95);
  assert(!result.isValid);
  assert.equal(result.labelType, "unknown");
});

// Test 9: Comma-separated without heading
test("accepts comma-separated list without heading if strong signals", () => {
  const text = "Water, glycerin, alcohol, oil, extract";
  const result = extractIngredientText(text, 0.95);
  assert(result.isValid);
  assert.equal(result.labelType, "ingredients");
});

// Test 10: Single word "SODIUM"
test("rejects single word 'sodium'", () => {
  const text = "SODIUM";
  const result = extractIngredientText(text, 0.95);
  assert(!result.isValid);
});

// Test 11: Claim text
test("rejects marketing claim text", () => {
  const text =
    "SUITABLE FOR A LOW SODIUM DIET\nWITH A LOW CONTENT IN MINERALS";
  const result = extractIngredientText(text, 0.95);
  assert(!result.isValid);
  assert(
    result.reasons.some((r) =>
      r.includes("marketing"),
    ),
  );
});

// Test 12: Storage instructions
test("rejects storage-only text", () => {
  const text =
    "Keep in cool place\nAway from heat and moisture\nStore at room temperature";
  const result = extractIngredientText(text, 0.95);
  assert(!result.isValid);
});

// Test 13: Empty text
test("rejects empty text", () => {
  const text = "";
  const result = extractIngredientText(text, 0.95);
  assert(!result.isValid);
});

// Test 14: Heading only
test("rejects heading-only text", () => {
  const text = "Συστατικά";
  const result = extractIngredientText(text, 0.95);
  assert(!result.isValid);
});

// Test 15: Mojibake and garbled OCR
test("rejects garbled/mojibake text without ingredient markers", () => {
  const text =
    "BAene oruAn. Organ PES\nKaraMnAn via no buo\nKATA AHA MEXA TE";
  const result = extractIngredientText(text, 0.95);
  assert(!result.isValid);
});

// Test 16: Heading with clear stop at nutrition section
test("stops at nutrition section boundary", () => {
  const text =
    "Ingredients: Water, Sugar, Salt\n\nNutrition Facts\nEnergy: 100 kcal";
  const result = extractIngredientText(text, 0.95);
  assert(result.isValid);
  assert(result.ingredientText?.includes("Water"));
  assert(!result.ingredientText?.includes("Energy"));
});

// Test 17: No accents but Greek still works
test("works with Greek text without accents", () => {
  const text = "Συστατικα: νερο, ζαχαρη, αλατι";
  const result = extractIngredientText(text, 0.95);
  assert(result.isValid);
  assert.equal(result.labelType, "ingredients");
});

// Test 18: Multiline list without heading
test("accepts well-structured multiline list without heading", () => {
  const text = "Water\nGlycerin\nAlcohol\nOil\nExtract";
  const result = extractIngredientText(text, 0.95);
  assert(result.isValid);
  assert.equal(result.labelType, "ingredients");
});

// Test 19: Confidence adjustment with heading
test("uses proper confidence with heading", () => {
  const text = "Συστατικά: νερό, ζάχαρη";
  const result = extractIngredientText(text, 1.0);
  assert(result.isValid);
  assert(result.confidence <= 0.95);
  assert(result.confidence >= 0.9);
});

// Test 20: Confidence adjustment without heading
test("uses lower confidence without heading", () => {
  const text = "Water, glycerin, alcohol, oil, extract";
  const result = extractIngredientText(text, 1.0);
  assert(result.isValid);
  assert(result.confidence <= 0.85);
  assert(result.confidence >= 0.7);
});

// Test 21: Very short heading match but enough content
test("accepts content after heading even if heading is short", () => {
  const text =
    "INCI: Aqua, Glycerin, Alcohol, Cetearyl, Parfum";
  const result = extractIngredientText(text, 0.95);
  assert(result.isValid);
});

// Test 22: Mixed Greek and English
test("handles mixed Greek and English text", () => {
  const text =
    "Συστατικά / Ingredients: νερό / Water, ζάχαρη / Sugar";
  const result = extractIngredientText(text, 0.95);
  assert(result.isValid);
});

// Test 23: URL with valid ingredients after
test("accepts valid ingredients even if URL is present, if ingredients dominate", () => {
  const text =
    "Ingredients: Water, Sugar, Salt, Oil\nMore info: www.example.com";
  const result = extractIngredientText(text, 0.95);
  assert(result.isValid);
  assert(
    !result.ingredientText?.includes("example.com"),
  );
});

// Test 24: Greek label with nutrition table after ingredients
test("keeps Greek ingredients block before nutrition facts", () => {
  const text =
    "Συστατικά: νερό, ζάχαρη, αλάτι, ελαιόλαδο, εκχύλισμα βανίλιας\n\nΠληροφορίες διατροφής\nΕνέργεια: 420 kcal\nΠρωτεΐνες: 4g";
  const result = extractIngredientText(text, 0.95);
  assert(result.isValid);
  assert(result.ingredientText?.includes("νερό"));
  assert(!result.ingredientText?.includes("Ενέργεια"));
});

// Test 25: English and German multilingual heading recognition
test("recognizes multilingual ingredient headings", () => {
  const text = "Zutaten: Wasser, Zucker, Salz, Aromen\n\nNutrition Facts\nEnergy 100 kcal";
  const result = extractIngredientText(text, 0.95);
  assert(result.isValid);
  assert(result.ingredientText?.includes("Wasser"));
  assert(!result.ingredientText?.includes("Energy"));
});

// Test 26: Bilingual ingredients label with nested parentheses
test("handles bilingual labels and nested ingredients with parentheses", () => {
  const text =
    "Ingredients / Συστατικά: σοκολάτα (ζάχαρη, κακάο, βούτυρο κακάο), αρωματικές ύλες, γαλάκτωμα, συντηρητικό\n\nStorage: keep in cool place";
  const result = extractIngredientText(text, 0.95);
  assert(result.isValid);
  assert(result.ingredientText?.includes("σοκολάτα"));
  assert(result.ingredientText?.includes("βούτυρο κακάο"));
  assert(!result.ingredientText?.includes("Storage"));
});

// Test 27: Multiline OCR without heading
test("extracts multiline OCR ingredient list without explicit heading", () => {
  const text =
    "Water\nGlycerin\nCetearyl Alcohol\nParfum\nCitric Acid\nSodium Citrate\n\nManufacturer: Acme Ltd";
  const result = extractIngredientText(text, 0.95);
  assert(result.isValid);
  assert(result.ingredientText?.includes("Water"));
  assert(!result.ingredientText?.includes("Manufacturer"));
});

// Test 28: URL and storage instructions after ingredients should be removed
test("strips URLs and storage instructions after the ingredient block", () => {
  const text =
    "Ingredients: Water, Glycerin, Sodium Hydroxide, Parfum\nWebsite: www.example.com\nStorage: Keep in a cool place";
  const result = extractIngredientText(text, 0.95);
  assert(result.isValid);
  assert(result.ingredientText?.includes("Water"));
  assert(!result.ingredientText?.includes("www.example.com"));
  assert(!result.ingredientText?.includes("Storage"));
});

// Regression (EUBOS Med hand cream): a footer disclaimer mentioning the
// word "ingredients" in ordinary prose ("Full ingredients list available
// at ...") appeared, in OCR reading order, *before* the real
// "Ingredients:" panel. findHeadingMatch used to return only the first
// textual occurrence of any heading term, so extraction anchored on the
// disclaimer instead of the real heading; the very next SECTION_BOUNDARY
// term ("Barcode:") then cut the block down to a single boilerplate line
// ("Made in Germany") *before ever reaching the real ingredient list*,
// which was silently dropped in its entirety. Fixed by trying every
// heading occurrence in text order and skipping any whose extracted block
// doesn't look like a real ingredient list (looksLikeRealIngredientBlock).
test("regression: a footer disclaimer mentioning 'ingredients' before the real heading does not shadow the real ingredient list", () => {
  const realIngredients =
    "Aqua, Glycerin, Cetearyl Alcohol, Cetearyl Ethylhexanoate, " +
    "Isohexadecane, Alcohol, Sorbitol, Butyrospermum Parkii (Shea) Butter, " +
    "Dimethicone, Sodium Cetearyl Sulfate, Phenoxyethanol, Rosa Centifolia " +
    "Flower Extract, Citric Acid, Panthenol, Tocopheryl Acetate, Allantoin, " +
    "Benzyl Alcohol, Sodium Hydroxide, Sodium Lactate, Serine, Lactic Acid, " +
    "Urea, Glycine, Linalool, Hexyl Cinnamal, Citronellol, " +
    "Alpha-Isomethyl Ionone, Parfum";

  const text = [
    "EUBOS",
    "150 ml e",
    "9M",
    "Registered trademark",
    "Full ingredients list available at www.eubos.de",
    "Made in Germany",
    "Barcode: 4005232107012",
    "Ingredients: " + realIngredients,
    "EUROS MED. In hogy",
  ].join("\n");

  const result = extractIngredientText(text, 0.9);

  assert.equal(result.isValid, true);
  assert.equal(result.labelType, "ingredients");
  // The real list must be present in full, not the boilerplate fragment
  // the wrong anchor used to produce.
  assert.ok(result.ingredientText?.includes("Aqua"));
  assert.ok(result.ingredientText?.includes("Parfum"));
  assert.ok(result.ingredientText?.includes("Alpha-Isomethyl Ionone"));
  assert.ok(!result.ingredientText?.includes("Made in Germany"));
  assert.ok(!result.ingredientText?.includes("Barcode"));
});

// Same defect, minimal shape: two occurrences of a heading word, the first
// in incidental prose with nothing real after it, the second the genuine
// heading.
test("regression: skips a heading occurrence whose block is too short/boilerplate-only and uses the next one", () => {
  const text =
    "See ingredients at example.com\n" +
    "Barcode: 1234567890123\n" +
    "Ingredients: Water, Glycerin, Citric Acid, Sodium Chloride";

  const result = extractIngredientText(text, 0.9);

  assert.equal(result.isValid, true);
  assert.ok(result.ingredientText?.includes("Water"));
  assert.ok(result.ingredientText?.includes("Sodium Chloride"));
});

// Regression: cosmetic label photographed with the "Ingredients:" heading
// cropped off. The manufacturer footer under the list (GmbH, website,
// "Made in Germany") used to push the whole block over the noise threshold
// and discard the real ingredients above it.
test("keeps a headingless INCI list that is followed by a manufacturer footer", () => {
  const text =
    "Aqua, Glycerin, Cetearyl Alcohol, Paraffinum Liquidum,\n" +
    "Linalool, Hexyl Cinnamal, Citronellol,\n" +
    "Alpha-Isomethyl Ionone, Parfum (Fragrance)\n" +
    "O/W Emulsion\n" +
    "Dr. Hobein (Nachf.) GmbH,\n" +
    "med. Hautpflege\n" +
    "D-53340 Meckenheim\n" +
    "www.eubos.de\n" +
    "Made in Germany\n" +
    "150 ml ℮";
  const result = extractIngredientText(text, 0.9);
  assert(result.isValid);
  assert.equal(result.labelType, "ingredients");
  assert(result.ingredientText?.includes("Parfum"));
  assert(!result.ingredientText?.includes("Hobein"));
  assert(!result.ingredientText?.includes("Germany"));
});

// Regression (Τραγανές Μπουκιές cereal, 5201024865216): the exact bilingual
// label. Two independent false rejections stacked on it:
//  - the EU-mandated ingredient percentages ("46,6%", "12%", "5,7%"...) were
//    counted as nutrition-table measurements, and together with "salt" made
//    the list look like a nutrition table;
//  - "natural flavouring" plus the allergen statement "May contain ...
//    cereals containing gluten" counted as two marketing-claim words.
const CEREAL_LABEL =
  "Συστατικά: Νιφάδες βρώμης ολικής άλεσης (46,6%),\n" +
  "ηλιέλαιο (12%), ζάχαρη, σιρόπι γλυκόζης, καλαμπόκι (5,7%),\n" +
  "ρυζάλευρο (4,9%), ολιγοφρουκτόζη, σιτάλευρο ολικής\n" +
  "άλεσης (4,4%), μέλι (0,5%), μελάσα, αλάτι, φυσική\n" +
  "αρωματική ύλη, βύνη (από κριθάρι), αντιοξειδωτικά\n" +
  "(τοκοφερόλες). Πιθανόν να περιέχει διάφορα είδη ξηρών\n" +
  "καρπών, σόγια και άλλα δημητριακά τα οποία περιέχουν\n" +
  "γλουτένη.\n" +
  "Crunchy cereal clusters of oats,\n" +
  "cornflakes and rice.\n" +
  "Ingredients: Wholegrain rolled oats (46,6%), sunflower oil\n" +
  "(12%), sugar, glucose syrup, maize (5,7%), rice flour (4,9%),\n" +
  "oligofructose, wholegrain wheat flour (4,4%), honey,\n" +
  "(0,5%), molasses, salt, natural flavouring, malt (barley),\n" +
  "antioxidants (tocopherols). May contain several kinds of\n" +
  "nuts, soya and the other cereals containing gluten.";

test("regression: a bilingual cereal ingredient list with percentages and an allergen statement is accepted", () => {
  const result = extractIngredientText(CEREAL_LABEL, 0.9);
  assert(result.isValid, result.reasons.join("; "));
  assert.equal(result.labelType, "ingredients");
  assert(result.ingredientText?.includes("βρώμης"));
});

test("regression: the English half of the cereal label alone is accepted", () => {
  const english = CEREAL_LABEL.slice(CEREAL_LABEL.indexOf("Ingredients:"));
  const result = extractIngredientText(english, 0.9);
  assert(result.isValid, result.reasons.join("; "));
  assert.equal(result.labelType, "ingredients");
});

test("a nutrition table with %RI columns is still rejected as nutrition", () => {
  const text =
    "Nutrition declaration per 100g\nEnergy 1650 kJ / 392 kcal 20%\nFat 12 g 17%\nSaturates 1.5 g 8%\nCarbohydrate 60 g 23%\nSugars 18 g 20%\nProtein 8 g 16%\nSalt 0.4 g 7%";
  const result = extractIngredientText(text, 0.9);
  assert(!result.isValid);
  assert.equal(result.labelType, "nutrition");
});

test("a real marketing claim is still rejected after allergen wording is ignored", () => {
  const result = extractIngredientText(
    "100% natural, gluten free, organic snack. May contain nuts.",
    0.9,
  );
  assert(!result.isValid);
});

// Regression (Nestlé Clusters, 7613287308870): the exact Azure OCR output.
// A Greek ingredient list printed directly above a nutrition table. Azure
// reads the table column by column, so its heading comes out as separate
// lines ("ΔΙΑΤΡΟΦΙΚΕΣ" / "Ανά" / "Ανά" / "125ml" / "ΠΛΗΡΟΦΟΡΙΕΣ") and the
// two-word boundary "διατροφικές πληροφορίες" never occurs. The block ran on
// through the whole table and was rejected as a nutrition table — even
// though a human reading the photo sees an ordinary ingredient list.

test("regression: an ingredient list above a column-split nutrition table is isolated and accepted", () => {
  const result = extractIngredientText(NESTLE_CLUSTERS_OCR, 0.96);
  assert(result.isValid, result.reasons.join("; "));
  assert.notEqual(result.labelType, "nutrition");
  assert(result.ingredientText?.includes("Σιτάρι ολικής άλεσης"));
  assert(result.ingredientText?.includes("Βιταμίνη Β3, Β5, Β9, Β6, Β2"));
  assert(!result.ingredientText?.includes("1652kJ"));
  assert(!result.ingredientText?.includes("Ριβοφλαβίνη"));
});

test("an ingredient that merely mentions dietary fibre does not end the list", () => {
  const result = extractIngredientText(
    "Συστατικά: Βρώμη, Διατροφικές ίνες (ινουλίνη), Ζάχαρη, Αλάτι, Μέλι",
    0.9,
  );
  assert(result.isValid, result.reasons.join("; "));
  assert(result.ingredientText?.includes("Μέλι"));
});

// The stored/scored ingredient text ("Κείμενο συστατικών" in the PIM) must
// read as an ingredient list. For the Nestlé label the raw block carried
// OCR line breaks, a hyphen-wrapped word, the allergen and wholegrain
// sentences and two leftovers of the table header ("%", "Ανά 30g+").
test("cleanIngredientText turns the Nestlé OCR block into the plain ingredient list", () => {
  const isolated = extractIngredientText(NESTLE_CLUSTERS_OCR, 0.96).ingredientText ?? "";

  assert.equal(
    cleanIngredientText(isolated),
    "Σιτάρι ολικής άλεσης 63,3%, Ζάχαρη, Αμύγδαλα 9,2%, Αλεύρι σιταριού 5,3%, Σιρόπι γλυκόζης, Νιφάδες σιταριού 1,8%, Εκχύλισμα βύνης κριθαριού (κριθάρι, βύνη κριθαριού), Ιμβερτοποιημένο σιρόπι ζάχαρης, Νιφάδες βρώμης 1,4%, Ανθρακικό ασβέστιο, Φοινικέλαιο, Αλάτι, Μέλι 0,3%, Αλεύρι ρυζιού 0,3%, Μελάσα, Φυσική αρωματική ύλη, Ρυθμιστής οξύτητας (φωσφορικά άλατα νατρίου), Σίδηρος, Βιταμίνη Β3, Β5, Β9, Β6, Β2.",
  );
});

test("cleanIngredientText drops a bilingual heading and rejoins an upper-case hyphen wrap", () => {
  assert.equal(
    cleanIngredientText(
      "Συστατικά/Ingredients: AQUA, SODIUM CHLORIDE, TE-\nTRAMETHYL ACETYLOCTAHYDRONAPHTHALENES, PARFUM",
    ),
    "AQUA, SODIUM CHLORIDE, TETRAMETHYL ACETYLOCTAHYDRONAPHTHALENES, PARFUM",
  );
});

test("cleanIngredientText does not cut the list at an abbreviation full stop", () => {
  assert.equal(
    cleanIngredientText(
      "Alcohol Denat. (Αιθυλική Αλκοόλη) 70% vol, Aqua,\nGlycerin, Parfum. May contain traces of nuts.",
    ),
    "Alcohol Denat. (Αιθυλική Αλκοόλη) 70% vol, Aqua, Glycerin, Parfum.",
  );
});

test("cleanIngredientText never empties its input", () => {
  assert.equal(cleanIngredientText("  %\n"), "%");
  assert.equal(cleanIngredientText(""), "");
});

// An E-number has at most one letter in a row, which is how a final
// ingredient line such as "..., e250." used to be mistaken for a leftover
// table cell and dropped. That costs a real deduction now that the cleaned
// text is the text the score is computed from.
test("cleanIngredientText keeps a final ingredient named as an E-number", () => {
  assert.equal(
    cleanIngredientText("Συστατικά: Χοιρινό κρέας, αλάτι,\ne250."),
    "Χοιρινό κρέας, αλάτι, e250.",
  );

  assert.equal(
    cleanIngredientText("Νερό, ζάχαρη,\nε150d\n%\nΑνά 30g+"),
    "Νερό, ζάχαρη, ε150d",
  );
});

// ...while the cells that really are table leftovers still go.
test("cleanIngredientText still drops a stray table cell under the list", () => {
  assert.equal(
    cleanIngredientText("Νερό, ζάχαρη, αλάτι\n100g\nper 100 g"),
    "Νερό, ζάχαρη, αλάτι",
  );
});

// Barcode 5430003127100. The photo carries a complete, ordinary ingredient
// list, and the app answered "Δεν εντοπίστηκε λίστα συστατικών σε αυτή τη
// φωτογραφία". Two filters meant to reject a shot of the WRONG panel — one
// for marketing claims, one for storage advice — were run against a block
// that held the list AND everything printed beside it. "gluten" plus
// "free" alone met the claim threshold, so the list went out with them.
test("regression: a list printed beside a gluten-free claim is still a list", () => {
  const result = extractIngredientText(OAT_DRINK_OCR, 0.9);

  assert(result.isValid, result.reasons.join("; "));
  assert.equal(result.labelType, "ingredients");
  assert(result.ingredientText?.includes("rapeseed oil"));
  assert(result.ingredientText?.includes("gellan gum"));
});

// ...and it must not matter whether the label bothered to print a heading:
// the two paths used to carry separate copies of the same filters.
test("the same list scores the same with or without an Ingredients heading", () => {
  const withoutHeading = extractIngredientText(OAT_DRINK_OCR, 0.9);

  const withHeading = extractIngredientText(
    OAT_DRINK_OCR.replace("Water, gluten-free", "Ingredients: Water, gluten-free"),
    0.9,
  );

  assert(withHeading.isValid, withHeading.reasons.join("; "));
  assert.equal(
    cleanIngredientText(withoutHeading.ingredientText ?? ""),
    cleanIngredientText(withHeading.ingredientText ?? ""),
  );
});

// The product description runs into the list on a headingless carton, and
// "with added calcium." matched on the word calcium alone — dragging a
// sentence fragment into the stored list and shifting every ingredient one
// position, which is what the rule table weights penalties by.
test("the list starts at the list, not at the sentence that mentions an ingredient", () => {
  const text = extractIngredientText(OAT_DRINK_OCR, 0.9).ingredientText ?? "";

  assert(text.startsWith("Water,"), text.slice(0, 40));
  assert(!text.includes("with added calcium"));
});

// A photo of nothing but claims, or nothing but storage advice, is still
// rejected — that is what those two filters are for.
test("a panel with no list is still rejected", () => {
  const claimsOnly = extractIngredientText(
    "Gluten-free. Suitable for vegans. Organic and all natural.",
    0.9,
  );

  assert.equal(claimsOnly.isValid, false);

  const storageOnly = extractIngredientText(
    "Store in a cool, dry place away from direct sunlight and moisture.",
    0.9,
  );

  assert.equal(storageOnly.isValid, false);
});
