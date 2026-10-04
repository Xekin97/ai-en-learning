import { chromium, webkit, expect } from "@playwright/test";
import { writeFile } from "node:fs/promises";

const origin = process.env.UI26_ORIGIN || "http://127.0.0.1:3311";
const evidence = new URL(
  "../../../.planning/milestones/M002/implementation/evidence/frontend-header-locale/",
  import.meta.url,
);
const results = [],
  errors = [],
  designs = new Map();
const appearance = (locator) =>
  locator.evaluate((el) => {
    const s = getComputedStyle(el),
      r = el.getBoundingClientRect();
    return {
      width: r.width,
      height: r.height,
      fontSize: s.fontSize,
      paddingTop: s.paddingTop,
      paddingBottom: s.paddingBottom,
      borderRadius: s.borderRadius,
      background: s.backgroundColor,
      color: s.color,
    };
  });
let browser;
try {
  browser = await chromium.launch();
  for (const width of [1440, 390, 320]) {
    const p = await browser.newPage({ viewport: { width, height: 900 } });
    await p.goto(`http://127.0.0.1:4186/prototype/?page=home&lang=en`);
    const control = p.locator(".locale-control [role=combobox]");
    await expect(control).toHaveText("EN");
    designs.set(width, await appearance(control));
    if (width !== 390)
      await p.locator(".locale-control").screenshot({
        animations: "disabled",
        path: new URL(`design-${width}.png`, evidence).pathname,
      });
    await p.close();
  }
  await browser.close();
  for (const [engine, driver] of [
    ["chromium", chromium],
    ["webkit", webkit],
  ]) {
    browser = await driver.launch();
    for (const role of ["visitor", "learner", "admin"])
      for (const width of [1440, 390, 320]) {
        const context = await browser.newContext({
          viewport: { width, height: 900 },
        });
        context.setDefaultTimeout(8000);
        await context.addCookies([
          { name: "wordweave_ui_locale", value: "en-US", url: origin },
          ...(role === "visitor"
            ? []
            : [{ name: "wordweave_session", value: role, url: origin }]),
        ]);
        const page = await context.newPage(),
          writes = [];
        page.on("pageerror", (e) =>
          errors.push({ engine, role, width, message: e.message }),
        );
        page.on("request", (r) => {
          if (r.method() === "PUT" && r.url().endsWith("/me/ui-locale"))
            writes.push(r.postDataJSON());
        });
        const path = role === "admin" ? "/admin/plans" : "/";
        await page.goto(origin + path);
        await page.waitForFunction(
          () => document.documentElement.dataset.appReady === "true",
        );
        const control = page
          .locator("header .locale-control")
          .getByRole("combobox");
        await expect(control).toHaveCount(1);
        await expect(control).toHaveText("EN");
        await expect(control).toHaveAttribute("aria-label", "Switch language");
        const actual = await appearance(control),
          design = designs.get(width);
        expect(actual).toEqual(design);
        await expect(
          page.locator(
            ".header-actions > button[aria-label='Switch language']",
          ),
        ).toHaveCount(0);
        await control.click();
        await expect(
          page.getByRole("option", { name: "中文", exact: true }),
        ).toBeVisible();
        await expect(
          page.getByRole("option", { name: "EN", exact: true }),
        ).toHaveAttribute("aria-selected", "true");
        await page.keyboard.press("Home");
        await page.keyboard.press("Enter");
        await expect(control).toHaveText("中文");
        await expect(control).toHaveAttribute("aria-expanded", "false");
        await expect(control).toBeFocused();
        await expect
          .poll(() =>
            context
              .cookies()
              .then(
                (items) =>
                  items.find((c) => c.name === "wordweave_ui_locale")?.value,
              ),
          )
          .toBe("zh-CN");
        if (role === "visitor") expect(writes).toEqual([]);
        else await expect.poll(() => writes).toEqual([{ ui_locale: "zh-CN" }]);
        await page.reload();
        await page.waitForFunction(
          () => document.documentElement.dataset.appReady === "true",
        );
        await expect(control).toHaveText("中文");
        await control.click();
        await page.keyboard.press("Escape");
        await expect(control).toHaveText("中文");
        await expect(control).toBeFocused();
        await control.click();
        await page.getByRole("option", { name: "EN", exact: true }).click();
        await expect(control).toHaveText("EN");
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        if (role === "visitor" && engine === "chromium" && width !== 390)
          await page.locator(".locale-control").screenshot({
            animations: "disabled",
            path: new URL(`implementation-${width}.png`, evidence).pathname,
          });
        results.push({
          engine,
          role,
          width,
          result: "PASS",
          appearance: actual,
          localeWrites: writes.length,
        });
        await context.close();
      }
    await browser.close();
    browser = null;
  }
  expect(errors).toEqual([]);
} catch (error) {
  results.push({ result: "FAIL", message: error.message });
  process.exitCode = 1;
} finally {
  await browser?.close();
  await writeFile(
    new URL("browser-results.json", evidence),
    JSON.stringify({ origin, results, pageErrors: errors }, null, 2),
  );
  console.log(
    JSON.stringify({
      passed: results.filter((x) => x.result === "PASS").length,
      failed: results.filter((x) => x.result === "FAIL"),
      pageErrors: errors,
    }),
  );
}
