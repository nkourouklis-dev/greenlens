# GreenLens — Δομή `/public` (Vite + React + Cloudflare Pages)

```
public/
├── favicon.svg                     # browser tab, SVG (μοντέρνα browsers)
├── favicon.ico                     # fallback για παλιότερα browsers/OS (32×32 multi-size)
├── apple-touch-icon.png            # 180×180 — iOS home screen
├── manifest.webmanifest            # PWA manifest
├── robots.txt
├── _headers                        # Cloudflare Pages — custom response headers
├── _redirects                      # Cloudflare Pages — SPA fallback (/* /index.html 200) αν χρειαστεί
│
├── icons/                          # PWA / OS icons — PNG raster εξαγωγές
│   ├── favicon-32.png              # 32×32 — browser tab
│   ├── favicon-192.png             # 192×192 — manifest icon (purpose: any)
│   ├── favicon-512.png             # 512×512 — manifest icon (purpose: any + maskable)
│   ├── apple-touch-icon.png        # 180×180 — iOS home screen, χωρίς διαφάνεια
│   └── icon-monochrome.svg         # αντίγραφο του brand mark, για shortcut icons κ.λπ.
│
├── og/                             # Social share images (raster, όχι SVG — τα OG scrapers δεν κάνουν render SVG)
│   └── og-image.png                # 1200×630 — OG/Twitter card
│
└── brand/                          # πηγαία vector assets — ΔΕΝ φορτώνονται απευθείας από το app,
    │                                # κρατιούνται εδώ ως single source of truth για exports
    ├── logo-mark-primary.svg
    ├── logo-mark-monochrome.svg
    ├── logo-mark-dark-bg.svg
    ├── logo-lockup-light.svg
    ├── logo-lockup-dark.svg
    └── app-icon-maskable-512.svg
```

## Naming convention
- **kebab-case παντού**, χωρίς κενά, χωρίς κεφαλαία: `icon-512-maskable.png`, όχι `Icon_512_Maskable.PNG`.
- Μέγεθος πάντα στο filename όπου υπάρχουν πολλαπλά exports του ίδιου asset: `icon-192.png`, `icon-512.png`.
- `purpose` του icon στο filename όταν διαφέρει: `-maskable` suffix (βλ. πάνω) ώστε να ξεχωρίζει άμεσα από το `any`.
- Variants βάσει φόντου: suffix `-light` / `-dark`, όχι `-white` / `-black` (το brand δεν έχει καθαρό μαύρο).
- Raster (PNG/JPG) πηγαίνουν σε υποφακέλους ανά χρήση (`icons/`, `og/`), vector sources (SVG) που δεν καταναλώνονται απευθείας από runtime πηγαίνουν σε `brand/`.
- Ό,τι έχει version cache-busting (π.χ. hashed assets από το build) **δεν** μπαίνει σε `/public` — αυτό είναι μόνο για static, μη-hashed αρχεία που χρειάζονται σταθερό, προβλέψιμο path (π.χ. `manifest.webmanifest`, icons που αναφέρονται εκτός app, όπως social scrapers).

## Cloudflare Pages σημειώσεις
- Το `_headers` ορίζει `Content-Type: application/manifest+json` για το manifest και μακρόχρονο caching για `icons/*` (immutable — αν αλλάξεις ένα icon, άλλαξε filename αντί να το αντικαταστήσεις in-place, ώστε να μην κολλήσει σε CDN cache).
- Αν το React Router κάνει client-side routing, πρόσθεσε `_redirects` με `/*    /index.html   200` ώστε τα deep links να μη γυρνάνε 404 σε refresh.
- Το `manifest.webmanifest` χρησιμοποιεί extension `.webmanifest` (όχι `.json`) — το Vite το σερβίρει ως στατικό αρχείο απευθείας από `/public` χωρίς αλλαγές.
