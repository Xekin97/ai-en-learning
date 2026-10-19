# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: m002-config-portability.spec.ts >> four approved entries remain category-specific and priority editing stays top-layer
- Location: tests/e2e/m002-config-portability.spec.ts:166:1

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: locator.click: Test timeout of 30000ms exceeded.
Call log:
  - waiting for getByRole('button', { name: 'Tier priority', exact: true })
    - locator resolved to <button disabled class="btn">Tier priority</button>
  - attempting click action
    2 × waiting for element to be visible, enabled and stable
      - element is not enabled
    - retrying click action
    - waiting 20ms
    2 × waiting for element to be visible, enabled and stable
      - element is not enabled
    - retrying click action
      - waiting 100ms
    56 × waiting for element to be visible, enabled and stable
       - element is not enabled
     - retrying click action
       - waiting 500ms

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
      - generic [ref=e72]:
        - heading "Plans" [level=1] [ref=e73]
        - generic [ref=e74]:
          - group "Configuration import and export" [ref=e75]:
            - button "Import configuration" [ref=e76] [cursor=pointer]
            - button "Export configuration" [ref=e79] [cursor=pointer]
          - button "Tier priority" [disabled] [ref=e84]
  - contentinfo [ref=e86]: Clear settings, predictable results.
```

# Test source

```ts
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
  136 |     .fill("synthetic password");
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
> 178 |   await priority.click();
      |                  ^ Error: locator.click: Test timeout of 30000ms exceeded.
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