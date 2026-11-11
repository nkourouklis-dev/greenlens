# GreenLens — Architecture, History and Working Agreements

Single source of truth for any Claude Code session working on this repo. Snapshot date: **2026-11-11**
(HEAD `ac0cee6`, 169 commits, first commit 2026-08-28). When this file and the code disagree, the code wins —
then fix this file. Older Greek docs (`docs/archive/`) are historical snapshots
from 6 and 13 September; this file supersedes them.

---

## 1. What GreenLens is

A mobile-first PWA that scans a food, drink or cosmetic product: barcode → product lookup → photos of the back
label → OCR → deterministic scoring (0–100) → explanation in Greek. Shoppers see a score, the reasons, and the
nutrition table. A password-protected admin side (PIM) curates the shared catalogue.

Product principles the owner has stated (respect them):
- **Zero unexpected spend.** Paid scans are hard-blocked at 100 % of budget, warning at 80 %. Fail open only if the
  counter itself breaks.
- **The score must be explainable and deterministic.** Never take a score or an ingredient name/description from
  free model text. Rules + curated knowledge decide; the model only extracts.
- **User-visible text is Greek**; code, comments and commits are English.
- The owner is more comfortable with questions in Greek with a concrete numeric example.
- Ask before deploys, remote migrations and anything destructive.

## 2. Topology

```
iPhone / browser ──► https://greenlens.stoaops.com   (Cloudflare Pages, React SPA, auto-deploys on push to main)
        │                    (legacy: greenlens.pages.dev + *.greenlens.pages.dev, still allowed)
        └─ fetch ─► https://greenlens-ocr.nkourouklis.workers.dev   (Worker "greenlens-ocr", worker/index.ts)
                       ├─ D1  binding DB      database greenlens-db  (migrations/0001…0017)
                       ├─ R2  binding PHOTOS  bucket greenlens-photos (label + front-of-pack photos)
                       ├─ AI  binding AI      Cloudflare Workers AI (text model + vision model)
                       ├─ Azure AI Vision (Read OCR) over REST — resource "greenlens-ai", swedencentral
                       └─ Open Food Facts / Open Beauty Facts public APIs (cached in D1)
```

- Frontend → API URL comes from `VITE_API_BASE_URL` (`.env.production`, committed, value = the workers.dev URL).
  In `vite dev` it is hard-wired to `http://127.0.0.1:8787` (`src/config.ts`) — a phone opening the dev server
  cannot reach that.
- **CORS is an allow-list** in `worker/cors.ts` (`isAllowedOrigin`): `localhost:5173`, `greenlens.stoaops.com`,
  `greenlens.pages.dev`, `*.greenlens.pages.dev`. Anything else gets 403 and the browser reports a plain network
  error ("Δεν ήταν δυνατή η σύνδεση…"). **A new frontend host means editing cors.ts and `wrangler deploy`.**
- `wrangler.jsonc`: name `greenlens-ocr`, main `worker/index.ts`, `compatibility_date` 2026-08-28, observability on
  (100 % sampling). No routes/custom domain on the Worker itself (workers.dev only).

### Secrets and vars (Worker)
| Name | Kind | Purpose |
|---|---|---|
| `AZURE_VISION_ENDPOINT`, `AZURE_VISION_KEY` | secret | Azure Read OCR. Missing → typed error `ocr_not_configured`, fails fast |
| `AZURE_VISION_LANGUAGE` | optional | Left unset on purpose (labels mix Greek and Latin) |
| `ADMIN_PASSWORD` | secret | Gate for every `/api/admin/*` route; unset → deny everyone (fails closed) |
| `AZURE_OCR_MONTHLY_BUDGET` | optional var | Default 5000 transactions; hard-block at 100 % |
| `WORKERS_AI_DAILY_BUDGET` | optional var | Proxy budget, same hard-block |

Set with `npx wrangler secret put <NAME>`; never commit values.

## 3. Deploy and quality gates

- **Worker:** `npx wrangler deploy` from repo root, manual.
- **Frontend:** Cloudflare Pages is connected to the GitHub repo; `git push origin main` deploys. Never use
  `wrangler pages deploy`.
