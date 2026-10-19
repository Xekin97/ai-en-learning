import playwright from "../../../../../../frontend/node_modules/@playwright/test/index.js";
import fs from "node:fs/promises";

const { chromium } = playwright;
const root = "http://127.0.0.1:4174/M003/design/prototype/";
const evidenceDir = new URL("./", import.meta.url).pathname;
const browser = await chromium.launch({ headless: true });
const report = { version: "M003-UI-05-R1", fixtureVersion: "M003-BE-03", browser: "Chromium", scenarios: [], summary: {} };

async function openPage(query, viewport = { width: 1440, height: 1000 }) {
  const page = await browser.newPage({ viewport, reducedMotion: "reduce" });
  const errors = [];
  page.on("console", (message) => message.type() === "error" && errors.push(`console:${message.text()}`));
  page.on("pageerror", (error) => errors.push(`page:${error.message}`));
  await page.goto(`${root}?${query}`, { waitUntil: "networkidle" });
  return { page, errors };
}

async function observeStates(page, selector, terminal, timeout = 8500) {
  const started = Date.now();
  const sequence = [];
  let previous = null;
  while (Date.now() - started < timeout) {
    const state = await page.locator(selector).getAttribute("data-state");
    if (state !== previous) {
      sequence.push({
        at_ms: Date.now() - started,
        state,
        resource_cards: await page.locator(`${selector} .resource-card`).count(),
        save_actions: await page.locator('[data-action="save-story"]').count(),
      });
      previous = state;
    }
    if (state === terminal) break;
    await page.waitForTimeout(80);
  }
  return { elapsed_ms: Date.now() - started, sequence };
}

async function record(name, run) {
  const result = { name, pass: false, errors: [] };
  try {
    Object.assign(result, await run());
  } catch (error) {
    result.errors.push(error.stack || error.message);
  }
  report.scenarios.push(result);
}

await record("create-normal-click-autoplays-wire", async () => {
  const { page, errors } = await openPage("page=create&scenario=basic&event=0&status=0&lang=zh");
  const historyBefore = await page.evaluate(() => history.length);
  const demoBefore = await page.locator(".scenario-bar").getAttribute("open");
  await page.getByRole("button", { name: "生成短文" }).click();
  const observed = await observeStates(page, "#generation-status", "valid");
  const states = observed.sequence.map((item) => item.state);
  const learningAt = observed.sequence.find((item) => item.state === "learning")?.at_ms;
  const finalAt = observed.sequence.find((item) => item.state === "valid")?.at_ms;
  const pass = JSON.stringify(states) === JSON.stringify(["accepted", "composing", "learning", "finalizing", "valid"])
    && observed.sequence.find((item) => item.state === "learning")?.resource_cards === 3
    && observed.sequence.find((item) => item.state === "finalizing")?.resource_cards === 3
    && observed.sequence.filter((item) => item.state !== "valid").every((item) => item.save_actions === 0)
    && await page.getByRole("button", { name: "收录到书架" }).isEnabled()
    && learningAt >= 1400 && finalAt - learningAt >= 2000
    && observed.elapsed_ms >= 5000 && observed.elapsed_ms <= 8000
    && await page.locator(".scenario-bar").getAttribute("open") === demoBefore
    && await page.evaluate(() => history.length) === historyBefore
    && errors.length === 0;
  await page.screenshot({ path: `${evidenceDir}01-create-auto-complete-1440.png`, fullPage: true });
  const result = { pass, errors, observed, historyBefore, historyAfter: await page.evaluate(() => history.length), demoOpen: await page.locator(".scenario-bar").getAttribute("open"), finalUrl: page.url() };
  await page.close();
  return result;
});

await record("cancel-stops-old-generation-and-restart-is-clean", async () => {
  const { page, errors } = await openPage("page=create&scenario=basic&event=0&status=0&lang=zh", { width: 390, height: 844 });
  await page.getByRole("button", { name: "生成短文" }).click();
  await page.waitForFunction(() => document.querySelector("#generation-status")?.dataset.state === "learning", null, { timeout: 4000 });
  await page.getByRole("button", { name: "取消生成" }).click();
  const cancelledAt = Date.now();
  await page.waitForTimeout(4300);
  const afterOldDeadline = await page.locator("#generation-status").getAttribute("data-state");
  const articleAfterCancel = await page.locator(".article-result").count();
  await page.getByRole("button", { name: "重新生成" }).click();
  const idleAfterRetry = await page.locator("#generation-status").getAttribute("data-state");
  await page.getByRole("button", { name: "生成短文" }).click();
  const restarted = await observeStates(page, "#generation-status", "valid");
  const restartStates = restarted.sequence.map((item) => item.state);
  const pass = Date.now() - cancelledAt > 9000
    && afterOldDeadline === "cancelled" && articleAfterCancel === 0 && idleAfterRetry === "idle"
    && JSON.stringify(restartStates) === JSON.stringify(["accepted", "composing", "learning", "finalizing", "valid"])
    && errors.length === 0;
  await page.screenshot({ path: `${evidenceDir}02-create-restart-complete-390.png`, fullPage: true });
  const result = { pass, errors, afterOldDeadline, articleAfterCancel, idleAfterRetry, restarted };
  await page.close();
  return result;
});

