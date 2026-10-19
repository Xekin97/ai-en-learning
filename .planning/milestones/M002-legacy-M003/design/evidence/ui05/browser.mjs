import playwright from "../../../../../../frontend/node_modules/@playwright/test/index.js";
import fs from "node:fs/promises";

const { chromium } = playwright;
const root = "http://127.0.0.1:4174/M003/design/prototype/";
const evidenceDir = new URL("./", import.meta.url).pathname;
const browser = await chromium.launch({ headless: true });
const results = { version: "M003-UI-05", fixtureVersion: "M003-BE-03", browser: "Chromium", scenarios: [], summary: {} };

const visible = (selector) => async (page) => ({ pass: await page.locator(selector).isVisible(), selector });
const hidden = (selector) => async (page) => ({ pass: !(await page.locator(selector).isVisible().catch(() => false)), selector });
const contains = (selector, value) => async (page) => ({ pass: (await page.locator(selector).innerText()).includes(value), selector, value });
const excludes = (selector, values) => async (page) => {
  const text = await page.locator(selector).innerText();
  return { pass: values.every((value) => !text.includes(value)), selector, values };
};

async function check(name, query, viewport, assertions, screenshot = null) {
  const page = await browser.newPage({ viewport, reducedMotion: "reduce" });
  const errors = [];
  page.on("console", (message) => message.type() === "error" && errors.push(`console:${message.text()}`));
  page.on("pageerror", (error) => errors.push(`page:${error.message}`));
  await page.goto(`${root}?${query}`, { waitUntil: "networkidle" });
  const observed = {};
  for (const [key, assertion] of Object.entries(assertions)) {
    try { observed[key] = await assertion(page); }
    catch (error) { observed[key] = { pass: false, error: error.message }; }
  }
  const metrics = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: document.documentElement.clientWidth,
    missingCopy: document.body.innerText.includes("⟦"),
    skipLinkBottom: (() => { const box = document.querySelector(".skip-link")?.getBoundingClientRect(); return box ? box.bottom : null; })(),
  }));
  if (screenshot) await page.screenshot({ path: `${evidenceDir}${screenshot}`, fullPage: true });
  const pass = errors.length === 0 && !metrics.missingCopy && metrics.documentWidth <= metrics.viewportWidth && metrics.skipLinkBottom <= 0 && Object.values(observed).every((item) => item.pass !== false);
  results.scenarios.push({ name, query, viewport, screenshot, pass, errors, metrics, observed });
  await page.close();
}

await check("create-initial-no-output", "page=create&scenario=basic&event=0&status=0&lang=zh", { width: 1440, height: 1000 }, {
  exactWords: async (page) => ({ pass: await page.locator(".selected-words .chip").allTextContents().then((x) => x.join(" ").includes("garden") && x.join(" ").includes("learn") && x.join(" ").includes("share")) }),
  noArticle: hidden(".article-result"),
  noSave: hidden('[data-action="save-story"]'),
  noEntitlementBanner: hidden("#benefit-summary"),
  fetchedIndexAndScenarios: async (page) => {
    const resources = await page.evaluate(() => performance.getEntriesByType("resource").map((entry) => entry.name));
    return { pass: resources.some((url) => url.endsWith("stream-v3/index.json")) && resources.filter((url) => /stream-v3\/.+\.json$/.test(url)).length >= 9, count: resources.filter((url) => url.includes("stream-v3/")).length };
  },
});

await check("create-accepted-then-composing", "page=create&scenario=basic&event=1&status=0&lang=zh", { width: 1440, height: 1000 }, {
  accepted: contains("#generation-status", "请求已受理"),
  noArticle: hidden(".article-result"),
  publicOnly: excludes("#generation-status", ["审稿", "返修", "/ 2", "百分比"]),
});

await check("create-learning-only-mobile", "page=create&scenario=basic&event=3&status=0&lang=zh", { width: 390, height: 844 }, {
  meanings: async (page) => ({ pass: await page.locator("#generation-status .resource-card").count() === 3 }),
  noArticle: hidden(".article-result"),
  noSave: hidden('[data-action="save-story"]'),
  noTags: hidden(".result-tags"),
}, "01-create-learning-390.png");

