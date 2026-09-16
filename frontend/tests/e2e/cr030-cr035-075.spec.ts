import { expect, test, type BrowserContext } from "@playwright/test";

async function authenticate(context: BrowserContext, locale: string) {
  await context.addCookies([
    {
      name: "wordweave_session",
      value: "admin",
      url: "http://127.0.0.1:3300",
    },
    {
      name: "wordweave_ui_locale",
      value: locale,
      url: "http://127.0.0.1:3300",
    },
  ]);
}

for (const locale of ["en-US", "zh-CN"]) {
  test(
    "CR030-075 detail contains legal long usernames without losing content: " +
      locale,
    async ({ page }) => {
      await authenticate(page.context(), locale);
      let username = "abcdefghijklmnopqrstuvwxyz123456";
      await page.route("**/api/v1/admin/users/user-e2e", async (route) => {
        const response = await route.fetch();
        const body = await response.json();
        body.data.user.username = username;
        await route.fulfill({ response, json: body });
      });
      for (const name of [
        "abcdefghijklmnopqrstuvwxyz123456",
        "W".repeat(32),
        "reader",
      ]) {
        username = name;
        await page.goto("/admin/users");
        await page.waitForFunction(
          () => document.documentElement.dataset.appReady === "true",
        );
        await page.getByRole("search").locator("input").fill("learner");
        await page.getByRole("search").getByRole("button").click();
        await page
          .locator('.admin-user-result a[href*="user-e2e"]')
          .first()
          .click();
        await expect(page.locator(".user-detail-name")).toHaveText(name);
        await page.evaluate(() => document.fonts.ready.then(() => undefined));
        for (const width of [320, 390, 720, 900, 901, 1440]) {
          await page.setViewportSize({ width, height: 1000 });
          const contained = await page
            .locator(".admin-user-detail-grid > .card")
            .first()
            .evaluate((card) => {
              const title = card.querySelector(".user-detail-name")!;
              const badge = card.querySelector(".status-badge")!;
              const tr = title.getBoundingClientRect();
              const br = badge.getBoundingClientRect();
              const cr = card.getBoundingClientRect();
              return (
                document.documentElement.scrollWidth <= innerWidth &&
                title.scrollWidth <= title.clientWidth + 1 &&
                tr.left >= cr.left &&
                tr.right <= br.left &&
                br.right <= cr.right &&
                badge.scrollWidth <= badge.clientWidth + 1
              );
            });
          expect(contained, `${name}, ${width}`).toBe(true);
          await expect(page.locator(".user-detail-name")).toHaveText(name);
          await expect(page.getByRole("search")).toBeVisible();
        }
      }
    },
  );

  test(
    "CR035-075 both semantic fieldset labels have one 8px gap and aligned text: " +
      locale,
    async ({ page }) => {
      await authenticate(page.context(), locale);
      await page.goto("/admin/plans");
      await page.waitForFunction(
        () => document.documentElement.dataset.appReady === "true",
      );
      await page.evaluate(() => document.fonts.ready.then(() => undefined));
      for (let group = 0; group < 4; group++) {
        await page.getByRole("tab").nth(group).click();
        for (const width of [320, 390, 720, 900, 901, 1440]) {
          await page.setViewportSize({ width, height: 1000 });
          const geometry = await page
            .locator(".admin-plan-form fieldset")
            .evaluateAll((fields) =>
              fields.map((field) => {
                const label = field.querySelector("legend")!;
                const list = label.nextElementSibling!;
                const range = document.createRange();
                range.selectNodeContents(label);
                return {
                  gap:
                    list.getBoundingClientRect().top -
                    label.getBoundingClientRect().bottom,
                  offset:
                    range.getBoundingClientRect().left -
                    list.getBoundingClientRect().left,
                };
              }),
            );
          expect(geometry).toEqual([
            { gap: 8, offset: 0 },
            { gap: 8, offset: 0 },
          ]);
          expect(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth,
            ),
          ).toBe(true);
        }
      }
    },
  );
}
