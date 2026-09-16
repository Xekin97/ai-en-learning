import { expect, test, type Page } from "@playwright/test";

async function openUsers(page: Page, locale: string) {
  await page.context().addCookies([
    { name: "wordweave_session", value: "admin", url: "http://127.0.0.1:3300" },
    {
      name: "wordweave_ui_locale",
      value: locale,
      url: "http://127.0.0.1:3300",
    },
  ]);
  await page.goto("/admin/users");
  await page.waitForFunction(
    () => document.documentElement.dataset.appReady === "true",
  );
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
}

for (const locale of ["en-US", "zh-CN"]) {
  test(
    "CR030-073 search and empty-state sizing follows the approved cascade: " +
      locale,
    async ({ page }) => {
      let searches = 0;
      page.on("request", (request) => {
        if (new URL(request.url()).pathname === "/api/v1/admin/users")
          searches++;
      });
      await openUsers(page, locale);
      expect(searches).toBe(0);
      for (const state of ["idle", "empty"]) {
        if (state === "empty") {
          await page.route("**/api/v1/admin/users?**", (route) =>
            route.fulfill({
              status: 200,
              json: {
                data: { items: [] },
                meta: {
                  request_id: "req-empty-073",
                  next_cursor: null,
                  has_more: false,
                },
              },
            }),
          );
          await page.getByRole("search").locator("input").fill("nobody");
          await page.getByRole("search").getByRole("button").click();
          await expect(page.locator(".admin-user-empty h2")).toHaveText(
            locale === "en-US" ? "No users found" : "没有找到用户",
          );
        }
        for (const width of [390, 720, 901, 1280, 1440]) {
          for (const height of [800, 1000]) {
            await page.setViewportSize({ width, height });
            await expect(page.locator(".admin-user-empty")).toHaveCSS(
              "min-height",
              "320px",
            );
            await expect(page.locator(".toolbar-search")).toHaveCSS(
              "max-width",
              "432px",
            );
            const input = (await page
              .getByRole("search")
              .locator("input")
              .boundingBox())!;
            expect(input.height).toBe(44);
            expect(input.width).toBeLessThanOrEqual(432);
            if (width === 390) expect(input.width).toBe(300);
            if (width === 720) expect(input.width).toBe(432);
            expect(
              await page.evaluate(
                () => document.documentElement.scrollWidth <= innerWidth,
              ),
            ).toBe(true);
            if (width <= 720) {
              const toolbar = (await page
                .locator(".admin-user-search .toolbar")
                .boundingBox())!;
              const button = (await page
                .getByRole("search")
                .getByRole("button")
                .boundingBox())!;
              expect(button.width).toBe(toolbar.width);
              expect(button.y).toBeGreaterThanOrEqual(input.y + input.height);
            }
          }
        }
      }
    },
  );

  test(
    "CR030-073 search failure uses approved copy and retry keeps the submitted query: " +
      locale,
    async ({ page }) => {
      await openUsers(page, locale);
      let failed = false;
      const queries: string[] = [];
      await page.route("**/api/v1/admin/users?**", async (route) => {
        queries.push(
          new URL(route.request().url()).searchParams.get("username")!,
        );
        if (!failed) {
          failed = true;
          await route.fulfill({
            status: 500,
            contentType: "application/problem+json",
            body: JSON.stringify({
              type: "about:blank",
              title: "Internal error",
              status: 500,
              code: "internal_error",
              request_id: "req-error-073",
            }),
          });
        } else await route.continue();
      });
      await page.getByRole("search").locator("input").fill("learner_e2e");
      await page.getByRole("search").getByRole("button").click();
      const error = page.locator(".notice-danger");
      await expect(error.locator("strong")).toHaveText(
        locale === "en-US" ? "Search is unavailable" : "暂时无法搜索",
      );
      await expect(error.locator("strong + span")).toHaveText(
        locale === "en-US" ? "Please try again in a moment." : "请稍后再试。",
      );
      await error.getByRole("button").click();
      await expect(page.locator(".admin-user-result")).toHaveCount(2);
      expect(queries).toEqual(["learner_e2e", "learner_e2e"]);
      await expect(error).toHaveCount(0);
    },
  );
}

for (const locale of ["en-US", "zh-CN"]) {
  test(
    "CR030-073 loading skeleton retains its two-row mobile layout: " + locale,
    async ({ page }) => {
      await openUsers(page, locale);
      let release!: () => void;
      const hold = new Promise<void>((resolve) => {
        release = resolve;
      });
      await page.route("**/api/v1/admin/users?**", async (route) => {
        await hold;
        await route.fulfill({
          status: 200,
          json: {
            data: { items: [] },
            meta: {
              request_id: "req-loading-073",
              next_cursor: null,
              has_more: false,
            },
          },
        });
      });
      try {
        await page.getByRole("search").locator("input").fill("nobody");
        await page.getByRole("search").getByRole("button").click();
        await expect(page.locator(".user-skeleton")).toHaveCount(3);
        for (const width of [390, 720, 901, 1440]) {
          await page.setViewportSize({ width, height: 1000 });
          await expect(
            page.getByRole("search").locator("input"),
          ).toBeDisabled();
          const skeleton = page.locator(".user-skeleton").first();
          await expect(skeleton).toHaveCSS("align-items", "center");
          const [first, second, third] = await skeleton
            .locator("span")
            .evaluateAll((nodes) =>
              nodes.map((node) => {
                const box = node.getBoundingClientRect();
                return { x: box.x, y: box.y, height: box.height };
              }),
            );
          if (width <= 720) {
            expect(second!.y).toBeGreaterThanOrEqual(first!.y + first!.height);
            expect(third!.y).toBe(second!.y);
            expect(third!.x).toBeGreaterThan(second!.x);
          } else {
            expect(Math.abs(first!.y - second!.y)).toBeLessThan(3);
            expect(third!.y).toBe(second!.y);
          }
        }
      } finally {
        release();
        await page.unrouteAll({ behavior: "wait" });
      }
      await expect(page.locator(".admin-user-empty h2")).toHaveText(
        locale === "en-US" ? "No users found" : "没有找到用户",
      );
    },
  );
}
