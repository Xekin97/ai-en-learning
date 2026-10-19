import assert from "node:assert/strict";
import fs from "node:fs";
import { chromium } from "../../../../../../../frontend/node_modules/@playwright/test/index.mjs";

const origin = "http://127.0.0.1:55013";
const here = new URL("./", import.meta.url);
const results = {
  result: "FAIL",
  scope: "CR-310 independent targeted functional QA",
  node: process.version,
  isolated_frontend: origin,
  synthetic_backend: "http://127.0.0.1:55015",
  live_uat_3014_touched: false,
  real_provider_calls: 0,
  checks: [],
  page_errors: [],
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function eventually(predicate, message, timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await sleep(25);
  }
  assert.fail(message);
}
function pass(id, details = {}) {
  results.checks.push({ id, status: "PASS", ...details });
}
function sse(event, data) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}
function nextStream({ hold = false } = {}) {
  const frames = [
    sse("generation.started", { seq: 1, contract_version: "m003-stream-v5", stream_id: "cr310-next-stream", run_id: "cr310-next-run", generation_token: "synthetic-only", snapshot: { configuration_revision: "cr310-next", effective_plan: { code: "basic", origin: "base" }, content_service: { native_validation: true, content_review_enabled: false, content_repair_limit: 0 }, native_correction_policy: { version: "m003-native-policy-v1", scope: "logical_request", max_calls: 2, editable: false } } }),
    sse("generation.progress", { seq: 2, phase: "planning" }),
    sse("generation.plan_item", { seq: 3, plan_id: "cr310-next-plan", meaning_language: "zh", item: { kind: "scene", text: "A calm discussion." } }),
    sse("generation.plan_item", { seq: 4, plan_id: "cr310-next-plan", meaning_language: "zh", item: { kind: "word_use", entry: "gentle", form: "gentle", sense: "温和的", phrase: "a gentle answer" } }),
    sse("generation.progress", { seq: 5, phase: "composing" }),
    sse("generation.edit", { seq: 6, draft_id: "cr310-next-draft", content_version: 1, base_rev: 0, rev: 1, at: 0, delete_count: 0, insert: "A gentle answer helps.", source: "provider" }),
  ];
  if (!hold) frames.push(
    sse("generation.progress", { seq: 7, phase: "finalizing" }),
    sse("generation.validated", { seq: 8, run_id: "cr310-next-run", final_content_version: 1, result: { passage: "A gentle answer helps.", tags: ["discussion"], targets: [{ entry: "gentle", entry_meaning: "温和的", hint_phrase: "a gentle answer", hint_blanks: [{ start: 2, end: 8 }], occurrences: [{ surface: "gentle", start: 2, end: 8 }] }] }, content_outcome: "basic", completion_notice: null }),
  );
  return frames.join("");
}
function pendingStream() {
  return [
    sse("generation.started", { seq: 1, contract_version: "m003-stream-v5", stream_id: "cr310-pending", run_id: "cr310-pending", generation_token: "synthetic-only", snapshot: { configuration_revision: "cr310-pending", effective_plan: { code: "basic", origin: "base" }, content_service: { native_validation: true, content_review_enabled: false, content_repair_limit: 0 }, native_correction_policy: { version: "m003-native-policy-v1", scope: "logical_request", max_calls: 2, editable: false } } }),
    sse("generation.progress", { seq: 2, phase: "planning" }),
    sse("generation.plan_item", { seq: 3, plan_id: "cr310-pending-plan", meaning_language: "en", item: { kind: "word_use", entry: "adapt", form: "adapt", sense: "change to fit", phrase: "adapt quickly" } }),
    sse("generation.settlement_pending", { seq: 4, code: "settlement_unconfirmed", request_id: "cr310-pending-request" }),
  ].join("");
}

