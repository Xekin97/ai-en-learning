import playwright from "../../../../../../frontend/node_modules/@playwright/test/index.js";
import fs from "node:fs/promises";

const { chromium } = playwright;

const root = "http://127.0.0.1:4174/M003/design/prototype/";
const evidenceDir = new URL("./", import.meta.url).pathname;
const browser = await chromium.launch({ headless: true });
const results = { version: "M003-UI-04", browser: "Chromium", scenarios: [], summary: {} };

async function check(name, query, viewport, assertions, screenshot) {
  const page = await browser.newPage({ viewport, reducedMotion: "reduce" });
  const errors = [];
  page.on("console", (message) => message.type() === "error" && errors.push(`console:${message.text()}`));
  page.on("pageerror", (error) => errors.push(`page:${error.message}`));
  await page.goto(`${root}?${query}`, { waitUntil: "networkidle" });
  const observed = {};
  for (const [key, fn] of Object.entries(assertions)) {
    try { observed[key] = await fn(page); }
    catch (error) { observed[key] = { pass: false, error: error.message }; }
  }
  const metrics = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: document.documentElement.clientWidth,
    missingCopy: document.body.innerText.includes("⟦"),
    title: document.title,
  }));
  if (screenshot) await page.screenshot({ path: `${evidenceDir}${screenshot}`, fullPage: true });
  const pass = errors.length === 0 && !metrics.missingCopy && metrics.documentWidth <= metrics.viewportWidth && Object.values(observed).every((item) => item.pass !== false);
  results.scenarios.push({ name, query, viewport, screenshot, pass, errors, metrics, observed });
  await page.close();
}

const visible = (selector) => async (page) => ({ pass: await page.locator(selector).isVisible(), selector });
const contains = (selector, text) => async (page) => ({ pass: (await page.locator(selector).innerText()).includes(text), selector, text });

await check("create-desktop-continuous-repair2", "page=create&plan=pro&limit=2&stage=idle&lang=zh", { width: 1440, height: 1000 }, {
  fullSettings: visible(".creation-panel #create-model"),
  wordPicker: visible("#word-search"),
  benefit: contains("#benefit-summary", "最多返修2次"),
  skipLinkHidden: async (page) => { const box = await page.locator(".skip-link").boundingBox(); return { pass: box !== null && box.y + box.height <= 0, box }; },
  interaction: async (page) => {
    await page.getByRole("button", { name: /生成短文/ }).click();
    const sequence = [];
    for (let i = 0; i < 6; i += 1) {
      sequence.push(await page.locator("#generation-status").getAttribute("data-stage"));
      if (sequence.at(-1) === "repair2") break;
      const next = page.getByRole("button", { name: /继续演示下一阶段/ });
      if (!(await next.isVisible().catch(() => false))) break;
      await next.click();
    }
    const targetHighlights = await page.locator(".article-result mark").count();
    const studyResources = await page.locator(".study-resources .resource-card").count();
    const skipBox = await page.locator(".skip-link").boundingBox();
    return { pass: sequence.includes("repair2") && targetHighlights >= 2 && studyResources === 2 && skipBox.y + skipBox.height <= 0, sequence, targetHighlights, studyResources, skipBox };
  },
}, "01-create-repair2-1440.png");

await check("create-mobile-incomplete-save", "page=create&plan=pro&limit=2&stage=incomplete&lang=zh", { width: 390, height: 844 }, {
  notice: contains("#generation-status", "内容审校未完成"),
  saveEnabled: async (page) => ({ pass: await page.getByRole("button", { name: "收录到书架" }).isEnabled() }),
}, "02-create-incomplete-390.png");

await check("plans-desktop-full-and-zero-preview", "page=plans&plan=pro&limit=0&adminState=preview&lang=zh", { width: 1440, height: 1000 }, {
  originalFields: visible(".existing-settings .plan-existing-grid"),
  twoBudgets: async (page) => ({ pass: await page.locator("#basic-correction-policy, #content-service").count() === 2 }),
  zeroOff: contains("#change-preview", "关闭 · 0次"),
  impact: contains("#change-preview", "仅影响保存后受理的新请求"),
}, "03-plans-zero-preview-1440.png");

await check("plans-mobile-conflict-local99-remote2", "page=plans&plan=pro&limit=99&adminState=conflict&remote=2&lang=zh", { width: 390, height: 844 }, {
  local: contains("#version-conflict", "最多99次"),
  remote: contains("#version-conflict", "最多2次"),
  preserve: contains("#version-conflict", "未发生部分保存"),
}, "04-plans-conflict-390.png");

await check("plan-boundaries-and-invalid", "page=plans&plan=pro&limit=100&adminState=edit&lang=en", { width: 768, height: 1024 }, {
  invalid100: async (page) => ({ pass: await page.locator("#content-repair-limit").getAttribute("aria-invalid") === "true" }),
  previewDisabled: async (page) => ({ pass: await page.getByRole("button", { name: "Preview changes" }).isDisabled() }),
  english: contains("h1", "Plan management"),
}, null);

await check("presets-desktop-incomplete-publish", "page=presets&mode=enhanced&previewState=incomplete&confirmed=1&lang=zh", { width: 1440, height: 1000 }, {
  fullEditor: visible(".preset-config-grid"),
  modeFixedOne: contains("#preview-mode", "最多1次"),
  notice: contains("#preview-result", "内容审校未完成"),
  publishEnabled: async (page) => ({ pass: await page.locator("#preset-publish").isEnabled() }),
}, "05-presets-incomplete-1440.png");

await check("presets-mobile-pending", "page=presets&mode=enhanced&previewState=pending&lang=zh", { width: 390, height: 844 }, {
  recheck: visible("#preset-recheck"),
  publishDisabled: async (page) => ({ pass: await page.locator("#preset-publish").isDisabled() }),
  pending: contains("#preview-result", "暂不开放保存"),
}, "06-presets-pending-390.png");

const boundaryContext = await browser.newPage({ viewport: { width: 1280, height: 800 } });
for (const value of ["0", "99", "-1", "100", "1.5", ""]) {
  await boundaryContext.goto(`${root}?page=plans&plan=pro&limit=${encodeURIComponent(value)}&adminState=edit&lang=zh`, { waitUntil: "networkidle" });
  results.scenarios.push({
    name: `limit-${value === "" ? "empty" : value}`,
    pass: (await boundaryContext.locator("#content-repair-limit").getAttribute("aria-invalid")) === (["0", "99"].includes(value) ? "false" : "true"),
    value,
  });
}
await boundaryContext.close();

results.summary = {
  passed: results.scenarios.filter((item) => item.pass).length,
  failed: results.scenarios.filter((item) => !item.pass).length,
  screenshotsSaved: results.scenarios.filter((item) => item.screenshot).length,
  modelViewed: 8,
};
await fs.writeFile(`${evidenceDir}M003-UI-04-browser.json`, `${JSON.stringify(results, null, 2)}\n`);
await browser.close();
if (results.summary.failed) process.exitCode = 1;
