# GreenLens — MVP v1 State

Milestone tag: `mvp-v1` @ `96c9d1d` ("fix: no-problems bonus no longer coexists with active deductions").
Καταγράφηκε: 8 Σεπτεμβρίου 2026.

Αυτό δεν είναι release note προς χρήστες — είναι σημείο αναφοράς για εμάς: τι
έχει επαληθευτεί ότι δουλεύει σωστά μέχρι εδώ, τι δεν έχει λυθεί ακόμα, και
γιατί θεωρούμε αυτό το commit το πρώτο αξιόπιστο MVP.

Οι ενότητες 1–4 είναι το στιγμιότυπο του `mvp-v1` και μένουν όπως γράφτηκαν.
Η ενότητα 0 είναι η τρέχουσα κατάσταση.

---

## 0. Τρέχουσα κατάσταση — 13 Σεπτεμβρίου 2026

**Tests / έλεγχοι:** 275/275 στο `npm run worker:test`, `worker:typecheck`,
`build` και `lint` καθαρά. Τρέχουν αυτόματα σε κάθε push στο `main` μέσω
GitHub Actions (`.github/workflows/ci.yml`). Το deploy παραμένει χειροκίνητο
(`wrangler deploy` για τον worker, `git push` → Cloudflare Pages).

**D1:** 10 προϊόντα (7 verified, 3 ai_generated), 27 φωτογραφίες (16 από
σαρώσεις χρηστών, 11 από admin capture), 34 εκδόσεις αναλύσεων,
`ingredient_knowledge` 719 εγγραφές (50 curated + 669 Open Food Facts), 35
ενεργοί κανόνες βαθμολόγησης. Όλα τα migrations έως `0008` εφαρμοσμένα και
καταγεγραμμένα στο `d1_migrations` (το `0007` είχε εφαρμοστεί εκτός wrangler
και καταγράφηκε εκ των υστέρων, στις 13/9).

**Από το mvp-v1 και μετά:**
- Βαθμολογία ντετερμινιστική από κανόνες πάνω στο κείμενο της ετικέτας, όχι
  από τις σοβαρότητες του μοντέλου (`28d17f9`)· επανυπολογισμός στο admin
  save, ιστορικό εκδόσεων με επαναφορά, PIM assistant (`3d4ff5a`, `0a52cb8`).
- PIM: επεξεργασία ονόματος προϊόντος, σάρωση barcode με κάμερα στο
  `/admin/capture` (`f56f94d`, `53245c2`).
- Η μπροστινή φωτογραφία και το όνομα από τη ροή του κινητού αποθηκεύονται
  στον κατάλογο (`5cf6c79`, `f56f94d`).
- Ονόματα/περιγραφές συστατικών μόνο από την ετικέτα και το
  `ingredient_knowledge` — ποτέ ελεύθερο κείμενο του μοντέλου (`0a49863`).
- Διορθώσεις στην απομόνωση/ταξινόμηση κειμένου: λίστες χωρίς heading πάνω
  από footer κατασκευαστή (`a2952c3`), καλλυντικά που ταξινομούνταν ως
  chemical_composition (`c8025c1`), λίστες τροφίμων με ποσοστά και δήλωση
  αλλεργιογόνων (`18e2dc4`).

**Ανοιχτά (πέρα από την ενότητα 2):**
- Μικρή κάλυψη γνώσης για καλλυντικά/απλά τρόφιμα: πολλές κάρτες δείχνουν
  «Δεν υπάρχει επαληθευμένη περιγραφή». Υποψήφια πηγή: EU CosIng.
- Η περίληψη / executive summary παραμένουν ελεύθερο κείμενο του μοντέλου.
- Στο heading path της απομόνωσης συστατικών περνάει και το footer του
  κατασκευαστή· το καθαρίζει αργότερα το `contentFilter`.
- Το `Scan.tsx` δεν χρησιμοποιεί ακόμα το κοινό `useBarcodeScanner`.
- Ένα προϊόν εμφάνισε «0 σαρώσεις» μετά από σάρωση — δεν έχει ερευνηθεί.

---

## 1. Τι δουλεύει αξιόπιστα σήμερα

**Scoring logic** (`worker/scoring.ts`, `nutritionScoring.ts`, `chemicalScoring.ts`)
- Ενιαίος αλγόριθμος start-at-100 → deductions → bonuses → clamp[0,100] και
  στα τρία analysis paths (ingredients / nutrition / chemical_composition).
