import { createRequire } from "node:module";
import { readFile, writeFile } from "node:fs/promises";
const require = createRequire(process.argv[2] + "/package.json");
const { chromium, expect, request } = require("@playwright/test");
const copy = JSON.parse(await readFile(new URL("../../../design/copy.json", import.meta.url), "utf8"));
const t = key => copy.static[`en.${key}`] ?? copy.templates[`en.${key}`];
const results = [], errors = [];
const origin = "http://127.0.0.1:3311";
const api = await request.newContext();
const browser = await chromium.launch();
try {
  await api.post("http://127.0.0.1:38080/api/v1/__test/admin-presets-reset");
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addCookies([{ name: "wordweave_session", value: "admin", url: origin }]);
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  page.on("pageerror", e => errors.push(e.message));
  let writes = [], generationCalls = 0;
  page.on("request", r => {
    if (r.method() === "PUT" && r.url().endsWith("/admin/presets/preset-admin")) writes.push(r.postDataJSON());
    if (r.url().includes("/stream")) generationCalls++;
  });
  await page.goto(origin + "/admin/presets");
  await page.waitForFunction(() => document.documentElement.dataset.appReady === "true");
  await page.getByRole("combobox", { name: t("wordsearch"), exact: true }).fill("according");
  await page.getByRole("option", { name: "according to", exact: true }).click();
  const saved = page.waitForResponse(r => r.request().method() === "PUT" && r.url().endsWith("/admin/presets/preset-admin"));
  await page.getByRole("button", { name: t("save.draft"), exact: true }).click();
  expect((await saved).status()).toBe(200);
  expect(writes).toHaveLength(1);
  expect(writes[0].configuration.entries).toEqual(["adapt", "according to"]);
  await expect(page.getByRole("button", { name: t("save.draft"), exact: true })).toBeEnabled();
  await page.reload();
  await page.waitForFunction(() => document.documentElement.dataset.appReady === "true");
  await expect(page.locator(".word-token")).toHaveText(["adapt", "according to"]);
  await expect(page.getByRole("button", { name: t("publish"), exact: true })).toBeDisabled();
  expect(generationCalls).toBe(0);
  results.push({ id: "QA30-S01", result: "PASS", entries: writes[0].configuration.entries, persistedAfterReload: true, generationCalls });
  expect(errors).toEqual([]);
  await context.close();
} catch (error) {
  results.push({ result: "FAIL", message: error.message });
  process.exitCode = 1;
} finally {
  await browser.close(); await api.dispose();
  await writeFile(new URL("results.json", import.meta.url), JSON.stringify({ origin, results, pageErrors: errors }, null, 2));
  console.log(JSON.stringify(results));
}
