import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import AxeBuilder from "../../../../../frontend/node_modules/@axe-core/playwright/dist/index.js";
import { chromium } from "../../../../../frontend/node_modules/@playwright/test/index.mjs";

const baseURL = process.env.WORDWEAVE_QA_BASE_URL ?? "http://localhost:6020";
const prototypeURL =
  process.env.WORDWEAVE_PROTOTYPE_URL ??
  "http://localhost:6010/prototype/index.html";
const evidenceDir = dirname(fileURLToPath(import.meta.url));
const screenshotDir = join(evidenceDir, "screenshots", "cr024-final-retest");
const resultPath = join(evidenceDir, "cr024-final-retest-results.json");
mkdirSync(screenshotDir, { recursive: true });

const checks = [];
const observations = [];

function normalize(value) {
  return String(value ?? "")
    .replace(/\s+/gu, " ")
    .trim();
}

function stable(value) {
  return JSON.stringify(value);
}

function record(name, actual, expected) {
  const pass = stable(actual) === stable(expected);
  checks.push({ name, status: pass ? "PASS" : "FAIL", actual, expected });
  return pass;
}

function recordCondition(name, pass, details = {}) {
  checks.push({ name, status: pass ? "PASS" : "FAIL", ...details });
  return pass;
}

async function suite(name, callback) {
  try {
    process.stdout.write(`Checking ${name}\\n`.replace(/\\n/gu, "\n"));
    await callback();
  } catch (error) {
    checks.push({
      name: `${name} setup/execution`,
      status: "FAIL",
      error: error instanceof Error ? error.stack ?? error.message : String(error),
    });
  }
}

async function ready(page) {
  await page.waitForFunction(
    () => document.documentElement.dataset.appReady === "true",
    null,
    { timeout: 15_000 },
  );
}

async function openActual(browser, { role, locale, viewport, path, cookies = [] }) {
  const context = await browser.newContext({ baseURL, locale, viewport });
  const roleCookies = [];
  if (role !== "visitor") {
    roleCookies.push(
      { name: "wordweave_session", value: role, url: baseURL },
      { name: "wordweave_ui_locale", value: locale, url: baseURL },
    );
  }
  if (roleCookies.length || cookies.length)
    await context.addCookies([...roleCookies, ...cookies.map((cookie) => ({ ...cookie, url: baseURL }))]);
  const page = await context.newPage();
  const apiRequests = [];
  page.on("request", request => { if (new URL(request.url()).pathname.startsWith("/api/v1/")) apiRequests.push(new URL(request.url()).pathname); });
  const startedAt = performance.now();
  const response = await page.goto(path, { waitUntil: "domcontentloaded" });
  await ready(page);
  observations.push({
    kind: "navigation",
    page: path,
    role,
    locale,
    viewport,
    status: response?.status() ?? null,
    ready_ms: Math.round(performance.now() - startedAt),
  });
  return { context, page, apiRequests };
}

async function openPrototype(browser, { pageId, role, state, locale, viewport }) {
  const context = await browser.newContext({ locale, viewport });
  const page = await context.newPage();
  const url = `${prototypeURL}?page=${pageId}&role=${role}&state=${state}&locale=${locale}`;
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.locator("main").waitFor();
  const tools = page.locator(".prototype-tools");
  if (await tools.count())
    await tools.evaluate((node) => {
      node.style.display = "none";
    });
  return { context, page };
}

async function texts(locator) {
  return (await locator.allTextContents()).map(normalize).filter(Boolean);
}

async function factText(locator) {
  return normalize(await locator.innerText());
}

async function overflow(page) {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
}

async function cardMetrics(locator) {
  return locator.evaluate((node) => {
    const style = getComputedStyle(node);
    const box = node.getBoundingClientRect();
    return {
      width: Math.round(box.width * 10) / 10,
      paddingTop: style.paddingTop,
      paddingRight: style.paddingRight,
      paddingBottom: style.paddingBottom,
      paddingLeft: style.paddingLeft,
      textAlign: style.textAlign,
      borderRadius: style.borderRadius,
    };
  });
}

async function axeSerious(page) {
  const result = await new AxeBuilder({ page }).analyze();
  return result.violations
    .filter(
      (violation) =>
        violation.impact === "serious" || violation.impact === "critical",
    )
    .map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      nodes: violation.nodes.length,
    }));
}