- Deductions: 8 πόντοι για "attention", 15 για "high_attention", μισό αν δεν
  υπάρχει evidence· cap στις 6 αφαιρέσεις ανά ανάλυση.
- Bonuses ("πολλαπλά θετικά", "καμία αφαίρεση") δεν μπορούν πλέον να
  συνυπάρχουν με ενεργό deduction — διορθώθηκε στο `96c9d1d` αφού και τα
  τρία paths είχαν την ίδια λογική αντίφαση (βλ. §3).
- 159/159 tests στο `npm run worker:test`, `worker:typecheck` καθαρό.

**Allergen handling** (`worker/allergens.ts`)
- Τα 14 επίσημα EU food allergen groups (γλουτένη, γάλα, αυγό, θειώδη, ξηροί
  καρποί, ...) υποβαθμίζονται σε "info" πριν το scoring όταν το εύρημα είναι
  απλή δήλωση αλλεργιογόνου, όχι πραγματικό πρόβλημα (`isAllergenDeclarationOnly`
  / `classifyAllergenFindings`) — ενοποιούνται σε ένα notice αντί για N
  πανομοιότυπες κάρτες "Προσοχή -Χ" (fix: `268a69e`).
- Ένα ξεχωριστό registry των 26 EU cosmetic fragrance allergens (Linalool,
  Limonene, Coumarin, ...) υπάρχει για το notice, αλλά **δεν** περνάει από
  την ίδια "declaration-only" υποβάθμιση — βλ. §2.
- Ασφαλιστική δικλείδα: ένα όνομα στο `potentialAllergens` του AI δεν
  εμφανίζεται ποτέ ως "επίσημο EU αλλεργιογόνο" αν δεν ταιριάζει σε μία από
  τις δύο πραγματικές λίστες (fix: `8eb4e14`, μετά από περιστατικό όπου το
  AI έβαλε "Benzalkonium Chloride" — αντισηπτικό, όχι αλλεργιογόνο).

**Camera capture / OCR framing**
- Ζητάει υψηλότερη ανάλυση κάμερας, framing/language hooks για να μειωθεί
  garbled OCR text (`56af2c3`).
- Fix σε aspect-ratio bug ανάμεσα σε preview και captured photo, και σε
  διπλότυπο κείμενο στις κάρτες συστατικών (`374fb6a`).

**D1-backed ingredient database**
- `ingredient_knowledge` (+ `ingredient_aliases`): **714 εγγραφές**,
  εισαγμένες από το static registry plus το Open Food Facts additives
  taxonomy (`75d7e63`, `10f028d`). Χρησιμοποιείται στο ingredients path
  αντί για το παλιό in-memory registry.
- D1 lookup degrade-άρει καλά: αν αποτύχει το query, γυρνάει "no curated
  match" αντί να ρίξει exception (καλυμμένο με test).

**Content category split**
- Η ανάλυση δρομολογείται σε ξεχωριστά paths — ingredients / nutrition /
  chemical_composition — καθένα με δικό του worker module για extraction,
  analysis και scoring.

---

## 2. Γνωστά ανοιχτά θέματα / tech debt

- **Fragrance allergens δεν έχουν "declaration-only" υποβάθμιση.** Αν το AI
  βαθμολογήσει ένα δηλωμένο άρωμα (π.χ. Linalool) ως `attention` αντί για
  `info`, θα αφαιρέσει πόντους σαν πραγματικό πρόβλημα — η εξαίρεση που
  υπάρχει για τα 14 food allergen groups δεν καλύπτει τα 26 cosmetic
  fragrance allergens. Δεν έχει προκαλέσει reported bug ακόμα, αλλά είναι
  ασυνέπεια στη λογική που αξίζει να λυθεί.
- **`nutrient_knowledge` έχει μόνο 6 εγγραφές** (starter set), έναντι 714 στο
  `ingredient_knowledge`. Το nutrition path βασίζεται σχεδόν αποκλειστικά
  στην περιγραφή του AI ανά scan, όχι σε curated δεδομένα.
- **Το chemical_composition path δεν έχει καθόλου curated knowledge DB.**
  Κάθε περιγραφή/rating προέρχεται 100% από το AI, χωρίς static ή D1-backed
  fallback.
