import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const baseURL = "http://127.0.0.1:3300";

async function ready(page: Page) {
  await page.waitForFunction(
    () => document.documentElement.dataset.appReady === "true",
  );
}

async function expectModelDialogSpacing(page: Page) {
  const fields = page.getByRole("dialog").locator(".field");
  const first = await fields.nth(0).boundingBox();
  const second = await fields.nth(1).boundingBox();
  const third = await fields.nth(2).boundingBox();
  const toggle = await page
    .getByRole("dialog")
    .locator(".switch")
    .boundingBox();
  const notice = await page
    .getByRole("dialog")
    .locator(".notice")
    .boundingBox();
  if (!first || !second || !third || !toggle || !notice)
    throw new Error("Model dialog fields must be visible");
  expect(Math.round(second.y - first.y - first.height)).toBe(20);
  expect(Math.round(third.y - second.y - second.height)).toBe(20);
  expect(Math.round(toggle.y - third.y - third.height)).toBe(16);
  expect(Math.round(notice.y - toggle.y - toggle.height)).toBe(23);
}

async function useRole(
  page: Page,
  role: "visitor" | "learner" | "admin",
  locale: "zh-CN" | "en-US" = "en-US",
) {
  await page.context().clearCookies();
  if (role !== "visitor") {
    await page.context().addCookies([
      {
        name: "wordweave_session",
        value: role,
        url: baseURL,
      },
      {
        name: "wordweave_ui_locale",
        value: locale,
        url: baseURL,
      },
    ]);
  }
}

function seriousViolations(result: Awaited<ReturnType<AxeBuilder["analyze"]>>) {
  return result.violations.filter(
    (violation) =>
      violation.impact === "critical" || violation.impact === "serious",
  );
}

async function clickLibraryNavigation(page: Page) {
  const mobileToggle = page.locator(".mobile-nav-toggle");
  if (await mobileToggle.isVisible()) {
    await mobileToggle.click();
    await page.locator('.mobile-menu-list a[href="/library"]').click();
    return;
  }
  await page.locator('.main-nav a[href="/library"]').click();
}

async function chooseGenerationSettings(page: Page) {
  await page.locator(".choice-grid-model button.choice").first().click();
  await page
    .locator(".choice-grid-3 button.choice")
    .filter({ hasText: "English" })
    .click();
  await page
    .locator(".choice-grid-scenario button.choice")
    .filter({ hasText: "Story" })
    .click();
  await page
    .locator(".choice-grid-4 button.choice")
    .filter({ hasText: "Brief" })
    .click();
}

async function chooseAdapt(page: Page) {
  await page.locator("#word-search").fill("ada");
  await page
    .locator(".word-search-overlay")
    .getByRole("option", { name: "adapt", exact: true })
    .click();
}

test("localized brand and all three homepage tasks preserve guest intent", async ({
  page,
}) => {
  await useRole(page, "visitor");
  const privateRequests: string[] = [];
  page.on("request", (request) => {
    if (
      request.url().includes("/api/v1/me/learning-summary") ||
      request.url().includes("/api/v1/me/batches")
    )
      privateRequests.push(request.url());
  });
  await page.goto("/");
  await ready(page);

  const brand = page.locator(".app-header .brand-name");
  await expect(brand).toHaveText("WordWeave");
  await expect(page.locator(".hero-actions a")).toHaveCount(3);
  await expect(page.locator('.hero-actions a[href="/library"]')).toHaveText(
    "Library",
  );

  await page.locator('.hero-actions a[href="/library"]').click();
  await expect(page).toHaveURL(/\/library$/);
  await expect(page.locator(".auth-gate")).toBeVisible();
  await expect(page.locator(".auth-gate .eyebrow")).toHaveText(
    "Sign in to continue",
  );
  await expect(page.locator(".auth-gate")).toContainText(
    "Keep your library and continue reviewing from any session.",
  );
  await expect(
    page.getByRole("link", { name: "Sign in and continue" }),
  ).toHaveAttribute("href", "/login?redirect=/library");
  await expect(
    page.locator(".auth-gate").getByRole("link", { name: "Create account" }),
  ).toHaveAttribute("href", "/register?redirect=/library");
  expect(privateRequests).toEqual([]);

  await page.locator(".app-header .locale-switch select").selectOption("zh-CN");
  await expect(brand).toHaveText("词涟");
  await expect(page.locator(".app-header")).not.toContainText("WordWeave");
  await page.reload();
  await expect(brand).toHaveText("词涟");
});