- **D1 migrations:** `npx wrangler d1 migrations apply greenlens-db --remote` (ask the owner first). 0013–0016 were
  applied remotely on 2026-09-29. **Verify 0017 (`products.brand`) is applied remotely** before relying on it.
- **Before any deploy run:** `npm run worker:typecheck`, `npm run worker:test` (526/526 on 2026-11-03),
  `npm run build`, `npm run lint` (oxlint; a few pre-existing `set-state-in-effect` warnings are known).
  CI (`.github/workflows/ci.yml`, Node 24) runs the same on push/PR but **does not deploy**. Stop and report on a
  regression instead of deploying anyway.
- Tests use `node:test` via `tsx --test worker/*.test.ts`; Node 24 is required because a test replays every
  migration through `node:sqlite`. There are golden-scan fixtures (`worker/fixtures`, `goldenScans.test.ts`) —
  scoring changes must keep them green or change them deliberately.

## 4. Repository map

```
src/                 React 19 + Vite 8 + TS 6 + Tailwind 4 + react-router 7 + @zxing/browser + lucide-react
  pages/             Home, Scan, AddProduct, ProductPhoto, IngredientsPhoto, NutritionPhoto, IngredientsReview,
                     AnalysisRun, Product, History, Admin{Capture,Products,ProductDetail,ScanFailures,Usage}
  components/        CameraScreen, PhotoCapture, ScoreSummaryCard, ScoreBreakdownPanel, NutritionFactsTable,
                     Ingredient/Nutrition/ChemicalCard, AllergenNoticeCard, SectionDrawer, ShareScanButton,
                     Admin* (assistant panel, photos, versions), MobileNav (floating pill nav), AdminGate
  contexts/          CameraContext (ONE getUserMedia stream for the whole session; capture, crop, downscale)
  services/          analysisClient, ocrClient, identifyClient, adminClient(s), historyService, analysisJobs,
                     catalogueRefresh, errors (UserFacingError + network/timeout classification)
  hooks/ utils/ data/  useBarcodeScanner (3 consecutive matching reads), usePhotoFilePicker, scoreBand, …
worker/              ~46k lines incl. tests. index.ts (~6.9k lines) is the router + orchestration; the logic is in modules:
  routing/config     cors, usage (budgets), stageTiming (per-stage logs), background (ctx.waitUntil work)
  OCR / extraction   azureOcr, ocr, ingredientText, nutritionPanel(+Columns/Interleaved/Unitless), nutritionExtraction,
                     nutritionVision (admin-only vision fallback), contentCategory, contentGate, contentFilter
  scoring            scoring (ingredient rules), nutriScore, foodScore, nutritionThresholds, nutritionScoring,
                     chemicalScoring, alcohol, plainWater, ingredientShares (fruit/veg share), labelClaims,
                     allergens, scoreExplanation, rescore
  insights           ingredientInsights, nutritionInsights, chemicalInsights, ingredientKnowledge (D1 lookup)
  persistence        productCache, productLookup (+OFF cache), productVersions, productPhotos, ocrLog,
                     scanFailures, adminProducts, adminAssistant, identify
migrations/          0001–0017 D1 SQL
docs/                this file, BRAND-GUIDE, PROJECT-STRUCTURE (public/ assets), archive/ (old Greek snapshots)
data/                greek-products-seed.sql (manual D1 seed, not a migration)
```

### Frontend routes
`/` Home · `/scan` · `/add-product` · `/product-photo` · `/ingredients-photo` · `/nutrition-photo` ·
`/ingredients-review/:id` · `/product/:id` · `/product/:id/analysis` · `/history` · `/admin` (PIM list) ·
`/admin/capture` · admin product detail, scan-failures and usage pages (see `src/App.tsx`).

