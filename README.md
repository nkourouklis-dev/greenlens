# GreenLens

GreenLens is a mobile-first Progressive Web App that helps users evaluate food and cosmetic products.

## Features

- Barcode scanning/input flow
- Product photo capture and ingredient photo capture
- OCR ingredient extraction endpoint and editable ingredient text
- AI-powered ingredient analysis with health/safety scoring
- Shared product search
- AI chatbot for product questions
- Responsive mobile-first UI
- PWA manifest + service worker
- Cloudflare Workers API, D1 and R2 bindings, and Cloudflare Pages-ready frontend

## Stack

- React + TypeScript frontend (Vite)
- Cloudflare Pages deployment target (`dist`)
- Cloudflare Worker API (`/worker/index.ts`)
- Cloudflare D1 (`DB`) for shared product metadata
- Cloudflare R2 (`PRODUCT_IMAGES`) for image storage

## Local development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Cloudflare deployment notes

- Configure D1 and R2 bindings in `wrangler.toml`
- Deploy frontend (`dist`) to Cloudflare Pages
- Deploy Worker using Wrangler (`npx wrangler deploy worker/index.ts`)
