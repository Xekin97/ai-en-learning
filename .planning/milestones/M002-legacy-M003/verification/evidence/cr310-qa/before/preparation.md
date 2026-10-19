# CR-310 targeted QA preparation

This is a post-implementation test map only. Execution waits for the formal design, frontend contract, implementation and QA-entry gates. It uses synthetic browser streams and explicit discard stubs; no real model or article-quality evaluation belongs in scope.

| ID | Targeted check | Required observation |
|---|---|---|
| CR310-Q1 | Visitor and learner reach valid completion | Ordinary configuration, vocabulary controls and Generate become editable/enabled; preset trial configuration remains read-only. |
| CR310-Q2 | Edit next inputs while old result remains | Changing words/model/scenario/length/meaning language updates only the next draft. Old title, passage, tags and meanings stay byte-for-byte unchanged. No discard or generation request occurs. |
| CR310-Q3 | Click Generate, then cancel warning | Warning states that the unsaved old result will be permanently discarded. Cancel sends zero discard and zero new-generation requests; edited inputs and old result remain intact. |
| CR310-Q4 | Confirm warning | Exactly one discard for the old run completes before exactly one fresh generation POST. The new request body is an immutable snapshot of the edited inputs; one accepted generation follows. |
| CR310-Q5 | Discard failure | A controlled discard failure prevents the new generation POST, retains the old result and edited next inputs, exposes a retryable error, and consumes no quota/provider call. |
| CR310-Q6 | Duplicate confirm | Hold discard response and activate confirm twice. Only one discard and one generation may occur; dialog/button pending state prevents duplicate work. |
| CR310-Q7 | Save race | Delay Save and attempt regeneration confirmation, then reverse the order. One ownership path must win without saving a discarded run, discarding a saved run, or starting duplicate generation. Exact acceptable UI resolution follows the final frontend contract. |
| CR310-Q8 | Leave guard | With an unsaved valid result and edited next inputs, route leave still warns. Cancel preserves both; confirmed leave discards only as contracted and never starts generation. |
| CR310-Q9 | Saved/visitor boundaries | After learner Save or visitor claim transition, no stale unsaved-result warning is shown. Existing authentication/claim behavior remains intact. |
| CR310-Q10 | Preset boundary | Published preset model/words/options remain read-only at all times. Any allowed repeat generation uses the published preset snapshot and the final contract’s warning behavior. |

## Minimal fixture and instrumentation

- Reuse the CR-309 `garden` / `learn`, Chinese meaning, Story / Brief stream as the old valid result.
- Edit the next draft to a distinct set such as `adapt` / `weave`, English meaning, Discussion / Medium so snapshot leakage is unambiguous.
- Log only method/path/order and safe request fields. Assert order `discard(oldRun)` before `generation(newSnapshot)`; never record tokens, credentials or private provider payloads.
- Run the core visitor and learner paths at desktop width. Add one mobile confirmation-dialog pass only if the implementation changes dialog layout. Do not repeat CR-309 typography or unrelated application regression.
- Reuse the current backend discard contract; no backend change is presumed. A browser route can return 204, delay, or fail the discard call deterministically.

## Gate boundary

Developer tests and design prototypes will be inputs, not the independent result. Formal QA will start only after the implementation return gate and will not refresh UAT3014 until the independent targeted result passes and root authorizes the four/file-scoped refresh.