async function ready(page) {
  await page.waitForFunction(() => document.documentElement.dataset.appReady === "true");
}
async function nativeSelect(page, value) {
  const select = page.locator(`select:has(option[value="${value}"])`).first();
  await select.selectOption(value);
}
function generateButton(page) {
  return page.locator(".workspace > div > section.panel:first-of-type .actions .btn.primary");
}
async function configureOld(page) {
  const settings = page.locator("details.settings");
  if (!(await settings.evaluate((node) => node.open))) await settings.locator("summary").click();
  await nativeSelect(page, "model-fast");
  await nativeSelect(page, "story");
  await nativeSelect(page, "short");
  await nativeSelect(page, "en");
  const search = page.locator("#create-words-search");
  await search.fill("adapt");
  await page.getByRole("option", { name: "adapt", exact: true }).click();
}
async function generateOld(page) {
  await configureOld(page);
  await generateButton(page).click();
  await page.locator("#final-result .story-text").waitFor({ state: "visible" });
  assert.equal((await page.locator("#final-result .story-text").textContent()).trim(), "Teams adapt quickly when the context changes.");
}
async function editNext(page) {
  await nativeSelect(page, "discussion");
  await nativeSelect(page, "medium");
  await nativeSelect(page, "zh");
  await page.locator('.word-token:has-text("adapt") button').click();
  const search = page.locator("#create-words-search");
  await search.fill("gentle");
  await page.getByRole("option", { name: "gentle", exact: true }).click();
}
async function resultSignature(page) {
  return page.locator("#final-result").evaluate((node) => ({
    title: node.querySelector("h2")?.textContent?.trim(),
    body: node.querySelector(".story-text")?.textContent?.trim(),
    tags: [...node.querySelectorAll(".chips .chip")].map((item) => item.textContent?.trim()),
    meanings: [...node.querySelectorAll(".m003-result-meanings > dl > div")].map((item) => [...item.children].map((child) => child.textContent?.trim())),
  }));
}
async function inputSignature(page) {
  return page.evaluate(() => ({
    words: [...document.querySelectorAll(".word-token")].map((node) => node.textContent?.replace(/Remove\s*/i, "").trim()),
    values: [...document.querySelectorAll(".creation-model select, .creation-options select")].map((node) => node.value),
  }));
}
async function assertEditable(page) {
  assert.equal(await page.locator("fieldset.generation-fields").evaluate((node) => node.disabled), false);
  assert.equal(await page.locator("#create-words-search").isEnabled(), true);
  assert.equal(await generateButton(page).isEnabled(), true);
  assert.equal(await page.locator("#final-result .actions .btn.quiet").count(), 0);
}
async function openRegenerate(page) {
  await generateButton(page).click();
  const dialog = page.locator("#regenerate-confirm[open]");
  await dialog.waitFor({ state: "visible" });
  return dialog;
}
async function assertFocus(page, locator) {
  assert.equal(await locator.evaluate((node) => node === document.activeElement), true);
}
async function makeCase(browser, name, { role = "learner", locale = "en-US", viewport = { width: 1440, height: 900 } } = {}) {
  const context = await browser.newContext({ viewport, locale });
  await context.route("**/api/v1/analytics/events", (route) => route.abort("blockedbyclient"));
  const cookies = [];
  if (role === "learner") cookies.push({ name: "wordweave_session", value: "learner", url: origin });
  if (locale === "zh-CN") cookies.push({ name: "wordweave_ui_locale", value: "zh-CN", url: origin });
  if (cookies.length) await context.addCookies(cookies);
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  page.on("pageerror", (error) => results.page_errors.push(`${name}: ${error.message}`));
  await page.goto(origin + "/create");
  await ready(page);
  return { context, page };
}