async function dialogFacts(page) {
  const dialog = page.getByRole("dialog");
  await dialog.waitFor();
  return {
    title: await factText(dialog.getByRole("heading").first()),
    labels: await texts(dialog.locator(".field-label")),
    helpers: await texts(dialog.locator(".field > .helper")),
    notices: await texts(dialog.locator(".notice")),
    footerButtons: await texts(dialog.locator(".dialog-footer button")),
    inputTypes: await dialog
      .locator("input")
      .evaluateAll((nodes) => nodes.map((node) => node.type)),
    textInputBackgrounds: await dialog
      .locator('input:not([type="checkbox"])')
      .evaluateAll((nodes) => nodes.map((node) => getComputedStyle(node).backgroundColor)),
  };
}

async function modelInputSurfaces(page) {
  return page.getByRole("dialog").locator('input:not([type="checkbox"])').evaluateAll(nodes => nodes.map(node => {
    const style = getComputedStyle(node);
    return { background: style.backgroundColor, padding: style.padding, borderRadius: style.borderRadius, height: Math.round(node.getBoundingClientRect().height) };
  }));
}

async function closeDialog(page) {
  const quiet = page.getByRole("dialog").locator(".dialog-footer .button-quiet");
  if (await quiet.count()) await quiet.click();
  else await page.getByRole("dialog").locator(".dialog-footer button").first().click();
}

async function adminModelSuite(browser, locale, viewport) {
  const actual = await openActual(browser, {
    role: "admin",
    locale,
    viewport,
    path: "/admin/models",
  });
  const prototype = await openPrototype(browser, {
    pageId: "PAGE-101",
    role: "admin",
    state: "default",
    locale,
    viewport,
  });
  try {
    const prefix = `CR-024 Models ${locale} ${viewport.width}`;
    record(
      `${prefix} heading`,
      await texts(actual.page.locator(".page-heading .eyebrow, .page-heading .page-title, .page-heading .page-description")),
      (await texts(prototype.page.locator(".page-heading .eyebrow, .page-heading .page-title, .page-heading .page-description"))).map((text, index) => index === 0 ? text.toUpperCase() : text),
    );
    record(
      `${prefix} sidebar section label`,
      await factText(actual.page.locator(".admin-label")),
      await factText(prototype.page.locator(".admin-label")),
    );
    recordCondition(
      `${prefix} visible model statuses use approved vocabulary`,
      (await texts(actual.page.locator(".model-row .status-badge"))).every((text) =>
        locale === "zh-CN" ? ["已启用", "已停用"].includes(text) : ["Active", "Inactive"].includes(text),
      ),
      { actual: await texts(actual.page.locator(".model-row .status-badge")) },
    );
    record(
      `${prefix} edit action`,
      await texts(actual.page.locator(".model-row .button")),
      Array.from({ length: await actual.page.locator(".model-row .button").count() }, () =>
        locale === "zh-CN" ? "编辑" : "Edit",
      ),
    );
    const assignmentCopy = await texts(actual.page.locator(".model-row .model-meta, .model-row .helper"));
    recordCondition(
      `${prefix} model assignment copy`,
      assignmentCopy.length > 0 && assignmentCopy.every((text) =>
        locale === "zh-CN" ? /\d+ 个组引用/u.test(text) : /\d+ plans assignments/u.test(text),
      ),
      { actual: assignmentCopy },
    );

    await actual.page.locator(".page-heading .button-primary").click();
    await prototype.page.locator('[data-action="add-model"]').first().click();
    record(
      `${prefix} add dialog`,
      await dialogFacts(actual.page),
      await dialogFacts(prototype.page),
    );
    record(`${prefix} add input surfaces and geometry`, await modelInputSurfaces(actual.page), await modelInputSurfaces(prototype.page));
    record(`${prefix} add modal Axe serious/critical`, await axeSerious(actual.page), []);
    recordCondition(`${prefix} add modal no horizontal overflow`, (await overflow(actual.page)) <= 1, { actual: await overflow(actual.page) });
    await actual.page.screenshot({
      path: join(screenshotDir, `actual-model-add-${locale}-${viewport.width}.png`),
      fullPage: true,
    });
    await prototype.page.screenshot({
      path: join(screenshotDir, `prototype-model-add-${locale}-${viewport.width}.png`),
      fullPage: true,
    });
    await closeDialog(actual.page);
    await closeDialog(prototype.page);

    await actual.page.locator(".model-row .button").first().click();
    await prototype.page.locator('[data-action="edit-model"]').first().click();
    record(
      `${prefix} edit dialog`,
      await dialogFacts(actual.page),
      await dialogFacts(prototype.page),
    );
    record(`${prefix} edit input surfaces and geometry`, await modelInputSurfaces(actual.page), await modelInputSurfaces(prototype.page));
    record(`${prefix} edit modal Axe serious/critical`, await axeSerious(actual.page), []);
    recordCondition(`${prefix} edit modal no horizontal overflow`, (await overflow(actual.page)) <= 1, { actual: await overflow(actual.page) });
    await actual.page.screenshot({
      path: join(screenshotDir, `actual-model-edit-${locale}-${viewport.width}.png`),
      fullPage: true,
    });
    await closeDialog(actual.page);
    await closeDialog(prototype.page);

    await actual.page.locator(".admin-main .card .card-footer .button").first().click();
    await prototype.page.locator('[data-action="replace-key"]').click();
    record(
      `${prefix} key dialog`,
      await dialogFacts(actual.page),
      await dialogFacts(prototype.page),
    );
    const actualBackground = await actual.page
      .getByRole("dialog")
      .locator("input")
      .evaluate((node) => getComputedStyle(node).backgroundColor);
    const prototypeBackground = await prototype.page
      .getByRole("dialog")
      .locator("input")
      .evaluate((node) => getComputedStyle(node).backgroundColor);
    record(`${prefix} key input background`, actualBackground, prototypeBackground);
    await actual.page.screenshot({
      path: join(screenshotDir, `actual-model-key-${locale}-${viewport.width}.png`),
      fullPage: true,
    });
    await closeDialog(actual.page);
    await closeDialog(prototype.page);

    recordCondition(`${prefix} no horizontal overflow`, (await overflow(actual.page)) <= 1, {
      actual: await overflow(actual.page),
    });
    record(`${prefix} Axe serious/critical`, await axeSerious(actual.page), []);
  } finally {
    await actual.context.close();
    await prototype.context.close();
  }
}

