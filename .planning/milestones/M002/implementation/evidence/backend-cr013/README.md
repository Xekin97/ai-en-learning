# Backend CR013 evidence

Authorization: TRANSITION-M002-031. Owner: backend-ethan. Scope: API006 existing authenticated save state classification; no schema, accounting or frontend change.

- `inputs.json` + `before-owned.tar.gz`: prior working tree hashes and the six files owned by this repair before changes. `previous-backend-validation.md` preserves the readable prior report.
- `red.log/json`: the new HTTP regression against pre-fix production; eight conflict branches fail with404, three controls pass. This failure is retained.
- `green.log/json`: same HTTP regression after the repair; eleven subtests pass.
- `integration-lifecycle.log/json`: seven related integration tests, including17 subtests; race enabled, no skips. Concurrency, restart, claim deletion/rollback/retention and inherited end-to-end behavior.
- `unit`, `vet`, `build`, `format`, `diff-check`: exact commands, exits and logs. `counts.json` records test scope and toolchains.
- `source.json` and `backend-source.tar.gz`: the exact current backend, including prior CR006/007/011 repairs. `source-diff.patch` compares against backend-cr011, not the older Git HEAD.
- `manifest.json`: final hashes and protected-file audit. Old QA06 records stay frozen; the new backend is implemented_pending_qa.

Reproduce the command arrays from each JSON on a NEW disposable PostgreSQL18 instance with `TEST_DATABASE_URL` and `GOTOOLCHAIN=go1.26.7`, in `backend/`. Use a fresh evidence directory; never overwrite these logs or restore old code over unrelated work. The HTTP test uses the restricted app role and local validated fixtures, with no reachable external provider. The existing end-to-end regression uses a local fake provider. No real AI calls or deployed-environment coverage is claimed.

The temporary instance is stopped (`environment-stop.json`). Backend code has not been deployed; frontend CR012 and independent QA remain outstanding.
