# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: m002-ui26.spec.ts >> published meanings keep their snapshot language when the interface language changes
- Location: tests/e2e/m002-ui26.spec.ts:108:1

# Error details

```
Error: expect(locator).toHaveText(expected) failed

Locator: locator('.preset-meanings dd')
Timeout: 5000ms
- Expected  - 2
+ Received  + 1

  Array [
-   "适应新情况",
    "change to fit a new situation",
-   "新しい状況に適応する",
+   "change to fit a new situation",
  ]

Call log:
  - Expect "toHaveText" with timeout 5000ms
  - waiting for locator('.preset-meanings dd')
    2 × locator resolved to 0 elements
    12 × locator resolved to 2 elements

```

# Page snapshot

```yaml
- generic [ref=e3]:
  - link "Skip to main content" [ref=e4] [cursor=pointer]:
    - /url: "#main-content"
  - banner [ref=e5]:
    - generic [ref=e6]:
      - link "WordWeave" [ref=e7] [cursor=pointer]:
        - /url: /
      - navigation "Main navigation" [ref=e14]:
        - link "Home" [ref=e15] [cursor=pointer]:
          - /url: /
        - link "Picks" [active] [ref=e16] [cursor=pointer]:
          - /url: /explore
        - link "Learn" [ref=e17] [cursor=pointer]:
          - /url: /create
        - link "Review" [ref=e18] [cursor=pointer]:
          - /url: /review
        - link "Library" [ref=e19] [cursor=pointer]:
          - /url: /library
      - generic [ref=e20]:
        - button "Switch language" [ref=e21] [cursor=pointer]: Chinese
        - link "Log in" [ref=e22] [cursor=pointer]:
          - /url: /login
        - link "Register" [ref=e23] [cursor=pointer]:
          - /url: /register
  - main [ref=e24]:
    - generic [ref=e25]:
      - generic [ref=e27]:
        - heading "Try WordWeave with a story" [level=1] [ref=e28]
        - paragraph [ref=e29]: Choose a story you like and create your own.
      - generic [ref=e30]:
        - paragraph [ref=e31]: Explanation language
        - tablist "Filter by explanation language" [ref=e32]:
          - tab "All 2" [selected] [ref=e33] [cursor=pointer]:
            - generic [ref=e34]: All
            - generic [ref=e35]: "2"
          - tab "Chinese 1" [ref=e36] [cursor=pointer]:
            - generic [ref=e37]: Chinese
            - generic [ref=e38]: "1"
          - tab "English 1" [ref=e39] [cursor=pointer]:
            - generic [ref=e40]: English
            - generic [ref=e41]: "1"
          - tab "Japanese 0" [ref=e42] [cursor=pointer]:
            - generic [ref=e43]: Japanese
            - generic [ref=e44]: "0"
        - tabpanel "All 2" [ref=e45]:
          - region "Featured stories" [ref=e46]:
            - generic [ref=e48]:
              - button "Previous story" [ref=e49] [cursor=pointer]
              - generic [ref=e52]: 1 / 2
              - button "Next story" [ref=e53] [cursor=pointer]
            - group "Featured stories. Swipe or use the left and right arrow keys." [ref=e56]:
              - article [ref=e57]:
                - generic [ref=e58]:
                  - generic [ref=e59]: "01"
                  - heading "A small step — zh" [level=2] [ref=e61]
                  - generic [ref=e62]:
                    - generic [ref=e63]:
                      - term [ref=e64]: AI model
                      - definition [ref=e65]: Quick Context with a deliberately long name for responsive checks
                    - generic [ref=e66]:
                      - term [ref=e67]: Style
                      - definition [ref=e68]: Story
                    - generic [ref=e69]:
                      - term [ref=e70]: Length
                      - definition [ref=e71]: Brief
                    - generic [ref=e72]:
                      - term [ref=e73]: Explanation language
                      - definition [ref=e74]: Chinese
                  - generic [ref=e75]:
                    - heading "Words" [level=3] [ref=e76]
                    - generic [ref=e77]: adapt
                  - link "Try this" [ref=e80] [cursor=pointer]:
                    - /url: /trial/preset-zh
                - generic [ref=e81]:
                  - paragraph [ref=e82]: Story sample
                  - paragraph [ref=e84]: Teams adapt quickly when the context changes.
                  - region "Word meanings" [ref=e85]:
                    - generic [ref=e86]:
                      - heading "Word meanings" [level=3] [ref=e87]
                      - generic [ref=e90]: Chinese
                    - generic [ref=e92]:
                      - term [ref=e93]: adapt
                      - definition [ref=e94]: change to fit a new situation
                  - paragraph [ref=e95]: This is a sample. Your generated story will be different.
              - article [ref=e96]:
                - generic [ref=e97]:
                  - generic [ref=e98]: "02"
                  - heading "A small step — en" [level=2] [ref=e100]
                  - generic [ref=e101]:
                    - generic [ref=e102]:
                      - term [ref=e103]: AI model
                      - definition [ref=e104]: Quick Context with a deliberately long name for responsive checks
                    - generic [ref=e105]:
                      - term [ref=e106]: Style
                      - definition [ref=e107]: Story
                    - generic [ref=e108]:
                      - term [ref=e109]: Length
                      - definition [ref=e110]: Brief
                    - generic [ref=e111]:
                      - term [ref=e112]: Explanation language
                      - definition [ref=e113]: English
                  - generic [ref=e114]:
                    - heading "Words" [level=3] [ref=e115]
                    - generic [ref=e116]: adapt
                  - link "Try this" [ref=e119] [cursor=pointer]:
                    - /url: /trial/preset-en
                - generic [ref=e120]:
                  - paragraph [ref=e121]: Story sample
                  - paragraph [ref=e123]: Teams adapt quickly when the context changes.
                  - region "Word meanings" [ref=e124]:
                    - generic [ref=e125]:
                      - heading "Word meanings" [level=3] [ref=e126]
                      - generic [ref=e129]: English
                    - generic [ref=e131]:
                      - term [ref=e132]: adapt
                      - definition [ref=e133]: change to fit a new situation
                  - paragraph [ref=e134]: This is a sample. Your generated story will be different.
            - paragraph [ref=e135]
  - contentinfo [ref=e136]:
    - generic [ref=e137]: Small moments of learning. Lasting ripples.
```

