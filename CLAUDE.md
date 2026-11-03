# GreenLens

Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) first: topology, flows, scoring, schema, history, open items and working agreements. If it disagrees with the code, the code wins; then fix the doc.

Essentials:
- Talk to the owner in Greek; code, comments and commits in English.
- Before any deploy: `npm run worker:typecheck`, `npm run worker:test`, `npm run build`, `npm run lint`.
- Worker: `npx wrangler deploy` (manual). Frontend: `git push origin main` (Cloudflare Pages). Ask before deploys, remote migrations and anything destructive.
- A new frontend host must be added to `worker/cors.ts`, then redeploy the Worker.
- Scoring is deterministic and goes through `scoreFood`; never take names, descriptions or points from free model text.
- Anything that could cause unbounded third-party spend gets a hard cap by default.
