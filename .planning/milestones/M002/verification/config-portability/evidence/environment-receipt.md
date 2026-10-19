# M002-QA-CR313-01 environment receipt

- Date: 2026-10-16 Asia/Shanghai
- Frontend/public origin: `127.0.0.1:43230`; Nuxt build and Nitro output were outside the repository in a task-specific temporary directory.
- Real current backend: `127.0.0.1:43231`; disposable PostgreSQL: `127.0.0.1:63552`, database `wordweave_cr313_qa131`.
- Fixture: two synthetic administrators, one synthetic learner, all four configuration categories, usage/trial/award/issued-item history. No real account, secret, database, provider or UAT service was used.
- Credential/session/password files stayed mode 0600 in a temporary directory outside the repository and were never copied to evidence. Evidence contains only sanitized identifiers, counts, hashes and outcomes.
- Reset baseline broad history fingerprint: `333be8d7b7404a1018c9717e4210ac13`. Post-run normalized fingerprint, excluding only derived `config_revision_seen` and transaction `xmin` while retaining every personal fact and full rows for all other protected tables: `f95c6279a3d3495e6b8b0ebbd975471b`.
- Provider-call count: 0 (`ai_call_usage=0`, `preset_preview_runs=0`, no non-seed `generation_runs`; no probe/generation/preset-preview HTTP route).
- Cleanup: frontend stopped and task-specific Nuxt directory `/tmp/wordweave-cr313-qa-nuxt.42CZAi` removed. Fixture owner stopped the exact disposable backend/PostgreSQL/metrics processes and removed its external temporary fixture directory, packages, runtime keys, credentials, cookies/sessions, query output and bootstrap/teardown helpers. Independent TCP checks returned connection refused (`connect_ex=61`) for ports 43230, 43231, 63552 and 39552. No repository application source or approved artifact was changed by cleanup.
