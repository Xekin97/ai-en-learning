import playwright from "../../../../../../frontend/node_modules/@playwright/test/index.js";
import fs from "node:fs/promises";

const { chromium } = playwright;
const root = "http://127.0.0.1:4174/M003/design/prototype/";
const evidenceDir = new URL("./", import.meta.url).pathname;
const fixtureDir = new URL("../../../technical/fixtures/stream-v5/", import.meta.url);
const browser = await chromium.launch({ headless: true });
const only = new Set((process.env.UI07_ONLY ?? "").split(",").filter(Boolean));
const outputName = process.env.UI07_OUTPUT ?? "M003-UI-07-browser.json";
const report = {
  version: "M003-UI-07",
  fixtureVersion: "M003-BE-05",
  contractVersion: "m003-stream-v5",
  browser: "Chromium",
  scenarios: [],
  summary: {},
};
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const cpLength = (value) => Array.from(value ?? "").length;

async function fixture(name) {
  return JSON.parse(await fs.readFile(new URL(`${name}.json`, fixtureDir), "utf8"));
}

function terminalResult(value) {
  return value.wire.find((frame) => frame.event.endsWith(".validated"))?.data?.result;
}

async function openPage(query, viewport = { width: 1440, height: 1000 }) {
  const page = await browser.newPage({ viewport, reducedMotion: "reduce" });
  const errors = [];
  page.on("console", (message) => message.type() === "error" && errors.push(`console:${message.text()}`));
  page.on("pageerror", (error) => errors.push(`page:${error.message}`));
  await page.goto(`${root}?rev=ui07&${query}`, { waitUntil: "networkidle" });
  return { page, errors };
}

async function waitState(page, selector, state, timeout = 12000) {
  await page.waitForFunction(([target, wanted]) => document.querySelector(target)?.dataset.state === wanted, [selector, state], { timeout });
}

async function waitEvent(page, event, timeout = 12000) {
  await page.waitForFunction((wanted) => Number(new URL(location.href).searchParams.get("event") || 0) >= wanted, event, { timeout });
}

async function record(name, run) {
  if (only.size && !only.has(name)) return;
  const result = { name, pass: false, errors: [] };
  try {
    Object.assign(result, await run());
    result.pass = true;
  } catch (error) {
    result.errors.push(error.stack || error.message);
  }
  report.scenarios.push(result);
}

