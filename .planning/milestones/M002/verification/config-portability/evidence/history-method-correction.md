# Protected-history check and method correction

## Evidence sequence

1. The first mixed harness run started from history hash `9389c4f303e32dfd23c885567fdc0cfd` and later observed `2b814715539ec1cc59b8ecccaa1b9a54`. `xmin` narrowed the only changed history row to `wordweave.user_growth`; its five user facts stayed `mastered_total=9`, `saved_total=4`, `successful_review_total=7`, `highest_checkin_streak=3`, `highest_review_streak=2`, while `config_revision_seen` advanced. The original attribution to repeated learner login was incomplete.
2. The fixture was dropped and rebuilt from current migrations and the original seed. New baseline hash: `333be8d7b7404a1018c9717e4210ac13`; no learner session existed.
3. `history-focused-01` performed config-only plans, growth and encrypted-model applied imports plus an issued-item blocked preview. Immediately afterward the full original hash remained exactly `333be8d7b7404a1018c9717e4210ac13`.
4. `history-focused-02` additionally proved an items applied import. After the normal background recompute cycle, the broad hash became `ff5ec7d0d29e077cb136e7e706c3a089`. Every protected table row except `user_growth` retained seed transaction `xmin=1075`; only `user_growth.xmin` changed, and only its derived `config_revision_seen` marker advanced from `2` to the prior configuration revision `7`. The five personal progress facts above remained byte/value identical. No usage, trial dates, generation charge/run, inventory, model-time, award/claim, settlement or check-in history row changed.

## Contract interpretation

`technical/config-portability/database.md` DB501-03 requires personal `user_growth` facts and runtime history not be rewritten by the category replacement. DB501-06 step 5 simultaneously requires `AdvanceConfiguration` to retain the existing `recompute_target_revision` behavior and forbids recomputing all users inside the import transaction. `technical/config-portability/backend.md` BE501-06 keeps the existing recompute cursor against current rules. Therefore `config_revision_seen` is an expected derived synchronization marker, not a protected personal-history fact.

The bootstrap query’s whole-row fingerprint was overbroad because it included that marker. QA did not generalize this into allowing arbitrary `user_growth` changes: the exact allowed difference is `config_revision_seen`; all five progress facts and all other protected rows were independently checked as unchanged. The initial broad-hash failures remain preserved in `db-after.out`, `run-05`, `history-focused-01`, and `history-focused-02` evidence.

Result: **PASS after verification-method correction**. Intentional configuration effects were configuration revision advancement and replacement of the target next-learning-day check-in intent; current/historical check-in rows and user history remained unchanged.