### Worker endpoints
Public: `GET /api/health`, `POST /api/product/identify` (multipart; barcode lookup, then front-photo brand/name),
`POST /api/ocr/extract` (multipart; Azure OCR, 5 MB image limit), `POST /api/analysis/run` (JSON; classify →
extract → score → insights; cached per barcode; can run in the background so the next scan starts immediately).
Admin (header `X-Admin-Password`): `/api/admin/products` (+ detail, edit, versions, restore, analyze, rescore,
photos), `/api/admin/photos/file`, `/api/admin/scan-failures`, `/api/admin/usage`,
`/api/admin/products/rescore-unverified`, `/api/admin/products/backfill-brands`, `/api/admin/assist`.
Every response carries `x-request-id`; `wrangler tail` plus stage-timing lines reassemble a whole scan.

## 5. Core flows

**Consumer scan:** barcode (native `BarcodeDetector` first, ZXing fallback, decode from downscaled frames, 3 matching
reads) → `identify` → D1 `products` cache hit returns the stored result with **no photography at all** → otherwise
front photo (identification + catalogue thumbnail) → one back-label photo (ingredients, nutrition, or both) →
`ocr/extract` → review screen → `analysis/run` → product page. The review screen (`src/utils/reviewState.ts`) shows exactly one verdict (ready / incomplete / table only / nothing usable) with one next step; the category it implies is what the analysis is asked for, and an override is still possible. Verdicts are pinned against real production failures in `worker/fixtures/scanFailures.json`. Camera permission is
requested once per session. Captures are downscaled to ≤ 2400 px long side, JPEG 0.88 (≈ 1 MB). A gallery picker
is available wherever a photo is requested. Results carry a share action.

**Ingredient analysis has no language model** (`deterministicAnalysis.ts`, 2026-11-07): names come from the label list, ranking from curated rules + `ingredient_knowledge`, summary is a fixed Greek sentence. Catalogue copy (summary/verdict) is drafted after the response via `afterResponse`. Works for food and cosmetic (INCI) lists. Nutrition-only and chemical paths still call Workers AI.

**Content categories** (`contentCategory.ts`): a printed "Συστατικά/Ingredients" heading always routes to `ingredients` (which reads list + table together via `analyzeFoodLabels`); otherwise keyword heuristic, AI fallback, user override →
`ingredients` | `nutrition` | `chemical_composition` | `unknown`. Each has its own extraction/scoring/insights path
(water mineral analysis must not be scored with cosmetic-ingredient logic). Content gates reject text with no real
measurements/ingredients and log the refusal to `scan_failures`.

**Scoring** (deterministic; the model never sets points):
- Cosmetics/ingredients: start at 100, subtract curated rule penalties from `ingredient_knowledge`
  (`rule_severity`, `penalty_points`, `rule_group`, `bulk_weighted`), bonus only when no deductions apply.
  EU allergens are informational, never punitive. Natural sugars (dates, fruit, honey, lactose) are not scored as
  added sugar; fruit sugars discounted using declared fruit percentages.
- **Foods** (`foodScore.ts`): `60 % Nutri-Score (2023 algorithm, nutriScore.ts) + 40 % ingredient score`; capped at
  **65** while nutrition is missing ("partially evaluated"), except plain water (`plainWater.ts`) and non-foods.
  Nutrition evidence order: label > Open Food Facts > none, one whole source at a time. Alcohol: visible graded
  deduction `15 + 2 × ABV` (cap 80), notes only when ABV is unreadable or ≤ 0.5 %. A nutrition table that fails the
  plausibility check yields no score and asks for a retake — model-copied amounts are never scored.
- Pack claims (`labelClaims.ts`): "no added sugar / gluten-free / lactose-free / no preservatives-colours / vegan"
  become positives; a gluten-free claim removes the gluten allergen notice.
- A stored score can be recomputed without re-reading the photo (`rescore.ts`; admin button, plus a bulk rescore of
  non-verified products that keeps their status).

**PIM / catalogue:** `products` row per barcode (status `ai_generated` | `verified`, brand stored apart from name,
shared photos in R2 with per-barcode slots), `product_versions` append-only history with restore, admin assistant
that drafts summary/highlights/watch-outs (also auto-applied once on a brand-new product, never sets `verified`,
refreshes by itself unless a person wrote it). Raw OCR per barcode in `product_ocr`; refusals in `scan_failures`;
spend in `usage_counters`; OFF responses cached in `openfoodfacts_cache` (schema v2).

