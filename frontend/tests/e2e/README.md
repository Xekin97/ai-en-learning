# UI26 incremental coverage

UI26 / FE04 supersede the affected UI22 message, select, word-picker, meanings, homepage advantages and copy assertions. `m002-ui26.spec.ts` and `tests/integration/m002-ui26.mjs` cover those changes. `select-control.ts` exercises the visible control while preserving canonical request-value checks; the model-card selector remains multiple. Existing unaffected M002 scenarios remain valid.

For the isolated production test proxy use `UI26_ORIGIN=http://127.0.0.1:3311`; the API contract fixture stays on 38080. This is separate from the real-model UAT on 3302. UI26 evidence lives under `implementation/evidence/frontend-ui26`, preserving earlier screenshots and failures. No real-model calls are made by these suites.

# Browser regression ownership

`m002-*.spec.ts` is the executable UI22 / API M002 baseline. The other `*.spec.ts` files preserve the previous milestone's browser specifications in place (same paths and relative imports); these historical M001 visual/contract assertions are superseded and are excluded by the explicit M002 testMatch. Do not run old `/actions` sessions or M001 exact geometry/copy expectations against UI22.

The inherited behavior remains covered:

| Historical source                                                       | Current coverage                                                                                    |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| application-smoke: homepage, generation, unsaved results                | m002-foundation / learning; generation-lifecycle and workspace lifecycle unit suites                |
| application-smoke: review and library                                   | m002-learning / review / inheritance; review-setup-lifecycle (47 cases)                             |
| application-smoke, CR029–033: models, plans, user search/detail, quotas | m002-admin-core; admin-detail, admin-list, quota-contract unit suites; M002 real-service smoke      |
| CR030-073 / CR030-075 / CR035-075 exact old geometry                    | UI22 admin-core / admin-growth screenshots and three-engine browser matrix replace M001 CSS numbers |
| CR034 date input, errors, no replay, stale responses                    | m002-inheritance date browser case plus preserved review-setup-lifecycle unit suite                 |
| CR037 auth/account and application-smoke deletion                       | m002-inheritance, auth-design/auth-return/account-settings units; real register→claim smoke         |
| application-smoke accessibility, CR031 reader focus                     | three-engine matrix, m002-admin-core read-only reader and native AppDialog behavior                 |

Current all-browser integration scripts live in `tests/integration`. True device keyboards, screen readers, production CSP/proxy and real model quality remain independent QA/operations checks; desktop browser emulation is not evidence for those.