test("guest review gate stays in place and carries safe return intent", async ({
  page,
}) => {
  await useRole(page, "visitor");
  const privateRequests: string[] = [];
  page.on("request", (request) => {
    if (
      request.url().includes("/api/v1/me/review-range") ||
      request.url().includes("/api/v1/me/review-sessions")
    )
      privateRequests.push(request.url());
  });
  await page.goto("/review");
  await ready(page);
  await expect(page).toHaveURL(/\/review$/);
  await expect(page.locator(".auth-gate")).toContainText(
    "Sign in to open Review",
  );
  await expect(page.locator(".auth-gate .eyebrow")).toHaveText(
    "Sign in to continue",
  );
  await expect(page.locator(".auth-gate")).toContainText(
    "Keep your library and continue reviewing from any session.",
  );
  await expect(
    page.getByRole("link", { name: "Sign in and continue" }),
  ).toHaveAttribute("href", "/login?redirect=/review");
  expect(privateRequests).toEqual([]);
  await page.getByRole("link", { name: "Sign in and continue" }).click();
  await page.getByLabel("Username").fill("learner_e2e");
  await page.getByLabel("Password").fill("Password123!");
  await page.getByRole("button", { name: "Sign in and continue" }).click();
  await expect(page).toHaveURL(/\/review$/);
  await expect(page.locator(".auth-gate")).toHaveCount(0);
});

test("word suggestions overlay a compact, unselected and bounded creation form", async ({
  page,
}) => {
  await useRole(page, "visitor");
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto("/create");
  await ready(page);

  const sidebar = page.locator(".studio-sidebar");
  const modelChoice = page.locator(".choice-grid-model button.choice");
  await expect(modelChoice).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator('button.choice[aria-pressed="true"]')).toHaveCount(
    0,
  );
  await expect(page.locator(".generate-bar .button-primary")).toBeDisabled();
  expect(
    await modelChoice.evaluate((node) => getComputedStyle(node).borderStyle),
  ).toBe("solid");
  const choiceBox = await modelChoice.boundingBox();
  const sidebarBox = await sidebar.boundingBox();
  expect(choiceBox).not.toBeNull();
  expect(sidebarBox).not.toBeNull();
  expect(choiceBox!.x + choiceBox!.width).toBeLessThanOrEqual(
    sidebarBox!.x + sidebarBox!.width + 0.5,
  );

  const heightBefore = sidebarBox?.height;
  await page.locator("#word-search").fill("ada");
  const overlay = page.locator(".word-search-overlay");
  await expect(overlay).toBeVisible();
  expect(
    await overlay.evaluate((node) => getComputedStyle(node).position),
  ).toBe("absolute");
  expect((await sidebar.boundingBox())?.height).toBe(heightBefore);
  await overlay.getByRole("option", { name: "adapt", exact: true }).click();
  await expect(page.locator(".studio-chip-list")).toContainText("adapt");
  await expect(page.locator(".generate-bar .button-primary")).toBeDisabled();
});

test("creation requires four explicit choices and resets them for another task", async ({
  page,
}) => {
  await useRole(page, "visitor");
  await page.goto("/create");
  await ready(page);

  await chooseAdapt(page);
  const generate = page.locator(".generate-bar .button-primary");
  await expect(generate).toBeDisabled();
  await chooseGenerationSettings(page);
  await expect(page.locator('button.choice[aria-pressed="true"]')).toHaveCount(
    4,
  );
  await expect(generate).toBeEnabled();

  await page.locator(".app-header .locale-switch select").selectOption("zh-CN");
  await expect(page.locator('button.choice[aria-pressed="true"]')).toHaveCount(
    4,
  );
  await expect(generate).toBeEnabled();

  await generate.click();
  await expect(page.locator(".result-action-bar")).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator(".result-action-bar .button-secondary").click();

  await expect(page.locator(".studio-chip-list .chip")).toHaveCount(0);
  await expect(page.locator('button.choice[aria-pressed="true"]')).toHaveCount(
    0,
  );
  await expect(generate).toBeDisabled();
});

test("creation stays unavailable when the group has no model or length", async ({
  page,
}) => {
  await useRole(page, "visitor");
  await page.context().addCookies([
    {
      name: "wordweave_test_generation",
      value: "unavailable",
      url: baseURL,
    },
  ]);
  await page.goto("/create");
  await ready(page);

  await expect(page.locator(".choice-grid-model button.choice")).toHaveCount(0);
  await expect(page.locator(".choice-grid-4 button.choice")).toHaveCount(0);
  await chooseAdapt(page);
  await expect(page.locator(".generate-bar .button-primary")).toBeDisabled();
});

test("a valid unsaved generation cannot be abandoned silently", async ({
  page,
}) => {
  await useRole(page, "learner");
  await page.goto("/create");
  await ready(page);
  await chooseAdapt(page);
  await chooseGenerationSettings(page);
  await page.getByRole("button", { name: "Create story" }).click();
  await expect(
    page.getByRole("button", { name: "Save to library" }),
  ).toBeVisible();

  page.once("dialog", (dialog) => dialog.dismiss());
  await clickLibraryNavigation(page);
  await expect(page).toHaveURL(/\/create$/);
  await expect(
    page.getByRole("button", { name: "Save to library" }),
  ).toBeVisible();

  let discarded = false;
  page.on("request", (request) => {
    if (
      request.method() === "POST" &&
      request.url().endsWith("/api/v1/generations/run-e2e/discard")
    )
      discarded = true;
  });
  page.once("dialog", (dialog) => dialog.accept());
  await clickLibraryNavigation(page);
  await expect(page).toHaveURL(/\/library$/);
  expect(discarded).toBe(true);
});

