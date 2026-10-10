/**
 * Food or cosmetic, judged from the ingredient words alone. Shared by the
 * Worker (scoring) and the review screen (whether to ask for a nutrition
 * table at all).
 */
export function detectProductType(
  text: string,
): "food" | "cosmetic" | "unknown" {
  const normalized = text.toLowerCase();

  const foodMarkers = [
    "ξύδι",
    "ξυδι",
    "vinegar",
    "οίνο",
    "οινο",
    "wine",
    "αλεύρι",
    "αλευρι",
    "flour",
    "ζάχαρη",
    "ζαχαρη",
    "sugar",
    "γάλα",
    "γαλα",
    "milk",
    "τυρί",
    "τυρι",
    "cheese",
    "ελαιόλαδο",
    "ελαιολαδο",
    "olive oil",
    "ντομάτα",
    "ντοματα",
    "tomato",
    "κρεμμύδι",
    "κρεμμυδι",
    "onion",
    "σκόρδο",
    "σκορδο",
    "garlic",
    "αλάτι",
    "αλατι",
    "salt",
    "πιπέρι",
    "πιπερι",
    "pepper",
    "κακάο",
    "κακαο",
    "cocoa",
    "σιτάρι",
    "σιταρι",
    "wheat",
    "βούτυρο",
    "βουτυρο",
    "yeast",
    "μαγιά",
    "μαγια",
    "starch",
    "άμυλο",
    "αμυλο",
  ];

  const cosmeticMarkers = [
    "aqua",
    "cetearyl",
    "phenoxyethanol",
    "dimethicone",
    "parfum",
    "sodium laureth",
    "sodium lauryl",
    "panthenol",
    "tocopheryl",
    "butyrospermum",
    "hyaluronic",
    "niacinamide",
    "isohexadecane",
    "cocamidopropyl",
    "benzyl alcohol",
    "linalool",
    "limonene",
    "citronellol",
    "paraffinum",
    "petrolatum",
    "lanolin",
    "zinc oxide",
    "propylene glycol",
    "benzyl benzoate",
    "sorbitan",
    "glyceryl stearate",
    "methylparaben",
    "propylparaben",
    "ceteareth",
    "stearyl alcohol",
    "carbomer",
  ];

  const foodScore = foodMarkers.filter(
    (marker) => normalized.includes(marker),
  ).length;

  const cosmeticScore = cosmeticMarkers.filter(
    (marker) => normalized.includes(marker),
  ).length;

  if (foodScore === 0 && cosmeticScore === 0) {
    return "unknown";
  }

  if (foodScore > cosmeticScore) {
    return "food";
  }

  if (cosmeticScore > foodScore) {
    return "cosmetic";
  }

  return "unknown";
}
