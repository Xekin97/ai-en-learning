/** Independent browser observations on the QA-owned controlled fixture stack. */
import { chromium } from "../../../../../../frontend/node_modules/@playwright/test/index.mjs";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const origin = "http://127.0.0.1:3322";
const backend = "http://127.0.0.1:38122";
const screenshots = resolve(here, "screenshots");
await mkdir(screenshots, { recursive: true });
const copySource = JSON.parse(await readFile(resolve(here, "../../../../M002/design/copy.json"), "utf8"));
const currentCopySource = JSON.parse(await readFile(resolve(here, "../../../design/copy.json"), "utf8"));
const copy = (locale, key) => copySource.static[`${locale}.${key}`] ?? copySource.templates[`${locale}.${key}`];
const observations = { scope: "controlled local fixture; synthetic adapt content is used only for motion, race, and layout behavior", checks: {}, failures: [], desktop: {}, reduced: {}, mobilePreview: {}, ui12: {} };
function check(name, pass, detail = null) {
  observations.checks[name] = { pass: Boolean(pass), detail };
  if (!pass) observations.failures.push(name);
}
async function poll(fn, timeout = 10000, interval = 25) {
  const end = Date.now() + timeout;
  let last;
  while (Date.now() < end) {
    try { last = await fn(); if (last) return last; } catch (error) { last = String(error); }
    await new Promise((r) => setTimeout(r, interval));
  }
  throw new Error(`poll timeout: ${JSON.stringify(last)}`);
}
async function selectValue(page, label, value) {
  const control = page.getByRole("combobox", { name: label, exact: true });
  const tag = await control.evaluate((node) => node.tagName);
  const button = tag === "SELECT" ? control.locator("..").getByRole("combobox") : control;
  const native = button.locator("..").locator("select");
  const options = await native.locator("option").evaluateAll((nodes) => nodes.map((node) => ({ value: node.value, label: node.textContent.trim() })));
  const desired = options.find((option) => option.value === value);
  if (!desired) throw new Error(`missing option ${value}`);
  await button.click();
  const popup = page.locator(`[id="${await button.getAttribute("aria-controls")}"]`);
  await popup.getByRole("option", { name: desired.label, exact: true }).click();
}
async function ready(page) { await poll(() => page.evaluate(() => document.documentElement.dataset.appReady === "true")); }
async function configure(page, locale) {
  const settings = page.locator("details.settings");
  if (!(await settings.evaluate((node) => node.open))) await settings.locator("summary").click();
  await selectValue(page, copy(locale, "model"), "model-fast");
  await selectValue(page, copy(locale, "explain"), "en");
  await page.getByRole("button", { name: copy(locale, "random"), exact: true }).click();
  await poll(async () => (await page.locator(".workspace .word-token").textContent())?.includes("adapt"));
}

