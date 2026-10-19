# CR-310 read-only before baseline

Status: **baseline captured; not formal QA**. This preparation used the currently running, CR-309-verified frontend at `http://127.0.0.1:3014/create` with the existing local synthetic-success model. The browser intercepted generation and analytics, so the run produced no backend business mutation, quota change, or real provider call. No UAT runtime, database, model configuration, product source, design source, or control file was changed.

## Current behavior

After a valid visitor result appears:

- `fieldset.generation-fields` is disabled; all eight native/custom configuration controls match `:disabled`.
- The vocabulary search is disabled and the primary Generate button is disabled.
- The old final title, body and meanings remain visible.
- The only current UI path to clear the valid result is the separate “放弃本次结果” action. It opens “放弃这篇短文？” with the text “不会加入书架，已使用的生成次数不退回。”
- Cancelling that dialog makes zero discard requests and zero new generation requests, retains the final result, and leaves configuration/words/Generate disabled.

Machine facts are in [`baseline.json`](baseline.json). The completed-state image is intentionally reused from the immediately preceding verified CR-309 live smoke: [`live-3014-final-desktop-1440.png`](../../cr309-qa/after/live-3014-final-desktop-1440.png), SHA-256 `72d8d6753365b9b759c069bdfcd1c9929c4ca7b81763ba32ada78e0868d12b97`. No duplicate screenshot was taken.

## Source explanation

- `GenerationWorkspace.vue` defines `busy` to include `valid`, then applies it to the configuration fieldset, WordPicker and Generate button.
- The final title reads the live `words` computed value. Once editing is unlocked, this must be replaced or otherwise snapshotted so changes for the next request cannot rewrite the old result title.
- The existing final actions expose Save and a separate discard dialog. `workspace.discard()` calls the existing idempotent discard endpoint for a valid run, then resets generation state.
- Preset trials use the same workspace but derive `words` from the published preset and render read-only configuration; CR-310 must retain that boundary.

The first preparation attempt used Playwright `isDisabled()` on a `fieldset`, which is not a supported semantic check for this container. Its failure is preserved in `baseline-initial-locator-method-failure.json`; the final runner reads the DOM `disabled` property and independently verifies each descendant control.
