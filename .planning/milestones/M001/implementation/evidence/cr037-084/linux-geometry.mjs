import { chromium } from "../../../../../../frontend/node_modules/@playwright/test/index.mjs";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const browser = await chromium.launch();
const results = [];
async function measure(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  return page.getByRole("dialog").evaluate((dialog) => {
    const fields = [...dialog.querySelectorAll(".field")];
    const toggle = dialog.querySelector(".switch");
    const notice = dialog.querySelector(".notice");
    const boxes = [...fields, toggle, notice].map((node) => {
      const rect = node.getBoundingClientRect();
      return { y: rect.y, height: rect.height };
    });
    const gaps = boxes.slice(1).map((box, index) =>
      Math.round(box.y - boxes[index].y - boxes[index].height),
    );
    const style = getComputedStyle(notice);
    return {
      gaps,
      fontsStatus: document.fonts.status,
      fontFamily: style.fontFamily,
      fontSize: style.fontSize,
      lineHeight: style.lineHeight,
      devicePixelRatio,
      userAgent: navigator.userAgent,
      platform: navigator.platform,
    };
  });
}
for (const [name, width, mobile] of [
  ["desktop", 1280, false],
  ["mobile", 412, true],
]) {
  const context = await browser.newContext({
    viewport: { width, height: mobile ? 915 : 720 },
    isMobile: mobile,
    hasTouch: mobile,
    deviceScaleFactor: mobile ? 2.625 : 1,
  });
  const actual = await context.newPage();
  await context.addCookies([
    { name: "wordweave_session", value: "admin", url: "http://127.0.0.1:3300" },
    { name: "wordweave_ui_locale", value: "en-US", url: "http://127.0.0.1:3300" },
  ]);
  await actual.goto("http://127.0.0.1:3300/admin/models");
  await actual.waitForFunction(() => document.documentElement.dataset.appReady === "true");
  await actual.getByRole("button", { name: "Add model" }).click();
  const design = await context.newPage();
  await design.goto(
    "http://127.0.0.1:6010/prototype/?page=PAGE-101&role=admin&state=default&locale=en-US",
  );
  await design.locator('[data-action="add-model"]').click();
  results.push({ name, actual: await measure(actual), design: await measure(design) });
  await actual.screenshot({ path: join(dir, `linux-${name}-model-dialog-actual.png`), fullPage: true });
  await design.screenshot({ path: join(dir, `linux-${name}-model-dialog-design.png`), fullPage: true });
  await context.close();
}
writeFileSync(
  join(dir, "linux-geometry-comparison.json"),
  JSON.stringify({ date: new Date().toISOString(), browser: await browser.version(), results }, null, 2),
  { flag: "wx" },
);
await browser.close();
console.log(JSON.stringify(results));
