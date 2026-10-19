# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: m002-config-portability.spec.ts >> unknown result survives refresh and resolve never replays imports
- Location: tests/e2e/m002-config-portability.spec.ts:120:1

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: locator.fill: Test timeout of 30000ms exceeded.
Call log:
  - waiting for locator('#cr313-dialog').getByLabel('File password', { exact: true })

```

# Page snapshot

```yaml
- generic [ref=e1]:
  - dialog [ref=e2]:
    - button "Close" [ref=e3] [cursor=pointer]
    - heading "Import and replace model configuration" [active] [level=2] [ref=e7]
    - generic [ref=e8]:
      - paragraph [ref=e9]: After validation, this file replaces the category’s complete active configuration. Existing entries omitted from the file leave the active configuration.
      - generic [ref=e10]:
        - paragraph [ref=e16]: Choosing, decrypting, and previewing do not change the current configuration.
        - button "Choose File" [ref=e17]
        - button "Choose configuration file" [ref=e18] [cursor=pointer]
      - paragraph [ref=e19]: A configuration file can be up to 8 MiB. Choosing, decrypting, and previewing do not change the current configuration.
      - generic [ref=e25]:
        - strong [ref=e26]: "Selected: synthetic-models.wwcfg.json"
        - generic [ref=e27]: Models · Encrypted package · Format 1
      - generic [ref=e28]:
        - generic [ref=e29]: File password
        - textbox "File password Enter the original export password. It must contain 12–128 Unicode scalar values, use no more than 512 UTF-8 bytes, and cannot be all whitespace or contain U+0000. It is not trimmed or Unicode-normalized. Passwords and keys are not shown in the interface, errors, or logs." [ref=e30]
        - generic [ref=e31]: Enter the original export password. It must contain 12–128 Unicode scalar values, use no more than 512 UTF-8 bytes, and cannot be all whitespace or contain U+0000. It is not trimmed or Unicode-normalized. Passwords and keys are not shown in the interface, errors, or logs.
    - generic [ref=e32]:
      - button "Cancel" [ref=e33] [cursor=pointer]
      - button "Decrypt and validate" [ref=e34] [cursor=pointer]
  - generic [ref=e36]:
    - link "Skip to main content" [ref=e37] [cursor=pointer]:
      - /url: "#admin-main"
    - banner [ref=e38]:
      - generic [ref=e39]:
        - link "WordWeave Admin" [ref=e40] [cursor=pointer]:
          - /url: /admin
          - text: WordWeave
          - generic [ref=e47]: Admin
        - generic [ref=e48]:
          - generic [ref=e49]:
            - generic [ref=e50]: Switch language
            - generic [ref=e51]:
              - combobox
              - combobox "Switch language" [ref=e52] [cursor=pointer]:
                - generic [ref=e53]: EN
          - generic [ref=e56]: Administrator
          - button "Log out" [ref=e57] [cursor=pointer]
    - main [ref=e58]:
      - generic [ref=e59]:
        - navigation "Admin" [ref=e60]:
          - link "Overview" [ref=e61] [cursor=pointer]:
            - /url: /admin
          - link "Analytics" [ref=e68] [cursor=pointer]:
            - /url: /admin/analytics
          - link "Models" [ref=e71] [cursor=pointer]:
            - /url: /admin/models
          - link "Plans" [ref=e77] [cursor=pointer]:
            - /url: /admin/plans
          - link "Users" [ref=e83] [cursor=pointer]:
            - /url: /admin/users
          - link "Growth operations" [ref=e88] [cursor=pointer]:
            - /url: /admin/growth
          - link "Messages" [ref=e93] [cursor=pointer]:
            - /url: /admin/notices
          - link "Featured presets" [ref=e98] [cursor=pointer]:
            - /url: /admin/presets
        - generic [ref=e104]:
          - generic [ref=e105]:
            - generic [ref=e106]:
              - heading "Model providers" [level=1] [ref=e107]
              - paragraph [ref=e108]: Manage provider connections and their models.
            - generic [ref=e109]:
              - group "Configuration import and export" [ref=e110]:
                - button "Import configuration" [ref=e111] [cursor=pointer]
                - button "Export configuration" [ref=e114] [cursor=pointer]
              - button "Add provider" [ref=e119] [cursor=pointer]
          - region "Model providers" [ref=e120]:
            - article [ref=e121]:
              - generic [ref=e122]:
                - generic [ref=e129]:
                  - generic [ref=e130]:
                    - heading "Demo service" [level=2] [ref=e131]
                    - generic [ref=e132]: 1 models
                  - paragraph [ref=e133]:
                    - generic [ref=e134]: https://models.example/v1
                    - generic [ref=e135]: OpenAI Chat Completions
                    - generic [ref=e136]: ••••demo
                - button "Edit provider" [ref=e137] [cursor=pointer]
              - article [ref=e139]:
                - generic [ref=e140]:
                  - generic [ref=e141]:
                    - heading "Admin model" [level=3] [ref=e142]
                    - generic [ref=e143]: Enabled
                  - code [ref=e144]: mock/admin-model
                  - paragraph [ref=e145]: Shared model
                - generic [ref=e146]:
                  - button "Test model" [ref=e147] [cursor=pointer]
                  - button "Remove" [ref=e148] [cursor=pointer]
    - contentinfo [ref=e149]: Clear settings, predictable results.
