# CR306 initial integration failure record

Date: 2026-10-12

The first broad `TEST_DATABASE_URL=<isolated PostgreSQL 18> go test -tags=integration ./...` run exited 1. Its terminal output was retained by the implementation session; this concise durable record identifies the observed failure classes and the repairs applied without reproducing or weakening assertions.

- Existing direct `generation_runs` fixtures omitted the new no-default `model_request_parameters_snapshot` and failed with PostgreSQL `23502`.
- Existing admin model write fixtures omitted the now-required non-null `custom_parameters` and correctly received `validation_failed / required`.
- The pre-M003 historical migration fixture attempted to include unpublished 0017 despite containing legacy runs. It now stops at its intended M002/0016 boundary; M003/0017 remains empty-database-only and is covered independently.
- The generic-model preservation digest needed to exclude the newly added `custom_parameters` column when comparing the pre-CR306 record shape.

Repairs populated explicit five-key snapshots in current-schema run fixtures, populated explicit `{}` in model-write fixtures, retained the database column's no-default rule, and kept a separate empty-database M003 migration/Verify test. The final full integration log is `02-full-integration-final.log`.
