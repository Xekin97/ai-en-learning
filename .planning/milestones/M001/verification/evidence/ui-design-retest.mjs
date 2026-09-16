import { chromium } from "../../../../../frontend/node_modules/@playwright/test/index.mjs";

const actualBase = process.env.WORDWEAVE_BASE_URL ?? "http://localhost:6001";
const prototypeBase = process.env.WORDWEAVE_PROTOTYPE_URL ?? "http://localhost:6010/prototype/index.html";
const screenshotRoot = new URL(process.env.WORDWEAVE_SCREENSHOT_DIR ?? "./screenshots/ui-design-retest-final-zh/", import.meta.url);
const headers = { origin: actualBase, "sec-fetch-site": "same-origin" };

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function api(context, method, path, csrfToken, data, extraHeaders = {}) {
  const options = { method, headers: { ...headers, ...extraHeaders } };
  if (csrfToken) options.headers["x-csrf-token"] = csrfToken;
  if (data !== undefined) options.data = data;
  const response = await context.request.fetch(path, options);
  const raw = await response.text();
  const body = raw && response.headers()["content-type"]?.includes("json") ? JSON.parse(raw) : null;
  return { status: response.status(), raw, body };
}

async function bootstrap(context) {
  const response = await api(context, "GET", "/api/v1/bootstrap");
  assert(response.status === 200, `bootstrap ${response.status}: ${response.raw}`);
  return response.body.data;
}

async function login(context, username, password, locale = "zh-CN") {
  const security = await bootstrap(context);
  const response = await api(context, "POST", "/api/v1/auth/login", security.csrf_token, {
    username,
    password,
    browser_ui_locale: locale,
  });
  assert(response.status === 200, `login ${username} ${response.status}: ${response.raw}`);
  return response.body.data;
}

function parseSSE(raw) {
  return raw
    .split(/\r?\n\r?\n/u)
    .map((block) => {
      const event = block.match(/^event:\s*(.+)$/mu)?.[1];
      const data = block.match(/^data:\s*(.+)$/mu)?.[1];
      return event && data ? { event, data: JSON.parse(data) } : null;
    })
    .filter(Boolean);
}

async function ensureBatch(context, csrf, modelId) {
  const current = await api(context, "GET", "/api/v1/me/batches?limit=100");
  assert(current.status === 200, `batches ${current.status}: ${current.raw}`);
  if (current.body.data.items.length) return current.body.data.items[0].id;
  const streamed = await api(context, "POST", "/api/v1/generations/stream", csrf, {
    model_id: modelId,
    meaning_language: "zh",
    scenario: "story",
    length: "short",
    entries: ["create", "resilient", "weave"],
  });
  assert(streamed.status === 200, `generation ${streamed.status}: ${streamed.raw}`);
  const events = parseSSE(streamed.raw);
  const started = events.find((event) => event.event === "generation.started")?.data;
  const validated = events.find((event) => event.event === "generation.validated")?.data;
  assert(started && validated, `generation did not validate: ${streamed.raw}`);
  const saved = await api(
    context,
    "POST",
    `/api/v1/generations/${started.run_id}/save`,
    csrf,
    {},
    { "x-generation-token": started.generation_token },
  );
  assert([200, 201].includes(saved.status), `save ${saved.status}: ${saved.raw}`);
  return saved.body.data.batch_id;
}

async function inspectPage(page) {
  return page.evaluate(() => {
    function box(selector) {
      const node = document.querySelector(selector);
      if (!node) return null;
      const rect = node.getBoundingClientRect();
      return {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      };
    }
    function style(selector) {
      const node = document.querySelector(selector);
      if (!node) return null;
      const computed = getComputedStyle(node);
      return {
        fontFamily: computed.fontFamily,
        fontSize: computed.fontSize,
        fontWeight: computed.fontWeight,
        lineHeight: computed.lineHeight,
        textDecoration: computed.textDecorationLine,
      };
    }
    const visibleAnchors = [...document.querySelectorAll("a")].filter((node) => {
      const rect = node.getBoundingClientRect();
      const computed = getComputedStyle(node);
      return rect.width > 0 && rect.height > 0 && computed.visibility !== "hidden" && computed.display !== "none";
    });
    return {
      title: document.title,
      h1: [...document.querySelectorAll("h1")].map((node) => node.textContent.trim()),
      h2: [...document.querySelectorAll("h2")].map((node) => node.textContent.trim()),
      h3: [...document.querySelectorAll("h3")].map((node) => node.textContent.trim()),
      bodyText: document.body.innerText.split("\n").map((value) => value.trim()).filter(Boolean),
      brandMarkup: document.querySelector(".brand")?.innerHTML.trim() ?? null,
      navItems: [...document.querySelectorAll(".main-nav .nav-link")].map((node) => node.textContent.trim()),
      underlinedAnchors: visibleAnchors
        .map((node) => ({
          text: node.textContent.trim(),
          href: node.getAttribute("href"),
          classes: node.className,
          decoration: getComputedStyle(node).textDecorationLine,
        }))
        .filter((item) => item.decoration !== "none"),
      styles: {
        body: style("body"),
        brand: style(".brand-name"),
        heroTitle: style(".hero-title"),
        heroCopy: style(".hero-copy"),
        pageTitle: style(".page-title"),
      },
      boxes: {
        header: box(".app-header"),
        hero: box(".hero"),
        heroGrid: box(".hero-grid"),
        pathGrid: box(".path-grid"),
        studioGrid: box(".studio-grid"),
        adminShell: box(".admin-shell"),
      },
      viewport: { width: innerWidth, height: innerHeight, documentWidth: document.documentElement.scrollWidth },
    };
  });
}

