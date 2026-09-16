import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const origin = "http://127.0.0.1:3300";
async function actor(
  page: Page,
  role: "visitor" | "learner" | "admin",
  locale = "en-US",
) {
  await page.context().clearCookies();
  await page
    .context()
    .addCookies([
      { name: "wordweave_ui_locale", value: locale, url: origin },
      ...(role === "visitor"
        ? []
        : [{ name: "wordweave_session", value: role, url: origin }]),
    ]);
}
async function ready(page: Page) {
  await page.waitForFunction(
    () => document.documentElement.dataset.appReady === "true",
  );
}
async function open(page: Page, path: string) {
  await page.goto(path);
  await ready(page);
}

for (const locale of ["en-US", "zh-CN"]) {
  const en = locale === "en-US";
  test(
    "CR032 five private routes gate consistently without private reads: " +
      locale,
    async ({ page }) => {
      await actor(page, "visitor", locale);
      for (const [path, title] of [
        ["/review", en ? "Sign in to open Review" : "登录后打开“复习”"],
        [
          "/review/session-e2e?batch=batch-e2e",
          en ? "Sign in to open Review" : "登录后打开“复习”",
        ],
        ["/library", en ? "Sign in to open Library" : "登录后打开“学习记录”"],
        [
          "/library/batch-e2e",
          en ? "Sign in to view this story" : "登录后查看这篇短文",
        ],
        ["/account", en ? "Sign in to manage your account" : "登录后管理账号"],
      ]) {
        const response = await page.goto(path!);
        expect(response?.status()).toBe(200);
        await ready(page);
        await expect(page.locator(".auth-gate h1")).toHaveText(title!);
        expect(
          await page
            .locator(
              'input[type="date"], .stats-grid, .reading-passage, .review-shell',
            )
            .count(),
        ).toBe(0);
        const payload = await page
          .locator("script[data-nuxt-data]")
          .textContent();
        for (const secret of [
          "Teams adapt",
          "learner_e2e",
          "generation_quota",
          "csrf_token",
        ])
          expect(payload).not.toContain(secret);
        await page.locator(".auth-gate .button-primary").click();
        await expect(page.locator(".auth-intent")).toBeVisible();
        const redirect = new URL(page.url()).searchParams.get("redirect");
        expect(redirect).toBe(path);
        await page.locator(".auth-alt a").click();
        expect(new URL(page.url()).searchParams.get("redirect")).toBe(redirect);
        await page.reload();
        await ready(page);
        expect(new URL(page.url()).searchParams.get("redirect")).toBe(redirect);
      }
    },
  );
  test(
    "CR029 exact dates, home and danger-zone design: " + locale,
    async ({ page }) => {
      await actor(page, "learner", locale);
      await open(page, "/review");
      const inputs = page.locator(".date-range input");
      await expect(inputs).toHaveCount(2);
      const from = (await inputs.nth(0).boundingBox())!,
        to = (await inputs.nth(1).boundingBox())!;
      expect(from.height).toBe(44);
      expect(to.height).toBe(44);
      expect(from.width).toBe(to.width);
      await expect(page.locator(".date-range .field").nth(1)).toHaveCSS(
        "margin-top",
        "0px",
      );
      await open(page, "/");
      await expect(
        page
          .locator(".hero-actions a")
          .filter({ hasText: en ? /^Review$/ : /^开始复习$/ }),
      ).toBeVisible();
      await open(page, "/account");
      await expect(page.locator(".danger-zone .card-subtitle")).toHaveText(
        en ? "This can’t be undone." : "这项操作无法撤销。",
      );
      await expect(page.locator(".danger-zone .card-subtitle")).toHaveCSS(
        "color",
        "rgb(64, 88, 90)",
      );
      await expect(page.locator(".danger-zone .card-body > p")).toHaveText(
        en
          ? "Your stories, review history, and account will be deleted."
          : "你的短文、复习记录和账号信息都会被删除。",
      );
    },
  );
  test(
    "CR030 reader keeps parent search, real target and close focus: " + locale,
    async ({ page }, info) => {
      await actor(page, "admin", locale);
      await open(page, "/admin/users/user-e2e?q=learner");
      await expect(page.getByRole("search")).toBeVisible();
      await expect(page.locator(".admin-user-detail-toolbar a")).toHaveText(
        en ? "← Back to results" : "← 返回搜索结果",
      );
      await expect(page.locator(".user-detail-name + p")).toContainText(
        /\d{4}-\d{2}-\d{2}/,
      );
      const search = page.getByRole("search").locator("input");
      await search.fill("unsubmitted");
      const trigger = page.locator(".model-row button").nth(1);
      await trigger.click();
      await expect(page).toHaveURL(/batch=batch-second/);
      await expect(page.locator(".reader-passage")).toContainText(
        "A second story belongs to this learner.",
      );
      await expect(page.getByRole("search").locator("input")).toHaveValue(
        "unsubmitted",
      );
      await expect(page.locator("#reader-dialog-title")).toBeFocused();
      await page.screenshot({
        path: info.outputPath("reader-" + locale + ".png"),
        fullPage: true,
      });
      await page.keyboard.press("Escape");
      await expect(page.locator("dialog")).toHaveCount(0);
      await expect(trigger).toBeFocused();
      expect(new URL(page.url()).searchParams.get("q")).toBe("learner");
      await page.goForward();
      await expect(page.locator("dialog")).toBeVisible();
      await page.goBack();
      await expect(page.locator("dialog")).toHaveCount(0);
      await page.locator(".model-row button").first().click();
      await expect(page.locator(".reader-passage")).not.toContainText(
        "A second story",
      );
      await page.locator(".reader-body").click({ position: { x: 10, y: 10 } });
      await expect(page.locator("dialog")).toBeVisible();
      await page.locator(".dialog-footer button").click();
      await expect(page.locator("dialog")).toHaveCount(0);
      await page.getByRole("search").locator("input").fill("learner");
      await page.getByRole("search").getByRole("button").click();
      await expect(page).toHaveURL(/\/admin\/users\?q=learner$/);
      await expect(page.locator(".admin-user-results")).toBeVisible();
    },
  );
}

