import { chromium } from "../../../../../frontend/node_modules/@playwright/test/index.mjs";

const actualBase = process.env.WORDWEAVE_BASE_URL ?? "http://localhost:6001";
const prototypeBase = process.env.WORDWEAVE_PROTOTYPE_URL ?? "http://localhost:6010/prototype/index.html";
const screenshotRoot = new URL(process.env.WORDWEAVE_SCREENSHOT_DIR ?? "./screenshots/ui-design-retest-final-en/", import.meta.url);
const requestHeaders = { origin: actualBase, "sec-fetch-site": "same-origin" };

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function api(context, method, path, csrfToken, data) {
  const headers = { ...requestHeaders };
  if (csrfToken) headers["x-csrf-token"] = csrfToken;
  const response = await context.request.fetch(path, {
    method,
    headers,
    ...(data === undefined ? {} : { data }),
  });
  const raw = await response.text();
  const body = raw && response.headers()["content-type"]?.includes("json") ? JSON.parse(raw) : null;
  return { status: response.status(), raw, body };
}

async function login(context, username, password) {
  const bootstrap = await api(context, "GET", "/api/v1/bootstrap");
  assert(bootstrap.status === 200, `bootstrap ${bootstrap.status}: ${bootstrap.raw}`);
  const response = await api(context, "POST", "/api/v1/auth/login", bootstrap.body.data.csrf_token, {
    username,
    password,
    browser_ui_locale: "en-US",
  });
  assert(response.status === 200, `login ${username} ${response.status}: ${response.raw}`);
  return response.body.data;
}

async function setAccountLocale(context, csrfToken, locale) {
  const response = await api(context, "PUT", "/api/v1/me/ui-locale", csrfToken, { ui_locale: locale });
  assert(response.status === 200, `locale ${locale} ${response.status}: ${response.raw}`);
}

async function inspect(page) {
  return page.evaluate(() => {
    const visible = (node) => {
      const rect = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
    };
    const anchors = [...document.querySelectorAll("a")].filter(visible);
    const overflowing = [...document.querySelectorAll("body *")]
      .filter(visible)
      .filter((node) => {
        const rect = node.getBoundingClientRect();
        return rect.left < -1 || rect.right > innerWidth + 1;
      })
      .slice(0, 12)
      .map((node) => ({
        tag: node.tagName.toLowerCase(),
        classes: typeof node.className === "string" ? node.className : "",
        text: node.textContent.trim().replace(/\s+/gu, " ").slice(0, 80),
      }));
    return {
      lang: document.documentElement.lang,
      brand: document.querySelector(".brand-name")?.textContent.trim() ?? null,
      logo: {
        svg: Boolean(document.querySelector(".brand svg, .admin-brand svg")),
        markText: document.querySelector(".brand-mark")?.textContent.trim() ?? null,
      },
      nav: [...document.querySelectorAll(".main-nav .nav-link, .admin-nav a, .admin-nav button")]
        .filter(visible)
        .map((node) => node.textContent.trim().replace(/\s+/gu, " ")),
      headings: [...document.querySelectorAll("h1, h2, h3")]
        .filter(visible)
        .map((node) => `${node.tagName.toLowerCase()}:${node.textContent.trim().replace(/\s+/gu, " ")}`),
      underlinedAnchors: anchors
        .filter((node) => getComputedStyle(node).textDecorationLine !== "none")
        .map((node) => ({
          text: node.textContent.trim().replace(/\s+/gu, " ").slice(0, 100),
          classes: node.className,
        })),
      viewportOverflow: document.documentElement.scrollWidth - innerWidth,
      overflowing,
      bodyFont: getComputedStyle(document.body).fontFamily,
      titleFont: document.querySelector("h1") ? getComputedStyle(document.querySelector("h1")).fontFamily : null,
    };
  });
}

async function capture(page, url, filename, hidePrototypeTools = false) {
  const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 10_000 });
  assert(response && response.status() < 400, `${url} status ${response?.status()}`);
  await page.waitForTimeout(250);
  if (hidePrototypeTools) {
    await page.locator(".prototype-tools").evaluate((node) => { node.style.display = "none"; });
  }
  await page.screenshot({ path: new URL(filename, screenshotRoot).pathname, fullPage: true });
  return inspect(page);
}

