import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { chromium } from "../../../../../frontend/node_modules/@playwright/test/index.mjs";
import AxeBuilder from "../../../../../frontend/node_modules/@axe-core/playwright/dist/index.mjs";

const baseURL = process.env.WORDWEAVE_BASE_URL ?? "http://localhost:6001";
const prototypeURL =
  process.env.WORDWEAVE_PROTOTYPE_URL ??
  "http://localhost:6010/prototype/index.html";
const adminUsername = process.env.WORDWEAVE_ADMIN_USERNAME ?? "uat_admin";
const adminPassword =
  process.env.WORDWEAVE_ADMIN_PASSWORD ?? "UatAdminPass6000!";
const headers = { origin: baseURL, "sec-fetch-site": "same-origin" };
const screenshotRoot = new URL("./screenshots/cr020-cr022-retest/", import.meta.url);
mkdirSync(screenshotRoot, { recursive: true });

const results = [];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function check(name, run) {
  const started = performance.now();
  try {
    const evidence = await run();
    results.push({
      name,
      status: "PASS",
      duration_ms: Math.round(performance.now() - started),
      evidence,
    });
  } catch (error) {
    results.push({
      name,
      status: "FAIL",
      duration_ms: Math.round(performance.now() - started),
      evidence: error instanceof Error ? error.message : String(error),
    });
  }
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
  const body =
    raw && response.headers()["content-type"]?.includes("json")
      ? JSON.parse(raw)
      : null;
  return { status: response.status(), raw, body };
}

async function bootstrap(context) {
  const response = await api(context, "GET", "/api/v1/bootstrap");
  assert(response.status === 200, `bootstrap ${response.status}: ${response.raw}`);
  return response.body.data;
}

async function login(context, username, password, locale = "en-US") {
  const security = await bootstrap(context);
  const response = await api(
    context,
    "POST",
    "/api/v1/auth/login",
    security.csrf_token,
    { username, password, browser_ui_locale: locale },
  );
  assert(response.status === 200, `login ${username}: ${response.status}`);
  return response.body.data;
}

async function register(browser, username) {
  const context = await browser.newContext({ baseURL });
  try {
    const security = await bootstrap(context);
    const response = await api(
      context,
      "POST",
      "/api/v1/auth/register",
      security.csrf_token,
      {
        username,
        password: "CursorAuditPass123!",
        password_confirmation: "CursorAuditPass123!",
        ui_locale: "en-US",
      },
    );
    assert(response.status === 201, `register ${username}: ${response.status}`);
  } finally {
    await context.close();
  }
}

function cursorProblem(requestId, status = 422, code = "validation_failed") {
  return {
    type: `https://wordweave.local/problems/${code}`,
    title: status === 422 ? "Request could not be accepted" : "Service unavailable",
    status,
    code,
    detail:
      status === 422
        ? "One or more fields need attention."
        : "Please try again.",
    request_id: requestId,
    ...(status === 422
      ? { field_errors: [{ field: "cursor", code: "invalid" }] }
      : {}),
  };
}

function assertCursorInvalid(response, label) {
  assert(response.status === 422, `${label}: status ${response.status}`);
  assert(response.body?.code === "validation_failed", `${label}: code mismatch`);
  assert(
    Array.isArray(response.body?.field_errors) &&
      response.body.field_errors.length === 1 &&
      response.body.field_errors[0].field === "cursor" &&
      response.body.field_errors[0].code === "invalid",
    `${label}: cursor field error mismatch`,
  );
  const serialized = JSON.stringify(response.body);
  assert(!serialized.includes("signature"), `${label}: signature detail leaked`);
  assert(!serialized.includes("normalized_query"), `${label}: cursor internals leaked`);
}

async function switchLocale(page, locale) {
  if ((await page.locator("html").getAttribute("lang")) === locale) return;
  const responsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === "PUT" &&
      response.url().endsWith("/api/v1/me/ui-locale"),
  );
  await page.locator(".locale-switch select").selectOption(locale);
  await responsePromise;
  await page.waitForFunction(
    (expected) => document.documentElement.lang === expected,
    locale,
  );
}

async function fetchUserPage(context, query, cursor = null) {
  const params = new URLSearchParams({ username: query, limit: "20" });
  if (cursor) params.set("cursor", cursor);
  return api(context, "GET", `/api/v1/admin/users?${params}`);
}

const browser = await chromium.launch({ headless: true });
const contexts = [];
async function newContext(options = {}) {
  const context = await browser.newContext({ baseURL, ...options });
  contexts.push(context);
  return context;
}