async function capture(page, url, filename, hidePrototypeTools = false) {
  const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 10_000 });
  assert(response && response.status() < 400, `${url} status ${response?.status()}`);
  await page.waitForTimeout(250);
  if (hidePrototypeTools) await page.locator(".prototype-tools").evaluate((node) => { node.style.display = "none"; });
  await page.screenshot({ path: new URL(filename, screenshotRoot).pathname, fullPage: true });
  return inspectPage(page);
}

const browser = await chromium.launch({ headless: true });
const publicContext = await browser.newContext({ baseURL: actualBase, locale: "zh-CN", viewport: { width: 1440, height: 1000 } });
const learnerContext = await browser.newContext({ baseURL: actualBase, locale: "zh-CN", viewport: { width: 1440, height: 1000 } });
const adminContext = await browser.newContext({ baseURL: actualBase, locale: "zh-CN", viewport: { width: 1440, height: 1000 } });
const prototypeContext = await browser.newContext({ locale: "zh-CN", viewport: { width: 1440, height: 1000 } });

try {
  const learner = await login(learnerContext, "uat_learner", "UatLearnerPass6000!");
  const admin = await login(adminContext, "uat_admin", "UatAdminPass6000!");
  const options = await api(learnerContext, "GET", "/api/v1/generation-options");
  assert(options.status === 200 && options.body.data.models.length, `learner options ${options.raw}`);
  const batchId = await ensureBatch(learnerContext, learner.csrf_token, options.body.data.models[0].id);
  const review = await api(learnerContext, "POST", "/api/v1/me/review-sessions", learner.csrf_token, {
    mode: "single_batch",
    batch_id: batchId,
  });
  assert([200, 201].includes(review.status), `review session ${review.status}: ${review.raw}`);
  const reviewSessionId = review.body.data.session_id;
  const users = await api(adminContext, "GET", "/api/v1/admin/users?username=uat_learner&limit=10", admin.csrf_token);
  assert(users.status === 200 && users.body.data.items.length, `admin user search ${users.raw}`);
  const learnerUserId = users.body.data.items[0].id;

  const actualRoutes = [
    ["PAGE-001", publicContext, "/"],
    ["PAGE-002", publicContext, "/register"],
    ["PAGE-003", publicContext, "/login"],
    ["PAGE-004", learnerContext, "/create"],
    ["PAGE-005", learnerContext, "/library"],
    ["PAGE-006", learnerContext, `/library/${batchId}`],
    ["PAGE-007", learnerContext, "/review"],
    ["PAGE-008", learnerContext, `/review/${reviewSessionId}`],
    ["PAGE-009", learnerContext, "/account"],
    ["PAGE-101", adminContext, "/admin/models"],
    ["PAGE-102", adminContext, "/admin/plans"],
    ["PAGE-103-list", adminContext, "/admin/users"],
    ["PAGE-103-detail", adminContext, `/admin/users/${learnerUserId}`],
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
  for (const [id, context, route] of actualRoutes) {
    const page = await context.newPage();
    actual[id] = await capture(page, `${actualBase}${route}`, `actual-${id}.png`);
    await page.close();
  }

  const prototype = {};
  for (const [id, role, state] of prototypeRoutes) {
    const page = await prototypeContext.newPage();
    const query = new URLSearchParams({ page: id, role, state, locale: "zh-CN" });
    prototype[id] = await capture(page, `${prototypeBase}?${query}`, `prototype-${id}.png`, true);
    await page.close();
  }

  const mobile = {};
  for (const [kind, context, url, prototypeTools] of [
    ["actual-home", publicContext, `${actualBase}/`, false],
    ["prototype-home", prototypeContext, `${prototypeBase}?page=PAGE-001&role=visitor&state=default&locale=zh-CN`, true],
    ["actual-create", learnerContext, `${actualBase}/create`, false],
    ["prototype-create", prototypeContext, `${prototypeBase}?page=PAGE-004&role=learner&state=default&locale=zh-CN`, true],
  ]) {
    const page = await context.newPage();
    await page.setViewportSize({ width: 390, height: 844 });
    mobile[kind] = await capture(page, url, `${kind}-mobile.png`, prototypeTools);
    await page.close();
  }

  const failures = [];
  const responsiveMatrix = [];
  const comparableIds = ["PAGE-001", "PAGE-002", "PAGE-003", "PAGE-004", "PAGE-005", "PAGE-006", "PAGE-007", "PAGE-008", "PAGE-009", "PAGE-101", "PAGE-102"];
  const bannedCopy = ["忽略大小写", "前缀结果优先", "只能选择完整词条", "每次都需要重新确认", "主动取消会消耗", "至少 xx 词", "必选", "访客组", "完整性校验通过"];
  for (const [id, snapshot] of Object.entries(actual)) {
    if (snapshot.viewport.documentWidth > snapshot.viewport.width) failures.push(`${id}: viewport overflow ${snapshot.viewport.documentWidth}>${snapshot.viewport.width}`);
    const unexpectedUnderlines = snapshot.underlinedAnchors.filter((anchor) => !String(anchor.classes).includes("skip-link"));
    if (unexpectedUnderlines.length) failures.push(`${id}: underlined anchors ${JSON.stringify(unexpectedUnderlines)}`);
    if (!snapshot.brandMarkup?.includes("brand-mark") || !snapshot.brandMarkup.includes("词涟") || snapshot.brandMarkup.includes("WordWeave")) failures.push(`${id}: invalid zh-CN brand ${snapshot.brandMarkup}`);
    const renderedCopy = snapshot.bodyText.join(" ");
    for (const phrase of bannedCopy) if (renderedCopy.includes(phrase)) failures.push(`${id}: internal requirement copy exposed: ${phrase}`);
  }
  for (const id of comparableIds) {
    if (JSON.stringify(actual[id].h1) !== JSON.stringify(prototype[id].h1)) failures.push(`${id}: h1 differs from prototype`);
    if (actual[id].styles.body?.fontFamily !== prototype[id].styles.body?.fontFamily) failures.push(`${id}: body font differs from prototype`);
    if (actual[id].styles.pageTitle?.fontFamily !== prototype[id].styles.pageTitle?.fontFamily) failures.push(`${id}: title font differs from prototype`);
  }
  for (const [name, snapshot] of Object.entries(mobile)) {
    if (snapshot.viewport.documentWidth > snapshot.viewport.width) failures.push(`${name}: mobile viewport overflow`);
  }
  for (const [actualKey, prototypeKey] of [["actual-home", "prototype-home"], ["actual-create", "prototype-create"]]) {
    if (JSON.stringify(mobile[actualKey].h1) !== JSON.stringify(mobile[prototypeKey].h1)) failures.push(`${actualKey}: mobile h1 differs from prototype`);
    for (const boxName of ["header", "heroGrid", "pathGrid", "studioGrid"]) {
      const actualBox = mobile[actualKey].boxes[boxName];
      const prototypeBox = mobile[prototypeKey].boxes[boxName];
      if (!actualBox && !prototypeBox) continue;
      if (!actualBox || !prototypeBox || Math.abs(actualBox.x - prototypeBox.x) > 1 || Math.abs(actualBox.width - prototypeBox.width) > 1 || Math.abs(actualBox.height - prototypeBox.height) > 2) failures.push(`${actualKey}: ${boxName} geometry differs from prototype`);
    }
  }
  for (const width of [320, 390, 720]) {
    for (const [id, context, route] of actualRoutes) {
      const page = await context.newPage();
      await page.setViewportSize({ width, height: 900 });
      const response = await page.goto(`${actualBase}${route}`, { waitUntil: "domcontentloaded", timeout: 10_000 });
      assert(response && response.status() < 400, `${id}@${width} status ${response?.status()}`);
      await page.waitForTimeout(100);
      const layout = await page.evaluate(() => ({
        viewportWidth: innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        h1: document.querySelector("h1")?.textContent?.trim() ?? null,
        brand: document.querySelector(".brand-name")?.textContent?.trim() ?? null,
      }));
      responsiveMatrix.push({ id, width, ...layout });
      if (layout.documentWidth > layout.viewportWidth) failures.push(`${id}@${width}: viewport overflow ${layout.documentWidth}>${layout.viewportWidth}`);
      if (layout.brand !== "词涟") failures.push(`${id}@${width}: invalid responsive brand ${layout.brand}`);
      await page.close();
    }
  }
  assert(failures.length === 0, failures.join("\n"));
  process.stdout.write(`${JSON.stringify({
    status: "PASS",
    locale: "zh-CN",
    actualPages: Object.keys(actual).length,
    prototypePages: Object.keys(prototype).length,
    mobilePairs: 2,
    responsiveCases: responsiveMatrix.length,
    checks: ["headings", "brand", "fonts", "responsive geometry", "39-case viewport matrix", "viewport overflow", "anchor reset", "product copy hygiene"],
    screenshotRoot: screenshotRoot.pathname,
    batchId,
    reviewSessionId,
  }, null, 2)}\n`);
} finally {
  await Promise.all([
    publicContext.close(),
    learnerContext.close(),
    adminContext.close(),
    prototypeContext.close(),
  ]);
  await browser.close();
}