test("learner pages expose six statistics, Basic copy and single-review context", async ({
  page,
}) => {
  await useRole(page, "learner", "zh-CN");

  await page.goto("/library");
  await ready(page);
  await expect(page.locator(".stat-card")).toHaveCount(6);
  await expect(page.locator(".stats-grid")).toContainText("暂不参与");
  await expect(page.locator(".stats-grid")).toContainText("掌握短文");

  await page.goto("/account");
  await ready(page);
  await expect(page.locator(".definition-list")).toContainText("基础版");
  await expect(page.locator(".definition-list")).not.toContainText("正式账号");
  await expect(page.locator("dl.definition-list")).toHaveCount(1);
  await page.getByRole("button", { name: "删除我的账号" }).click();
  const confirmation = page.getByRole("checkbox", {
    name: "我了解这项操作无法撤销",
  });
  await expect(confirmation).toHaveCount(1);
  await expect(confirmation).not.toBeChecked();
  await confirmation.focus();
  await confirmation.press("Space");
  await expect(confirmation).toBeChecked();
  await page.getByRole("button", { name: "保留账号" }).click();

  await page.goto("/review/session-single");
  await ready(page);
  await expect(page.locator(".review-source-badge")).toHaveText("本篇复习");
  await expect(
    page.getByRole("link", { name: /返回学习记录/ }),
  ).toHaveAttribute("href", "/library");
  await expect(page.locator(".progress-labels")).toHaveAttribute(
    "aria-label",
    "已完成 0 / 1 篇",
  );
});

test("library normal, first-empty and search-empty states match their approved variants", async ({
  page,
}) => {
  await useRole(page, "learner");
  await page.goto("/library");
  await ready(page);
  await expect(page.locator(".stats-grid .stat-label")).toHaveText([
    "Stories created",
    "Words explored",
    "Include in reviews",
    "Not included",
    "Reviews completed",
    "Stories mastered",
  ]);

  await page.getByLabel("Search library").fill("absentword");
  await page.getByLabel("Search library").press("Enter");
  await expect(
    page.getByRole("heading", { name: "No stories found" }),
  ).toBeVisible();
  await expect(page.locator(".stats-grid .stat-card")).toHaveCount(6);
  await expect(page.getByLabel("Search library")).toBeVisible();
  await expect(
    page.locator(".empty-state").getByRole("link", { name: "Create" }),
  ).toHaveCount(0);

  await page.context().addCookies([
    {
      name: "wordweave_test_library",
      value: "empty",
      url: baseURL,
    },
  ]);
  await page.goto("/library");
  await ready(page);
  await expect(page.locator(".page-heading .eyebrow")).toHaveText(
    "Your learning space",
  );
  await expect(page.locator(".page-heading .page-description")).toHaveText(
    "Everything you save lives here.",
  );
  await expect(
    page.getByRole("heading", { name: "Your library is ready" }),
  ).toBeVisible();
  await expect(
    page.locator(".empty-state").getByRole("link", { name: "Create" }),
  ).toBeVisible();
  await expect(page.locator(".stats-grid")).toHaveCount(0);
  await expect(page.getByLabel("Search library")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Review by date" })).toHaveCount(
    0,
  );
});

for (const role of ["admin", "learner"] as const) {
  for (const accountLocale of ["zh-CN", "en-US"] as const) {
    test(`login applies ${role} account locale ${accountLocale} before navigating`, async ({
      page,
    }) => {
      await useRole(page, "visitor");
      const browserLocale = accountLocale === "zh-CN" ? "en-US" : "zh-CN";
      await page
        .context()
        .addCookies([
          { name: "wordweave_ui_locale", value: browserLocale, url: baseURL },
        ]);
      await page.route("**/api/v1/auth/login", async (route) => {
        const response = await route.fetch();
        const body = await response.json();
        body.data.ui_locale = accountLocale;
        await route.fulfill({ response, json: body });
      });
      await page.goto("/login");
      await ready(page);
      await expect(page.locator("html")).toHaveAttribute("lang", browserLocale);
      await page.locator('input[autocomplete="username"]').fill(role + "_e2e");
      await page.locator('input[type="password"]').fill("CorrectPass123!");
      await page.locator('form button[type="submit"]').click();
      await expect(page).toHaveURL(
        role === "admin" ? /\/admin\/models$/ : /\/library$/,
      );
      await expect(page.locator("html")).toHaveAttribute("lang", accountLocale);
      await expect(page.locator(".brand-name").first()).toHaveText(
        accountLocale === "zh-CN" ? "词涟" : "WordWeave",
      );
      await page.reload();
      await expect(page.locator("html")).toHaveAttribute("lang", accountLocale);
    });
  }
}

