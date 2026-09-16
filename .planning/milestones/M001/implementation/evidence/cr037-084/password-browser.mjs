import { chromium, webkit, expect, request, dir, origin, password, api, recorder } from "./lib.mjs";
import { join } from "node:path";

const engine = process.env.DEV084_ENGINE || "chromium";
const browserType = engine === "webkit" ? webkit : chromium;
const run = process.env.DEV084_RUN || `${engine}-${process.platform}`;
const out = recorder(`password-${run}`);
const observations = [];
const browser = await browserType.launch();

async function bootstrap(context) {
  return (await (await context.request.get(`${origin}/api/v1/bootstrap`)).json()).data;
}
async function login(context, username, secret, locale) {
  const initial = await bootstrap(context);
  return api(context, "POST", "/api/v1/auth/login", initial.csrf_token, {
    username,
    password: secret,
    browser_ui_locale: locale,
  });
}
async function register(context, username, locale) {
  const initial = await bootstrap(context);
  return api(context, "POST", "/api/v1/auth/register", initial.csrf_token, {
    username,
    password,
    password_confirmation: password,
    ui_locale: locale,
  });
}

for (const locale of ["en-US", "zh-CN"]) {
  const key = `${run} ${locale}`;
  const username = `dev084_${run.replaceAll("-", "_").slice(0, 20)}_${locale.slice(0, 2)}`;
  const updated = `Qa084Updated${locale === "en-US" ? "En" : "Zh"}!`;
  const current = await browser.newContext({
    locale,
    timezoneId: "Asia/Shanghai",
    viewport: { width: 390, height: 1000 },
  });
  const other = await request.newContext();
  try {
    out.record(`${key} register`, (await register(current, username, locale)).status, 201);
    out.record(`${key} second session`, (await login({ request: other }, username, password, locale)).status, 200);
    const page = await current.newPage();
    await page.goto(`${origin}/account`);
    await page.waitForFunction(() => document.documentElement.dataset.appReady === "true");
    const trigger = page.locator(".settings-grid .card-footer .button-secondary");
    await trigger.click();
    const dialog = page.locator("dialog[open]");
    const inputs = dialog.locator('input[type="password"]');
    const submit = dialog.locator('button[type="submit"]');
    out.record(`${key} initial focus`, await inputs.nth(0).evaluate((node) => node === document.activeElement), true);
    await inputs.nth(0).fill("Incorrect084Only!");
    await inputs.nth(1).fill(updated);
    await inputs.nth(2).fill(updated);
    let responseWait = page.waitForResponse(
      (response) => response.request().method() === "PUT" && response.url().endsWith("/me/password"),
    );
    await submit.click();
    const response = await responseWait;
    const error = dialog.locator(".app-error");
    out.record(`${key} wrong current status`, response.status(), 422);
    await expect(error).toHaveText(
      locale === "en-US" ? "Check the information you entered." : "请检查填写内容。",
    );
    out.record(`${key} one error and inside dialog`, [await page.locator(".app-error").count(), await error.count()], [1, 1]);
    out.record(`${key} error role`, await error.getAttribute("role"), "alert");
    out.record(
      `${key} no page-behind error`,
      await page.locator(".app-error").evaluateAll((nodes) =>
        nodes.filter((node) => !node.closest("dialog:modal")).length,
      ),
      0,
    );
    out.record(
      `${key} fields retained`,
      await inputs.evaluateAll((nodes) => nodes.map((node) => node.value)),
      ["Incorrect084Only!", updated, updated],
    );
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.evaluate(async () => {
        await document.fonts.ready;
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      });
      out.record(
        `${key} ${width} dialog fits`,
        await dialog.evaluate((node) => {
          const rect = node.getBoundingClientRect();
          return rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight;
        }),
        true,
      );
      out.record(
        `${key} ${width} no horizontal overflow`,
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        true,
      );
      await page.screenshot({
        path: join(dir, `${run}-${locale}-${width}-password-error.png`),
        fullPage: true,
      });
    }
    let ax = null;
    if (engine === "chromium") {
      const client = await current.newCDPSession(page);
      await client.send("Accessibility.enable");
      const root = await client.send("DOM.getDocument");
      const node = await client.send("DOM.querySelector", {
        nodeId: root.root.nodeId,
        selector: "dialog .app-error",
      });
      const tree = await client.send("Accessibility.getPartialAXTree", {
        nodeId: node.nodeId,
        fetchRelatives: false,
      });
      ax = tree.nodes.map((item) => ({ ignored: item.ignored, role: item.role, name: item.name }));
      out.record(`${key} native AX not ignored`, tree.nodes[0]?.ignored, false);
      out.record(`${key} native AX role`, tree.nodes[0]?.role?.value, "alert");
      await client.detach();
    }
    observations.push({ key, errorText: await error.innerText(), ax });
    out.record(`${key} failed attempt keeps other session`, (await api({ request: other }, "GET", "/api/v1/me/account")).status, 200);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    out.record(`${key} Escape returns focus`, await trigger.evaluate((node) => node === document.activeElement), true);
    await trigger.click();
    out.record(`${key} reopen clears error`, await page.locator("dialog .app-error").count(), 0);
    out.record(`${key} reopen clears fields`, await inputs.evaluateAll((nodes) => nodes.map((node) => node.value)), ["", "", ""]);
    await inputs.nth(0).fill("Incorrect084Again!");
    await inputs.nth(1).fill(updated);
    await inputs.nth(2).fill(updated);
    responseWait = page.waitForResponse(
      (item) => item.request().method() === "PUT" && item.url().endsWith("/me/password"),
    );
    await inputs.nth(0).press("Enter");
    out.record(`${key} second wrong status`, (await responseWait).status(), 422);
    await expect(dialog.locator(".app-error")).toBeVisible();
    await inputs.nth(0).fill(password);
    responseWait = page.waitForResponse(
      (item) => item.request().method() === "PUT" && item.url().endsWith("/me/password"),
    );
    await inputs.nth(0).press("Enter");
    await expect(dialog.locator(".app-error")).toHaveCount(0);
    const success = await responseWait;
    out.record(`${key} corrected retry status`, success.status(), 204);
    out.record(`${key} corrected retry no-store`, success.headers()["cache-control"], "no-store");
    await expect(page.locator("dialog")).toHaveCount(0);
    out.record(`${key} success returns focus`, await trigger.evaluate((node) => node === document.activeElement), true);
    out.record(`${key} current session stays`, (await api(current, "GET", "/api/v1/me/account")).status, 200);
    out.record(`${key} other session revoked`, (await api({ request: other }, "GET", "/api/v1/me/account")).status, 401);
    const probe = await request.newContext();
    out.record(`${key} old password rejected`, (await login({ request: probe }, username, password, locale)).status, 401);
    out.record(`${key} new password accepted`, (await login({ request: probe }, username, updated, locale)).status, 200);
    await probe.dispose();
  } catch (error) {
    out.error(`${key} execution`, error);
  } finally {
    await current.close().catch(() => {});
    await other.dispose().catch(() => {});
  }
}
await browser.close();
out.save({ observations });
