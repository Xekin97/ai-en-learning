import { chromium } from "../../../../../frontend/node_modules/@playwright/test/index.mjs";
import AxeBuilder from "../../../../../frontend/node_modules/@axe-core/playwright/dist/index.mjs";

const baseURL = "http://127.0.0.1:3310";
const learnerName = "qa_reader_56793976";
const learnerPassword = "LearnerPass123!";
const modelName = "Verification model with a long localized display name that must wrap safely";
const batchId = "01a05c69-5fd3-7ad6-81f1-7928156f7aae";
const screenshotRoot = new URL("./screenshots/", import.meta.url);
const results = [];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function check(name, run) {
  try {
    results.push({ name, status: "PASS", evidence: await run() });
  } catch (error) {
    results.push({ name, status: "FAIL", evidence: error instanceof Error ? error.message : String(error) });
  }
}

async function api(context, method, path, csrf, data) {
  const headers = { origin: baseURL, "sec-fetch-site": "same-origin" };
  if (csrf) headers["x-csrf-token"] = csrf;
  const response = await context.request.fetch(path, { method, headers, ...(data === undefined ? {} : { data }) });
  const raw = await response.text();
  return { status: response.status(), raw, body: raw ? JSON.parse(raw) : null };
}

async function csrf(context) {
  const response = await api(context, "GET", "/api/v1/bootstrap");
  assert(response.status === 200, `bootstrap ${response.status}: ${response.raw}`);
  return response.body.data.csrf_token;
}

async function loginThroughUI(page, username, password) {
  await page.goto("/login");
  await page.locator('input[autocomplete="username"]').fill(username);
  await page.locator('input[autocomplete="current-password"]').fill(password);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((url) => !url.pathname.endsWith("/login"), { timeout: 10_000 });
}

const browser = await chromium.launch({ headless: true });
const learnerContext = await browser.newContext({ baseURL, locale: "en-US", viewport: { width: 1280, height: 900 } });
const learnerPage = await learnerContext.newPage();

