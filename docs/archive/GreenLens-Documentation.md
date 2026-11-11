# GreenLens — Τεχνική & Λειτουργική Τεκμηρίωση

*Ενημερώθηκε: 6 Σεπτεμβρίου 2026 — βάσει του κώδικα στο greenlens.zip (worker/index.ts ως main αρχείο backend)*

---

## 1. Τι είναι το GreenLens

Εφαρμογή (PWA, mobile-first) που σαρώνει ετικέτες τροφίμων και καλλυντικών, διαβάζει τη λίστα συστατικών με OCR και παράγει AI ανάλυση: score, θετικά/προσοχή σημεία, πιθανά αλλεργιογόνα και εξήγηση ανά συστατικό.

---

## 2. Αρχιτεκτονική

Το διάγραμμα παραπάνω δείχνει τη ροή. Σε κείμενο:

1. **Client (React PWA)** — τραβάει φωτογραφία ετικέτας/barcode, στέλνει multipart request στο Worker.
2. **Cloudflare Worker `greenlens-ocr`** (`worker/index.ts`) — είναι το **API gateway**. Δεν έχει δική του βάση δεδομένων (δεν υπάρχει D1/KV binding στο `wrangler.jsonc` — μόνο `AI` binding).
3. Ο Worker καλεί τρεις εξωτερικές υπηρεσίες ανάλογα το endpoint:
   - **Azure AI Vision** → OCR εξαγωγή κειμένου από την ετικέτα (`azureOcr.ts`), χρειάζεται secrets `AZURE_VISION_ENDPOINT` / `AZURE_VISION_KEY`.
   - **Cloudflare Workers AI**:
     - `@cf/moondream/moondream3.1-9B-A2B` (vision model) → αναγνώριση προϊόντος από φωτογραφία (`/api/product/identify`) όταν δεν υπάρχει barcode match.
     - `@cf/meta/llama-4-scout-17b-16e-instruct` (text model) → η ίδια η ανάλυση συστατικών (`/api/analysis/run`), επιστρέφει αυστηρά δομημένο JSON.
   - **OpenFoodFacts / OpenBeautyFacts** (public APIs) → αναζήτηση προϊόντος με βάση barcode πριν καταφύγει στο AI (`productLookup.ts`).
4. **Αποθήκευση** — δεν υπάρχει server-side persistence. Το ιστορικό σαρώσεων μένει στη συσκευή (`localStorage` μέσω `historyService.ts`), και τα προσωρινά captures σε `sessionStorage` (`captureDraftService.ts`). Αυτό σημαίνει: καθαρισμός browser data = χαμένο ιστορικό, δεν υπάρχει sync μεταξύ συσκευών.

### Ροή ενός σκαναρίσματος
`Scan (barcode ή φωτό) → /api/product/identify (barcode lookup ή AI vision) → φωτογραφία ετικέτας συστατικών → /api/ocr/extract (Azure OCR) → επιβεβαίωση χρήστη στο IngredientsReview → /api/analysis/run (Llama 4 Scout) → σελίδα Product με score, insights, executive summary`

### Βασικά endpoints του Worker
| Endpoint | Μέθοδος | Σκοπός |
|---|---|---|
| `/api/health` | GET | Health check |
| `/api/product/identify` | POST (multipart) | Ταυτοποίηση προϊόντος: πρώτα barcode lookup, μετά AI vision fallback |
| `/api/ocr/extract` | POST (multipart) | OCR εξαγωγή κειμένου ετικέτας μέσω Azure |
| `/api/analysis/run` | POST (JSON) | AI ανάλυση συστατικών, scoring, insights |
| `/api/products/{id}/chat` | POST | Placeholder — δηλώνει ρητά ότι δεν είναι ακόμα διαθέσιμο |