test("login credential errors use the approved notice structure and remain retryable", async ({
  page,
}) => {
  await useRole(page, "visitor");
  await page.goto("/login");
  await ready(page);
  await page.getByLabel("Username").fill("learner_e2e");
  await page.getByLabel("Password").fill("WrongPass123!");
  await page.getByRole("button", { name: "Sign in and continue" }).click();

  const notice = page.locator(".app-error");
  await expect(notice).toContainText(
    "That username or password doesn’t look right.",
  );
  await expect(notice.locator(":scope > .icon")).toHaveCount(1);
  await expect(notice.locator(":scope > div")).toHaveCount(1);
  await expect(notice).not.toContainText("req-");
  await expect(page.getByLabel("Username")).toHaveValue("learner_e2e");
  await expect(
    page.getByRole("button", { name: "Sign in and continue" }),
  ).toBeEnabled();
});

test("single and date review summaries expose all four approved states", async ({
  page,
}) => {
  await useRole(page, "learner");
  const cases = [
    {
      path: "/review/session-single-complete?batch=batch-e2e",
      eyebrow: "Story review complete",
      title: "This story is complete",
      description: "You’re done for today. Keep it going.",
      restart: "Review this story again",
      values: ["1", "1", "0"],
    },
    {
      path: "/review/session-single-incomplete?batch=batch-e2e",
      eyebrow: "Story review complete",
      title: "Give this story another try",
      description: "That’s okay. Try it again next round.",
      restart: "Review this story again",
      values: ["1", "0", "1"],
    },
    {
      path: "/review/session-range-complete",
      eyebrow: "Date review complete",
      title: "All 5 stories completed",
      description: "You’re done for today. Keep it going.",
      restart: "Review again",
      values: ["5", "4", "1"],
    },
    {
      path: "/review/session-range-incomplete",
      eyebrow: "Date review complete",
      title: "5 stories reviewed",
      description: "A few stories need another look. See you next time.",
      restart: "Review again",
      values: ["5", "3", "2"],
    },
  ];

  for (const state of cases) {
    await page.goto(state.path);
    await ready(page);
    const summary = page.locator(".review-summary-card");
    await expect(summary.locator(".eyebrow")).toHaveText(state.eyebrow);
    await expect(
      summary.getByRole("heading", { name: state.title }),
    ).toBeVisible();
    await expect(summary.locator(".page-description")).toHaveText(
      state.description,
    );
    await expect(summary.locator(".stat-value")).toHaveText(state.values);
    await expect(summary.locator(".stat-label")).toHaveText([
      "Completed",
      "Mastered",
      "Review again",
    ]);
    await expect(
      summary.getByRole("link", { name: "View library" }),
    ).toHaveAttribute("href", "/library");
    await expect(
      summary.getByRole("button", { name: state.restart }),
    ).toBeVisible();
    await expect(page.locator(".review-context")).toHaveCount(0);
  }
});

test("summary restart actions create a new session for the same scope", async ({
  page,
}) => {
  await useRole(page, "learner");
  const payloads: unknown[] = [];
  page.on("request", (request) => {
    if (
      request.method() === "POST" &&
      request.url().endsWith("/api/v1/me/review-sessions")
    )
      payloads.push(request.postDataJSON());
  });

  await page.goto("/review/session-single-complete?batch=batch-e2e");
  await ready(page);
  await page.getByRole("button", { name: "Review this story again" }).click();
  await expect(page).toHaveURL(
    /\/review\/session-restarted-single\?batch=batch-e2e$/,
  );
  await expect(page.getByLabel("Write the English word")).toBeVisible();

  await page.goto("/review/session-range-complete");
  await ready(page);
  await page.getByRole("button", { name: "Review again" }).click();
  await expect(page).toHaveURL(/\/review\/session-restarted-range$/);
  await expect.poll(() => payloads.length).toBe(2);
  expect(payloads).toEqual([
    { mode: "single_batch", batch_id: "batch-e2e" },
    {
      mode: "range",
      start_date: "2026-08-23",
      end_date: "2026-08-29",
      timezone: "Asia/Shanghai",
    },
  ]);
});