async function adminPlansSuite(browser, locale, viewport) {
  const actual = await openActual(browser, {
    role: "admin",
    locale,
    viewport,
    path: "/admin/plans",
  });
  const prototype = await openPrototype(browser, {
    pageId: "PAGE-102",
    role: "admin",
    state: "default",
    locale,
    viewport,
  });
  try {
    const prefix = `CR-024 Plans ${locale} ${viewport.width}`;
    record(
      `${prefix} heading`,
      await texts(actual.page.locator(".page-heading .eyebrow, .page-heading .page-title, .page-heading .page-description")),
      (await texts(prototype.page.locator(".page-heading .eyebrow, .page-heading .page-title, .page-heading .page-description"))).map((text, index) => index === 0 ? text.toUpperCase() : text),
    );
    record(
      `${prefix} plan tabs`,
      await texts(actual.page.locator('[role="tab"]')),
      await texts(prototype.page.locator('[role="tab"]')),
    );
    record(
      `${prefix} field labels`,
      await texts(actual.page.locator(".admin-grid .field-label")),
      await texts(prototype.page.locator(".admin-grid .field-label")),
    );
    record(
      `${prefix} save copy`,
      await factText(actual.page.locator(".card-footer .button-primary")),
      await factText(prototype.page.locator(".card-footer .button-primary")),
    );
    const actualMargin = await actual.page
      .getByText(locale === "zh-CN" ? "可用模型" : "Available models", { exact: true })
      .evaluate((node) => getComputedStyle(node).marginBottom);
    record(`${prefix} Available models spacing`, actualMargin, "8px");
    recordCondition(`${prefix} no horizontal overflow`, (await overflow(actual.page)) <= 1, {
      actual: await overflow(actual.page),
    });
    record(`${prefix} Axe serious/critical`, await axeSerious(actual.page), []);
    await actual.page.screenshot({
      path: join(screenshotDir, `actual-plans-${locale}-${viewport.width}.png`),
      fullPage: true,
    });
    await prototype.page.screenshot({
      path: join(screenshotDir, `prototype-plans-${locale}-${viewport.width}.png`),
      fullPage: true,
    });
  } finally {
    await actual.context.close();
    await prototype.context.close();
  }
}