Ο Worker κάνει επίσης server-side **validation της λίστας συστατικών** (διαχωρισμός από πίνακα διατροφικών τιμών) πριν στείλει οτιδήποτε στο AI — σημαντικό anti-hallucination guardrail που υπάρχει ήδη υλοποιημένο.

---

## 3. Τεχνολογίες (stack)

**Frontend**
- React 19 + Vite 8, TypeScript
- React Router 7
- Tailwind CSS 4
- `@zxing/browser` — ανάγνωση barcode από κάμερα
- `lucide-react` — icons
- PWA manifest (`manifest.webmanifest`), deploy σε **Cloudflare Pages**

**Backend**
- **Cloudflare Worker** (`greenlens-ocr`), γραμμένο σε TypeScript, deploy με **Wrangler 4**
- **Cloudflare Workers AI** binding (`env.AI`) — μοντέλα `moondream3.1-9B-A2B` (vision) και `llama-4-scout-17b-16e-instruct` (text)
- **Azure AI Vision** (εξωτερικό REST API) — OCR
- **OpenFoodFacts / OpenBeautyFacts** (εξωτερικά public APIs) — barcode lookup

**Testing / tooling**
- `tsx --test` για unit tests του worker (`*.test.ts` αρχεία: analysis, cors, ingredientInsights, ingredientText, ocr, productLookup, scoring)
- `oxlint` για linting
- Wrangler types generation (`worker-configuration.d.ts`)

**Δεν υπάρχει (ακόμα)**
- Καμία βάση δεδομένων στο backend (D1/KV/R2) — δεν αναφέρεται στο `wrangler.jsonc`
- Καμία αυθεντικοποίηση χρήστη / λογαριασμός
- Chat endpoint είναι placeholder, όχι λειτουργικό ακόμα

---

## 4. Εγχειρίδιο χρήστη

**Πώς σαρώνω ένα προϊόν**
1. Άνοιξε την εφαρμογή στο κινητό και πάτα **«Σάρωση»** από την αρχική οθόνη.
2. Σκάναρε το barcode του προϊόντος ή τράβα φωτογραφία του προϊόντος αν δεν υπάρχει barcode.
3. Η εφαρμογή προσπαθεί πρώτα να βρει το προϊόν από τη βάση OpenFoodFacts/OpenBeautyFacts μέσω barcode· αν δεν το βρει, χρησιμοποιεί AI αναγνώριση από τη φωτογραφία.
4. Τράβα φωτογραφία της λίστας συστατικών (κοντινό πλάνο, καλός φωτισμός, χωρίς αντανακλάσεις).
5. Η εφαρμογή διαβάζει το κείμενο (OCR) και σου δείχνει τι διάβασε στην οθόνη **«Επιβεβαίωση συστατικών»** — μπορείς να διορθώσεις αν κάτι διαβάστηκε λάθος.
6. Πάτα **«Ανάλυση»**. Θα δεις: γενική περίληψη, θετικά σημεία, σημεία προσοχής, πιθανά αλλεργιογόνα, score, και εξήγηση για κάθε συστατικό ξεχωριστά.
7. Το σκανάρισμα αποθηκεύεται αυτόματα στο **«Ιστορικό»** — αλλά μόνο στη δική σου συσκευή/browser, όχι στο cloud.

**Σημαντικό για τον χρήστη**
- Η ανάλυση δεν αποτελεί ιατρική συμβουλή — η εφαρμογή το αναφέρει ρητά και αποφεύγει ισχυρισμούς περί ασφάλειας/τοξικότητας χωρίς τεκμηρίωση.
- Αν αδειάσεις τα δεδομένα browser (cache/site data) ή αλλάξεις συσκευή, χάνεις το ιστορικό — δεν υπάρχει λογαριασμός/σύνδεση ακόμα.
- Χαμηλή ποιότητα φωτογραφίας δίνει «χαμηλής εμπιστοσύνης» αποτέλεσμα αλλά η εφαρμογή δεν μπλοκάρει τη ροή — μπορείς πάντα να συνεχίσεις ή να ξαναβγάλεις φωτό.

