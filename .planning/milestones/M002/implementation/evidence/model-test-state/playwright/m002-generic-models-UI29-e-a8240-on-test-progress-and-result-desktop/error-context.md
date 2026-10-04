# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: m002-generic-models.spec.ts >> UI29 en >> only the clicked model shows connection test progress and result
- Location: tests/e2e/m002-generic-models.spec.ts:130:5

# Error details

```
Error: expect(locator).toHaveCount(expected) failed

Locator:  locator('.generic-model-row')
Expected: 2
Received: 1
Timeout:  5000ms

Call log:
  - Expect "toHaveCount" with timeout 5000ms
  - waiting for locator('.generic-model-row')
    14 × locator resolved to 1 element
       - unexpected value "1"

```

# Page snapshot

```yaml
- generic [ref=e3]:
  - link "Skip to main content" [ref=e4] [cursor=pointer]:
    - /url: "#admin-main"
  - banner [ref=e5]:
    - generic [ref=e6]:
      - link "WordWeave Admin" [ref=e7] [cursor=pointer]:
        - /url: /admin
        - text: WordWeave
        - generic [ref=e14]: Admin
      - generic [ref=e15]:
        - generic [ref=e16]:
          - generic [ref=e17]: Switch language
          - generic [ref=e18]:
            - combobox
            - combobox "Switch language" [ref=e19] [cursor=pointer]:
              - generic [ref=e20]: EN
        - generic [ref=e23]: Administrator
        - button "Log out" [ref=e24] [cursor=pointer]
  - main [ref=e25]:
    - generic [ref=e26]:
      - navigation "Admin" [ref=e27]:
        - link "Overview" [ref=e28] [cursor=pointer]:
          - /url: /admin
        - link "Analytics" [ref=e35] [cursor=pointer]:
          - /url: /admin/analytics
        - link "Models" [ref=e38] [cursor=pointer]:
          - /url: /admin/models
        - link "Plans" [ref=e44] [cursor=pointer]:
          - /url: /admin/plans
        - link "Users" [ref=e50] [cursor=pointer]:
          - /url: /admin/users
        - link "Growth operations" [ref=e55] [cursor=pointer]:
          - /url: /admin/growth
        - link "Messages" [ref=e60] [cursor=pointer]:
          - /url: /admin/notices
        - link "Featured presets" [ref=e65] [cursor=pointer]:
          - /url: /admin/presets
      - generic [ref=e71]:
        - generic [ref=e72]:
          - generic [ref=e73]:
            - heading "Model services" [level=1] [ref=e74]
            - paragraph [ref=e75]: Connect your model services to bring words to life.
          - button "Add custom model" [ref=e76] [cursor=pointer]
        - region "Model services" [ref=e77]:
          - article [ref=e78]:
            - generic [ref=e85]:
              - generic [ref=e86]:
                - heading "Admin model" [level=2] [ref=e87]
                - generic [ref=e88]: Enabled
              - code [ref=e89]: Demo service/mock/admin-model
              - paragraph [ref=e90]:
                - generic [ref=e91]: https://models.example/v1
                - generic [ref=e92]: OpenAI Chat Completions
                - generic [ref=e93]: ••••demo
              - paragraph [ref=e94]: Shared model
            - generic [ref=e95]:
              - button "Test connection" [ref=e96] [cursor=pointer]
              - button "Edit" [ref=e97] [cursor=pointer]
              - button "Remove" [ref=e98] [cursor=pointer]
  - contentinfo [ref=e99]: Small moments of learning. Lasting ripples.
```

# Test source

