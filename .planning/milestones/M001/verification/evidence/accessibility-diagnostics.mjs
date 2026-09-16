import { chromium } from "../../../../../frontend/node_modules/@playwright/test/index.mjs";
import AxeBuilder from "../../../../../frontend/node_modules/@axe-core/playwright/dist/index.mjs";

const baseURL = process.env.WORDWEAVE_BASE_URL ?? "http://localhost:6001";
const requestHeaders = { origin: baseURL, "sec-fetch-site": "same-origin" };

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
  const result = await api(context, "POST", "/api/v1/auth/login", bootstrap.body.data.csrf_token, {
    username,
    password,
    browser_ui_locale: "zh-CN",
  });
  assert(result.status === 200, `login ${username} ${result.status}: ${result.raw}`);
  return result.body.data;
}

const browser = await chromium.launch({ headless: true });
const publicContext = await browser.newContext({ baseURL, locale: "zh-CN", viewport: { width: 1440, height: 1000 } });
const learnerContext = await browser.newContext({ baseURL, locale: "zh-CN", viewport: { width: 1440, height: 1000 } });
const adminContext = await browser.newContext({ baseURL, locale: "zh-CN", viewport: { width: 1440, height: 1000 } });
const scans = [];

async function scan(context, name, path, viewport) {
  const page = await context.newPage();
  if (viewport) await page.setViewportSize(viewport);
  const response = await page.goto(path, { waitUntil: "domcontentloaded", timeout: 10_000 });
  assert(response && response.status() < 400, `${name} status ${response?.status()}`);
  await page.waitForTimeout(150);
  const result = await new AxeBuilder({ page }).analyze();
  const seriousOrCritical = result.violations
    .filter((violation) => ["serious", "critical"].includes(violation.impact))
    .map((violation) => `${violation.id}:${violation.nodes.length}`);
  scans.push({ name, path: new URL(page.url()).pathname, viewport: viewport?.width ?? 1440, seriousOrCritical });
  await page.close();
}

async function scanOpenDialog(context, name, path, opener, cancel) {
  const page = await context.newPage();
  await page.goto(path, { waitUntil: "domcontentloaded", timeout: 10_000 });
  await page.getByRole("button", { name: opener, exact: true }).click();
  await page.getByRole("dialog").waitFor();
  const result = await new AxeBuilder({ page }).analyze();
  const seriousOrCritical = result.violations
    .filter((violation) => ["serious", "critical"].includes(violation.impact))
    .map((violation) => `${violation.id}:${violation.nodes.length}`);
  scans.push({ name, path: new URL(page.url()).pathname, viewport: 1440, seriousOrCritical });
  await page.getByRole("dialog").getByRole("button", { name: cancel, exact: true }).click();
  await page.close();
}

try {
  const learner = await login(learnerContext, "uat_learner", "UatLearnerPass6000!");
  const admin = await login(adminContext, "uat_admin", "UatAdminPass6000!");
  const batches = await api(learnerContext, "GET", "/api/v1/me/batches?limit=100");
  assert(batches.status === 200 && batches.body.data.items.length, `learner batches ${batches.raw}`);
  const batchId = batches.body.data.items[0].id;
  const review = await api(learnerContext, "POST", "/api/v1/me/review-sessions", learner.csrf_token, { mode: "single_batch", batch_id: batchId });
  assert([200, 201].includes(review.status), `review session ${review.status}: ${review.raw}`);
  const users = await api(adminContext, "GET", "/api/v1/admin/users?username=uat_learner&limit=10", admin.csrf_token);
  assert(users.status === 200 && users.body.data.items.length, `admin user search ${users.raw}`);
  const userId = users.body.data.items[0].id;

  for (const [name, context, path] of [
    ["home", publicContext, "/"],
    ["register", publicContext, "/register"],
    ["login", publicContext, "/login"],
    ["create", learnerContext, "/create"],
    ["library", learnerContext, "/library"],
    ["batch detail", learnerContext, `/library/${batchId}`],
    ["review setup", learnerContext, "/review"],
    ["review session", learnerContext, `/review/${review.body.data.session_id}`],
    ["account", learnerContext, "/account"],
    ["admin models", adminContext, "/admin/models"],
    ["admin plans", adminContext, "/admin/plans"],
    ["admin users", adminContext, "/admin/users"],
    ["admin user detail", adminContext, `/admin/users/${userId}`],
  ]) await scan(context, name, path);

  for (const [name, context, path] of [
    ["home mobile", publicContext, "/"],
    ["create mobile", learnerContext, "/create"],
    ["library mobile", learnerContext, "/library"],
    ["admin models mobile", adminContext, "/admin/models"],
  ]) await scan(context, name, path, { width: 390, height: 844 });

  await scanOpenDialog(learnerContext, "change password dialog", "/account", /修改密码|Change password/, /取消|Cancel/);
  await scanOpenDialog(adminContext, "change plan dialog", `/admin/users/${userId}`, /更改方案|Change plan/, /取消|Cancel/);
  await scanOpenDialog(adminContext, "add model dialog", "/admin/models", /新增模型|Add model/, /取消|Cancel/);

  const failures = scans.filter((scanResult) => scanResult.seriousOrCritical.length);
  assert(failures.length === 0, JSON.stringify(failures, null, 2));
  process.stdout.write(`${JSON.stringify({ status: "PASS", scans: scans.length, desktopPages: 13, mobilePages: 4, dialogs: 3, seriousOrCritical: 0 }, null, 2)}\n`);
} finally {
  await Promise.all([publicContext.close(), learnerContext.close(), adminContext.close()]);
  await browser.close();
}
