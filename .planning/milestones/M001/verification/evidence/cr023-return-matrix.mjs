import { mkdirSync } from "node:fs";
import { chromium } from "../../../../../frontend/node_modules/@playwright/test/index.mjs";

const baseURL = process.env.WORDWEAVE_BASE_URL ?? "http://localhost:6001";
const query = process.env.WORDWEAVE_AUDIT_QUERY;
const adminUsername = process.env.WORDWEAVE_ADMIN_USERNAME ?? "uat_admin";
const adminPassword =
  process.env.WORDWEAVE_ADMIN_PASSWORD ?? "UatAdminPass6000!";
const headers = { origin: baseURL, "sec-fetch-site": "same-origin" };
const screenshotRoot = new URL("./screenshots/cr023-return-matrix/", import.meta.url);
mkdirSync(screenshotRoot, { recursive: true });

if (!query) throw new Error("WORDWEAVE_AUDIT_QUERY is required");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function api(context, method, path, csrfToken, data) {
  const requestHeaders = { ...headers };
  if (csrfToken) requestHeaders["x-csrf-token"] = csrfToken;
  const response = await context.request.fetch(path, {
    method,
    headers: requestHeaders,
    ...(data === undefined ? {} : { data }),
  });
  const raw = await response.text();
  return {
    status: response.status(),
    raw,
    body:
      raw && response.headers()["content-type"]?.includes("json")
        ? JSON.parse(raw)
        : null,
  };
}

async function login(context) {
  const bootstrap = await api(context, "GET", "/api/v1/bootstrap");
  assert(bootstrap.status === 200, `bootstrap ${bootstrap.status}`);
  const response = await api(
    context,
    "POST",
    "/api/v1/auth/login",
    bootstrap.body.data.csrf_token,
    {
      username: adminUsername,
      password: adminPassword,
      browser_ui_locale: "en-US",
    },
  );
  assert(response.status === 200, `login ${response.status}: ${response.raw}`);
}

const cases = [
  { name: "mobile-short", width: 390, height: 320 },
  { name: "mobile-standard", width: 390, height: 844 },
  { name: "desktop-short", width: 1440, height: 600 },
  { name: "desktop-standard", width: 1440, height: 1000 },
];
const results = [];
const navigationResults = [];
const browser = await chromium.launch({ headless: true });

