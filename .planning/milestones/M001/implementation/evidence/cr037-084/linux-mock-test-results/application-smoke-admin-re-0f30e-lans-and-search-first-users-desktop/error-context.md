# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: application-smoke.spec.ts >> admin revision matches approved workspace, dialogs, plans and search-first users
- Location: tests/e2e/application-smoke.spec.ts:621:1

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: 23
Received: 24
```

# Page snapshot

```yaml
- generic [ref=e1]:
  - generic [ref=e3]:
    - link "Skip to main content" [ref=e4] [cursor=pointer]:
      - /url: "#admin-main"
    - complementary [ref=e5]:
      - link "WordWeave Admin" [ref=e6] [cursor=pointer]:
        - /url: /
        - generic [ref=e13]: WordWeave
        - generic [ref=e15]: Admin
      - generic [ref=e16]: System
      - navigation "ADMIN WORKSPACE" [ref=e17]:
        - link "Models" [ref=e18] [cursor=pointer]:
          - /url: /admin/models
        - link "Plans" [ref=e22] [cursor=pointer]:
          - /url: /admin/plans
        - link "Users" [ref=e26] [cursor=pointer]:
          - /url: /admin/users
      - generic [ref=e31]:
        - generic [ref=e32]:
          - generic [ref=e33]: A
          - generic [ref=e34]:
            - strong [ref=e35]: admin_e2e
            - generic [ref=e36]: Administrator
        - generic [ref=e37]:
          - generic [ref=e38]:
            - generic [ref=e39]: Interface language
            - combobox "Interface language" [ref=e44] [cursor=pointer]:
              - option "中文"
              - option "EN" [selected]
          - button "Sign out" [ref=e45] [cursor=pointer]
    - main [ref=e49]:
      - generic [ref=e51]:
        - generic [ref=e52]:
          - generic [ref=e53]:
            - paragraph [ref=e54]: ADMIN WORKSPACE
            - heading "OpenRouter & models" [level=1] [ref=e55]
            - paragraph [ref=e56]: Manage your API key and available models.
          - button "Add model" [ref=e57] [cursor=pointer]
        - generic [ref=e58]:
          - generic [ref=e59]:
            - generic [ref=e60]:
              - heading "OpenRouter API Key" [level=2] [ref=e61]
              - paragraph [ref=e62]: Shared by all models
            - generic [ref=e63]: Configured
          - generic [ref=e65]:
            - generic [ref=e66]: Current key
            - generic [ref=e67]: sk-or-••••e2e
          - button "Replace key" [ref=e69] [cursor=pointer]
        - generic [ref=e70]:
          - generic [ref=e71]:
            - heading "Models" [level=2] [ref=e72]
            - generic [ref=e73]: 1 models
          - article [ref=e76]:
            - generic [ref=e77]:
              - generic [ref=e78]:
                - text: Quick Context with a deliberately long name for responsive checks
                - generic [ref=e79]: Active
              - generic [ref=e80]: Fast stories for everyday learning in a clear and natural context
              - generic [ref=e81]: mock/quick-context· 4 plans assignments
            - button "Edit" [ref=e82] [cursor=pointer]
  - dialog [ref=e83]:
    - heading "Add model" [level=2] [ref=e85]
    - generic [ref=e87]:
      - generic [ref=e88]:
        - generic [ref=e89]: Display name
        - textbox "Display name Learners will see this name" [active] [ref=e90]
        - generic [ref=e91]: Learners will see this name
      - generic [ref=e92]:
        - generic [ref=e93]: Description
        - textbox "Description Help learners choose" [ref=e94]
        - generic [ref=e95]: Help learners choose
      - generic [ref=e96]:
        - generic [ref=e97]: OpenRouter model ID
        - textbox "OpenRouter model ID Admins only" [ref=e98]
        - generic [ref=e99]: Admins only
      - generic [ref=e100]:
        - checkbox "Active" [checked] [ref=e101] [cursor=pointer]
        - generic [ref=e103]: Active
      - generic [ref=e104]: Inactive models won’t be used for new stories. Existing content stays available.
    - generic [ref=e109]:
      - button "Cancel" [ref=e110] [cursor=pointer]
      - button "Save model" [disabled] [ref=e111]
