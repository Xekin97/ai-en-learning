# M002-QA-09 independent verification

Authorization: APPROVAL-M002-036, verification / qa-quinn. PRODUCT03, UI22/H01, DB03/BE03/FE02 remain the baseline. Relevant approved sources: CAP009/011/216/218, API004/005/006/202/208, PAGE212/216/217, UI15 and UI08. Current report and coverage describe the exact limited conclusions.

## Outcomes

Final stable cases: P01–07 + R01–04 + U01–04 = 15 PASS, 0 unresolved product failures. No new CR or application change. First API run records 9 PASS/2 FAIL; separate controls reverify only P01/P07. Four UI cases include eight language/width combinations and four local axe scans, which are not additional stable-case counts. Remaining matrix and UAT remain incomplete.

Recorded provider calls: initial preparation1 + second preparation1 + API20 + controls4 + UI3 = **29 local, 0 real**. The provider binds only127.0.0.1:38082. Sources and production frontend build match frontend-cr014-015/backend-cr013. Real Go/PG execute every business operation; this is not a mocked API response test. Request data in evidence contains only public published_version values, no authentication or generation/claim tokens.

## Failures retained and corrections

- `setup-initial-*`: local compatibility probe fixture omitted its required exact repeated/inflected hint; enable422 before business tests. Preserve original provider/script/results/log.
- `setup-second-*`: corrected hint passed, then duplicate provider ID for two model records was rejected409; still before business tests. Main script now uses two different provider IDs, which the local provider catalog exposes. Each preparation has one local call and its own disposable database.
- `api-results.json` P01: English main preset preview/publication assertions ran, but the Chinese fixture used an English tag; real validation rejected it and publication returned preview_required. `provider.mjs` remains the exact main-run provider. `provider-fixed.mjs` only supplies a Chinese tag for Chinese meaning language. `api-controls.mjs` performs P01 again using a new unpublished draft, repeated previews with visitor/basic quotas0, explicit publication, Chinese preview and usage deltas.
- P07: main script accidentally used unsupported GET /admin/models/{id};405 occurs before mutation. Control uses approved GET /admin/models to obtain revision, then verifies actual disable/public availability/start rejection. No error expectation was weakened and no product code changed.
- U02's503 and U03's409 are intentional. `ui-results.json` records exactly these two console resource errors and no pageerror/other runtime errors.

Do not replace first-run failures with controls. The final result maps P01/P07 to independent controls, preserves all original artifacts, and does not retest the other nine passing API cases.

## Reproduce in a fresh output directory

From the product repository, use Node24, installed Playwright/axe dependencies, Go1.26.7 and PostgreSQL18. Copy harness.mjs, api-support.mjs, provider.mjs, provider-fixed.mjs, presets-refunds.mjs, api-controls.mjs and presets-ui.mjs into a new directory. Output uses each copied module's directory. Never rerun into this frozen QA09 folder.

1. Confirm local ports are free. Run `python3 frontend/tests/integration/m002-local-stack.py` for a new disposable API/DB. It stores credentials privately via `/tmp/wordweave-fe-m002-current`; do not print/copy env.json. The script builds the current API runtime, not developer test suites.
2. Reuse `implementation/evidence/frontend-cr014-015/production-server.mjs` and its `build-location.json` isolated build with PORT3331, HOST127.0.0.1, NUXT_BACKEND_INTERNAL_ORIGIN=http://127.0.0.1:38081. If that temporary build is absent, record a new isolated build rather than claiming old-build reuse. Do not overwrite developer evidence.
3. Serve approved `.planning/milestones/M002/design` on4186 with Python's local HTTP server.
4. Run copied `presets-refunds.mjs`. This creates local models/plans/accounts/growth configuration, previewed presets and card-based pro trial through real APIs (initial growth activation only seeds the disposable DB). The intentionally preserved first-run fixture/path errors yield P01/P07 failures and exit1. All remaining nine cases pass; fixture.json is still saved. Credentials/tokens are used only in memory. Direct-Go fetch is used for connection-abort cases; it does not test a production Nginx stream proxy.
5. Run copied `api-controls.mjs` (exit0, two cases) then `presets-ui.mjs` (exit0, four cases). The controls preserve production expectations. UI verifies approved copy, complete samples, tabs/locked controls in en/zh ×320/390/768/1440; actual provider failure/retry, guest registration/claim; stale publication refresh and model unavailable display; local axe after fonts/entrance animations settle. It saves production/prototype captures. Reduced motion is used for content checks, not evidence of automatic-carousel timing coverage.
6. Stop only this run's frontend/prototype process and run `python3 frontend/tests/integration/m002-local-stack.py stop`. Verify3331/3301/38081/38082/39081/4186/63541 closed. Those and pre-existing preview ports were all closed before this round. Private disposable files remain outside the repository for debugging.

The two historical setup failures can be reconstructed separately by copying each setup-initial/setup-second provider and script to the names they imported in another fresh folder/database. Their counts are not included again in a normal business/control/UI replay.

## Preservation and handoff

Five current QA documents are revised. `before-owned.tar.gz` plus previous-* preserve their exact old bytes. `protected-before.json` protects6815 other files, including control state, source, original CRs, approvals and old evidence. QA08 manifest's63 originals are verified through58 unchanged files and5 archived mutable documents. Manifest also records link checks, matching source hashes, same-document UTF-8 sizes, port shutdown and current artifact hashes; it excludes its own recursive hash.

No specialist correction, control transition, formal CR closure, commit, deployment, live AI, subagent or model switch occurred. CR014/015 remain formally closed by036; current CR001/002 and M001 retained limitations remain. New-session handoff was not executed, tokens unknown. Continue with existing API209/900 retention/cleanup coverage; no new gate is needed for this already-authorized same-role work.
