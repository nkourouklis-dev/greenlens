/**
 * EU allergen layer — informational, never punitive.
 *
 * The 14 allergen groups that EU regulation 1169/2011 requires a label to
 * declare (gluten, milk, egg, sulphites, nuts, sesame, soy, ...) are exactly
 * the ones a normal food already prints in bold. Their presence is a fact
 * about who can eat the product, not a defect of the product, so this module
 * exists to:
 *
 *   1. recognise a finding whose *only* stated concern is "this is a known
 *      allergen", and
 *   2. turn the whole set of them into one notice line instead of N
 *      near-identical "Προσοχή -4" cards.
 *
 * Two safety rails keep this from silently excusing real problems:
 *   - only an ingredient matching one of the 14 official groups can ever be
 *     neutralised, so parabens, sulfates, azo colourants, sweeteners and the
 *     rest are structurally out of reach;
 *   - a finding that states any *additional* concern (carcinogenicity,
 *     toxicity, undeclared quantity, artificial additive, excess) keeps its
 *     severity and therefore its deduction.
 */

export type AllergenKey =
  | "gluten"
  | "crustaceans"
  | "eggs"
  | "fish"
  | "peanuts"
  | "soybeans"
  | "milk"
  | "nuts"
  | "celery"
  | "mustard"
  | "sesame"
  | "sulphites"
  | "lupin"
  | "molluscs";

export interface AllergenGroup {
  key: AllergenKey;
  label: string;
  patterns: string[];
  /** Look-alikes that must never count as this allergen. */
  exclusions?: string[];
}

/**
 * Patterns are matched at word start against accent-stripped lowercase text,
 * so a stem like "σιταρ" covers σιτάρι/σιταριού without matching mid-word
 * noise.
 */
const ALLERGEN_GROUPS: AllergenGroup[] = [
  {
    key: "gluten",
    label: "Γλουτένη (σιτηρά)",
    patterns: [
      "γλουτεν",
      "σιταρ",
      "σιτου",
      "σιτος",
      "σταρι",
      "σιτηρ",
      "δημητριακ",
      "αλευρ",
      "σιμιγδαλ",
      "κριθαρ",
      "σικαλ",
      "βρωμη",
      "βυνη",
      "gluten",
      "wheat",
      "barley",
      "rye",
      "oat",
      "spelt",
      "semolina",
      "durum",
      "triticum",
      "flour",
      "malt",
    ],
    // Naturally gluten-free flours share the αλεύρι/flour stem.
    exclusions: [
      "αλευρι ρυζιου",
      "αλευρι καλαμποκιου",
      "rice flour",
      "corn flour",
      "almond flour",
    ],
  },
  {
    key: "milk",
    label: "Γαλακτοκομικά",
    patterns: [
      "γαλα",
      "γαλακτ",
      "λακτοζ",
      "τυρι",
      "γιαουρτ",
      "καζειν",
      "καζεϊν",
      "milk",
      "lactose",
      "whey",
      "casein",
      "cheese",
      "yogurt",
      "yoghurt",
    ],
    // Emulsifiers and lactic acid share the γάλα/lact- stem without being milk.
    exclusions: [
      "γαλακτωματοποι",
      "γαλακτικ",
      "emulsifier",
      "lactic",
      "lactobacill",
    ],
  },
  {
    key: "eggs",
    label: "Αυγό",
    patterns: ["αυγ", "egg", "ovalbumin", "albumen"],
  },
  {
    key: "sulphites",
    label: "Θειώδη",
    patterns: [
      "θειωδ",
      "μεταδιθειωδ",
      "διοξειδιο του θειου",
      "sulphite",
      "sulfite",
      "metabisulphite",
      "metabisulfite",
      "sulphur dioxide",
      "sulfur dioxide",
      "e220",
      "e221",
      "e222",
      "e223",
      "e224",
      "e226",
      "e227",
      "e228",
    ],
  },
  {
    key: "nuts",
    label: "Ξηροί καρποί",
    patterns: [
      "αμυγδαλ",
      "φουντουκ",
      "καρυδι",
      "καρυδα",
      "καρυδο",
      "κασιου",
      "πεκαν",
      "μακανταμ",
      "ξηροι καρποι",
      "ξηρους καρπους",
      "ξηρων καρπων",
      "φιστικι αιγινης",
      "almond",
      "hazelnut",
      "walnut",
      "cashew",
      "pecan",
      "macadamia",
      "pistachio",
      "brazil nut",
      "tree nut",
    ],
  },
  {
    key: "peanuts",
    label: "Αράπικο φιστίκι",
    patterns: [
      "αραπικ",
      "αραχιδ",
      "φυστικοβουτυρ",
      "peanut",
      "arachis",
      "groundnut",
    ],
  },
  {
    key: "sesame",
    label: "Σουσάμι",
    patterns: ["σουσαμ", "ταχιν", "sesame", "tahini", "sesamum"],
  },
  {
    key: "soybeans",
    label: "Σόγια",
    patterns: ["σογια", "τοφου", "soy", "soja", "tofu", "edamame"],
  },
  {
    key: "celery",
    label: "Σέλινο",
    patterns: ["σελιν", "celery", "celeriac", "apium"],
  },
  {
    key: "mustard",
    label: "Μουστάρδα",
    patterns: ["μουσταρδ", "mustard", "sinapis"],
  },
  {
    key: "lupin",
    label: "Λούπινο",
    patterns: ["λουπιν", "lupin", "lupine"],
  },
  {
    key: "fish",
    label: "Ψάρι",
    patterns: [
      "ψαρι",
      "ιχθυ",
      "τονο",
      "σολομ",
      "γαυρ",
      "μπακαλιαρ",
      "fish",
      "tuna",
      "salmon",
      "anchov",
    ],
  },
  {
    key: "crustaceans",
    label: "Καρκινοειδή",
    patterns: [
      "γαριδ",
      "καβουρ",
      "αστακ",
      "καρκινοειδ",
      "shrimp",
      "prawn",
      "crab",
      "lobster",
      "crustace",
    ],
  },
  {
    key: "molluscs",
    label: "Μαλάκια",
    patterns: [
      "μυδι",
      "καλαμαρ",
      "χταποδ",
      "στρειδ",
      "σαλιγκαρ",
      "μαλακι",
      "mollusc",
      "mussel",
      "squid",
      "octopus",
      "oyster",
      "snail",
    ],
  },
];