await record("enhanced-plan-folds-on-first-edit-and-fixed-edit-is-visible", async () => {
  const expected = await fixture("enhanced-edited-pass");
  const { page, errors } = await openPage("page=create&scenario=enhanced-edited-pass&event=0&status=0&lang=zh");
  const historyBefore = await page.evaluate(() => history.length);
  await page.evaluate(() => {
    window.__ui07Panel = document.querySelector("#generation-status");
    window.__ui07Settings = document.querySelector(".creation-panel");
  });
  await page.locator("#create-model").focus();
  await page.locator('[data-action="generate"]').click();
  await page.waitForFunction(() => document.querySelectorAll("#planning-preview .plan-item").length === 4);
  const plan = {
    count: await page.locator("#planning-preview .plan-item").count(),
    scene: await page.locator('[data-plan-kind="scene"]').textContent(),
    words: await page.locator('[data-plan-kind="word_use"] h3').allTextContents(),
    language: await page.locator("#planning-preview").getAttribute("data-plan-language"),
  };
  await page.screenshot({ path: `${evidenceDir}/01-create-plan-1440.png`, fullPage: true });
  await page.waitForSelector(".live-draft-text");
  assert(await page.locator("#planning-preview").count() === 0, "temporary Plan remained after the first body edit");
  const firstBody = await page.locator(".live-draft-text").textContent();
  assert(cpLength(firstBody) < cpLength(terminalResult(expected).passage), "the first visible body was reconstructed from the final package");
  const lengths = [];
  let sawDelete = false;
  while ((await page.locator("#generation-status").getAttribute("data-state")) !== "valid") {
    const draft = page.locator(".live-draft-text");
    if (await draft.count()) lengths.push(cpLength(await draft.textContent()));
    if ((await page.locator(".live-draft").getAttribute("data-edit-kind")) === "delete") {
      sawDelete = true;
      await page.screenshot({ path: `${evidenceDir}/02-create-fixed-edit-1440.png`, fullPage: true });
    }
    await page.waitForTimeout(25);
  }
  const finalText = await page.locator(".article-result .story-text").textContent();
  assert(plan.count === 4 && plan.words.join(",") === "garden,learn,share", "Plan did not show one scene plus three request entries");
  assert(plan.language === "en", "Plan meaning language did not come from the exact request");
  assert(sawDelete && lengths.some((length, index) => index > 0 && length < lengths[index - 1]), "fixed edit did not visibly retract text");
  assert(finalText === terminalResult(expected).passage, "final Result does not match the exact fixture package");
  assert(await page.locator('[data-action="save-story"]').count() === 1, "save was not enabled at authoritative valid");
  assert(await page.locator("mark").allTextContents().then((values) => values.join(",")) === "garden,learn,share", "final occurrences are not highlighted by code point");
  assert(await page.evaluate(() => window.__ui07Panel === document.querySelector("#generation-status")), "result panel was rebuilt during playback");
  assert(await page.evaluate(() => window.__ui07Settings === document.querySelector(".creation-panel")), "settings panel was rebuilt during playback");
  assert(await page.evaluate(() => history.length) === historyBefore, "autoplay grew browser history");
  assert(await page.locator(".scenario-bar").evaluate((node) => !node.open), "normal generation opened the demo panel");
  assert(errors.length === 0, errors.join("; "));
  await page.close();
  return { plan, firstBodyCodepoints: cpLength(firstBody), distinctDraftLengths: new Set(lengths).size, sawDelete, finalCodepoints: cpLength(finalText), errors };
});

await record("basic-still-plans-without-a-rewrite", async () => {
  const { page, errors } = await openPage("page=create&scenario=basic&event=0&status=0&lang=zh", { width: 1000, height: 820 });
  await page.locator('[data-action="generate"]').click();
  await page.waitForFunction(() => document.querySelectorAll("#planning-preview .plan-item").length === 4);
  const planningItems = await page.locator("#planning-preview .plan-item").count();
  await waitState(page, "#generation-status", "valid", 7000);
  assert(await page.locator('[data-action="save-story"]').count() === 1, "basic valid result was not saveable");
  assert(await page.locator("body").textContent().then((text) => !text.includes("第 1") && !text.includes("轮")), "internal rounds leaked into the product UI");
  assert(errors.length === 0, errors.join("; "));
  await page.close();
  return { planningItems, errors };
});

await record("recovery-q02-restores-authoritative-draft", async () => {
  const expected = await fixture("rewrite-recovery");
  const { page, errors } = await openPage("page=create&scenario=rewrite-recovery&event=0&status=0&lang=zh", { width: 390, height: 844 });
  await page.locator('[data-action="generate"]').click();
  const lengths = [];
  while ((await page.locator("#generation-status").getAttribute("data-state")) !== "valid") {
    const draft = page.locator(".live-draft-text");
    if (await draft.count()) lengths.push(cpLength(await draft.textContent()));
    await page.waitForTimeout(30);
  }
  const finalText = await page.locator(".article-result .story-text").textContent();
  assert(lengths.some((length, index) => index > 0 && length < lengths[index - 1]), "recovery scenario never visibly retracted or replaced text");
  assert(finalText === terminalResult(expected).passage, "recovery did not end at the authoritative retained package");
  assert(await page.locator(".incomplete-note").textContent().then((text) => text.includes("内容审校未完成")), "Q02 notice is missing");
  assert(await page.locator('[data-action="save-story"]').count() === 1, "Q02 valid result is not saveable");
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), "mobile page overflows horizontally");
  await page.screenshot({ path: `${evidenceDir}/03-create-recovery-q02-390.png`, fullPage: true });
  assert(errors.length === 0, errors.join("; "));
  await page.close();
  return { distinctDraftLengths: new Set(lengths).size, finalCodepoints: cpLength(finalText), errors };
});