const browser = await chromium.launch({ headless: true });
const publicContext = await browser.newContext({ baseURL: actualBase, locale: "en-US", viewport: { width: 1440, height: 1000 } });
const learnerContext = await browser.newContext({ baseURL: actualBase, locale: "en-US", viewport: { width: 1440, height: 1000 } });
const adminContext = await browser.newContext({ baseURL: actualBase, locale: "en-US", viewport: { width: 1440, height: 1000 } });
const prototypeContext = await browser.newContext({ locale: "en-US", viewport: { width: 1440, height: 1000 } });

try {
  await publicContext.addCookies([{ name: "wordweave_ui_locale", value: "en-US", url: actualBase }]);
  const learner = await login(learnerContext, "uat_learner", "UatLearnerPass6000!");
  const admin = await login(adminContext, "uat_admin", "UatAdminPass6000!");
  await setAccountLocale(learnerContext, learner.csrf_token, "en-US");
  await setAccountLocale(adminContext, admin.csrf_token, "en-US");

  const batches = await api(learnerContext, "GET", "/api/v1/me/batches?limit=100");
  assert(batches.status === 200 && batches.body.data.items.length, `batches ${batches.raw}`);
  const batchId = batches.body.data.items[0].id;
  const review = await api(learnerContext, "POST", "/api/v1/me/review-sessions", learner.csrf_token, {
    mode: "single_batch",
    batch_id: batchId,
  });
  assert([200, 201].includes(review.status), `review ${review.status}: ${review.raw}`);
  const users = await api(adminContext, "GET", "/api/v1/admin/users?username=uat_learner&limit=10", admin.csrf_token);
  assert(users.status === 200 && users.body.data.items.length, `users ${users.raw}`);

  const routes = [
    ["PAGE-001", publicContext, "/"],
    ["PAGE-002", publicContext, "/register"],
    ["PAGE-003", publicContext, "/login"],
    ["PAGE-004", learnerContext, "/create"],
    ["PAGE-005", learnerContext, "/library"],
    ["PAGE-006", learnerContext, `/library/${batchId}`],
    ["PAGE-007", learnerContext, "/review"],
    ["PAGE-008", learnerContext, `/review/${review.body.data.session_id}`],
    ["PAGE-009", learnerContext, "/account"],
    ["PAGE-101", adminContext, "/admin/models"],
    ["PAGE-102", adminContext, "/admin/plans"],
    ["PAGE-103-list", adminContext, "/admin/users"],
    ["PAGE-103-detail", adminContext, `/admin/users/${users.body.data.items[0].id}`],
  ];
  const prototypeRoutes = [
    ["PAGE-001", "visitor", "default"],
    ["PAGE-002", "visitor", "default"],
    ["PAGE-003", "visitor", "default"],
    ["PAGE-004", "learner", "default"],
    ["PAGE-005", "learner", "default"],
    ["PAGE-006", "learner", "default"],
    ["PAGE-007", "learner", "default"],
    ["PAGE-008", "learner", "single-stage-1"],
    ["PAGE-009", "learner", "default"],
    ["PAGE-101", "admin", "default"],
    ["PAGE-102", "admin", "default"],
    ["PAGE-103", "admin", "default"],
  ];

  const actual = {};
  for (const [id, context, route] of routes) {
    const page = await context.newPage();
    actual[id] = await capture(page, `${actualBase}${route}`, `actual-en-${id}.png`);
    await page.close();
  }

  const prototype = {};
  for (const [id, role, state] of prototypeRoutes) {
    const page = await prototypeContext.newPage();
    const query = new URLSearchParams({ page: id, role, state, locale: "en-US" });
    prototype[id] = await capture(page, `${prototypeBase}?${query}`, `prototype-en-${id}.png`, true);
    await page.close();
  }

  const mobile = {};
  for (const [id, context, url, hidePrototypeTools] of [
    ["actual-home", publicContext, `${actualBase}/`, false],
    ["prototype-home", prototypeContext, `${prototypeBase}?page=PAGE-001&role=visitor&state=default&locale=en-US`, true],
    ["actual-create", learnerContext, `${actualBase}/create`, false],
    ["prototype-create", prototypeContext, `${prototypeBase}?page=PAGE-004&role=learner&state=default&locale=en-US`, true],
  ]) {
    const page = await context.newPage();
    await page.setViewportSize({ width: 390, height: 844 });
    mobile[id] = await capture(page, url, `${id}-en-mobile.png`, hidePrototypeTools);
    await page.close();
  }

  const failures = [];
  const comparableIds = ["PAGE-001", "PAGE-002", "PAGE-003", "PAGE-004", "PAGE-005", "PAGE-006", "PAGE-007", "PAGE-008", "PAGE-009", "PAGE-101", "PAGE-102"];
  for (const [id, snapshot] of Object.entries(actual)) {
    if (snapshot.lang !== "en-US") failures.push(`${id}: html lang=${snapshot.lang}`);
    if (snapshot.brand !== "WordWeave") failures.push(`${id}: English brand=${snapshot.brand}`);
    if (!snapshot.logo.svg || snapshot.logo.markText) failures.push(`${id}: logo is not the approved SVG mark`);
    if (snapshot.viewportOverflow > 0 || snapshot.overflowing.length) failures.push(`${id}: viewport overflow ${snapshot.viewportOverflow}; nodes=${JSON.stringify(snapshot.overflowing)}`);
    const unexpectedUnderlines = snapshot.underlinedAnchors.filter((anchor) => !String(anchor.classes).includes("skip-link"));
    if (unexpectedUnderlines.length) failures.push(`${id}: underlined anchors ${JSON.stringify(unexpectedUnderlines)}`);
  }
  for (const id of comparableIds) {
    const actualPageHeadings = actual[id].headings.filter((heading) => heading.startsWith("h1:") || heading.startsWith("h2:"));
    const prototypePageHeadings = prototype[id].headings.filter((heading) => heading.startsWith("h1:") || heading.startsWith("h2:"));
    if (JSON.stringify(actualPageHeadings) !== JSON.stringify(prototypePageHeadings)) failures.push(`${id}: page headings differ from prototype`);
    if (actual[id].bodyFont !== prototype[id].bodyFont) failures.push(`${id}: body font differs from prototype`);
    if (actual[id].titleFont !== prototype[id].titleFont) failures.push(`${id}: title font differs from prototype`);
  }
  for (const [name, snapshot] of Object.entries(mobile)) {
    if (snapshot.viewportOverflow > 0 || snapshot.overflowing.length) failures.push(`${name}: mobile overflow ${snapshot.viewportOverflow}; nodes=${JSON.stringify(snapshot.overflowing)}`);
  }
  for (const [actualKey, prototypeKey] of [["actual-home", "prototype-home"], ["actual-create", "prototype-create"]]) {
    const actualPageHeadings = mobile[actualKey].headings.filter((heading) => heading.startsWith("h1:") || heading.startsWith("h2:"));
    const prototypePageHeadings = mobile[prototypeKey].headings.filter((heading) => heading.startsWith("h1:") || heading.startsWith("h2:"));
    if (JSON.stringify(actualPageHeadings) !== JSON.stringify(prototypePageHeadings)) failures.push(`${actualKey}: mobile page headings differ from prototype`);
    if (mobile[actualKey].bodyFont !== mobile[prototypeKey].bodyFont || mobile[actualKey].titleFont !== mobile[prototypeKey].titleFont) failures.push(`${actualKey}: mobile typography differs from prototype`);
  }
  assert(failures.length === 0, failures.join("\n"));
  process.stdout.write(`${JSON.stringify({
    status: "PASS",
    locale: "en-US",
    actualPages: Object.keys(actual).length,
    prototypePages: Object.keys(prototype).length,
    mobilePairs: 2,
    checks: ["localized headings", "brand exclusivity", "SVG logo", "fonts", "viewport overflow", "anchor reset"],
    screenshotRoot: screenshotRoot.pathname,
  }, null, 2)}\n`);

  await setAccountLocale(learnerContext, learner.csrf_token, "zh-CN");
  await setAccountLocale(adminContext, admin.csrf_token, "zh-CN");
} finally {
  await Promise.all([publicContext.close(), learnerContext.close(), adminContext.close(), prototypeContext.close()]);
  await browser.close();
}
