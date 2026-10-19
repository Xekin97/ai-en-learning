# CR-309 independent QA — isolated revised source

Result: **PASS**. This is targeted functional and visual QA for UI11 / FE3-15 on the isolated revised frontend at `127.0.0.1:54913` with the local synthetic fixture at `127.0.0.1:54915`. Node was `v24.21.0`. No real provider was selected or called, and the live UAT frontend on port 3014 was not changed during this run.

## Coverage

- PAGE204 at 1440×1000 and 390×844 reused the before-baseline `garden` / `learn`, Chinese meaning, Story / Brief fixture. The Plan stayed visible through planning, two incremental edits and `settlement_pending`; only the valid final state replaced it.
- Plan and Result both rendered `section > dl > div > dt + dd + dd`. Computed values matched across states: desktop two columns with 24px gap, mobile one column, 10px vertical item padding, 1px top divider, 17px/600 reading face terms, and 13px/1.65 muted details.
- Draft and final reading surfaces used the same max width and typography: 760px maximum, `18px 0 14px` paragraph margins, `pre-wrap`, `anywhere`, and line-height ratios 1.85 desktop / 1.78 mobile. Neither viewport overflowed horizontally.
- PAGE212 retained the old English `lastPreview` while the new Chinese live Plan was present, kept the stale/publish gate, and changed to the new Chinese native label only after the new preview reached ready/final. Plan, retained Result and new Result shared computed styles.
- PAGE216 `/trial/preset-zh` exercised the shared workspace component and final field mapping.

The implementation manifest and all eight listed source/test files matched their recorded hashes. The archive hash also matched. The only global stylesheet delta against the pre-refresh UAT snapshot is the CR-309 selector block; Explore and Library component source was not changed.

After the independent result passed, the authorized UAT refresh copied only the four production files to the 3014 source snapshot. [`live-source-hashes.json`](live-source-hashes.json) records 4/4 exact matches. The live Chinese `/create` smoke intercepted both generation and analytics, rendered Plan and final with identical computed vocabulary styles, removed Plan only at final, kept quota unchanged, produced no page error or business API mutation, and made zero real provider calls. See [`live-3014-smoke.json`](live-3014-smoke.json).

## User UAT status

Overall user UAT is **in progress**: the user had already tried the product and reported CR-309. The repaired CR-309 build has passed independent QA and the refreshed 3014 smoke, but still awaits the user's retest and has not received final acceptance. This status does not rewrite the earlier readiness-085 historical `not_started` record.

## Evidence

- Machine result and computed styles: [`results.json`](results.json)
- Independent runner: [`qa-after.mjs`](qa-after.mjs)
- Desktop/mobile screenshots: `workspace-{during,pending,final}-*.png`
- Admin retained/final screenshots: `admin-{during,final}-desktop-1440.png`
- Shared trial screenshot: `trial-final-desktop-1440.png`

Earlier runner failures in this directory are preserved as QA-method calibration: a pixel line-height expectation where the contract is a ratio, one localized label mismatch in the runner, a deliberately rejected mismatched mock result, a selector-name mismatch, and an early wait that observed the retained preview before the replacement preview finished. They do not indicate product failures; the final runner corrects each method issue and passes all nine checks.