```ts
  53  |       await form.locator('[name="displayName"]').fill("Custom service");
  54  |       await form.locator('[name="providerModelId"]').fill("Vendor/Exact-ID");
  55  |       await form.locator('[name="connectionName"]').fill("Private provider");
  56  |       await form
  57  |         .locator('[name="baseUrl"]')
  58  |         .fill("https://provider.example/custom/v1/");
  59  |       await form.locator('[name="apiKey"]').fill("bad-key");
  60  |       for (const protocol of [
  61  |         "openai_responses",
  62  |         "anthropic_messages",
  63  |         "openai_chat",
  64  |       ]) {
  65  |         await selectValue(form.locator("select").nth(1), protocol);
  66  |         await expect(form.locator('[name="providerModelId"]')).toHaveValue(
  67  |           "Vendor/Exact-ID",
  68  |         );
  69  |         await expect(form.locator('[name="baseUrl"]')).toHaveValue(
  70  |           "https://provider.example/custom/v1/",
  71  |         );
  72  |         await expect(form.locator('[name="apiKey"]')).toHaveValue("bad-key");
  73  |       }
  74  |       await dialog
  75  |         .getByRole("button", { name: t("gm.test"), exact: true })
  76  |         .click();
  77  |       await expect(dialog.getByRole("status")).toHaveText(t("gm.testing.auth"));
  78  |       await form.locator('[name="apiKey"]').fill("synthetic-browser-key");
  79  |       await dialog
  80  |         .getByRole("button", { name: t("gm.test"), exact: true })
  81  |         .click();
  82  |       await expect(dialog.getByRole("status")).toHaveText(t("gm.test.ok"));
  83  |       expect(tests).toHaveLength(2);
  84  |       await dialog
  85  |         .getByRole("button", { name: t("gm.save"), exact: true })
  86  |         .click();
  87  |       await expect(dialog).not.toBeVisible();
  88  |       await expect(page.locator(".generic-model-row")).toHaveCount(2);
  89  |       expect(saves).toHaveLength(1);
  90  |       expect(tests).toHaveLength(2);
  91  |       expect(saves[0]).toMatchObject({
  92  |         provider_model_id: "Vendor/Exact-ID",
  93  |         enabled: false,
  94  |         connection: {
  95  |           protocol: "openai_chat",
  96  |           base_url: "https://provider.example/custom/v1/",
  97  |           api_key: "synthetic-browser-key",
  98  |         },
  99  |       });
  100 |       expect(saves[0]).not.toHaveProperty("is_default");
  101 |       const row = page
  102 |         .locator(".generic-model-row")
  103 |         .filter({ hasText: "Custom service" });
  104 |       await row.getByRole("button", { name: t("a.edit"), exact: true }).click();
  105 |       await expect(form.locator('[name="apiKey"]')).toHaveValue("");
  106 |       await expect(form.locator('[name="apiKey"]')).not.toHaveAttribute(
  107 |         "required",
  108 |         "",
  109 |       );
  110 |       const footer = await dialog.locator(".dialog-actions").boundingBox();
  111 |       expect(footer!.y + footer!.height).toBeLessThanOrEqual(
  112 |         page.viewportSize()!.height,
  113 |       );
  114 |       await page.screenshot({
  115 |         path: `../.planning/milestones/M002/implementation/evidence/generic-models29/edit-${info.project.name}-${lang}.png`,
  116 |         fullPage: true,
  117 |       });
  118 |       expect(
  119 |         await page.evaluate(
  120 |           () => document.documentElement.scrollWidth > innerWidth,
  121 |         ),
  122 |       ).toBe(false);
  123 |       expect(
  124 |         await page.evaluate(
  125 |           () => JSON.stringify(localStorage) + JSON.stringify(sessionStorage),
  126 |         ),
  127 |       ).not.toContain("synthetic-browser-key");
  128 |       expect(errors).toEqual([]);
  129 |     });
  130 |     test("only the clicked model shows connection test progress and result", async ({
  131 |       page,
  132 |     }) => {
  133 |       await page.route("**/api/v1/admin/models", async (route) => {
  134 |         const response = await route.fetch();
  135 |         const payload = await response.json();
  136 |         payload.data.items.push({
  137 |           ...payload.data.items[0],
  138 |           id: "model-other",
  139 |           display_name: "Other model",
  140 |           provider_model_id: "Provider/Second-ID",
  141 |         });
  142 |         await route.fulfill({ response, json: payload });
  143 |       });
  144 |       const pending: Route[] = [];
  145 |       await page.route("**/api/v1/admin/model-connection-test", (route) => {
  146 |         pending.push(route);
  147 |       });
  148 |       await page.goto("/admin/models");
  149 |       await page.waitForFunction(
  150 |         () => document.documentElement.dataset.appReady === "true",
  151 |       );
  152 |       const rows = page.locator(".generic-model-row");
> 153 |       await expect(rows).toHaveCount(2);
      |                          ^ Error: expect(locator).toHaveCount(expected) failed
  154 |       const first = rows.nth(0),
  155 |         second = rows.nth(1);
  156 |       await first
  157 |         .getByRole("button", { name: t("gm.test"), exact: true })
  158 |         .click();
  159 |       await expect.poll(() => pending.length).toBe(1);
  160 |       await expect(
  161 |         first.getByRole("button", { name: t("gm.testing"), exact: true }),
  162 |       ).toHaveAttribute("aria-busy", "true");
  163 |       await expect(
  164 |         second.getByRole("button", { name: t("gm.test"), exact: true }),
  165 |       ).toHaveAttribute("aria-busy", "false");
  166 |       await expect(first.getByRole("status")).toHaveText(t("gm.testing"));
  167 |       await expect(second.getByRole("status")).toHaveCount(0);
  168 |       expect(pending[0]!.request().postDataJSON().provider_model_id).not.toBe(
  169 |         "Provider/Second-ID",
  170 |       );
  171 |       await pending[0]!.fulfill({
  172 |         json: { data: { ok: true }, meta: { request_id: "first-probe" } },
  173 |       });
  174 |       await expect(first.getByRole("status")).toHaveText(t("gm.test.ok"));
  175 |       await expect(second.getByRole("status")).toHaveCount(0);
  176 |       await second
  177 |         .getByRole("button", { name: t("gm.test"), exact: true })
  178 |         .click();
  179 |       await expect.poll(() => pending.length).toBe(2);
  180 |       await expect(
  181 |         second.getByRole("button", { name: t("gm.testing"), exact: true }),
  182 |       ).toHaveAttribute("aria-busy", "true");
  183 |       await expect(
  184 |         first.getByRole("button", { name: t("gm.test"), exact: true }),
  185 |       ).toHaveAttribute("aria-busy", "false");
  186 |       expect(pending[1]!.request().postDataJSON().provider_model_id).toBe(
  187 |         "Provider/Second-ID",
  188 |       );
  189 |       await pending[1]!.fulfill({
  190 |         status: 422,
  191 |         contentType: "application/problem+json",
  192 |         json: {
  193 |           type: "about:blank",
  194 |           title: "Authentication failed",
  195 |           status: 422,
  196 |           code: "model_connection_auth",
  197 |           detail: "Invalid credentials",
  198 |           request_id: "second-probe",
  199 |         },
  200 |       });
  201 |       await expect(second.getByRole("status")).toHaveText(t("gm.testing.auth"));
  202 |       await expect(first.getByRole("status")).toHaveCount(0);
  203 |       await first
  204 |         .getByRole("button", { name: t("a.edit"), exact: true })
  205 |         .click();
  206 |       await expect(
  207 |         page.locator("#admin-model").getByRole("status"),
  208 |       ).toHaveCount(0);
  209 |       expect(pending).toHaveLength(2);
  210 |     });
  211 |     test("discard confirmation and revision recovery preserve deliberate edits", async ({
  212 |       page,
  213 |       request,
  214 |     }) => {
  215 |       await page.goto("/admin/models");
  216 |       await page.waitForFunction(
  217 |         () => document.documentElement.dataset.appReady === "true",
  218 |       );
  219 |       const row = page.locator(".generic-model-row");
  220 |       await expect(row).toHaveCount(1);
  221 |       await row.getByRole("button", { name: t("a.edit"), exact: true }).click();
  222 |       const dialog = page.locator("#admin-model"),
  223 |         name = dialog.locator('[name="displayName"]');
  224 |       await name.fill("Edited name");
  225 |       await dialog
  226 |         .getByRole("button", { name: t("cancel"), exact: true })
  227 |         .click();
  228 |       await page
  229 |         .locator("#model-discard")
  230 |         .getByRole("button", { name: t("gm.keep"), exact: true })
  231 |         .click();
  232 |       await expect(name).toHaveValue("Edited name");
  233 |       await request.post("http://127.0.0.1:38084/api/v1/__test/admin-conflict");
  234 |       await dialog
  235 |         .getByRole("button", { name: t("gm.save"), exact: true })
  236 |         .click();
  237 |       await expect(
  238 |         dialog.getByText(t("gm.conflict"), { exact: true }),
  239 |       ).toBeVisible();
  240 |       await dialog
  241 |         .getByRole("button", { name: t("gm.refresh"), exact: true })
  242 |         .click();
  243 |       await expect(name).toHaveValue("Edited name");
  244 |       await dialog
  245 |         .getByRole("button", { name: t("gm.save"), exact: true })
  246 |         .click();
  247 |       await expect(dialog).not.toBeVisible();
  248 |       await expect(row).toContainText("Edited name");
  249 |     });
  250 |   });
  251 | }
  252 | 
```