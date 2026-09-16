import { chromium } from "../../../../../../frontend/node_modules/@playwright/test/index.mjs";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const browser = await chromium.launch();
const checks = [];
const results = [];
const record = (id, actual, expected) => checks.push({ id, status: JSON.stringify(actual) === JSON.stringify(expected) ? "PASS" : "FAIL", actual, expected });

async function measure(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  return page.getByRole("dialog").evaluate((dialog) => {
    const nodes = [...dialog.querySelectorAll(".field"), dialog.querySelector(".switch"), dialog.querySelector(".notice")];
    const boxes = nodes.map((node) => { const rect = node.getBoundingClientRect(); return { y: rect.y, height: rect.height }; });
    const gaps = boxes.slice(1).map((box, index) => Math.round(box.y - boxes[index].y - boxes[index].height));
    const style = getComputedStyle(nodes.at(-1));
    return { gaps, fontsStatus: document.fonts.status, fontFamily: style.fontFamily, fontSize: style.fontSize, lineHeight: style.lineHeight, devicePixelRatio, userAgent: navigator.userAgent, platform: navigator.platform };
  });
}

try {
  for (const [name, width, mobile] of [["desktop", 1280, false], ["mobile", 412, true]]) {
    const context = await browser.newContext({ viewport: { width, height: mobile ? 915 : 720 }, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: mobile ? 2.625 : 1 });
    const bootstrapResponse = await context.request.get("http://127.0.0.1:3300/api/v1/bootstrap");
    const bootstrap = await bootstrapResponse.json();
    const loginResponse = await context.request.post("http://127.0.0.1:3300/api/v1/auth/login", { headers: { origin: "http://127.0.0.1:6101", "sec-fetch-site": "same-origin", "x-csrf-token": bootstrap.data.csrf_token }, data: { username: "qa085_admin", password: "Qa085AdminSyntheticOnly!", browser_ui_locale: "en-US" } });
    record(`${name} real admin login`, loginResponse.status(), 200);
    const actual = await context.newPage();
    await actual.goto("http://127.0.0.1:3300/admin/models");
    await actual.waitForFunction(() => document.documentElement.dataset.appReady === "true");
    await actual.getByRole("button", { name: "Add model" }).click();

    const design = await context.newPage();
    await design.goto("http://127.0.0.1:6010/prototype/?page=PAGE-101&role=admin&state=default&locale=en-US");
    await design.locator('[data-action="add-model"]').click();
    const actualMetrics = await measure(actual);
    const designMetrics = await measure(design);
    results.push({ name, actual: actualMetrics, design: designMetrics });
    record(`${name} actual and approved design gaps`, actualMetrics.gaps, designMetrics.gaps);
    record(`${name} actual fonts loaded`, actualMetrics.fontsStatus, "loaded");
    record(`${name} design fonts loaded`, designMetrics.fontsStatus, "loaded");
    record(`${name} same browser platform`, [actualMetrics.userAgent, actualMetrics.platform], [designMetrics.userAgent, designMetrics.platform]);
    await actual.screenshot({ path: join(dir, `qa085-linux-${name}-model-dialog-actual.png`), fullPage: true });
    await design.screenshot({ path: join(dir, `qa085-linux-${name}-model-dialog-design.png`), fullPage: true });
    await context.close();
  }
} catch (error) {
  checks.push({ id: "Linux same-platform geometry execution", status: "ERROR", error: String(error?.stack || error) });
} finally {
  const counts = { PASS: 0, FAIL: 0, ERROR: 0 };
  for (const check of checks) counts[check.status] += 1;
  writeFileSync(join(dir, "linux-geometry-comparison-recheck.json"), JSON.stringify({ date: new Date().toISOString(), agent: "qa-quinn", browser: await browser.version(), counts, checks, results, oracle: "actual compared directly with approved prototype in the same context/platform; no fixed 23px expectation" }, null, 2), { flag: "wx" });
  await browser.close();
  console.log(JSON.stringify({ counts, results }));
  if (counts.FAIL || counts.ERROR) process.exitCode = 1;
}