```

# Test source

```ts
  36  |   buffer: Buffer.from(
  37  |     JSON.stringify({
  38  |       format: "wordweave-config-encrypted",
  39  |       version: 1,
  40  |       category: "models",
  41  |       credential_mode: "encrypted",
  42  |       kdf: {},
  43  |       cipher: {},
  44  |       ciphertext: "synthetic",
  45  |     }),
  46  |   ),
  47  | };
  48  | 
  49  | test.beforeEach(async ({ context, request }) => {
  50  |   await request.post("http://127.0.0.1:43131/api/v1/__test/admin-reset");
  51  |   await request.post("http://127.0.0.1:43131/api/v1/__test/portability-reset");
  52  |   await context.addCookies([
  53  |     {
  54  |       name: "wordweave_session",
  55  |       value: "admin",
  56  |       url: "http://127.0.0.1:43130",
  57  |     },
  58  |     {
  59  |       name: "wordweave_ui_locale",
  60  |       value: "en-US",
  61  |       url: "http://127.0.0.1:43130",
  62  |     },
  63  |   ]);
  64  | });
  65  | 
  66  | test("encrypted model import uses a modal, dynamic contract values and one terminal import", async ({
  67  |   page,
  68  | }, info) => {
  69  |   await page.goto("/admin/models");
  70  |   await ready(page);
  71  |   await page
  72  |     .getByRole("button", { name: t("portability.import"), exact: true })
  73  |     .click();
  74  |   const dialog = page.locator("#cr313-dialog");
  75  |   await expect(dialog).toBeVisible();
  76  |   expect(
  77  |     await dialog.evaluate((node) =>
  78  |       (node as HTMLDialogElement).matches(":modal"),
  79  |     ),
  80  |   ).toBe(true);
  81  |   await dialog.locator('input[type="file"]').setInputFiles(encryptedFile);
  82  |   await expect(dialog).toContainText("synthetic-models.wwcfg.json");
  83  |   await expect(dialog).toContainText("Encrypted package");
  84  |   await dialog
  85  |     .getByLabel(t("import.password"), { exact: true })
  86  |     .fill("synthetic password");
  87  |   await dialog
  88  |     .getByRole("button", { name: t("import.validate"), exact: true })
  89  |     .click();
  90  |   await expect(dialog).toContainText("Synthetic connection");
  91  |   await expect(dialog).toContainText(
  92  |     "Encrypted credentials from this file are present for all 1 connections",
  93  |   );
  94  |   await expect(dialog).toContainText(t("notice.nameGenerated"));
  95  |   await expect(dialog).toContainText(t("notice.effectivePlanMayChange"));
  96  |   await dialog
  97  |     .getByRole("button", { name: t("preview.confirm"), exact: true })
  98  |     .click();
  99  |   await expect(dialog.getByText("Legacy model", { exact: true })).toBeVisible();
  100 |   await expect(
  101 |     dialog.getByLabel(t("confirm.ack"), { exact: true }),
  102 |   ).toBeVisible();
  103 |   await dialog.getByLabel(t("confirm.ack"), { exact: true }).check();
  104 |   await dialog
  105 |     .getByRole("button", { name: t("confirm.replace"), exact: true })
  106 |     .click();
  107 |   await expect(dialog).toContainText(t("result.successHelp"));
  108 |   const state = await (
  109 |     await page.request.get(
  110 |       "http://127.0.0.1:43131/api/v1/__test/portability-state",
  111 |     )
  112 |   ).json();
  113 |   expect(state.data.import_calls).toBe(1);
  114 |   await page.screenshot({
  115 |     path: `../.planning/milestones/M002/implementation/config-portability/evidence/frontend/models-success-${info.project.name}.png`,
  116 |     fullPage: true,
  117 |   });
  118 | });
  119 | 
  120 | test("unknown result survives refresh and resolve never replays imports", async ({
  121 |   page,
  122 |   request,
  123 | }) => {
  124 |   await request.post("http://127.0.0.1:43131/api/v1/__test/portability-mode", {
  125 |     data: { mode: "unknown" },
  126 |   });
  127 |   await page.goto("/admin/models");
  128 |   await ready(page);
  129 |   await page
  130 |     .getByRole("button", { name: t("portability.import"), exact: true })
  131 |     .click();
  132 |   const dialog = page.locator("#cr313-dialog");
  133 |   await dialog.locator('input[type="file"]').setInputFiles(encryptedFile);
  134 |   await dialog
  135 |     .getByLabel(t("import.password"), { exact: true })
> 136 |     .fill("synthetic password");
      |      ^ Error: locator.fill: Test timeout of 30000ms exceeded.
  137 |   await dialog
  138 |     .getByRole("button", { name: t("import.validate"), exact: true })
  139 |     .click();
  140 |   await dialog
  141 |     .getByRole("button", { name: t("preview.confirm"), exact: true })
  142 |     .click();
  143 |   await dialog.getByLabel(t("confirm.ack"), { exact: true }).check();
  144 |   await dialog
  145 |     .getByRole("button", { name: t("confirm.replace"), exact: true })
  146 |     .click();
  147 |   await expect(dialog).toContainText(t("result.unknownHelp"));
  148 |   await page.reload();
  149 |   await ready(page);
  150 |   await expect(page.locator("#cr313-dialog")).toContainText(
  151 |     t("result.unknownHelp"),
  152 |   );
  153 |   await page
  154 |     .locator("#cr313-dialog")
  155 |     .getByRole("button", { name: t("result.check"), exact: true })
  156 |     .click();
  157 |   await expect(page.locator("#cr313-dialog")).toContainText(
  158 |     t("result.successHelp"),
  159 |   );
  160 |   const state = await (
  161 |     await request.get("http://127.0.0.1:43131/api/v1/__test/portability-state")
  162 |   ).json();
  163 |   expect(state.data.import_calls).toBe(1);
  164 | });
  165 | 
  166 | test("four approved entries remain category-specific and priority editing stays top-layer", async ({
  167 |   page,
  168 | }, info) => {
  169 |   await page.goto("/admin/plans");
  170 |   await ready(page);
  171 |   await expect(
  172 |     page.getByRole("button", { name: t("portability.import"), exact: true }),
  173 |   ).toHaveCount(1);
  174 |   const priority = page.getByRole("button", {
  175 |     name: "Tier priority",
  176 |     exact: true,
  177 |   });
  178 |   await priority.click();
  179 |   const priorityDialog = page.locator("#priority-editor");
  180 |   expect(
  181 |     await priorityDialog.evaluate((node) =>
  182 |       (node as HTMLDialogElement).matches(":modal"),
  183 |     ),
  184 |   ).toBe(true);
  185 |   const inputs = priorityDialog.locator('input[type="number"]');
  186 |   await inputs.nth(0).fill("37");
  187 |   await inputs.nth(1).fill("41");
  188 |   await priorityDialog
  189 |     .getByRole("button", { name: "Save changes", exact: true })
  190 |     .click();
  191 |   await expect(inputs.nth(0)).toHaveValue("37");
  192 |   await expect(inputs.nth(1)).toHaveValue("41");
  193 |   await page.mouse.click(2, 2);
  194 |   await expect(priorityDialog).toBeVisible();
  195 |   await page.keyboard.press("Escape");
  196 |   await expect(priorityDialog).toBeHidden();
  197 |   await expect(priority).toBeFocused();
  198 | 
  199 |   await page.goto("/admin/growth");
  200 |   await ready(page);
  201 |   await page
  202 |     .getByRole("button", { name: t("portability.import"), exact: true })
  203 |     .click();
  204 |   await expect(page.locator("#cr313-dialog")).toContainText(
  205 |     t("import.titleItems"),
  206 |   );
  207 |   await page
  208 |     .locator("#cr313-dialog")
  209 |     .getByRole("button", { name: t("common.cancel"), exact: true })
  210 |     .click();
  211 |   await page
  212 |     .getByRole("button", { name: "Check-in settings", exact: true })
  213 |     .click();
  214 |   await page
  215 |     .getByRole("button", { name: t("portability.import"), exact: true })
  216 |     .click();
  217 |   await expect(page.locator("#cr313-dialog")).toContainText(
  218 |     t("import.titleGrowth"),
  219 |   );
  220 |   if (info.project.name === "mobile")
  221 |     await page.screenshot({
  222 |       path: "../.planning/milestones/M002/implementation/config-portability/evidence/frontend/growth-entry-mobile-en.png",
  223 |       fullPage: true,
  224 |     });
  225 | });
  226 | 
```