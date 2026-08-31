# GreenLens — Project Brief

Έγγραφο συνέχειας για νέα συνομιλία, Copilot Agent ή Notebook.
Ενημερώθηκε: 30 Αυγούστου 2026.

---

## 1. Τι είναι

Mobile-first PWA που σκανάρει barcode προϊόντος, διαβάζει τη λίστα
συστατικών με OCR, την αναλύει με AI και επιστρέφει explainable score.

Στοχεύει σε τρόφιμα και καλλυντικά. Δίγλωσσο (el/en) στο roadmap,
προς το παρόν μόνο ελληνικά.

**Production:** https://greenlens.pages.dev
**Worker API:** https://greenlens-ocr.nkourouklis.workers.dev
**Repo:** github.com/nkourouklis-dev/greenlens
**Branch:** main (b9b662b)

---

## 2. Stack

| Layer | Τεχνολογία |
|---|---|
| Frontend | React, Vite, TypeScript, TailwindCSS |
| Hosting | Cloudflare Pages |
| API | Cloudflare Worker |
| Vision | `@cf/moondream/moondream3.1-9B-A2B` |
| Text | `@cf/meta/llama-4-scout-17b-16e-instruct` |
| Storage | localStorage (D1 στο roadmap) |
| Barcode | ZXing (`@zxing/browser`) |

Ο Worker και το Pages είναι **ξεχωριστά deployments**.

- `git push origin main` ανεβάζει **μόνο** το frontend
- `npx wrangler deploy` ανεβάζει **μόνο** τον Worker

---

## 3. Δομή αρχείων

```
worker/
  index.ts        Routes, guards, AI calls
  ocr.ts          OCR parser + validation
  analysis.ts     Analysis parser + validation
  identify.ts     Product name parser
  scoring.ts      Deterministic scoring engine
  cors.ts         Origin validation
  *.test.ts       24 tests

src/
  pages/
    Scan.tsx              Barcode + duplicate detection
    IngredientsPhoto.tsx  Φωτογραφία ετικέτας
    IngredientsReview.tsx OCR review + edit
    ProductPhoto.tsx      Φωτογραφία προϊόντος + identify
    AnalysisRun.tsx       Τρέχει την ανάλυση
    Product.tsx           Αποτέλεσμα + score
    History.tsx           Ιστορικό + διαγραφή
  services/
    ocrClient.ts
    analysisClient.ts
    identifyClient.ts
    ingredientNormalizer.ts
    historyService.ts
  config.ts
  types.ts
```

---

## 4. Worker endpoints

| Method | Path | Σκοπός |
|---|---|---|
| GET | `/api/health` | Health check |
| POST | `/api/ocr/extract` | OCR ετικέτας συστατικών |
| POST | `/api/product/identify` | Όνομα και brand από φωτογραφία |
| POST | `/api/analysis/run` | AI ανάλυση + score |
| POST | `/api/products/:id/chat` | Placeholder |

---

## 5. Ροή χρήστη

```
Σάρωση barcode
      ↓
Έλεγχος ιστορικού
      ↓
Αν υπάρχει → "Το προϊόν υπάρχει ήδη"
              [Προβολή] [Νέα καταχώρηση] [Άλλο προϊόν]
      ↓
Φωτογραφία συστατικών
      ↓
POST /api/ocr/extract
      ↓
Guards: repetition, nutrition, heading-only, ingredient-list
      ↓
OCR Review (editable)
      ↓
Φωτογραφία προϊόντος
      ↓
POST /api/product/identify (best-effort)
      ↓
Αποθήκευση στο localStorage
      ↓
POST /api/analysis/run
      ↓
Deterministic scoring στον Worker
      ↓
Product page: score, counters, findings, breakdown
```

---

## 6. Contracts

### OCR response

```ts
{
  rawText: string;
  confidence: number;
  labelType: "ingredients" | "nutrition" | "mixed" | "unknown";
  unreadableSegments: string[];
}
```

### Analysis request

```ts
{
  productId: string;
  barcode: string;
  productType: "food" | "cosmetic" | "unknown";
  confirmedIngredientText: string;
  normalizedIngredients: unknown[];
  ocrConfidence: number;   // ΟΧΙ extractionConfidence
}
```

### Analysis response

```ts
{
  productType, summary, positives, attentionItems,
  potentialAllergens, ingredientFindings[],
  insufficientDataReasons, confidence,
  score: ScoreBreakdown
}
```

---

## 7. Λυμένα προβλήματα

Μην τα ξαναλύσεις. Είναι ήδη σε παραγωγή.

| Πρόβλημα | Λύση |
|---|---|
| `llama-3.1-8b-instruct` deprecated | Άλλαξε σε `llama-4-scout-17b-16e-instruct` |
| `gpt-oss-120b` reasoning loop | Καταναλώνει tokens στο `reasoning`, `content: null` |
| `prompt` δεν υποστηρίζεται | Chat models θέλουν `messages: [...]` |
| Response σε `choices[0].message.content` | `extractModelText()` το διαβάζει |
| Markdown code fences | `stripCodeFences()` |
| Moondream nested `result.answer` | Bounded recursion depth 4 |
| Repetition loop (`"citric juice"` ×100) | `hasRepetitionLoop()`, max 8 επαναλήψεις |
| Hallucination από heading-only OCR | `isHeadingOnlyText()` + `looksLikeIngredientList()` |
| Διατροφικοί πίνακες ως συστατικά | `isNutritionTable()`, 2+ markers |
| `extractionConfidence` vs `ocrConfidence` | Ενοποιήθηκε σε `ocrConfidence` |
| Λείπει `productType` στο request | Προστέθηκε στο `ProductAnalysisRecord` |
| Score πάντα `null` | Threshold από 0.7 σε 0.4, αφαιρέθηκαν blockers |
| Μόνο 3 findings | Ένα κακό finding ακύρωνε όλη την ανάλυση |
| `Aqua` και `Water` διπλά | Alias groups + canonical names |
| `330 mL`, `ΧΩΡΙΖ` ως συστατικά | Noise filtering στο normalizer |
| Ξύδι ως `cosmetic` | `detectProductType()` override |
| localStorage γεμίζει | Max 20 items, εικόνες 800px @ 0.55 |
| Δεν υπάρχει διαγραφή | Delete ανά item + clear all |
| Timeout 30s | Αυξήθηκε σε 90s |

