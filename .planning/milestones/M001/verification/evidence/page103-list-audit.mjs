import { chromium } from "../../../../../frontend/node_modules/@playwright/test/index.mjs";
import AxeBuilder from "../../../../../frontend/node_modules/@axe-core/playwright/dist/index.mjs";

const baseURL = process.env.WORDWEAVE_BASE_URL ?? "http://localhost:6001";
const prototypeURL =
  process.env.WORDWEAVE_PROTOTYPE_URL ??
  "http://localhost:6010/prototype/index.html";
const headers = { origin: baseURL, "sec-fetch-site": "same-origin" };
const results = [];

function record(name, passed, evidence) {
  results.push({ name, status: passed ? "PASS" : "FAIL", evidence });
}

async function bootstrap(context) {
  return (await (await context.request.get("/api/v1/bootstrap", { headers })).json())
    .data;
}

async function register(browser, username) {
  const context = await browser.newContext({ baseURL });
  const security = await bootstrap(context);
  const response = await context.request.post("/api/v1/auth/register", {
    headers: { ...headers, "x-csrf-token": security.csrf_token },
    data: {
      username,
      password: "Page103AuditPass123!",
      password_confirmation: "Page103AuditPass123!",
      ui_locale: "en-US",
    },
  });
  const status = response.status();
  await context.close();
  if (status !== 201) throw new Error(`register ${username}: ${status}`);
}

async function loginAdmin(context) {
  const security = await bootstrap(context);
  const response = await context.request.post("/api/v1/auth/login", {
    headers: { ...headers, "x-csrf-token": security.csrf_token },
    data: {
      username: process.env.WORDWEAVE_ADMIN_USERNAME ?? "uat_admin",
      password:
        process.env.WORDWEAVE_ADMIN_PASSWORD ?? "UatAdminPass6000!",
      browser_ui_locale: "en-US",
    },
  });
  if (response.status() !== 200)
    throw new Error(`admin login: ${response.status()}`);
  return (await response.json()).data.csrf_token;
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  baseURL,
  locale: "en-US",
  viewport: { width: 1440, height: 1000 },
});
const suffix = Date.now().toString(36).slice(-6);
const query = `qe${suffix}`;
const exact = query;
const alphabeticalBeforeExact = `a${query}z`;
const longUsername = `${query}_${"x".repeat(32 - query.length - 1)}`;
const fixtureNames = [
  alphabeticalBeforeExact,
  exact,
  longUsername,
  ...Array.from({ length: 22 }, (_, index) =>
    `${query}_${String(index).padStart(2, "0")}`,
  ),
];

