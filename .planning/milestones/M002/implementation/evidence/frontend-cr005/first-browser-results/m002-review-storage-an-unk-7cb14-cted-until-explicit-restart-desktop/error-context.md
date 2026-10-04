# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: m002-review-storage.spec.ts >> an unknown draft schema is protected until explicit restart
- Location: tests/e2e/m002-review-storage.spec.ts:206:1

# Error details

```
Test timeout of 60000ms exceeded.
```

```
Error: locator.click: Test timeout of 60000ms exceeded.
Call log:
  - waiting for getByRole('button', { name: 'Start over', exact: true })

```

# Page snapshot

```yaml
- generic [ref=f1e3]:
  - link "Skip to main content" [ref=f1e4] [cursor=pointer]:
    - /url: "#main-content"
  - banner [ref=f1e5]:
    - generic [ref=f1e6]:
      - link "WordWeave" [ref=f1e7] [cursor=pointer]:
        - /url: /
      - navigation "Main navigation" [ref=f1e14]:
        - link "Home" [ref=f1e15] [cursor=pointer]:
          - /url: /
        - link "Picks" [ref=f1e16] [cursor=pointer]:
          - /url: /explore
        - link "Learn" [ref=f1e17] [cursor=pointer]:
          - /url: /create
        - link "Review" [ref=f1e18] [cursor=pointer]:
          - /url: /review
        - link "Library" [ref=f1e19] [cursor=pointer]:
          - /url: /library
      - generic [ref=f1e20]:
        - button "Switch language" [ref=f1e21] [cursor=pointer]: Chinese
        - link "Updates" [ref=f1e22] [cursor=pointer]:
          - /url: /notices
        - group [ref=f1e23]:
          - generic "Account menu" [ref=f1e24] [cursor=pointer]:
            - generic [ref=f1e25]: l
            - generic [ref=f1e26]: learner_e2e
  - main [ref=f1e29]:
    - heading "Spelling review" [level=1] [ref=f1e32]
    - alert [ref=f1e33]:
      - text: Could not save. Your edits are kept. Please retry.
      - button "Retry" [active] [ref=f1e34] [cursor=pointer]
    - generic [ref=f1e35]:
      - generic [ref=f1e36]: 0 / 1 · Sep 20, 2026
      - link "Back to library" [ref=f1e37] [cursor=pointer]:
        - /url: /library
    - generic [ref=f1e38]:
      - heading "Spelling review" [level=2] [ref=f1e39]
      - generic [ref=f1e40]:
        - button "Resume review" [ref=f1e41] [cursor=pointer]
        - button "Try this batch again" [ref=f1e42] [cursor=pointer]
        - link "Back to library" [ref=f1e43] [cursor=pointer]:
          - /url: /library
  - contentinfo [ref=f1e44]:
    - generic [ref=f1e45]: Small moments of learning. Lasting ripples.
```

# Test source

```ts
  145 |   ).toBeVisible();
  146 |   expect(errors).toEqual([]);
  147 | });
  148 | 
  149 | test("a failed write retains current input and persists it on retry for confirmed restoration", async ({
  150 |   page,
  151 | }) => {
  152 |   await start(page);
  153 |   await page.locator(".slot").first().fill("a");
  154 |   await expect
  155 |     .poll(async () => (await records(page))[0]?.wordInputs)
  156 |     .toEqual({ "q-opaque": ["a", "", "", "", ""] });
  157 |   await fault(page, "write");
  158 |   await page.locator(".slot").first().fill("b");
  159 |   await expect(warning(page)).toBeVisible();
  160 |   await retry(page).click();
  161 |   await expect(page.locator(".slot").first()).toHaveValue("b");
  162 |   expect((await records(page))[0]?.wordInputs).toEqual({
  163 |     "q-opaque": ["a", "", "", "", ""],
  164 |   });
  165 |   await fault(page, null);
  166 |   await retry(page).click();
  167 |   await expect(warning(page)).toHaveCount(0);
  168 |   await page.reload();
  169 |   await ready(page);
  170 |   await expect(page.locator("dialog[open]")).toBeVisible();
  171 |   await expect(page.locator(".slot")).toHaveCount(0);
  172 |   await page
  173 |     .locator("dialog[open]")
  174 |     .getByRole("button", { name: t("resume"), exact: true })
  175 |     .click();
  176 |   await expect(page.locator(".slot").first()).toHaveValue("b");
  177 | });
  178 | 
  179 | test("recovering a failed read never overwrites an existing draft before restore confirmation", async ({
  180 |   page,
  181 | }) => {
  182 |   await start(page);
  183 |   await page.locator(".slot").first().fill("a");
  184 |   await expect.poll(async () => (await records(page)).length).toBe(1);
  185 |   await page.addInitScript(() => {
  186 |     Reflect.set(window, "__reviewStorageFault", "all");
  187 |   });
  188 |   await page.reload();
  189 |   await ready(page);
  190 |   await expect(page.locator(".slot")).toHaveCount(5);
  191 |   await page.locator(".slot").first().fill("b");
  192 |   await expect(warning(page)).toBeVisible();
  193 |   await fault(page, null);
  194 |   await retry(page).click();
  195 |   await expect(page.locator("dialog[open]")).toBeVisible();
  196 |   expect((await records(page))[0]?.wordInputs).toEqual({
  197 |     "q-opaque": ["a", "", "", "", ""],
  198 |   });
  199 |   await page
  200 |     .locator("dialog[open]")
  201 |     .getByRole("button", { name: t("resume"), exact: true })
  202 |     .click();
  203 |   await expect(page.locator(".slot").first()).toHaveValue("a");
  204 | });
  205 | 
  206 | test("an unknown draft schema is protected until explicit restart", async ({
  207 |   page,
  208 | }) => {
  209 |   await start(page);
  210 |   await page.locator(".slot").first().fill("a");
  211 |   await expect.poll(async () => (await records(page)).length).toBe(1);
  212 |   await page.evaluate(
  213 |     () =>
  214 |       new Promise<void>((resolve, reject) => {
  215 |         const request = indexedDB.open("wordweave-review-drafts", 1);
  216 |         request.onsuccess = () => {
  217 |           const db = request.result;
  218 |           const tx = db.transaction("drafts", "readwrite");
  219 |           const cursor = tx.objectStore("drafts").openCursor();
  220 |           cursor.onsuccess = () => {
  221 |             if (cursor.result)
  222 |               cursor.result.update({
  223 |                 ...cursor.result.value,
  224 |                 schemaVersion: 2,
  225 |               });
  226 |           };
  227 |           tx.oncomplete = () => {
  228 |             db.close();
  229 |             resolve();
  230 |           };
  231 |           tx.onabort = () => {
  232 |             db.close();
  233 |             reject(tx.error);
  234 |           };
  235 |         };
  236 |         request.onerror = () => reject(request.error);
  237 |       }),
  238 |   );
  239 |   await page.reload();
  240 |   await ready(page);
  241 |   await expect(warning(page)).toBeVisible();
  242 |   await expect(page.locator(".slot")).toHaveCount(0);
  243 |   await retry(page).click();
  244 |   expect((await records(page))[0]?.schemaVersion).toBe(2);
> 245 |   await page.getByRole("button", { name: t("restart"), exact: true }).click();
      |                                                                     ^ Error: locator.click: Test timeout of 60000ms exceeded.
  246 |   await expect(page.locator(".slot")).toHaveCount(5);
  247 |   await expect(page.locator(".slot").first()).toHaveValue("");
  248 |   expect(await records(page)).toEqual([]);
  249 | });
  250 | 
```