test("passage review groups related blanks without exposing their spelling", async ({
  page,
}) => {
  await useRole(page, "learner");
  await page.goto("/review/session-single");
  await ready(page);
  await page.getByLabel("Write the English word").fill("adapt");
  await page.getByRole("button", { name: "Check" }).click();

  const slots = page.locator(".cloze-slot");
  await expect(slots).toHaveCount(5);
  await expect(page.locator(".cloze-group-guide")).toContainText(
    "same color and pattern",
  );
  const classes = await slots.evaluateAll((nodes) =>
    nodes.map((node) => node.className),
  );
  expect(classes[0]).toBe(classes[2]);
  expect(classes[0]).not.toBe(classes[1]);
  expect(await page.content()).not.toContain("grp_AAAAAAAAAAAAAAAAAAAAAA");

  await page.locator(".app-header .locale-switch select").selectOption("zh-CN");
  expect(
    await slots.evaluateAll((nodes) => nodes.map((node) => node.className)),
  ).toEqual(classes);

  const inputs = page.locator(".cloze-slot .cloze-input");
  const accessibleNames = await inputs.evaluateAll((nodes) =>
    nodes.map((node) => node.labels?.[0]?.textContent ?? ""),
  );
  expect(accessibleNames[0]).toBe(accessibleNames[2]);
  expect(accessibleNames.join(" ")).not.toMatch(/adapt|weave/i);

  await inputs.nth(0).focus();
  await expect(slots.nth(0)).toHaveClass(/is-group-active/);
  await expect(slots.nth(2)).toHaveClass(/is-group-active/);
  await expect(slots.nth(1)).toHaveClass(/is-group-muted/);

  const metrics = await page
    .locator(".review-cloze-passage p")
    .evaluate((node) => {
      const style = getComputedStyle(node);
      return {
        lineHeight: Number.parseFloat(style.lineHeight),
        fontSize: Number.parseFloat(style.fontSize),
      };
    });
  expect(metrics.lineHeight / metrics.fontSize).toBeGreaterThanOrEqual(3.09);
  const viewportWidth = await page.evaluate(() => innerWidth);
  for (const box of await inputs.evaluateAll((nodes) =>
    nodes.map((node) => {
      const rect = node.getBoundingClientRect();
      return { width: rect.width, height: rect.height };
    }),
  )) {
    expect(box.width).toBeLessThanOrEqual(0.42 * viewportWidth + 1);
    expect(box.height).toBeGreaterThanOrEqual(35);
  }
});