---

## 8. Guards στον Worker

Εκτελούνται με σειρά στο `/api/ocr/extract`:

1. `hasRepetitionLoop()` — model loop
2. `isUnreadableModelOutput()` — unreadable marker
3. `parseOcrModelOutput()` — invalid JSON
4. `labelType === "nutrition"` — από το μοντέλο
5. `isNutritionTable()` — από το κείμενο
6. `isHeadingOnlyText()` — μόνο headings
7. `looksLikeIngredientList()` — δεν μοιάζει με λίστα
8. `looksLikeSyntheticNutritionText()` — hallucinated βιταμίνες

Στο `/api/analysis/run` επαναλαμβάνονται τα 5-8 πριν την κλήση AI.

---

## 9. Scoring

Deterministic στον Worker. Το μοντέλο **δεν** επιστρέφει score.

```
Ξεκινά από 100
attention        -8 πόντοι
high_attention  -15 πόντοι
Χωρίς evidence   μισοί πόντοι
Max 6 deductions
Bonus +3 για 2+ positives
Bonus +5 για μηδέν αλλεργιογόνα
```

Bands: 85+ excellent, 70+ good, 50+ moderate, 30+ attention, κάτω high_attention.

Επιστρέφει `null` όταν:
- Κείμενο κάτω από 15 χαρακτήρες
- OCR confidence κάτω από 0.4
- Μηδέν findings

---

## 10. Απόδοση

| Βήμα | Χρόνος |
|---|---|
| OCR επιτυχές | 1-4s |
| OCR repetition loop | 10-12s (κόβεται) |
| Product identify | ~800ms |
| Analysis | 5-13s |

---

## 11. Γνωστά όρια

**Confidence σταθερό στο 0.5.** Το Moondream επιστρέφει plain text, οπότε
ο parser βάζει conservative fallback. Δεν είναι βαθμονομημένη πιθανότητα.

**Chat είναι placeholder.** Επιστρέφει σταθερό μήνυμα. Χρειάζεται
server-side product context.

**Μόνο ελληνικά.** Hardcoded strings, χωρίς i18n.

**localStorage.** Όριο ~5MB, μέχρι 20 σαρώσεις.

**Το OCR δυσκολεύεται** με ανάποδες φωτογραφίες, θολές εικόνες και
πολύ μικρά γράμματα. Οι χρήστες συχνά φωτογραφίζουν διατροφικό πίνακα.

**Comparison** δεν υλοποιήθηκε. Δείχνει «Δεν υπάρχουν αρκετά συγκρίσιμα προϊόντα».

---

## 12. Επόμενα βήματα

1. **Δίγλωσσο** — `src/i18n/el.ts` και `en.ts`
2. **Chat με context** — server-side product data, όχι από browser
3. **Onboarding φωτογραφίας** — παράδειγμα σωστής λήψης
4. **D1 migration** — από localStorage σε database
5. **Ingredient scoring** — βαθμολογία ανά συστατικό
6. **Comparison** — μεταξύ προϊόντων ίδιας κατηγορίας
7. **Rate limiting** — τα AI endpoints είναι δημόσια

---

## 13. Εντολές

### Ανάπτυξη

```powershell
npm run dev
npx wrangler dev --port 8787
```

### Έλεγχοι

```powershell
npm run worker:typecheck
npm run worker:test      # 24 tests
npm run build
```

### Deployment

```powershell
npx wrangler deploy      # Worker
git push origin main     # Frontend
```

### Logs

```powershell
npx wrangler tail greenlens-ocr
```

---

## 14. Κανόνες ασφάλειας

Μην τα παραβιάσεις σε μελλοντικές αλλαγές.

- Το score υπολογίζεται **μόνο** στον Worker
- Κάθε αφαίρεση πόντων έχει ορατή αιτιολόγηση
- Χωρίς ιατρικές συμβουλές
- Χωρίς ισχυρισμούς τοξικότητας χωρίς τεκμήριο
- Χωρίς επινοημένα sourceUrl
- Ανεπαρκή δεδομένα δίνουν `null`, όχι μαντεψιά
- Το OCR Review παραμένει υποχρεωτικό
- Χωρίς logging εικόνων ή πλήρους κειμένου
- Χωρίς secrets σε `VITE_` variables

---

## 15. Περιβάλλον

**Cloudflare Pages:**

```
VITE_API_BASE_URL = https://greenlens-ocr.nkourouklis.workers.dev
```

Χρειάζεται και σε Production και σε Preview.

**CORS** (`worker/cors.ts`):

```
http://localhost:5173
http://127.0.0.1:5173
https://greenlens.pages.dev
https://*.greenlens.pages.dev
```