async function editableAndCancel(browser, role, locale, viewport, screenshot) {
  const name = `editable-${role}-${locale}`;
  const { context, page } = await makeCase(browser, name, { role, locale, viewport });
  let streams = 0, discards = 0;
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (path.endsWith("/generations/stream")) streams++;
    if (path.endsWith("/discard")) discards++;
  });
  await generateOld(page);
  const old = await resultSignature(page);
  await assertEditable(page);
  await editNext(page);
  const edited = await inputSignature(page);
  assert.deepEqual(await resultSignature(page), old);
  assert.equal(streams, 1); assert.equal(discards, 0);
  const expected = locale === "zh-CN"
    ? { title: "生成新的短文？", body: "继续生成会永久放弃当前未收录的短文和学习信息。", confirm: "放弃并生成" }
    : { title: "Generate a new story?", body: "Continuing will permanently discard the current unsaved story and its learning information.", confirm: "Discard and generate" };
  const closes = [
    async (dialog) => dialog.locator(".dialog-actions button").first().click(),
    async () => page.keyboard.press("Escape"),
    async (dialog) => dialog.locator(".dialog-close").click(),
    async (dialog) => dialog.evaluate((node) => node.dispatchEvent(new MouseEvent("click", { bubbles: true }))),
  ];
  for (let index = 0; index < closes.length; index++) {
    const dialog = await openRegenerate(page);
    assert.equal((await dialog.locator("h2").textContent()).trim(), expected.title);
    assert.equal((await dialog.locator(".dialog-body").textContent()).trim(), expected.body);
    assert.equal((await dialog.locator(".dialog-actions button").last().textContent()).trim(), expected.confirm);
    if (index === 0) await assertFocus(page, dialog.locator(".dialog-actions button").first());
    if (screenshot && index === 0) await page.screenshot({ path: new URL(screenshot, here).pathname, fullPage: true });
    await closes[index](dialog);
    await dialog.waitFor({ state: "hidden" });
    await assertFocus(page, generateButton(page));
    assert.deepEqual(await resultSignature(page), old);
    assert.deepEqual(await inputSignature(page), edited);
  }
  assert.equal(streams, 1); assert.equal(discards, 0);
  await context.close();
  return { old, edited, close_paths: 4, streams, discards };
}

async function confirmedReplace(browser) {
  const { context, page } = await makeCase(browser, "confirmed-replace");
  const order = [], bodies = [];
  let streamCount = 0, discardCount = 0, saveCount = 0, releaseDiscard;
  const gate = new Promise((resolve) => { releaseDiscard = resolve; });
  await page.route("**/api/v1/generations/stream", async (route) => {
    streamCount++; bodies.push(route.request().postDataJSON()); order.push(`generate:${streamCount}`);
    if (streamCount === 1) return route.continue();
    await route.fulfill({ status: 200, contentType: "text/event-stream; charset=utf-8", headers: { "cache-control": "no-store" }, body: nextStream() });
  });
  await page.route("**/api/v1/generations/run-e2e/discard", async (route) => {
    discardCount++; order.push("discard:run-e2e"); await gate; await route.fulfill({ status: 204, body: "" });
  });
  page.on("request", (request) => { if (new URL(request.url()).pathname.endsWith("/save")) saveCount++; });
  await generateOld(page); await editNext(page);
  const dialog = await openRegenerate(page), confirm = dialog.locator(".dialog-actions button").last();
  await confirm.click();
  await page.waitForFunction(() => document.querySelector("#regenerate-confirm .dialog-actions button:last-child")?.matches(":disabled"));
  await confirm.evaluate((button) => { button.click(); button.click(); });
  assert.equal(discardCount, 1); assert.equal(streamCount, 1);
  assert.equal(await generateButton(page).isDisabled(), true);
  assert.equal(await page.locator("#final-result .actions .btn.primary").isDisabled(), true);
  await generateButton(page).evaluate((button) => button.click());
  await page.locator("#final-result .actions .btn.primary").evaluate((button) => button.click());
  assert.equal(saveCount, 0); assert.equal(discardCount, 1); assert.equal(streamCount, 1);
  releaseDiscard();
  await page.waitForFunction(() => document.querySelector("#final-result .story-text")?.textContent?.trim() === "A gentle answer helps.");
  assert.deepEqual(order, ["generate:1", "discard:run-e2e", "generate:2"]);
  assert.deepEqual(bodies[1], { model_id: "model-fast", meaning_language: "zh", scenario: "discussion", length: "medium", entries: ["gentle"] });
  assert.equal(discardCount, 1); assert.equal(streamCount, 2); assert.equal(saveCount, 0);
  await context.close();
  return { order, new_snapshot: bodies[1], duplicate_confirm_discard_count: discardCount, duplicate_confirm_generation_count: streamCount - 1 };
}