/** Wording that means "allergy/intolerance", the only concern this layer neutralises. */
const ALLERGY_KEYWORDS = [
  "αλλεργ",
  "δυσανεξ",
  "ευαισθησ",
  "ευαισθητ",
  "κοιλιοκακ",
  "γλουτεν",
  "λακτοζ",
  "allerg",
  "intoler",
  "celiac",
  "coeliac",
  "sensitiv",
  "lactose",
];

/**
 * Wording that means the finding is about something *beyond* being a known
 * allergen. Any hit keeps the finding's original severity and deduction.
 */
const REAL_CONCERN_KEYWORDS = [
  "καρκιν",
  "τοξικ",
  "υπερβολικ",
  "υπερβολη",
  "μη δηλωμ",
  "αδηλωτ",
  "αδιευκρινιστ",
  "απαγορευ",
  "νοθε",
  "ορμον",
  "ενδοκριν",
  "παραβεν",
  "τεχνητ",
  "συνθετικ",
  "χρωστικ",
  "γλυκαντικ",
  "ενισχυτικο γευσ",
  "υδρογονωμ",
  "trans",
  "carcinog",
  "toxic",
  "excessive",
  "undeclared",
  "banned",
  "paraben",
  "artificial",
  "synthetic",
  "colorant",
  "sweetener",
  "hydrogenated",
];

export interface AllergenNotice {
  /**
   * One of the 14 food groups for a matched entry, or the accent-stripped
   * name itself for an AI-declared allergen this registry doesn't
   * recognise (e.g. a cosmetic fragrance allergen like Limonene) — kept so
   * that information is never silently dropped, only ever relocated into
   * this one notice.
   */
  keys: string[];
  labels: string[];
  headline: string;
  note: string;
}

export interface AllergenFindingLike {
  normalizedName: string;
  severity: "positive" | "info" | "attention" | "high_attention" | "unknown";
  title: string;
  explanation: string;
}

const NOTICE_NOTE =
  "Επίσημα αναγνωρισμένα αλλεργιογόνα της ΕΕ που δηλώνονται κανονικά στην ετικέτα. Είναι πληροφορία για όσους έχουν αλλεργία ή δυσανεξία και δεν μειώνουν τη βαθμολογία.";

/** Lowercases and strips accents so Greek and Latin text match the same stems. */
export function normalizeForMatching(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/ς/g, "σ");
}

function containsAtWordStart(haystack: string, needle: string): boolean {
  const index = haystack.indexOf(needle);

  if (index < 0) {
    return false;
  }

  let cursor = index;

  while (cursor >= 0) {
    const before = cursor === 0 ? "" : haystack[cursor - 1];

    if (before === "" || !/[a-z0-9α-ω]/.test(before)) {
      return true;
    }

    cursor = haystack.indexOf(needle, cursor + 1);
  }

  return false;
}

function matchesAny(haystack: string, needles: string[]): boolean {
  return needles.some((needle) => containsAtWordStart(haystack, needle));
}

/**
 * Returns the EU allergen group named by `text`, or null. Matching is on the
 * ingredient/nutrient name — never on the explanation, so an ingredient does
 * not become "an allergen" just because the AI mentioned allergies.
 */
export function matchAllergenGroup(text: string): AllergenGroup | null {
  const normalized = normalizeForMatching(text);

  for (const group of ALLERGEN_GROUPS) {
    if (group.exclusions && matchesAny(normalized, group.exclusions)) {
      continue;
    }

    if (matchesAny(normalized, group.patterns)) {
      return group;
    }
  }

  return null;
}

function statesRealConcern(text: string): boolean {
  return matchesAny(normalizeForMatching(text), REAL_CONCERN_KEYWORDS);
}

function statesAllergyOnly(text: string): boolean {
  return matchesAny(normalizeForMatching(text), ALLERGY_KEYWORDS);
}