async function adminUsersSuite(browser, locale, viewport) {
  const actual = await openActual(browser, {
    role: "admin",
    locale,
    viewport,
    path: "/admin/users",
  });
  const prototypeDefault = await openPrototype(browser, {
    pageId: "PAGE-103",
    role: "admin",
    state: "default",
    locale,
    viewport,
  });
  const prototypeResults = await openPrototype(browser, {
    pageId: "PAGE-103",
    role: "admin",
    state: "results",
    locale,
    viewport,
  });
  try {
    const prefix = `CR-024 Users ${locale} ${viewport.width}`;
    record(
      `${prefix} heading`,
      await texts(actual.page.locator(".page-heading .eyebrow, .page-heading .page-title, .page-heading .page-description")),
      (await texts(prototypeDefault.page.locator(".page-heading .eyebrow, .page-heading .page-title, .page-heading .page-description"))).map((text, index) => index === 0 ? text.toUpperCase() : text),
    );
    record(
      `${prefix} initial empty state`,
      await factText(actual.page.locator(".admin-user-empty")),
      await factText(prototypeDefault.page.locator(".admin-user-empty")),
    );
    const input = actual.page.locator('[role="search"] input');
    await input.fill("learner_e2e");
    await actual.page.locator('[role="search"] button[type=submit]').click();
    await actual.page.locator(".admin-user-result").first().waitFor();
    const first = actual.page.locator(".admin-user-result").first();
    record(
      `${prefix} learner result projection`,
      {
        meta: await factText(first.locator(".user-meta")),
        planLabel: await factText(first.locator(".admin-user-plan .helper")),
        plan: await factText(first.locator(".admin-user-plan strong")),
        status: await factText(first.locator(".status-badge")),
        action: await factText(first.locator(".button")),
      },
      locale === "zh-CN"
        ? {
            meta: "学习者 · 创建于 2026-08-10",
            planLabel: "当前方案",
            plan: "基础版",
            status: "正常",
            action: "查看",
          }
        : {
            meta: "Learner · Joined 2026-08-10",
            planLabel: "Plan",
            plan: "Basic",
            status: "Active",
            action: "View",
          },
    );
    record(
      `${prefix} result row structural order`,
      await first.evaluate((row) =>
        [...row.children].map((child) => child.className.split(" ")[0]),
      ),
      await prototypeResults.page
        .locator(".admin-user-result")
        .first()
        .evaluate((row) => [...row.children].map((child) => child.className.split(" ")[0])),
    );
    recordCondition(`${prefix} no horizontal overflow`, (await overflow(actual.page)) <= 1, {
      actual: await overflow(actual.page),
    });
    record(`${prefix} Axe serious/critical`, await axeSerious(actual.page), []);
    await actual.page.screenshot({
      path: join(screenshotDir, `actual-users-results-${locale}-${viewport.width}.png`),
      fullPage: true,
    });
    await prototypeResults.page.screenshot({
      path: join(screenshotDir, `prototype-users-results-${locale}-${viewport.width}.png`),
      fullPage: true,
    });
  } finally {
    await actual.context.close();
    await prototypeDefault.context.close();
    await prototypeResults.context.close();
  }
}

async function authGateSuite(browser, locale, viewport, path, pageId) {
  const actual = await openActual(browser, {
    role: "visitor",
    locale,
    viewport,
    path,
  });
  const prototype = await openPrototype(browser, {
    pageId,
    role: "visitor",
    state: "default",
    locale,
    viewport,
  });
  try {
    const prefix = `CR-025 ${path} gate ${locale} ${viewport.width}`;
    const actualGate = actual.page.locator(".auth-gate");
    const prototypeGate = prototype.page.locator(".empty-state.card");
    record(`${prefix} route retained`, new URL(actual.page.url()).pathname, path);
    const expectedCopy = locale === "zh-CN"
      ? `需要登录 登录后打开“${path === "/review" ? "复习" : "学习记录"}” 登录后即可继续复习并保留学习记录。 登录并继续 创建账号`
      : `SIGN IN TO CONTINUE Sign in to open ${path === "/review" ? "Review" : "Library"} Keep your library and continue reviewing from any session. Sign in and continue Create account`;
    record(`${prefix} visible copy`, await factText(actualGate), expectedCopy);
    record(`${prefix} card metrics`, await cardMetrics(actualGate), await cardMetrics(prototypeGate));
    record(`${prefix} no client private API request`, actual.apiRequests.filter(path => path.startsWith("/api/v1/me/")), []);
    recordCondition(`${prefix} no horizontal overflow`, (await overflow(actual.page)) <= 1, {
      actual: await overflow(actual.page),
    });
    record(`${prefix} Axe serious/critical`, await axeSerious(actual.page), []);
    await actual.page.screenshot({
      path: join(screenshotDir, `actual-gate-${path.slice(1)}-${locale}-${viewport.width}.png`),
      fullPage: true,
    });
    await prototype.page.screenshot({
      path: join(screenshotDir, `prototype-gate-${path.slice(1)}-${locale}-${viewport.width}.png`),
      fullPage: true,
    });
  } finally {
    await actual.context.close();
    await prototype.context.close();
  }
}

