# WordWeave frontend

Nuxt 4 SSR learner and administrator application. Current implementation: accepted M002, including UI31 provider-based model management and the featured-trial word-meaning correction (QA38 closeout). See the [accepted delivery handoff](../.planning/milestones/M002/handoffs/verification.md) for scope and retained limitations. This package is an independent Docker build context. Node 24 and the locked pnpm dependencies are required.

## Development and checks

```sh
cp .env.example .env
pnpm install --frozen-lockfile
pnpm dev
pnpm typecheck
pnpm lint
pnpm lint:boundaries
pnpm format:check
pnpm test
pnpm test:e2e --workers=1
pnpm build
```

The browser uses same-origin `/api/v1`. SSR uses private `NUXT_BACKEND_INTERNAL_ORIGIN`; public runtime configuration is empty. Nuxt's development proxy mirrors the production Nginx route. Production must route `/api/v1` directly to Go, including streaming responses, without buffering or automatic write retries. Deploy migrations, backend and frontend as a compatible M002 set. Refresh existing tabs during maintenance; never serve M002 review APIs to M001 frontend code. Production proxy/CSP, Linux deployment and real devices require independent verification.

`tests/e2e/README.md` maps inherited M001 requirements to the current executable regression suite. Historical M001 specifications remain at their original paths; the Playwright configuration selects the M002 suite explicitly. Frozen `tests/contracts/v1.4` envelopes retain their hashes; M002 tests add required profile/growth fields in synthetic adapters rather than rewriting those fixtures.

## Design sources

`node scripts/sync-design.mjs` imports the approved UI31 copy, theme, Lucide resources and two fixed public samples from the sibling planning directory, then formats generated files deterministically. This is a development-only conversion step; production does not import `.planning`. See `design/source-manifest.json` for input hashes. Operational prices, rewards, card inventory and plan quotas are never imported from prototype fixtures. Production semantics and accessibility additions live in `app/assets/css/application.css`.

DTO schemas reject unknown/invalid fields; mappers construct application models. Pages consume runtime stores, not transport objects. Capability tokens stay in the private token vault. Review inputs/navigation use account/session/attempt-scoped IndexedDB; answers are never sent before explicit submission. Server terminal state supersedes local drafts, and comparison answers remain memory-only. Base and trial quotas use independent backend projections.

## Deterministic integration

`tests/integration/m002-local-stack.py` starts a **disposable local PostgreSQL 18** database, migrates it, creates a synthetic administrator and starts Go on 38081. It uses the local Homebrew PostgreSQL binary directory and Go 1.26.7. Generated secrets remain in a mode-0600 file inside a private temporary directory. Do not use this harness against UAT or production.

After `pnpm build`:

```sh
python3 tests/integration/m002-local-stack.py
NUXT_BACKEND_INTERNAL_ORIGIN=http://127.0.0.1:38081 NITRO_HOST=127.0.0.1 NITRO_PORT=3331 node .output/server/index.mjs
# In another terminal:
node tests/integration/m002-real-smoke.mjs
# Stop the frontend process, then:
python3 tests/integration/m002-local-stack.py stop
```

The smoke script supplies a loopback-only provider on 38082 and a temporary same-origin proxy on 3301. It performs actual admin configuration/preview/publication, visitor generation, registration/claim, title editing and review submission. It seeds an already effective check-in rule **only in that disposable database** so activation can be checked without waiting until 04:00. It never calls a real AI service or imports operational defaults. Raw passwords and tokens must not be included in evidence.

For the three-engine matrix, serve the built frontend on 3330 against the contract mock on 38080 and run `node tests/integration/m002-mock-proxy.mjs` on 3300; then run `node tests/integration/m002-browser-matrix.mjs`. Browser installations use the locked Playwright version. The matrix checks nine widths, welcome toast frames/layering, representative private routes and serious/critical Axe findings. It is not human screen-reader or mobile keyboard validation.
