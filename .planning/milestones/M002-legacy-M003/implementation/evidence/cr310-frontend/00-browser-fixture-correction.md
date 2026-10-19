# CR-310 development fixture correction

The first targeted desktop/mobile browser run reached the second generation POST but left the UI in `pending` instead of `valid`. Playwright reported both viewport assertions at `#final-result .story-text` as missing. The rendered state retained the synthetic Plan and draft and displayed the expected contract-reconciliation notice.

Inspection found that the newly added synthetic `generation.validated` test frame omitted the required `targets[].hint_blanks` field. This was a test-fixture contract error, not a production failure. The fixture was corrected with `hint_blanks: [{ start: 2, end: 8 }]`, matching `a gentle answer`. The focused rerun then passed desktop/mobile 2/2, and the final full targeted run passed 6 tests with 4 deliberate project-specific skips. No production behavior was changed in response to this fixture error.

First-run failure excerpt (transcribed from the Playwright runner output before its result directory was replaced by the required passing rerun):

```text
Error: expect(locator).toBeVisible() failed
Locator: locator('#final-result .story-text')
Expected: visible
Timeout: 5000ms
[desktop] failed at m003-cr310-regenerate.spec.ts:311
[mobile] failed at m003-cr310-regenerate.spec.ts:311
2 failed
```
