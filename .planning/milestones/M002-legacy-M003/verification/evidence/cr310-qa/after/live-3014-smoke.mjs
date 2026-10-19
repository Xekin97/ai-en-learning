import assert from "node:assert/strict";
import fs from "node:fs";
import { chromium } from "../../../../../../../frontend/node_modules/@playwright/test/index.mjs";

const origin = "http://127.0.0.1:3014";
const here = new URL("./", import.meta.url);
const syntheticModel = "01a12f98-eac2-7448-8fa2-71224c837ffc";
const passage = "Neighbors learn in the garden.";
const targets = [
  { entry: "garden", entry_meaning: "居民共同照料的花园", hint_phrase: "the garden", hint_blanks: [{ start: 4, end: 10 }], occurrences: [{ surface: "garden", start: 23, end: 29 }] },
  { entry: "learn", entry_meaning: "通过练习获得知识或技能", hint_phrase: "learn together", hint_blanks: [{ start: 0, end: 5 }], occurrences: [{ surface: "learn", start: 10, end: 15 }] },
];
const result = {
  result: "FAIL", node: process.version, origin,
  scope: "CR-310 refreshed UAT 3014 minimal route-intercepted smoke",
  real_provider_calls: 0, backend_business_mutations: 0,
  page_errors: [],
};
const frame = (event, data) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
async function ready(page) { await page.waitForFunction(() => document.documentElement.dataset.appReady === "true"); }
async function select(page, label, value) {
  const control = page.getByRole("combobox", { name: label, exact: true });
  const native = control.locator("..").locator("select");
  const text = (await native.locator(`option[value="${value}"]`).textContent()).trim();
  await control.click();
  await page.locator(`[id="${await control.getAttribute("aria-controls")}"]`).getByRole("option", { name: text, exact: true }).click();
}
async function signature(page) {
  return page.locator("#final-result").evaluate((node) => ({
    title: node.querySelector("h2")?.textContent?.trim(),
    body: node.querySelector(".story-text")?.textContent?.trim(),
    tags: [...node.querySelectorAll(".chips .chip")].map((item) => item.textContent?.trim()),
    meanings: [...node.querySelectorAll(".m003-result-meanings > dl > div")].map((item) => [...item.children].map((child) => child.textContent?.trim())),
  }));
}

