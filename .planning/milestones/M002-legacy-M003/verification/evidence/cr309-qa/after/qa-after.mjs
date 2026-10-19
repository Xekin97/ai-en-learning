import assert from "node:assert/strict";
import fs from "node:fs";
import { chromium } from "../../../../../../../frontend/node_modules/@playwright/test/index.mjs";

const origin = "http://127.0.0.1:54913";
const mockOrigin = "http://127.0.0.1:54915";
const here = new URL("./", import.meta.url);
const results = {
  scope: "CR-309 independent targeted Vue verification",
  node: process.version,
  isolated_frontend: origin,
  synthetic_backend: mockOrigin,
  live_uat_3014_touched: false,
  real_provider_calls: 0,
  checks: [],
  page_errors: [],
  requests: [],
  computed: {},
};

const fixture = {
  entries: ["garden", "learn"],
  passage: "Neighbors learn in the garden.",
  targets: [
    {
      entry: "garden",
      entry_meaning: "居民共同照料的花园",
      hint_phrase: "the garden",
      hint_blanks: [{ start: 4, end: 10 }],
      occurrences: [{ surface: "garden", start: 23, end: 29 }],
    },
    {
      entry: "learn",
      entry_meaning: "通过练习获得知识或技能",
      hint_phrase: "learn together",
      hint_blanks: [{ start: 0, end: 5 }],
      occurrences: [{ surface: "learn", start: 10, end: 15 }],
    },
  ],
};

function pass(id, evidence = {}) {
  results.checks.push({ id, status: "PASS", ...evidence });
}

function recordRequest(suite, request) {
  const path = new URL(request.url()).pathname;
  if (path.startsWith("/api/v1/") && path !== "/api/v1/analytics/events")
    results.requests.push({ suite, method: request.method(), path });
}

async function ready(page) {
  await page.waitForFunction(
    () => document.documentElement.dataset.appReady === "true",
  );
}

async function select(page, label, value) {
  const control = page.getByRole("combobox", { name: label, exact: true });
  const native = control.locator("..").locator("select");
  const option = native.locator(`option[value="${value}"]`);
  const text = (await option.textContent()).trim();
  await control.click();
  await page
    .locator(`[id="${await control.getAttribute("aria-controls")}"]`)
    .getByRole("option", { name: text, exact: true })
    .click();
}

async function configureWorkspace(page) {
  const settings = page.locator("details.settings");
  if (!(await settings.evaluate((node) => node.open)))
    await settings.locator("summary").click();
  await select(page, "AI 模型", "model-fast");
  await select(page, "场景", "story");
  await select(page, "长度", "short");
  await select(page, "释义语言", "zh");
  const search = page.locator("#create-words-search");
  for (const entry of fixture.entries) {
    await search.fill(entry);
    await page.getByRole("option", { name: entry, exact: true }).click();
  }
}

function sse(event, data) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

