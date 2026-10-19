import { chromium } from "../../../../../../frontend/node_modules/@playwright/test/index.mjs";
import { readFileSync, writeFileSync } from "node:fs";

const env = JSON.parse(readFileSync("/tmp/wordweave-cr306-qa080-backend/env.json", "utf8"));
const origin = "http://127.0.0.1:54713";
const out = { scope: "Independent CR-307 focus-only re-verification against the post-fix isolated Nuxt source copy and disposable formal backend.", source_archive_sha256: "c5af79f59f3f0e3afda9d2258e74f8059d6b5d04aaca359da7c077339269fb4c", viewports: {}, checks: {}, failures: [], result: "FAIL" };
const check = (name, value, detail) => { out.checks[name] = { pass: Boolean(value), detail }; if (!value) out.failures.push(name); };

async function login(context) {
  let response = await context.request.get(origin + "/api/v1/bootstrap", { headers: { Origin: origin, "Sec-Fetch-Site": "same-origin" } });
  const bootstrap = await response.json();
  response = await context.request.post(origin + "/api/v1/auth/login", { headers: { Origin: origin, "Sec-Fetch-Site": "same-origin", "X-CSRF-Token": bootstrap.data.csrf_token }, data: { username: env.ADMIN_USERNAME, password: env.ADMIN_PASSWORD, browser_ui_locale: "zh-CN" } });
  if (!response.ok()) throw new Error(`login ${response.status()}`);
}

async function one(browser, name, viewport) {
  const context = await browser.newContext({ viewport, locale: "zh-CN" });
  await login(context);
  const page = await context.newPage();
  let probes = 0;
  page.on("request", request => { if (new URL(request.url()).pathname === "/api/v1/admin/model-connection-test") probes++; });
  await page.goto(origin + "/admin/models");
  await page.waitForFunction(() => document.documentElement.dataset.appReady === "true");
  const card = page.locator(".generic-provider-card", { hasText: "CR306 QA disposable pass" });
  const opener = card.getByRole("button", { name: "编辑服务商", exact: true });
  const providerID = await card.getAttribute("data-provider-id");
  await opener.click();
  const dialog = page.locator("#admin-model"), close = dialog.locator(".dialog-close"), footer = dialog.locator(".dialog-actions");
  const cancel = footer.getByRole("button", { name: "取消", exact: true }), save = footer.getByRole("button", { name: "保存服务商", exact: true });
  await dialog.waitFor({ state: "visible" });

  await save.focus();
  await page.keyboard.press("Tab");
  const forwardWrap = await close.evaluate(el => document.activeElement === el);
  await page.keyboard.press("Shift+Tab");
  const backwardWrap = await save.evaluate(el => document.activeElement === el);
  let contained = true, escape = null;
  for (const key of [...Array(32).fill("Tab"), ...Array(32).fill("Shift+Tab")]) {
    await page.keyboard.press(key);
    const state = await page.evaluate(() => ({ inside: Boolean(document.activeElement?.closest("#admin-model")), tag: document.activeElement?.tagName, id: document.activeElement?.id }));
    if (!state.inside && !escape) escape = state;
    contained &&= state.inside;
  }

  const row = dialog.locator(".generic-model-item").first();
  await row.locator(".generic-model-advanced > summary").click();
  const custom = row.locator(".custom-parameters");
  await custom.fill('{"temperature":0.61}');
  await cancel.click();
  const confirm = page.locator("#model-discard"), keep = confirm.getByRole("button", { name: "继续编辑", exact: true }), discard = confirm.getByRole("button", { name: "放弃修改", exact: true });
  await confirm.waitFor({ state: "visible" });
  await discard.focus();
  await page.keyboard.press("Tab");
  const nestedForward = await confirm.locator(".dialog-close").evaluate(el => document.activeElement === el);
  await page.keyboard.press("Shift+Tab");
  const nestedBackward = await discard.evaluate(el => document.activeElement === el);
  const parentNotActive = await dialog.evaluate(el => !el.contains(document.activeElement));
  await keep.click();
  await confirm.waitFor({ state: "hidden" });
  const keepReturnsTrigger = await cancel.evaluate(el => document.activeElement === el);

  await cancel.click();
  await confirm.waitFor({ state: "visible" });
  await discard.click();
  await dialog.waitFor({ state: "hidden" });
  const bothClosed = !(await dialog.evaluate(el => el.matches(":modal"))) && !(await confirm.evaluate(el => el.matches(":modal")));
  const discardReturnsExact = await opener.evaluate(el => document.activeElement === el);

  await opener.click();
  await dialog.waitFor({ state: "visible" });
  await row.locator(".generic-model-advanced > summary").click();
  await custom.fill('{"temperature":0.62}');
  const staleHandle = await opener.elementHandle();
  // Force the captured opener stale while the editor stays open. This exercises
  // the stable provider-id fallback even when the saved-list refetch reuses DOM.
  await opener.evaluate(button => button.replaceWith(button.cloneNode(true)));
  const staleBeforeSave = !(await staleHandle.evaluate(el => el.isConnected));
  await save.click();
  await dialog.waitFor({ state: "hidden" });
  const staleDisconnected = !(await staleHandle.evaluate(el => el.isConnected));
  const current = page.locator(`[data-provider-id="${providerID}"] [data-provider-edit]`);
  const saveReturnsCurrent = await current.evaluate(el => document.activeElement === el);

  // Restore the disposable provider's original empty object without probing.
  await page.reload();
  await page.waitForFunction(() => document.documentElement.dataset.appReady === "true");
  const restoredCurrent = page.locator(`[data-provider-id="${providerID}"] [data-provider-edit]`);
  await restoredCurrent.click();
  await dialog.waitFor({ state: "visible" });
  await row.locator(".generic-model-advanced > summary").click();
  const savedReadback = JSON.parse(await custom.inputValue());
  await custom.fill("{}");
  await save.click();
  await dialog.waitFor({ state: "hidden" });

  const value = { provider_id_present: Boolean(providerID), forward_wrap: forwardWrap, backward_wrap: backwardWrap, sequence_contained: contained, first_escape: escape,
    nested_forward_wrap: nestedForward, nested_backward_wrap: nestedBackward, parent_not_active_while_confirm_topmost: parentNotActive,
    keep_returns_parent_trigger: keepReturnsTrigger, discard_closes_both: bothClosed, discard_returns_exact_opener: discardReturnsExact,
    old_opener_forced_disconnected_before_save: staleBeforeSave, old_opener_remains_disconnected_after_save: staleDisconnected, save_returns_current_same_provider_opener: saveReturnsCurrent, saved_readback: savedReadback, probes };
  out.viewports[name] = value;
  await context.close();
  return value;
}