test("CR033 complete quota update, 0, admin null and uncertain mutation recovery", async ({
  page,
}) => {
  await actor(page, "admin");
  await open(page, "/admin/users/user-two");
  const quota = () =>
    page
      .locator("dl.definition-list > div")
      .filter({ has: page.locator("dt", { hasText: /^Available$/ }) })
      .locator("dd");
  await expect(quota()).toHaveText("0");
  await open(page, "/admin/users/user-admin");
  await expect(quota()).toHaveText("—");
  await expect(
    page.getByRole("button", { name: "Change plan", exact: true }),
  ).toHaveCount(0);
  await open(page, "/admin/users/user-e2e");
  let puts = 0;
  page.on("request", (r) => {
    if (r.method() === "PUT" && r.url().endsWith("/group")) puts++;
  });
  await page.getByRole("button", { name: "Change plan", exact: true }).click();
  await page.locator("dialog select").selectOption("plus");
  await page.route("**/admin/users/user-e2e/group", async (route) => {
    await route.fetch();
    await route.abort("failed");
  });
  await page
    .locator("dialog")
    .getByRole("button", { name: "Change plan", exact: true })
    .click();
  await expect(page.locator("dialog .app-error")).toBeVisible();
  await expect(quota()).toHaveText("0");
  expect(puts).toBe(1);
  await page
    .locator("dialog")
    .getByRole("button", { name: "Cancel", exact: true })
    .click();
  await page.unroute("**/admin/users/user-e2e/group");
  await page.getByRole("button", { name: "Change plan", exact: true }).click();
  await page.locator("dialog select").selectOption("pro");
  await page
    .locator("dialog")
    .getByRole("button", { name: "Change plan", exact: true })
    .click();
  await expect(page.locator("dialog")).toHaveCount(0);
  await expect(quota()).toHaveText("Unlimited");
  expect(puts).toBe(2);
});