async function loginErrorSuite(browser, locale, viewport) {
  const actual = await openActual(browser, {
    role: "visitor",
    locale,
    viewport,
    path: "/login",
  });
  const prototype = await openPrototype(browser, {
    pageId: "PAGE-003",
    role: "visitor",
    state: "error",
    locale,
    viewport,
  });
  try {
    const prefix = `CR-025 login error ${locale} ${viewport.width}`;
    const username = actual.page.locator("form input").first();
    await username.fill("learner_e2e");
    await actual.page.locator('input[type="password"]').fill("WrongPass123!");
    await actual.page.locator('button[type="submit"]').click();
    const actualNotice = actual.page.locator(".app-error");
    await actualNotice.waitFor();
    const prototypeNotice = prototype.page.locator(".notice-danger");
    record(`${prefix} notice copy`, await factText(actualNotice), await factText(prototypeNotice));
    record(
      `${prefix} approved notice children`,
      {
        icon: await actualNotice.locator(":scope > .icon").count(),
        content: await actualNotice.locator(":scope > div").count(),
      },
      { icon: 1, content: 1 },
    );
    record(`${prefix} username retained`, await username.inputValue(), "learner_e2e");
    recordCondition(
      `${prefix} request id hidden`,
      !(await factText(actualNotice)).includes("req-"),
      { actual: await factText(actualNotice) },
    );
    recordCondition(`${prefix} no horizontal overflow`, (await overflow(actual.page)) <= 1, {
      actual: await overflow(actual.page),
    });
    record(`${prefix} Axe serious/critical`, await axeSerious(actual.page), []);
    await actual.page.screenshot({
      path: join(screenshotDir, `actual-login-error-${locale}-${viewport.width}.png`),
      fullPage: true,
    });
    await prototype.page.screenshot({
      path: join(screenshotDir, `prototype-login-error-${locale}-${viewport.width}.png`),
      fullPage: true,
    });
  } finally {
    await actual.context.close();
    await prototype.context.close();
  }
}

async function librarySuite(browser, locale, viewport) {
  const normal = await openActual(browser, {
    role: "learner",
    locale,
    viewport,
    path: "/library",
  });
  const prototypeNormal = await openPrototype(browser, {
    pageId: "PAGE-005",
    role: "learner",
    state: "default",
    locale,
    viewport,
  });
  const empty = await openActual(browser, {
    role: "learner",
    locale,
    viewport,
    path: "/library",
    cookies: [{ name: "wordweave_test_library", value: "empty" }],
  });
  const prototypeEmpty = await openPrototype(browser, {
    pageId: "PAGE-005",
    role: "learner",
    state: "empty",
    locale,
    viewport,
  });
  try {
    const prefix = `CR-026 Library ${locale} ${viewport.width}`;
    record(
      `${prefix} normal heading`,
      await texts(normal.page.locator(".page-heading .eyebrow, .page-heading .page-title, .page-heading .page-description")),
      await texts(prototypeNormal.page.locator(".page-heading .eyebrow, .page-heading .page-title, .page-heading .page-description")),
    );
    record(
      `${prefix} six statistics labels`,
      await texts(normal.page.locator(".stats-grid .stat-label")),
      await texts(prototypeNormal.page.locator(".stats-grid .stat-label")),
    );
    record(`${prefix} statistics count`, await normal.page.locator(".stat-card").count(), 6);
    const search = normal.page.locator(".toolbar-search input");
    await search.fill("absentword");
    await search.press("Enter");
    await normal.page.locator(".empty-state").waitFor();
    const prototypeSearch = await openPrototype(browser, {
      pageId: "PAGE-005",
      role: "learner",
      state: "search-empty",
      locale,
      viewport,
    });
    try {
      record(
        `${prefix} search-empty copy`,
        await factText(normal.page.locator(".empty-state")),
        await factText(prototypeSearch.page.locator(".empty-state")),
      );
      record(
        `${prefix} search-empty retains context`,
        {
          stats: await normal.page.locator(".stat-card").count(),
          search: await normal.page.locator(".toolbar-search input").count(),
          dateReview: await normal.page.locator('.page-heading a[href="/review"]').count(),
        },
        { stats: 6, search: 1, dateReview: 1 },
      );
      await prototypeSearch.context.close();
    } catch (error) {
      await prototypeSearch.context.close();
      throw error;
    }

    record(
      `${prefix} first-empty heading`,
      await texts(empty.page.locator(".page-heading .eyebrow, .page-heading .page-title, .page-heading .page-description")),
      await texts(prototypeEmpty.page.locator(".page-heading .eyebrow, .page-heading .page-title, .page-heading .page-description")),
    );
    record(
      `${prefix} first-empty copy`,
      await factText(empty.page.locator(".empty-state")),
      await factText(prototypeEmpty.page.locator(".empty-state")),
    );
    record(
      `${prefix} first-empty mutual exclusion`,
      {
        stats: await empty.page.locator(".stats-grid").count(),
        search: await empty.page.locator(".toolbar-search input").count(),
        dateReview: await empty.page.locator('.page-heading a[href="/review"]').count(),
      },
      { stats: 0, search: 0, dateReview: 0 },
    );
    recordCondition(`${prefix} normal no horizontal overflow`, (await overflow(normal.page)) <= 1, {
      actual: await overflow(normal.page),
    });
    recordCondition(`${prefix} empty no horizontal overflow`, (await overflow(empty.page)) <= 1, {
      actual: await overflow(empty.page),
    });
    record(`${prefix} normal Axe serious/critical`, await axeSerious(normal.page), []);
    record(`${prefix} empty Axe serious/critical`, await axeSerious(empty.page), []);
    await normal.page.screenshot({
      path: join(screenshotDir, `actual-library-search-empty-${locale}-${viewport.width}.png`),
      fullPage: true,
    });
    await empty.page.screenshot({
      path: join(screenshotDir, `actual-library-first-empty-${locale}-${viewport.width}.png`),
      fullPage: true,
    });
    await prototypeEmpty.page.screenshot({
      path: join(screenshotDir, `prototype-library-first-empty-${locale}-${viewport.width}.png`),
      fullPage: true,
    });
  } finally {
    await normal.context.close();
    await prototypeNormal.context.close();
    await empty.context.close();
    await prototypeEmpty.context.close();
  }
}