const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "zh-CN" });
  await context.route("**/api/v1/analytics/events", (route) => route.abort("blockedbyclient"));
  await context.addCookies([{ name: "wordweave_ui_locale", value: "zh-CN", url: origin }]);
  await context.addInitScript(({ passage, targets }) => {
    const frame = (event, data) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    const original = window.fetch.bind(window);
    window.__cr310Live = { streams: 0, discards: 0, interceptedPaths: [] };
    window.fetch = async (input, init) => {
      const request = input instanceof Request ? input : null;
      const url = new URL(request?.url ?? String(input), location.href);
      const method = (init?.method ?? request?.method ?? "GET").toUpperCase();
      if (method === "POST" && url.pathname === "/api/v1/generations/stream") {
        window.__cr310Live.streams++;
        window.__cr310Live.interceptedPaths.push(url.pathname);
        const body = [
          frame("generation.started", { seq: 1, contract_version: "m003-stream-v5", stream_id: "cr310-live", run_id: "cr310-live", generation_token: "intercepted", snapshot: { configuration_revision: "cr310-live", effective_plan: { code: "visitor", origin: "visitor" }, content_service: { native_validation: true, content_review_enabled: false, content_repair_limit: 0 }, native_correction_policy: { version: "m003-native-policy-v1", scope: "logical_request", max_calls: 2, editable: false } } }),
          frame("generation.progress", { seq: 2, phase: "planning" }),
          frame("generation.plan_item", { seq: 3, plan_id: "cr310-live-plan", meaning_language: "zh", item: { kind: "scene", text: "邻居在花园里一起学习。" } }),
          frame("generation.plan_item", { seq: 4, plan_id: "cr310-live-plan", meaning_language: "zh", item: { kind: "word_use", entry: "garden", form: "garden", sense: "居民共同照料的花园", phrase: "the garden" } }),
          frame("generation.plan_item", { seq: 5, plan_id: "cr310-live-plan", meaning_language: "zh", item: { kind: "word_use", entry: "learn", form: "learn", sense: "通过练习获得知识或技能", phrase: "learn together" } }),
          frame("generation.progress", { seq: 6, phase: "composing" }),
          frame("generation.edit", { seq: 7, draft_id: "cr310-live-draft", content_version: 1, base_rev: 0, rev: 1, at: 0, delete_count: 0, insert: passage, source: "provider" }),
          frame("generation.progress", { seq: 8, phase: "finalizing" }),
          frame("generation.validated", { seq: 9, run_id: "cr310-live", final_content_version: 1, result: { passage, tags: ["社区", "学习"], targets }, content_outcome: "basic", completion_notice: null }),
        ].join("");
        return new Response(body, { status: 200, headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-store" } });
      }
      if (method === "POST" && /\/api\/v1\/generations\/[^/]+\/discard$/.test(url.pathname)) {
        window.__cr310Live.discards++;
        window.__cr310Live.interceptedPaths.push(url.pathname);
        return new Response(null, { status: 204 });
      }
      return original(input, init);
    };
  }, { passage, targets });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  const observedMutations = [];
  page.on("pageerror", (error) => result.page_errors.push(error.message));
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (request.method() !== "GET" && path.startsWith("/api/v1/") && path !== "/api/v1/analytics/events") observedMutations.push({ method: request.method(), path });
  });
  await page.goto(origin + "/create"); await ready(page);
  const optionsBefore = await page.evaluate(async () => (await (await fetch("/api/v1/generation-options")).json()).data);
  const settings = page.locator("details.settings");
  if (!(await settings.evaluate((node) => node.open))) await settings.locator("summary").click();
  await select(page, "AI 模型", syntheticModel);
  await select(page, "场景", "story"); await select(page, "长度", "short"); await select(page, "释义语言", "zh");
  for (const entry of ["garden", "learn"]) {
    await page.locator("#create-words-search").fill(entry);
    await page.getByRole("option", { name: entry, exact: true }).click();
  }
  const generate = page.getByRole("button", { name: "开始生成", exact: true });
  await generate.click(); await page.locator("#final-result .story-text").waitFor({ state: "visible" });
  const old = await signature(page);
  assert.equal(old.body, passage);
  assert.equal(await page.locator("fieldset.generation-fields").evaluate((node) => node.disabled), false);
  assert.equal(await page.locator("#create-words-search").isEnabled(), true);
  assert.equal(await generate.isEnabled(), true);
  assert.equal(await page.locator("#final-result .actions .btn.quiet").count(), 0);
  await select(page, "场景", "discussion"); await select(page, "长度", "medium");
  assert.deepEqual(await signature(page), old);
  await generate.click();
  const dialog = page.locator("#regenerate-confirm[open]"); await dialog.waitFor({ state: "visible" });
  assert.equal((await dialog.locator("h2").textContent()).trim(), "生成新的短文？");
  assert.equal((await dialog.locator(".dialog-body").textContent()).trim(), "继续生成会永久放弃当前未收录的短文和学习信息。");
  assert.equal((await dialog.locator(".dialog-actions button").last().textContent()).trim(), "放弃并生成");
  await page.screenshot({ path: new URL("live-3014-warning-desktop-1440.png", here).pathname, fullPage: true });
  await dialog.locator(".dialog-actions button").first().click(); await dialog.waitFor({ state: "hidden" });
  assert.deepEqual(await signature(page), old);
  assert.equal(await generate.evaluate((node) => node === document.activeElement), true);
  const counters = await page.evaluate(() => window.__cr310Live);
  assert.deepEqual(counters, { streams: 1, discards: 0, interceptedPaths: ["/api/v1/generations/stream"] });
  const optionsAfter = await page.evaluate(async () => (await (await fetch("/api/v1/generation-options")).json()).data);
  assert.deepEqual(optionsAfter.quota, optionsBefore.quota);
  assert.deepEqual(observedMutations, []);
  assert.deepEqual(result.page_errors, []);
  result.backend_business_mutations = observedMutations.length;
  result.result = "PASS";
  result.source_behavior = { valid_result_inputs_editable: true, standalone_discard_absent: true, old_result_stable_after_next_input_edits: true, native_zh_warning: true, cancel_retains_result_and_inputs: true, focus_returned_to_generate: true };
  result.intercepts = counters;
  result.quota_before = optionsBefore.quota; result.quota_after = optionsAfter.quota;
  result.synthetic_model = syntheticModel;
  await context.close();
} catch (error) {
  result.failure = error instanceof Error ? { message: error.message, stack: error.stack } : { message: String(error) };
  throw error;
} finally {
  await browser.close();
  fs.writeFileSync(new URL("live-3014-smoke.json", here), JSON.stringify(result, null, 2) + "\n");
}
console.log(JSON.stringify({ result: result.result, real_provider_calls: result.real_provider_calls, backend_business_mutations: result.backend_business_mutations }));