await record("navigation-and-manual-step-stop-old-timer", async () => {
  const first = await openPage("page=create&scenario=basic&event=0&status=0&lang=zh");
  await first.page.getByRole("button", { name: "生成短文" }).click();
  await first.page.waitForFunction(() => document.querySelector("#generation-status")?.dataset.state === "composing", null, { timeout: 2500 });
  await first.page.getByRole("link", { name: "EN" }).click();
  await first.page.waitForLoadState("networkidle");
  await first.page.waitForTimeout(5600);
  const stateAfterNavigation = await first.page.locator("#generation-status").getAttribute("data-state");
  const errors = [...first.errors];
  await first.page.close();

  const second = await openPage("page=create&scenario=basic&event=0&status=0&lang=zh");
  await second.page.getByRole("button", { name: "生成短文" }).click();
  await second.page.locator(".scenario-bar summary").click();
  await second.page.getByRole("button", { name: "回放下一事件" }).click();
  const manualState = await second.page.locator("#generation-status").getAttribute("data-state");
  await second.page.waitForTimeout(5600);
  const stateAfterManualWait = await second.page.locator("#generation-status").getAttribute("data-state");
  errors.push(...second.errors);
  const pass = stateAfterNavigation === "composing" && manualState === "composing" && stateAfterManualWait === "composing" && errors.length === 0;
  const result = { pass, errors, stateAfterNavigation, manualState, stateAfterManualWait };
  await second.page.close();
  return result;
});

await record("enhanced-preview-normal-click-autoplays-and-qualifies-q02", async () => {
  const { page, errors } = await openPage("page=presets&mode=enhanced&event=0&status=0&lang=zh");
  const historyBefore = await page.evaluate(() => history.length);
  await page.getByRole("button", { name: "生成预览" }).click();
  const started = Date.now();
  const sequence = [];
  let previous = null;
  while (Date.now() - started < 9000) {
    const state = await page.locator("#preview-result").getAttribute("data-state");
    if (state !== previous) { sequence.push({ at_ms: Date.now() - started, state, cards: await page.locator("#preview-result .resource-card").count() }); previous = state; }
    if (state === "ready") break;
    await page.waitForTimeout(80);
  }
  const states = sequence.map((item) => item.state);
  const checkboxVisible = await page.locator("#publish-confirm").isVisible();
  const checkboxChecked = await page.locator("#publish-confirm").isChecked();
  const publishDisabled = await page.locator("#preset-publish").isDisabled();
  const pass = states[0] === "accepted" && states.includes("composing") && states.includes("learning") && states.includes("finalizing") && states.includes("validating") && states.at(-1) === "ready"
    && sequence.find((item) => item.state === "finalizing")?.cards === 3
    && Date.now() - started >= 5800 && Date.now() - started <= 8500
    && checkboxVisible && !checkboxChecked && publishDisabled
    && await page.evaluate(() => history.length) === historyBefore
    && errors.length === 0;
  await page.screenshot({ path: `${evidenceDir}03-preset-auto-q02-ready-1440.png`, fullPage: true });
  const result = { pass, errors, elapsed_ms: Date.now() - started, sequence, checkboxVisible, checkboxChecked, publishDisabled, historyBefore, historyAfter: await page.evaluate(() => history.length) };
  await page.close();
  return result;
});

report.summary = {
  passed: report.scenarios.filter((scenario) => scenario.pass).length,
  failed: report.scenarios.filter((scenario) => !scenario.pass).length,
  total: report.scenarios.length,
  screenshots: 3,
  syntheticPlaybackTimingMeasured: true,
  productionLatencyMeasured: false,
  modelOrProviderCalled: false,
};
await fs.writeFile(`${evidenceDir}M003-UI-05-R1-browser.json`, `${JSON.stringify(report, null, 2)}\n`);
await browser.close();
console.log(JSON.stringify(report.summary));
if (report.summary.failed) process.exitCode = 1;
