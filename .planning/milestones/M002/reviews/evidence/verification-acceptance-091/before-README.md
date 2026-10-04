# WordWeave

Agent continuation starts at [workflow state](.planning/workflow/state.yaml) and the [current M002 design handoff](.planning/milestones/M002/handoffs/uiux.md). M002 was accepted and closed, then reopened on 2026-10-01 for five scoped product/design additions (CR025), with designer-tony preparing the revised prototype. The [accepted delivery and retained limitations](.planning/milestones/M002/verification/report.md) remain valid for unchanged scope. No M003 or production release is started.

M001 was accepted in local UAT on 2026-09-12 and closed on 2026-09-16. Its historical UAT entry was `http://localhost:6001`; current M002 local-environment notes are in the M002 handoff above; the development stack below defaults to port 3000. See the [delivery report](.planning/milestones/M001/verification/report.md), [retained limitations](.planning/milestones/M001/verification/report.md#收尾核对与保留事项), and [workflow state](.planning/workflow/state.yaml). Milestone closeout does not approve a production release.

WordWeave is a single repository with independently built backend, frontend, and edge applications.

## Repository layout

- `backend/`: Go API, migrations, AI adapters, and background maintenance
- `frontend/`: Nuxt SSR application
- `nginx/`: same-origin edge routing for local and single-host deployments
- `.planning/`: approved product, UI, data, API, and architecture contracts
- `compose.yaml`: combined PostgreSQL, migration, backend, frontend, and Nginx topology

Each application owns its Docker build context. No component Dockerfile copies files from the repository root or another application.

## Local combined deployment

Copy and edit the backend configuration before starting the stack. Values marked for replacement are local secrets and must not be committed.

```sh
cp backend/.env.example backend/.env
docker compose --env-file backend/.env config
docker compose --env-file backend/.env up --build
```

The browser entry point is `http://localhost:3000` by default. Only Nginx publishes a host port; backend, frontend, PostgreSQL, and metrics remain on private Compose networks.

## Component development

```sh
make -C backend test
make -C backend lint
corepack pnpm --dir frontend install
corepack pnpm --dir frontend typecheck
corepack pnpm --dir frontend test
corepack pnpm --dir frontend build
docker build backend
docker build frontend
docker build nginx
```

Frontend development and independent deployment instructions are documented in `frontend/README.md`.

Production deployments should inject secrets through the platform secret manager, tag all three images with an immutable commit SHA, run the migration job before backend startup, and preserve the routing contract documented in `.planning/milestones/M001/technical/deployment.md`.
