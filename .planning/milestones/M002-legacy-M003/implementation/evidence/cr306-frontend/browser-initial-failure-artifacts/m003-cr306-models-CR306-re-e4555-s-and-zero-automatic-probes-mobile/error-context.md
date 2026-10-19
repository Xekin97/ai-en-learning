# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: m003-cr306-models.spec.ts >> CR306 real AppDialog keeps raw JSON, stale probes, focus, and zero automatic probes
- Location: tests/e2e/m003-cr306-models.spec.ts:31:1

# Error details

```
Error: locator.click: Error: strict mode violation: locator('#admin-model').locator('.generic-model-item').first().locator('summary') resolved to 2 elements:
    1) <summary>Advanced options</summary> aka getByText('Advanced options')
    2) <summary>View format and protected-field rules</summary> aka getByText('View format and protected-')

Call log:
  - waiting for locator('#admin-model').locator('.generic-model-item').first().locator('summary')

```

# Page snapshot

```yaml
- generic [ref=e1]:
  - dialog [ref=e2]:
    - button "Close" [active] [ref=e3] [cursor=pointer]
    - heading "Edit provider" [level=2] [ref=e6]
    - group [ref=e9]:
      - generic [ref=e10]:
        - generic [ref=e11]:
          - generic [ref=e12]: "1"
          - generic [ref=e13]:
            - heading "Provider" [level=3] [ref=e14]
            - paragraph [ref=e15]: Configure the API connection shared by this provider’s models.
        - generic [ref=e16]:
          - generic [ref=e17]:
            - generic [ref=e18]:
              - generic [ref=e19]: Provider name
              - textbox "Provider name" [ref=e20]:
                - /placeholder: e.g. DeepSeek
                - text: Demo service
            - generic [ref=e21]:
              - generic [ref=e22]:
                - generic [ref=e23]: API protocol
                - generic [ref=e24]:
                  - combobox
                  - combobox "API protocol" [ref=e25] [cursor=pointer]:
                    - generic [ref=e26]: OpenAI Chat Completions
              - paragraph [ref=e29]: Uses Chat Completions. Leave /chat/completions off the base URL.
          - generic [ref=e30]:
            - generic [ref=e31]:
              - generic [ref=e32]: Base URL
              - textbox "Base URL" [ref=e33]:
                - /placeholder: https://api.example.com/v1
                - text: https://models.example/v1
            - paragraph [ref=e34]: Enter the API base URL, usually ending in /v1.
          - generic [ref=e35]:
            - generic [ref=e36]:
              - generic [ref=e37]: API key
              - textbox "API key" [ref=e38]:
                - /placeholder: Configured · leave blank to keep
            - paragraph [ref=e39]: Keys are encrypted on the server and never shown after saving.
          - paragraph [ref=e40]: Connection changes apply to all models under this provider.
      - generic [ref=e41]:
        - generic [ref=e42]:
          - generic [ref=e43]: "2"
          - generic [ref=e44]:
            - heading "Models" [level=3] [ref=e45]
            - paragraph [ref=e46]: Add models from this provider, with settings for each model.
        - generic [ref=e47]:
          - heading "Models 1" [level=4] [ref=e49]
          - generic [ref=e50]:
            - generic [ref=e51]:
              - generic [ref=e52]:
                - generic [ref=e53]: Model ID
                - textbox "Model ID" [ref=e54]:
                  - /placeholder: e.g. deepseek-chat
                  - text: mock/admin-model
              - paragraph [ref=e55]: Use the full model ID, including its case and slashes.
            - generic [ref=e56]:
              - generic [ref=e57]: Display name (optional)
              - textbox "Display name (optional)" [ref=e58]:
                - /placeholder: Leave blank to use the model ID
                - text: Admin model
          - group [ref=e59]:
            - generic "Advanced options" [ref=e60] [cursor=pointer]
          - generic [ref=e61]:
            - generic [ref=e62]:
              - checkbox "Enable model" [checked] [ref=e63]
              - text: Enable model
            - button "Test model" [ref=e64] [cursor=pointer]
        - button "Add another model" [ref=e65] [cursor=pointer]
        - paragraph [ref=e66]: Saving updates configuration without calling the model. Run a connection test separately.
        - paragraph [ref=e67]: A connection test sends a short message with a fixed maximum output of 256 tokens and may incur a small charge. Saving does not require a test.
    - generic [ref=e68]:
      - button "Cancel" [ref=e69] [cursor=pointer]
      - button "Save provider" [ref=e70] [cursor=pointer]
  - generic [ref=e72]:
    - link "Skip to main content" [ref=e73] [cursor=pointer]:
      - /url: "#admin-main"
    - banner [ref=e74]:
      - generic [ref=e75]:
        - link "WordWeave Admin" [ref=e76] [cursor=pointer]:
          - /url: /admin
          - text: WordWeave
          - generic [ref=e83]: Admin
        - generic [ref=e84]:
          - generic [ref=e85]:
            - generic [ref=e86]: Switch language
            - generic [ref=e87]:
              - combobox
              - combobox "Switch language" [ref=e88] [cursor=pointer]:
                - generic [ref=e89]: EN
          - generic [ref=e92]: Administrator
          - button "Log out" [ref=e93] [cursor=pointer]
    - main [ref=e94]:
      - generic [ref=e95]:
        - navigation "Admin" [ref=e96]:
          - link "Overview" [ref=e97] [cursor=pointer]:
            - /url: /admin
          - link "Analytics" [ref=e104] [cursor=pointer]:
            - /url: /admin/analytics
          - link "Models" [ref=e107] [cursor=pointer]:
            - /url: /admin/models
          - link "Plans" [ref=e113] [cursor=pointer]:
            - /url: /admin/plans
          - link "Users" [ref=e119] [cursor=pointer]:
            - /url: /admin/users
          - link "Growth operations" [ref=e124] [cursor=pointer]:
            - /url: /admin/growth
          - link "Messages" [ref=e129] [cursor=pointer]:
            - /url: /admin/notices
          - link "Featured presets" [ref=e134] [cursor=pointer]:
            - /url: /admin/presets
        - generic [ref=e140]:
          - generic [ref=e141]:
            - generic [ref=e142]:
              - heading "Model providers" [level=1] [ref=e143]
              - paragraph [ref=e144]: Manage provider connections and their models.
            - button "Add provider" [ref=e145] [cursor=pointer]
          - region "Model providers" [ref=e146]:
            - article [ref=e147]:
              - generic [ref=e148]:
                - generic [ref=e155]:
                  - generic [ref=e156]:
                    - heading "Demo service" [level=2] [ref=e157]
                    - generic [ref=e158]: 1 models
                  - paragraph [ref=e159]:
                    - generic [ref=e160]: https://models.example/v1
                    - generic [ref=e161]: OpenAI Chat Completions
                    - generic [ref=e162]: ••••demo
                - button "Edit provider" [ref=e163] [cursor=pointer]
              - article [ref=e165]:
                - generic [ref=e166]:
                  - generic [ref=e167]:
                    - heading "Admin model" [level=3] [ref=e168]
                    - generic [ref=e169]: Enabled
                  - code [ref=e170]: mock/admin-model
                  - paragraph [ref=e171]: Shared model
                - generic [ref=e172]:
                  - button "Test model" [ref=e173] [cursor=pointer]
                  - button "Remove" [ref=e174] [cursor=pointer]
    - contentinfo [ref=e175]: Small moments of learning. Lasting ripples.
```

