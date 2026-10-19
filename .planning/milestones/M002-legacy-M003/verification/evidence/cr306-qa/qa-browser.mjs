import { chromium } from "../../../../../../frontend/node_modules/@playwright/test/index.mjs";
import { readFileSync, writeFileSync } from "node:fs";

const here = new URL("./", import.meta.url);
const env = JSON.parse(readFileSync("/tmp/wordweave-cr306-qa080-backend/env.json", "utf8"));
const providerLog = "/tmp/wordweave-cr306-qa080-backend/provider-calls.jsonl";
const origin = "http://127.0.0.1:54713";
const evidence = new URL("./", here).pathname;
const results = { scope: "Independent browser QA against the disposable formal backend and isolated Nuxt runtime.", viewports: {}, checks: {}, failures: [], result: "FAIL" };

const labels = {
  edit: "编辑服务商", test: "测试模型", save: "保存服务商", cancel: "取消",
  keep: "继续编辑", stale: "配置已修改，上一次测试结果已失效。你仍可直接保存；仅在需要重新验证连接时再次测试。",
  noCall: "保存只更新配置，不会调用模型。连接测试需要你单独点击。",
  duplicate: "同一对象中不能出现重复键。请删除重复项后重试。你的输入已保留。",
};
const check = (name, value, detail = null) => {
  results.checks[name] = { pass: Boolean(value), detail };
  if (!value) results.failures.push(name);
};
const callCount = () => readFileSync(providerLog, "utf8").split("\n").filter(Boolean).length;

async function login(context) {
  let response = await context.request.get(origin + "/api/v1/bootstrap", { headers: { Origin: origin, "Sec-Fetch-Site": "same-origin" } });
  let body = await response.json();
  response = await context.request.post(origin + "/api/v1/auth/login", {
    headers: { Origin: origin, "Sec-Fetch-Site": "same-origin", "X-CSRF-Token": body.data.csrf_token },
    data: { username: env.ADMIN_USERNAME, password: env.ADMIN_PASSWORD, browser_ui_locale: "zh-CN" },
  });
  if (!response.ok()) throw new Error(`login failed ${response.status()}`);
}