async function addControlledStream(context) {
  await context.addInitScript(({ payload }) => {
    const original = window.fetch.bind(window);
    const frame = (event, data) =>
      `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    window.__cr309QaReleasePending = null;
    window.fetch = async (input, init) => {
      const request = input instanceof Request ? input : null;
      const url = new URL(request?.url ?? String(input), location.href);
      const method = (init?.method ?? request?.method ?? "GET").toUpperCase();
      if (method === "POST" && url.pathname === "/api/v1/generations/stream") {
        const encoder = new TextEncoder();
        const frames = [
          ["generation.started", { seq: 1, contract_version: "m003-stream-v5", stream_id: "cr309-qa-stream", run_id: "cr309-qa-run", generation_token: "synthetic-only", snapshot: { configuration_revision: "cr309-qa", effective_plan: { code: "visitor", origin: "visitor" }, content_service: { native_validation: true, content_review_enabled: false, content_repair_limit: 0 }, native_correction_policy: { version: "m003-native-policy-v1", scope: "logical_request", max_calls: 2, editable: false } } }],
          ["generation.progress", { seq: 2, phase: "planning" }],
          ["generation.plan_item", { seq: 3, plan_id: "cr309-qa-plan", meaning_language: "zh", item: { kind: "scene", text: "邻居在社区花园一起练习新技能。" } }],
          ["generation.plan_item", { seq: 4, plan_id: "cr309-qa-plan", meaning_language: "zh", item: { kind: "word_use", entry: "garden", form: "garden", sense: "居民共同照料的花园", phrase: "the garden" } }],
          ["generation.plan_item", { seq: 5, plan_id: "cr309-qa-plan", meaning_language: "zh", item: { kind: "word_use", entry: "learn", form: "learn", sense: "通过练习获得知识或技能", phrase: "learn together" } }],
          ["generation.progress", { seq: 6, phase: "composing" }],
          ["generation.edit", { seq: 7, draft_id: "cr309-qa-draft", content_version: 1, base_rev: 0, rev: 1, at: 0, delete_count: 0, insert: "Neighbors learn", source: "provider" }],
          ["generation.edit", { seq: 8, draft_id: "cr309-qa-draft", content_version: 1, base_rev: 1, rev: 2, at: 15, delete_count: 0, insert: " in the garden.", source: "provider" }],
        ];
        const stream = new ReadableStream({
          start(controller) {
            frames.forEach(([event, data], index) =>
              setTimeout(() => controller.enqueue(encoder.encode(frame(event, data))), index * 55),
            );
            window.__cr309QaReleasePending = () => {
              controller.enqueue(encoder.encode(frame("generation.settlement_pending", { seq: 9, code: "settlement_unconfirmed", request_id: "cr309-qa-request" })));
              controller.close();
              window.__cr309QaReleasePending = null;
            };
          },
        });
        return new Response(stream, { status: 200, headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-store" } });
      }
      return original(input, init);
    };
  }, { payload: fixture });
}

async function addFinalStream(context) {
  await context.addInitScript(({ payload }) => {
    const original = window.fetch.bind(window);
    const frame = (event, data) =>
      `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    window.fetch = async (input, init) => {
      const request = input instanceof Request ? input : null;
      const url = new URL(request?.url ?? String(input), location.href);
      const method = (init?.method ?? request?.method ?? "GET").toUpperCase();
      if (method === "POST" && url.pathname === "/api/v1/generations/stream") {
        const frames = [
          ["generation.started", { seq: 1, contract_version: "m003-stream-v5", stream_id: "cr309-qa-final-stream", run_id: "cr309-qa-final-run", generation_token: "synthetic-only", snapshot: { configuration_revision: "cr309-qa", effective_plan: { code: "visitor", origin: "visitor" }, content_service: { native_validation: true, content_review_enabled: false, content_repair_limit: 0 }, native_correction_policy: { version: "m003-native-policy-v1", scope: "logical_request", max_calls: 2, editable: false } } }],
          ["generation.progress", { seq: 2, phase: "planning" }],
          ["generation.plan_item", { seq: 3, plan_id: "cr309-qa-final-plan", meaning_language: "zh", item: { kind: "scene", text: "邻居在社区花园一起练习新技能。" } }],
          ["generation.plan_item", { seq: 4, plan_id: "cr309-qa-final-plan", meaning_language: "zh", item: { kind: "word_use", entry: "garden", form: "garden", sense: "居民共同照料的花园", phrase: "the garden" } }],
          ["generation.plan_item", { seq: 5, plan_id: "cr309-qa-final-plan", meaning_language: "zh", item: { kind: "word_use", entry: "learn", form: "learn", sense: "通过练习获得知识或技能", phrase: "learn together" } }],
          ["generation.progress", { seq: 6, phase: "composing" }],
          ["generation.edit", { seq: 7, draft_id: "cr309-qa-final-draft", content_version: 1, base_rev: 0, rev: 1, at: 0, delete_count: 0, insert: "Neighbors learn", source: "provider" }],
          ["generation.edit", { seq: 8, draft_id: "cr309-qa-final-draft", content_version: 1, base_rev: 1, rev: 2, at: 15, delete_count: 0, insert: " in the garden.", source: "provider" }],
          ["generation.progress", { seq: 9, phase: "finalizing" }],
          ["generation.validated", { seq: 10, run_id: "cr309-qa-final-run", final_content_version: 1, result: { passage: payload.passage, tags: ["社区", "学习"], targets: payload.targets }, content_outcome: "basic", completion_notice: null }],
        ];
        return new Response(frames.map(([event, data]) => frame(event, data)).join(""), { status: 200, headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-store" } });
      }
      return original(input, init);
    };
  }, { payload: fixture });
}

async function vocabulary(page, selector) {
  return page.locator(selector).evaluate((panel) => {
    const list = panel.querySelector(":scope > dl.m003-vocabulary-list");
    const items = [...list.children];
    const item = items[0];
    const term = item.querySelector(":scope > dt");
    const details = [...item.querySelectorAll(":scope > dd")];
    const ls = getComputedStyle(list), is = getComputedStyle(item), ts = getComputedStyle(term), ds = getComputedStyle(details[0]);
    return {
      structure: items.every((node) => node.children.length === 3 && node.children[0].tagName === "DT" && node.children[1].tagName === "DD" && node.children[2].tagName === "DD"),
      itemCount: items.length,
      columns: ls.gridTemplateColumns.split(" ").length,
      columnGap: ls.columnGap,
      rowGap: ls.rowGap,
      itemPadding: `${is.paddingTop} ${is.paddingRight} ${is.paddingBottom} ${is.paddingLeft}`,
      itemBorderTopWidth: is.borderTopWidth,
      term: { fontFamily: ts.fontFamily, fontSize: ts.fontSize, fontWeight: ts.fontWeight, lineHeight: ts.lineHeight, color: ts.color },
      detail: { fontSize: ds.fontSize, lineHeight: ds.lineHeight, color: ds.color, marginTop: ds.marginTop },
      values: items.map((node) => ({ entry: node.children[0].textContent.trim(), meaning: node.children[1].textContent.trim(), usage: node.children[2].textContent.trim() })),
    };
  });
}

async function reading(page, bodySelector, storySelector) {
  return page.evaluate(({ bodySelector, storySelector }) => {
    const body = document.querySelector(bodySelector), story = document.querySelector(storySelector);
    const b = body.getBoundingClientRect(), s = getComputedStyle(story);
    return { bodyWidth: Math.round(b.width * 100) / 100, margin: `${s.marginTop} ${s.marginRight} ${s.marginBottom} ${s.marginLeft}`, fontSize: s.fontSize, lineHeight: s.lineHeight, lineHeightRatio: Math.round((Number.parseFloat(s.lineHeight) / Number.parseFloat(s.fontSize)) * 100) / 100, whiteSpace: s.whiteSpace, overflowWrap: s.overflowWrap };
  }, { bodySelector, storySelector });
}

function assertVocabulary(style, columns, expected) {
  assert.equal(style.structure, true);
  assert.equal(style.columns, columns);
  assert.equal(style.columnGap, "24px");
  assert.equal(style.rowGap, "0px");
  assert.equal(style.itemPadding, "10px 0px 10px 0px");
  assert.equal(style.itemBorderTopWidth, "1px");
  assert.equal(style.term.fontSize, "17px");
  assert.equal(style.term.fontWeight, "600");
  assert.match(style.term.fontFamily, /Literata|serif/i);
  assert.equal(style.detail.fontSize, "13px");
  assert.equal(style.detail.marginTop, "4px");
  assert.deepEqual(style.values, expected);
}

function assertReading(style, mobile) {
  assert.ok(style.bodyWidth <= 760.01, `body width ${style.bodyWidth}`);
  assert.equal(style.margin, "18px 0px 14px 0px");
  assert.equal(style.whiteSpace, "pre-wrap");
  assert.equal(style.overflowWrap, "anywhere");
  const expected = mobile ? 1.78 : 1.85;
  assert.ok(Math.abs(style.lineHeightRatio - expected) < 0.01, `${style.lineHeightRatio} vs ${expected}`);
}

async function workspaceViewport(browser, name, viewport) {
  const mobile = viewport.width <= 760;
  const expectedPlan = [
    { entry: "garden", meaning: "居民共同照料的花园", usage: "garden · the garden" },
    { entry: "learn", meaning: "通过练习获得知识或技能", usage: "learn · learn together" },
  ];
  const expectedFinal = fixture.targets.map((target) => ({ entry: target.entry, meaning: target.entry_meaning, usage: target.hint_phrase }));
  const context = await browser.newContext({ viewport, locale: "zh-CN" });
  await context.route("**/api/v1/analytics/events", (route) => route.abort("blockedbyclient"));
  await context.addCookies([{ name: "wordweave_ui_locale", value: "zh-CN", url: origin }]);
  await addControlledStream(context);
  const page = await context.newPage();
  page.on("pageerror", (error) => results.page_errors.push(`${name}: ${error.message}`));
  page.on("request", (request) => recordRequest(name, request));
  await page.goto(origin + "/create");
  await ready(page);
  await configureWorkspace(page);
  await page.getByRole("button", { name: "开始生成", exact: true }).click();
  await page.locator(".m003-plan-meanings").waitFor({ state: "visible" });
  await page.locator(".m003-live-draft .story-text").waitFor({ state: "visible" });
  await page.getByText(fixture.passage, { exact: true }).waitFor();
  const duringVocabulary = await vocabulary(page, ".m003-plan-meanings");
  const duringReading = await reading(page, ".m003-result-body", ".m003-live-draft .story-text");
  assertVocabulary(duringVocabulary, mobile ? 1 : 2, expectedPlan);
  assertReading(duringReading, mobile);
  await page.screenshot({ path: new URL(`workspace-during-${name}.png`, here).pathname, fullPage: true });
  await page.evaluate(() => window.__cr309QaReleasePending());
  await page.getByRole("button", { name: "重新核对", exact: true }).waitFor({ state: "visible" });
  assert.equal(await page.locator(".m003-plan-meanings").count(), 1);
  assert.equal(await page.locator(".m003-live-draft .story-text").textContent(), fixture.passage);
  const pendingVocabulary = await vocabulary(page, ".m003-plan-meanings");
  assert.deepEqual(pendingVocabulary, duringVocabulary);
  await page.screenshot({ path: new URL(`workspace-pending-${name}.png`, here).pathname, fullPage: true });
  await context.close();

  const finalContext = await browser.newContext({ viewport, locale: "zh-CN" });
  await finalContext.route("**/api/v1/analytics/events", (route) => route.abort("blockedbyclient"));
  await finalContext.addCookies([{ name: "wordweave_ui_locale", value: "zh-CN", url: origin }]);
  await addFinalStream(finalContext);
  const finalPage = await finalContext.newPage();
  finalPage.on("pageerror", (error) => results.page_errors.push(`${name}-final: ${error.message}`));
  finalPage.on("request", (request) => recordRequest(`${name}-final`, request));
  await finalPage.goto(origin + "/create");
  await ready(finalPage);
  await configureWorkspace(finalPage);
  await finalPage.getByRole("button", { name: "开始生成", exact: true }).click();
  await finalPage.locator(".m003-final-result").waitFor({ state: "visible" });
  assert.equal(await finalPage.locator(".m003-plan-meanings").count(), 0);
  const finalVocabulary = await vocabulary(finalPage, ".m003-final-result .m003-result-meanings");
  const finalReading = await reading(finalPage, ".m003-result-body", ".m003-final-result .story-text");
  assertVocabulary(finalVocabulary, mobile ? 1 : 2, expectedFinal);
  assertReading(finalReading, mobile);
  for (const key of ["columns", "columnGap", "rowGap", "itemPadding", "itemBorderTopWidth", "term", "detail"])
    assert.deepEqual(finalVocabulary[key], duringVocabulary[key], `${name} ${key}`);
  assert.equal(await finalPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await finalPage.screenshot({ path: new URL(`workspace-final-${name}.png`, here).pathname, fullPage: true });
  await finalContext.close();
  results.computed[name] = { duringVocabulary, pendingVocabulary, finalVocabulary, duringReading, finalReading };
  pass(`UIA-419-${name}`, { states: ["planning", "two-edits", "pending", "final"] });
  pass(`UIA-420-${name}`, { body_width: finalReading.bodyWidth, line_height: finalReading.lineHeight });
  pass(`UIA-421-${name}`, { columns: duringVocabulary.columns, no_horizontal_overflow: true });
}

async function adminPreset(browser) {
  await fetch(mockOrigin + "/api/v1/__test/admin-presets-reset", { method: "POST" });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: "en-US" });
  await context.route("**/api/v1/analytics/events", (route) => route.abort("blockedbyclient"));
  await context.addCookies([{ name: "wordweave_session", value: "admin", url: origin }]);
  const page = await context.newPage();
  page.on("pageerror", (error) => results.page_errors.push(`admin: ${error.message}`));
  page.on("request", (request) => recordRequest("admin", request));
  await page.goto(origin + "/admin/presets");
  await ready(page);
  const oldResult = page.locator(".m003-result-meanings");
  await oldResult.waitFor({ state: "visible" });
  assert.equal((await oldResult.locator(".section-head span").textContent()).trim(), "English");
  await page.locator('label.field:has-text("Explanation language") select').selectOption("zh");
  await fetch(mockOrigin + "/api/v1/__test/admin-presets-state", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ delayed: true }) });
  await page.getByRole("button", { name: "Generate preview", exact: true }).click();
  const plan = page.locator(".m003-plan-meanings"), retained = page.locator(".m003-result-meanings");
  await plan.waitFor({ state: "visible" });
  await retained.waitFor({ state: "visible" });
  assert.equal((await retained.locator(".section-head span").textContent()).trim(), "English");
  assert.equal(await page.locator(".m003-result-body .notice.warn").count(), 1);
  const publish = page.locator(".actions.form-footer .btn.primary");
  assert.equal(await publish.isDisabled(), true);
  const planStyle = await vocabulary(page, ".m003-plan-meanings");
  const retainedStyle = await vocabulary(page, ".m003-result-meanings");
  for (const key of ["columns", "columnGap", "rowGap", "itemPadding", "itemBorderTopWidth", "term", "detail"])
    assert.deepEqual(planStyle[key], retainedStyle[key], `admin retained ${key}`);
  assert.deepEqual(planStyle.values, [{ entry: "adapt", meaning: "change to fit", usage: "adapt · adapt quickly" }]);
  assert.deepEqual(retainedStyle.values, [{ entry: "adapt", meaning: "change to fit a new situation", usage: "adapt to change" }]);
  await page.screenshot({ path: new URL("admin-during-desktop-1440.png", here).pathname, fullPage: true });
  await page.getByRole("button", { name: "Stop generating", exact: true }).click();
  await fetch(mockOrigin + "/api/v1/__test/admin-presets-state", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ delayed: false }) });
  await page.getByRole("button", { name: "Generate preview", exact: true }).click();
  await page.waitForFunction(() =>
    document.querySelector(".m003-result-meanings .section-head span")?.textContent?.trim() === "中文",
  );
  assert.equal(await page.locator(".m003-plan-meanings").count(), 0);
  const finalResult = page.locator(".m003-result-meanings");
  assert.equal((await finalResult.locator(".section-head span").textContent()).trim(), "中文");
  const finalStyle = await vocabulary(page, ".m003-result-meanings");
  for (const key of ["columns", "columnGap", "rowGap", "itemPadding", "itemBorderTopWidth", "term", "detail"])
    assert.deepEqual(finalStyle[key], planStyle[key], `admin final ${key}`);
  assert.equal(await page.locator(".m003-result-body .notice.warn").count(), 0);
  assert.equal(await publish.isEnabled(), true);
  await page.screenshot({ path: new URL("admin-final-desktop-1440.png", here).pathname, fullPage: true });
  await context.close();
  results.computed.admin = { planStyle, retainedStyle, finalStyle, old_native_label: "English", final_native_label: "中文" };
  pass("UIA-422-PAGE212", { retained_old_preview: true, stale_and_publish_gate: true, native_labels: ["English", "中文"] });
}

