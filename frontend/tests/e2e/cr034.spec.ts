import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const origin = "http://127.0.0.1:3300";
const previewPath = "**/api/v1/me/review-range/preview?*";
const start = (page: Page) => page.locator("#review-start");
const end = (page: Page) => page.locator("#review-end");
const button = (page: Page) =>
  page.locator(".range-editor button[type=submit]");
async function open(page: Page, scenario = "old", locale = "en-US") {
  await page.context().addCookies([
    { name: "wordweave_session", value: "learner", url: origin },
    { name: "wordweave_ui_locale", value: locale, url: origin },
    { name: "cr034_case", value: scenario, url: origin },
  ]);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (/hydration.*mismatch/i.test(message.text()))
      errors.push(message.text());
  });
  await page.goto("/review");
  await page.waitForFunction(
    () => document.documentElement.dataset.appReady === "true",
  );
  return errors;
}
async function status(page: Page, value: string) {
  await expect(page.locator(".range-editor")).toHaveAttribute(
    "data-range-preview",
    value,
  );
}
async function oldDates(page: Page) {
  await start(page).fill("2026-08-10");
  await end(page).fill("2026-08-10");
  await status(page, "ready");
}
for (const locale of ["en-US", "zh-CN"]) {
  test(
    "CR034 old records: stable inputs, empty→ready→empty→ready, " + locale,
    async ({ page }) => {
      let previews = 0,
        posts = 0;
      page.on("request", (r) => {
        if (r.url().includes("/review-range/preview")) previews++;
        if (r.method() === "POST" && r.url().endsWith("/me/review-sessions"))
          posts++;
      });
      const errors = await open(page, "old", locale);
      await status(page, "empty");
      expect(previews).toBe(1);
      const node = await end(page).elementHandle();
      await expect(page.locator(".range-feedback h2")).toHaveText(
        locale === "en-US"
          ? "No stories to review in this range"
          : "这段时间没有可复习的短文",
      );
      await expect(button(page)).toBeDisabled();
      await oldDates(page);
      await expect(end(page)).toBeFocused();
      await expect(page.locator(".range-count .helper")).toHaveText(
        locale === "en-US" ? "1 word" : "1 个词语",
      );
      await expect(button(page)).toBeEnabled();
      await end(page).fill("2026-08-09");
      await status(page, "invalid");
      await expect(end(page)).toHaveAttribute("aria-invalid", "true");
      await start(page).fill("2026-08-09");
      await status(page, "empty");
      await oldDates(page);
      expect(await end(page).evaluate((n, old) => n === old, node)).toBe(true);
      expect(posts).toBe(0);
      expect(errors).toEqual([]);
    },
  );

  test(
    "CR034 empty responsive geometry and accessibility: " + locale,
    async ({ page }, info) => {
      await open(page, "empty", locale);
      await status(page, "empty");
      for (const width of [320, 390, 560, 561, 720, 1080, 1081, 1280, 1440]) {
        await page.setViewportSize({ width, height: 1000 });
        const boxes = await page
          .locator(".date-range input")
          .evaluateAll((nodes) =>
            nodes.map((n) => {
              const r = n.getBoundingClientRect();
              return { width: r.width, height: r.height, y: r.y };
            }),
          );
        expect(boxes[0]!.height).toBe(44);
        expect(boxes[1]!.height).toBe(44);
        expect(boxes[0]!.width).toBe(boxes[1]!.width);
        if (width > 560) expect(boxes[0]!.y).toBe(boxes[1]!.y);
        const count = (await page.locator(".range-count").boundingBox())!;
        if (width <= 1080) expect(count.height).toBe(96);
        if (width > 1080) expect(count.width).toBe(320);
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        if (width <= 560) {
          const actions = page.locator(".range-feedback .inline-actions");
          expect(
            (await actions.locator("a").first().boundingBox())!.width,
          ).toBe((await actions.boundingBox())!.width);
        }
        if ([390, 1440].includes(width))
          await page.screenshot({
            path: info.outputPath(locale + "-" + width + ".png"),
            fullPage: true,
          });
      }
      const axe = await new AxeBuilder({ page }).analyze();
      expect(
        axe.violations.filter((v) =>
          ["serious", "critical"].includes(v.impact!),
        ),
      ).toEqual([]);
    },
  );
}

for (const scenario of ["empty", "paused"]) {
  test(
    "CR034 distinct fixture stays empty and editable: " + scenario,
    async ({ page }) => {
      await open(page, scenario);
      await status(page, "empty");
      await start(page).fill("2020-01-01");
      await end(page).fill("2030-01-01");
      await status(page, "empty");
      await expect(page.locator(".range-count .count-number")).toHaveText("0");
      await expect(button(page)).toBeDisabled();
      await expect(start(page)).toBeVisible();
    },
  );
}