try {
  await check("learner browser login reaches the protected library", async () => {
    await loginThroughUI(learnerPage, learnerName, learnerPassword);
    assert(new URL(learnerPage.url()).pathname === "/library", `landed at ${learnerPage.url()}`);
    return `landed at ${learnerPage.url()}`;
  });

  await check("learning record renders all six approved statistics", async () => {
    await learnerPage.locator(".stats-grid").waitFor({ timeout: 10_000 });
    const count = await learnerPage.locator(".stat-card").count();
    await learnerPage.screenshot({ path: new URL("library-live.png", screenshotRoot).pathname, fullPage: true });
    assert(count === 6, `rendered ${count}; expected 6`);
    return `rendered ${count}`;
  });

  await check("word suggestions are a non-layout overlay", async () => {
    await learnerPage.goto("/create");
    await learnerPage.locator(".studio-sidebar").waitFor();
    const before = await learnerPage.locator(".studio-sidebar").evaluate((node) => node.getBoundingClientRect().height);
    await learnerPage.locator("#word-search").fill("lea");
    const option = learnerPage.locator('.word-search-overlay [role="option"]', { hasText: "learn" }).first();
    await option.waitFor({ timeout: 5_000 });
    const after = await learnerPage.locator(".studio-sidebar").evaluate((node) => node.getBoundingClientRect().height);
    const position = await learnerPage.locator(".word-search-overlay").evaluate((node) => getComputedStyle(node).position);
    assert(position === "absolute", `position=${position}`);
    assert(Math.abs(after - before) < 1, `height ${before}→${after}`);
    await option.click();
    return `position=absolute; height delta=${Math.abs(after - before)}`;
  });

  await check("live frontend generation streams and renders a complete resource", async () => {
    await learnerPage.locator(".locale-switch select").selectOption("en-US");
    await learnerPage.getByRole("button", { name: new RegExp("Verification model") }).click();
    await learnerPage.getByRole("button", { name: "English", exact: true }).click();
    await learnerPage.getByRole("button", { name: "Discussion", exact: true }).click();
    await learnerPage.getByRole("button", { name: "Brief", exact: true }).click();
    await learnerPage.getByRole("button", { name: "Create story", exact: true }).click();
    await learnerPage.getByRole("button", { name: "Save to library", exact: true }).waitFor({ timeout: 10_000 });
    assert(await learnerPage.locator(".tag-passage").count() === 1, "passage tag count mismatch");
    assert(await learnerPage.locator(".resource-card").count() === 1, "resource count mismatch");
    await learnerPage.screenshot({ path: new URL("create-live-result.png", screenshotRoot).pathname, fullPage: true });
    return "validated result visible with one passage tag and one word resource";
  });

  await check("leaving a valid unsaved result requires confirmation", async () => {
    let dialogSeen = false;
    learnerPage.once("dialog", async (dialog) => {
      dialogSeen = true;
      await dialog.dismiss();
    });
    await learnerPage.getByRole("link", { name: "Library", exact: true }).click();
    await learnerPage.waitForTimeout(500);
    assert(dialogSeen, `no confirmation; navigated to ${learnerPage.url()}`);
    return "confirmation shown and navigation cancelled";
  });

  await check("learner plan uses the approved user-facing Chinese name", async () => {
    let token = await csrf(learnerContext);
    await api(learnerContext, "PUT", "/api/v1/me/ui-locale", token, { ui_locale: "zh-CN" });
    await learnerPage.goto("/account");
    const text = await learnerPage.locator(".definition-list").innerText();
    assert(text.includes("基础版") && !text.includes("正式账号"), text);
    return text;
  });

  await check("single-batch review has a distinct source label and library return path", async () => {
    const token = await csrf(learnerContext);
    const session = await api(learnerContext, "POST", "/api/v1/me/review-sessions", token, { mode: "single_batch", batch_id: batchId });
    assert([200, 201].includes(session.status), `session ${session.status}: ${session.raw}`);
    await learnerPage.goto(`/review/${session.body.data.session_id}`);
    await learnerPage.locator(".review-card").waitFor({ timeout: 10_000 });
    const back = await learnerPage.locator(".page-actions a").first().getAttribute("href");
    const text = await learnerPage.locator("body").innerText();
    assert(back === "/library", `return path=${back}`);
    assert(text.includes("本篇复习"), "source label missing");
    await learnerPage.screenshot({ path: new URL("single-review.png", screenshotRoot).pathname, fullPage: true });
    return `return path=${back}; source label present`;
  });

  await check("account page has valid definition-list semantics", async () => {
    await learnerPage.goto("/account");
    const scan = await new AxeBuilder({ page: learnerPage }).analyze();
    const serious = scan.violations.filter((item) => ["serious", "critical"].includes(item.impact));
    assert(serious.length === 0, serious.map((item) => `${item.id}:${item.nodes.length}`).join(", "));
    return "no serious or critical Axe findings";
  });

  const adminContext = await browser.newContext({ baseURL, locale: "en-US", viewport: { width: 1280, height: 900 } });
  const adminPage = await adminContext.newPage();
  await check("administrator group changes require explicit confirmation", async () => {
    await loginThroughUI(adminPage, "verify_admin", "VerifyAdminPass123!");
    const token = await csrf(adminContext);
    const users = await api(adminContext, "GET", `/api/v1/admin/users?username=${encodeURIComponent(learnerName)}`);
    assert(users.status === 200 && users.body.data.items.length === 1, `user search failed: ${users.raw}`);
    const userId = users.body.data.items[0].id;
    await adminPage.goto(`/admin/users/${userId}`);
    await adminPage.locator("select.select-input").waitFor({ timeout: 10_000 });
    await adminPage.locator("select.select-input").selectOption("pro");
    let dialogSeen = false;
    adminPage.once("dialog", async (dialog) => {
      dialogSeen = true;
      await dialog.dismiss();
    });
    await adminPage.getByRole("button", { name: "Save", exact: true }).click();
    await adminPage.waitForTimeout(500);
    const detail = await api(adminContext, "GET", `/api/v1/admin/users/${userId}`);
    assert(dialogSeen, `no confirmation; group changed immediately=${detail.body.data.user.plan_code === "pro"}`);
    return "confirmation shown and mutation cancelled";
  });
  await adminContext.close();
} finally {
  await learnerContext.close();
  await browser.close();
}

const failed = results.filter((result) => result.status === "FAIL");
process.stdout.write(`${JSON.stringify({ summary: { passed: results.length - failed.length, failed: failed.length, total: results.length }, results }, null, 2)}\n`);
