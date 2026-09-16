import { chromium, webkit, expect, request, dir, origin, password, api, register, login, recorder } from "./lib.mjs";
import { join } from "node:path";

const engine = process.env.QA085_ENGINE || "chromium";
const run = process.env.QA085_RUN || `${engine}-${process.platform}`;
const browserType = engine === "webkit" ? webkit : chromium;
const out = recorder(`password-${run}`);
const observations = [];
const browser = await browserType.launch();

for (const locale of ["en-US", "zh-CN"]) {
  const key = `${run} ${locale}`;
  const username = `qa085_${run.replaceAll("-", "_").slice(0, 17)}_${locale.slice(0, 2)}`;
  const updated = `Qa085Updated${locale === "en-US" ? "En" : "Zh"}!`;
  const current = await browser.newContext({ locale, timezoneId: "Asia/Shanghai", viewport: { width: 390, height: 1000 } });
  const other = await request.newContext();
  try {
    out.record(`${key} register`, (await register(current, username, locale)).status, 201);
    out.record(`${key} second session`, (await login({ request: other }, username, password, locale)).status, 200);
    const page = await current.newPage();
    await page.goto(`${origin}/account`);
    await page.waitForFunction(() => document.documentElement.dataset.appReady === "true");
    const trigger = page.locator(".settings-grid .card-footer .button-secondary");
    await trigger.click();
    let dialog = page.locator("dialog[open]");
    let inputs = dialog.locator('input[type="password"]');
    out.record(`${key} initial focus`, await inputs.nth(0).evaluate((node) => node === document.activeElement), true);
    out.record(`${key} localized dialog copy`, await dialog.locator(".helper, .notice").allInnerTexts(), locale === "en-US"
      ? ["Confirm it’s you", "8–128 characters", "Enter the same password again", "Your current session will stay open. Other sessions will be signed out."]
      : ["用于确认是账号本人", "8–128 个字符", "再次输入相同密码", "修改成功后保留当前会话，其他已有会话全部退出。"]);

    await inputs.nth(0).fill("CancelAttempt085!");
    await inputs.nth(1).fill(updated);
    await inputs.nth(2).fill(updated);
    await dialog.locator(".dialog-footer .button-secondary").click();
    await expect(page.locator("dialog[open]")).toHaveCount(0);
    out.record(`${key} cancel returns focus`, await trigger.evaluate((node) => node === document.activeElement), true);
    await trigger.click();
    dialog = page.locator("dialog[open]"); inputs = dialog.locator('input[type="password"]');
    out.record(`${key} cancel reopen clears fields`, await inputs.evaluateAll((nodes) => nodes.map((node) => node.value)), ["", "", ""]);

    await inputs.nth(0).fill("Incorrect085Only!");
    await inputs.nth(1).fill(updated);
    await inputs.nth(2).fill(updated);
    let responseWait = page.waitForResponse((response) => response.request().method() === "PUT" && response.url().endsWith("/me/password"));
    await dialog.locator('button[type="submit"]').click();
    const response = await responseWait;
    const error = dialog.locator(".app-error");
    out.record(`${key} wrong current status`, response.status(), 422);
    await expect(error).toHaveText(locale === "en-US" ? "Check the information you entered." : "请检查填写内容。");
    out.record(`${key} one password error inside dialog`, [await page.locator(".app-error").count(), await error.count()], [1, 1]);
    out.record(`${key} error role`, await error.getAttribute("role"), "alert");
    out.record(`${key} no page-behind error`, await page.locator(".app-error").evaluateAll((nodes) => nodes.filter((node) => !node.closest("dialog:modal")).length), 0);
    out.record(`${key} fields retained`, await inputs.evaluateAll((nodes) => nodes.map((node) => node.value)), ["Incorrect085Only!", updated, updated]);

    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.evaluate(async () => { await document.fonts.ready; await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))); });
      const visual = await dialog.evaluate((node) => {
        const rect = node.getBoundingClientRect();
        const errorRect = node.querySelector(".app-error").getBoundingClientRect();
        const inputs = [...node.querySelectorAll('input[type="password"]')].map((item) => item.getBoundingClientRect());
        const footer = node.querySelector(".dialog-footer").getBoundingClientRect();
        const separated = inputs.every((item, index) => index === 0 || item.top >= inputs[index - 1].bottom);
        return {
          fits: rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight,
          noHorizontalOverflow: document.documentElement.scrollWidth <= innerWidth,
          errorVisible: errorRect.width > 0 && errorRect.height > 0 && errorRect.top >= rect.top && errorRect.bottom <= rect.bottom,
          fieldsSeparated: separated,
          footerBelowFields: footer.top >= inputs.at(-1).bottom,
        };
      });
      out.record(`${key} ${width} visual geometry`, visual, { fits: true, noHorizontalOverflow: true, errorVisible: true, fieldsSeparated: true, footerBelowFields: true });
      await page.screenshot({ path: join(dir, `${run}-${locale}-${width}-password-error.png`), fullPage: true });
    }

    let ax = null;
    if (engine === "chromium") {
      const client = await current.newCDPSession(page);
      await client.send("Accessibility.enable");
      const root = await client.send("DOM.getDocument");
      const node = await client.send("DOM.querySelector", { nodeId: root.root.nodeId, selector: "dialog .app-error" });
      const tree = await client.send("Accessibility.getPartialAXTree", { nodeId: node.nodeId, fetchRelatives: false });
      ax = tree.nodes.map((item) => ({ ignored: item.ignored, role: item.role, name: item.name }));
      out.record(`${key} native AX ignored`, tree.nodes[0]?.ignored, false);
      out.record(`${key} native AX role`, tree.nodes[0]?.role?.value, "alert");
      await client.detach();
    }
    observations.push({ key, errorText: await error.innerText(), ax });
    out.record(`${key} failed attempt keeps current session`, (await api(current, "GET", "/api/v1/me/account")).status, 200);
    out.record(`${key} failed attempt keeps other session`, (await api({ request: other }, "GET", "/api/v1/me/account")).status, 200);

    await page.keyboard.press("Escape");
    await expect(page.locator("dialog[open]")).toHaveCount(0);
    out.record(`${key} Escape returns focus`, await trigger.evaluate((node) => node === document.activeElement), true);
    await trigger.click(); dialog = page.locator("dialog[open]"); inputs = dialog.locator('input[type="password"]');
    out.record(`${key} Escape reopen clears error`, await dialog.locator(".app-error").count(), 0);
    out.record(`${key} Escape reopen clears fields`, await inputs.evaluateAll((nodes) => nodes.map((node) => node.value)), ["", "", ""]);

    await inputs.nth(0).fill("Incorrect085Again!");
    await inputs.nth(1).fill(updated);
    await inputs.nth(2).fill(updated);
    responseWait = page.waitForResponse((item) => item.request().method() === "PUT" && item.url().endsWith("/me/password"));
    await inputs.nth(0).press("Enter");
    out.record(`${key} new attempt wrong status`, (await responseWait).status(), 422);
    await expect(dialog.locator(".app-error")).toBeVisible();
    await inputs.nth(0).fill(password);
    responseWait = page.waitForResponse((item) => item.request().method() === "PUT" && item.url().endsWith("/me/password"));
    await inputs.nth(0).press("Enter");
    const success = await responseWait;
    await expect(page.locator("dialog[open]")).toHaveCount(0);
    out.record(`${key} corrected retry status`, success.status(), 204);
    if (engine === "chromium") out.record(`${key} corrected retry body bytes`, (await success.body()).length, 0);
    out.record(`${key} corrected retry content type absent`, success.headers()["content-type"] ?? null, null);
    out.record(`${key} corrected retry no-store`, success.headers()["cache-control"], "no-store");
    out.record(`${key} success returns focus`, await trigger.evaluate((node) => node === document.activeElement), true);
    out.record(`${key} success clears dialog error`, await page.locator("dialog .app-error").count(), 0);
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
out.save({ engine, run, observations });