test("admin revision matches approved workspace, dialogs, plans and search-first users", async ({
  page,
}) => {
  await useRole(page, "admin");
  await page.goto("/admin/models");
  await ready(page);
  await expect(page.locator(".page-heading .eyebrow")).toHaveText(
    "ADMIN WORKSPACE",
  );
  await expect(page.locator(".admin-label")).toHaveText("System");

  await page.getByRole("button", { name: "Add model" }).click();
  let dialog = page.getByRole("dialog", { name: "Add model" });
  await expectModelDialogSpacing(page);
  await expect(dialog.getByLabel("Display name")).toBeVisible();
  await expect(dialog.getByLabel("Description")).toBeVisible();
  let modelIdInput = dialog.getByLabel("OpenRouter model ID");
  await expect(modelIdInput).toBeVisible();
  expect(
    await modelIdInput.evaluate((node) => ({
      background: getComputedStyle(node).backgroundColor,
      paddingInline: getComputedStyle(node).paddingInline,
    })),
  ).toEqual({ background: "rgb(255, 255, 255)", paddingInline: "16px" });
  await expect(dialog.getByRole("checkbox", { name: "Active" })).toBeChecked();
  await expect(dialog.locator(".notice-warning")).toContainText(
    "Existing content stays available",
  );
  await dialog.getByRole("button", { name: "Cancel" }).click();

  await expect(page.locator(".model-row .status-badge")).toHaveText("Active");
  await expect(page.locator(".model-row .model-meta")).toContainText(
    "4 plans assignments",
  );
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  dialog = page.getByRole("dialog", { name: "Edit model" });
  await expectModelDialogSpacing(page);
  await expect(dialog.getByLabel("Display name")).toHaveValue(
    "Quick Context with a deliberately long name for responsive checks",
  );
  modelIdInput = dialog.getByLabel("OpenRouter model ID");
  expect(
    await modelIdInput.evaluate((node) => ({
      background: getComputedStyle(node).backgroundColor,
      paddingInline: getComputedStyle(node).paddingInline,
    })),
  ).toEqual({ background: "rgb(255, 255, 255)", paddingInline: "16px" });
  await expect(dialog.getByRole("checkbox", { name: "Active" })).toBeChecked();
  await dialog.getByRole("button", { name: "Cancel" }).click();

  await page.getByRole("button", { name: "Replace key" }).click();
  dialog = page.getByRole("dialog", {
    name: "Add OpenRouter API Key",
  });
  const keyInput = dialog.getByLabel("New API Key");
  expect(
    await keyInput.evaluate((node) => getComputedStyle(node).backgroundColor),
  ).toBe("rgb(255, 255, 255)");
  await dialog.getByRole("button", { name: "Cancel" }).click();

  await page
    .locator(".admin-account .locale-switch select")
    .selectOption("zh-CN");
  await page.getByRole("button", { name: "替换密钥" }).click();
  dialog = page.getByRole("dialog", { name: "配置 OpenRouter API Key" });
  expect(
    await dialog
      .getByLabel("新 API Key")
      .evaluate((node) => getComputedStyle(node).backgroundColor),
  ).toBe("rgb(255, 255, 255)");
  await dialog.getByRole("button", { name: "取消" }).click();
  await page
    .locator(".admin-account .locale-switch select")
    .selectOption("en-US");
  await expect(page.locator(".page-description")).toHaveText(
    "Manage your API key and available models.",
  );

  await page.goto("/admin/plans");
  await ready(page);
  await expect(page.locator(".page-description")).toHaveText(
    "Choose the models, lengths, and limits for each plan.",
  );
  await expect(page.getByRole("tab", { name: "Guest" })).toBeVisible();
  await expect(
    page.getByText("Creations per 24 hours", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Save changes" }),
  ).toBeVisible();
  expect(
    await page
      .getByText("Available models", { exact: true })
      .evaluate((node) => getComputedStyle(node).marginBottom),
  ).toBe("8px");

  let userRequests = 0;
  page.on("request", (request) => {
    if (request.url().includes("/api/v1/admin/users?")) userRequests += 1;
  });
  await page.goto("/admin/users");
  await ready(page);
  await expect(page.getByText("Start with a username")).toBeVisible();
  expect(userRequests).toBe(0);
  await page.getByLabel("Search username…").fill("learner_e2e");
  await page.getByRole("button", { name: "Search" }).click();
  await expect(page.getByText("Search results")).toBeVisible();
  await expect(page.locator(".admin-user-result")).toHaveCount(2);
  await expect(
    page.locator(".admin-user-result .user-name").first(),
  ).toHaveText("learner_e2e");
  await expect(
    page.locator(".admin-user-result .user-meta").first(),
  ).toHaveText("Learner · Joined 2026-08-10");
  await expect(page.locator(".admin-user-plan").first()).toHaveText(
    "PlanBasic",
  );
  await expect(
    page.locator(".admin-user-result .status-badge").first(),
  ).toHaveText("Active");
  await expect(
    page.getByRole("link", { name: "View user learner_e2e" }),
  ).toHaveText("View");
  expect(userRequests).toBe(1);

  const loadMore = page.locator(".admin-user-pagination button");
  await expect(loadMore).toHaveAccessibleName("Load more");
  await loadMore.click();
  await expect(page.locator(".admin-user-result")).toHaveCount(2);
  await expect(page.locator(".admin-user-results")).toHaveAttribute(
    "aria-busy",
    "true",
  );
  await expect(loadMore).toBeDisabled();
  await expect(loadMore).toContainText("Loading more…");
  await expect(page.locator(".admin-user-result")).toHaveCount(4);
  await expect(loadMore).toBeFocused();

  await loadMore.click();
  await expect(page.locator(".admin-user-result")).toHaveCount(6);
  await expect(loadMore).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "View user echo-learner_e2e" }),
  ).toBeFocused();
  expect(
    new Set(
      await page
        .locator(".admin-user-result")
        .evaluateAll((rows) => rows.map((row) => row.dataset.resultId)),
    ).size,
  ).toBe(6);

  const responsiveRow = page.locator(".admin-user-result").first();
  for (const width of [320, 390, 720, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    const geometry = await responsiveRow.evaluate((row) => {
      const identity = row.querySelector<HTMLElement>(".admin-user-identity")!;
      const plan = row.querySelector<HTMLElement>(".admin-user-plan")!;
      const status = row.querySelector<HTMLElement>(".status-badge")!;
      const link = row.querySelector<HTMLElement>(".button")!;
      const rowBox = row.getBoundingClientRect();
      const identityBox = identity.getBoundingClientRect();
      const planBox = plan.getBoundingClientRect();
      const statusBox = status.getBoundingClientRect();
      const linkBox = link.getBoundingClientRect();
      return {
        identityTop: identityBox.top,
        planTop: planBox.top,
        statusTop: statusBox.top,
        linkTop: linkBox.top,
        rowWidth: rowBox.width,
        linkWidth: linkBox.width,
        overflow:
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      };
    });
    expect(geometry.overflow, `${width}px overflow`).toBeLessThanOrEqual(0);
    if (width <= 720) {
      expect(geometry.planTop).toBeGreaterThan(geometry.identityTop);
      expect(Math.abs(geometry.planTop - geometry.statusTop)).toBeLessThan(4);
      expect(geometry.linkTop).toBeGreaterThan(geometry.planTop);
      expect(geometry.linkWidth).toBeGreaterThanOrEqual(geometry.rowWidth - 42);
    }
  }

  await page.setViewportSize({ width: 390, height: 320 });
  const openUser = page.getByRole("link", { name: "View user learner_e2e" });
  await openUser.scrollIntoViewIfNeeded();
  const sourceScroll = await page.evaluate(() => window.scrollY);
  expect(sourceScroll).toBeGreaterThan(0);
  await openUser.click();
  await expect(
    page.getByRole("link", { name: "← Back to results" }),
  ).toBeVisible();
  await expect(page.locator(".admin-user-detail-toolbar")).toContainText(
    "learner_e2e",
  );
  await page.getByRole("link", { name: "← Back to results" }).click();
  await expect(page.getByText("Search results")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "View user learner_e2e" }),
  ).toBeFocused();
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBeGreaterThanOrEqual(sourceScroll - 2);
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBeLessThanOrEqual(sourceScroll + 2);
  const focusedBox = await page
    .getByRole("link", { name: "View user learner_e2e" })
    .boundingBox();
  expect(focusedBox).not.toBeNull();
  expect(focusedBox!.y).toBeGreaterThanOrEqual(0);
  expect(focusedBox!.y + focusedBox!.height).toBeLessThanOrEqual(322);
});