```

# Test source

```ts
  1   | import { expect, test, type Page } from "@playwright/test";
  2   | import AxeBuilder from "@axe-core/playwright";
  3   | 
  4   | const baseURL = "http://127.0.0.1:3300";
  5   | 
  6   | async function ready(page: Page) {
  7   |   await page.waitForFunction(
  8   |     () => document.documentElement.dataset.appReady === "true",
  9   |   );
  10  | }
  11  | 
  12  | async function expectModelDialogSpacing(page: Page) {
  13  |   const fields = page.getByRole("dialog").locator(".field");
  14  |   const first = await fields.nth(0).boundingBox();
  15  |   const second = await fields.nth(1).boundingBox();
  16  |   const third = await fields.nth(2).boundingBox();
  17  |   const toggle = await page
  18  |     .getByRole("dialog")
  19  |     .locator(".switch")
  20  |     .boundingBox();
  21  |   const notice = await page
  22  |     .getByRole("dialog")
  23  |     .locator(".notice")
  24  |     .boundingBox();
  25  |   if (!first || !second || !third || !toggle || !notice)
  26  |     throw new Error("Model dialog fields must be visible");
  27  |   expect(Math.round(second.y - first.y - first.height)).toBe(20);
  28  |   expect(Math.round(third.y - second.y - second.height)).toBe(20);
  29  |   expect(Math.round(toggle.y - third.y - third.height)).toBe(16);
> 30  |   expect(Math.round(notice.y - toggle.y - toggle.height)).toBe(23);
      |                                                           ^ Error: expect(received).toBe(expected) // Object.is equality
  31  | }
  32  | 
  33  | async function useRole(
  34  |   page: Page,
  35  |   role: "visitor" | "learner" | "admin",
  36  |   locale: "zh-CN" | "en-US" = "en-US",
  37  | ) {
  38  |   await page.context().clearCookies();
  39  |   if (role !== "visitor") {
  40  |     await page.context().addCookies([
  41  |       {
  42  |         name: "wordweave_session",
  43  |         value: role,
  44  |         url: baseURL,
  45  |       },
  46  |       {
  47  |         name: "wordweave_ui_locale",
  48  |         value: locale,
  49  |         url: baseURL,
  50  |       },
  51  |     ]);
  52  |   }
  53  | }
  54  | 
  55  | function seriousViolations(result: Awaited<ReturnType<AxeBuilder["analyze"]>>) {
  56  |   return result.violations.filter(
  57  |     (violation) =>
  58  |       violation.impact === "critical" || violation.impact === "serious",
  59  |   );
  60  | }
  61  | 
  62  | async function clickLibraryNavigation(page: Page) {
  63  |   const mobileToggle = page.locator(".mobile-nav-toggle");
  64  |   if (await mobileToggle.isVisible()) {
  65  |     await mobileToggle.click();
  66  |     await page.locator('.mobile-menu-list a[href="/library"]').click();
  67  |     return;
  68  |   }
  69  |   await page.locator('.main-nav a[href="/library"]').click();
  70  | }
  71  | 
  72  | async function chooseGenerationSettings(page: Page) {
  73  |   await page.locator(".choice-grid-model button.choice").first().click();
  74  |   await page
  75  |     .locator(".choice-grid-3 button.choice")
  76  |     .filter({ hasText: "English" })
  77  |     .click();
  78  |   await page
  79  |     .locator(".choice-grid-scenario button.choice")
  80  |     .filter({ hasText: "Story" })
  81  |     .click();
  82  |   await page
  83  |     .locator(".choice-grid-4 button.choice")
  84  |     .filter({ hasText: "Brief" })
  85  |     .click();
  86  | }
  87  | 
  88  | async function chooseAdapt(page: Page) {
  89  |   await page.locator("#word-search").fill("ada");
  90  |   await page
  91  |     .locator(".word-search-overlay")
  92  |     .getByRole("option", { name: "adapt", exact: true })
  93  |     .click();
  94  | }
  95  | 
  96  | test("localized brand and all three homepage tasks preserve guest intent", async ({
  97  |   page,
  98  | }) => {
  99  |   await useRole(page, "visitor");
  100 |   const privateRequests: string[] = [];
  101 |   page.on("request", (request) => {
  102 |     if (
  103 |       request.url().includes("/api/v1/me/learning-summary") ||
  104 |       request.url().includes("/api/v1/me/batches")
  105 |     )
  106 |       privateRequests.push(request.url());
  107 |   });
  108 |   await page.goto("/");
  109 |   await ready(page);
  110 | 
  111 |   const brand = page.locator(".app-header .brand-name");
  112 |   await expect(brand).toHaveText("WordWeave");
  113 |   await expect(page.locator(".hero-actions a")).toHaveCount(3);
  114 |   await expect(page.locator('.hero-actions a[href="/library"]')).toHaveText(
  115 |     "Library",
  116 |   );
  117 | 
  118 |   await page.locator('.hero-actions a[href="/library"]').click();
  119 |   await expect(page).toHaveURL(/\/library$/);
  120 |   await expect(page.locator(".auth-gate")).toBeVisible();
  121 |   await expect(page.locator(".auth-gate .eyebrow")).toHaveText(
  122 |     "Sign in to continue",
  123 |   );
  124 |   await expect(page.locator(".auth-gate")).toContainText(
  125 |     "Keep your library and continue reviewing from any session.",
  126 |   );
  127 |   await expect(
  128 |     page.getByRole("link", { name: "Sign in and continue" }),
  129 |   ).toHaveAttribute("href", "/login?redirect=/library");
  130 |   await expect(
```