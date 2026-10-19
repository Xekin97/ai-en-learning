/** Replay an exact captured Go v6 flow through the current Nuxt client. */
import { chromium } from "../../../../../../frontend/node_modules/@playwright/test/index.mjs";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const stack = JSON.parse(await readFile(resolve(here, "local-stack-public.json"), "utf8"));
const work = (await readFile(resolve(here, "local-stack-location.txt"), "utf8")).trim();
const privateEnv = JSON.parse(await readFile(resolve(work, "env.json"), "utf8"));
const capture = JSON.parse(await readFile(resolve(here, "actual-replay-wire.json"), "utf8"));
const copySource = JSON.parse(await readFile(resolve(here, "../../../../M002/design/copy.json"), "utf8"));
const copy = (key) => copySource.static[`en.${key}`] ?? copySource.templates[`en.${key}`];
const result = { source: capture.source, syntheticContent: true, checks: {}, failures: [] };
const check = (name, pass, detail) => { result.checks[name] = { pass: Boolean(pass), detail }; if (!pass) result.failures.push(name); };
async function poll(fn, timeout = 15000) { const end = Date.now() + timeout; while (Date.now() < end) { if (await fn()) return; await new Promise((r) => setTimeout(r, 25)); } throw new Error("poll timeout"); }
async function selectValue(page, label, value) {
  const control = page.getByRole("combobox", { name: label, exact: true });
  const button = (await control.evaluate((node) => node.tagName)) === "SELECT" ? control.locator("..").getByRole("combobox") : control;
  const native = button.locator("..").locator("select");
  const option = (await native.locator("option").evaluateAll((nodes) => nodes.map((node) => ({ value: node.value, label: node.textContent.trim() })))).find((item) => item.value === value);
  if (!option) throw new Error(`missing option ${value}`);
  await button.click();
  await page.locator(`[id="${await button.getAttribute("aria-controls")}"]`).getByRole("option", { name: option.label, exact: true }).click();
}

const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const bootstrap = await (await context.request.get(stack.frontend_origin + "/api/v1/bootstrap")).json();
  const account = privateEnv.QA_ACCOUNTS.pro;
  const login = await context.request.post(stack.frontend_origin + "/api/v1/auth/login", {
    headers: { origin: stack.frontend_origin, "sec-fetch-site": "same-origin", "x-csrf-token": bootstrap.data.csrf_token },
    data: { username: account.username, password: account.password, browser_ui_locale: "en-US" },
  });
  check("real_stack_login", login.ok(), { status: login.status() });
  await context.addCookies([{ name: "wordweave_ui_locale", value: "en-US", url: stack.frontend_origin }]);
  const page = await context.newPage();
  const terminal = capture.events.find((item) => item.event === "generation.validated");
  const started = capture.events[0];
  const wire = capture.events.map((item) => `event: ${item.event}\ndata: ${JSON.stringify(item.data)}\n\n`).join("");
  let postedPayload = null;
  await page.route("**/api/v1/generations/stream", async (route) => {
    postedPayload = route.request().postDataJSON();
    await route.fulfill({ status: 200, contentType: "text/event-stream; charset=utf-8", headers: { "cache-control": "no-store" }, body: wire });
  });
  await page.route(`**/api/v1/generations/${started.data.run_id}/status`, (route) => route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify({ data: { contract_version: "m003-stream-v6", run_id: started.data.run_id, status: "active", snapshot: started.data.snapshot, final_content_version: null, result: null, can_save: false, quota_refunded: false, content_outcome: null, completion_notice: null }, meta: { request_id: "qa-captured-replay" } }),
  }));
  await page.goto(stack.frontend_origin + "/create");
  await poll(() => page.evaluate(() => document.documentElement.dataset.appReady === "true"));
  const settings = page.locator("details.settings"); if (!(await settings.evaluate((node) => node.open))) await settings.locator("summary").click();
  await selectValue(page, copy("model"), capture.payload.model_id);
  await selectValue(page, copy("explain"), capture.payload.meaning_language);
  await selectValue(page, copy("style"), capture.payload.scenario);
  await selectValue(page, copy("length"), capture.payload.length);
  const search = page.getByRole("combobox", { name: copy("wordsearch"), exact: true });
  for (const entry of capture.payload.entries) { await search.fill(entry); await page.getByRole("option", { name: entry, exact: true }).click(); }
  await page.locator("#generation-actions button").click();
  await poll(async () => (await page.locator("#final-result .live-draft-text").count()) === 1 && await page.locator("#final-result .live-draft-text").textContent({ timeout: 100 }) === terminal.data.result.passage);
  const dom = await page.evaluate(() => ({
    status: document.querySelector(".m003-status-copy")?.textContent?.trim(),
    draftAriaLive: document.querySelectorAll(".m003-live-draft [aria-live]").length,
    overflow: document.documentElement.scrollWidth <= innerWidth,
    planVisible: Boolean(document.querySelector("#planning-preview")),
  }));
  check("request_matches_capture", JSON.stringify(postedPayload) === JSON.stringify(capture.payload), { postedPayload, expected: capture.payload });
  check("captured_v6_exact_terminal_consumed", capture.result === "PASS" && terminal.event === "generation.validated" && dom.draftAriaLive === 0 && dom.overflow, { runId: started.data.run_id, eventCount: capture.events.length, terminal: terminal.event, dom });
  await context.close();
} catch (error) {
  result.fatal = { message: error.message, stack: error.stack };
  result.failures.push("fatal");
} finally { await browser.close(); }
result.result = result.failures.length ? "FAIL" : "PASS";
await writeFile(resolve(here, "actual-replay-results.json"), JSON.stringify(result, null, 2) + "\n");
console.log(JSON.stringify({ result: result.result, failures: result.failures }));
process.exitCode = result.failures.length ? 1 : 0;
