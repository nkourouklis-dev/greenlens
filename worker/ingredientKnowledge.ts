/**
 * Ingredient Intelligence Layer — static knowledge registry.
 *
 * This is a curated, deterministic dataset. It never computes a score and
 * never calls the model. Its only job is to give well known ingredients a
 * consistent category, description, benefits/concerns and evidence level so
 * the UI does not depend entirely on whatever wording the AI produced for
 * that particular scan.
 *
 * Ingredients that are not in this registry simply fall back to whatever
 * the AI's per-ingredient finding said (see ingredientInsights.ts). Adding
 * an ingredient here only ever improves explanation quality — it can never
 * change the score, because scoreImpact always comes from the Worker's own
 * `scoreInterpretation` deductions, not from this file.
 */

export type IngredientCategory =
  | "preservative"
  | "fragrance"
  | "colorant"
  | "humectant"
  | "surfactant"
  | "emollient"
  | "antioxidant"
  | "active"
  | "other";

export type EvidenceLevel = "high" | "medium" | "low";

export interface IngredientKnowledgeEntry {
  category: IngredientCategory;
  shortDescription: string;
  benefits: string[];
  concerns: string[];
  aliases: string[];
  evidenceLevel: EvidenceLevel;
}

// Keys are canonical, lowercase, ASCII-normalized ingredient names. This
// mirrors the convention already used by the AI's `normalizedName` field and
// by src/services/ingredientNormalizer.ts on the frontend.
const REGISTRY: Record<string, IngredientKnowledgeEntry> = {
  aqua: {
    category: "other",
    shortDescription: "Νερό, η βάση των περισσότερων προϊόντων.",
    benefits: ["Διαλύτης για τα υπόλοιπα συστατικά"],
    concerns: [],
    aliases: ["water", "eau", "νερο", "νερό"],
    evidenceLevel: "high",
  },
  glycerin: {
    category: "humectant",
    shortDescription: "Ενυδατικό συστατικό φυσικής ή συνθετικής προέλευσης.",
    benefits: ["Συγκρατεί την υγρασία στο δέρμα", "Καλά ανεκτό από τους περισσότερους τύπους δέρματος"],
    concerns: [],
    aliases: ["glycerine", "glycerol", "γλυκερινη", "γλυκερίνη"],
    evidenceLevel: "high",
  },
  parfum: {
    category: "fragrance",
    shortDescription: "Μείγμα αρωματικών ουσιών, η ακριβής σύσταση δεν δηλώνεται.",
    benefits: ["Βελτιώνει την αισθητηριακή εμπειρία του προϊόντος"],
    concerns: ["Συχνή αιτία ερεθισμού ή ευαισθητοποίησης του δέρματος", "Η ακριβής σύνθεση δεν είναι διαφανής στον καταναλωτή"],
    aliases: ["fragrance", "aroma", "αρωμα", "άρωμα", "perfume"],
    evidenceLevel: "high",
  },
  limonene: {
    category: "fragrance",
    shortDescription: "Αρωματική ουσία φυσικής προέλευσης, συνηθισμένη σε εσπεριδοειδή.",
    benefits: ["Προσδίδει φρέσκο, εσπεριδοειδές άρωμα"],
    concerns: ["Αναγνωρισμένο αλλεργιογόνο αρωμάτων στην ΕΕ", "Μπορεί να οξειδωθεί και να γίνει πιο ευαισθητοποιητικό με την έκθεση στον αέρα"],
    aliases: ["d-limonene"],
    evidenceLevel: "high",
  },
  linalool: {
    category: "fragrance",
    shortDescription: "Αρωματική ουσία φυσικής προέλευσης, κοινή σε λεβάντα.",
    benefits: ["Προσδίδει ήπιο, ανθικό άρωμα"],
    concerns: ["Αναγνωρισμένο αλλεργιογόνο αρωμάτων στην ΕΕ", "Μπορεί να προκαλέσει ευαισθητοποίηση όταν οξειδωθεί"],
    aliases: [],
    evidenceLevel: "high",
  },
  coumarin: {
    category: "fragrance",
    shortDescription: "Αρωματική ουσία με χαρακτηριστική μυρωδιά βανίλιας/σανού.",
    benefits: ["Προσδίδει γλυκιά, θερμή νότα στο άρωμα"],
    concerns: ["Αναγνωρισμένο αλλεργιογόνο αρωμάτων στην ΕΕ"],
    aliases: [],
    evidenceLevel: "high",
  },
  citronellol: {
    category: "fragrance",
    shortDescription: "Αρωματική ουσία φυσικής προέλευσης από γεράνι/σιτρονέλα.",
    benefits: ["Προσδίδει ανθικό, εσπεριδοειδές άρωμα"],
    concerns: ["Αναγνωρισμένο αλλεργιογόνο αρωμάτων στην ΕΕ"],
    aliases: [],
    evidenceLevel: "high",
  },
  geraniol: {
    category: "fragrance",
    shortDescription: "Αρωματική ουσία φυσικής προέλευσης, κοινή σε τριαντάφυλλο.",
    benefits: ["Προσδίδει ανθικό άρωμα"],
    concerns: ["Αναγνωρισμένο αλλεργιογόνο αρωμάτων στην ΕΕ"],
    aliases: [],
    evidenceLevel: "high",
  },
  citral: {
    category: "fragrance",
    shortDescription: "Αρωματική ουσία με έντονο άρωμα λεμονιού.",
    benefits: ["Προσδίδει έντονο εσπεριδοειδές άρωμα"],
    concerns: ["Αναγνωρισμένο αλλεργιογόνο αρωμάτων στην ΕΕ"],
    aliases: [],
    evidenceLevel: "high",
  },
  eugenol: {
    category: "fragrance",
    shortDescription: "Αρωματική ουσία με άρωμα γαρίφαλου.",
    benefits: ["Προσδίδει καρυκευμένη, ξυλώδη νότα"],
    concerns: ["Αναγνωρισμένο αλλεργιογόνο αρωμάτων στην ΕΕ"],
    aliases: [],
    evidenceLevel: "high",
  },
  "butylphenyl methylpropional": {
    category: "fragrance",
    shortDescription: "Συνθετική αρωματική ουσία γνωστή και ως Lilial.",
    benefits: ["Προσδίδει άρωμα κυκλαμίνου"],
    concerns: ["Απαγορευμένο συστατικό σε καλλυντικά στην ΕΕ από το 2022 λόγω πιθανής τοξικότητας στην αναπαραγωγή", "Η παρουσία του σε ένα προϊόν χρειάζεται προσοχή"],
    aliases: ["lilial", "butylphenyl methylpropionaldehyde"],
    evidenceLevel: "high",
  },
  "alpha-isomethyl ionone": {
    category: "fragrance",
    shortDescription: "Συνθετική αρωματική ουσία με άρωμα βιολέτας.",
    benefits: ["Προσδίδει ανθική, πούδρινη νότα"],
    concerns: ["Αναγνωρισμένο αλλεργιογόνο αρωμάτων στην ΕΕ"],
    aliases: ["alpha isomethyl ionone"],
    evidenceLevel: "high",
  },
  "benzyl alcohol": {
    category: "preservative",
    shortDescription: "Χρησιμοποιείται ως συντηρητικό και διαλύτης αρωμάτων.",
    benefits: ["Αποτρέπει την ανάπτυξη μικροοργανισμών στο προϊόν"],
    concerns: ["Πιθανό αλλεργιογόνο σε ευαίσθητα άτομα"],
    aliases: [],
    evidenceLevel: "medium",
  },
  "benzyl salicylate": {
    category: "fragrance",
    shortDescription: "Αρωματική ουσία που χρησιμοποιείται και ως φίλτρο UV σε άρωμα.",
    benefits: ["Σταθεροποιεί άλλα αρωματικά συστατικά"],
    concerns: ["Αναγνωρισμένο αλλεργιογόνο αρωμάτων στην ΕΕ"],
    aliases: [],
    evidenceLevel: "medium",
  },
  "benzyl benzoate": {
    category: "fragrance",
    shortDescription: "Φυσικό συστατικό που λειτουργεί ως διαλύτης αρώματος.",
    benefits: ["Σταθεροποιεί το άρωμα του προϊόντος"],
    concerns: ["Αναγνωρισμένο αλλεργιογόνο αρωμάτων στην ΕΕ"],
    aliases: [],
    evidenceLevel: "medium",
  },
  phenoxyethanol: {
    category: "preservative",
    shortDescription: "Ευρέως χρησιμοποιούμενο συντηρητικό σε καλλυντικά.",
    benefits: ["Αποτελεσματικό κατά βακτηρίων και μυκήτων", "Θεωρείται ήπια εναλλακτική των parabens"],
    concerns: ["Σε σπάνιες περιπτώσεις μπορεί να ερεθίσει ευαίσθητο δέρμα"],
    aliases: ["phenoxethol"],
    evidenceLevel: "high",
  },
  "sodium benzoate": {
    category: "preservative",
    shortDescription: "Κοινό συντηρητικό σε τρόφιμα και καλλυντικά.",
    benefits: ["Παρατείνει τη διάρκεια ζωής του προϊόντος", "Εγκεκριμένο πρόσθετο στην ΕΕ (E211)"],
    concerns: ["Σε συνδυασμό με ασκορβικό οξύ μπορεί να σχηματίσει ίχνη βενζολίου υπό συγκεκριμένες συνθήκες"],
    aliases: ["e211"],
    evidenceLevel: "medium",
  },
  "potassium sorbate": {
    category: "preservative",
    shortDescription: "Ήπιο συντηρητικό κατά μυκήτων και ζυμών.",
    benefits: ["Καλά ανεκτό από τους περισσότερους καταναλωτές", "Εγκεκριμένο πρόσθετο στην ΕΕ (E202)"],
    concerns: [],
    aliases: ["e202"],
    evidenceLevel: "medium",
  },
  methylparaben: {
    category: "preservative",
    shortDescription: "Συντηρητικό από την οικογένεια των parabens.",
    benefits: ["Αποτελεσματικό κατά βακτηρίων και μυκήτων"],
    concerns: ["Πιθανή ορμονική δράση σε πολύ υψηλές συγκεντρώσεις κατά μελέτες", "Ορισμένοι καταναλωτές προτιμούν προϊόντα χωρίς parabens"],
    aliases: ["methyl paraben"],
    evidenceLevel: "medium",
  },
  propylparaben: {
    category: "preservative",
    shortDescription: "Συντηρητικό από την οικογένεια των parabens.",
    benefits: ["Αποτελεσματικό κατά βακτηρίων και μυκήτων"],
    concerns: ["Πιθανή ορμονική δράση σε πολύ υψηλές συγκεντρώσεις κατά μελέτες", "Περιορισμένη χρήση σε προϊόντα για παιδιά κάτω των 3 ετών βάσει κανονισμού ΕΕ"],
    aliases: ["propyl paraben"],
    evidenceLevel: "medium",
  },
  "sodium lauryl sulfate": {
    category: "surfactant",
    shortDescription: "Ισχυρό απορρυπαντικό/αφριστικό συστατικό.",
    benefits: ["Αποτελεσματικός καθαρισμός και δημιουργία αφρού"],
    concerns: ["Μπορεί να αφυδατώσει ή να ερεθίσει ευαίσθητο δέρμα με συχνή χρήση"],
    aliases: ["sls"],
    evidenceLevel: "medium",
  },
  "sodium laureth sulfate": {
    category: "surfactant",
    shortDescription: "Ηπιότερη παραλλαγή θειικού απορρυπαντικού.",
    benefits: ["Καθαρισμός με αφρό, γενικά ηπιότερο από το SLS"],
    concerns: ["Μπορεί να περιέχει ίχνη 1,4-διοξανίου ως παραπροϊόν παρασκευής"],
    aliases: ["sles"],
    evidenceLevel: "medium",
  },
  "cocamidopropyl betaine": {
    category: "surfactant",
    shortDescription: "Ήπιο αφριστικό συστατικό από φυσικά έλαια.",
    benefits: ["Ήπιος καθαρισμός", "Μειώνει τον ερεθισμό από ισχυρότερα απορρυπαντικά στο ίδιο προϊόν"],
    concerns: ["Σπάνια αιτία επαφικής αλλεργίας"],
    aliases: [],
    evidenceLevel: "medium",
  },
  dimethicone: {
    category: "emollient",
    shortDescription: "Σιλικόνη που προσδίδει απαλή, λεία υφή.",
    benefits: ["Δημιουργεί προστατευτικό φιλμ στο δέρμα", "Βελτιώνει την απλωσιμότητα του προϊόντος"],
    concerns: ["Μη βιοδιασπώμενο· ορισμένοι καταναλωτές το αποφεύγουν για περιβαλλοντικούς λόγους"],
    aliases: ["polydimethylsiloxane"],
    evidenceLevel: "medium",
  },
  "cetearyl alcohol": {
    category: "emollient",
    shortDescription: "Λιπαρή αλκοόλη που σταθεροποιεί γαλακτώματα (δεν στεγνώνει το δέρμα).",
    benefits: ["Σταθεροποιεί κρέμες και γαλακτώματα", "Απαλύνει την υφή του προϊόντος"],
    concerns: [],
    aliases: ["cetostearyl alcohol"],
    evidenceLevel: "high",
  },
  "cetyl alcohol": {
    category: "emollient",
    shortDescription: "Λιπαρή αλκοόλη με μαλακτική δράση.",
    benefits: ["Απαλύνει και σταθεροποιεί το προϊόν"],
    concerns: [],
    aliases: [],
    evidenceLevel: "high",
  },
  "stearyl alcohol": {
    category: "emollient",
    shortDescription: "Λιπαρή αλκοόλη που πυκνώνει και σταθεροποιεί.",
    benefits: ["Βελτιώνει την υφή και τη σταθερότητα"],
    concerns: [],
    aliases: [],
    evidenceLevel: "high",
  },
  "butyrospermum parkii": {
    category: "emollient",
    shortDescription: "Βούτυρο καριτέ, πλούσιο μαλακτικό φυσικής προέλευσης.",
    benefits: ["Έντονα ενυδατικό και μαλακτικό", "Καλά ανεκτό από τους περισσότερους τύπους δέρματος"],
    concerns: [],
    aliases: ["shea butter"],
    evidenceLevel: "high",
  },
  tocopherol: {
    category: "antioxidant",
    shortDescription: "Βιταμίνη Ε, φυσικό αντιοξειδωτικό.",
    benefits: ["Προστατεύει το προϊόν και το δέρμα από οξειδωτική φθορά"],
    concerns: [],
    aliases: ["vitamin e"],
    evidenceLevel: "high",
  },
  "tocopheryl acetate": {
    category: "antioxidant",
    shortDescription: "Σταθερή μορφή βιταμίνης Ε.",
    benefits: ["Αντιοξειδωτική δράση", "Καλά ανεκτό από τους περισσότερους τύπους δέρματος"],
    concerns: [],
    aliases: ["vitamin e acetate", "tocopherol acetate"],
    evidenceLevel: "high",
  },
  "ascorbic acid": {
    category: "antioxidant",
    shortDescription: "Βιταμίνη C, δραστικό αντιοξειδωτικό συστατικό.",
    benefits: ["Αντιοξειδωτική δράση", "Βοηθά στη φωτεινότητα της επιδερμίδας"],
    concerns: ["Μπορεί να ερεθίσει πολύ ευαίσθητο δέρμα σε υψηλές συγκεντρώσεις"],
    aliases: ["vitamin c"],
    evidenceLevel: "high",
  },
  niacinamide: {
    category: "active",
    shortDescription: "Μορφή βιταμίνης Β3 με πολλαπλά οφέλη για το δέρμα.",
    benefits: ["Ενισχύει το φραγμό του δέρματος", "Βοηθά στην ομοιόμορφη υφή της επιδερμίδας"],
    concerns: [],
    aliases: ["vitamin b3", "nicotinamide"],
    evidenceLevel: "high",
  },
  "hyaluronic acid": {
    category: "humectant",
    shortDescription: "Ισχυρά ενυδατικό μόριο που συγκρατεί νερό.",
    benefits: ["Έντονη ενυδάτωση", "Καλά ανεκτό από τους περισσότερους τύπους δέρματος"],
    concerns: [],
    aliases: ["sodium hyaluronate"],
    evidenceLevel: "high",
  },
  panthenol: {
    category: "humectant",
    shortDescription: "Προβιταμίνη Β5 με καταπραϋντική και ενυδατική δράση.",
    benefits: ["Καταπραΰνει το δέρμα", "Ενισχύει την ενυδάτωση"],
    concerns: [],
    aliases: ["d-panthenol", "provitamin b5"],
    evidenceLevel: "high",
  },
  retinol: {
    category: "active",
    shortDescription: "Παράγωγο βιταμίνης Α με δράση κατά της γήρανσης.",
    benefits: ["Βοηθά στην ανανέωση του δέρματος"],
    concerns: ["Μπορεί να προκαλέσει ερεθισμό ή φωτοευαισθησία, ειδικά στην αρχή της χρήσης", "Αντενδείκνυται κατά την εγκυμοσύνη σύμφωνα με γενικές συστάσεις δερματολόγων"],
    aliases: ["vitamin a"],
    evidenceLevel: "high",
  },
  "salicylic acid": {
    category: "active",
    shortDescription: "Βήτα-υδροξυοξύ (BHA) με απολεπιστική δράση.",
    benefits: ["Καθαρίζει τους πόρους", "Χρήσιμο σε δέρμα με τάση ακμής"],
    concerns: ["Μπορεί να ερεθίσει ευαίσθητο δέρμα", "Αποφυγή σε υψηλές συγκεντρώσεις κατά την εγκυμοσύνη σύμφωνα με γενικές συστάσεις"],
    aliases: ["bha"],
    evidenceLevel: "high",
  },
  "titanium dioxide": {
    category: "colorant",
    shortDescription: "Λευκό ορυκτό χρησιμοποιούμενο ως χρωστική ή αντηλιακό φίλτρο.",
    benefits: ["Προσφέρει κάλυψη ή φυσική προστασία από την υπεριώδη ακτινοβολία"],
    concerns: ["Σε μορφή νανοσωματιδίων και εισπνεόμενη σκόνη υπόκειται σε ειδικές οδηγίες επισήμανσης στην ΕΕ"],
    aliases: ["ci 77891"],
    evidenceLevel: "high",
  },
  "sodium chloride": {
    category: "other",
    shortDescription: "Αλάτι, χρησιμοποιείται ως πυκνωτικό ή γευστικό συστατικό.",
    benefits: ["Ρυθμίζει την υφή σε καλλυντικά", "Απαραίτητο θρεπτικό στοιχείο σε τρόφιμα με μέτρια κατανάλωση"],
    concerns: ["Υπερβολική πρόσληψη από τρόφιμα συνδέεται με αυξημένη αρτηριακή πίεση"],
    aliases: ["salt", "αλατι", "αλάτι"],
    evidenceLevel: "high",
  },
  "citric acid": {
    category: "other",
    shortDescription: "Φυσικό οξύ που ρυθμίζει το pH ή προσθέτει γεύση.",
    benefits: ["Σταθεροποιεί προϊόντα και τρόφιμα", "Εγκεκριμένο πρόσθετο στην ΕΕ (E330)"],
    concerns: [],
    aliases: ["e330", "κιτρικο οξυ", "κιτρικό οξύ"],
    evidenceLevel: "high",
  },
  "xanthan gum": {
    category: "other",
    shortDescription: "Φυσικό πυκνωτικό από ζύμωση.",
    benefits: ["Σταθεροποιεί την υφή προϊόντων και τροφίμων", "Εγκεκριμένο πρόσθετο στην ΕΕ (E415)"],
    concerns: [],
    aliases: ["e415"],
    evidenceLevel: "high",
  },
  "alcohol denat": {
    category: "other",
    shortDescription: "Μετουσιωμένη αλκοόλη, χρησιμοποιείται ως διαλύτης ή για γρήγορο στέγνωμα.",
    benefits: ["Βοηθά τα υπόλοιπα συστατικά να απλωθούν και να στεγνώσουν γρήγορα"],
    concerns: ["Μπορεί να αφυδατώσει ξηρό ή ευαίσθητο δέρμα με συχνή χρήση"],
    aliases: ["denatured alcohol", "alcohol denat."],
    evidenceLevel: "medium",
  },
  aspartame: {
    category: "other",
    shortDescription: "Τεχνητή γλυκαντική ουσία χαμηλών θερμίδων.",
    benefits: ["Προσφέρει γλυκιά γεύση με ελάχιστες θερμίδες"],
    concerns: ["Ακατάλληλο για άτομα με φαινυλκετονουρία", "Παραμένει αντικείμενο συζήτησης σε ορισμένες μελέτες μακροχρόνιας κατανάλωσης"],
    aliases: ["e951"],
    evidenceLevel: "medium",
  },
  "monosodium glutamate": {
    category: "other",
    shortDescription: "Ενισχυτικό γεύσης (umami) ευρείας χρήσης σε τρόφιμα.",
    benefits: ["Ενισχύει τη γεύση χωρίς προσθήκη αλατιού"],
    concerns: ["Σε ορισμένα άτομα έχει αναφερθεί ευαισθησία με ήπια συμπτώματα"],
    aliases: ["msg", "e621"],
    evidenceLevel: "medium",
  },
  "sodium nitrite": {
    category: "preservative",
    shortDescription: "Συντηρητικό αλλαντικών που αποτρέπει την αλλοίωση.",
    benefits: ["Προστατεύει από επικίνδυνα βακτήρια όπως το κλωστρίδιο του βοτουλισμού"],
    concerns: ["Μπορεί να σχηματίσει νιτροζαμίνες υπό ορισμένες συνθήκες μαγειρέματος", "Συστήνεται μέτρια κατανάλωση επεξεργασμένου κρέατος"],
    aliases: ["e250"],
    evidenceLevel: "high",
  },
  "palm oil": {
    category: "other",
    shortDescription: "Φυτικό έλαιο ευρείας χρήσης σε τρόφιμα και καλλυντικά.",
    benefits: ["Σταθερό στη θερμότητα, χρήσιμο για την υφή του προϊόντος"],
    concerns: ["Η καλλιέργειά του συνδέεται με περιβαλλοντικές επιπτώσεις όταν δεν προέρχεται από πιστοποιημένη βιώσιμη πηγή"],
    aliases: ["elaeis guineensis oil"],
    evidenceLevel: "medium",
  },
};

// Alias index built once, so a lookup by any known alternative name still
// resolves to the same canonical entry.
const ALIAS_INDEX: Map<string, string> = buildAliasIndex();

function buildAliasIndex(): Map<string, string> {
  const index = new Map<string, string>();

  for (const [canonicalName, entry] of Object.entries(REGISTRY)) {
    index.set(canonicalName, canonicalName);

    for (const alias of entry.aliases) {
      index.set(normalizeKey(alias), canonicalName);
    }
  }

  return index;
}

function normalizeKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function lookupIngredientKnowledge(
  name: string,
): IngredientKnowledgeEntry | null {
  const key = normalizeKey(name);

  const canonicalName = ALIAS_INDEX.get(key);

  if (!canonicalName) {
    return null;
  }

  return REGISTRY[canonicalName] ?? null;
}