await record("planning-and-invalid-edit-failures-clear-temporary-content", async () => {
  const names = ["planning-fails", "invalid-first-edit-fails"];
  const runs = [];
  for (const name of names) {
    const { page, errors } = await openPage(`page=create&scenario=${name}&event=0&status=0&lang=zh`, { width: 900, height: 760 });
    await page.locator('[data-action="generate"]').click();
    if (name === "planning-fails") await page.waitForSelector("#planning-preview .plan-item");
    await waitState(page, "#generation-status", "failed", 7000);
    const result = {
      name,
      planItems: await page.locator("#planning-preview .plan-item").count(),
      drafts: await page.locator(".live-draft-text").count(),
      saves: await page.locator('[data-action="save-story"]').count(),
      errors,
    };
    assert(result.planItems === 0 && result.drafts === 0 && result.saves === 0, `${name} retained temporary content or save`);
    assert(errors.length === 0, errors.join("; "));
    runs.push(result);
    await page.close();
  }
  return { runs };
});

await record("invalid-first-edit-rescues-on-mobile-english", async () => {
  const { page, errors } = await openPage("page=create&scenario=invalid-first-edit-rescues&event=0&status=0&lang=en", { width: 390, height: 844 });
  await page.locator('[data-action="generate"]').click();
  await page.waitForFunction(() => document.querySelectorAll("#planning-preview .plan-item").length === 4);
  assert(await page.locator("#planning-preview").getAttribute("data-plan-language") === "ja", "meaning language was coupled to the English UI locale");
  await waitState(page, "#generation-status", "valid", 8000);
  assert(await page.locator('[data-action="save-story"]').count() === 1, "rescued valid result is not saveable");
  assert(await page.locator("body").textContent().then((text) => !text.includes("⟦")), "English copy key is missing");
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), "English mobile page overflows horizontally");
  await page.screenshot({ path: `${evidenceDir}/04-create-rescued-en-390.png`, fullPage: true });
  assert(errors.length === 0, errors.join("; "));
  await page.close();
  return { meaningLanguage: "ja", errors };
});

await record("both-preview-modes-use-their-own-wire-and-qualify", async () => {
  const results = [];
  for (const mode of ["basic", "enhanced"]) {
    const { page, errors } = await openPage(`page=presets&mode=${mode}&event=0&status=0&lang=zh`);
    await page.locator('[data-action="generate-preview"]').click();
    const expectedPlanItems = mode === "basic" ? 3 : 4;
    await page.waitForFunction((count) => document.querySelectorAll("#planning-preview .plan-item").length === count, expectedPlanItems);
    const planItems = await page.locator("#planning-preview .plan-item").count();
    const words = await page.locator(".selected-words .chip").allTextContents();
    const meaning = await page.locator(".preset-config-grid select").nth(3).inputValue();
    if (mode === "basic") await page.screenshot({ path: `${evidenceDir}/05-preview-basic-plan-1440.png`, fullPage: true });
    await page.waitForSelector(".live-draft-text");
    assert(await page.locator("#planning-preview").count() === 0, `${mode} preview Plan did not fold on first edit`);
    await waitState(page, "#preview-result", "ready", 9000);
    assert(new URL(page.url()).searchParams.get("qualified") === "1", `${mode} preview did not complete finite qualification`);
    assert(await page.locator("#preset-publish").isEnabled(), `${mode} qualified preview did not enable publish`);
    assert(words.length === (mode === "basic" ? 2 : 3), `${mode} preview words did not come from request.entries`);
    assert(errors.length === 0, errors.join("; "));
    results.push({ mode, planItems, words, meaning, qualified: true, errors });
    await page.close();
  }
  return { results };
});