const suffix = Date.now().toString(36).slice(-7);
const query = `cx${suffix}`.slice(0, 12);
const exact = query;
const longUsername = `${query}_${"x".repeat(32 - query.length - 1)}`;
const fixtureNames = [
  exact,
  `a${query}z`,
  longUsername,
  ...Array.from({ length: 43 }, (_, index) =>
    `${query}_${String(index).padStart(2, "0")}`,
  ),
];
const secondAdminUsername = `admin_${suffix}`.slice(0, 32);
const secondAdminPassword = "CursorAdminPass123!";

try {
  for (const username of fixtureNames) await register(browser, username);

  execFileSync(
    "docker",
    [
      "exec",
      "-e",
      `ADMIN_USERNAME=${secondAdminUsername}`,
      "-e",
      `ADMIN_PASSWORD=${secondAdminPassword}`,
      "wordweave_uat-backend-1",
      "/usr/local/bin/wordweave-admin",
      "create-admin",
    ],
    { stdio: "pipe" },
  );

  const adminContext = await newContext({
    locale: "en-US",
    viewport: { width: 1440, height: 1000 },
  });
  const secondAdminContext = await newContext({ locale: "en-US" });
  await login(adminContext, adminUsername, adminPassword, "en-US");
  await login(
    secondAdminContext,
    secondAdminUsername,
    secondAdminPassword,
    "en-US",
  );

  let firstCursor = null;
  let expectedOrder = [];

  await check("CR-021 API exact tier and three-page total order", async () => {
    const responses = [];
    const items = [];
    let cursor = null;
    do {
      const response = await fetchUserPage(adminContext, query, cursor);
      assert(response.status === 200, `list status ${response.status}: ${response.raw}`);
      responses.push(response);
      items.push(...response.body.data.items);
      cursor = response.body.meta.next_cursor;
      if (responses.length === 1) firstCursor = cursor;
      assert(
        response.body.meta.has_more === (cursor !== null),
        "has_more and next_cursor disagree",
      );
    } while (cursor);

    assert(responses.length === 3, `expected 3 pages, got ${responses.length}`);
    const names = items.map((item) => item.username);
    assert(names.length === fixtureNames.length, `expected ${fixtureNames.length}, got ${names.length}`);
    assert(new Set(items.map((item) => item.id)).size === items.length, "duplicate IDs across pages");
    assert(names[0] === exact, `exact username was not first: ${names.slice(0, 2)}`);
    const remainder = names.slice(1);
    assert(
      JSON.stringify(remainder) ===
        JSON.stringify(
          [...remainder].sort((left, right) =>
            left.localeCompare(right, undefined, { sensitivity: "base" }),
          ),
        ),
      "non-exact results are not in case-insensitive order",
    );
    const expectedKeys = ["created_at", "id", "plan_code", "role", "status", "username"].sort();
    assert(
      items.every(
        (item) => JSON.stringify(Object.keys(item).sort()) === JSON.stringify(expectedKeys),
      ),
      "list response exposed an unapproved field",
    );
    expectedOrder = items.map((item) => item.id);
    return `pages=${responses.map((response) => response.body.data.items.length).join("+")}; exact first; ${items.length} unique IDs; approved fields only`;
  });

  await check("CR-021 normalized query and cursor scope matrix", async () => {
    assert(firstCursor, "first-page cursor unavailable");
    const upperFirst = await fetchUserPage(adminContext, query.toUpperCase());
    assert(upperFirst.status === 200, `uppercase first page ${upperFirst.status}`);
    const upperSecond = await fetchUserPage(
      adminContext,
      query.toUpperCase(),
      firstCursor,
    );
    assert(upperSecond.status === 200, `normalized-query cursor ${upperSecond.status}`);
    assert(
      JSON.stringify([
        ...upperFirst.body.data.items,
        ...upperSecond.body.data.items,
      ].map((item) => item.id)) === JSON.stringify(expectedOrder.slice(0, 40)),
      "case-equivalent query changed ordering",
    );

    // Mutate a payload character. The final Base64URL character can contain
    // unused padding bits, so changing only that character is not guaranteed to
    // change the decoded cursor bytes.
    const tamperIndex = Math.floor(firstCursor.length / 2);
    const originalCharacter = firstCursor[tamperIndex];
    const tampered = `${firstCursor.slice(0, tamperIndex)}${
      originalCharacter === "a" ? "b" : "a"
    }${firstCursor.slice(tamperIndex + 1)}`;
    const oldCursor = Buffer.from(
      JSON.stringify({ username: query, id: "00000000-0000-0000-0000-000000000000" }),
    ).toString("base64url");
    const cases = [
      ["tampered", await fetchUserPage(adminContext, query, tampered)],
      ["malformed", await fetchUserPage(adminContext, query, "%%%")],
      ["old", await fetchUserPage(adminContext, query, oldCursor)],
      ["cross-query", await fetchUserPage(adminContext, `${query}_0`, firstCursor)],
      ["cross-admin", await fetchUserPage(secondAdminContext, query, firstCursor)],
    ];
    for (const [label, response] of cases) assertCursorInvalid(response, label);
    const cleanRestart = await fetchUserPage(adminContext, query);
    assert(cleanRestart.status === 200, `cursorless restart ${cleanRestart.status}`);
    return `case-equivalent cursor accepted; ${cases.map(([label]) => label).join(", ")} rejected uniformly; cursorless restart succeeds`;
  });

  await check("CR-022 delayed append, retry, last-page focus, layout and return state", async () => {
    const page = await adminContext.newPage();
    await page.goto("/admin/users");
    await page.locator(".admin-user-empty").waitFor();

    let delayCursor = true;
    await page.route("**/api/v1/admin/users?**", async (route) => {
      const url = new URL(route.request().url());
      if (url.searchParams.has("cursor") && delayCursor) {
        delayCursor = false;
        await new Promise((resolve) => setTimeout(resolve, 900));
      }
      await route.continue();
    });

    const search = page.getByRole("search");
    await search.getByRole("textbox").fill(query);
    await search.locator('button[type="submit"]').click();
    await page.waitForFunction(
      () => document.querySelectorAll(".admin-user-result").length === 20,
    );

    const loadMore = page.locator(".admin-user-pagination button");
    await loadMore.click();
    await page.locator('.admin-user-results[aria-busy="true"]').waitFor();
    const pending = {
      rows: await page.locator(".admin-user-result").count(),
      skeletons: await page.locator(".user-skeleton").count(),
      disabled: await loadMore.isDisabled(),
      spinner: await loadMore.locator(".spinner").count(),
      label: (await loadMore.innerText()).trim(),
    };
    assert(
      pending.rows === 20 &&
        pending.skeletons === 0 &&
        pending.disabled &&
        pending.spinner === 1,
      `append loading state ${JSON.stringify(pending)}`,
    );
    await page.waitForFunction(
      () => document.querySelectorAll(".admin-user-result").length === 40,
    );
    assert(await loadMore.evaluate((node) => document.activeElement === node), "load-more did not retain focus while more pages remained");

    await page.unroute("**/api/v1/admin/users?**");
    let rejectNextCursor = true;
    let failedCursor = "";
    let retriedCursor = "";
    await page.route("**/api/v1/admin/users?**", async (route) => {
      const url = new URL(route.request().url());
      if (url.searchParams.has("cursor") && rejectNextCursor) {
        rejectNextCursor = false;
        failedCursor = url.searchParams.get("cursor") ?? "";
        await route.fulfill({
          status: 503,
          contentType: "application/problem+json",
          body: JSON.stringify(cursorProblem("req_append_failure", 503, "temporarily_unavailable")),
        });
        return;
      }
      if (url.searchParams.has("cursor")) retriedCursor = url.searchParams.get("cursor") ?? "";
      await route.continue();
    });

    await loadMore.click();
    await page.locator(".admin-user-append-error[role=alert]").waitFor();
    assert((await page.locator(".admin-user-result").count()) === 40, "append failure removed rows");
    assert(await loadMore.isEnabled(), "append retry remained disabled");
    await loadMore.click();
    await page.waitForFunction(
      (count) => document.querySelectorAll(".admin-user-result").length === count,
      fixtureNames.length,
    );
    assert(failedCursor && failedCursor === retriedCursor, "append failure did not preserve the cursor for retry");
    const firstFinalId = await page.locator(".admin-user-result").nth(40).getAttribute("data-result-id");
    assert(
      firstFinalId &&
        (await page
          .locator(`[data-user-id="${firstFinalId}"]`)
          .evaluate((node) => document.activeElement === node)),
      "last page did not focus the first appended View action",
    );

    const layouts = [];
    for (const locale of ["en-US", "zh-CN"]) {
      await switchLocale(page, locale);
      for (const width of [320, 390, 720, 721, 900, 1440]) {
        await page.setViewportSize({ width, height: 1000 });
        const layout = await page.evaluate((targetName) => {
          const row = [...document.querySelectorAll(".admin-user-result")].find(
            (candidate) => candidate.querySelector(".user-name")?.textContent === targetName,
          );
          const identity = row?.querySelector(".admin-user-identity")?.getBoundingClientRect();
          const plan = row?.querySelector(".admin-user-plan")?.getBoundingClientRect();
          const status = row?.querySelector(".status-badge")?.getBoundingClientRect();
          const action = row?.querySelector(":scope > .button")?.getBoundingClientRect();
          const rowRect = row?.getBoundingClientRect();
          const name = row?.querySelector(".user-name")?.getBoundingClientRect();
          return {
            viewport: innerWidth,
            documentWidth: document.documentElement.scrollWidth,
            rowWidth: rowRect?.width ?? 0,
            actionWidth: action?.width ?? 0,
            stacked:
              Boolean(identity && plan && status && action) &&
              plan.top >= identity.bottom - 1 &&
              Math.abs(plan.top - status.top) <= 2 &&
              action.top >= Math.max(plan.bottom, status.bottom) - 1,
            nameContained:
              Boolean(name && rowRect) &&
              name.left >= rowRect.left &&
              name.right <= rowRect.right + 1,
          };
        }, longUsername);
        assert(layout.documentWidth <= layout.viewport, `${locale}@${width}: page overflow`);
        assert(layout.nameContained, `${locale}@${width}: long username overflow`);
        if (width <= 720) {
          assert(layout.stacked, `${locale}@${width}: row is not three-tier stacked`);
          assert(layout.actionWidth >= layout.rowWidth * 0.7, `${locale}@${width}: action is not wide`);
        }
        layouts.push(`${locale}@${width}`);
      }
    }

    await switchLocale(page, "en-US");
    await page.setViewportSize({ width: 390, height: 844 });
    const selected = page.locator(".admin-user-result a[data-user-id]").nth(30);
    let clickScroll = null;
    await page.exposeFunction("capturePage103ClickScroll", (value) => {
      clickScroll = value;
    });
    await page.evaluate(() => {
      document.addEventListener(
        "click",
        (event) => {
          if (event.target instanceof Element && event.target.closest("a[data-user-id]"))
            window.capturePage103ClickScroll(window.scrollY);
        },
        { capture: true, once: true },
      );
    });
    await selected.scrollIntoViewIfNeeded();
    await page.evaluate(() => window.scrollBy(0, -80));
    const selectedId = await selected.getAttribute("data-user-id");
    await selected.click();
    assert(clickScroll !== null, "detail navigation did not capture its source scroll");
    await page.locator(".admin-user-detail-toolbar a").click();
    await page.waitForFunction(
      (count) => document.querySelectorAll(".admin-user-result").length === count,
      fixtureNames.length,
    );
    await page.waitForFunction(
      (id) => document.activeElement?.getAttribute("data-user-id") === id,
      selectedId,
    );
    await page.waitForTimeout(350);
    const restored = {
      query: await page.getByRole("search").getByRole("textbox").inputValue(),
      rows: await page.locator(".admin-user-result").count(),
      scrollY: await page.evaluate(() => window.scrollY),
      focus: await page.evaluate(() => document.activeElement?.getAttribute("data-user-id")),
      focusedTop: await page
        .locator(`[data-user-id="${selectedId}"]`)
        .evaluate((node) => Math.round(node.getBoundingClientRect().top)),
      scrollHeight: await page.evaluate(() => document.documentElement.scrollHeight),
    };
    assert(restored.query === query, `return query ${restored.query}`);
    assert(restored.focus === selectedId, `return focus ${restored.focus}`);
    assert(
      Math.abs(restored.scrollY - clickScroll) <= 2,
      `return scroll ${JSON.stringify({ source: clickScroll, ...restored })}`,
    );

    await page.screenshot({
      path: new URL("page103-return-mobile.png", screenshotRoot).pathname,
      fullPage: true,
    });
    const axe = await new AxeBuilder({ page }).analyze();
    const serious = axe.violations.filter((finding) =>
      ["serious", "critical"].includes(finding.impact),
    );
    assert(serious.length === 0, `Axe: ${serious.map((finding) => finding.id).join(",")}`);
    await page.close();
    return `delayed append=${JSON.stringify(pending)}; 20+20+6; failure preserves 40 rows/cursor; final focus; ${layouts.length} responsive-locale cases; detail return query/rows/scroll/focus; Axe clean`;
  });

  await check("CR-021/022 frontend performs exactly one invalid-cursor recovery", async () => {
    const page = await adminContext.newPage();
    await page.goto("/admin/users");
    if ((await page.locator("html").getAttribute("lang")) !== "en-US")
      await switchLocale(page, "en-US");
    await page.locator(".admin-user-empty").waitFor();
    const search = page.getByRole("search");
    await search.getByRole("textbox").fill(query);
    await search.locator('button[type="submit"]').click();
    await page.waitForFunction(
      () => document.querySelectorAll(".admin-user-result").length === 20,
    );

    const observed = [];
    let injectCursorInvalid = true;
    await page.route("**/api/v1/admin/users?**", async (route) => {
      const url = new URL(route.request().url());
      observed.push({
        query: url.searchParams.get("username"),
        hasCursor: url.searchParams.has("cursor"),
      });
      if (url.searchParams.has("cursor") && injectCursorInvalid) {
        injectCursorInvalid = false;
        await route.fulfill({
          status: 422,
          contentType: "application/problem+json",
          body: JSON.stringify(cursorProblem("req_cursor_expired")),
        });
        return;
      }
      await route.continue();
    });
    await page.locator(".admin-user-pagination button").click();
    await page.waitForFunction(
      () =>
        document.querySelectorAll(".admin-user-result").length === 20 &&
        document.activeElement?.id === "admin-user-results-title",
    );
    assert(observed.length === 2, `expected two recovery requests, got ${JSON.stringify(observed)}`);
    assert(observed[0].hasCursor && !observed[1].hasCursor, `recovery sequence ${JSON.stringify(observed)}`);
    assert(observed.every((request) => request.query === query), "recovery changed query");
    await page.waitForTimeout(250);
    assert(observed.length === 2, "cursor recovery looped");
    await page.close();
    return `request sequence=${JSON.stringify(observed)}; results restarted once; heading focused; no loop`;
  });

  await check("CR-020 key input uses approved raised surface across locales and viewports", async () => {
    const actual = await adminContext.newPage();
    await actual.goto("/admin/models");
    const evidence = [];
    for (const locale of ["en-US", "zh-CN"]) {
      await switchLocale(actual, locale);
      for (const width of [390, 1440]) {
        await actual.setViewportSize({ width, height: 1000 });
        await actual.locator(".admin-key-card .card-footer button").click();
        const input = actual.getByRole("dialog").locator(".admin-key-input");
        const background = await input.evaluate(
          (node) => getComputedStyle(node).backgroundColor,
        );
        assert(background === "rgb(255, 255, 255)", `actual ${locale}@${width}: ${background}`);
        evidence.push(`actual ${locale}@${width}=${background}`);
        await actual.getByRole("dialog").locator(".dialog-footer .button-secondary").click();

        const prototypeContext = await newContext({
          locale,
          viewport: { width, height: 1000 },
        });
        const prototype = await prototypeContext.newPage();
        await prototype.goto(
          `${prototypeURL}?page=PAGE-101&role=admin&state=default&locale=${locale}`,
        );
        await prototype.getByRole("button", {
          name: locale === "zh-CN" ? "替换密钥" : "Replace key",
          exact: true,
        }).click();
        const prototypeInput = prototype.getByRole("dialog").locator("input");
        const prototypeBackground = await prototypeInput.evaluate(
          (node) => getComputedStyle(node).backgroundColor,
        );
        assert(
          prototypeBackground === background,
          `prototype ${locale}@${width}: ${prototypeBackground}/${background}`,
        );
        evidence.push(`prototype ${locale}@${width}=${prototypeBackground}`);
        await prototype.close();
        await prototypeContext.close();
      }
    }
    await actual.screenshot({
      path: new URL("admin-models-zh-desktop.png", screenshotRoot).pathname,
      fullPage: true,
    });
    await actual.close();
    return evidence.join("; ");
  });

  const summary = {
    passed: results.filter((result) => result.status === "PASS").length,
    failed: results.filter((result) => result.status === "FAIL").length,
    total: results.length,
  };
  process.stdout.write(
    `${JSON.stringify({ baseURL, prototypeURL, query, fixtureCount: fixtureNames.length, summary, results }, null, 2)}\n`,
  );
  if (summary.failed) process.exitCode = 1;
} finally {
  await Promise.all(contexts.map((context) => context.close().catch(() => {})));
  await browser.close();
}
