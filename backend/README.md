# WordWeave backend

This directory is the independent Go build context for the WordWeave M002 API. It is a Go 1.26 modular monolith backed by PostgreSQL 18. Current browser APIs follow `../.planning/milestones/M002/technical/api/index.md`; the M001 contracts below describe inherited behavior except where M002 explicitly replaces it.

## M002 operation and migration

Apply migrations 0008–0016 to a backed-up M001 database using the existing controlled
migration role. These are additive business-data migrations: accounts, saved text,
resources and cumulative statistics remain. The obsolete `cutover-entry-meaning`
command rejects this migration set and must not be used for M002.

The final accepted schema is 0016. Later M002 migrations add browser-local
one-time notice reminders (0014), generic model connections (0015), and
provider-based model management (0016). See the M002 technical contracts and
the accepted delivery handoff for migration and credential-transition details.

Growth and analytics start disabled. Configure levels, achievements, check-in
rewards and cards in the admin console; migrations do not seed example rewards.
Check-in rule changes begin at the next Beijing 04:00 learning-day boundary.
After level one and a currently effective check-in rule exist, an operator can run:

```sh
wordweave-admin activate-growth --database EXPECTED_DATABASE --role EXPECTED_OPERATOR --confirm
```

This command uses only the explicitly supplied `MAINTENANCE_DATABASE_URL`, verifies
the exact database, current role and migration set, then records activation once.
Repeated activation does not reset history. Provision the operator as a member of
`wordweave_maintenance`; never put its connection string in browser configuration.
Keep the existing capability/session keys stable across deployments.

Deploy with the matching M002 frontend. Review drafts are browser-local; server
review routes accept final submissions and return comparison answers only once.
Legacy `/actions` routes are removed. Base and trial quotas are separately keyed;
admin base-plan edits require the latest `expected_base_revision`.

Maintenance aggregates analytics every minute, qualifies rewards without claiming
them, preserves retirement-refund eligibility, and clears eligible transient data
in bounded batches. Personal analytics detail expires after 90 days; delayed
aggregation prevents cleanup ahead of its checkpoint. Dashboard reads filter expired
detail even when maintenance is delayed. The private metrics endpoint exposes
analytics lag, overdue event count, recomputation pending state and unknown AI usage.
An unavailable metric remains unavailable; it is not reported as zero.

`CLARITY_PROJECT_ID` is optional and provides only the admin dashboard link.
Frontend tracking remains limited to the separately approved public-page scope.

For isolated verification, set `TEST_DATABASE_URL` to a disposable PostgreSQL 18
cluster with database-creation permission, `TEST_POSTGRES_BIN` to its tool directory,
and `OPENROUTER_TEST_API_KEY=` / `OPENROUTER_TEST_MODEL=`. The migration test uses
`pg_dump`/`pg_restore` in a second temporary database and compares all table digests.
Do not point these tests at an operational database. Use `GOTOOLCHAIN=go1.26.7`.

## CR-033 contract compatibility

Admin user detail GET and group-change PUT now both include the required
`user.generation_quota`: limited remaining (including zero), unlimited with a
null remaining, or null for an administrator. It is a read-only snapshot, not a
promise that generation is available. Search summaries and batch DTOs are unchanged.

The group change locks, updates, and reads the user in one transaction and only
returns the projection after commit. A lost/uncertain response must be reconciled
with GET; never automatically replay PUT and reset the window again.

Raw fixtures and their SHA-256 manifest are in
[`testdata/contracts/v1.4/manifest.json`](testdata/contracts/v1.4/manifest.json).
Frontend copies must retain these bytes/digests while keeping independent build
contexts. Deploy or roll back a matching backend + frontend (SSR and browser)
pair; existing admin tabs must refresh. Do not deploy this backend alone to an
old strict v1.3 frontend, including the local UAT environment.

CR-033 database tests require `TEST_DATABASE_URL` pointing at a disposable test
PostgreSQL cluster with database-creation permission. They create uniquely named
temporary databases and clean them up. They do not require a real provider key.

## Local development

### Private generation evidence (CR-042)