async function discardFailure(browser) {
  const { context, page } = await makeCase(browser, "discard-failure");
  let streams = 0, discards = 0;
  page.on("request", (request) => { const p = new URL(request.url()).pathname; if (p.endsWith("/generations/stream")) streams++; if (p.endsWith("/discard")) discards++; });
  await page.route("**/api/v1/generations/run-e2e/discard", (route) => route.fulfill({ status: 503, contentType: "application/problem+json", body: JSON.stringify({ type: "about:blank", status: 503, code: "provider_unavailable", title: "Discard unavailable", detail: "Synthetic failure" }) }));
  await generateOld(page); const old = await resultSignature(page); await editNext(page); const edited = await inputSignature(page);
  const dialog = await openRegenerate(page); await dialog.locator(".dialog-actions button").last().click();
  const alert = page.locator(".m003-regenerate-error"); await alert.waitFor({ state: "visible" });
  assert.equal((await alert.textContent()).trim(), "The current result could not be discarded. Your story and new settings are still here; try again.");
  assert.deepEqual(await resultSignature(page), old); assert.deepEqual(await inputSignature(page), edited);
  assert.equal(discards, 1); assert.equal(streams, 1); await assertFocus(page, generateButton(page));
  await context.close(); return { discards, streams, retained: true };
}

async function saveOwnership(browser) {
  const { context, page } = await makeCase(browser, "save-ownership");
  let streams = 0, saves = 0, discards = 0, releaseSave;
  const gate = new Promise((resolve) => { releaseSave = resolve; });
  page.on("request", (request) => { const p = new URL(request.url()).pathname; if (p.endsWith("/generations/stream")) streams++; if (p.endsWith("/discard")) discards++; });
  await page.route("**/api/v1/generations/run-e2e/save", async (route) => { saves++; await gate; await route.continue(); });
  await generateOld(page); await editNext(page);
  const save = page.locator("#final-result .actions .btn.primary"); await save.click();
  await page.waitForFunction(() => document.querySelector("#final-result .actions .btn.primary")?.matches(":disabled"));
  await eventually(() => saves === 1, "save request did not reach the held route"); assert.equal(await generateButton(page).isDisabled(), true);
  await generateButton(page).evaluate((button) => button.click());
  await page.locator('a[href="/"]').first().evaluate((link) => link.click());
  await sleep(100); assert.match(page.url(), /\/create$/); assert.equal(discards, 0); assert.equal(streams, 1);
  releaseSave(); await page.waitForURL(/\/library\/batch-e2e$/);
  assert.equal(saves, 1); assert.equal(discards, 0); assert.equal(streams, 1);
  await context.close(); return { saves, discards, streams, navigation_blocked_while_save_pending: true };
}