test("CR034 invalid dates do not preview or POST; same day recovers", async ({
  page,
}) => {
  await open(page);
  await status(page, "empty");
  let requests = 0;
  page.on("request", (r) => {
    if (
      r.url().includes("/review-range/preview") ||
      (r.method() === "POST" && r.url().endsWith("/me/review-sessions"))
    )
      requests++;
  });
  await start(page).fill("");
  await status(page, "invalid");
  await expect(start(page)).toHaveAttribute(
    "aria-describedby",
    "range-date-error",
  );
  await expect(page.locator(".count-number")).toHaveText("—");
  await end(page).fill("");
  await page.locator(".range-editor form").dispatchEvent("submit");
  await page.waitForTimeout(400);
  expect(requests).toBe(0);
  await oldDates(page);
  expect(requests).toBe(1);
});

test("CR034 failed preview, retained resume, retry focus and exact copy", async ({
  page,
}) => {
  let fail = true;
  await page.route(previewPath, async (route) => {
    if (fail)
      await route.fulfill({
        status: 500,
        json: { error: { code: "INTERNAL_ERROR" } },
      });
    else await route.continue();
  });
  await open(page, "resume", "zh-CN");
  await status(page, "failed");
  await expect(page.locator(".range-count strong")).toHaveCount(0);
  await expect(page.locator(".range-resume strong")).toHaveText(
    "继续上次日期复习",
  );
  await expect(page.locator(".range-feedback .notice-title")).toHaveText(
    "暂时无法加载复习内容",
  );
  const retained = await start(page).inputValue();
  fail = false;
  await page.locator(".range-feedback button").click();
  await status(page, "empty");
  await expect(start(page)).toBeFocused();
  await expect(start(page)).toHaveValue(retained);
  await start(page).fill("");
  await status(page, "invalid");
  await page.locator(".range-resume button").click();
  await expect(page).toHaveURL(/\/review\/session-restarted-range$/);
});

test("CR034 stale success ignored, immediate invalidation and leave cancellation", async ({
  page,
}) => {
  await open(page);
  await status(page, "empty");
  let slowStarted = false;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(previewPath, async (route) => {
    if (
      new URL(route.request().url()).searchParams.get("start_date") ===
      "2026-08-01"
    ) {
      slowStarted = true;
      await gate;
      await route
        .fulfill({
          json: {
            data: { batch_count: 99, entry_count: 99, empty: false },
            meta: { request_id: "late-A" },
          },
        })
        .catch(() => {});
    } else await route.continue();
  });
  await start(page).fill("2026-08-01");
  await expect.poll(() => slowStarted).toBe(true);
  await oldDates(page);
  release();
  await page.waitForTimeout(100);
  await expect(page.locator(".count-number")).toHaveText("1");
  await start(page).fill("2026-08-02");
  await expect(button(page)).toBeDisabled();
  await page.locator("a.brand").click();
  await expect(page).toHaveURL("/");
  await page.waitForTimeout(400);
  await expect(page).toHaveURL("/");
});

test("CR034 double submission blocked; server query captured before later edits", async ({
  page,
}) => {
  await open(page);
  await status(page, "empty");
  await oldDates(page);
  let posts = 0;
  let captured: unknown;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/v1/me/review-sessions", async (route) => {
    posts++;
    captured = route.request().postDataJSON();
    await gate;
    await route.continue();
  });
  await page.locator(".range-editor form").evaluate((form) => {
    form.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    );
    form.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    );
  });
  await expect.poll(() => posts).toBe(1);
  await end(page).fill("2026-08-12");
  expect(captured).toMatchObject({
    mode: "range",
    start_date: "2026-08-10",
    end_date: "2026-08-10",
  });
  release();
  await expect(page).toHaveURL(/\/review\/session-restarted-range$/);
  expect(posts).toBe(1);
});

test("CR034 security refresh date change prevents POST; later retry works", async ({
  page,
}) => {
  await open(page);
  await status(page, "empty");
  await oldDates(page);
  let checking = false,
    posts = 0;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/v1/bootstrap", async (route) => {
    checking = true;
    await gate;
    await route.continue();
  });
  page.on("request", (r) => {
    if (r.method() === "POST" && r.url().endsWith("/me/review-sessions"))
      posts++;
  });
  await button(page).click();
  await expect.poll(() => checking).toBe(true);
  await end(page).fill("2026-08-12");
  release();
  await status(page, "ready");
  await expect(button(page)).toBeEnabled();
  expect(posts).toBe(0);
  await button(page).click();
  await expect(page).toHaveURL(/\/review\/session-restarted-range$/);
  expect(posts).toBe(1);
});

test("CR034 uncertain POST only reconciles GET, no automatic replay or navigation", async ({
  page,
}) => {
  await open(page, "resume");
  await status(page, "empty");
  await oldDates(page);
  let posts = 0,
    reconciliation = 0;
  page.on("request", (r) => {
    if (r.url().endsWith("/review-sessions/active-range")) reconciliation++;
  });
  await page.route("**/api/v1/me/review-sessions", async (route) => {
    posts++;
    await route.fetch();
    await route.abort("failed");
  });
  await button(page).click();
  await expect(page.locator(".app-error")).toBeVisible();
  await expect(page.locator(".range-resume button")).toBeVisible();
  await expect(button(page)).toBeEnabled();
  expect(posts).toBe(1);
  expect(reconciliation).toBe(1);
  await expect(page).toHaveURL("/review");
});
