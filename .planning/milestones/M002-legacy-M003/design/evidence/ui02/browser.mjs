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
    noTechnicalDraftCopy: !body.includes("待技术定稿"),
  };
  for (const [key, run] of Object.entries(assertions)) checks[key] = await run(page);
  if (screenshot) await page.screenshot({path:fileURLToPath(new URL(screenshot, output)), fullPage:true});
  results.push({name, query, viewport, screenshot, overflow, errors, checks, pass:Object.values(checks).every(Boolean)});
  await page.close();
}

await visit("basic-readonly", "page=plans&plan=basic&adminState=edit&lang=zh", {width:1440,height:1000}, "01-basic-readonly-1440.png", {
  basePolicyVisible: async (p) => (await p.locator("#basic-correction-policy").innerText()).includes("最多2次"),
  controlsLocked: async (p) => await p.locator("#content-review-switch").isDisabled() && await p.locator("#content-repair-limit").isDisabled() && await p.locator("#content-repair-limit").inputValue() === "0",
});
await visit("limit-zero-preview", "page=plans&plan=pro&limit=0&adminState=preview&lang=zh", {width:1440,height:1000}, "02-limit-zero-preview-1440.png", {
  linkedOff: async (p) => !(await p.locator("#content-review-switch").isChecked()) && await p.locator("#content-repair-limit").inputValue() === "0",
  impactAndSnapshot: async (p) => { const text = await p.locator("#change-preview").innerText(); return text.includes("关闭 · 0次") && text.includes("仅影响保存后受理的新请求") && text.includes("受理时快照"); },
});
await visit("limit-99-saved", "page=plans&plan=pro&limit=99&adminState=saved&lang=zh", {width:1440,height:1000}, "03-limit-99-saved-1440.png", {
  saved99: async (p) => await p.locator("#save-result").getAttribute("data-saved-limit") === "99" && (await p.locator("#save-result").innerText()).includes("最多99次"),
  switchOn: async (p) => await p.locator("#content-review-switch").isChecked(),
});
await visit("invalid-100-mobile", "page=plans&plan=pro&limit=100&adminState=edit&lang=zh", {width:390,height:844}, "04-invalid-100-390.png", {
  invalidExposed: async (p) => await p.locator("#content-repair-limit").getAttribute("aria-invalid") === "true" && await p.locator("#limit-error").isVisible(),
  previewDisabled: async (p) => await p.getByRole("button", {name:"预览差异"}).isDisabled(),
});
await visit("second-repair", "page=create&plan=pro&limit=2&stage=repair2&lang=zh", {width:1440,height:1000}, "05-second-repair-1440.png", {
  dynamicLimit: async (p) => await p.locator("#benefit-summary").getAttribute("data-limit") === "2" && (await p.locator("#benefit-summary").innerText()).includes("最多返修2次"),
  secondRound: async (p) => await p.locator("#generation-status").getAttribute("data-repair-count") === "2" && (await p.locator("#generation-status").innerText()).includes("第2次整稿返修"),
  noSaveDuringRepair: async (p) => await p.getByText("收录到书架", {exact:true}).count() === 0,
});
await visit("incomplete-valid-delivery", "page=create&plan=pro&limit=2&stage=incomplete&lang=zh", {width:390,height:844}, "06-incomplete-delivery-390.png", {
  warningPersists: async (p) => (await p.locator("#generation-status").innerText()).includes("生成完成；内容审校未完成") && (await p.locator("#generation-status").innerText()).includes("仍计1次生成"),
  saveAllowed: async (p) => await p.getByText("收录到书架", {exact:true}).isVisible(),
});
await visit("remote-local-conflict", "page=plans&plan=pro&limit=99&remote=2&adminState=conflict&lang=zh", {width:390,height:844}, "07-conflict-remote2-local99-390.png", {
  bothValues: async (p) => { const text = await p.locator("#version-conflict").innerText(); return text.includes("最多2次") && text.includes("最多99次") && text.includes("未发生部分保存"); },
});
await visit("preset-incomplete-fixed-one", "page=presets&mode=enhanced&previewState=incomplete&lang=zh", {width:390,height:844}, "08-preset-incomplete-390.png", {
  fixedOne: async (p) => { const text = await p.locator("#preview-mode").innerText(); return text.includes("固定最多1次") && text.includes("不读取或模拟 Pro/Plus"); },
  incompletePublishable: async (p) => await p.locator("#preview-result[data-state=incomplete]").isVisible() && await p.getByText("发布预设", {exact:true}).isVisible(),
});

await visit("boundary-and-terminal-structure", "page=create&plan=pro&limit=2&stage=complete&outcome=limit&lang=zh", {width:390,height:844}, null, {
  limitCompletesNormally: async (p) => (await p.locator("#generation-status").innerText()).includes("正常完成") && !(await p.locator("#generation-status").innerText()).includes("内容审校未完成") && await p.getByText("收录到书架", {exact:true}).isVisible(),
});

const boundaryPage = await browser.newPage({viewport:{width:390,height:844}});
const boundaryChecks = {};
for (const value of ["-1", "1.5", ""]) {
  await boundaryPage.goto(`${base}?page=plans&plan=pro&limit=${encodeURIComponent(value)}&adminState=edit&lang=zh`, {waitUntil:"networkidle"});
  boundaryChecks[`reject_${value || "empty"}`] = await boundaryPage.locator("#content-repair-limit").getAttribute("aria-invalid") === "true" && await boundaryPage.locator("#limit-error").isVisible();
}
await boundaryPage.goto(`${base}?page=plans&plan=pro&limit=0&adminState=edit&lang=zh`, {waitUntil:"networkidle"});
await boundaryPage.locator("#content-review-switch").click();
await boundaryPage.waitForURL(/limit=1/);
boundaryChecks.switchFromZeroUsesOne = await boundaryPage.locator("#content-repair-limit").inputValue() === "1";
await boundaryPage.goto(`${base}?page=create&plan=pro&stage=failure&lang=zh`, {waitUntil:"networkidle"});
boundaryChecks.failureHasNoSave = await boundaryPage.getByText("收录到书架", {exact:true}).count() === 0;
await boundaryPage.goto(`${base}?page=create&plan=pro&stage=pending&lang=zh`, {waitUntil:"networkidle"});
boundaryChecks.pendingHasNoSave = await boundaryPage.getByText("收录到书架", {exact:true}).count() === 0;
results.push({name:"boundary-interactions", query:"multiple", viewport:{width:390,height:844}, errors:[], checks:boundaryChecks, pass:Object.values(boundaryChecks).every(Boolean)});
await boundaryPage.close();

await browser.close();
await fs.writeFile(new URL("M003-UI-02-browser.json", output), JSON.stringify({version:"M003-UI-02", browser:"Chromium via Playwright 1.62.1", runAt:new Date().toISOString(), results, screenshotCount:results.filter((item) => item.screenshot).length, pass:results.every((item) => item.pass)}, null, 2));
if (!results.every((item) => item.pass)) process.exitCode = 1;