- **Τριπλή, σχεδόν πανομοιότυπη scoring λογική** (`scoring.ts`,
  `nutritionScoring.ts`, `chemicalScoring.ts`) — συνειδητή επιλογή ώστε το
  tested ingredients path να μη σπάει από αλλαγές στα άλλα δύο, αλλά σημαίνει
  ότι ένα fix (όπως το `96c9d1d`) πρέπει να εφαρμοστεί χειροκίνητα και στα
  τρία αρχεία, όπως ακριβώς έγινε εδώ.
- **Δεν υπάρχει CI/CD.** Τα deploys (`wrangler deploy` για τον worker,
  `git push` για το Cloudflare Pages frontend) είναι χειροκίνητα, χωρίς
  αυτόματο test gate πριν το production. *(13/9: προστέθηκε CI για tests,
  typecheck, build και lint· το deploy μένει χειροκίνητο — βλ. §0.)*
- **Comparison feature** ("Σύγκριση") στη σελίδα προϊόντος είναι ακόμα
  placeholder ("Δεν υπάρχουν ακόμη αρκετά συγκρίσιμα προϊόντα") — δεν έχει
  υλοποιηθεί πραγματική λογική σύγκρισης.

---

## 3. Reference scan: herbarium hand antiseptic gel (EAN 5202399414023)

Αυτό το προϊόν (70% αιθυλική αλκοόλη) είναι το σημείο αναφοράς που
επιβεβαίωσε ότι το MVP δουλεύει σωστά, και τώρα ζει ως μόνιμο regression
test στο `worker/goldenScans.test.ts`.

**Γιατί ήταν καλό test case:** ενεργοποίησε ταυτόχρονα τρία διαφορετικά
κομμάτια του συστήματος σε ένα scan:
1. **Δηλωμένο αλλεργιογόνο** (Linalool, EU cosmetic fragrance allergen) —
   δοκιμάζει το allergen notice layer.
2. **Ενεργό συστατικό με πραγματικό deduction** (η υψηλή περιεκτικότητα σε
   αιθυλική αλκοόλη, -4 πόντοι) — δοκιμάζει το deduction path.
3. **Benefits/concerns σε ξεχωριστά συστατικά** (Glycerin, Aloe Barbadensis
   ως θετικά) — δοκιμάζει ότι per-ingredient insights δεν συγχέονται μεταξύ
   τους.

Ακριβώς αυτός ο συνδυασμός αποκάλυψε το bug: το σύστημα έδινε ταυτόχρονα
-4 για την αιθυλική αλκοόλη ΚΑΙ +5 bonus "Δεν εντοπίστηκαν προβληματικά
συστατικά" στο ίδιο score breakdown — μια άμεση λογική αντίφαση που ένα πιο
απλό test case (ένα μόνο συστατικό, καμία allergen πολυπλοκότητα) πιθανόν
δεν θα την είχε αναδείξει τόσο καθαρά.

Το golden test παγώνει την αναμενόμενη συμπεριφορά: 1 deduction (-4 για
ethanol), 0 "no problems" bonus, τελικό score 99 (όχι τεχνητά κλειδωμένο
στο 100). Αν κάποιος ξαναπεράσει αυτή την αντίφαση στο μέλλον, το test θα
αποτύχει αμέσως.

---

## 4. Next steps (καταγραφή μόνο, καμία υλοποίηση ακόμα)

Κατευθύνσεις που έχουν συζητηθεί αλλά δεν έχει αποφασιστεί αν/πότε θα
προχωρήσουμε:

- **Import γενικών ingredients από Open Food Facts** στο `ingredient_knowledge`
  (πέρα από το ήδη-εισαγμένο additives taxonomy), για μεγαλύτερη κάλυψη
  πέρα από τα τρέχοντα 714.
- **Import από EU CosIng database** για καλλυντικά συστατικά — πιο επίσημη/
  κανονιστική πηγή από το OFF, ειδικά χρήσιμη για το cosmetic productType.
- Πιθανή λύση για το §2 fragrance-allergen gap: επέκταση του
  `isAllergenDeclarationOnly` layer ώστε να καλύπτει και τα 26 EU cosmetic
  fragrance allergens, όχι μόνο τα 14 food groups.
- Πιθανή ενοποίηση ή shared-helper εξαγωγή για τα τρία σχεδόν πανομοιότυπα
  scoring modules, ώστε ένα fix σαν το `96c9d1d` να μη χρειάζεται τριπλή
  χειροκίνητη εφαρμογή.
