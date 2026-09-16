import { chromium } from "../../../../../frontend/node_modules/@playwright/test/index.mjs";

const baseURL = "http://127.0.0.1:3310";
const learnerName = "qa_reader_56793976";
const learnerPassword = "LearnerPass123!";
const results = [];
const shimmedResponses = [];

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

async function installPaginationContractShim(context) {
  await context.route("**/api/v1/**", async (route) => {
    const response = await route.fetch();
    const contentType = response.headers()["content-type"] ?? "";
    if (!contentType.includes("json")) {
      await route.fulfill({ response });
      return;
    }
    const body = await response.json();
    if (body?.meta?.has_more === false && !("next_cursor" in body.meta)) {
      body.meta.next_cursor = null;
      shimmedResponses.push(new URL(route.request().url()).pathname);
    }
    await route.fulfill({ response, json: body });
  });
}

async function login(page, username, password) {
  await page.goto("/login");
  await page.locator('input[autocomplete="username"]').fill(username);
  await page.locator('input[autocomplete="current-password"]').fill(password);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((url) => !url.pathname.endsWith("/login"));
}

async function bootstrap(context) {
  const response = await context.request.get("/api/v1/bootstrap");
  return (await response.json()).data.csrf_token;
}

async function jsonRequest(context, method, path, csrf, data) {
  const headers = { origin: baseURL, "sec-fetch-site": "same-origin", ...(csrf ? { "x-csrf-token": csrf } : {}) };
  const response = await context.request.fetch(path, { method, headers, ...(data === undefined ? {} : { data }) });
  const raw = await response.text();
  return { status: response.status(), body: raw ? JSON.parse(raw) : null, raw };
}

const browser = await chromium.launch({ headless: true });

const visitor = await browser.newContext({ baseURL, locale: "en-US" });
const visitorPage = await visitor.newPage();
await check("home exposes all three approved primary task entries", async () => {
  await visitorPage.goto("/");
  const links = await visitorPage.locator(".hero-actions a").allInnerTexts();
  assert(links.length === 3, `hero has ${links.length} task links: ${links.join(", ")}`);
  return links;
});
await visitor.close();

const learner = await browser.newContext({ baseURL, locale: "zh-CN", viewport: { width: 1280, height: 900 } });
const learnerPage = await learner.newPage();
await login(learnerPage, learnerName, learnerPassword);
await installPaginationContractShim(learner);
await learnerPage.locator('a[href="/library"]').first().click();
await learnerPage.waitForURL((url) => url.pathname === "/library");
await learnerPage.locator('form[role="search"] button[type="submit"]').click();

await check("library renders after only the missing null pagination field is restored", async () => {
  await learnerPage.locator(".stats-grid").waitFor({ timeout: 5_000 }).catch(() => undefined);
  const stats = await learnerPage.locator(".stats-grid").count();
  const error = await learnerPage.locator(".notice-error").count();
  const batches = await learnerPage.locator(".batch-row").count();
  const body = (await learnerPage.locator("body").innerText()).replaceAll(/\s+/g, " ").slice(0, 800);
  const payloads = await learnerPage.evaluate(async () => Promise.all([
    fetch("/api/v1/me/learning-summary").then((response) => response.json()),
    fetch("/api/v1/me/batches?limit=20").then((response) => response.json()),
  ]));
  assert(stats === 1 && error === 0 && batches >= 1, `url=${learnerPage.url()}; stats=${stats}; errors=${error}; batches=${batches}; shimmed=${JSON.stringify(shimmedResponses)}; payloads=${JSON.stringify(payloads).slice(0, 1800)}; body=${body}`);
  return `errors=0; batches=${batches}`;
});

await check("library presents all six approved statistics", async () => {
  const labels = await learnerPage.locator(".stat-label").allInnerTexts();
  assert(labels.length === 6, `rendered ${labels.length}: ${labels.join(", ")}`);
  return labels;
});

await learner.close();

const admin = await browser.newContext({ baseURL, locale: "en-US", viewport: { width: 1280, height: 900 } });
const adminPage = await admin.newPage();
await login(adminPage, "verify_admin", "VerifyAdminPass123!");
await installPaginationContractShim(admin);
const users = await jsonRequest(admin, "GET", `/api/v1/admin/users?username=${encodeURIComponent(learnerName)}`);
const userId = users.body.data.items[0].id;

await check("admin user detail renders after pagination contract shim", async () => {
  await adminPage.locator('a[href="/admin/users"]').first().click();
  await adminPage.waitForURL((url) => url.pathname === "/admin/users");
  await adminPage.locator(`a[href="/admin/users/${userId}"]`).click();
  await adminPage.waitForURL((url) => url.pathname === `/admin/users/${userId}`);
  await adminPage.locator("select.select-input").waitFor({ timeout: 10_000 });
  assert(await adminPage.locator(".notice-error").count() === 0, "admin detail still reports a contract error");
  return `user=${userId}; page rendered`;
});

await check("administrator group changes require explicit confirmation", async () => {
  await adminPage.locator("select.select-input").selectOption("pro");
  let dialogSeen = false;
  adminPage.once("dialog", async (dialog) => {
    dialogSeen = true;
    await dialog.dismiss();
  });
  await adminPage.getByRole("button", { name: "Save", exact: true }).click();
  await adminPage.waitForTimeout(600);
  const detail = await jsonRequest(admin, "GET", `/api/v1/admin/users/${userId}`);
  const changed = detail.body.data.user.plan_code === "pro";
  assert(dialogSeen, `no confirmation; changed immediately=${changed}`);
  return `confirmation shown; changed=${changed}`;
});

const adminCSRF = await bootstrap(admin);
await jsonRequest(admin, "PUT", `/api/v1/admin/users/${userId}/group`, adminCSRF, { group_code: "basic", confirmed: true });
await admin.close();
await browser.close();

const failed = results.filter((result) => result.status === "FAIL");
process.stdout.write(`${JSON.stringify({ summary: { passed: results.length - failed.length, failed: failed.length, total: results.length }, results }, null, 2)}\n`);