try {
  for (const testCase of cases) {
    const context = await browser.newContext({
      baseURL,
      locale: "en-US",
      viewport: { width: testCase.width, height: testCase.height },
    });
    const started = performance.now();
    try {
      await login(context);
      const page = await context.newPage();
      await page.goto("/admin/users");
      await page.locator(".admin-user-empty").waitFor();
      const search = page.getByRole("search");
      await search.getByRole("textbox").fill(query);
      await search.locator('button[type="submit"]').click();
      await page.waitForFunction(
        () => document.querySelectorAll(".admin-user-result").length === 20,
      );
      for (const expected of [40, 46]) {
        await page.locator(".admin-user-pagination button").click();
        await page.waitForFunction(
          (count) => document.querySelectorAll(".admin-user-result").length === count,
          expected,
        );
      }

      const selected = page.locator(".admin-user-result a[data-user-id]").nth(30);
      await selected.scrollIntoViewIfNeeded();
      // Test setup must not inherit the product's global smooth-scroll rule;
      // the source value must be the actual stable position at click time.
      await page.evaluate(() =>
        window.scrollBy({ top: -80, behavior: "instant" }),
      );
      const selectedId = await selected.getAttribute("data-user-id");
      const source = await page.evaluate((id) => {
        const target = document.querySelector(`[data-user-id="${CSS.escape(id)}"]`);
        return {
          scrollY: Math.round(window.scrollY),
          targetTop: Math.round(target.getBoundingClientRect().top),
          scrollHeight: document.documentElement.scrollHeight,
        };
      }, selectedId);

      await selected.click();
      await page.locator(".admin-user-detail-toolbar a").click();
      await page.waitForFunction(
        () => document.querySelectorAll(".admin-user-result").length === 46,
      );
      await page.waitForFunction(
        (id) => document.activeElement?.getAttribute("data-user-id") === id,
        selectedId,
      );
      await page.waitForTimeout(500);
      const restored = await page.evaluate((id) => {
        const target = document.querySelector(`[data-user-id="${CSS.escape(id)}"]`);
        const rect = target.getBoundingClientRect();
        return {
          scrollY: Math.round(window.scrollY),
          focus: document.activeElement?.getAttribute("data-user-id"),
          targetTop: Math.round(rect.top),
          targetBottom: Math.round(rect.bottom),
          scrollHeight: document.documentElement.scrollHeight,
          viewportHeight: window.innerHeight,
          visible: rect.top >= 0 && rect.bottom <= window.innerHeight,
        };
      }, selectedId);
      const returnedQuery = await search.getByRole("textbox").inputValue();
      const delta = restored.scrollY - source.scrollY;
      const passed =
        returnedQuery === query &&
        restored.focus === selectedId &&
        Math.abs(delta) <= 2 &&
        restored.visible;
      await page.screenshot({
        path: new URL(`${testCase.name}.png`, screenshotRoot).pathname,
        fullPage: true,
      });
      results.push({
        ...testCase,
        status: passed ? "PASS" : "FAIL",
        duration_ms: Math.round(performance.now() - started),
        returnedQuery,
        source,
        restored,
        delta,
      });
    } catch (error) {
      results.push({
        ...testCase,
        status: "ERROR",
        duration_ms: Math.round(performance.now() - started),
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      await context.close();
    }
  }

  const navigationContext = await browser.newContext({
    baseURL,
    locale: "en-US",
    viewport: { width: 1440, height: 600 },
  });
  try {
    await login(navigationContext);
    const page = await navigationContext.newPage();
    await page.goto("/admin/users");
    await page.locator(".admin-user-empty").waitFor();
    const search = page.getByRole("search");
    await search.getByRole("textbox").fill(query);
    await search.locator('button[type="submit"]').click();
    await page.waitForFunction(
      () => document.querySelectorAll(".admin-user-result").length === 20,
    );
    for (const expected of [40, 46]) {
      await page.locator(".admin-user-pagination button").click();
      await page.waitForFunction(
        (count) => document.querySelectorAll(".admin-user-result").length === count,
        expected,
      );
    }
    await page.evaluate(() =>
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" }),
    );
    const searchSource = await page.evaluate(() => window.scrollY);
    await search.getByRole("textbox").fill(`${query}_0`);
    await search.locator('button[type="submit"]').click();
    await page.waitForFunction(
      () =>
        document.querySelectorAll(".admin-user-result").length > 0 &&
        window.scrollY === 0,
    );
    navigationResults.push({
      name: "new-search-resets-scroll",
      status: searchSource > 0 ? "PASS" : "FAIL",
      sourceScrollY: Math.round(searchSource),
      restoredScrollY: Math.round(await page.evaluate(() => window.scrollY)),
    });

    await page.locator('.admin-nav a[href="/admin/models"]').click();
    await page.waitForURL("**/admin/models");
    await page.evaluate(() => {
      const spacer = document.createElement("div");
      spacer.dataset.auditSpacer = "true";
      spacer.style.height = "2400px";
      document.querySelector(".admin-main")?.append(spacer);
      window.scrollTo({ top: 1200, behavior: "instant" });
    });
    const crossPageSource = await page.evaluate(() => window.scrollY);
    await page.locator('.admin-nav a[href="/admin/users"]').click();
    await page.locator(".admin-user-empty").waitFor();
    await page.waitForFunction(() => window.scrollY === 0);
    navigationResults.push({
      name: "cross-admin-navigation-resets-scroll",
      status: crossPageSource > 0 ? "PASS" : "FAIL",
      sourceScrollY: Math.round(crossPageSource),
      restoredScrollY: Math.round(await page.evaluate(() => window.scrollY)),
    });
  } catch (error) {
    navigationResults.push({
      name: "normal-navigation-scope",
      status: "ERROR",
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    await navigationContext.close();
  }
} finally {
  await browser.close();
}

const summary = {
  passed: results.filter((result) => result.status === "PASS").length,
  failed: results.filter((result) => result.status !== "PASS").length,
  total: results.length,
};
const navigationSummary = {
  passed: navigationResults.filter((result) => result.status === "PASS").length,
  failed: navigationResults.filter((result) => result.status !== "PASS").length,
  total: navigationResults.length,
};
process.stdout.write(
  `${JSON.stringify({ baseURL, query, summary, results, navigationSummary, navigationResults }, null, 2)}\n`,
);
if (summary.failed || navigationSummary.failed) process.exitCode = 1;
