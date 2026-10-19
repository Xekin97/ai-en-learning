/** Focused repeated probe for action-node focus preservation during rich v6 presentation. */
import { chromium } from "../../../../../../frontend/node_modules/@playwright/test/index.mjs";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
const here = dirname(fileURLToPath(import.meta.url));
const origin = "http://127.0.0.1:3322";
const copies = JSON.parse(await readFile(resolve(here, "../../../../M002/design/copy.json"), "utf8"));
const copy = (key) => copies.static[`zh.${key}`] ?? copies.templates[`zh.${key}`];
async function poll(fn, timeout = 15000) { const end = Date.now() + timeout; while (Date.now() < end) { if (await fn()) return; await new Promise((r) => setTimeout(r, 20)); } throw new Error("poll timeout"); }
async function select(page, label, value) {
  const control = page.getByRole("combobox", { name: label, exact: true });
  const button = (await control.evaluate((node) => node.tagName)) === "SELECT" ? control.locator("..").getByRole("combobox") : control;
  const option = (await button.locator("..").locator("select option").evaluateAll((nodes) => nodes.map((node) => ({ value: node.value, label: node.textContent.trim() })))).find((item) => item.value === value);
  await button.click(); await page.locator(`[id="${await button.getAttribute("aria-controls")}"]`).getByRole("option", { name: option.label, exact: true }).click();
}
const browser = await chromium.launch({ headless: true });
const result = { fixture: "controlled local rich v6 stream", iterations: [] };
try {
  for (let iteration = 1; iteration <= 5; iteration++) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await context.addCookies([{ name: "wordweave_session", value: "learner", url: origin }, { name: "wordweave_ui_locale", value: "zh-CN", url: origin }, { name: "wordweave_cr312_rich", value: "1", url: origin }]);
    const page = await context.newPage(); let optionsRequests = 0;
    page.on("request", (request) => { if (request.url().endsWith("/api/v1/generation-options")) optionsRequests++; });
    await page.goto(origin + "/create"); await poll(() => page.evaluate(() => document.documentElement.dataset.appReady === "true"));
    const settings = page.locator("details.settings"); if (!(await settings.evaluate((node) => node.open))) await settings.locator("summary").click();
    await select(page, copy("model"), "model-fast"); await select(page, copy("explain"), "en");
    await page.getByRole("button", { name: copy("random"), exact: true }).click(); await poll(() => page.locator(".workspace .word-token").textContent().then((text) => text?.includes("adapt")));
    const action = page.locator("#generation-actions button");
    await page.evaluate(() => {
      window.__focusProbe = { events: [] };
      for (const type of ["focusin", "focusout"]) document.addEventListener(type, (event) => window.__focusProbe.events.push({ type, tag: event.target?.tagName, id: event.target?.id ?? "", actionDisabled: document.querySelector("#generation-actions button")?.disabled, elapsed: performance.now() }));
    });
    await action.click();
    const afterClick = await action.evaluate((node) => document.activeElement === node);
    await poll(() => page.locator("#generation-content-passage [data-paragraph-index]").count().then((count) => count === 4));
    const nodeStableAtDraft = await action.evaluate((node) => node === document.querySelector("#generation-actions button"));
    const focusedAtDraft = await action.evaluate((node) => document.activeElement === node);
    await poll(() => page.locator("#final-result").count().then(Boolean));
    const final = await action.evaluate((node) => ({ focused: document.activeElement === node, activeTag: document.activeElement?.tagName, activeId: document.activeElement?.id ?? "", stable: node === document.querySelector("#generation-actions button"), disabled: node.disabled, events: window.__focusProbe.events }));
    result.iterations.push({ iteration, afterClick, focusedAtDraft, nodeStableAtDraft, final, optionsRequests });
    await context.close();
  }
} catch (error) { result.fatal = { message: error.message, stack: error.stack }; }
finally { await browser.close(); }
result.pass = !result.fatal && result.iterations.length === 5 && result.iterations.every((item) => item.afterClick && item.focusedAtDraft && item.nodeStableAtDraft && item.final.focused && item.final.stable && !item.final.disabled && item.optionsRequests === 1);
await writeFile(resolve(here, "focus-probe-results.json"), JSON.stringify(result, null, 2) + "\n");
console.log(JSON.stringify({ pass: result.pass, iterations: result.iterations.map((item) => ({ iteration: item.iteration, afterClick: item.afterClick, draft: item.focusedAtDraft, final: item.final.focused, events: item.final.events })) }));
process.exitCode = result.pass ? 0 : 1;