await check("create-finalizing-keeps-meanings", "page=create&scenario=basic&event=4&status=0&lang=zh", { width: 1440, height: 1000 }, {
  finalizing: contains("#generation-status", "正在完成"),
  meaningsStillVisible: async (page) => ({ pass: await page.locator("#generation-status .resource-card").count() === 3 }),
  noArticle: hidden(".article-result"),
  noSave: hidden('[data-action="save-story"]'),
}, "02-create-finalizing-1440.png");

await check("create-enhanced-v3-same-public-flow", "page=create&scenario=enhanced-two-repairs&event=5&status=0&lang=zh", { width: 1440, height: 1000 }, {
  complete: visible(".article-result"),
  targetHighlights: async (page) => ({ pass: await page.locator(".article-result mark").count() === 3 }),
  studyResources: async (page) => ({ pass: await page.locator(".study-resources .resource-card").count() === 3 }),
  finalV3Meaning: contains(".study-resources", "分享；分担"),
  noInternalRounds: excludes("#generation-status", ["审稿", "返修", "上限", "k/N", "2 / 2"]),
  saveEnabled: async (page) => ({ pass: await page.getByRole("button", { name: "收录到书架" }).isEnabled() }),
}, "03-create-final-v3-1440.png");

await check("create-q02-saveable-mobile", "page=create&scenario=incomplete-last-valid&event=5&status=0&lang=zh", { width: 390, height: 844 }, {
  notice: contains("#generation-status", "内容审校未完成"),
  article: visible(".article-result"),
  saveEnabled: async (page) => ({ pass: await page.getByRole("button", { name: "收录到书架" }).isEnabled() }),
}, "04-create-q02-390.png");

await check("pending-active-then-status-valid", "page=create&scenario=pending-resolves&event=5&status=0&lang=zh", { width: 1440, height: 1000 }, {
  finiteStatusFlow: async (page) => {
    const before = await page.locator("#generation-status").innerText();
    await page.getByRole("button", { name: "重新核对" }).click();
    const active = await page.locator("#generation-status").getAttribute("data-state");
    await page.getByRole("button", { name: "重新核对" }).click();
    const valid = await page.locator("#generation-status").getAttribute("data-state");
    const highlights = await page.locator(".article-result mark").count();
    return { pass: before.includes("正在核对") && active === "pending" && valid === "valid" && highlights === 3, active, valid, highlights };
  },
}, "05-create-pending-resolved-valid-1440.png");

await check("eof-unknown-and-failure-clear", "page=create&scenario=eof-unknown&event=3&status=1&lang=en", { width: 768, height: 1024 }, {
  eof: contains("#generation-status", "connection ended"),
  noSave: hidden('[data-action="save-story"]'),
  meaningsRetained: async (page) => ({ pass: await page.locator("#generation-status .resource-card").count() === 3 }),
  english: contains("h1", "Turn words into a story"),
});

await check("failed-and-cancelled-no-preview", "page=create&scenario=failed-no-valid&event=3&status=0&lang=zh", { width: 320, height: 700 }, {
  failed: contains("#generation-status", "生成失败"),
  noCards: async (page) => ({ pass: await page.locator("#generation-status .resource-card").count() === 0 }),
  noSave: hidden('[data-action="save-story"]'),
  cancelledAlsoClears: async (page) => {
    const other = await browser.newPage({ viewport: { width: 320, height: 700 } });
    await other.goto(`${root}?page=create&scenario=cancelled&event=4&status=0&lang=zh`, { waitUntil: "networkidle" });
    const state = await other.locator("#generation-status").getAttribute("data-state");
    const cards = await other.locator("#generation-status .resource-card").count();
    const save = await other.locator('[data-action="save-story"]').count();
    await other.close();
    return { pass: state === "cancelled" && cards === 0 && save === 0, state, cards, save };
  },
});

