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
const result = {
  purpose: "CR-310 read-only before baseline; not formal verification",
  result: "FAIL",
  origin,
  node: process.version,
  real_provider_calls: 0,
  api_business_mutations: [],
  page_errors: [],
  reused_screenshot: "../../cr309-qa/after/live-3014-final-desktop-1440.png",
  reused_screenshot_sha256: "72d8d6753365b9b759c069bdfcd1c9929c4ca7b81763ba32ada78e0868d12b97",
};

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

const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: "zh-CN" });
  await context.route("**/api/v1/analytics/events", (route) => route.abort("blockedbyclient"));
  await context.addCookies([{ name: "wordweave_ui_locale", value: "zh-CN", url: origin }]);
  await context.addInitScript(({ payload }) => {
    const original = window.fetch.bind(window);
    const frame = (event, data) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    window.__cr310Intercepted = 0;
    window.fetch = async (input, init) => {
      const request = input instanceof Request ? input : null;
      const url = new URL(request?.url ?? String(input), location.href);
      const method = (init?.method ?? request?.method ?? "GET").toUpperCase();
      if (method === "POST" && url.pathname === "/api/v1/generations/stream") {
        window.__cr310Intercepted += 1;
        const events = [
          ["generation.started", { seq: 1, contract_version: "m003-stream-v5", stream_id: "cr310-before", run_id: "cr310-before", generation_token: "intercepted", snapshot: { configuration_revision: "cr310-before", effective_plan: { code: "visitor", origin: "visitor" }, content_service: { native_validation: true, content_review_enabled: false, content_repair_limit: 0 }, native_correction_policy: { version: "m003-native-policy-v1", scope: "logical_request", max_calls: 2, editable: false } } }],
          ["generation.progress", { seq: 2, phase: "planning" }],
          ["generation.plan_item", { seq: 3, plan_id: "cr310-plan", meaning_language: "zh", item: { kind: "scene", text: "邻居在社区花园一起练习新技能。" } }],
          ["generation.plan_item", { seq: 4, plan_id: "cr310-plan", meaning_language: "zh", item: { kind: "word_use", entry: "garden", form: "garden", sense: "居民共同照料的花园", phrase: "the garden" } }],
          ["generation.plan_item", { seq: 5, plan_id: "cr310-plan", meaning_language: "zh", item: { kind: "word_use", entry: "learn", form: "learn", sense: "通过练习获得知识或技能", phrase: "learn together" } }],
          ["generation.progress", { seq: 6, phase: "composing" }],
          ["generation.edit", { seq: 7, draft_id: "cr310-draft", content_version: 1, base_rev: 0, rev: 1, at: 0, delete_count: 0, insert: payload.passage, source: "provider" }],
          ["generation.progress", { seq: 8, phase: "finalizing" }],
          ["generation.validated", { seq: 9, run_id: "cr310-before", final_content_version: 1, result: { passage: payload.passage, tags: ["社区", "学习"], targets: payload.targets }, content_outcome: "basic", completion_notice: null }],
        ];
        return new Response(events.map(([event, data]) => frame(event, data)).join(""), { status: 200, headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-store" } });
      }
      return original(input, init);
    };
  }, { payload: fixture });

  const page = await context.newPage();
  page.on("pageerror", (error) => result.page_errors.push(error.message));
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (request.method() !== "GET" && path.startsWith("/api/v1/") && path !== "/api/v1/analytics/events")
      result.api_business_mutations.push({ method: request.method(), path });
  });
  await page.goto(origin + "/create");
  await ready(page);
  const options = await page.evaluate(async () => (await (await fetch("/api/v1/generation-options")).json()).data);
  const synthetic = options.models.find((model) => /合成.*成功|synthetic.*success/i.test(model.name)) ?? options.models[0];
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
  await page.locator(".m003-final-result").waitFor({ state: "visible" });

  const controls = await page.evaluate(() => {
    const fieldset = document.querySelector("fieldset.generation-fields");
    const config = [...fieldset.querySelectorAll("button[role=combobox], select")];
    const picker = document.querySelector("#create-words-search");
    const start = [...document.querySelectorAll("button")].find((node) => node.textContent?.includes("开始生成"));
    const final = document.querySelector(".m003-final-result");
    const finalButtons = [...final.querySelectorAll("button")];
    return {
      generation_fieldset_disabled: fieldset.disabled,
      config_control_count: config.length,
      config_controls_disabled: config.every((node) => node.matches(":disabled")),
      word_search_disabled: picker.matches(":disabled"),
      start_disabled: start.matches(":disabled"),
      final_visible: Boolean(final),
      final_title: final.querySelector("h2")?.textContent?.trim(),
      final_body: final.querySelector(".story-text")?.textContent?.trim(),
      final_meanings: [...final.querySelectorAll(".m003-result-meanings dt")].map((node) => node.textContent?.trim()),
      final_actions: finalButtons.map((node) => ({ text: node.textContent?.trim(), disabled: node.matches(":disabled") })),
    };
  });
  assert.equal(controls.generation_fieldset_disabled, true);
  assert.equal(controls.config_controls_disabled, true);
  assert.equal(controls.word_search_disabled, true);
  assert.equal(controls.start_disabled, true);
  assert.equal(controls.final_visible, true);
  assert.deepEqual(controls.final_meanings, ["garden", "learn"]);
  assert.ok(controls.final_actions.length === 2 && controls.final_actions.every((item) => !item.disabled));

  const standaloneDiscard = page.locator(".m003-final-result .actions .btn.quiet");
  await standaloneDiscard.click();
  const dialog = page.locator("#generation-confirm[open]");
  await dialog.waitFor({ state: "visible" });
  const dialogFact = {
    title: (await dialog.locator("h2").textContent())?.trim(),
    body: (await dialog.locator("p").textContent())?.trim(),
    buttons: await dialog.locator("button").allTextContents(),
  };
  await dialog.locator("button").first().click();
  assert.equal(await dialog.count(), 0);
  assert.equal(await page.locator(".m003-final-result").count(), 1);
  assert.equal(
    await page.locator("fieldset.generation-fields").evaluate((node) => node.disabled),
    true,
  );

  result.intercepted_generation_streams = await page.evaluate(() => window.__cr310Intercepted);
  result.model_selected = { id: synthetic.id, name: synthetic.name };
  result.completed_state = controls;
  result.standalone_discard_dialog = dialogFact;
  result.after_cancel = {
    final_result_retained: true,
    controls_still_disabled: true,
    discard_requests: result.api_business_mutations.filter((item) => item.path.includes("/discard")).length,
    generation_streams: result.intercepted_generation_streams,
  };
  assert.equal(result.intercepted_generation_streams, 1);
  assert.deepEqual(result.api_business_mutations, []);
  assert.deepEqual(result.page_errors, []);
  result.result = "PASS_BASELINE";
  await context.close();
} catch (error) {
  result.failure = error instanceof Error ? { message: error.message, stack: error.stack } : { message: String(error) };
  throw error;
} finally {
  await browser.close();
  fs.writeFileSync(new URL("baseline.json", here), JSON.stringify(result, null, 2) + "\n");
}

console.log(JSON.stringify({ result: result.result, real_provider_calls: 0, api_business_mutations: result.api_business_mutations.length }));
