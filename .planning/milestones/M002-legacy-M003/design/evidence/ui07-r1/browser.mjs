import playwright from "../../../../../../frontend/node_modules/@playwright/test/index.js";
import fs from "node:fs/promises";

const { chromium } = playwright;
const root = "http://127.0.0.1:4174/M003/design/prototype/";
const evidenceDir = new URL("./", import.meta.url).pathname;
const browser = await chromium.launch({ headless: true });
const report = {
  version: "M003-UI-07-R1",
  sourceBackend: "M003-BE-05-R1",
  contractVersion: "m003-stream-v5",
  scope: "planning display retention only",
  browser: "Chromium",
  scenarios: [],
  summary: {},
};
const assert = (condition, message) => { if (!condition) throw new Error(message); };

async function openPage(query, viewport = { width: 1440, height: 1000 }) {
  const page = await browser.newPage({ viewport, reducedMotion: "reduce" });
  const errors = [];
  page.on("console", (message) => message.type() === "error" && errors.push(`console:${message.text()}`));
  page.on("pageerror", (error) => errors.push(`page:${error.message}`));
  await page.goto(`${root}?rev=ui07-r1&${query}`, { waitUntil: "networkidle" });
  return { page, errors };
}

async function waitState(page, selector, state, timeout = 12000) {
  await page.waitForFunction(([target, wanted]) => document.querySelector(target)?.dataset.state === wanted, [selector, state], { timeout });
}

async function record(name, run) {
  const item = { name, pass: false, errors: [] };
  try {
    Object.assign(item, await run());
    item.pass = true;
  } catch (error) {
    item.errors.push(error.stack || error.message);
  }
  report.scenarios.push(item);
}

async function createRetention(name, viewport, screenshot, eventCheckpoint = 20) {
  const { page, errors } = await openPage(`page=create&scenario=${name}&event=0&status=0&lang=zh`, viewport);
  await page.locator('[data-action="generate"]').click();
  await page.waitForFunction(() => document.querySelectorAll("#planning-preview .plan-item").length === 4);
  const planHandle = await page.locator("#planning-preview").elementHandle();
  await page.waitForSelector(".live-draft-text");
  const firstDraft = await page.locator(".live-draft-text").textContent();
  assert(await page.locator("#planning-preview .plan-item").count() === 4, `${name} removed Plan on first edit`);
  assert(await page.evaluate((node) => node === document.querySelector("#planning-preview"), planHandle), `${name} rebuilt the Plan on first edit`);
  await page.waitForFunction((event) => Number(new URL(location.href).searchParams.get("event") || 0) >= event, eventCheckpoint, { timeout: 10000 });
  assert(await page.locator("#planning-preview .plan-item").count() === 4, `${name} removed Plan during editing`);
  assert(await page.evaluate((node) => node === document.querySelector("#planning-preview"), planHandle), `${name} rebuilt the Plan during editing`);
  if (screenshot) await page.screenshot({ path: `${evidenceDir}/${screenshot}`, fullPage: true });
  await waitState(page, "#generation-status", "valid", 12000);
  assert(await page.locator("#planning-preview").count() === 0, `${name} retained provisional Plan after authoritative valid`);
  assert(await page.locator('[data-action="save-story"]').count() === 1, `${name} final result is not saveable`);
  assert(errors.length === 0, errors.join("; "));
  const output = { name, firstDraftChars: firstDraft.length, checkpointEvent: eventCheckpoint, finalPlanCount: 0, errors };
  await page.close();
  return output;
}

await record("normal-and-enhanced-drafts-retain-plan", async () => {
  const [basic, enhanced] = await Promise.all([
    createRetention("basic", { width: 1000, height: 820 }, null, 18),
    createRetention("rewrite-once", { width: 1440, height: 1000 }, "01-create-plan-with-rewrite-1440.png", 47),
  ]);
  return { runs: [basic, enhanced] };
});

await record("q02-recovery-retains-plan-until-valid-on-mobile", async () => {
  const { page, errors } = await openPage("page=create&scenario=rewrite-recovery&event=0&status=0&lang=zh", { width: 390, height: 844 });
  await page.locator('[data-action="generate"]').click();
  await page.waitForFunction(() => document.querySelectorAll("#planning-preview .plan-item").length === 4);
  const planHandle = await page.locator("#planning-preview").elementHandle();
  await page.waitForFunction(() => Number(new URL(location.href).searchParams.get("event") || 0) >= 57, null, { timeout: 12000 });
  assert(await page.locator("#planning-preview .plan-item").count() === 4, "Q02 recovery removed Plan during the partial replacement");
  assert(await page.locator(".live-draft-text").count() === 1, "Q02 recovery has no live draft beside Plan");
  assert(await page.evaluate((node) => node === document.querySelector("#planning-preview"), planHandle), "Q02 recovery rebuilt the Plan");
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), "390px Plan + draft layout overflows horizontally");
  await page.screenshot({ path: `${evidenceDir}/02-create-plan-with-recovery-390.png`, fullPage: true });
  await waitState(page, "#generation-status", "valid", 12000);
  assert(await page.locator("#planning-preview").count() === 0, "Q02 valid result retained provisional Plan");
  assert(await page.locator(".incomplete-note").count() === 1, "Q02 completion notice is missing");
  assert(errors.length === 0, errors.join("; "));
  await page.close();
  return { retainedThroughEvent: 57, finalPlanCount: 0, mobileOverflow: false, errors };
});