try {
  for (const username of fixtureNames) await register(browser, username);
  const adminCSRF = await loginAdmin(context);
  const localeSetup = await context.request.put("/api/v1/me/ui-locale", {
    headers: { ...headers, "x-csrf-token": adminCSRF },
    data: { ui_locale: "en-US" },
  });
  if (localeSetup.status() !== 200)
    throw new Error(`admin locale setup: ${localeSetup.status()}`);
  const page = await context.newPage();
  const listRequests = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname === "/api/v1/admin/users") listRequests.push(url.href);
  });
  await page.goto("/admin/users");
  await page.waitForFunction(() => document.documentElement.lang === "en-US");
  await page.locator(".admin-user-empty").waitFor();
  record(
    "search-first initial state",
    listRequests.length === 0 &&
      (await page.locator(".admin-user-result").count()) === 0,
    `list requests=${listRequests.length}, rows=${await page.locator(".admin-user-result").count()}`,
  );

  let delayInitial = true;
  let delayCursor = true;
  await page.route("**/api/v1/admin/users?**", async (route) => {
    const url = new URL(route.request().url());
    if (!url.searchParams.has("cursor") && delayInitial) {
      delayInitial = false;
      await new Promise((resolve) => setTimeout(resolve, 450));
    } else if (url.searchParams.has("cursor") && delayCursor) {
      delayCursor = false;
      await new Promise((resolve) => setTimeout(resolve, 900));
    }
    await route.continue();
  });

  const search = page.getByRole("search");
  await search.getByRole("textbox").fill(query);
  const initialResponsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === "/api/v1/admin/users" &&
      !url.searchParams.has("cursor") &&
      url.searchParams.get("username") === query
    );
  });
  await search.locator('button[type="submit"]').click();
  await page.locator('.admin-user-results[aria-busy="true"]').waitFor();
  record(
    "initial search loading state",
    (await page.locator(".user-skeleton").count()) === 3 &&
      (await page.locator(".admin-user-result").count()) === 0,
    `skeletons=${await page.locator(".user-skeleton").count()}, rows=${await page.locator(".admin-user-result").count()}`,
  );
  const initialResponse = await initialResponsePromise;
  const initialPayload = await initialResponse.json();
  await page.locator(".admin-user-result").first().waitFor();

  const firstPageNames = await page
    .locator(".admin-user-result .user-name")
    .allTextContents();
  record(
    "exact match is pinned first",
    firstPageNames[0] === exact,
    `expected first=${exact}, actual first=${firstPageNames[0]}, first two=${firstPageNames.slice(0, 2).join(",")}`,
  );
  const remainder = firstPageNames.filter((name) => name !== exact);
  record(
    "remaining names use case-insensitive order",
    JSON.stringify(remainder) ===
      JSON.stringify(
        [...remainder].sort((left, right) =>
          left.localeCompare(right, undefined, { sensitivity: "base" }),
        ),
      ),
    remainder.join(","),
  );
  record(
    "search result title receives focus",
    await page
      .locator("#admin-user-results-title")
      .evaluate((node) => document.activeElement === node),
    `active=${await page.evaluate(() => document.activeElement?.id ?? document.activeElement?.tagName)}`,
  );
  const responseKeys = Object.keys(initialPayload.data.items[0] ?? {}).sort();
  record(
    "list API exposes only approved summary fields",
    JSON.stringify(responseKeys) ===
      JSON.stringify(
        ["created_at", "id", "plan_code", "role", "status", "username"].sort(),
      ),
    responseKeys.join(","),
  );
  const rowSemantics = await page.locator(".admin-user-result").evaluateAll((rows) =>
    rows.map((row) => ({
      role: row.getAttribute("role"),
      tabbables: row.querySelectorAll(
        'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])',
      ).length,
      text: row.textContent?.trim() ?? "",
      actionName: row.querySelector("a")?.getAttribute("aria-label") ?? "",
    })),
  );
  record(
    "rows keep approved fields, one action, and accessible username",
    rowSemantics.every(
      (row) =>
        row.role === "listitem" &&
        row.tabbables === 1 &&
        row.actionName &&
        !/password|quota|learning content|study content/i.test(row.text),
    ),
    JSON.stringify(rowSemantics.slice(0, 2)),
  );

  const loadMore = page.locator(".admin-user-pagination button");
  await loadMore.focus();
  const cursorResponsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === "/api/v1/admin/users" && url.searchParams.has("cursor")
    );
  });
  await loadMore.click();
  await page.waitForTimeout(150);
  const duringLoadMore = {
    rows: await page.locator(".admin-user-result").count(),
    skeletons: await page.locator(".user-skeleton").count(),
    active: await page.evaluate(() => ({
      tag: document.activeElement?.tagName,
      text: (document.activeElement?.textContent?.trim() ?? "").slice(0, 80),
    })),
  };
  await page.screenshot({
    path: new URL(
      "./screenshots/page103-list-audit/actual-loading-more.png",
      import.meta.url,
    ).pathname,
    fullPage: true,
  });
  record(
    "load-more keeps existing rows visible",
    duringLoadMore.rows === 20 && duringLoadMore.skeletons === 0,
    JSON.stringify(duringLoadMore),
  );
  await cursorResponsePromise;
  await page.waitForFunction(
    (count) => document.querySelectorAll(".admin-user-result").length === count,
    fixtureNames.length,
  );
  const allNames = await page
    .locator(".admin-user-result .user-name")
    .allTextContents();
  const postLoadFocus = await page.evaluate(() => ({
    tag: document.activeElement?.tagName,
    text: (document.activeElement?.textContent?.trim() ?? "").slice(0, 80),
    name: document.activeElement?.getAttribute("aria-label") ?? "",
  }));
  const firstNewName = allNames[20];
  record(
    "load-more appends without duplicates",
    allNames.length === fixtureNames.length && new Set(allNames).size === allNames.length,
    `count=${allNames.length}, unique=${new Set(allNames).size}`,
  );
  record(
    "load-more preserves a defined focus target",
    /load more/i.test(postLoadFocus.text) ||
      postLoadFocus.name.includes(firstNewName),
    `first new=${firstNewName}, active=${JSON.stringify(postLoadFocus)}`,
  );

  const viewportEvidence = [];
  for (const width of [320, 390, 720, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    const geometry = await page.evaluate((longName) => {
      const row = [...document.querySelectorAll(".admin-user-result")].find(
        (item) => item.querySelector(".user-name")?.textContent === longName,
      );
      const action = row?.querySelector(":scope > .button");
      const rowRect = row?.getBoundingClientRect();
      const actionRect = action?.getBoundingClientRect();
      const nameRect = row?.querySelector(".user-name")?.getBoundingClientRect();
      return {
        viewport: innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        rowWidth: rowRect?.width ?? 0,
        actionWidth: actionRect?.width ?? 0,
        nameContained:
          Boolean(nameRect && rowRect) &&
          nameRect.left >= rowRect.left &&
          nameRect.right <= rowRect.right + 0.5,
      };
    }, longUsername);
    const imageName = `actual-results-${width}.png`;
    await page.screenshot({
      path: new URL(`./screenshots/page103-list-audit/${imageName}`, import.meta.url)
        .pathname,
      fullPage: true,
    });
    viewportEvidence.push({ width, ...geometry });
  }
  record(
    "results and 32-character username do not overflow",
    viewportEvidence.every(
      (item) => item.documentWidth <= item.viewport && item.nameContained,
    ),
    JSON.stringify(viewportEvidence),
  );
  const geometry720 = viewportEvidence.find((item) => item.width === 720);
  record(
    "view action fills the last row through 720px",
    Boolean(
      geometry720 && geometry720.actionWidth >= geometry720.rowWidth * 0.7,
    ),
    JSON.stringify(geometry720),
  );

  const prototypeContext = await browser.newContext({
    locale: "en-US",
    viewport: { width: 720, height: 1000 },
  });
  const prototype = await prototypeContext.newPage();
  await prototype.goto(
    `${prototypeURL}?page=PAGE-103&role=admin&state=results&locale=en-US`,
  );
  const prototype720 = await prototype.evaluate(() => {
    const row = document.querySelector(".admin-user-result");
    const action = row?.querySelector(":scope > .button");
    return {
      rowWidth: row?.getBoundingClientRect().width ?? 0,
      actionWidth: action?.getBoundingClientRect().width ?? 0,
      documentWidth: document.documentElement.scrollWidth,
      viewport: innerWidth,
    };
  });
  await prototype.screenshot({
    path: new URL(
      "./screenshots/page103-list-audit/prototype-results-720.png",
      import.meta.url,
    ).pathname,
    fullPage: true,
  });
  record(
    "approved prototype establishes a stacked wide-action 720px layout",
    prototype720.actionWidth >= prototype720.rowWidth * 0.7,
    JSON.stringify(prototype720),
  );
  await prototypeContext.close();

  await page.setViewportSize({ width: 390, height: 1000 });
  const localeResponse = page.waitForResponse((response) =>
    response.url().endsWith("/api/v1/me/ui-locale"),
  );
  await page.locator(".locale-switch select").selectOption("zh-CN");
  await localeResponse;
  await page.waitForFunction(
    () => document.documentElement.lang === "zh-CN",
  );
  record(
    "locale switch preserves query and loaded results",
    (await page.getByRole("search").getByRole("textbox").inputValue()) === query &&
      (await page.locator(".admin-user-result").count()) === fixtureNames.length,
    `query=${await page.getByRole("search").getByRole("textbox").inputValue()}, rows=${await page.locator(".admin-user-result").count()}`,
  );
  const axe = await new AxeBuilder({ page }).analyze();
  const serious = axe.violations.filter((finding) =>
    ["critical", "serious"].includes(finding.impact),
  );
  record(
    "results state has no serious or critical Axe issue",
    serious.length === 0,
    serious.map((finding) => finding.id).join(",") || "none",
  );

  const summary = {
    passed: results.filter((result) => result.status === "PASS").length,
    failed: results.filter((result) => result.status === "FAIL").length,
    total: results.length,
  };
  process.stdout.write(
    `${JSON.stringify({ baseURL, query, fixtureNames, summary, results }, null, 2)}\n`,
  );
  if (summary.failed) process.exitCode = 1;
} finally {
  await context.close().catch(() => {});
  await browser.close();
}
