# WordWeave

AGT is locked to `consumer-ai-web@2.0.0` at framework revision `91d98055ec49c877cc03473e479bcc6a9f371af6`. Read the [project manifest](.planning/agt/project.yaml), [locked Profile snapshot](.planning/agt/profiles/consumer-ai-web/PROFILE.yaml), and [upgrade scope and source-resolution instructions](.planning/agt/profile-upgrade-2.0.0.md). Framework roles, skills and templates must come from the locked revision; the sibling checkout may contain a newer Profile.

The explicitly adopted [context-maintenance patch](.planning/agt/context-maintenance-adoption.json) applies to that pinned revision. For M002, read the [current verification baseline](.planning/milestones/M002/verification/report.md) and [change dispositions](.planning/milestones/M002/changes/index.md); old specialist submissions retain historical approval states and are opened only for a specific scope or evidence question.

Q007 adopts the [evidence-retention patch](.planning/agt/evidence-retention-adoption.json) after the existing context-maintenance and Quick patches. Routine screenshots use ignored output directories; necessary current evidence stays versioned. Historical test images removed from the working tree are available through the [versioned recovery index](.planning/milestones/M002/verification/screenshot-archive.md). Follow the recorded patch order in the source-resolution instructions; the Profile and milestone state remain unchanged.

[AGT Quick is adopted](.planning/agt/quick-tasks-adoption.json) for bounded fixes, small enhancements, tests, configuration and documentation work. Use `$agt-quick <task>`, `list`, `status <id>` or `resume <id>`; clear small-task requests can route there directly. Resolve the locked framework plus all adopted patches in the [recorded order](.planning/agt/profile-upgrade-2.0.0.md) before using the Skill/tool. Each task has one `.planning/quick/Q001-slug/task.json`; M002 remains complete, and its acceptance does not cover later Quick changes. [Configuration](.planning/agt/quick-tasks.json) enables task records, not automatic commits, model calls or deployment.

Quick tasks assess product, design, technical, verification and handoff impacts. Affected owners reconcile the canonical documents before completion; task summaries do not replace those documents. Record actual serial or authorized delegated execution, decision sources and versioned evidence. Missing writebacks or changed upstream versions block the relevant checks and completion.

Quick closeout also requires semantic consolidation of the affected documents and a current `compact` receipt before `finish`. Default `show/resume` returns current conclusions, retained items and evidence pointers; use `--history` for specific historical questions. Original plans, failures and test evidence remain traceable. Static checks do not imply an independent recovery trial, which remains NOT_RUN unless actually performed.

Agent continuation starts at [workflow state](.planning/workflow/state.yaml) and the [M002 delivered baseline and retained items](.planning/milestones/M002/continuation.md). The user formally closed M002 on 2026-10-16, including all work previously misassigned to M003/M004. The historical directories are now `M002-legacy-M003` and `M002-legacy-M004`; the names `M003` and `M004` are available for future explicitly authorized milestones. No specialist is active. See the [closure record](.planning/milestones/M002/reviews/milestone-closeout.md).

The latest accepted local UAT is [localhost:3016](http://localhost:3016), using real services and the saved model configuration; see the [account and environment guide](.planning/milestones/M002/verification/pronunciation/uat-local-20261016/guide.md). The [2026-10-04 Git archive](.planning/milestones/M002/delivery/git-archive-20261004.md) covers that earlier baseline only. Current source evidence and recovery archives are linked from M002. This closeout does not start a new milestone or approve a production release.

M001 was accepted on 2026-09-12 and closed on 2026-09-16; its [report](.planning/milestones/M001/verification/report.md) and [retained limitations](.planning/milestones/M001/verification/report.md#收尾核对与保留事项) remain historical references. The development stack below defaults to port 3000.

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