# Test source

```ts
  1   | import { expect, test, type Page, type Route } from "@playwright/test";
  2   | import { readFileSync } from "node:fs";
  3   | 
  4   | const copySource = JSON.parse(
  5   |   readFileSync(
  6   |     new URL(
  7   |       "../../../.planning/milestones/M003/design/copy.json",
  8   |       import.meta.url,
  9   |     ),
  10  |     "utf8",
  11  |   ),
  12  | );
  13  | const api = "http://127.0.0.1:38080/api/v1";
  14  | const ready = (page: Page) =>
  15  |   page.waitForFunction(
  16  |     () => document.documentElement.dataset.appReady === "true",
  17  |   );
  18  | 
  19  | test.beforeEach(async ({ request, context, baseURL }, info) => {
  20  |   await request.post(api + "/__test/admin-reset");
  21  |   await context.addCookies([
  22  |     { name: "wordweave_session", value: "admin", url: baseURL! },
  23  |     {
  24  |       name: "wordweave_ui_locale",
  25  |       value: info.project.name === "mobile" ? "en-US" : "zh-CN",
  26  |       url: baseURL!,
  27  |     },
  28  |   ]);
  29  | });
  30  | 
  31  | test("CR306 real AppDialog keeps raw JSON, stale probes, focus, and zero automatic probes", async ({
  32  |   page,
  33  | }, info) => {
  34  |   const lang = info.project.name === "mobile" ? "en" : "zh";
  35  |   const t = (key: string) => copySource.static[`${lang}.${key}`] as string;
  36  |   const writes: Record<string, unknown>[] = [];
  37  |   let probeCount = 0;
  38  |   page.on("request", (request) => {
  39  |     if (
  40  |       request.url().includes("/admin/model-providers/") &&
  41  |       request.method() === "PATCH"
  42  |     )
  43  |       writes.push(request.postDataJSON());
  44  |   });
  45  | 
  46  |   await page.goto("/admin/models");
  47  |   await ready(page);
  48  |   const opener = page
  49  |     .locator(".generic-provider-card")
  50  |     .getByRole("button", { name: t("gm.edit"), exact: true });
  51  |   await opener.click();
  52  |   const dialog = page.locator("#admin-model"),
  53  |     rows = dialog.locator(".generic-model-item"),
  54  |     body = dialog.locator(".dialog-body"),
  55  |     footer = dialog.locator(".dialog-actions");
  56  |   await expect(dialog).toBeVisible();
  57  |   expect(await dialog.evaluate((element) => element.matches(":modal"))).toBe(
  58  |     true,
  59  |   );
  60  |   expect(
  61  |     await page.evaluate(() =>
  62  |       document.elementFromPoint(2, 2)?.closest("#admin-model")
  63  |         ? "dialog"
  64  |         : "background",
  65  |     ),
  66  |   ).toBe("dialog");
> 67  |   await rows.first().locator("summary").click();
      |                                         ^ Error: locator.click: Error: strict mode violation: locator('#admin-model').locator('.generic-model-item').first().locator('summary') resolved to 2 elements:
  68  |   const firstJson = rows.first().locator(".custom-parameters");
  69  |   await expect(firstJson).toHaveValue("{}");
  70  |   await expect(firstJson).toHaveAccessibleDescription(
  71  |     new RegExp(t("cr306.custom.help")),
  72  |   );
  73  |   await expect(dialog.getByText(t("cr306.save.no-call"))).toBeVisible();
  74  | 
  75  |   let delayedProbe: Route | null = null;
  76  |   await page.route("**/api/v1/admin/model-connection-test", (route) => {
  77  |     probeCount++;
  78  |     delayedProbe = route;
  79  |   });
  80  |   await firstJson.fill('{"temperature":0.4}');
  81  |   await rows
  82  |     .first()
  83  |     .getByRole("button", { name: t("gm.test"), exact: true })
  84  |     .click();
  85  |   await expect.poll(() => probeCount).toBe(1);
  86  |   expect(delayedProbe!.request().postDataJSON().custom_parameters).toEqual({
  87  |     temperature: 0.4,
  88  |   });
  89  |   await firstJson.fill('{"temperature":0.5}');
  90  |   await expect(rows.first().getByRole("status")).toHaveText(
  91  |     t("cr306.probe.stale"),
  92  |   );
  93  |   await delayedProbe!.fulfill({
  94  |     json: { data: { ok: true }, meta: { request_id: "late-probe" } },
  95  |   });
  96  |   await expect(rows.first().getByRole("status")).toHaveText(
  97  |     t("cr306.probe.stale"),
  98  |   );
  99  | 
  100 |   await dialog
  101 |     .getByRole("button", { name: t("gm.model.add"), exact: true })
  102 |     .click();
  103 |   await rows.nth(1).locator('[name="providerModelId"]').fill("Provider/Second");
  104 |   await rows.nth(1).locator("summary").click();
  105 |   const secondJson = rows.nth(1).locator(".custom-parameters");
  106 |   const invalidRaw = '{"reasoning":{"enabled":false,"enabled":true}}';
  107 |   await secondJson.fill(invalidRaw);
  108 |   await dialog.getByRole("button", { name: t("gm.save"), exact: true }).click();
  109 |   await expect(secondJson).toHaveValue(invalidRaw);
  110 |   await expect(secondJson).toHaveAttribute("aria-invalid", "true");
  111 |   await expect(secondJson).toBeFocused();
  112 |   await expect(dialog.getByText(t("cr306.error.duplicate_key"))).toBeVisible();
  113 |   expect(writes).toHaveLength(0);
  114 |   expect(probeCount).toBe(1);
  115 | 
  116 |   const headerBefore = await dialog.locator("h2").boundingBox();
  117 |   const footerBefore = await footer.boundingBox();
  118 |   await body.evaluate((element) => {
  119 |     element.scrollTop = element.scrollHeight;
  120 |   });
  121 |   expect(await dialog.locator("h2").boundingBox()).toEqual(headerBefore);
  122 |   expect(await footer.boundingBox()).toEqual(footerBefore);
  123 | 
  124 |   const footerCancel = footer.getByRole("button", {
  125 |     name: t("cancel"),
  126 |     exact: true,
  127 |   });
  128 |   await footerCancel.click();
  129 |   const discard = page.locator("#model-discard");
  130 |   await expect(discard).toBeVisible();
  131 |   await discard
  132 |     .getByRole("button", { name: t("gm.keep"), exact: true })
  133 |     .click();
  134 |   await expect(footerCancel).toBeFocused();
  135 |   await page.keyboard.press("Escape");
  136 |   await expect(discard).toBeVisible();
  137 |   await discard
  138 |     .getByRole("button", { name: t("gm.keep"), exact: true })
  139 |     .click();
  140 |   await expect(footerCancel).toBeFocused();
  141 |   await dialog.locator(".dialog-close").click();
  142 |   await expect(discard).toBeVisible();
  143 |   await discard
  144 |     .getByRole("button", { name: t("gm.keep"), exact: true })
  145 |     .click();
  146 |   await page.mouse.click(2, 2);
  147 |   await expect(discard).toBeVisible();
  148 |   await discard
  149 |     .getByRole("button", { name: t("gm.keep"), exact: true })
  150 |     .click();
  151 | 
  152 |   await secondJson.fill('{"reasoning":{"enabled":false}}');
  153 |   await dialog.getByRole("button", { name: t("gm.save"), exact: true }).click();
  154 |   await expect(dialog).not.toBeVisible();
  155 |   expect(writes).toHaveLength(1);
  156 |   expect(probeCount).toBe(1);
  157 |   expect(
  158 |     (writes[0]!.models as Array<Record<string, unknown>>).map(
  159 |       (model) => model.custom_parameters,
  160 |     ),
  161 |   ).toEqual([{ temperature: 0.5 }, { reasoning: { enabled: false } }]);
  162 | 
  163 |   await opener.click();
  164 |   await expect(rows).toHaveCount(2);
  165 |   await rows.first().locator("summary").click();
  166 |   await expect(rows.first().locator(".custom-parameters")).toHaveValue(
  167 |     /"temperature": 0.5/,
```