const summaryExpectations = {
  "en-US": {
    singleComplete: {
      eyebrow: "STORY REVIEW COMPLETE",
      title: "This story is complete",
      description: "You’re done for today. Keep it going.",
      restart: "Review this story again",
      values: ["1", "1", "0"],
      labels: ["Completed", "Mastered", "Review again"],
      view: "View library",
    },
    singleIncomplete: {
      eyebrow: "STORY REVIEW COMPLETE",
      title: "Give this story another try",
      description: "That’s okay. Try it again next round.",
      restart: "Review this story again",
      values: ["1", "0", "1"],
      labels: ["Completed", "Mastered", "Review again"],
      view: "View library",
    },
    rangeComplete: {
      eyebrow: "DATE REVIEW COMPLETE",
      title: "All 5 stories completed",
      description: "You’re done for today. Keep it going.",
      restart: "Review again",
      values: ["5", "4", "1"],
      labels: ["Completed", "Mastered", "Review again"],
      view: "View library",
    },
    rangeIncomplete: {
      eyebrow: "DATE REVIEW COMPLETE",
      title: "5 stories reviewed",
      description: "A few stories need another look. See you next time.",
      restart: "Review again",
      values: ["5", "3", "2"],
      labels: ["Completed", "Mastered", "Review again"],
      view: "View library",
    },
  },
  "zh-CN": {
    singleComplete: {
      eyebrow: "本篇复习完成",
      title: "这篇已经完成",
      description: "今天的复习完成了，继续保持。",
      restart: "再复习本篇",
      values: ["1", "1", "0"],
      labels: ["已完成", "已掌握", "下次再来"],
      view: "查看学习记录",
    },
    singleIncomplete: {
      eyebrow: "本篇复习完成",
      title: "这篇还可以再试",
      description: "没有关系，下一轮再试一次。",
      restart: "再复习本篇",
      values: ["1", "0", "1"],
      labels: ["已完成", "已掌握", "下次再来"],
      view: "查看学习记录",
    },
    rangeComplete: {
      eyebrow: "日期复习完成",
      title: "5 篇全部完成",
      description: "今天的复习完成了，继续保持。",
      restart: "再复习一轮",
      values: ["5", "4", "1"],
      labels: ["已完成", "已掌握", "下次再来"],
      view: "查看学习记录",
    },
    rangeIncomplete: {
      eyebrow: "日期复习完成",
      title: "完成 5 篇复习",
      description: "有几篇还不熟悉，下次再见。",
      restart: "再复习一轮",
      values: ["5", "3", "2"],
      labels: ["已完成", "已掌握", "下次再来"],
      view: "查看学习记录",
    },
  },
};

const summaryCases = [
  {
    id: "singleComplete",
    path: "/review/session-single-complete?batch=batch-e2e",
    prototypeState: "single-summary",
  },
  {
    id: "singleIncomplete",
    path: "/review/session-single-incomplete?batch=batch-e2e",
    prototypeState: "single-summary",
  },
  {
    id: "rangeComplete",
    path: "/review/session-range-complete",
    prototypeState: "summary",
  },
  {
    id: "rangeIncomplete",
    path: "/review/session-range-incomplete",
    prototypeState: "summary",
  },
];