await record("pending-eof-and-static-review-remain-read-only", async () => {
  const configs = [["pending-status", "valid"], ["eof-unknown", "pending"]];
  const results = [];
  for (const [name, expectedState] of configs) {
    const { page, errors } = await openPage(`page=create&scenario=${name}&event=0&status=0&lang=zh`, { width: 900, height: 760 });
    await page.locator('[data-action="generate"]').click();
    await waitState(page, "#generation-status", expectedState, 9000);
    const state = await page.locator("#generation-status").getAttribute("data-state");
    const save = await page.locator('[data-action="save-story"]').count();
    if (name === "pending-status") assert(state === "valid" && save === 1, "finite pending status did not resolve to valid");
    else assert(state === "pending" && save === 0 && await page.locator(".live-draft-text").count() === 1, "EOF unknown did not retain a read-only draft");
    assert(errors.length === 0, errors.join("; "));
    results.push({ name, state, save, errors });
    await page.close();
  }
  const staticPage = await openPage("page=create&scenario=enhanced-edited-pass&event=6&status=0&lang=zh", { width: 900, height: 760 });
  const before = staticPage.page.url();
  await staticPage.page.waitForTimeout(1200);
  assert(staticPage.page.url() === before, "static event>0 review URL started autoplay");
  await staticPage.page.close();
  return { results, staticReviewStayedAtEvent: 6 };
});

await record("cancel-restart-isolates-the-old-playback", async () => {
  const { page, errors } = await openPage("page=create&scenario=enhanced-edited-pass&event=0&status=0&lang=zh", { width: 1000, height: 780 });
  await page.locator('[data-action="generate"]').click();
  await waitEvent(page, 10);
  await page.locator('[data-action="cancel-generation"]').click();
  const cancelledUrl = page.url();
  await page.waitForTimeout(6800);
  assert(await page.locator("#generation-status").getAttribute("data-state") === "cancelled", "old timer polluted cancelled state");
  assert(page.url() === cancelledUrl, "old timer changed cancelled URL");
  await page.locator('[data-action="restart"]').click();
  await page.locator('[data-action="generate"]').click();
  await waitState(page, "#generation-status", "valid", 8000);
  assert(await page.locator('[data-action="save-story"]').count() === 1, "cancelled run could not restart cleanly");
  assert(errors.length === 0, errors.join("; "));
  await page.close();
  return { cancelledStayedStableMs: 6800, restarted: true, errors };
});

await record("plans-complete-fields-and-boundaries-remain", async () => {
  const results = [];
  for (const [limit, valid] of [["0", true], ["99", true], ["-1", false], ["100", false], ["1.5", false]]) {
    const { page, errors } = await openPage(`page=plans&plan=pro&limit=${limit}&adminState=edit&lang=zh`, { width: 1100, height: 800 });
    const actual = await page.locator(".plan-form").getAttribute("data-limit-valid") === "true";
    assert(actual === valid, `plan limit ${limit} boundary is wrong`);
    assert(await page.locator("#basic-correction-policy").textContent().then((text) => text.includes("2")), "read-only basic correction budget is missing");
    assert(await page.locator(".plan-existing-grid").count() === 1, "existing plan fields are missing");
    results.push({ limit, valid: actual, errors });
    await page.close();
  }
  return { results };
});

report.summary = {
  passed: report.scenarios.filter((item) => item.pass).length,
  failed: report.scenarios.filter((item) => !item.pass).length,
  total: report.scenarios.length,
  screenshots: 5,
  actualButtonPlayback: true,
  syntheticPlaybackTimingOnly: true,
  productionLatencyMeasured: false,
  modelOrProviderCalled: false,
  apiFixtureCheckerRerun: false,
};
await fs.writeFile(`${evidenceDir}/${outputName}`, `${JSON.stringify(report, null, 2)}\n`);
await browser.close();
console.log(JSON.stringify(report.summary));
if (report.summary.failed) process.exitCode = 1;
