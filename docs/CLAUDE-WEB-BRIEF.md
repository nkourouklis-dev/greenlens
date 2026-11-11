# GreenLens — Brief για Claude web (κατάσταση 2026-11-11)

Επικόλλησε αυτό ως project knowledge. Πλήρης τεχνική εικόνα: `docs/ARCHITECTURE.md` (πηγή αλήθειας· αν διαφωνεί με τον κώδικα, ο κώδικας κερδίζει).

## Τι είναι
Mobile-first PWA που σκανάρει τρόφιμο / ποτό / καλλυντικό: barcode → αναζήτηση προϊόντος → φωτογραφίες πίσω ετικέτας → OCR → **ντετερμινιστική βαθμολογία 0–100** → εξήγηση στα ελληνικά. Admin πλευρά (PIM) για τον κοινό κατάλογο. Live: https://greenlens.stoaops.com · Repo: GitHub (main → Cloudflare Pages) · 169 commits, από 2026-08-28.

## Stack
- Frontend: React 19, Vite 8, TypeScript 6, Tailwind 4, react-router 7, @zxing/browser (+ native BarcodeDetector).
- Backend: Cloudflare Worker `greenlens-ocr` (~46k γραμμές με tests), D1 (migrations 0001–0017), R2 (φωτογραφίες), Workers AI, Azure AI Vision Read (OCR), Open Food Facts / Open Beauty Facts (cache στο D1).
- Deploy: Worker χειροκίνητα (`npx wrangler deploy`), frontend αυτόματα με `git push origin main`. CI (GitHub Actions) τρέχει τα ίδια checks αλλά δεν κάνει deploy.

## Τι έχουμε φτιάξει (σε φάσεις)
1. **Prototype (28/8–31/8):** σάρωση barcode, φωτό συστατικών, Worker με OCR+AI, ιστορικό σε localStorage.
2. **Αξιοπιστία ανάγνωσης (1/9–7/9):** απομόνωση συστατικών, lookup OFF, σταθερό camera stream, διάσπαση ανάλυσης σε ingredients / nutrition / chemical_composition.
3. **Γνώση στο D1 + κοινός κατάλογος (8/9–10/9):** `ingredient_knowledge` (curated + 669 OFF additives), cache προϊόντων ανά barcode, admin capture/PIM, εκδόσεις, tag `mvp-v1`. Βαθμολογία από κανόνες, όχι από μοντέλο.
4. **Hardening (13/9–16/9):** CI, ενιαίος πυρήνας βαθμολόγησης, μικτές ετικέτες, scan_failures, **usage counters + hard stop budget**, βαθμονομημένο ABV για αλκοόλ.
5. **Restyle + ταχύτητα (22/9–27/9):** light θέμα, floating nav, background analysis, **ενιαίο σκορ τροφίμων = 60% Nutri-Score + 40% συστατικά (cap 65 χωρίς διατροφικό πίνακα)**, φυσικά vs προστιθέμενα σάκχαρα.
6. **OCR fidelity & operations (29/9–16/10):** πίνακες χωρίς μονάδες, claims συσκευασίας ως θετικά, raw OCR log, vision fallback (admin), 137 περιγραφές συστατικών, Azure outage 1/10 (έληξε trial → πληρωμένο tier + typed error codes), brand από front photo, bulk rescore, καθαρό νερό.
7. **Custom domain (3/11):** greenlens.stoaops.com· διορθώθηκε CORS allow-list.
8. **Ταχύτητα, routing, mobile UX (7/11):** ανάλυση συστατικών **χωρίς μοντέλο** (deterministic), review οθόνη με ένα verdict, iOS safe areas, offline recovery, κάμερα που επιβιώνει από lock.
9. **Domain/SEO/οπτική ενοποίηση (7/11–9/11):** νέο home hero, history & flow σε ενιαία πράσινη γλώσσα, canonical domain, JSON-LD, OG image, credit Stoa Ops.

