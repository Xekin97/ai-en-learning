import { chromium, webkit, expect, request, dir, origin, password, api, register, recorder } from "./lib.mjs";

const engine = process.env.QA085_ENGINE || "chromium";
const run = process.env.QA085_RUN || `${engine}-darwin`;
const browser = await (engine === "webkit" ? webkit : chromium).launch();
const out = recorder(`original-scope-${run}`);
const design = "http://127.0.0.1:6010";
const pageErrors = [];
const settle = (page) => page.evaluate(async () => { await document.fonts.ready; await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))); });
const ready = async (page) => { await page.waitForFunction(() => document.documentElement.dataset.appReady === "true"); await settle(page); };
const texts = async (page, selector) => (await page.locator(selector).allInnerTexts()).map((text) => text.replace(/\s+/gu, " ").trim());
async function context(locale, width) {
  const value = await browser.newContext({ locale, viewport: { width, height: 1000 }, timezoneId: "Asia/Shanghai" });
  value.setDefaultTimeout(12000);
  await value.addCookies([{ name: "wordweave_ui_locale", value: locale, url: origin }]);
  value.on("page", (page) => page.on("pageerror", (error) => pageErrors.push(error.message)));
  return value;
}
async function prototype(value, page, role, locale) {
  const result = await value.newPage();
  await result.goto(`${design}/prototype/?page=${page}&role=${role}&state=default&locale=${locale}`);
  await result.locator("main").waitFor();
  await result.locator(".prototype-tools").evaluate((node) => { node.style.display = "none"; });
  await settle(result); return result;
}
const intent = (page) => page.locator(".auth-card").evaluate((card) => {
  const hint = card.querySelector(".auth-intent"); const title = card.querySelector("h2"); const box = card.getBoundingClientRect(); const rect = hint.getBoundingClientRect(); const style = getComputedStyle(hint);
  return { text: hint.textContent.trim(), beforeTitle: Boolean(hint.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING), firstChild: card.firstElementChild === hint, role: hint.getAttribute("role"), topWithinCard: rect.top - box.top, titleTopWithinCard: title.getBoundingClientRect().top - box.top, style: { background: style.backgroundColor, color: style.color, padding: style.padding, margin: style.margin, borderRadius: style.borderRadius } };
});

try {
  for (const locale of ["en-US", "zh-CN"]) for (const width of [390, 1440]) {
    const value = await context(locale, width); const actualPage = await value.newPage(); const designPage = await prototype(value, "PAGE-007", "visitor", locale); const key = `${run} ${locale} ${width}`;
    try {
      await actualPage.goto(`${origin}/review`); await ready(actualPage); await actualPage.locator(".auth-gate .button-primary").click(); await expect(actualPage).toHaveURL((url) => url.pathname === "/login"); await ready(actualPage);
      await designPage.locator('.auth-gate [data-action="navigate"][data-value="PAGE-003"]').click(); await settle(designPage);
      for (const mode of ["login", "register"]) {
        if (mode === "register") { await actualPage.locator(".auth-alt a").click(); await ready(actualPage); await designPage.locator('.auth-alt [data-value="PAGE-002"]').click(); await settle(designPage); }
        const actual = await intent(actualPage); const expected = await intent(designPage);
        for (const field of ["text", "beforeTitle", "firstChild", "role", "style"]) out.record(`${key} ${mode} ${field}`, actual[field], expected[field]);
        out.record(`${key} ${mode} safe return intent`, new URL(actualPage.url()).searchParams.get("redirect"), "/review");
      }
    } catch (error) { out.error(`${key} auth prototype comparison`, error); }
    finally { await value.close(); }
  }

  const value = await context("en-US", 1440);
  const username = `qa085_scope_${run.replaceAll("-", "_").slice(0, 18)}`;
  out.record(`${run} dedicated learner register`, (await register(value, username, "en-US")).status, 201);
  const account = await value.newPage(); const designPage = await prototype(value, "PAGE-009", "learner", "en-US");
  await account.goto(`${origin}/account`); await ready(account);
  const trigger = account.locator(".settings-grid .card-footer .button-secondary");
  await trigger.click(); await designPage.locator('[data-action="change-password"]').click();
  for (const width of [390, 1440]) {
    await account.setViewportSize({ width, height: 1000 }); await designPage.setViewportSize({ width, height: 1000 }); await settle(account); await settle(designPage);
    for (const [field, selector] of [["title", "dialog h2"], ["labels", "dialog .field-label"], ["helpers", "dialog .helper"], ["notice", "dialog .notice"], ["buttons", "dialog .dialog-footer button"]]) out.record(`${run} en-US ${width} password ${field}`, await texts(account, selector), await texts(designPage, selector));
  }
  await account.keyboard.press("Escape"); await designPage.keyboard.press("Escape");
  await account.locator(".danger-zone .button-danger").click(); await designPage.locator('[data-action="delete-account"]').click();
  out.record(`${run} shared account-deletion identity helper`, await texts(account, "dialog .field .helper"), await texts(designPage, "dialog .field .helper"));
  await account.keyboard.press("Escape"); await designPage.keyboard.press("Escape");
  const snapshot = await (await value.request.get(`${origin}/api/v1/bootstrap`)).json();
  out.record(`${run} account locale preserved`, snapshot.data.ui_locale, "en-US");
  const logout = await api(value, "POST", "/api/v1/auth/logout", snapshot.data.csrf_token, {});
  out.record(`${run} own-session logout`, [logout.status, logout.raw.length, logout.headers["content-type"] ?? null, logout.headers["cache-control"]], [204, 0, null, "no-store"]);
  await value.close();
} catch (error) {
  out.error(`${run} original scope execution`, error);
} finally {
  out.record(`${run} browser page errors`, pageErrors, []);
  await browser.close();
}
out.save({ purpose: "Independent QA085 semantic coverage of every QA081 original 125-check category without adopting the historical fixed count as the oracle", engine, run, comparison: "live candidate versus approved prototype" });
