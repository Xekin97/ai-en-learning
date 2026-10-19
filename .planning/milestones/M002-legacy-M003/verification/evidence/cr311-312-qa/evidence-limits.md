# CR-311/312 QA evidence limits

- `api-results.json` is actual current Go/API/SSE/DB behavior on a fresh PG18 database with a deterministic local provider. Content is synthetic; no external provider was contacted.
- `actual-replay-wire.json` was captured from that current Go stack. `actual-replay-results.json` replays those exact 38 events through current Nuxt using the same five targets, model, locale, scenario and length. It proves client consumption, not a second live Go generation.
- `browser-summary.json` combines the canonical controlled browser observations, exact-wire replay and the isolated focus probe. The raw combined `browser-results.json` retains one focus-method failure; only that assertion is superseded by `focus-probe-results.json` 5/5. All other canonical browser checks come directly from the raw file.
- Controlled browser content (`adapt`) is only for motion, race, failure, responsive and state behavior. It is not the approved representative copy and is not article-quality evidence. UI13-R4's six-word bookshop image remains the representative visual reference.
- Backend full matrices and boundary cases, frontend scheduler virtual-time cases, PAGE216, and unaffected UI12 cases are reused from the frozen implementation submissions; they are not claimed as independently rerun.
- Attempts remain because they document method and fixture corrections. No attempt failure was classified as a product defect.
- Screenshot budget: two canonical screenshots retained and three images visually inspected (two canonical plus one approved UI13-R4 reference).
- Excluded: real provider calls, model/article quality, semantic-review accuracy, live UAT3015, historical migration, deployment/capacity, physical devices and human screen-reader testing.
