import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { chromium } from "../../../../../frontend/node_modules/@playwright/test/index.mjs";
import AxeBuilder from "../../../../../frontend/node_modules/@axe-core/playwright/dist/index.js";

const baseURL = "http://localhost:6001";
const testedImage = "sha256:68470b6ea1e94dd7e83ed6028e28116bb0ef3abbe2d84a3a67f862f341e29804";
const dir = dirname(fileURLToPath(import.meta.url));
const shots = join(dir, "screenshots", "cr024-live-uat");
mkdirSync(shots, { recursive: true });
const checks = [];
const record = (name, actual, expected) => checks.push({
  name, actual, expected,
  status: JSON.stringify(actual) === JSON.stringify(expected) ? "PASS" : "FAIL",
});
const ready = page => page.waitForFunction(() => document.documentElement.dataset.appReady === "true");
const text = locator => locator.innerText().then(s => s.replace(/\s+/gu, " ").trim());
const browser = await chromium.launch();
try {
  record("UAT exact frontend image", execFileSync("docker", ["inspect", "wordweave_uat-frontend-1", "--format", "{{.Image}}"], { encoding: "utf8" }).trim(), testedImage);
  for (const service of ["frontend", "backend", "postgres"])
    record(service + " health", execFileSync("docker", ["inspect", "wordweave_uat-" + service + "-1", "--format", "{{.State.Health.Status}}"], { encoding: "utf8" }).trim(), "healthy");
  for (const path of ["/", "/api/v1/bootstrap"])
    record(path + " HTTP", (await fetch(baseURL + path)).status, 200);
  for (const locale of ["en-US", "zh-CN"]) {
    const context = await browser.newContext({ baseURL, locale, viewport: { width: 390, height: 844 } });
    try {
      const page = await context.newPage();
      for (const path of ["/review", "/library"]) {
        await page.goto(path); await ready(page);
        record(locale + " guest route " + path, new URL(page.url()).pathname, path);
        const gate = page.locator(".auth-gate");
        record(locale + " guest card " + path, await gate.count(), 1);
        record(locale + " guest registration " + path, await gate.locator('a[href*="/register"]').count(), 1);
        record(locale + " guest login " + path, await gate.locator('a[href*="/login"]').count(), 1);
        await page.screenshot({ path: join(shots, "guest-" + path.slice(1) + "-" + locale + ".png") });
      }
    } finally { await context.close(); }
  }
  const context = await browser.newContext({ baseURL, locale: "en-US", viewport: { width: 1440, height: 1000 } });
  try {
    const page = await context.newPage();
    await page.goto("/login"); await ready(page);
    await page.locator('input[autocomplete="username"]').fill("uat_admin");
    await page.locator('input[type="password"]').fill("WrongPasswordForUat!");
    await page.locator('form button[type="submit"]').click();
    await page.locator(".app-error").waitFor();
    record("Real invalid credentials structured notice", await page.locator(".app-error").evaluate(node => ({
      danger: node.classList.contains("notice-danger"),
      children: [...node.children].map(child => child.tagName.toLowerCase()),
      role: node.getAttribute("role"),
    })), { danger: true, children: ["svg", "div"], role: "alert" });
    record("Invalid login preserves username", await page.locator('input[autocomplete="username"]').inputValue(), "uat_admin");
    await page.screenshot({ path: join(shots, "login-error-en-US.png") });
    // Dedicated existing local UAT account; never a production/provider credential.
    await page.locator('input[type="password"]').fill(process.env.WORDWEAVE_UAT_ADMIN_PASSWORD ?? "UatAdminPass6000!");
    await page.locator('form button[type="submit"]').click();
    await page.waitForURL(/\/admin\/models$/u); await ready(page);
    const localeSelect = page.locator(".admin-account .locale-switch select");
    if (await localeSelect.inputValue() !== "en-US") {
      const saved = page.waitForResponse(r => r.url().endsWith("/me/ui-locale") && r.request().method() === "PUT");
      await localeSelect.selectOption("en-US");
      if ((await saved).status() !== 200) throw new Error("English UAT fixture preference not saved");
    }
    record("Real login destination", new URL(page.url()).pathname, "/admin/models");
    record("Models subtitle", await text(page.locator(".page-description")), "Manage your API key and available models.");
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
      for (const mode of ["add", "edit"]) {
        await page.locator(mode === "add" ? ".page-heading .button-primary" : ".model-row .button").first().click();
        const dialog = page.getByRole("dialog");
        record(width + " " + mode + " spacing", await dialog.evaluate(node => {
          const fields = [...node.querySelectorAll(".field")].map(el => el.getBoundingClientRect());
          const toggle = node.querySelector(".switch").getBoundingClientRect();
          const notice = node.querySelector(".notice").getBoundingClientRect();
          return [...fields.slice(1).map((rect, i) => Math.round(rect.top - fields[i].bottom)),
            Math.round(toggle.top - fields.at(-1).bottom), Math.round(notice.top - toggle.bottom)];
        }), [20, 20, 16, 23]);
        record(width + " " + mode + " fits viewport", await dialog.evaluate(node => {
          const r = node.getBoundingClientRect();
          return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight;
        }), true);
        record(width + " " + mode + " ID input background", await dialog.locator("input").nth(2).evaluate(node => getComputedStyle(node).backgroundColor), "rgb(255, 255, 255)");
        const axe = await new AxeBuilder({ page }).analyze();
        record(width + " " + mode + " Axe serious/critical", axe.violations.filter(v => ["serious", "critical"].includes(v.impact)).map(v => v.id), []);
        await page.screenshot({ path: join(shots, mode + "-" + width + ".png") });
        await dialog.locator(".dialog-footer button").first().click();
      }
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/admin/plans"); await ready(page);
    record("Plans subtitle", await text(page.locator(".page-description")), "Choose the models, lengths, and limits for each plan.");
    record("Guest plan visible", await page.getByText("Guest", { exact: true }).count() > 0, true);
    record("Plans approved quota copy", await page.getByText("Creations per 24 hours", { exact: true }).count() > 0, true);
    await page.screenshot({ path: join(shots, "plans-en-US.png") });
    await page.goto("/admin/users"); await ready(page);
    for (const username of ["uat_admin", "uat_learner"]) {
      await page.locator('[role="search"] input').fill(username);
      await page.locator('[role="search"] button[type="submit"]').click();
      const row = page.locator(".admin-user-result").filter({ hasText: username }).first();
      await row.waitFor();
      const plan = await text(row.locator(".admin-user-plan strong"));
      record(username + " plan", plan, username === "uat_admin" ? "—" : "Basic");
      record(username + " plan label", await text(row.locator(".admin-user-plan .helper")), "Plan");
      record(username + " date format", /Joined \d{4}-\d{2}-\d{2}$/u.test(await text(row.locator(".user-meta"))), true);
      record(username + " status and action", [await text(row.locator(".status-badge")), await text(row.locator(".button"))], ["Active", "View"]);
      await page.screenshot({ path: join(shots, "users-" + username + ".png") });
    }
  } finally { await context.close(); }
} catch (error) {
  checks.push({ name: "execution", status: "FAIL", error: String(error) });
} finally { await browser.close(); }
const failures = checks.filter(c => c.status === "FAIL");
const result = {
  date: new Date().toISOString(), agent_name: "qa-quinn", baseURL, tested_image: testedImage,
  verdict: failures.length ? "FAIL" : "PASS",
  totals: { checks: checks.length, passed: checks.length - failures.length, failed: failures.length }, checks,
};
writeFileSync(join(dir, "cr024-live-uat-smoke-results.json"), JSON.stringify(result, null, 2) + "\n");
console.log(JSON.stringify({ verdict: result.verdict, totals: result.totals, failures }, null, 2));
if (failures.length) process.exitCode = 1;
