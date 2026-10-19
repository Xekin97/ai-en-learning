import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "../../../../../frontend/node_modules/@playwright/test/index.mjs";

const base = "http://127.0.0.1:4174/M003/design/prototype/";
const output = new URL("./", import.meta.url);
const browser = await chromium.launch({headless: true});
const results = [];

async function check(name, query, viewport, screenshot, assertions) {
  const page = await browser.newPage({viewport});
  const errors = [];
  page.on("console", (message) => message.type() === "error" && errors.push(message.text()));
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${base}?${query}`, {waitUntil: "networkidle"});
  await page.locator("#app[aria-busy=false]").waitFor();
  const overflow = await page.evaluate(() => ({width: innerWidth, scrollWidth: document.documentElement.scrollWidth}));
  const missingCopy = await page.locator("body").innerText().then((text) => text.includes("⟦"));
  const checks = {noConsoleErrors: errors.length === 0, noMissingCopy: !missingCopy, noHorizontalOverflow: overflow.scrollWidth <= overflow.width + 1};
  for (const [key, run] of Object.entries(assertions)) checks[key] = await run(page);
  await page.screenshot({path: fileURLToPath(new URL(screenshot, output)), fullPage: true});
  results.push({name, query, viewport, screenshot, overflow, errors, checks, pass: Object.values(checks).every(Boolean)});
  await page.close();
}

async function interaction(name, query, run) {
  const page = await browser.newPage({viewport:{width:390,height:844}});
  const errors = [];
  page.on("console", (message) => message.type() === "error" && errors.push(message.text()));
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${base}?${query}`, {waitUntil:"networkidle"});
  const checks = await run(page);
  checks.noConsoleErrors = errors.length === 0;
  results.push({name, query, viewport:{width:390,height:844}, errors, checks, pass:Object.values(checks).every(Boolean)});
  await page.close();
}

await check("create-basic-desktop", "page=create&plan=basic&stage=idle&lang=zh", {width:1440,height:1000}, "01-create-basic-1440.png", {
  basicEntitlement: async (p) => await p.locator("#benefit-summary").getAttribute("data-enhanced") === "false",
  noReviewStage: async (p) => !(await p.locator("#generation-status").innerText()).includes("正在审稿"),
});
await check("create-review-desktop", "page=create&plan=pro&stage=review&lang=zh", {width:1440,height:1000}, "02-create-review-1440.png", {
  reviewVisible: async (p) => await p.locator("#generation-status").getAttribute("data-stage") === "review",
  saveHidden: async (p) => await p.getByText("收录到书架", {exact:true}).count() === 0,
});
await check("create-complete-mobile", "page=create&plan=pro&stage=complete&lang=zh", {width:390,height:844}, "03-create-complete-390.png", {
  saveVisible: async (p) => await p.getByText("收录到书架", {exact:true}).isVisible(),
  noPassedClaim: async (p) => !(await p.locator("body").innerText()).includes("审稿通过"),
});
await check("plans-preview-desktop", "page=plans&plan=pro&next=off&adminState=preview&lang=zh", {width:1440,height:1000}, "04-plans-preview-1440.png", {
  diffVisible: async (p) => await p.locator("#change-preview[data-state=preview]").isVisible(),
  snapshotCopy: async (p) => (await p.locator("#change-preview").innerText()).includes("已开始的请求继续使用受理时快照"),
});
await check("plans-conflict-mobile", "page=plans&plan=pro&next=off&adminState=conflict&lang=zh", {width:390,height:844}, "05-plans-conflict-390.png", {
  conflictAlert: async (p) => await p.locator("#version-conflict[role=alert]").isVisible(),
  preservesTwoValues: async (p) => {
    const text = await p.locator("#version-conflict").innerText();
    return text.includes("服务端最新值") && text.includes("开启 · 最多1次") && text.includes("本地未保存值") && text.includes("关闭 · 0次");
  },
});
await check("preset-enhanced-mobile", "page=presets&mode=enhanced&previewState=ready&lang=zh", {width:390,height:844}, "06-preset-enhanced-390.png", {
  enhancedSelected: async (p) => await p.locator('input[name="mode"][value="enhanced"]').isChecked(),
  readerBoundary: async (p) => (await p.locator("#preview-mode").innerText()).includes("不会把增强权益赠予读者"),
  currentModeReady: async (p) => await p.locator("#preview-result[data-state=ready]").isVisible(),
});

await interaction("controls-and-stale-state", "page=plans&plan=pro&next=on&adminState=edit&lang=zh", async (page) => {
  await page.locator("#content-review-switch").click();
  await page.waitForURL(/next=off/);
  const switchChanged = !(await page.locator("#content-review-switch").isChecked());
  await page.goto(`${base}?page=presets&mode=base&previewState=ready&lang=zh`, {waitUntil:"networkidle"});
  await page.locator('input[name="mode"][value="enhanced"]').click();
  await page.waitForURL(/mode=enhanced.*previewState=stale/);
  const modeInvalidatesPreview = await page.locator("#preview-result[data-state=stale]").isVisible();
  await page.keyboard.press("Shift+Tab");
  const keyboardFocusVisible = await page.evaluate(() => document.activeElement !== document.body);
  return {switchChanged, modeInvalidatesPreview, keyboardFocusVisible};
});

await browser.close();
await fs.writeFile(new URL("M003-UI-01-browser.json", output), JSON.stringify({browser:"Chromium via Playwright 1.62.1", runAt:new Date().toISOString(), results, pass:results.every((item) => item.pass)}, null, 2));
if (!results.every((item) => item.pass)) process.exitCode = 1;