const browser = await chromium.launch({ headless: true });
try {
  const desktop = await one(browser, "desktop", { width: 1440, height: 900 });
  const mobile = await one(browser, "mobile", { width: 390, height: 844 });
  const both = [desktop, mobile];
  check("topmost_tab_and_shift_tab_contained", both.every(x => x.forward_wrap && x.backward_wrap && x.sequence_contained && x.first_escape === null), both.map(x => ({forward:x.forward_wrap,backward:x.backward_wrap,escape:x.first_escape})));
  check("nested_keep_returns_parent_trigger", both.every(x => x.nested_forward_wrap && x.nested_backward_wrap && x.parent_not_active_while_confirm_topmost && x.keep_returns_parent_trigger));
  check("discard_closes_parent_and_child_then_returns_exact_opener", both.every(x => x.discard_closes_both && x.discard_returns_exact_opener));
  check("save_refetch_uses_connected_same_provider_opener", both.every(x => x.old_opener_forced_disconnected_before_save && x.old_opener_remains_disconnected_after_save && x.save_returns_current_same_provider_opener && x.saved_readback.temperature === 0.62));
  check("focus_retest_performs_no_probe", both.every(x => x.probes === 0));
} finally { await browser.close(); }
out.result = out.failures.length ? "FAIL" : "PASS";
writeFileSync(new URL("browser-focus-retest.json", import.meta.url), JSON.stringify(out, null, 2) + "\n");
console.log(JSON.stringify({ result: out.result, checks: Object.keys(out.checks).length, failures: out.failures }));
if (out.failures.length) process.exitCode = 1;