## Τρέχουσα κατάσταση
- Production: λειτουργικό σε greenlens.stoaops.com. Τελευταίο commit `ac0cee6`.
- **Σε εξέλιξη (uncommitted):** η σελίδα Product (ExecutiveSummaryCard, ScoreBreakdownPanel, κάρτα «Περίληψη») μεταφέρεται από τις παλιές dark slate classes στα νέα light design tokens (`border-line-subtle`, `bg-surface`, `text-ink-muted`, `text-accent-strong`).
- Tests: 526/526 στις 3/11. Lint: μόνο γνωστά `set-state-in-effect` warnings.
- Τακτοποίηση repo (σήμερα): παλιά snapshots → `docs/archive/`, seed SQL → `data/`, αφαιρέθηκαν άδεια/άχρηστα scratch αρχεία, `portfolio-export/` στο .gitignore.

## Ανοιχτά θέματα / εκκρεμείς αποφάσεις
- **Γνωστοποίηση φωτογραφιών:** οι χρήστες δεν ενημερώνονται ότι η φωτό ετικέτας αποθηκεύεται, εμφανίζεται σε άλλους που σκανάρουν το ίδιο barcode και στέλνεται στο Azure. Να λυθεί πριν από οποιοδήποτε άνοιγμα πέρα από φίλους.
- Azure `greenlens-ai`: επιβεβαίωση ότι το pricing tier είναι F0 αλλιώς μείωση `AZURE_OCR_MONTHLY_BUDGET`· budget alerts στα dashboards (Azure/Cloudflare) τα ορίζει ο owner.
- Δεν υπάρχει rate limiting στα public endpoints (μόνο budgets) — έλεγχος πριν διευρυνθεί το κοινό.
- Συνδυαστικό σκορ από πολλές φωτογραφίες (+ ABV curve) προτάθηκε 16/9, **δεν έχει χτιστεί**· περιμένει αποφάσεις.
- Μοντέλο: τρέχει Workers AI (llama-4-scout, moondream). Μετάβαση σε Claude: «όχι ακόμα».
- Κάλυψη γνώσης: πολλά καλλυντικά/απλά τρόφιμα με «no verified description»· 26 EU fragrance allergens (μόνο 11 έχουν κανόνες)· ελαιόλαδα βγαίνουν C vs B του OFF.
- Vision fallback πινάκων δεν έχει επαληθευτεί σε πραγματική φωτό. Τα αποθηκευμένα scores δεν ανανεώνονται μόνα τους (χρειάζεται rescore).
- Dead code: παλιά threshold paths (`scoreNutrition` κ.ά.).
- Verify ότι το migration 0017 (`products.brand`) έχει εφαρμοστεί remote.

## Αρχές (να τις σέβεται κάθε πρόταση)
1. **Μηδενικό απρόσμενο κόστος:** hard-block στο 100% budget, προειδοποίηση στο 80%. Ό,τι μπορεί να δώσει απεριόριστο third-party spend έχει hard cap by default.
2. **Βαθμολογία ντετερμινιστική και εξηγήσιμη:** μέσω `scoreFood`· ποτέ ονόματα, περιγραφές ή πόντοι από ελεύθερο κείμενο μοντέλου.
3. Κείμενα προς χρήστη στα ελληνικά· κώδικας, σχόλια, commits στα αγγλικά.
4. Ερώτηση πριν από deploy, remote migration ή οτιδήποτε καταστροφικό.
5. Πριν από deploy: `npm run worker:typecheck`, `npm run worker:test`, `npm run build`, `npm run lint`.
6. Νέο frontend host ⇒ προσθήκη στο `worker/cors.ts` + redeploy Worker.

## Χρήσιμοι δείκτες
Δομή repo, routes, endpoints, schema, flows: `docs/ARCHITECTURE.md` §4–6 · brand: `docs/BRAND-GUIDE.md`, `brand/` · παλιά snapshots: `docs/archive/`.