async function reviewSummarySuite(browser, locale, viewport) {
  for (const state of summaryCases) {
    const actual = await openActual(browser, {
      role: "learner",
      locale,
      viewport,
      path: state.path,
    });
    const prototype = await openPrototype(browser, {
      pageId: "PAGE-008",
      role: "learner",
      state: state.prototypeState,
      locale,
      viewport,
    });
    try {
      const prefix = `CR-027 ${state.id} ${locale} ${viewport.width}`;
      const summary = actual.page.locator(".review-summary-card");
      await summary.waitFor();
      const expected = summaryExpectations[locale][state.id];
      record(
        `${prefix} summary copy`,
        {
          eyebrow: await factText(summary.locator(".eyebrow")),
          title: await factText(summary.locator(".page-title")),
          description: await factText(summary.locator(".page-description")),
          restart: await factText(summary.locator("button")),
          values: await texts(summary.locator(".stat-value")),
          labels: await texts(summary.locator(".stat-label")),
          view: await factText(summary.locator('a[href="/library"]')),
        },
        expected,
      );
      record(`${prefix} no active-review context`, await actual.page.locator(".review-context").count(), 0);
      recordCondition(`${prefix} no answer disclosure`, !/grp_[A-Za-z0-9_-]{22}/u.test(await actual.page.content()), {
        note: "No raw group key rendered in completed summary",
      });
      recordCondition(`${prefix} no horizontal overflow`, (await overflow(actual.page)) <= 1, {
        actual: await overflow(actual.page),
      });
      record(`${prefix} Axe serious/critical`, await axeSerious(actual.page), []);
      if (state.id === "singleComplete" || state.id === "rangeComplete") {
        record(
          `${prefix} card metrics against approved prototype`,
          await cardMetrics(summary),
          await cardMetrics(prototype.page.locator(".review-card")),
        );
      }
      await actual.page.screenshot({
        path: join(screenshotDir, `actual-summary-${state.id}-${locale}-${viewport.width}.png`),
        fullPage: true,
      });
      if (state.id === "singleComplete" || state.id === "rangeComplete") {
        await prototype.page.screenshot({
          path: join(screenshotDir, `prototype-summary-${state.id}-${locale}-${viewport.width}.png`),
          fullPage: true,
        });
      }
    } finally {
      await actual.context.close();
      await prototype.context.close();
    }
  }
}

async function restartSuite(browser) {
  const actual = await openActual(browser, {
    role: "learner",
    locale: "en-US",
    viewport: { width: 1440, height: 1000 },
    path: "/review/session-single-complete?batch=batch-e2e",
  });
  const payloads = [];
  actual.page.on("request", (request) => {
    if (
      request.method() === "POST" &&
      request.url().endsWith("/api/v1/me/review-sessions")
    )
      payloads.push(request.postDataJSON());
  });
  try {
    await actual.page.getByRole("button", { name: "Review this story again" }).click();
    await actual.page.waitForURL(/\/review\/session-restarted-single\?batch=batch-e2e$/u);
    await actual.page.goto("/review/session-range-complete");
    await ready(actual.page);
    await actual.page.getByRole("button", { name: "Review again" }).click();
    await actual.page.waitForURL(/\/review\/session-restarted-range$/u);
    record("CR-027 restart actions create same-scope sessions", payloads, [
      { mode: "single_batch", batch_id: "batch-e2e" },
      {
        mode: "range",
        start_date: "2026-08-23",
        end_date: "2026-08-29",
        timezone: "Asia/Shanghai",
      },
    ]);
  } finally {
    await actual.context.close();
  }
}

