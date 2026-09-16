import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { chromium } from "../../../../../frontend/node_modules/@playwright/test/index.mjs";

const run = process.env.WORDWEAVE_QA_RUN ?? "before";
if (!["before", "after"].includes(run)) throw new Error("Invalid run");
const baseURL = "http://localhost:6001";
const image = execFileSync("docker", ["inspect", "wordweave_uat-frontend-1", "--format", "{{.Image}}"], { encoding: "utf8" }).trim();
const dir = dirname(fileURLToPath(import.meta.url));
const shots = join(dir, "screenshots", "cr028-locale-" + run);
mkdirSync(shots, { recursive: true });
const checks = [];
const record = (name, actual, expected) => checks.push({
  name, actual, expected, status: JSON.stringify(actual) === JSON.stringify(expected) ? "PASS" : "FAIL",
});
const browser = await chromium.launch();
const ready = page => page.waitForFunction(() => document.documentElement.dataset.appReady === "true");
async function login(page, role) {
  await page.goto("/login"); await ready(page);
  await page.locator('input[autocomplete="username"]').fill("uat_" + role);
  await page.locator('input[type="password"]').fill(role === "admin" ? "UatAdminPass6000!" : "UatLearnerPass6000!");
  await page.locator('form button[type="submit"]').click();
  await page.waitForURL(role === "admin" ? /\/admin\/models$/u : /\/library$/u);
}
async function saveLocale(page, locale) {
  const response = page.waitForResponse(r => r.url().endsWith("/me/ui-locale") && r.request().method() === "PUT");
  await page.locator(".locale-switch select").selectOption(locale);
  return (await response).status();
}
try {
  for (const role of ["admin", "learner"]) {
    const preparation = await browser.newContext({ baseURL, locale: "en-US", viewport: { width: 1440, height: 1000 } });
    const setup = await preparation.newPage();
    let original;
    try {
      await login(setup, role); await setup.reload(); await ready(setup);
      original = await setup.locator(".locale-switch select").inputValue();
      for (const locale of ["zh-CN", "en-US"]) {
        record(role + " save " + locale, await saveLocale(setup, locale), 200);
        const context = await browser.newContext({ baseURL, locale: locale === "zh-CN" ? "en-US" : "zh-CN", viewport: { width: 390, height: 844 } });
        try {
          const page = await context.newPage();
          await login(page, role);
          record(role + " " + locale + " destination", new URL(page.url()).pathname, role === "admin" ? "/admin/models" : "/library");
          record(role + " " + locale + " before reload", await page.locator("html").getAttribute("lang"), locale);
          record(role + " " + locale + " brand", (await page.locator(".brand-name").first().innerText()).trim(), locale === "zh-CN" ? "词涟" : "WordWeave");
          await page.screenshot({ path: join(shots, role + "-" + locale + ".png") });
          await page.reload(); await ready(page);
          record(role + " " + locale + " after reload", await page.locator("html").getAttribute("lang"), locale);
        } finally { await context.close(); }
      }
    } finally {
      if (original) record(role + " restore fixture locale", await saveLocale(setup, original), 200);
      await preparation.close();
    }
  }
} catch (error) { checks.push({ name: "execution", status: "FAIL", error: String(error) }); }
finally { await browser.close(); }
const failures = checks.filter(check => check.status === "FAIL");
const result = { date: new Date().toISOString(), agent_name: "qa-quinn", run, tested_image: image, verdict: failures.length ? "FAIL" : "PASS",
  totals: { checks: checks.length, passed: checks.length - failures.length, failed: failures.length }, checks };
writeFileSync(join(dir, "cr028-locale-" + run + "-results.json"), JSON.stringify(result, null, 2) + "\n");
console.log(JSON.stringify({ verdict: result.verdict, totals: result.totals, failures }, null, 2));
if (failures.length) process.exitCode = 1;
