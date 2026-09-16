# WordWeave frontend

Nuxt 4 SSR application for the learner and administrator web experience. It is an independent package, Docker build context, and deployment unit.

## Development

```sh
corepack enable
cp .env.example .env
pnpm install --frozen-lockfile
pnpm dev
```

The browser calls the same-origin `/api/v1` API. SSR uses the private `NUXT_BACKEND_INTERNAL_ORIGIN` value and never exposes it to the browser payload.

## Quality checks

```sh
pnpm typecheck
pnpm lint
pnpm lint:boundaries
pnpm test
pnpm test:e2e
pnpm build
```

Use Node 24 LTS. For direct local development, point `NUXT_BACKEND_INTERNAL_ORIGIN` at a running backend; Nuxt's development-only same-origin proxy mirrors the production Nginx route.

API DTOs are validated at runtime and mapped into application models before they can enter Nuxt state or Vue rendering. Pages and components must not import transport schemas or raw DTO types.

## API v1.4 compatibility (CR-029–033)

Admin user detail GET and plan-change PUT both require the complete v1.4 user,
including `generation_quota`. The adapter rejects missing or malformed quotas;
it never treats missing data as unlimited. Search summaries are unchanged.

`tests/contracts/v1.4/manifest.json` is the single raw-fixture manifest. Its seven
JSON envelopes are byte-identical copies of the backend v1.4 contract fixtures,
with SHA-256 checks in `admin-quota-contract.test.ts`. This package does not read
outside its own Docker build context. Sync the complete manifest and fixtures
together when the approved API changes.

Deploy the backend and frontend v1.4 images as a pair behind the existing
same-origin proxy. A v1.3/v1.4 mixed deployment intentionally fails strict parsing.
Refresh existing admin tabs after the coordinated cutover; automatic version
detection or forced refresh is not implemented. Roll back both applications
together. A v1.3 rollback does not include the CR-033 quota fix.

`tests/e2e/cr029-cr033.spec.ts` covers the approved UI/intent/reader/contract
regressions with the local contract mock. Real SQL-backed smoke is separate:
`tests/integration/cr033-paired-smoke.mjs` only accepts a disposable loopback
stack at port 6101 and explicit test credentials. It creates synthetic accounts
and changes their plans; never run it against UAT or production. Prepare an
empty migrated database, a `cr033_admin` test account, and Basic/Pro/Plus quotas
of 5/unlimited/0, then set `CR033_SMOKE_ORIGIN` and `CR033_SMOKE_PASSWORD` before
running the script. No provider credential or AI generation is needed.