const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addCookies([
    { name: "wordweave_session", value: "learner", url: origin },
    { name: "wordweave_ui_locale", value: "zh-CN", url: origin },
    { name: "wordweave_cr312_rich", value: "1", url: origin },
  ]);
  const page = await context.newPage();
  const requests = [];
  page.on("request", (request) => { if (request.url().includes("/generations/")) requests.push({ method: request.method(), url: request.url() }); });
  await page.goto(origin + "/create");
  await ready(page);
  await configure(page, "zh");
  await page.evaluate(() => {
    window.__qaMotion = [];
    window.__qaFirstTextAtMutation = null;
    const record = (kind, node) => window.__qaMotion.push({
      kind, text: node.textContent?.trim(), ariaHidden: node.getAttribute("aria-hidden"), inert: node.inert,
      animation: getComputedStyle(node).animationDuration, transition: getComputedStyle(node).transitionDuration,
    });
    new MutationObserver(() => {
      const text = document.querySelector("#generation-content-passage .live-draft-text")?.textContent;
      if (text && window.__qaFirstTextAtMutation === null) window.__qaFirstTextAtMutation = text;
      for (const [kind, selector] of [
        ["replacement", ".m003-replacement-ghost"], ["tail", ".m003-paragraph-leave-active"],
        ["plan", ".m003-plan-leave-active"], ["entry", ".is-entering"],
      ]) {
        const node = document.querySelector(selector);
        if (node && !node.dataset.qaCaptured) { node.dataset.qaCaptured = "1"; record(kind, node); }
      }
    }).observe(document.body, { attributes: true, childList: true, subtree: true });
  });
  const action = page.locator("#generation-actions button");
  await action.click();
  const first = await poll(() => page.locator("#generation-content-passage .live-draft-text").textContent().then((text) => text && text.length < 8 ? text : false));
  await page.waitForTimeout(80);
  const second = await page.locator("#generation-content-passage .live-draft-text").textContent();
  check("typing_first_grapheme_immediate_and_grows", first.length > 0 && second.length > first.length, { first, second });
  await poll(() => page.locator("#generation-content-passage [data-paragraph-index]").count().then((count) => count === 4));
  await page.evaluate(() => {
    window.__qaPassage = document.querySelector(".m003-live-draft");
    window.__qaUnchanged = document.querySelector("[data-paragraph-index='1']");
    window.__qaStatus = document.querySelector(".m003-stream-status");
    window.__qaAction = document.querySelector("#generation-actions button");
    const selection = getSelection(); const range = document.createRange();
    range.selectNodeContents(window.__qaUnchanged); selection.removeAllRanges(); selection.addRange(range);
    window.__qaFocusEvents = [];
    for (const type of ["focusin", "focusout"]) document.addEventListener(type, (event) => window.__qaFocusEvents.push({ type, target: event.target?.tagName, actionDisabled: window.__qaAction.disabled, elapsed: performance.now() }));
    window.__qaAction.focus({ preventScroll: true });
    window.__qaFocusAtSet = document.activeElement === window.__qaAction;
  });
  await poll(() => page.locator(".m003-replacement-ghost").count().then(Boolean));
  const continuity = await page.evaluate(() => {
    const ghost = document.querySelector(".m003-replacement-ghost");
    return { unchanged: window.__qaUnchanged.textContent, ghostAria: ghost.getAttribute("aria-hidden"), ghostInert: ghost.inert, ghostDuration: getComputedStyle(ghost).animationDuration };
  });
  await poll(() => page.locator("#final-result").count().then(Boolean), 15000);
  const final = await page.evaluate(() => ({
    passage: window.__qaPassage === document.querySelector(".m003-live-draft"),
    unchanged: window.__qaUnchanged === document.querySelector("[data-paragraph-index='1']"),
    status: window.__qaStatus === document.querySelector(".m003-stream-status"),
    action: window.__qaAction === document.querySelector("#generation-actions button"),
    selection: getSelection()?.toString(), focused: document.activeElement === window.__qaAction,
    focusAtSet: window.__qaFocusAtSet, focusEvents: window.__qaFocusEvents,
    activeElement: { tag: document.activeElement?.tagName, id: document.activeElement?.id, text: document.activeElement?.textContent?.trim() },
    overflow: document.documentElement.scrollWidth <= innerWidth,
    lang: document.documentElement.lang,
    ariaLiveInDraft: document.querySelectorAll(".m003-live-draft [aria-live]").length,
    streamPoliteRegions: document.querySelectorAll(".m003-stream-status[aria-live='polite']").length,
    motion: window.__qaMotion,
    firstMutation: window.__qaFirstTextAtMutation,
    statusText: document.querySelector(".m003-status-copy")?.textContent?.trim(),
    actionHeight: document.querySelector("#generation-actions button")?.getBoundingClientRect().height,
  }));
  observations.desktop = { continuity, final, requests };
  check("replacement_ghost_220_inert", continuity.ghostAria === "true" && continuity.ghostInert && continuity.ghostDuration.includes("0.22s"), continuity);
  check("stable_nodes_selection_focus", final.passage && final.unchanged && final.status && final.action && final.selection?.includes("They learn together") && final.focused, final);
  check("desktop_accessibility_layout", final.overflow && final.lang === "zh-CN" && final.ariaLiveInDraft === 0 && final.streamPoliteRegions === 1 && final.actionHeight >= 44, final);
  const kinds = Object.fromEntries(final.motion.map((item) => [item.kind, item]));
  check("observed_motion_subset", kinds.entry?.animation?.includes("0.18s") && kinds.replacement?.animation?.includes("0.22s") && kinds.tail?.transition?.includes("0.18s"), kinds);
  check("final_copy_and_no_fake_progress", final.statusText === "短文写好了" && !/\d+\s*%|ETA|轮|round/i.test(await page.locator("body").innerText()), final.statusText);
  await page.screenshot({ path: resolve(screenshots, "02-final-1440-zh.png") });

  // Independent affected UI12 boundary: cancel, success, then failed discard.
  await selectValue(page, copy("zh", "style"), "discussion");
  await action.click();
  const dialog = page.locator("#regenerate-confirm");
  await poll(() => dialog.count().then(Boolean));
  await dialog.getByRole("button", { name: copy("zh", "cancel"), exact: true }).click();
  const streamsAfterCancel = requests.filter((item) => item.url.endsWith("/generations/stream")).length;
  check("ui12_cancel_preserves_without_post", streamsAfterCancel === 1 && await page.locator("#final-result").isVisible(), { streamsAfterCancel });
  await action.click(); await poll(() => dialog.isVisible());
  const regenerateConfirm = currentCopySource.static["zh.m003.regenerate.confirm"];
  await dialog.getByRole("button", { name: regenerateConfirm, exact: true }).click();
  await poll(() => requests.filter((item) => item.url.endsWith("/generations/stream")).length === 2, 12000);
  await poll(() => page.locator("#final-result").isVisible(), 15000);
  let failedDiscards = 0;
  await page.route("**/api/v1/generations/run-e2e/discard", async (route) => { failedDiscards++; await route.fulfill({ status: 503, contentType: "application/problem+json", body: JSON.stringify({ type: "about:blank", status: 503, code: "provider_unavailable", title: "Discard unavailable", detail: "Synthetic failure" }) }); });
  await selectValue(page, copy("zh", "length"), "medium");
  await action.click(); await poll(() => dialog.isVisible());
  await dialog.getByRole("button", { name: regenerateConfirm, exact: true }).click();
  await poll(() => failedDiscards === 1);
  await poll(() => page.locator(".m003-regenerate-error").isVisible());
  const streamsAfterFailure = requests.filter((item) => item.url.endsWith("/generations/stream")).length;
  observations.ui12 = { streamsAfterCancel, streamsAfterSuccess: 2, streamsAfterFailure, failedDiscards, oldResultVisible: await page.locator("#final-result").isVisible() };
  check("ui12_success_one_post_failure_zero_post", streamsAfterFailure === 2 && failedDiscards === 1 && observations.ui12.oldResultVisible, observations.ui12);
  await context.close();

  const reducedContext = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
  await reducedContext.addCookies([{ name: "wordweave_session", value: "learner", url: origin }, { name: "wordweave_ui_locale", value: "zh-CN", url: origin }, { name: "wordweave_cr312_rich", value: "1", url: origin }]);
  const reducedPage = await reducedContext.newPage(); await reducedPage.emulateMedia({ reducedMotion: "reduce" }); await reducedPage.goto(origin + "/create"); await ready(reducedPage); await configure(reducedPage, "zh");
  await reducedPage.evaluate(() => { window.__qaReduced = { replacement: [], tail: [], entries: [] }; new MutationObserver(() => { const replacement = document.querySelector(".m003-replacement-ghost"); const tail = document.querySelector(".m003-paragraph-leave-active"); const entry = document.querySelector(".is-entering"); if (replacement) window.__qaReduced.replacement.push(getComputedStyle(replacement).animationDuration); if (tail) window.__qaReduced.tail.push(getComputedStyle(tail).transitionDuration); if (entry) window.__qaReduced.entries.push(getComputedStyle(entry).animationDuration); }).observe(document.body, { childList: true, subtree: true, attributes: true }); });
  await reducedPage.locator("#generation-actions button").click(); await poll(() => reducedPage.locator("#final-result").count().then(Boolean), 15000);
  observations.reduced = { ...(await reducedPage.evaluate(() => window.__qaReduced)), busy: await reducedPage.locator("[aria-busy='true']").count() };
  check("reduced_motion_direct", observations.reduced.busy === 0 && [...observations.reduced.replacement, ...observations.reduced.tail, ...observations.reduced.entries].every((duration) => duration.split(", ").every((part) => part === "0s")), observations.reduced);
  await reducedContext.close();

  await fetch(backend + "/api/v1/__test/admin-presets-reset", { method: "POST" });
  await fetch(backend + "/api/v1/__test/admin-presets-state", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ delayed: true }) });
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await mobile.addCookies([{ name: "wordweave_session", value: "admin", url: origin }, { name: "wordweave_ui_locale", value: "en-US", url: origin }]);
  const preview = await mobile.newPage(); await preview.goto(origin + "/admin/presets"); await ready(preview);
  await preview.getByRole("button", { name: copy("en", "previewgen"), exact: true }).click();
  await poll(() => preview.locator("#preview-result .m003-live-draft").isVisible());
  const live = { status: await preview.locator("#preview-result .m003-status-copy").textContent(), overflow: await preview.evaluate(() => document.documentElement.scrollWidth <= innerWidth), randomButtons: await preview.getByRole("button", { name: copy("en", "random"), exact: true }).count(), lang: await preview.evaluate(() => document.documentElement.lang) };
  await preview.screenshot({ path: resolve(screenshots, "03-preview-live-390-en.png") });
  await preview.getByRole("button", { name: copy("en", "cancelgen"), exact: true }).click();
  await fetch(backend + "/api/v1/__test/admin-presets-state", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ delayed: false }) });
  await preview.getByRole("button", { name: copy("en", "previewgen"), exact: true }).click();
  await poll(() => preview.locator(".preset-sample-text").textContent().then((text) => text === "Teams adapt quickly when the context changes."));
  const settled = { actionEnabled: await preview.locator("#preset-actions .btn.primary").isEnabled(), planCount: await preview.locator(".m003-plan-preview").count() };
  observations.mobilePreview = { live, settled };
  check("mobile_preview_live_and_ready_gate", live.status === "Turning the plan into a short text" && live.overflow && live.randomButtons === 0 && live.lang === "en-US" && settled.actionEnabled && settled.planCount === 0, observations.mobilePreview);
  await mobile.close();
} catch (error) {
  observations.fatal = { message: error.message, stack: error.stack };
  observations.failures.push("fatal");
} finally {
  await browser.close();
}
observations.result = observations.failures.length ? "FAIL" : "PASS";
await writeFile(resolve(here, "browser-results.json"), JSON.stringify(observations, null, 2) + "\n");
console.log(JSON.stringify({ result: observations.result, checks: Object.keys(observations.checks).length, failures: observations.failures }));
process.exitCode = observations.failures.length ? 1 : 0;