---

## 5. Εγχειρίδιο Product Owner

**Λειτουργικά κομμάτια που υπάρχουν σήμερα**
- Ταυτοποίηση προϊόντος (barcode-first, AI vision fallback)
- OCR ετικέτας μέσω Azure
- AI ανάλυση συστατικών με αυστηρό, ελεγμένο JSON schema (score, findings, allergens, executive summary)
- Ιστορικό σαρώσεων (τοπικό, ανά συσκευή)
- Server-side μηχανισμός διάκρισης «λίστα συστατικών» vs «πίνακας διατροφικών τιμών», ώστε το AI να μην μπερδεύεται

**Τι πρέπει να ξέρεις για λειτουργικούς/επιχειρηματικούς σκοπούς**
- **Κόστος ανά σάρωση** προέρχεται από 2 πηγές πληρωμής: Azure Vision (OCR, χρέωση ανά κλήση) + Cloudflare Workers AI (χρέωση ανά neuron/token). Το barcode lookup μέσω OpenFoodFacts/OpenBeautyFacts είναι δωρεάν public API.
- **Χωρίς δική μας βάση δεδομένων σήμερα** σημαίνει: καμία δυνατότητα analytics σε επίπεδο χρήστη, καμία δυνατότητα «τα σκαναρίσματα μου σε πολλές συσκευές», και κανένα ιστορικό διαθέσιμο για μελλοντικά features (π.χ. συστάσεις, trends). Αυτό είναι το πρώτο μεγάλο roadmap decision: πότε/αν προστίθεται D1 (Cloudflare's SQL DB) ή KV για persistence.
- **Δεν υπάρχει authentication.** Άρα δεν υπάρχει έννοια λογαριασμού χρήστη ή προσωποποιημένης εμπειρίας ακόμα.
- **Chat feature είναι placeholder** — το endpoint υπάρχει αλλά επιστρέφει σταθερό μήνυμα «θα είναι διαθέσιμο όταν αποθηκεύεται με ασφάλεια η ανάλυση». Δηλαδή είναι δεμένο με το roadmap item της persistence.
- **Νομικό/ευθύνη ρίσκο**: το prompt του analysis endpoint έχει ήδη ρητούς κανόνες να μην κάνει ισχυρισμούς ασφάλειας/τοξικότητας/εγκυμοσύνης χωρίς τεκμηριωμένη πηγή — καλό guardrail να διατηρηθεί σε κάθε μελλοντική αλλαγή του prompt.
- **Deployment**: frontend σε Cloudflare Pages, backend σε Cloudflare Workers μέσω Wrangler — άρα deploy pipeline είναι απλό (`wrangler deploy` + Pages build), χωρίς Docker/servers να διαχειριστούν.
- **Παρακολούθηση (observability)**: υπάρχει ήδη ενεργοποιημένο Cloudflare observability (`head_sampling_rate: 1`) και εκτενές logging (π.χ. `ocr_model_completed`, `analysis_model_completed`, `ingredient_validation_rejected`) — χρήσιμο για debugging ποιότητας OCR/AI χωρίς επιπλέον εργαλείο.

**Ανοιχτά θέματα για απόφαση (roadmap-level)**
1. Persistence layer (D1/KV) — προαπαιτούμενο για ιστορικό cross-device, chat, analytics.
2. Authentication/λογαριασμός χρήστη.
3. Κόστος ανά σάρωση σε κλίμακα — αξίζει να μετρηθεί real cost/scan πριν από growth push.
4. Πολιτική retention για photos/OCR text (αυτή τη στιγμή δεν αποθηκεύονται server-side καθόλου, μόνο περνάνε μέσα από τον Worker).

---

*Θα ενημερώνω αυτό το session από σήμερα και μετά με ό,τι αλλάζει/προστίθεται στο GreenLens.*