This replaces the retired one-shot failure/annotation/hint/minimal capture modes.
There is no old-ticket reader, fallback or dual write. **Remove all four old
`UAT_*_CAPTURE_DIR` variables, even empty ones**; their presence explicitly rejects
startup. Old samples are not imported. Retirement of an existing diagnostic
container/data requires its own deployment authorization.

The ordinary build cannot enable capture. Build `Dockerfile.uat-diagnostics`
explicitly; both server and admin are tagged `uatdiagnostics`. It stays off until
`WORDWEAVE_DIAGNOSTICS=1` and `WORDWEAVE_DIAGNOSTICS_DIR=/run/wordweave-evidence`
are configured together. `PUBLIC_ORIGIN` must be loopback. Runtime requires Linux,
non-root ownership, an absolute private **tmpfs** root (0700), files (0600), and
valid compiled provenance. Host disk directories, public/static directories,
persistent volumes, symlinks and shared capture writers are not accepted.

Example mount options for a separately authorized local diagnostic container:

```text
--tmpfs /run/wordweave-evidence:rw,nosuid,noexec,mode=0700,uid=65532,gid=65532,size=64m
```

Only authenticated generation requests from the approved `wordweave_uat`
account ID compiled in `generationevidence.DedicatedAccountID` are captured.
Re-login to that same account works; visitors, other accounts and model probes
are excluded. Model/entries/scenario/language/length are not capture filters.
Rejected requests retain safe phase metadata, not unvalidated input. After
successful Start, evidence can include approved inputs, sanitized raw
`choices.delta.content` fragments and processing results. API keys, session/CSRF
tokens, passwords, headers and malformed provider envelopes are not stored.

Retention is the latest **50 requests including active ones**, at most **24 hours
from request start**, and **1 MiB per bundle** including journal/queue reserves.
Request 51 first revokes and deletes the oldest. Read/replay never extends expiry.
Background expiry, account deletion and orderly shutdown revoke callbacks and
clean up evidence; stopping the container removes tmpfs. A failed write/deletion
blocks diagnostic reads/admission, emits content-free health signals and requires
cleanup/recovery. OS deletion failure is reported, not represented as successful
physical erasure. Queue pressure/truncation loses diagnostic detail, not business
success or quota. Do not enlarge these limits to make a replay pass.

Inside the same diagnostic container, run as the same non-root UID:

```sh
wordweave-admin diagnostics inspect --dir /run/wordweave-evidence
wordweave-admin diagnostics inspect --dir /run/wordweave-evidence --id EVIDENCE_ID
wordweave-admin diagnostics inspect --dir /run/wordweave-evidence --id EVIDENCE_ID --content
wordweave-admin diagnostics replay --dir /run/wordweave-evidence --id EVIDENCE_ID --mode stream
wordweave-admin diagnostics replay --dir /run/wordweave-evidence --id EVIDENCE_ID --mode model
wordweave-admin diagnostics clear --dir /run/wordweave-evidence --id EVIDENCE_ID
```

These commands dispatch before application config and database initialization;
they make no DB/network/model calls. Inspect defaults to metadata. `--content`
requires an explicit evidence ID and emits private content to stdout: do not pipe
it to ordinary logs, source control or long-lived artifacts. Clear deletes only
the selected private bundle, not business data; it also works after expiry.

Replay reuses production extraction/strict decoding/validation, comparing phase
failures and processing digests. It covers the **model pipeline**, not original
HTTP wire frames, DB settlement, refunds or browser delivery. Incomplete,
redacted, truncated, expired or version-mismatched evidence cannot report
`reproduced`; an unavailable/different replay exits nonzero with a safe report.

Both Dockerfiles hash the actual source/module locks/embedded assets at build
time. Prompt/schema/lexicon hashes come from compiled material; the binary hash
comes from the actual generating **server** executable. Admin defaults to the
sibling `wordweave` file; `--server` can select that same build's server explicitly.
It must not compare its own admin binary as the generating server. Missing
provenance prevents enabling capture. An image digest is separate deployment
evidence, never inferred from a tag or source digest. For a host build:

```sh
WORDWEAVE_BUILD_FLAGS="$(go run ./cmd/build-provenance)"
go build -ldflags="$WORDWEAVE_BUILD_FLAGS" -o ./bin/wordweave ./cmd/wordweave
go build -ldflags="$WORDWEAVE_BUILD_FLAGS" -o ./bin/wordweave-admin ./cmd/wordweave-admin
go run ./cmd/build-provenance manifest
```

Do not add `-trimpath` to these commands: Go omits recorded `-ldflags` in that
mode, making artifact provenance unavailable. Docker fixes the build path at
`/src`; ad-hoc host builds can have different path-dependent binary hashes.

Capture does not retry a request, change prompts/validation, or authorize paid
model calls. Building/testing this variant does **not** authorize replacing UAT.
After investigation, clear private evidence and retire the authorized diagnostic
container; retain only the content-free diagnosis.

The host does not need Go or PostgreSQL installed. Docker is the reproducible toolchain.

```sh
cp .env.example .env
docker compose -f ../compose.yaml --env-file .env up --build
```

Nginx exposes the combined application at `http://localhost:3000`. The backend and its `:9090/internal/metrics` listener are intentionally private in the default Compose topology.

Useful commands:

```sh
make fmt
make test
make lint
make test-integration
```

Create the first administrator only after migrations finish:

```sh
ADMIN_USERNAME=admin ADMIN_PASSWORD='replace-this-password' make seed-admin
```

No OpenRouter API key is read from a normal environment variable. An administrator configures it through the protected API after startup; it is encrypted with the current `OPENROUTER_MASTER_KEYS` version before persistence.

## Repository layout

- `cmd/wordweave`: HTTP server
- `cmd/wordweave-admin`: migrations and one-time administrator command
- `internal/platform`: config, HTTP safety, cryptography and database helpers
- `internal/maintenance`, `internal/observability`: lifecycle cleanup, startup recovery, logs and internal metrics
- `internal/identity`, `vocabulary`, `entitlement`, `generation`, `learning`, `review`, `admin`: bounded modules
- `internal/ai`: provider-neutral `m001-v4` candidate contract, original-entry meanings, independent lexical mapping validation, and OpenRouter adapter
- `assets/lexicon`, `internal/wordnet`, `cmd/build-lexicon`: pinned offline WordNet projection, parser, and explicit maintainer rebuild tool
- `db/migrations`: immutable schema source
- `db/queries`: sqlc query source
- `assets/vocabulary`: frozen M001 vocabulary snapshot

The canonical hint positions are stored in `hint_occurrences`. The legacy hint columns on `batch_targets` only shadow the first occurrence during the M001 compatibility window.

## CR-039 offline lexical mappings

The input vocabulary still limits only selected original entries. Ordinary passage
words need not be in that vocabulary or WordNet. The model returns required
`passage_forms` and `hint_forms` in the same response. The backend independently
checks every declaration and scans all locally recognized forms and repetitions;
unknown declared relations and cross-target collisions fail the batch. These
candidate arrays and lexical proofs never enter public API v1.5 or stored drafts.

Validator `m001-v4-wn31-r1` uses exact forms, reviewed exceptions, POS-specific
forward inflections, and at most one WordNet word-level derivation edge. It does
not accept synonyms, arbitrary graph hops, or model-asserted relations. This is
not a guarantee of all English derivations, contextual meaning, natural grammar
or overall learning quality. Source-word spelling and actual passage-gap answers
remain separate. Current snapshots are strictly decoded and preserve the original
entry meaning and verified positions without recomputing either. Old field names
are rejected, not converted.