test("admin user pagination recovers an invalid cursor exactly once", async ({
  page,
}) => {
  await useRole(page, "admin");
  const requests: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (
      url.pathname === "/api/v1/admin/users" &&
      url.searchParams.get("username") === "recover_cursor"
    )
      requests.push(request.url());
  });
  await page.goto("/admin/users");
  await ready(page);
  await page.getByLabel("Search username…").fill("recover_cursor");
  await page.getByRole("button", { name: "Search" }).click();
  await expect(page.locator(".admin-user-result")).toHaveCount(1);
  await page.getByRole("button", { name: "Load more" }).click();
  await expect(page.locator(".admin-user-result")).toHaveCount(1);
  await expect(page.getByText("Search results")).toBeFocused();
  await page.waitForTimeout(350);

  const cursorRequests = requests.filter((value) =>
    new URL(value).searchParams.has("cursor"),
  );
  const firstPageRequests = requests.filter(
    (value) => !new URL(value).searchParams.has("cursor"),
  );
  expect(cursorRequests).toHaveLength(1);
  expect(firstPageRequests).toHaveLength(2);
});

test("admin user detail return restores exact scroll across viewport heights", async ({
  page,
}) => {
  await useRole(page, "admin");
  await page.goto("/admin/users");
  await ready(page);
  await page.getByLabel("Search username…").fill("return_scroll");
  await page.getByRole("button", { name: "Search" }).click();
  await expect(page.locator(".admin-user-result")).toHaveCount(20);
  await page.getByRole("button", { name: "Load more" }).click();
  await expect(page.locator(".admin-user-result")).toHaveCount(40);
  await page.getByRole("button", { name: "Load more" }).click();
  await expect(page.locator(".admin-user-result")).toHaveCount(46);

  const target = page.getByRole("link", { name: "View user learner_e2e" });
  for (const viewport of [
    { width: 390, height: 320 },
    { width: 390, height: 844 },
    { width: 1440, height: 600 },
    { width: 1440, height: 1000 },
  ]) {
    await page.setViewportSize(viewport);
    const targetOffset = await target.evaluate(
      (node) => node.getBoundingClientRect().top + window.scrollY,
    );
    await page.evaluate(
      ({ top }) => window.scrollTo({ top, behavior: "instant" }),
      { top: Math.max(0, targetOffset - Math.floor(viewport.height / 2)) },
    );
    const sourceScroll = await page.evaluate(() => window.scrollY);
    expect(sourceScroll, JSON.stringify(viewport)).toBeGreaterThan(0);

    await target.click();
    await expect(
      page.getByRole("link", { name: "← Back to results" }),
    ).toBeVisible();
    await page.getByRole("link", { name: "← Back to results" }).click();
    await expect(page.locator(".admin-user-result")).toHaveCount(46);
    await expect(target).toBeFocused();
    await expect
      .poll(() => page.evaluate(() => window.scrollY))
      .toBeGreaterThanOrEqual(sourceScroll - 2);
    await expect
      .poll(() => page.evaluate(() => window.scrollY))
      .toBeLessThanOrEqual(sourceScroll + 2);
    const box = await target.boundingBox();
    expect(box, JSON.stringify(viewport)).not.toBeNull();
    expect(box!.y, JSON.stringify(viewport)).toBeGreaterThanOrEqual(0);
    expect(box!.y + box!.height, JSON.stringify(viewport)).toBeLessThanOrEqual(
      viewport.height + 2,
    );
  }
});

