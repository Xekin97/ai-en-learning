import { chromium, expect, origin, adminUsername, adminPassword, recorder } from "./lib.mjs";

const out = recorder("admin-role-recheck");
const browser = await chromium.launch();
const context = await browser.newContext({ locale: "zh-CN", viewport: { width: 1440, height: 1000 } });
try {
  await context.addCookies([{ name: "wordweave_ui_locale", value: "zh-CN", url: origin }]);
  const page = await context.newPage();
  await page.goto(`${origin}/login?redirect=%2Freview`);
  await page.waitForFunction(() => document.documentElement.dataset.appReady === "true");
  await page.locator("input[autocomplete=username]").fill(adminUsername);
  await page.locator("input[type=password]").fill(adminPassword);
  await page.locator("form button[type=submit]").click();
  await expect(page).toHaveURL(`${origin}/admin/models`);
  out.record("admin role destination overrides learner-safe redirect", new URL(page.url()).pathname, "/admin/models");
  out.record("admin models route ready", await page.locator("main").isVisible(), true);
} catch (error) {
  out.error("admin role corrected fixture execution", error);
} finally {
  await context.close(); await browser.close();
}
out.save({ correction: "use isolated synthetic administrator password, not learner fixture password" });
