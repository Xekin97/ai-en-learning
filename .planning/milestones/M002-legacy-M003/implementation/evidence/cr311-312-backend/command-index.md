# CR311/312 backend evidence

| File | Scope | Final result |
|---|---|---|
| `baseline.json` | task-start status disclosure and historical-baseline pointer | recorded |
| `01-focused-unit.log` | affected unit packages | PASS |
| `02-cr311-integration.log` | exact catalogue, Search/Random production SQL, old targets/hash | PASS |
| `03-http-v6-integration.log` | generation/preview v6 wire order and persistence invariants | PASS |
| `04-continuation-boundary-integration.log` | continuation/correction/cancel/disconnect/stream boundaries | PASS |
| `05-full-race.log` | all backend packages under race detector | PASS |
| `06-static-build-generate.log` | sqlc, vet, build, format/diff checks | PASS |
| `07-resource-cleanup.log` | disposable PostgreSQL 18 stop/removal | PASS |
| `08-protected-files.log` | 804 protected files final SHA-256 check | PASS |
| `09-final-generation-delta.log` | whitespace-body continuation paragraph index; race/vet | PASS |
| `10-sqlc-side-effect-restore.log` | restore incidental dbgen/models.go rewrite and compile | PASS |
| `11-artifact-verification.log` | manifest/archive/protected/baseline/final diff verification | PASS |
| `failure-ledger.md` | development-only failures and corrections | closed |
| `source-manifest.json` | owned source receipt and baseline quality | recorded |
| `cr311-312-backend-source.tar.gz` | 14 owned source/test files + 4 current delivery originals | 18 entries, verified |

No real provider was called. No UAT, shared database, migration, deployment, frontend, or control-plane state was changed.