test("CR031 deep/legacy URLs, unavailable and error retry never change parents", async ({
  page,
}) => {
  await actor(page, "admin");
  await open(page, "/admin/users/user-two/batches/batch-second?q=learner");
  await expect(page).toHaveURL(
    /\/admin\/users\/user-two\?batch=batch-second&q=learner/,
  );
  await expect(page.locator(".reader-passage")).toContainText(
    "A different learner owns this story.",
  );
  await page.locator(".reader-close").click();
  await expect(page).toHaveURL(/\/admin\/users\/user-two\?q=learner/);
  await open(page, "/admin/users/user-two?batch=absent");
  await expect(page.locator(".reader-state h3")).toHaveText(
    "This story is unavailable",
  );
  await expect(page.locator(".reader-state button")).toHaveCount(0);
  await page.locator(".reader-close").click();
  let attempts = 0;
  await page.route(
    "**/admin/users/user-two/batches/batch-e2e",
    async (route) => {
      attempts++;
      if (attempts === 1) await route.abort();
      else await route.continue();
    },
  );
  await page.locator(".model-row button").first().click();
  await expect(page.locator(".reader-state h3")).toHaveText(
    "Couldn’t load this story",
  );
  await page.locator(".reader-state button").click();
  await expect(page.locator(".reader-passage")).toContainText("Teams adapt");
  expect(attempts).toBe(2);
});

test("CR032 login error preserves intent, role overrides learner redirect and stale claim", async ({
  page,
}) => {
  await actor(page, "visitor");
  await open(page, "/review");
  await page.locator(".auth-gate .button-primary").click();
  await page.locator('input[autocomplete="username"]').fill("admin_e2e");
  await page
    .locator('input[autocomplete="current-password"]')
    .fill("WrongPass123!");
  await page.locator("form button[type=submit]").click();
  await expect(page.locator(".app-error")).toBeVisible();
  expect(new URL(page.url()).searchParams.get("redirect")).toBe("/review");
  await page
    .locator('input[autocomplete="current-password"]')
    .fill("CorrectPass123!");
  await page.locator("form button[type=submit]").click();
  await expect(page).toHaveURL(/\/admin\/models$/);
  await actor(page, "visitor");
  await open(page, "/login?redirect=%2Flibrary%2Fbatch-e2e&claim=1");
  await expect(page.locator(".notice-warning")).toHaveCount(0);
  await page.locator('input[autocomplete="username"]').fill("learner_e2e");
  await page
    .locator('input[autocomplete="current-password"]')
    .fill("CorrectPass123!");
  await page.locator("form button[type=submit]").click();
  await expect(page).toHaveURL(/\/library\/batch-e2e$/);
});

test("CR031 reader long content fits all approved widths and keyboard remains modal", async ({
  page,
}, info) => {
  test.setTimeout(120_000);
  await actor(page, "admin");
  for (const width of [320, 390, 720, 1280, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await open(page, "/admin/users/user-e2e?batch=batch-long");
    await expect(page.locator(".reader-passage")).toContainText(
      "Readers build a clear connection",
    );
    const dialog = page.locator("dialog"),
      body = page.locator(".reader-body");
    const bounds = (await dialog.boundingBox())!;
    expect(bounds.width).toBeLessThanOrEqual(width - (width <= 720 ? 32 : 48));
    expect(bounds.height).toBeLessThanOrEqual(900 - (width <= 720 ? 32 : 48));
    await expect(body).toHaveCSS("overflow-y", "auto");
    const overflow = await body.evaluate((el) => ({
      scroll: el.scrollHeight > el.clientHeight,
      horizontal: el.scrollWidth > el.clientWidth,
    }));
    expect(overflow.scroll).toBe(true);
    expect(overflow.horizontal).toBe(false);
    const header = (await page.locator(".reader-header").boundingBox())!;
    const footer = (await page.locator(".dialog-footer").boundingBox())!;
    await body.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    expect((await page.locator(".reader-header").boundingBox())!.y).toBe(
      header.y,
    );
    expect((await page.locator(".dialog-footer").boundingBox())!.y).toBe(
      footer.y,
    );
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press("Tab");
      expect(
        await dialog.evaluate((el) => el.contains(document.activeElement)),
      ).toBe(true);
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    if (width === 390 || width === 1440)
      await page.screenshot({
        path: info.outputPath("reader-long-" + width + ".png"),
      });
  }
  const axe = await new AxeBuilder({ page })
    .include(".reader-dialog")
    .analyze();
  expect(
    axe.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    ),
  ).toEqual([]);
});
