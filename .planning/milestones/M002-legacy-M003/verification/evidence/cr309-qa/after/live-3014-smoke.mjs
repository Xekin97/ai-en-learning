import assert from "node:assert/strict";
import fs from "node:fs";
import { chromium } from "../../../../../../../frontend/node_modules/@playwright/test/index.mjs";

const origin = "http://127.0.0.1:3014";
const here = new URL("./", import.meta.url);
const fixture = {
  passage: "Neighbors learn in the garden.",
  targets: [
    { entry: "garden", entry_meaning: "居民共同照料的花园", hint_phrase: "the garden", hint_blanks: [{ start: 4, end: 10 }], occurrences: [{ surface: "garden", start: 23, end: 29 }] },
    { entry: "learn", entry_meaning: "通过练习获得知识或技能", hint_phrase: "learn together", hint_blanks: [{ start: 0, end: 5 }], occurrences: [{ surface: "learn", start: 10, end: 15 }] },
  ],
};
const result = { result: "FAIL", node: process.version, origin, real_provider_calls: 0, intercepted_streams: 0, api_mutations: [], page_errors: [] };

async function ready(page) {
  await page.waitForFunction(() => document.documentElement.dataset.appReady === "true");
}
async function select(page, label, value) {
  const control = page.getByRole("combobox", { name: label, exact: true });
  const native = control.locator("..").locator("select");
  const text = (await native.locator(`option[value="${value}"]`).textContent()).trim();
  await control.click();
  await page.locator(`[id="${await control.getAttribute("aria-controls")}"]`).getByRole("option", { name: text, exact: true }).click();
}
async function style(page, selector) {
  return page.locator(selector).evaluate((panel) => {
    const list = panel.querySelector(":scope > dl.m003-vocabulary-list"), item = list.firstElementChild, dt = item.querySelector("dt"), dd = item.querySelector("dd");
    const ls = getComputedStyle(list), is = getComputedStyle(item), ts = getComputedStyle(dt), ds = getComputedStyle(dd);
    return { structure: [...list.children].every((node) => node.children.length === 3 && node.children[0].tagName === "DT" && node.children[1].tagName === "DD" && node.children[2].tagName === "DD"), columns: ls.gridTemplateColumns.split(" ").length, columnGap: ls.columnGap, paddingTop: is.paddingTop, borderTopWidth: is.borderTopWidth, termFontSize: ts.fontSize, termFontWeight: ts.fontWeight, termFontFamily: ts.fontFamily, detailFontSize: ds.fontSize, detailLineHeight: ds.lineHeight };
  });
}