async function trial(browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: "en-US" });
  await context.route("**/api/v1/analytics/events", (route) => route.abort("blockedbyclient"));
  await context.addCookies([{ name: "wordweave_session", value: "learner", url: origin }]);
  const page = await context.newPage();
  page.on("pageerror", (error) => results.page_errors.push(`trial: ${error.message}`));
  page.on("request", (request) => recordRequest("trial", request));
  await page.goto(origin + "/explore");
  await ready(page);
  await page.locator(".gallery-card").first().getByRole("link", { name: "Try this", exact: true }).click();
  await ready(page);
  await page.getByRole("button", { name: "Generate story", exact: true }).click();
  await page.locator(".m003-final-result .m003-result-meanings").waitFor({ state: "visible" });
  const style = await vocabulary(page, ".m003-final-result .m003-result-meanings");
  assertVocabulary(style, 2, [{ entry: "adapt", meaning: "change to fit a new situation", usage: "adapt to change" }]);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: new URL("trial-final-desktop-1440.png", here).pathname, fullPage: true });
  await context.close();
  results.computed.trial = style;
  pass("UIA-419-PAGE216", { shared_component: true, route: "/trial/preset-zh" });
}

const browser = await chromium.launch({ headless: true });
try {
  await workspaceViewport(browser, "desktop-1440", { width: 1440, height: 1000 });
  await workspaceViewport(browser, "mobile-390", { width: 390, height: 844 });
  await adminPreset(browser);
  await trial(browser);
  assert.deepEqual(results.page_errors, []);
  const nonMockGenerationPosts = results.requests.filter((r) => r.method === "POST" && r.path.includes("generations") && !r.path.endsWith("/stream"));
  assert.deepEqual(nonMockGenerationPosts, []);
  pass("CR309-functional-visual", { page_errors: 0, real_provider_calls: 0 });
  results.result = "PASS";
} catch (error) {
  results.failure = error instanceof Error ? { message: error.message, stack: error.stack } : { message: String(error) };
  throw error;
} finally {
  await browser.close();
  fs.writeFileSync(new URL("results.json", here), JSON.stringify(results, null, 2) + "\n");
}

console.log(JSON.stringify({ checks: results.checks.length, page_errors: results.page_errors.length, real_provider_calls: 0 }));