/**
 * True when the finding is "Προσοχή, αυτό είναι γάλα/σιτάρι/αυγό" and nothing
 * more: a recognised EU allergen, flagged at plain `attention`, explained
 * purely in allergy terms. `high_attention` is deliberately left alone — the
 * parser only accepts it with real evidence attached.
 */
export function isAllergenDeclarationOnly(
  finding: AllergenFindingLike,
  displayName: string,
): boolean {
  if (finding.severity !== "attention") {
    return false;
  }

  if (matchAllergenGroup(`${displayName} ${finding.normalizedName}`) === null) {
    return false;
  }

  const reason = `${finding.title} ${finding.explanation}`;

  return statesAllergyOnly(reason) && !statesRealConcern(reason);
}

/**
 * Downgrades allergen-declaration findings to `info` (so no path can deduct
 * for them) and collects every recognised allergen into a single notice.
 *
 * Returns new objects; the input array is not mutated.
 */
export function classifyAllergenFindings<F extends AllergenFindingLike>(
  findings: F[],
  displayName: (finding: F) => string,
  extraAllergenNames: string[] = [],
): { findings: F[]; notice: AllergenNotice | null } {
  const groups = new Map<string, string>();

  const classified = findings.map((finding): F => {
    const name = displayName(finding);
    const group = matchAllergenGroup(`${name} ${finding.normalizedName}`);

    if (group) {
      groups.set(group.key, group.label);
    }

    if (!group || !isAllergenDeclarationOnly(finding, name)) {
      return finding;
    }

    // Same finding, three fields rewritten — the cast just tells the
    // compiler the shape survives, since F is only known by its constraint.
    return {
      ...finding,
      severity: "info",
      title: `Δηλωμένο αλλεργιογόνο: ${group.label}`,
      // The unified notice carries the explanation once, so the per-card
      // "Μπορεί να προκαλέσει αλλεργία" boilerplate is dropped here.
      explanation: "",
    } as F;
  });

  addDeclaredAllergens(groups, extraAllergenNames);

  return { findings: classified, notice: buildNotice(groups) };
}

/**
 * Records every name the AI (or the ingredient text itself) already calls
 * an allergen. A name matching one of the 14 EU food groups is folded into
 * that group; anything else — a cosmetic fragrance allergen such as
 * Limonene or Linalool, which EU cosmetics law requires labelling by its
 * own name rather than a group — is kept verbatim under its own key, so
 * declaring it is never silently lost.
 */
function addDeclaredAllergens(
  groups: Map<string, string>,
  names: string[],
): void {
  for (const name of names) {
    const trimmed = name.trim();

    if (!trimmed) {
      continue;
    }

    const group = matchAllergenGroup(trimmed);

    if (group) {
      groups.set(group.key, group.label);
      continue;
    }

    const key = normalizeForMatching(trimmed);

    if (!groups.has(key)) {
      groups.set(key, trimmed);
    }
  }
}

function buildNotice(groups: Map<string, string>): AllergenNotice | null {
  if (groups.size === 0) {
    return null;
  }

  // Stable, registry order for the 14 food groups, then anything else
  // (e.g. named fragrance allergens) in discovery order — so the same
  // product always reads the same way.
  const registryKeys = ALLERGEN_GROUPS.map((group) => group.key as string).filter(
    (key) => groups.has(key),
  );

  const otherKeys = Array.from(groups.keys()).filter(
    (key) => !registryKeys.includes(key),
  );

  const keys = [...registryKeys, ...otherKeys];
  const labels = keys.map((key) => groups.get(key) as string);

  return {
    keys,
    labels,
    headline: `Περιέχει γνωστά αλλεργιογόνα: ${labels.join(", ")}`,
    note: NOTICE_NOTE,
  };
}

/**
 * Builds the notice alone, for callers that only have names to read and
 * nothing to reclassify (legacy records rendered on the client).
 *
 * `candidateNames` is matched group-only (safe for arbitrary ingredient or
 * nutrient names — a name that isn't actually one of the 14 EU groups is
 * structurally guaranteed to be ignored). `declaredNames` additionally
 * accepts the raw-name fallback, so pass only names the AI already flagged
 * as an allergen there (e.g. `potentialAllergens`) — passing arbitrary
 * ingredient names through it would surface "Νερό" as an allergen.
 */
export function buildAllergenNotice(
  candidateNames: string[],
  declaredNames: string[] = [],
): AllergenNotice | null {
  const groups = new Map<string, string>();

  for (const name of candidateNames) {
    const group = matchAllergenGroup(name);

    if (group) {
      groups.set(group.key, group.label);
    }
  }

  addDeclaredAllergens(groups, declaredNames);

  return buildNotice(groups);
}

/**
 * Drops summary bullets that only repeat "contains a known allergen" — the
 * notice already says it once, in one line.
 */
export function withoutAllergenOnlyItems(items: string[]): string[] {
  return items.filter((item) => {
    if (matchAllergenGroup(item) === null) {
      return true;
    }

    return !statesAllergyOnly(item) || statesRealConcern(item);
  });
}
