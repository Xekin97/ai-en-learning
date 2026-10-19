# Entry-motion rerun: cancel focus observation raced dialog cleanup

The second entry-motion browser rerun passed the new arrival and reduced-motion checks, then failed the cancel case because the assertion sampled `document.activeElement` immediately after the cancelled-state heading appeared. The heading rendered before `AppDialog.syncOpen()` completed its two `nextTick()` close/return-focus sequence. The same action node was retained and the other cancel cleanup assertions passed. The final test waits for the existing return-focus contract (`toBeFocused`) before reading the identity snapshot; it does not weaken the focus requirement or change product timing.

Observed failure: desktop cancel case only, `focused: false` vs expected `true`; other fields were `same: true`, `staleDraft: false`, `staleGhost: false`. That run completed 4 passed / 1 failed / 5 deliberately skipped.
