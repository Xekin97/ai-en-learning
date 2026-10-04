import { chromium, firefox, webkit, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readFileSync } from "node:fs";
const origin = "http://127.0.0.1:3300";
const source = JSON.parse(
  readFileSync(
    new URL(
      "../../../.planning/milestones/M002/design/copy.json",
      import.meta.url,
    ),
  ),
);
const t = (k) => source.static["en." + k] ?? source.templates["en." + k];
for (const [name, engine] of Object.entries({ chromium, firefox, webkit })) {
  const browser = await engine.launch();
  try {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.setDefaultTimeout(10000);
    const ready = async () => {
      await page.waitForFunction(
        () => document.documentElement.dataset.appReady === "true",
      );
      await page.waitForLoadState("networkidle");
      await page.evaluate(() => document.fonts.ready.then(() => undefined));
    };
    for (const width of [320, 390, 768, 900, 1080, 1081, 1100, 1101, 1440]) {
      await page.setViewportSize({ width, height: width === 320 ? 568 : 844 });
      await page.goto(origin);
      await ready();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(origin + "/login");
    await ready();
    await page.getByLabel(t("i.username"), { exact: true }).fill("learner_e2e");
    await page
      .getByLabel(t("i.password"), { exact: true })
      .fill("CorrectPass123!");
    await page.locator(".auth-form button[type=submit]").click();
    const toast = page.locator("#toast");
    await expect(toast).toBeVisible();
    await expect(page.locator("dialog[open]")).toBeVisible();
    expect(await toast.evaluate((el) => el.parentElement?.tagName)).toBe(
      "DIALOG",
    );
    expect(await toast.evaluate((el) => el.matches(":popover-open"))).toBe(
      true,
    );
    expect(
      await toast
        .locator(".toast-days")
        .evaluate((el) => getComputedStyle(el).fontSize),
    ).toBe("24px");
    const samples = await toast.evaluate(async (el) => {
      const values = [];
      for (let i = 0; i < 45; i++) {
        await new Promise(requestAnimationFrame);
        values.push(+getComputedStyle(el).opacity);
      }
      return values;
    });
    expect(samples.some((x) => x > 0 && x < 1)).toBe(true);
    expect(samples.at(-1)).toBeGreaterThan(0.99);
    await page.waitForTimeout(7000);
    await expect(toast).toBeVisible();
    await expect(toast).toBeHidden({ timeout: 5000 });
    await page.keyboard.press("Escape");
    await page.reload();
    await ready();
    await expect(toast).toBeHidden();
    await expect(page.locator("dialog[open]")).toHaveCount(0);
    for (const [actor, routes] of [
      [
        "learner",
        [
          "/account",
          "/account/growth",
          "/account/items",
          "/account/exchange",
          "/library",
          "/review",
          "/create",
        ],
      ],
      [
        "admin",
        [
          "/admin",
          "/admin/models",
          "/admin/plans",
          "/admin/users?all=1",
          "/admin/growth",
          "/admin/notices",
          "/admin/presets",
          "/admin/analytics",
        ],
      ],
    ]) {
      await context.addCookies([
        { name: "wordweave_session", value: actor, url: origin },
      ]);
      for (const route of routes) {
        await page.goto(origin + route);
        await ready();
        await page.waitForTimeout(400);
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        const axe = await new AxeBuilder({ page }).analyze();
        const serious = axe.violations.filter((v) =>
          ["serious", "critical"].includes(v.impact),
        );
        if (serious.length)
          throw Error(
            JSON.stringify({
              name,
              route,
              violations: serious.map((v) => ({
                id: v.id,
                nodes: v.nodes.map((n) => n.target),
              })),
            }),
          );
      }
    }
    await context.clearCookies();
    await context.addCookies([
      { name: "wordweave_ui_locale", value: "zh-CN", url: origin },
    ]);
    await page.goto(origin + "/login");
    await ready();
    expect(await page.locator("h1").innerText()).toBe(
      source.static["zh.login"],
    );
    await page.setViewportSize({ width: 720, height: 450 });
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "200%";
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: new URL(
        `../../../.planning/milestones/M002/implementation/evidence/frontend-matrix-${name}-zh-login.png`,
        import.meta.url,
      ).pathname,
      fullPage: true,
    });
    expect(errors).toEqual([]);
    console.log(
      JSON.stringify({
        browser: name,
        widths: 9,
        privateRoutes: 15,
        toast: "10s + 300ms fades, actual frames, top layer, 24px days",
        axe: "zero serious/critical",
        pageErrors: 0,
      }),
    );
  } finally {
    await browser.close();
  }
}