async function leaveOwnership(browser) {
  const { context, page } = await makeCase(browser, "leave-ownership");
  let streams = 0, saves = 0, discards = 0, releaseDiscard;
  const gate = new Promise((resolve) => { releaseDiscard = resolve; });
  page.on("request", (request) => { const p = new URL(request.url()).pathname; if (p.endsWith("/generations/stream")) streams++; if (p.endsWith("/save")) saves++; });
  await page.route("**/api/v1/generations/run-e2e/discard", async (route) => { discards++; await gate; await route.fulfill({ status: 204, body: "" }); });
  await generateOld(page); const old = await resultSignature(page); await editNext(page); const edited = await inputSignature(page);
  await page.locator('a[href="/"]').first().click();
  let leave = page.locator("#generation-confirm[open]"); await leave.waitFor({ state: "visible" });
  await page.locator('a[href="/explore"]').first().evaluate((link) => link.click()); await sleep(100);
  assert.match(page.url(), /\/create$/); assert.equal(discards, 0);
  await leave.locator(".dialog-actions button").first().click();
  assert.match(page.url(), /\/create$/); assert.deepEqual(await resultSignature(page), old); assert.deepEqual(await inputSignature(page), edited); assert.equal(discards, 0);
  await page.locator('a[href="/"]').first().click(); leave = page.locator("#generation-confirm[open]"); await leave.waitFor({ state: "visible" });
  await leave.locator(".dialog-actions button").last().click();
  await page.waitForFunction(() => document.querySelector("fieldset.generation-fields")?.disabled === true);
  await eventually(() => discards === 1, "leave discard did not reach the held route"); assert.equal(await generateButton(page).isDisabled(), true); assert.equal(await page.locator("#final-result .actions .btn.primary").isDisabled(), true);
  await generateButton(page).evaluate((button) => button.click()); await page.locator("#final-result .actions .btn.primary").evaluate((button) => button.click());
  await sleep(100); assert.match(page.url(), /\/create$/); assert.equal(streams, 1); assert.equal(saves, 0); assert.equal(discards, 1);
  releaseDiscard(); await page.waitForURL(/\/$/);
  assert.equal(streams, 1); assert.equal(saves, 0); assert.equal(discards, 1);
  await context.close(); return { cancel_retained: true, held_discard: { streams, saves, discards, overlapping_navigation_rejected_before_confirmation: true } };
}

async function secondStreamCancel(browser) {
  const { context, page } = await makeCase(browser, "second-stream-cancel");
  let streams = 0, cancels = 0;
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.endsWith("/generations/stream")) {
      streams++;
    }
  });
  await page.route("**/api/v1/generations/run-e2e/cancel", async (route) => { cancels++; await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { status: "cancelled", quota_refunded: false }, meta: { request_id: "cr310-independent-cancel" } }) }); });
  await generateOld(page);
  await context.addCookies([{ name: "wordweave_cr309_hold", value: "1", url: origin }]);
  const dialog = await openRegenerate(page); await dialog.locator(".dialog-actions button").last().click();
  const stop = page.getByRole("button", { name: "Stop generating", exact: true }); await stop.waitFor({ state: "visible" });
  await page.waitForFunction(() => [...document.querySelectorAll("button")].some((button) => button.textContent?.trim() === "Stop generating" && !button.disabled));
  assert.equal(await stop.isEnabled(), true);
  await stop.click(); const cancelDialog = page.locator("#generation-confirm[open]"); await cancelDialog.waitFor({ state: "visible" }); assert.equal(await cancelDialog.locator(".dialog-actions button").last().isEnabled(), true);
  await cancelDialog.locator(".dialog-actions button").last().click();
  await page.locator("#generation-status .empty h2").waitFor({ state: "visible" });
  assert.equal(streams, 2); assert.equal(cancels, 1);
  await context.close(); return { streams, cancels, synthetic_hold: "adapt/en frames matching unchanged snapshot", replace_lock_released: true };
}

async function visitorClaim(browser) {
  const { context, page } = await makeCase(browser, "visitor-claim", { role: "visitor" });
  let claims = 0, discards = 0;
  page.on("request", (request) => { const p = new URL(request.url()).pathname; if (p.endsWith("/visitor-claim")) claims++; if (p.endsWith("/discard")) discards++; });
  await generateOld(page); await page.locator("#final-result .actions .btn.primary").click(); await page.waitForURL(/\/login\?/);
  assert.equal(claims, 1); assert.equal(discards, 0);
  await context.close(); return { claims, discards, redirected_to_login: true };
}