## 6. D1 schema (migrations)

| # | Content |
|---|---|
| 0001–0002 | `ingredient_knowledge`/`ingredient_aliases`, `nutrient_knowledge`/`nutrient_aliases` |
| 0003 | Open Food Facts additives taxonomy import (669 entries, E-numbers) |
| 0004–0005 | `products` (shared barcode cache), capture flow: `product_photos`, draft status, admin |
| 0006 | Scoring rule columns on `ingredient_knowledge` |
| 0007–0008 | `product_versions`; Greek alias fix |
| 0009–0011 | OFF cache, `scan_failures`, `usage_counters` |
| 0012, 0014–0016 | Knowledge enrichment (E-numbers, plain-language descriptions, sugar aliases, cosmetic dyes, fixes) |
| 0013 | `product_ocr` |
| 0017 | `products.brand` |

Migrations are append-only. Never edit an applied one; add the next number.

## 7. History and milestones

**Phase 1 — Prototype (2026-08-28 → 08-31).** Vite/React app, ZXing barcode scanning, product and ingredient photo
flows, Cloudflare Worker with OCR then AI analysis, localStorage history. Contracts between OCR and analysis aligned
and scoring moved into the Worker; ingredient dedup/alias merging; branding and social metadata (08-31).

**Phase 2 — Reliability of reading (09-01 → 09-07).** Ingredient isolation and validation, barcode lookup
(Open Food Facts), insights and executive summary UI, design-token dark theme, persistent camera stream via
`CameraContext`, capture/preview crop fixes, higher camera resolution, code-splitting, opt-in `?debug=1` eruda console.
**09-07: analysis split into ingredients / nutrition / chemical_composition paths**; EU allergens unified as one
information banner and no longer scored.

**Phase 3 — Knowledge base in D1 and the shared catalogue (09-08 → 09-10).** D1 added; knowledge schema seeded;
OFF additives imported; the chat section removed; products cache so a barcode is analysed once for everyone; admin
capture mode with R2 photos and a PIM UI. `mvp-v1` tag at `96c9d1d` (09-08). **09-09: scores made deterministic
from rules, not model severities.** 09-10: rescore on admin save, version history, shared photos, admin assistant.

**Phase 4 — Hardening and shared scoring core (09-13 → 09-16).** CI added (09-13). One scoring core for all three
categories; mixed labels (ingredients + nutrition) scored together; names/descriptions only from label + knowledge;
OFF lookups cached; rescore without re-reading; `scan_failures` log; **usage counters, 80 % alarm and hard budget
stop (09-14)**; 09-16 one combined score per product, graded alcohol deduction, nutrition tables whose values arrive
one row late.

**Phase 5 — GreenPoint-style restyle and speed (09-22 → 09-27).** Light theme restyle (photo hero, floating pill nav,
colored status dots), camera permission kept warm all session, natural-vs-added sugar fix, auto catalogue copy for new
products (09-22). Per-stage timing logs, background work via `waitUntil`, background analysis so the next scan can
start, findings capped at 12 attention-first (09-24). **09-26: unified Nutri-Score-based food score** (60/40, cap 65),
full-screen camera layout everywhere, catalogue copy that refreshes itself. Share text/link polish (09-27).

**Phase 6 — OCR fidelity and operations (09-29 → 10-16).** Unitless nutrition tables, pack claims as positives, raw OCR
log, admin vision fallback for unreadable tables, 137 new ingredient descriptions (09-29). **10-01 Azure outage:** the
free trial expired and Azure answered 401 like a bad key; upgraded to pay-as-you-go; Worker now returns typed OCR
error codes with Greek messages. Fruit share from declared percentages, Nutri-Score sign clarity, nutrition tables
interleaved with ingredient text, brand read from the front photo and stored separately, cleaner result screen,
bulk rescore, plain-water grading (10-03 → 10-06). Re-registering an existing product goes to the photo flow (10-09);
nutrition step skipped for non-foods with vision fallback (10-10); barcode decoding from downscaled frames with native
`BarcodeDetector` first (10-16).