# Test source

```ts
  38  |     route.fulfill(
  39  |       mode === "failed"
  40  |         ? {
  41  |             status: 503,
  42  |             contentType: "application/problem+json",
  43  |             json: {
  44  |               type: "about:blank",
  45  |               title: "Unavailable",
  46  |               status: 503,
  47  |               code: "temporarily_unavailable",
  48  |               detail: "Try again",
  49  |               request_id: "search-failed",
  50  |             },
  51  |           }
  52  |         : {
  53  |             json: {
  54  |               data: {
  55  |                 items:
  56  |                   mode === "empty" ? [] : entries.map((entry) => ({ entry })),
  57  |                 vocabulary_version: "test",
  58  |               },
  59  |               meta: { request_id: "search" },
  60  |             },
  61  |           },
  62  |     ),
  63  |   );
  64  |   await page.goto("/create");
  65  |   await ready(page);
  66  |   const input = page.getByRole("combobox", {
  67  |     name: t("wordsearch"),
  68  |     exact: true,
  69  |   });
  70  |   await input.fill("adapt");
  71  |   await expect(page.locator(".word-picker-search-state")).toContainText(
  72  |     t("picker.error"),
  73  |   );
  74  |   mode = "empty";
  75  |   await page
  76  |     .locator(".word-picker")
  77  |     .getByRole("button", { name: t("retry"), exact: true })
  78  |     .click();
  79  |   await expect(page.locator(".word-picker-search-state")).toContainText(
  80  |     t("picker.none"),
  81  |   );
  82  |   mode = "ready";
  83  |   for (const entry of entries.slice(0, 5)) {
  84  |     await input.fill(entry);
  85  |     await page.getByRole("option", { name: entry, exact: true }).click();
  86  |   }
  87  |   await expect(page.locator(".word-token")).toHaveCount(5);
  88  |   await expect(page.locator(".word-picker-feedback")).toHaveText(
  89  |     t("picker.full"),
  90  |   );
  91  |   await expect(
  92  |     page.getByRole("button", { name: t("random"), exact: true }),
  93  |   ).toBeDisabled();
  94  |   await input.fill("steady");
  95  |   await expect(
  96  |     page.getByRole("option", { name: "steady", exact: true }),
  97  |   ).toHaveAttribute("aria-disabled", "true");
  98  |   await input.press("Enter");
  99  |   await expect(page.locator(".word-token")).toHaveCount(5);
  100 |   await page
  101 |     .getByRole("button", { name: `${t("remove")} adapt`, exact: true })
  102 |     .click();
  103 |   await expect(
  104 |     page.getByRole("button", { name: t("random"), exact: true }),
  105 |   ).toBeEnabled();
  106 | });
  107 | 
  108 | test("published meanings keep their snapshot language when the interface language changes", async ({
  109 |   page,
  110 |   request,
  111 | }) => {
  112 |   const raw = await (
  113 |     await request.get("http://127.0.0.1:38080/api/v1/presets")
  114 |   ).json();
  115 |   const meanings = [
  116 |     "适应新情况",
  117 |     "change to fit a new situation",
  118 |     "新しい状況に適応する",
  119 |   ];
  120 |   const items = ["zh", "en", "ja"].map((lang, index) => {
  121 |     const item = structuredClone(raw.data.items[0]);
  122 |     item.id = `preset-${lang}`;
  123 |     item.configuration.meaning_language = lang;
  124 |     item.sample.targets[0].entry_meaning = meanings[index];
  125 |     return item;
  126 |   });
  127 |   await page.route("**/api/v1/presets", (route) =>
  128 |     route.fulfill({
  129 |       json: {
  130 |         data: { items },
  131 |         meta: { request_id: "meanings", has_more: false, next_cursor: null },
  132 |       },
  133 |     }),
  134 |   );
  135 |   await page.goto("/");
  136 |   await ready(page);
  137 |   await page.getByRole("link", { name: t("nav.explore"), exact: true }).click();
> 138 |   await expect(page.locator(".preset-meanings dd")).toHaveText(meanings);
      |                                                     ^ Error: expect(locator).toHaveText(expected) failed
  139 |   await page.getByRole("button", { name: t("language"), exact: true }).click();
  140 |   await expect(page.locator(".preset-meanings dd")).toHaveText(meanings);
  141 |   await expect(page.locator(".preset-meanings dt")).toHaveText([
  142 |     "adapt",
  143 |     "adapt",
  144 |     "adapt",
  145 |   ]);
  146 | });
  147 | 
  148 | test("message pagination resets the reading position and keeps the welcome overlay", async ({
  149 |   page,
  150 | }) => {
  151 |   const notice = (id: string) => ({
  152 |     id,
  153 |     title: id,
  154 |     body_html: "<p>Keep learning with a new story.</p>".repeat(
  155 |       id === "notice-1" ? 60 : 1,
  156 |     ),
  157 |     content_locale: "en-US",
  158 |     remind: true,
  159 |     published_at: "2026-09-20T01:00:00Z",
  160 |     revision: "test",
  161 |   });
  162 |   await page.route("**/api/v1/notices**", (route) => {
  163 |     const path = new URL(route.request().url()).pathname;
  164 |     return route.fulfill({
  165 |       json: {
  166 |         data:
  167 |           path === "/api/v1/notices"
  168 |             ? { items: [notice("notice-1"), notice("notice-2")] }
  169 |             : { notice: notice(path.split("/").at(-1)!) },
  170 |         meta: {
  171 |           request_id: "pagination",
  172 |           ...(path === "/api/v1/notices"
  173 |             ? { next_cursor: null, has_more: false }
  174 |             : {}),
  175 |         },
  176 |       },
  177 |     });
  178 |   });
  179 |   await page.goto("/login");
  180 |   await ready(page);
  181 |   await page.getByLabel(t("i.username"), { exact: true }).fill("learner_e2e");
  182 |   await page
  183 |     .getByLabel(t("i.password"), { exact: true })
  184 |     .fill("CorrectPass123!");
  185 |   await page.locator(".auth-form button[type=submit]").click();
  186 |   const dialog = page.locator("dialog[open]"),
  187 |     body = dialog.locator(".notice-reading");
  188 |   await expect(dialog.locator(".notice-heading h2")).toHaveText("notice-1");
  189 |   await expect(page.locator("#toast")).toBeVisible();
  190 |   expect(
  191 |     await page.locator("#toast").evaluate((el) => el.parentElement?.tagName),
  192 |   ).toBe("DIALOG");
  193 |   await body.evaluate((el) => {
  194 |     el.scrollTop = el.scrollHeight;
  195 |   });
  196 |   expect(await body.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  197 |   await dialog.getByRole("button", { name: t("next"), exact: true }).click();
  198 |   await expect(dialog.locator(".notice-heading h2")).toHaveText("notice-2");
  199 |   await expect.poll(() => body.evaluate((el) => el.scrollTop)).toBe(0);
  200 |   await expect(dialog.locator(".dialog-actions")).toBeInViewport();
  201 | });
  202 | 
```