test("admin append failure preserves results and offers a footer retry", async ({
  page,
}) => {
  await useRole(page, "admin");
  await page.goto("/admin/users");
  await ready(page);
  await page.getByLabel("Search username…").fill("append_failure");
  await page.getByRole("button", { name: "Search" }).click();
  await expect(page.locator(".admin-user-result")).toHaveCount(1);
  await page.getByRole("button", { name: "Load more" }).click();
  await expect(
    page.locator(".admin-user-pagination [role=alert]"),
  ).toBeVisible();
  await expect(page.locator(".admin-user-result")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Try again" })).toBeEnabled();
  await expect(page.locator(".admin-user-results")).toHaveAttribute(
    "aria-busy",
    "false",
  );
});

test("account deletion requires the unchecked confirmation and derives its request value", async ({
  page,
}) => {
  await useRole(page, "learner");
  await page.goto("/account");
  await ready(page);

  await page.getByRole("button", { name: "Delete my account" }).click();
  const dialog = page.getByRole("dialog", { name: "Delete account?" });
  const confirmation = dialog.getByRole("checkbox", {
    name: /cannot be undone/,
  });
  const password = dialog.getByLabel("Current password");
  const deleteButton = dialog.getByRole("button", {
    name: "Delete my account",
  });
  const payloads: unknown[] = [];
  page.on("request", (request) => {
    if (
      request.method() === "DELETE" &&
      request.url().endsWith("/api/v1/me/account")
    )
      payloads.push(request.postDataJSON());
  });

  await expect(confirmation).not.toBeChecked();
  await password.fill("WrongPass123!");
  await expect(deleteButton).toBeDisabled();
  await confirmation.check();
  await expect(deleteButton).toBeEnabled();
  await deleteButton.click();
  await expect.poll(() => payloads.length).toBe(1);
  await expect(confirmation).not.toBeChecked();
  await expect(deleteButton).toBeDisabled();

  await password.fill("CorrectPass123!");
  await confirmation.check();
  await deleteButton.click();
  await expect(page).toHaveURL(`${baseURL}/`);
  expect(payloads).toEqual([
    { current_password: "WrongPass123!", confirmed: true },
    { current_password: "CorrectPass123!", confirmed: true },
  ]);
});

test("administrator group and password mutations require confirmation", async ({
  page,
}) => {
  await useRole(page, "admin");
  await page.goto("/admin/users/user-e2e");
  await ready(page);

  let groupRequests = 0;
  let passwordRequests = 0;
  page.on("request", (request) => {
    if (request.method() !== "PUT") return;
    if (request.url().endsWith("/api/v1/admin/users/user-e2e/group"))
      groupRequests += 1;
    if (request.url().endsWith("/api/v1/admin/users/user-e2e/password"))
      passwordRequests += 1;
  });

  await page.getByRole("button", { name: "Change plan" }).click();
  let dialog = page.getByRole("dialog", { name: /Change .* plan/ });
  await dialog.locator("select.select-input").selectOption("pro");
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect.poll(() => groupRequests).toBe(0);

  await page.getByRole("button", { name: "Change plan" }).click();
  dialog = page.getByRole("dialog", { name: /Change .* plan/ });
  await dialog.locator("select.select-input").selectOption("pro");
  await dialog.getByRole("button", { name: "Change plan" }).click();
  await expect.poll(() => groupRequests).toBe(1);

  await page.getByRole("button", { name: "Reset password" }).click();
  dialog = page.getByRole("dialog", { name: "Reset password" });
  await dialog.getByLabel("New password").fill("UpdatedPass123!");
  await dialog.getByLabel("Confirm password").fill("UpdatedPass123!");
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect.poll(() => passwordRequests).toBe(0);

  await page.getByRole("button", { name: "Reset password" }).click();
  dialog = page.getByRole("dialog", { name: "Reset password" });
  await dialog.getByLabel("New password").fill("UpdatedPass123!");
  await dialog.getByLabel("Confirm password").fill("UpdatedPass123!");
  await dialog.getByRole("button", { name: "Reset password" }).click();
  await expect.poll(() => passwordRequests).toBe(1);
});

test("all approved page families have no serious or critical Axe findings", async ({
  page,
}) => {
  const scans: Array<{
    role: "visitor" | "learner" | "admin";
    path: string;
  }> = [
    { role: "visitor", path: "/" },
    { role: "visitor", path: "/login" },
    { role: "visitor", path: "/register" },
    { role: "visitor", path: "/create" },
    { role: "learner", path: "/library" },
    { role: "learner", path: "/library/batch-e2e" },
    { role: "learner", path: "/review" },
    { role: "learner", path: "/review/session-single" },
    { role: "learner", path: "/account" },
    { role: "admin", path: "/admin/models" },
    { role: "admin", path: "/admin/plans" },
    { role: "admin", path: "/admin/users" },
    { role: "admin", path: "/admin/users/user-e2e" },
  ];

  for (const scan of scans) {
    await useRole(page, scan.role);
    await page.goto(scan.path);
    await ready(page);
    if (scan.path === "/review/session-single")
      await expect(page.locator(".review-card")).toBeVisible();
    const result = await new AxeBuilder({ page }).analyze();
    expect(seriousViolations(result), `Axe findings on ${scan.path}`).toEqual(
      [],
    );
  }
});