**Phase 7 — Custom domain (11-03).** Frontend moved to `greenlens.stoaops.com`. Scans failed with "Δεν ήταν δυνατή η
σύνδεση με την υπηρεσία ανάλυσης" because the Worker's CORS allow-list only knew `pages.dev` (403 → browser network
error). Fixed in `c0fb453` and the Worker redeployed (version `afa14c2a`). Same day: captured photos downscaled, and
client errors now distinguish offline / timeout / connection failure and log server status codes (`88ab4f7`).

**Phase 8 — Speed, routing and mobile UX (11-07).** Ingredient analysis no longer calls a model (`deterministicAnalysis.ts`); catalogue copy is drafted after the response; a printed "Συστατικά" heading always routes to the ingredients path; the ingredient block ends at a garbled nutrition heading, a net-weight line or any kJ row. Review screen rebuilt as a single-verdict state machine; `viewport-fit=cover` with a status-bar strip, nav hidden while typing, 16 px fields; the analysis wait shows elapsed time and survives going offline; the camera stream is re-acquired after iOS ends it.

**Phase 9 — Domain, SEO and visual unification (11-07 → 11-09).** Share links use the current domain and never show
broken/empty copy (`b858bb5`); camera stream is paused rather than closed between scans (`82e8af4`); new home hero,
history and flow screens in one green visual language (`a181ce7`); canonical domain, JSON-LD, new OG image and Stoa Ops
credit (`ac0cee6`). Uncommitted at 11-11: the Product page cards (ExecutiveSummaryCard, ScoreBreakdownPanel, summary
section) being moved from the old dark slate classes to the light design tokens.

## 8. Known open items and decisions pending

- Azure resource `greenlens-ai`: confirm pricing tier is F0; if not, lower `AZURE_OCR_MONTHLY_BUDGET`. A $1 budget
  alert exists but only notifies.
- **Open-photo disclosure (deferred 09-14):** users are never told their label photo is stored, shown to other
  users scanning the same barcode, and sent to Azure. Fix before any release beyond friends.
- Cloudflare usage notifications and an Azure budget alarm must be set by the owner in the dashboards.
- Combined multi-photo score (all PIM photos of a barcode, "not taken into account" notice, "add the other photo"
  merge) was proposed 09-16 and is **not built**; ABV curve and merge rules were decided, the rest awaits answers.
- Model choice: the Worker runs Workers AI (llama-4-scout text, moondream vision). Moving to Claude was raised
  (09-22), answer "not yet". No decision.
- Dead code: the older threshold paths (`scoreNutrition`, panel branch of `scoreInterpretation`,
  `rescoreIngredientsResult`) are exported and tested but unused by the pipeline.
- Knowledge coverage: many cosmetic and simple-food cards say "no verified description"; an admin report of
  unmatched ingredient names, junk names becoming cards, and the 26 EU fragrance allergens (only 11 have rules) are
  open. Pure olive oils grade C vs OFF's B (pinned in `nutriScore.test.ts` KNOWN_MISMATCHES).
- The vision fallback for nutrition tables has not been verified on a real photo. Stored scores never update on
  their own; re-run "Ανάλυση"/"Επανυπολογισμός" per product after scoring changes.
- No rate limiting on the public endpoints was recorded as of 09-14 (budgets are the only guard). Re-check before
  widening the audience.

## 9. Working agreements for Claude Code sessions

1. Read this file, then the code, before changing anything. Treat file names above as pointers and verify them.
2. Scoring changes go through `scoreFood` / the shared core; no per-product special cases. Add or update golden tests.
3. Never put model-written Greek into an ingredient's name or description; never hardcode regulatory limits in
   the AI prompts' favour — rules live in code and D1.
4. Anything that can cause unbounded third-party spend defaults to a hard cap.
5. Commit style: conventional (`feat|fix|perf|chore|docs|test(scope): …`), English, ending with the attribution line
   the harness specifies. Do not push, deploy, or apply remote migrations without the owner's go-ahead unless they
   asked for it in the same request.
6. After a change: tests + typecheck + build + lint, then Worker deploy if `worker/` or `migrations/` changed, then push.
7. Talk to the owner in Greek; keep code, comments and commits in English.
