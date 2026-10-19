# CR-310 independent functional QA — isolated revised source

Result: **PASS**. The isolated CR-310 frontend at `127.0.0.1:55013` was tested with Node `v24.21.0` and the synthetic backend at `127.0.0.1:55015`. The run produced 14/14 passing checks, no page errors, no real provider calls, and did not touch UAT 3014, its database, or model configuration.

## Targeted coverage

- Learner and visitor valid results remained fully visible while model, words, scenario, length and meaning language became editable. Editing the next request did not mutate the old title, body, tags or meanings, and the separate Discard action was absent.
- Desktop English and mobile Chinese warning dialogs showed the native title/body/actions. Cancel button, Escape, close button and backdrop each retained the old result and edited inputs, returned focus to Generate, and caused zero discard or new generation requests.
- Confirming replacement issued exactly one discard before exactly one new stream. The new request was the captured `model-fast / gentle / discussion / medium / zh` snapshot. Repeated confirmation produced no duplicate request.
- A failed discard retained both old output and new inputs, showed the localized safe error, started no generation, and returned focus to Generate.
- A held Save disabled Generate and blocked navigation without discard or competing stream. A held confirmed leave discard disabled Save and Generate; programmatic competing clicks made zero requests. An overlapping navigation while a leave resolver existed was rejected, and the original confirmed navigation completed after discard.
- The replacement lock was released once the second matching `adapt/en` stream entered composing. Stop opened the cancel confirmation, and confirmation produced one cancel request across two total streams.
- Visitor Save created one claim and no discard; pending settlement kept all controls locked; preset generation stayed read-only and repeated from the exact published snapshot.

The implementation manifest and all seven listed production/test files matched their recorded hashes. Manifest and source archive hashes also matched the gate values. Developer tests were treated as input; this result comes from the independent isolated Vue/browser run.

Earlier result files ending in `harness-fail.json` are method calibration records. They cover request-observation timing, an extra overlapping navigation that correctly cancelled a prior pending navigation, and a mismatched held SSE fixture (`gentle/zh` request with `adapt/en` plan frames) that correctly entered pending instead of exposing Stop. The final runner uses a matching unchanged `adapt/en` snapshot for the held stream and passes the cancellation behavior; none of those calibration failures is a product defect.

After the independent PASS, the authorized UAT refresh copied only the five CR-310 production files into the 3014 source snapshot. [`live-source-hashes.json`](live-source-hashes.json) records 5/5 matches. The Chinese visitor smoke intercepted generation, discard protection and analytics before the backend: the valid result unlocked inputs, next-request edits left the old result intact, Cancel retained both states and returned focus, quota stayed 100→100, and observed backend business mutations, page errors and real provider calls were all zero. See [`live-3014-smoke.json`](live-3014-smoke.json).

The owned isolated ports 55013/55015 were then stopped; 3014 and 54872–54875 remained running for user UAT, while old 3013 was only observed. See [`runtime-cleanup.json`](runtime-cleanup.json).

Overall user UAT remains **in progress, awaiting CR-310 retest**. The user had already tried the product and supplied the CR-310 feedback; this independent result does not record user acceptance.