await check("plans-zero-99-and-invalid", "page=plans&plan=pro&limit=99&adminState=preview&lang=zh", { width: 1440, height: 1000 }, {
  fullFields: visible(".existing-settings"),
  twoBudgets: async (page) => ({ pass: await page.locator("#basic-correction-policy, #content-service").count() === 2 }),
  limit99: contains("#change-preview", "最多99次"),
  noTestPolicyInProductCard: excludes("#content-service", ["只验证", "不执行 99", "测试"]),
  boundaryOnlyInDemoLayer: async (page) => {
    const text = await page.locator(".scenario-bar").textContent();
    return { pass: text.includes("99 只检查字段与配置边界") };
  },
  zeroTurnsServiceOff: async (page) => {
    const other = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await other.goto(`${root}?page=plans&plan=pro&limit=0&adminState=preview&lang=zh`, { waitUntil: "networkidle" });
    const text = await other.locator("#change-preview").innerText();
    await other.close();
    return { pass: text.includes("关闭 · 0次") && text.includes("不再含 AI 内容审稿与返修") };
  },
}, "06-plans-99-1440.png");

await check("plans-invalid-and-conflict-mobile", "page=plans&plan=pro&limit=100&adminState=edit&lang=zh", { width: 390, height: 844 }, {
  invalid: async (page) => ({ pass: await page.locator("#content-repair-limit").getAttribute("aria-invalid") === "true" }),
  previewDisabled: async (page) => ({ pass: await page.getByRole("button", { name: "预览差异" }).isDisabled() }),
  switchToConflict: async (page) => {
    await page.goto(`${root}?page=plans&plan=pro&limit=99&adminState=conflict&remote=2&lang=zh`, { waitUntil: "networkidle" });
    const text = await page.locator("#version-conflict").innerText();
    return { pass: text.includes("最多2次") && text.includes("最多99次") };
  },
});

await check("preset-enhanced-q02-qualification", "page=presets&mode=enhanced&event=5&status=0&lang=zh", { width: 1440, height: 1000 }, {
  exactMode: async (page) => ({ pass: await page.locator('input[name="mode"][value="enhanced"]').isChecked() }),
  q02: contains("#preview-result", "内容审校未完成"),
  publishBlockedBeforeStatus: async (page) => ({ pass: await page.locator("#preset-publish").isDisabled() }),
  qualifyThenConfirm: async (page) => {
    await page.getByRole("button", { name: "核对发布资格" }).click();
    const beforeConfirm = await page.locator("#preset-publish").isDisabled();
    await page.locator("#publish-confirm").check();
    const afterConfirm = await page.locator("#preset-publish").isEnabled();
    return { pass: beforeConfirm && afterConfirm, beforeConfirm, afterConfirm };
  },
}, "07-presets-q02-1440.png");

await check("preset-basic-does-not-replay-enhanced", "page=presets&mode=base&event=0&status=0&lang=en", { width: 390, height: 844 }, {
  baseMode: async (page) => ({ pass: await page.locator('input[name="mode"][value="base"]').isChecked() }),
  noResult: hidden("#preview-result .article-result"),
  publishDisabled: async (page) => ({ pass: await page.locator("#preset-publish").isDisabled() }),
  demoScope: async (page) => {
    await page.getByRole("button", { name: "Generate preview" }).click();
    return { pass: await page.locator(".scenario-bar").getAttribute("open") !== null && (await page.locator(".scenario-bar").innerText()).includes("does not fabricate") };
  },
});

results.summary = {
  passed: results.scenarios.filter((scenario) => scenario.pass).length,
  failed: results.scenarios.filter((scenario) => !scenario.pass).length,
  total: results.scenarios.length,
  screenshots: results.scenarios.filter((scenario) => scenario.screenshot).length,
  timingMeasured: false,
  modelOrProviderCalled: false,
};
await fs.writeFile(`${evidenceDir}M003-UI-05-browser.json`, `${JSON.stringify(results, null, 2)}\n`);
await browser.close();
console.log(JSON.stringify(results.summary));
if (results.summary.failed) process.exitCode = 1;