async function run(browser, name, viewport) {
  const context = await browser.newContext({ viewport, locale: "zh-CN" });
  await login(context);
  const page = await context.newPage();
  const writes = [];
  let probes = 0;
  page.on("request", request => {
    const url = new URL(request.url());
    if (url.pathname === "/api/v1/admin/model-connection-test") probes++;
    if (url.pathname.includes("/api/v1/admin/model-providers/") && request.method() === "PATCH") writes.push(request.postDataJSON());
  });
  await page.goto(origin + "/admin/models");
  await page.waitForFunction(() => document.documentElement.dataset.appReady === "true");
  const card = page.locator(".generic-provider-card", { hasText: "CR306 QA disposable pass" });
  const opener = card.getByRole("button", { name: labels.edit, exact: true });
  await opener.click();
  const dialog = page.locator("#admin-model");
  const row = dialog.locator(".generic-model-item").first();
  const body = dialog.locator(".dialog-body");
  const footer = dialog.locator(".dialog-actions");
  await dialog.waitFor({ state: "visible" });
  const modal = await dialog.evaluate(el => el.matches(":modal"));
  const backdropBlocks = await page.evaluate(() => Boolean(document.elementFromPoint(2, 2)?.closest("#admin-model")));
  await row.locator(".generic-model-advanced > summary").click();
  const field = row.locator(".custom-parameters");
  const initial = await field.inputValue();
  const help = await field.getAttribute("aria-describedby");
  const noCallVisible = await dialog.getByText(labels.noCall, { exact: true }).isVisible();

  let held;
  await page.route("**/api/v1/admin/model-connection-test", route => { held = route; });
  await field.fill('{"temperature":0.4}');
  await row.getByRole("button", { name: labels.test, exact: true }).click();
  await page.waitForFunction(() => window.performance.getEntriesByType("resource").length >= 0);
  for (let i = 0; i < 100 && !held; i++) await page.waitForTimeout(10);
  const probeBody = held?.request().postDataJSON();
  await field.fill('{"temperature":0.5}');
  await row.getByRole("status").waitFor({ state: "visible" });
  const staleBefore = (await row.getByRole("status").textContent())?.trim();
  await held.fulfill({ json: { data: { ok: true }, meta: { request_id: "qa-late-probe" } } });
  await page.waitForTimeout(100);
  const staleAfter = (await row.getByRole("status").textContent())?.trim();

  const bad = '{"reasoning":{"enabled":false,"enabled":true}}';
  const writesBeforeInvalid = writes.length;
  await field.fill(bad);
  await dialog.getByRole("button", { name: labels.save, exact: true }).click();
  const invalid = {
    preserved: await field.inputValue(), aria: await field.getAttribute("aria-invalid"),
    focused: await field.evaluate(el => document.activeElement === el),
    message: await dialog.getByText(labels.duplicate, { exact: true }).isVisible(),
    writeDelta: writes.length - writesBeforeInvalid,
  };
  if (name === "mobile") await page.screenshot({ path: evidence + "mobile-invalid-json.png", fullPage: true });

  const headerBefore = await dialog.locator("h2").boundingBox();
  const footerBefore = await footer.boundingBox();
  await body.evaluate(el => { el.scrollTop = el.scrollHeight; });
  const headerAfter = await dialog.locator("h2").boundingBox();
  const footerAfter = await footer.boundingBox();
  const stableBox = (a, b) => a && b && Math.abs(a.x-b.x)<1 && Math.abs(a.y-b.y)<1 && Math.abs(a.width-b.width)<1 && Math.abs(a.height-b.height)<1;

  const footerCancel = footer.getByRole("button", { name: labels.cancel, exact: true });
  const discard = page.locator("#model-discard");
  const pathway = {};
  for (const [key, action] of [
    ["footer", () => footerCancel.click()],
    ["escape", () => page.keyboard.press("Escape")],
    ["header", () => dialog.locator(".dialog-close").click()],
    ["backdrop", () => page.mouse.click(2, 2)],
  ]) {
    await action();
    await discard.waitFor({ state: "visible" });
    pathway[key] = true;
    if (key === "footer" && name === "desktop") await page.screenshot({ path: evidence + "desktop-discard-confirm.png", fullPage: true });
    await discard.getByRole("button", { name: labels.keep, exact: true }).click();
    await discard.waitFor({ state: "hidden" });
  }

  await field.focus();
  let trapped = true, firstFocusEscape = null;
  for (let i = 0; i < 24; i++) {
    await page.keyboard.press(i % 5 === 0 ? "Shift+Tab" : "Tab");
    const focus = await page.evaluate(() => ({ inside: Boolean(document.activeElement?.closest("#admin-model")), tag: document.activeElement?.tagName, id: document.activeElement?.id, cls: document.activeElement?.className }));
    if (!focus.inside && !firstFocusEscape) firstFocusEscape = { iteration: i + 1, ...focus };
    trapped &&= focus.inside;
  }
  const saveCallsBefore = callCount();
  await field.fill('{"temperature":0.51}');
  await dialog.getByRole("button", { name: labels.save, exact: true }).click();
  await dialog.waitFor({ state: "hidden" });
  const focusStateAfterSave = await page.evaluate(() => ({ tag: document.activeElement?.tagName, text: document.activeElement?.textContent?.trim().slice(0,80), cls: document.activeElement?.className }));
  const focusRestored = await opener.evaluate(el => document.activeElement === el);
  const saveCallsAfter = callCount();
  await opener.click();
  await dialog.waitFor({ state: "visible" });
  await row.locator(".generic-model-advanced > summary").click();
  const readback = JSON.parse(await field.inputValue());
  const noOverflow = await dialog.evaluate(el => el.scrollWidth <= el.clientWidth);
  let targets44 = true;
  if (name === "mobile") {
    const boxes = await Promise.all([dialog.locator(".dialog-close"), footer.getByRole("button").first(), footer.getByRole("button").last()].map(x => x.boundingBox()));
    targets44 = boxes.every(x => x && x.width >= 44 && x.height >= 44);
  }
  if (name === "desktop") await page.screenshot({ path: evidence + "desktop-model-dialog.png", fullPage: true });
  await field.fill("{}");
  await dialog.getByRole("button", { name: labels.save, exact: true }).click();
  await dialog.waitFor({ state: "hidden" });

  const value = { modal, backdropBlocks, initial, helpPresent: Boolean(help), noCallVisible, probes, probeParameters: probeBody?.custom_parameters,
    staleBefore, staleAfter, invalid, fixedHeader: stableBox(headerBefore, headerAfter), fixedFooter: stableBox(footerBefore, footerAfter),
    closePathways: pathway, focusTrapped: trapped, firstFocusEscape, focusRestored, focusStateAfterSave, saveProviderCallDelta: saveCallsAfter-saveCallsBefore,
    readback, noOverflow, targets44, patchCount: writes.length,
  };
  results.viewports[name] = value;
  await context.close();
  return value;
}

const browser = await chromium.launch({ headless: true });
try {
  const desktop = await run(browser, "desktop", { width: 1440, height: 900 });
  const mobile = await run(browser, "mobile", { width: 390, height: 844 });
  check("real_modal_backdrop_and_focus_contract", [desktop,mobile].every(x => x.modal && x.backdropBlocks && x.focusTrapped && x.focusRestored));
  check("raw_duplicate_preserved_focused_and_not_written", [desktop,mobile].every(x => x.invalid.preserved.includes('"enabled":true') && x.invalid.aria === "true" && x.invalid.focused && x.invalid.message && x.invalid.writeDelta === 0));
  check("explicit_late_probe_becomes_stale", [desktop,mobile].every(x => x.probes === 1 && x.probeParameters?.temperature === 0.4 && x.staleBefore === labels.stale && x.staleAfter === labels.stale));
  check("all_four_dirty_close_paths_confirm", [desktop,mobile].every(x => Object.values(x.closePathways).length === 4 && Object.values(x.closePathways).every(Boolean)));
  check("scroll_layout_and_mobile_targets", [desktop,mobile].every(x => x.fixedHeader && x.fixedFooter && x.noOverflow) && mobile.targets44);
  check("save_readback_and_zero_automatic_provider_calls", [desktop,mobile].every(x => x.initial === "{}" && x.noCallVisible && x.readback.temperature === 0.51 && x.saveProviderCallDelta === 0 && x.patchCount === 2));
} finally { await browser.close(); }
results.result = results.failures.length ? "FAIL" : "PASS";
writeFileSync(new URL("browser.json", here), JSON.stringify(results, null, 2) + "\n");
console.log(JSON.stringify({ result: results.result, checks: Object.keys(results.checks).length, failures: results.failures }));
if (results.failures.length) process.exitCode = 1;
