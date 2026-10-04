# M002-QA-08 · independent verification

Authorization: TRANSITION-M002-035, qa-quinn. Sources: PRODUCT03, UI22/H01, DB03/BE03/FE02; UI18, API007/008. See current report and coverage for exact scope. Frontend source280/backend288 matched the delivered versions; the frontend production build was reused. No developer unit/lint/type/format/build checks were rerun.

## Results and limits

- K01–09 passed in the first library run. K01–03 each cover en/zh × 320/390/768/1440; K04 covers two language/width pairs and both return paths. These subcombinations are not extra stable-case counts.
- Original K10 failed contrast while the entrance animation was running. `library-results.json`, `axe.json`, log and failure screenshot retain the original 9 PASS/1 FAIL result. `contrast-repro.json` records six fresh settled production/prototype scans with zero violations; `library-controls.json` rechecks the original exact labels, order, accessibility and runtime expectations and passes. No threshold or application change was made. Frame-by-frame animation accessibility was not measured.
- B01–05 passed against real Go/PostgreSQL. B04 actually observed submit200/replace409; B05 is an explicit replacement-first sequential control, not proof of every possible race schedule.
- Final stable cases: 15 PASS, 0 unresolved FAIL. CR014/015 verified_pending_gate; no new product CR. This is not milestone acceptance or UAT.
- Provider calls: 27 local (1 probe, 26 generation), 0 real. Review/control scripts use no provider. Fixture: own25 created (1 deleted), other1, own24 active with 21 learn/3 book; initial global stats25/2/23/1/0/0.
- Only Chromium simulated viewports were independently used this round. No real-device/read-screen/production-deployment or natural-model quality claim.

## Reproduction

Run from the product repository with Node24, installed frontend Playwright/axe dependencies, Go1.26 and PostgreSQL18 binaries. Copy `harness.mjs`, `library.mjs`, `contrast-repro.mjs`, `library-controls.mjs`, and `review-concurrency.mjs` into a **new evidence directory**; their outputs are relative to that directory. Never rerun into these frozen artifacts.

1. Ensure this round's ports are free. Run `python3 frontend/tests/integration/m002-local-stack.py` for the disposable database/API, whose provider base URL is loopback38082. The private `/tmp/wordweave-fe-m002-current` pointer is read only by the harness; do not copy its env/passwords into evidence.
2. Verify delivered source hashes. For this run, reuse `implementation/evidence/frontend-cr014-015/production-server.mjs`, which imports the isolated build recorded in that delivery's `build-location.json`. Start with `PORT=3331 HOST=127.0.0.1 NUXT_BACKEND_INTERNAL_ORIGIN=http://127.0.0.1:38081 node <wrapper>`. If the temporary build has been removed, a fresh isolated build must be recorded as a new run; do not assert the old build was reused.
3. Serve `.planning/milestones/M002/design` via `python3 -m http.server 4186 --bind 127.0.0.1 --directory .planning/milestones/M002/design`.
4. Execute the copied `library.mjs`; it starts local provider38082 and same-origin proxy3301, creates real fixtures, and saves results. The observed first-run exit was1 solely for K10; timing may affect reproduction of that transient scan. Preserve all logs.
5. Execute copied `contrast-repro.mjs`, then `review-concurrency.mjs`, then `library-controls.mjs`. These reuse `fixture.json` and the disposable database, open/close their own3301 proxy, and save separate results. All three returned0 in this run. The source assertions remain fixed.
6. Stop the production wrapper and prototype process that this run owns; execute `python3 frontend/tests/integration/m002-local-stack.py stop`. Verify port closure, not unrelated process-name matches. No pre-existing previews were running at the start of this round.

Artifacts never contain auth/claim/generation tokens or private credentials; the API revision in the minimal receipt is a concurrency value, not an auth token. Runtime includes only two deliberately injected net::ERR_FAILED messages in K06/K07. All services owned by QA08 were stopped; private disposable data remains outside the repository for debugging.

## Preservation and handoff

`before-owned.tar.gz` and seven `previous-*` copies contain exact originals of the five QA documents and CR014/015. `protected-before.json` freezes6752 other files. `manifest.json` hashes this round's evidence and current seven owned documents, verifies the previous75-artifact QA07 delivery using archived bytes for the seven revised documents, and records source/port/link/size checks. The manifest excludes its own recursive hash. Historical QA07 failures and upstream approvals remain unchanged.

Only the gate may formally close CR014/015. Coverage retains49 CAP,25 PAGE,28 views,119 UIA; no whole capability becomesPASS on these scoped results. The handoff recommends keeping quality active after scoped closure, then covering trial/visitor refunds, preset flows and remaining analytics/operations/UI concerns. New-session handoff was not tested; input/token usage is unknown. No commit, deployment, live AI, role transition or subagent was performed.