The embedded asset is loaded once and verified before startup database recovery;
missing/corrupt assets prevent startup. Normal builds and runtime do not download
lexical data or call a model. The asset is derived from the [official WordNet 3.1
archive](https://wordnetcode.princeton.edu/wn3.1.dict.tar.gz); original license
headers, provenance and hashes are retained in [assets/lexicon](assets/lexicon).

Use **Go 1.26.7**, via the pinned `GO_IMAGE` in the Makefile, for reproducible
asset builds. The generator rejects other Go versions because gzip bytes can
differ across toolchains. Explicit maintainer commands, from this directory:

```sh
go run ./cmd/build-lexicon -download -save-source /tmp/wn3.1.dict.tar.gz
go run ./cmd/build-lexicon -source /tmp/wn3.1.dict.tar.gz -out /tmp/wordweave-lexicon-rebuild
```

The first command is the only operation requiring a public source download. The
second can run without a network. Neither command invokes AI. Do not modify the
frozen vocabulary; any change to asset/parser/rules requires a new validator
version, review and targeted checks. Do not hot-replace rules during a run.

Deployment still requires a separate gate: stop all writers for the approved local
cutover below, use matching backend/schema/frontend artifacts, and obtain **v4-specific** model capability/quality evidence
with an explicitly approved call budget. The single compatibility probe now also
checks `vulnerable → vulnerability`; startup does not probe or toggle models. No
additional total AI timeout was introduced. Real quality tests should allow a
300-second client window and focus on the two approved word groups, not rerun the
whole site. Developer checks and synthetic current-snapshot tests are not a live
model quality verdict or a UAT deployment approval.

## CR-040 original-entry meaning and explicit local cutover

The only meaning field is `entry_meaning` (Go `EntryMeaning`). It defines the
selected original entry, using only that entry and the requested meaning language.
The prompt must not choose a sense or part of speech from the passage, scenario,
hint or derivative, or append the entry's role in the passage. This remains one
model request: no dictionary lookup, semantic repair call, or output truncation.
Automated structural checks do not prove that a real model follows these rules.

`0007_entry_meaning.sql` is structural only. Ordinary `migrate` refuses outstanding
pre-cutover drafts; it never cleans accounts, model assignments or learning data.
The separate `cutover-entry-meaning` command implements the approved one-time
local reset in one transaction, including the same migration and ledger entry.
It requires its own `MAINTENANCE_DATABASE_URL`; it does not load application
configuration, decrypt/probe keys, start HTTP or launch background tasks.

Before running it, obtain actual operation authorization, verify the exact local
database/cluster/maintenance role and recovery conditions, inspect row counts and
available database/WAL space, stop every application writer and rehearse timeouts.
Supply all of `--database`, `--system-id`, `--role`, `--writers-stopped`,
`--lock-timeout` and `--statement-timeout`. There is no force or retry switch.
The controlled role needs the existing owner/migration privileges, visibility of
`pg_stat_activity` and permission to read `pg_control_system()`; do not grant these
to the ordinary application role. Execution checks exact database + cluster ID +
role, PG 18, no other client connections, migration prestate and a table/column
allowlist, then locks and checks again before deletion.

Models, encrypted credentials, full administrator rows, vocabulary and existing
migration records are compared transactionally and retained. Learners, all
sessions/visitor identities, generation/accounting/claim and learning/review data
are deleted. Group defaults are reset and model assignments cleared; the
administrator must sign in and explicitly reassign models afterward. The tool
will not recreate an administrator or invoke a model.

Pre-commit failures roll back. An unknown COMMIT result means **keep service closed,
do not retry**, and use a fresh read-only connection to reconcile the migration,
column and postconditions against the preflight inventory. Successful deletion
does not promise recovery of deleted business data; no hidden backup or legacy
reader is created. The command rejects an already-applied migration/new column,
including after fresh learning data exists. Normal readiness only verifies the
current schema and invariants, never the one-time zero-row/default-group state.

Passage-cloze responses assign every blank an occurrence-scoped `blank_id` and an attempt-scoped anonymous `group_key`. Group keys are generated from 16 CSPRNG bytes, are never persisted or accepted in answer requests, and only let the client visually relate blanks that belong to the same source target.

Administrator user search is ordered entirely by the backend: a case-insensitive exact username is first, followed by the remaining matches in normalized username and ID order. Its signed cursor v2 is scoped to API-103, the current administrator and the normalized query. Clients must keep the cursor opaque, preserve the returned order, and restart without a cursor after the documented `422 cursor invalid` response.
