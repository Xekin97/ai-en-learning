# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: m002-config-portability-real.spec.ts >> real API normal export, preview, import, current and resolve use the production chain
- Location: tests/e2e/m002-config-portability-real.spec.ts:34:1

# Error details

```
Error: expect(locator).toContainText(expected) failed

Locator: locator('#cr313-dialog')
Expected substring: "Only the selected category was replaced. Runtime history and other categories were unchanged."
Received string:    "No configuration was appliedThe server confirmed that this operation did not replace any configuration. Current configuration is unchanged. To try again, choose the file, preview, and confirm again.Choose file and preview againClose"
Timeout: 5000ms

Call log:
  - Expect "toContainText" with timeout 5000ms
  - waiting for locator('#cr313-dialog')
    2 × locator resolved to <dialog open="" id="cr313-dialog" class="cr313-dialog" aria-labelledby="cr313-dialog-dialog-title">…</dialog>
      - unexpected value "Import and replace model configurationRechecking and replacing the complete category…"
    12 × locator resolved to <dialog open="" id="cr313-dialog" class="cr313-dialog" aria-labelledby="cr313-dialog-dialog-title">…</dialog>
       - unexpected value "No configuration was appliedThe server confirmed that this operation did not replace any configuration. Current configuration is unchanged. To try again, choose the file, preview, and confirm again.Choose file and preview againClose"

```

```yaml
- dialog:
  - button "Close"
  - heading "No configuration was applied" [level=2]
  - paragraph: The server confirmed that this operation did not replace any configuration. Current configuration is unchanged. To try again, choose the file, preview, and confirm again.
  - button "Choose file and preview again"
  - button "Close"
```

# Test source

```ts
  6   | const packagePath = process.env.CR313_REAL_PACKAGE_PATH;
  7   | const passphrase = process.env.CR313_REAL_PACKAGE_PASSPHRASE;
  8   | const approved = JSON.parse(
  9   |   readFileSync(
  10  |     new URL(
  11  |       "../../../.planning/milestones/M002/design/config-portability/copy.json",
  12  |       import.meta.url,
  13  |     ),
  14  |     "utf8",
  15  |   ),
  16  | );
  17  | const alignment = JSON.parse(
  18  |   readFileSync(
  19  |     new URL(
  20  |       "../../../.planning/milestones/M002/design/config-portability/technical-alignment/copy.json",
  21  |       import.meta.url,
  22  |     ),
  23  |     "utf8",
  24  |   ),
  25  | );
  26  | const messages = {
  27  |   ...approved.static,
  28  |   ...approved.templates,
  29  |   ...alignment.static,
  30  |   ...alignment.templates,
  31  | };
  32  | const t = (key: string) => messages[`en.${key}`] as string;
  33  | 
  34  | test("real API normal export, preview, import, current and resolve use the production chain", async ({
  35  |   page,
  36  | }) => {
  37  |   test.skip(
  38  |     !username || !password || !packagePath || !passphrase,
  39  |     "isolated real fixture variables are required",
  40  |   );
  41  |   await page.goto("/login");
  42  |   await page.waitForFunction(
  43  |     () => document.documentElement.dataset.appReady === "true",
  44  |   );
  45  |   await page.locator('input[name="username"]').fill(username!);
  46  |   await page.locator('input[name="password"]').fill(password!);
  47  |   await page.getByRole("button", { name: "Log in", exact: true }).click();
  48  |   await page.waitForURL("**/admin");
  49  |   await page.goto("/admin/models");
  50  |   await page.waitForFunction(
  51  |     () => document.documentElement.dataset.appReady === "true",
  52  |   );
  53  | 
  54  |   await page
  55  |     .getByRole("button", { name: t("portability.export"), exact: true })
  56  |     .click();
  57  |   const dialog = page.locator("#cr313-dialog");
  58  |   const download = page.waitForEvent("download");
  59  |   await dialog
  60  |     .getByRole("button", { name: t("export.prepare"), exact: true })
  61  |     .click();
  62  |   expect((await download).suggestedFilename()).toMatch(
  63  |     /^wordweave-models-\d{8}T\d{6}Z\.json$/,
  64  |   );
  65  |   await dialog.getByRole("button", { name: "Close", exact: true }).click();
  66  | 
  67  |   await page
  68  |     .getByRole("button", { name: t("portability.import"), exact: true })
  69  |     .click();
  70  |   await dialog.locator('input[type="file"]').setInputFiles(packagePath!);
  71  |   await dialog.locator('input[type="password"]').fill(passphrase!);
  72  |   await dialog
  73  |     .getByRole("button", { name: t("import.validate"), exact: true })
  74  |     .click();
  75  |   await expect(
  76  |     dialog.getByRole("button", { name: t("preview.confirm"), exact: true }),
  77  |   ).toBeVisible();
  78  |   await dialog
  79  |     .getByRole("button", { name: t("preview.confirm"), exact: true })
  80  |     .click();
  81  |   await dialog.getByLabel(t("confirm.ack"), { exact: true }).check();
  82  | 
  83  |   let importCalls = 0;
  84  |   await page.route(
  85  |     "**/api/v1/admin/config-portability/models/imports",
  86  |     async (route) => {
  87  |       importCalls++;
  88  |       await route.fetch();
  89  |       await route.abort("failed");
  90  |     },
  91  |   );
  92  |   await dialog
  93  |     .getByRole("button", { name: t("confirm.replace"), exact: true })
  94  |     .click();
  95  |   await expect(dialog).toContainText(t("result.unknownHelp"));
  96  |   expect(importCalls).toBe(1);
  97  | 
  98  |   await dialog
  99  |     .getByRole("button", { name: t("result.read"), exact: true })
  100 |     .click();
  101 |   await expect(dialog).toContainText(t("result.current"));
  102 |   expect(importCalls).toBe(1);
  103 |   await dialog
  104 |     .getByRole("button", { name: t("result.check"), exact: true })
  105 |     .click();
> 106 |   await expect(dialog).toContainText(t("result.successHelp"));
      |                        ^ Error: expect(locator).toContainText(expected) failed
  107 |   expect(importCalls).toBe(1);
  108 | });
  109 | 
```