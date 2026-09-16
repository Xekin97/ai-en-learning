import { chromium } from "../../../../../frontend/node_modules/@playwright/test/index.mjs";

const baseURL = "http://127.0.0.1:3310";

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

const browser = await chromium.launch({ headless: true });
const output = {};

const learner = await browser.newContext({ baseURL, locale: "zh-CN" });
const learnerPage = await learner.newPage();
const learnerConsole = [];
learnerPage.on("console", (message) => learnerConsole.push(`${message.type()}: ${message.text()}`));
learnerPage.on("pageerror", (error) => learnerConsole.push(`pageerror: ${error.message}`));
await login(learnerPage, "qa_reader_56793976", "LearnerPass123!");
await learnerPage.waitForTimeout(1_000);
output.library = {
  url: learnerPage.url(),
  text: (await learnerPage.locator("body").innerText()).slice(0, 4_000),
  stats: await learnerPage.locator(".stat-card").count(),
  errors: learnerConsole,
  summaryResponse: await (await learner.request.get("/api/v1/me/learning-summary")).json(),
  batchesResponse: await (await learner.request.get("/api/v1/me/batches")).json(),
};
await learnerPage.screenshot({ path: new URL("./screenshots/library-diagnostic.png", import.meta.url).pathname, fullPage: true });

const admin = await browser.newContext({ baseURL, locale: "en-US" });
const adminPage = await admin.newPage();
const adminConsole = [];
adminPage.on("console", (message) => adminConsole.push(`${message.type()}: ${message.text()}`));
adminPage.on("pageerror", (error) => adminConsole.push(`pageerror: ${error.message}`));
await login(adminPage, "verify_admin", "VerifyAdminPass123!");
const token = await bootstrap(admin);
const usersResponse = await admin.request.get("/api/v1/admin/users?username=qa_reader_56793976");
const users = await usersResponse.json();
const userId = users.data.items[0].id;
await adminPage.goto(`/admin/users/${userId}`);
await adminPage.waitForTimeout(1_000);
output.adminUser = {
  url: adminPage.url(),
  userId,
  csrfLength: token.length,
  text: (await adminPage.locator("body").innerText()).slice(0, 4_000),
  selects: await adminPage.locator("select").count(),
  errors: adminConsole,
  userResponse: await (await admin.request.get(`/api/v1/admin/users/${userId}`)).json(),
  batchesResponse: await (await admin.request.get(`/api/v1/admin/users/${userId}/batches`)).json(),
};
await adminPage.screenshot({ path: new URL("./screenshots/admin-user-diagnostic.png", import.meta.url).pathname, fullPage: true });

await learner.close();
await admin.close();
await browser.close();
process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
