import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "../../../../../../frontend/node_modules/@playwright/test/index.mjs";

const base = "http://127.0.0.1:4174/M003/design/prototype/";
const output = new URL("./", import.meta.url);
const browser = await chromium.launch({headless:true});
const results = [];

async function visit(name, query, viewport, screenshot, assertions) {
  const page = await browser.newPage({viewport});
  const errors = [];
  page.on("console", (message) => message.type() === "error" && errors.push(message.text()));
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${base}?${query}`, {waitUntil:"networkidle"});
  await page.locator("#app[aria-busy=false]").waitFor();
  const overflow = await page.evaluate(() => ({width:innerWidth, scrollWidth:document.documentElement.scrollWidth}));
  const body = await page.locator("body").innerText();
  const checks = {
    noConsoleErrors: errors.length === 0,
    noMissingCopy: !body.includes("⟦"),
    noHorizontalOverflow: overflow.scrollWidth <= overflow.width + 1,
  };
  for (const [key, run] of Object.entries(assertions)) checks[key] = await run(page);
  if (screenshot) await page.screenshot({path:fileURLToPath(new URL(screenshot, output)), fullPage:true});
  results.push({name, query, viewport, screenshot, overflow, errors, checks, pass:Object.values(checks).every(Boolean)});
  await page.close();
}

await visit("generation-recheck-available-zh", "page=create&plan=pro&stage=pending&recheck=available&lang=zh", {width:390,height:844}, "01-generation-recheck-available-390.png", {
  pendingCopyReused: async (p) => (await p.locator("#generation-status").innerText()).includes("结算或最终状态尚未确认"),
  actionAvailable: async (p) => await p.locator("#generation-recheck").innerText() === "重新核对" && !(await p.locator("#generation-recheck").isDisabled()) && await p.locator("#generation-recheck").getAttribute("data-recheck-state") === "available",
  noSave: async (p) => await p.getByText("收录到书架", {exact:true}).count() === 0,
});

await visit("generation-recheck-checking-zh", "page=create&plan=pro&stage=pending&recheck=checking&lang=zh", {width:390,height:844}, "02-generation-recheck-checking-390.png", {
  actionBusy: async (p) => await p.locator("#generation-recheck").innerText() === "核对中…" && await p.locator("#generation-recheck").isDisabled() && await p.locator("#generation-recheck").getAttribute("aria-busy") === "true",
  stillPending: async (p) => await p.locator("#generation-status").getAttribute("data-stage") === "pending",
  noSave: async (p) => await p.getByText("收录到书架", {exact:true}).count() === 0,
});

await visit("preset-recheck-available-zh", "page=presets&mode=enhanced&previewState=pending&recheck=available&lang=zh", {width:1440,height:1000}, "03-preset-recheck-available-1440.png", {
  pendingCopyReused: async (p) => (await p.locator("#preview-result").innerText()).includes("结算或最终状态尚未确认"),
  actionAvailable: async (p) => await p.locator("#preset-recheck").innerText() === "重新核对" && !(await p.locator("#preset-recheck").isDisabled()),
  publishDisabled: async (p) => await p.locator("#preset-publish").isDisabled(),
});

await visit("preset-recheck-checking-zh", "page=presets&mode=enhanced&previewState=pending&recheck=checking&lang=zh", {width:1440,height:1000}, "04-preset-recheck-checking-1440.png", {
  actionBusy: async (p) => await p.locator("#preset-recheck").innerText() === "核对中…" && await p.locator("#preset-recheck").isDisabled() && await p.locator("#preset-recheck").getAttribute("aria-busy") === "true",
  stillPending: async (p) => await p.locator("#preview-result").getAttribute("data-state") === "pending",
  publishDisabled: async (p) => await p.locator("#preset-publish").isDisabled(),
});

await visit("generation-recheck-copy-en", "page=create&plan=pro&stage=pending&recheck=available&lang=en", {width:390,height:844}, null, {
  englishAction: async (p) => await p.locator("#generation-recheck").innerText() === "Check again",
  englishPending: async (p) => (await p.locator("#generation-status").innerText()).includes("Settlement or final status is not confirmed"),
});

await visit("preset-recheck-copy-en", "page=presets&mode=enhanced&previewState=pending&recheck=available&lang=en", {width:390,height:844}, null, {
  englishAction: async (p) => await p.locator("#preset-recheck").innerText() === "Check again",
  publishDisabled: async (p) => await p.locator("#preset-publish").isDisabled(),
});

const clickPage = await browser.newPage({viewport:{width:390,height:844}});
const clickErrors = [];
clickPage.on("console", (message) => message.type() === "error" && clickErrors.push(message.text()));
clickPage.on("pageerror", (error) => clickErrors.push(error.message));
await clickPage.goto(`${base}?page=create&plan=pro&stage=pending&recheck=available&lang=zh`, {waitUntil:"networkidle"});
await clickPage.locator("#generation-recheck").click();
await clickPage.waitForURL(/recheck=checking/);
const clickChecks = {
  noConsoleErrors: clickErrors.length === 0,
  sameRunState: new URL(clickPage.url()).searchParams.get("stage") === "pending",
  checkingAfterClick: await clickPage.locator("#generation-recheck").isDisabled() && await clickPage.locator("#generation-recheck").getAttribute("data-recheck-state") === "checking",
};
results.push({name:"recheck-click-transition", query:"generation available → checking", viewport:{width:390,height:844}, screenshot:null, errors:clickErrors, checks:clickChecks, pass:Object.values(clickChecks).every(Boolean)});
await clickPage.close();

await browser.close();
const report = {
  version:"M003-UI-03",
  source:"CR-301",
  browser:"Chromium via Playwright 1.62.1",
  runAt:new Date().toISOString(),
  results,
  screenshotCount:results.filter((item) => item.screenshot).length,
  pass:results.every((item) => item.pass),
};
await fs.writeFile(new URL("M003-UI-03-browser.json", output), JSON.stringify(report, null, 2));
if (!report.pass) process.exitCode = 1;
