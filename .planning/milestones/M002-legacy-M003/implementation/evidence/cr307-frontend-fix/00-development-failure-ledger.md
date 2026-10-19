# CR-307 developer failure ledger

The original independent QA failure remains frozen outside this directory. During the bounded fix, the first expanded browser check passed topmost cycling, nested “keep editing”, and save/refetch restoration. A follow-up assertion then exercised the nested “discard” action that closes both dialogs in one Vue flush.

That run failed in both desktop and mobile: the parent dialog attempted to focus the page opener while the child dialog was still in the top layer, so the browser rejected the focus; after the child closed, focus was `BODY`. The raw console and Playwright JSON are preserved as `03-browser-focus-discard-failure.log` and `browser-focus-results-discard-failure.json`.

The fix waits one additional Vue tick after `HTMLDialogElement.close()` before restoring focus. This lets all dialogs closed in the same flush leave the top layer. The final two-viewport run in `06-browser-focus-final.log` covers nested keep and discard, as well as save/refetch with a disconnected original opener.