async function clozeRegressionSuite(browser, viewport) {
  const actual = await openActual(browser, {
    role: "learner",
    locale: "en-US",
    viewport,
    path: "/review/session-single",
  });
  try {
    const prefix = `CR-020–023 cloze regression ${viewport.width}`;
    await actual.page.getByLabel("Write the English word").fill("adapt");
    await actual.page.getByRole("button", { name: "Check" }).click();
    const slots = actual.page.locator(".cloze-slot");
    await slots.first().waitFor();
    record(`${prefix} blank count`, await slots.count(), 5);
    const classes = await slots.evaluateAll((nodes) => nodes.map((node) => node.className));
    recordCondition(
      `${prefix} same-source grouping and different-source separation`,
      classes[0] === classes[2] && classes[0] !== classes[1] && classes[1] === classes[4],
      { classes },
    );
    const content = await actual.page.content();
    recordCondition(`${prefix} raw group key absent from DOM`, !content.includes("grp_AAAAAAAAAAAAAAAAAAAAAA"));
    const inputs = actual.page.locator(".cloze-slot .cloze-input");
    const accessibleNames = await inputs.evaluateAll((nodes) =>
      nodes.map((node) => node.labels?.[0]?.textContent?.trim() ?? ""),
    );
    recordCondition(
      `${prefix} accessible labels do not disclose answers`,
      !/adapt|weave/iu.test(accessibleNames.join(" ")),
      { accessibleNames },
    );
    const geometry = await actual.page.locator(".review-cloze-passage p").evaluate((node) => {
      const style = getComputedStyle(node);
      const rects = [...node.querySelectorAll(".cloze-input")].map((input) => {
        const rect = input.getBoundingClientRect();
        return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height };
      });
      let overlaps = 0;
      for (let first = 0; first < rects.length; first += 1) {
        for (let second = first + 1; second < rects.length; second += 1) {
          const a = rects[first];
          const b = rects[second];
          if (Math.min(a.right, b.right) > Math.max(a.left, b.left) && Math.min(a.bottom, b.bottom) > Math.max(a.top, b.top)) overlaps += 1;
        }
      }
      return {
        lineHeight: Number.parseFloat(style.lineHeight),
        fontSize: Number.parseFloat(style.fontSize),
        rects,
        overlaps,
      };
    });
    recordCondition(
      `${prefix} line spacing and input geometry do not overlap`,
      geometry.lineHeight / geometry.fontSize >= 3.09 &&
        geometry.overlaps === 0 &&
        geometry.rects.every((rect) => rect.height >= 35 && rect.width <= viewport.width * 0.42 + 1),
      { actual: geometry },
    );
    await inputs.first().focus();
    recordCondition(
      `${prefix} focus links same group`,
      (await slots.nth(0).getAttribute("class")).includes("is-group-active") &&
        (await slots.nth(2).getAttribute("class")).includes("is-group-active") &&
        (await slots.nth(1).getAttribute("class")).includes("is-group-muted"),
    );
    await actual.page.locator(".app-header .locale-switch select").selectOption("zh-CN");
    record(
      `${prefix} group projection stable through locale switch`,
      await slots.evaluateAll((nodes) => nodes.map((node) => node.className.replace(/ is-group-(active|muted)/gu, ""))),
      classes.map((value) => value.replace(/ is-group-(active|muted)/gu, "")),
    );
    recordCondition(`${prefix} no horizontal overflow`, (await overflow(actual.page)) <= 1, {
      actual: await overflow(actual.page),
    });
    record(`${prefix} Axe serious/critical`, await axeSerious(actual.page), []);
    await actual.page.screenshot({
      path: join(screenshotDir, `actual-cloze-regression-${viewport.width}.png`),
      fullPage: true,
    });
  } finally {
    await actual.context.close();
  }
}

const browser = await chromium.launch({ headless: true });
try {
  for (const locale of ["en-US", "zh-CN"]) {
    for (const viewport of [
      { width: 390, height: 844 },
      { width: 1440, height: 1000 },
    ]) {
      await suite(`Models ${locale} ${viewport.width}`, () => adminModelSuite(browser, locale, viewport));
      await suite(`Plans ${locale} ${viewport.width}`, () => adminPlansSuite(browser, locale, viewport));
      await suite(`Users ${locale} ${viewport.width}`, () => adminUsersSuite(browser, locale, viewport));
      await suite(`Review gate ${locale} ${viewport.width}`, () =>
        authGateSuite(browser, locale, viewport, "/review", "PAGE-007"),
      );
      await suite(`Library gate ${locale} ${viewport.width}`, () =>
        authGateSuite(browser, locale, viewport, "/library", "PAGE-005"),
      );
      await suite(`Login error ${locale} ${viewport.width}`, () => loginErrorSuite(browser, locale, viewport));
      await suite(`Library ${locale} ${viewport.width}`, () => librarySuite(browser, locale, viewport));
      await suite(`Review summaries ${locale} ${viewport.width}`, () => reviewSummarySuite(browser, locale, viewport));
    }
  }
  await suite("Review restart behavior", () => restartSuite(browser));
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 1440, height: 1000 },
  ]) {
    await suite(`Cloze regression ${viewport.width}`, () => clozeRegressionSuite(browser, viewport));
  }
} finally {
  await browser.close();
}

const failures = checks.filter((check) => check.status === "FAIL");
const result = {
  milestone: "M001",
  role: "quality/base",
  agent_name: "qa-quinn",
  date: "2026-09-05",
  tested_image: "sha256:0cb4bceb35550f7242c3bfd6ed958e006632f46862f644a487010a05e4b4bb85",
  verdict: failures.length === 0 ? "PASS" : "FAIL",
  totals: { checks: checks.length, passed: checks.length - failures.length, failed: failures.length },
  checks,
  observations,
};
writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify({ verdict: result.verdict, totals: result.totals, failures }, null, 2)}\n`);
if (failures.length) process.exitCode = 1;