await record("pending-and-eof-keep-plan-until-authoritative-result", async () => {
  const pending = await openPage("page=create&scenario=pending-status&event=0&status=0&lang=zh", { width: 900, height: 760 });
  const eof = await openPage("page=create&scenario=eof-unknown&event=0&status=0&lang=zh", { width: 900, height: 760 });
  await Promise.all([pending.page.locator('[data-action="generate"]').click(), eof.page.locator('[data-action="generate"]').click()]);
  await Promise.all([waitState(pending.page, "#generation-status", "pending", 9000), waitState(eof.page, "#generation-status", "pending", 9000)]);
  const pendingDuring = await pending.page.locator("#planning-preview .plan-item").count();
  const eofDuring = await eof.page.locator("#planning-preview .plan-item").count();
  assert(pendingDuring === 4, "settlement pending removed Plan");
  assert(eofDuring === 4 && await eof.page.locator(".live-draft-text").count() === 1, "EOF did not keep Plan with its read-only draft");
  assert(await eof.page.locator('[data-action="save-story"]').count() === 0, "EOF exposed save");
  await waitState(pending.page, "#generation-status", "valid", 10000);
  assert(await pending.page.locator("#planning-preview").count() === 0, "status valid retained Plan");
  assert(pending.errors.length === 0 && eof.errors.length === 0, [...pending.errors, ...eof.errors].join("; "));
  const result = { pendingPlanItems: pendingDuring, eofPlanItems: eofDuring, statusValidPlanCount: 0, errors: [...pending.errors, ...eof.errors] };
  await Promise.all([pending.page.close(), eof.page.close()]);
  return result;
});

await record("failure-and-cancel-clear-plan", async () => {
  const names = ["planning-fails", "invalid-first-edit-fails"];
  const runs = await Promise.all(names.map(async (name) => {
    const opened = await openPage(`page=create&scenario=${name}&event=0&status=0&lang=zh`, { width: 900, height: 760 });
    await opened.page.locator('[data-action="generate"]').click();
    await waitState(opened.page, "#generation-status", "failed", 9000);
    const result = { name, plan: await opened.page.locator("#planning-preview").count(), draft: await opened.page.locator(".live-draft-text").count(), errors: opened.errors };
    assert(result.plan === 0 && result.draft === 0, `${name} retained temporary Plan or draft`);
    await opened.page.close();
    return result;
  }));
  const cancelled = await openPage("page=create&scenario=rewrite-once&event=0&status=0&lang=zh", { width: 900, height: 760 });
  await cancelled.page.locator('[data-action="generate"]').click();
  await cancelled.page.waitForSelector(".live-draft-text");
  await cancelled.page.locator('[data-action="cancel-generation"]').click();
  await waitState(cancelled.page, "#generation-status", "cancelled");
  const cancelResult = { plan: await cancelled.page.locator("#planning-preview").count(), draft: await cancelled.page.locator(".live-draft-text").count(), errors: cancelled.errors };
  assert(cancelResult.plan === 0 && cancelResult.draft === 0, "cancel retained temporary Plan or draft");
  assert([...runs.flatMap((run) => run.errors), ...cancelled.errors].length === 0, "browser errors occurred");
  await cancelled.page.close();
  return { runs, cancelled: cancelResult };
});

await record("both-preview-modes-retain-plan-until-qualified-result", async () => {
  const modes = ["basic", "enhanced"];
  const runs = await Promise.all(modes.map(async (mode) => {
    const opened = await openPage(`page=presets&mode=${mode}&event=0&status=0&lang=zh`, { width: 1280, height: 900 });
    await opened.page.locator('[data-action="generate-preview"]').click();
    const wanted = mode === "basic" ? 3 : 4;
    await opened.page.waitForFunction((count) => document.querySelectorAll("#planning-preview .plan-item").length === count, wanted);
    const planHandle = await opened.page.locator("#planning-preview").elementHandle();
    await opened.page.waitForSelector(".live-draft-text");
    assert(await opened.page.locator("#planning-preview .plan-item").count() === wanted, `${mode} preview removed Plan on first edit`);
    assert(await opened.page.evaluate((node) => node === document.querySelector("#planning-preview"), planHandle), `${mode} preview rebuilt Plan on first edit`);
    if (mode === "enhanced") await opened.page.screenshot({ path: `${evidenceDir}/03-preview-plan-with-draft-1280.png`, fullPage: true });
    await waitState(opened.page, "#preview-result", "ready", 10000);
    assert(await opened.page.locator("#planning-preview").count() === 0, `${mode} qualified Result retained Plan`);
    assert(await opened.page.locator("#preset-publish").isEnabled(), `${mode} preview did not retain existing qualification behavior`);
    assert(opened.errors.length === 0, opened.errors.join("; "));
    const result = { mode, retainedItems: wanted, finalPlanCount: 0, publishEnabled: true, errors: opened.errors };
    await opened.page.close();
    return result;
  }));
  return { runs };
});

report.summary = {
  passed: report.scenarios.filter((item) => item.pass).length,
  failed: report.scenarios.filter((item) => !item.pass).length,
  total: report.scenarios.length,
  screenshots: 3,
  pageErrors: report.scenarios.flatMap((item) => item.errors).length,
  actualButtonPlayback: true,
  wireModified: false,
  modelOrProviderCalled: false,
  oldUi07SuiteRerun: false,
};
await fs.writeFile(`${evidenceDir}/M003-UI-07-R1-browser.json`, `${JSON.stringify(report, null, 2)}\n`);
await browser.close();
console.log(JSON.stringify(report.summary));
if (report.summary.failed) process.exitCode = 1;
