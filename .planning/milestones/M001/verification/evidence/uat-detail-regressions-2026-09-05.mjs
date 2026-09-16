import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { chromium } from "../../../../../frontend/node_modules/@playwright/test/index.mjs";

const baseURL = "http://localhost:6001";
const dir = dirname(fileURLToPath(import.meta.url));
const shots = join(dir, "screenshots", "uat-detail-regressions-2026-09-05");
mkdirSync(shots, { recursive: true });
const testedImage = execFileSync("docker", ["inspect", "wordweave_uat-frontend-1", "--format", "{{.Image}}"], { encoding: "utf8" }).trim();
const checks = [], observations = [];
const normalize = value => String(value).replace(/\s+/gu, " ").trim();
const text = async locator => normalize(await locator.innerText());
const record = (name, actual, expected) => checks.push({ name, actual, expected, status: JSON.stringify(actual) === JSON.stringify(expected) ? "PASS" : "FAIL" });
const ready = page => page.waitForFunction(() => document.documentElement.dataset.appReady === "true");
async function screenshot(page, name) { await page.screenshot({ path: join(shots, name + ".png"), fullPage: true }); }
async function prototype(browser, pageId, role, state, locale, viewport) {
  const context = await browser.newContext({ locale, viewport });
  const page = await context.newPage();
  await page.goto("http://localhost:6010/prototype/index.html?page=" + pageId + "&role=" + role + "&state=" + state + "&locale=" + locale);
  await page.locator("main").waitFor();
  await page.locator(".prototype-tools").evaluate(node => { node.style.display = "none"; });
  return { context, page };
}
async function accountStyle(page) {
  return page.locator(".danger-zone .card-subtitle").evaluate(node => {
    const style = getComputedStyle(node);
    return { color: style.color, fontSize: style.fontSize, lineHeight: style.lineHeight };
  });
}
async function dateMetrics(page) {
  return page.locator(".date-range .field").evaluateAll(fields => fields.map(field => {
    const input = field.querySelector("input"), r = input.getBoundingClientRect(), style = getComputedStyle(field);
    return { width: Math.round(r.width * 100) / 100, height: Math.round(r.height * 100) / 100, top: Math.round(r.top * 100) / 100, fieldMarginTop: style.marginTop };
  }));
}
const browser = await chromium.launch();
try {
  for (const role of ["learner", "admin"]) {
    const context = await browser.newContext({ baseURL, locale: "en-US" });
    const page = await context.newPage();
    let originalLocale;
    try {
      await page.goto("/login"); await ready(page);
      await page.locator('input[autocomplete="username"]').fill("uat_" + role);
      await page.locator('input[type="password"]').fill(role === "learner" ? "UatLearnerPass6000!" : "UatAdminPass6000!");
      await page.locator('form button[type="submit"]').click();
      await page.waitForURL(role === "admin" ? /\/admin\/models$/u : /\/library$/u);
      originalLocale = await page.locator(".locale-switch select").inputValue();
      for (const locale of ["en-US", "zh-CN"]) {
        if (await page.locator(".locale-switch select").inputValue() !== locale) {
          const saved = page.waitForResponse(r => r.url().endsWith("/me/ui-locale") && r.request().method() === "PUT");
          await page.locator(".locale-switch select").selectOption(locale);
          if ((await saved).status() !== 200) throw new Error("Fixture locale update failed");
        }
        for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
          await page.setViewportSize(viewport);
          const label = locale + "-" + viewport.width;
          if (role === "learner") {
            for (const item of [{ path: "/", id: "PAGE-001" }, { path: "/review", id: "PAGE-007" }, { path: "/account", id: "PAGE-009" }]) {
              const design = await prototype(browser, item.id, role, "default", locale, viewport);
              try {
                await page.goto(item.path); await ready(page);
                if (item.path === "/") {
                  record("Home learner review copy " + label, await text(page.locator('.hero-actions a[href="/review"]')), await text(design.page.locator('.hero-actions [data-value="PAGE-007"]')));
                } else if (item.path === "/review") {
                  await page.locator(".date-range").waitFor();
                  const actual = await dateMetrics(page), expected = await dateMetrics(design.page);
                  observations.push({ name: "date geometry " + label, actual, expected });
                  record("Review From/To equal input size " + label, actual.map(({ width, height }) => ({ width, height })), [0, 1].map(() => ({ width: actual[1].width, height: actual[1].height })));
                  record("Review date field spacing " + label, actual.map(x => x.fieldMarginTop), expected.map(x => x.fieldMarginTop));
                } else {
                  for (const selector of [".card-subtitle", ".card-body p"])
                    record("Delete account " + selector + " copy " + label, await text(page.locator(".danger-zone " + selector)), await text(design.page.locator(".danger-zone " + selector)));
                  record("Delete account subtitle style " + label, await accountStyle(page), await accountStyle(design.page));
                }
                await screenshot(page, "actual-" + item.id + "-" + label);
                await screenshot(design.page, "prototype-" + item.id + "-" + label);
              } finally { await design.context.close(); }
            }
          } else {
            const design = await prototype(browser, "PAGE-103", role, "detail", locale, viewport);
            try {
              await page.goto("/admin/users"); await ready(page);
              await page.locator('[role="search"] input').fill("uat_learner");
              await page.locator('[role="search"] button[type="submit"]').click();
              await page.locator(".admin-user-result").filter({ hasText: "uat_learner" }).locator(".button").click();
              await page.locator(".admin-user-detail-grid").waitFor();
              record("User detail keeps search " + label, await page.locator('[role="search"]').count(), await design.page.locator('[role="search"]').count());
              record("User detail back copy " + label, await text(page.locator(".admin-user-detail-toolbar .button")), await text(design.page.locator(".admin-user-detail-toolbar .button")));
              const subtitle = await text(page.locator(".admin-user-detail-grid > .card").first().locator(".card-subtitle"));
              observations.push({ name: "user detail date " + label, actual: subtitle, prototype: await text(design.page.locator(".admin-user-detail-grid > .card").first().locator(".card-subtitle")) });
              record("User detail ISO joined date " + label, /\d{4}-\d{2}-\d{2}$/u.test(subtitle), true);
              const library = page.locator(".admin-user-detail-grid > .card").nth(1);
              const designLibrary = design.page.locator(".admin-user-detail-grid > .card").nth(1);
              record("User Library subtitle " + label, await text(library.locator(".card-subtitle")), await text(designLibrary.locator(".card-subtitle")));
              record("User Library action " + label, await text(library.locator(".model-row .button").first()), await text(designLibrary.locator(".model-row .button").first()));
              await screenshot(page, "actual-user-detail-" + label);
              await screenshot(design.page, "prototype-user-detail-" + label);
              const detailPath = new URL(page.url()).pathname;
              await library.locator(".model-row .button").first().click();
              await designLibrary.locator(".model-row .button").first().click();
              await page.locator(".reading-passage").waitFor();
              await design.page.getByRole("dialog").waitFor();
              record("User batch opens dialog " + label, await page.locator("dialog[open]").count(), 1);
              observations.push({ name: "user batch navigation " + label, detailPath, afterOpenPath: new URL(page.url()).pathname, prototypeDialog: await text(design.page.getByRole("dialog")) });
              const density = await design.page.getByRole("dialog").evaluate(node => {
                const body = node.querySelector(".dialog-body");
                return [...body.children].map(child => {
                  const r = child.getBoundingClientRect(), s = getComputedStyle(child);
                  return { class: child.className, top: r.top, bottom: r.bottom, marginTop: s.marginTop, marginBottom: s.marginBottom };
                });
              });
              observations.push({ name: "rejected prototype dialog density " + label, density });
              await screenshot(page, "actual-user-batch-" + label);
              await screenshot(design.page, "prototype-user-batch-" + label);
            } finally { await design.context.close(); }
          }
        }
      }
    } catch (error) { checks.push({ name: role + " execution", status: "FAIL", error: String(error) }); }
    finally {
      if (originalLocale && await page.locator(".locale-switch select").count() && await page.locator(".locale-switch select").inputValue() !== originalLocale) {
        const saved = page.waitForResponse(r => r.url().endsWith("/me/ui-locale") && r.request().method() === "PUT");
        await page.locator(".locale-switch select").selectOption(originalLocale);
        await saved;
      }
      await context.close();
    }
  }
} finally { await browser.close(); }
const failures = checks.filter(c => c.status === "FAIL");
const result = { date: new Date().toISOString(), agent_name: "qa-quinn", tested_image: testedImage, verdict: failures.length ? "FAIL" : "PASS",
  totals: { checks: checks.length, passed: checks.length - failures.length, failed: failures.length }, checks, observations };
writeFileSync(join(dir, "uat-detail-regressions-2026-09-05-results.json"), JSON.stringify(result, null, 2) + "\n");
console.log(JSON.stringify({ verdict: result.verdict, totals: result.totals, failures }, null, 2));
if (failures.length) process.exitCode = 1;