const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: "zh-CN" });
  await context.route("**/api/v1/analytics/events", (route) => route.abort("blockedbyclient"));
  await context.addCookies([{ name: "wordweave_ui_locale", value: "zh-CN", url: origin }]);
  await context.addInitScript(({ payload }) => {
    const original = window.fetch.bind(window), encoder = new TextEncoder();
    const frame = (event, data) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    window.__cr309LiveRelease = null;
    window.__cr309LiveIntercepted = 0;
    window.fetch = async (input, init) => {
      const request = input instanceof Request ? input : null;
      const url = new URL(request?.url ?? String(input), location.href);
      const method = (init?.method ?? request?.method ?? "GET").toUpperCase();
      if (method === "POST" && url.pathname === "/api/v1/generations/stream") {
        window.__cr309LiveIntercepted += 1;
        const pre = [
          ["generation.started", { seq: 1, contract_version: "m003-stream-v5", stream_id: "cr309-live-smoke", run_id: "cr309-live-smoke", generation_token: "intercepted", snapshot: { configuration_revision: "cr309-live-smoke", effective_plan: { code: "visitor", origin: "visitor" }, content_service: { native_validation: true, content_review_enabled: false, content_repair_limit: 0 }, native_correction_policy: { version: "m003-native-policy-v1", scope: "logical_request", max_calls: 2, editable: false } } }],
          ["generation.progress", { seq: 2, phase: "planning" }],
          ["generation.plan_item", { seq: 3, plan_id: "cr309-live-plan", meaning_language: "zh", item: { kind: "scene", text: "邻居在社区花园一起练习新技能。" } }],
          ["generation.plan_item", { seq: 4, plan_id: "cr309-live-plan", meaning_language: "zh", item: { kind: "word_use", entry: "garden", form: "garden", sense: "居民共同照料的花园", phrase: "the garden" } }],
          ["generation.plan_item", { seq: 5, plan_id: "cr309-live-plan", meaning_language: "zh", item: { kind: "word_use", entry: "learn", form: "learn", sense: "通过练习获得知识或技能", phrase: "learn together" } }],
          ["generation.progress", { seq: 6, phase: "composing" }],
          ["generation.edit", { seq: 7, draft_id: "cr309-live-draft", content_version: 1, base_rev: 0, rev: 1, at: 0, delete_count: 0, insert: payload.passage, source: "provider" }],
        ];
        const stream = new ReadableStream({ start(controller) {
          pre.forEach(([event, data], index) => setTimeout(() => controller.enqueue(encoder.encode(frame(event, data))), index * 50));
          window.__cr309LiveRelease = () => {
            controller.enqueue(encoder.encode(frame("generation.progress", { seq: 8, phase: "finalizing" })));
            controller.enqueue(encoder.encode(frame("generation.validated", { seq: 9, run_id: "cr309-live-smoke", final_content_version: 1, result: { passage: payload.passage, tags: ["社区", "学习"], targets: payload.targets }, content_outcome: "basic", completion_notice: null })));
            controller.close(); window.__cr309LiveRelease = null;
          };
        } });
        return new Response(stream, { status: 200, headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-store" } });
      }
      return original(input, init);
    };
  }, { payload: fixture });
  const page = await context.newPage();
  page.on("pageerror", (error) => result.page_errors.push(error.message));
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (request.method() !== "GET" && path.startsWith("/api/v1/") && path !== "/api/v1/analytics/events") result.api_mutations.push({ method: request.method(), path });
  });
  await page.goto(origin + "/create");
  await ready(page);
  const optionsBefore = await page.evaluate(async () => (await (await fetch("/api/v1/generation-options")).json()).data);
  const synthetic = optionsBefore.models.find((model) => /合成.*成功|synthetic.*success/i.test(model.name)) ?? optionsBefore.models[0];
  const settings = page.locator("details.settings");
  if (!(await settings.evaluate((node) => node.open))) await settings.locator("summary").click();
  await select(page, "AI 模型", synthetic.id);
  await select(page, "场景", "story");
  await select(page, "长度", "short");
  await select(page, "释义语言", "zh");
  for (const entry of ["garden", "learn"]) {
    await page.locator("#create-words-search").fill(entry);
    await page.getByRole("option", { name: entry, exact: true }).click();
  }
  await page.getByRole("button", { name: "开始生成", exact: true }).click();
  await page.locator(".m003-plan-meanings").waitFor({ state: "visible" });
  await page.getByText(fixture.passage, { exact: true }).waitFor();
  const plan = await style(page, ".m003-plan-meanings");
  await page.evaluate(() => window.__cr309LiveRelease());
  await page.locator(".m003-final-result .m003-result-meanings").waitFor({ state: "visible" });
  const final = await style(page, ".m003-final-result .m003-result-meanings");
  assert.deepEqual(final, plan);
  assert.deepEqual(plan, { structure: true, columns: 2, columnGap: "24px", paddingTop: "10px", borderTopWidth: "1px", termFontSize: "17px", termFontWeight: "600", termFontFamily: plan.termFontFamily, detailFontSize: "13px", detailLineHeight: "21.45px" });
  assert.equal(await page.locator(".m003-plan-meanings").count(), 0);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  const optionsAfter = await page.evaluate(async () => (await (await fetch("/api/v1/generation-options")).json()).data);
  assert.deepEqual(optionsAfter.quota, optionsBefore.quota);
  result.intercepted_streams = await page.evaluate(() => window.__cr309LiveIntercepted);
  assert.equal(result.intercepted_streams, 1);
  assert.deepEqual(result.api_mutations, []);
  assert.deepEqual(result.page_errors, []);
  result.model_selected = { id: synthetic.id, name: synthetic.name };
  result.quota_before = optionsBefore.quota;
  result.quota_after = optionsAfter.quota;
  result.computed = { plan, final };
  result.no_horizontal_overflow = true;
  result.result = "PASS";
  await page.screenshot({ path: new URL("live-3014-final-desktop-1440.png", here).pathname, fullPage: true });
  await context.close();
} catch (error) {
  result.failure = error instanceof Error ? { message: error.message, stack: error.stack } : { message: String(error) };
  throw error;
} finally {
  await browser.close();
  fs.writeFileSync(new URL("live-3014-smoke.json", here), JSON.stringify(result, null, 2) + "\n");
}

console.log(JSON.stringify({ result: result.result, intercepted_streams: result.intercepted_streams, real_provider_calls: 0 }));