async function pendingGuard(browser) {
  const { context, page } = await makeCase(browser, "pending-guard");
  let streams = 0;
  await page.route("**/api/v1/generations/stream", async (route) => { streams++; await route.fulfill({ status: 200, contentType: "text/event-stream; charset=utf-8", body: pendingStream() }); });
  await configureOld(page); await generateButton(page).click();
  await page.locator("#generation-status .notice.warn").waitFor({ state: "visible" });
  assert.equal(await page.locator("fieldset.generation-fields").evaluate((node) => node.disabled), true);
  assert.equal(await page.locator("#create-words-search").isDisabled(), true); assert.equal(await generateButton(page).isDisabled(), true);
  await generateButton(page).evaluate((button) => button.click()); await sleep(100); assert.equal(streams, 1);
  await context.close(); return { streams, controls_disabled: true };
}

async function presetBoundary(browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "en-US" });
  await context.route("**/api/v1/analytics/events", (route) => route.abort("blockedbyclient"));
  await context.addCookies([{ name: "wordweave_session", value: "learner", url: origin }]);
  const page = await context.newPage(); page.on("pageerror", (error) => results.page_errors.push(`preset: ${error.message}`));
  const bodies = []; let discards = 0;
  page.on("request", (request) => { const p = new URL(request.url()).pathname; if (p.includes("/presets/preset-en/generations/stream")) bodies.push(request.postDataJSON()); if (p.endsWith("/discard")) discards++; });
  await page.goto(origin + "/trial/preset-en"); await ready(page);
  assert.equal(await page.locator(".workspace select").count(), 0);
  await generateButton(page).click(); await page.locator("#final-result").waitFor({ state: "visible" });
  let dialog = await openRegenerate(page); await dialog.locator(".dialog-actions button").first().click(); assert.equal(bodies.length, 1); assert.equal(discards, 0);
  dialog = await openRegenerate(page); await dialog.locator(".dialog-actions button").last().click(); await page.waitForFunction(() => document.querySelector("#final-result") !== null && !document.querySelector("#regenerate-confirm")?.open);
  assert.deepEqual(bodies, [{ published_version: "published-1" }, { published_version: "published-1" }]); assert.equal(discards, 1); assert.equal(await page.locator(".workspace select").count(), 0);
  await context.close(); return { bodies, discards, editable_selects: 0 };
}

const browser = await chromium.launch({ headless: true });
try {
  const learner = await editableAndCancel(browser, "learner", "en-US", { width: 1440, height: 900 }, "warning-desktop-1440.png");
  pass("CR310-Q1", { roles: ["learner"], editable_after_valid: true, standalone_discard: false });
  pass("CR310-Q2", { old_result_stable: true, edited: learner.edited });
  pass("CR310-Q3-desktop", { close_paths: learner.close_paths, zero_discard: learner.discards === 0, zero_new_generation: learner.streams === 1 });
  const visitor = await editableAndCancel(browser, "visitor", "zh-CN", { width: 390, height: 844 }, "warning-mobile-390.png");
  pass("CR310-Q1-visitor-mobile", { editable_after_valid: true, old_result_stable: true });
  pass("CR310-Q3-mobile-zh", { close_paths: visitor.close_paths, zero_discard: true, zero_new_generation: true });
  const replace = await confirmedReplace(browser); pass("CR310-Q4", replace); pass("CR310-Q6", { duplicate_confirm: "one discard and one fresh generation" });
  pass("CR310-Q5", await discardFailure(browser));
  pass("CR310-Q7-save", await saveOwnership(browser));
  pass("CR310-Q8-leave", await leaveOwnership(browser));
  pass("CR310-root-second-stream-cancel", await secondStreamCancel(browser));
  pass("CR310-Q9-visitor-claim", await visitorClaim(browser));
  pass("CR310-pending-guard", await pendingGuard(browser));
  pass("CR310-Q10", await presetBoundary(browser));
  assert.deepEqual(results.page_errors, []);
  results.result = "PASS";
} catch (error) {
  results.failure = error instanceof Error ? { message: error.message, stack: error.stack } : { message: String(error) };
  throw error;
} finally {
  await browser.close();
  fs.writeFileSync(new URL("results.json", here), JSON.stringify(results, null, 2) + "\n");
}

console.log(JSON.stringify({ result: results.result, checks: results.checks.length, page_errors: results.page_errors.length, real_provider_calls: 0 }));
