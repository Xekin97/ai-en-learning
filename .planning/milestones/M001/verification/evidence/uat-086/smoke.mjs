import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, expect } from "../../../../../../frontend/node_modules/@playwright/test/index.mjs";

const dir = dirname(fileURLToPath(import.meta.url));
const root = resolve(dir, "../../../../../..");
const origin = "http://localhost:6001";
const run = process.env.QA086_RUN || "smoke";
const target = [
  "sha256:fd251e7439aad8e058656e2751ed84f40715fec570a872da53542688a6dd6904",
  "sha256:642ed57ad0ed6c8a13e4bba1101d8b50188e8ea636791583a6ffb5eaa6917aac",
];
const checks = [];
const errors = [];
const requests = [];
const contexts = [];
const loggedIn = new Set();
let interceptedLocaleWrites = 0;
const record = (id, actual, expected) => checks.push({ id, status: JSON.stringify(actual) === JSON.stringify(expected) ? "PASS" : "FAIL", actual, expected });
const docker = (args) => execFileSync("docker", args, { cwd: root, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 }).trim();
const sql = (query) => docker(["exec", "wordweave_uat-postgres-1", "psql", "-U", "postgres", "-d", "wordweave", "-X", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-c", query]);
const tableDigest = (table, projection = "*") => sql(`SELECT md5(COALESCE(string_agg(md5(row_to_json(t)::text),'' ORDER BY md5(row_to_json(t)::text)),'')) FROM (SELECT ${projection} FROM wordweave.${table}) t`);
function publicData() {
  const counts = JSON.parse(sql("SELECT json_build_object('accounts',(SELECT count(*) FROM wordweave.accounts),'sessions',(SELECT count(*) FROM wordweave.account_sessions),'batches',(SELECT count(*) FROM wordweave.learning_batches),'models',(SELECT count(*) FROM wordweave.ai_models),'runs',(SELECT count(*) FROM wordweave.generation_runs),'active_runs',(SELECT count(*) FROM wordweave.generation_runs WHERE call_status='active'),'migration_count',(SELECT count(*) FROM wordweave.schema_migrations),'latest_version',(SELECT max(version) FROM wordweave.schema_migrations));"));
  return { counts, digests: {
    accountMetadata: tableDigest("accounts", "id,username,role,group_code,status,ui_locale,quota_reset_at,created_at,updated_at"),
    batches: tableDigest("learning_batches"), batchTargets: tableDigest("batch_targets"), vocabularyEntries: tableDigest("vocabulary_entries"), vocabularySnapshots: tableDigest("vocabulary_snapshots"),
    passageOccurrences: tableDigest("passage_occurrences"), hintOccurrences: tableDigest("hint_occurrences"), models: tableDigest("ai_models"), generationRuns: tableDigest("generation_runs"),
    groups: tableDigest("entitlement_groups"), groupModels: tableDigest("group_models"), groupLengths: tableDigest("group_lengths"), migrations: tableDigest("schema_migrations"),
  } };
}
const privateDigests = () => ({
  passwords: tableDigest("accounts", "id,password_hash"), credentials: tableDigest("openrouter_credentials"), sessions: tableDigest("account_sessions", "id,account_id,token_hash,created_at,expires_at"),
});
const accountSecurity = (username) => JSON.parse(sql(`SELECT json_build_object('password',md5(password_hash),'session_count',(SELECT count(*) FROM wordweave.account_sessions s WHERE s.account_id=a.id),'sessions',(SELECT md5(COALESCE(string_agg(md5(row_to_json(x)::text),'' ORDER BY md5(row_to_json(x)::text)),'')) FROM (SELECT id,account_id,token_hash,created_at,expires_at FROM wordweave.account_sessions WHERE account_id=a.id) x)) FROM wordweave.accounts a WHERE username='${username}'`));
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const ready = async (page) => { await page.waitForFunction(() => document.documentElement.dataset.appReady === "true"); await page.evaluate(async () => { await document.fonts.ready; await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))); }); };
const noOverflow = async (page, id) => record(id, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
const dialogCopy = async (dialog) => ({
  title: await dialog.locator("h2").allInnerTexts(), labels: await dialog.locator(".field-label").allInnerTexts(), helpers: await dialog.locator(".helper").allInnerTexts(), notice: await dialog.locator(".notice").allInnerTexts(), buttons: await dialog.locator(".dialog-footer button").allInnerTexts(),
});
async function newContext(locale = "en-US", width = 1440) {
  const context = await browser.newContext({ locale, viewport: { width, height: 1000 }, timezoneId: "Asia/Shanghai" });
  contexts.push(context); context.setDefaultTimeout(15000);
  await context.addCookies([{ name: "wordweave_ui_locale", value: locale, url: origin }]);
  context.on("page", (page) => page.on("pageerror", (error) => errors.push(error.message)));
  context.on("request", (request) => { if (request.url().startsWith(`${origin}/api/`)) requests.push({ method: request.method(), path: new URL(request.url()).pathname }); });
  return context;
}
async function get(context, path) {
  const response = await context.request.get(origin + path);
  if (response.status() !== 200) throw new Error(`GET ${path} returned ${response.status()}`);
  return (await response.json()).data;
}
async function loginUI(context, username, secret, label) {
  const page = await context.newPage(); await page.goto(`${origin}/login`); await ready(page);
  await page.locator('input[autocomplete="username"]').fill(username);
  await page.locator('input[autocomplete="current-password"]').fill(secret);
  const responseWait = page.waitForResponse((response) => response.request().method() === "POST" && response.url().endsWith("/api/v1/auth/login"));
  await page.locator('button[type="submit"]').click(); const response = await responseWait;
  record(`${label} existing credential login`, response.status(), 200);
  if (response.status() !== 200) throw new Error(`${label} existing UAT credential rejected`);
  loggedIn.add(context); await page.waitForURL((url) => url.pathname !== "/login"); await ready(page); return page;
}
async function logoutOwn(context, label) {
  if (!loggedIn.has(context)) return;
  const bootstrap = await get(context, "/api/v1/bootstrap");
  const response = await context.request.post(`${origin}/api/v1/auth/logout`, { headers: { origin, "sec-fetch-site": "same-origin", "x-csrf-token": bootstrap.csrf_token }, data: {} });
  const body = await response.body();
  record(`${label} own smoke session logout`, [response.status(), body.length, response.headers()["content-type"] ?? null, response.headers()["cache-control"]], [204, 0, null, "no-store"]);
  if (response.status() === 204) loggedIn.delete(context);
}

const deployment = JSON.parse(readFileSync(join(dir, "deployment.json"), "utf8"));
const before = publicData();
const privateBefore = privateDigests();
const browser = await chromium.launch();
try {
  const homeResponse = await fetch(`${origin}/`);
  const bootstrapResponse = await fetch(`${origin}/api/v1/bootstrap`);
  record("Nginx frontend route HTTP", homeResponse.status, 200);
  record("Nginx backend route HTTP", bootstrapResponse.status, 200);

  const hints = {
    "en-US": { "/review": "Continue to Review when you’re done.", "/library": "Continue to Library when you’re done." },
    "zh-CN": { "/review": "完成后返回复习。", "/library": "完成后返回学习记录。" },
  };
  for (const locale of ["en-US", "zh-CN"]) for (const width of [390, 1440]) {
    const context = await newContext(locale, width); const page = await context.newPage();
    for (const route of ["/review", "/library"]) {
      await page.goto(origin + route); await ready(page); await expect(page.locator(".auth-gate")).toBeVisible();
      record(`${locale} ${width} ${route} remains at intent route`, new URL(page.url()).pathname, route); await noOverflow(page, `${locale} ${width} ${route} no overflow`);
      await page.locator(".auth-gate .button-primary").click(); await expect(page).toHaveURL((url) => url.pathname === "/login" && url.searchParams.get("redirect") === route);
      for (const mode of ["login", "register"]) {
        if (mode === "register") { await page.locator(".auth-alt a").click(); await expect(page).toHaveURL((url) => url.pathname === "/register"); }
        const meta = await page.locator(".auth-card").evaluate((card) => { const hint = card.querySelector(".auth-intent"); const title = card.querySelector("h2"); return { text: hint?.textContent?.trim(), first: card.firstElementChild === hint, beforeTitle: Boolean(hint?.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING), role: hint?.getAttribute("role") }; });
        record(`${locale} ${width} ${route} ${mode} intent`, meta, { text: hints[locale][route], first: true, beforeTitle: true, role: "status" }); await noOverflow(page, `${locale} ${width} ${route} ${mode} no overflow`);
      }
      if (width === 390) await page.screenshot({ path: join(dir, `${run}-${locale}-${route.slice(1)}-auth-390.png`), fullPage: true });
    }
    await context.close();
  }

  const adminContext = await newContext("en-US", 1440);
  const adminPage = await loginUI(adminContext, "uat_admin", "UatAdminPass6000!", "administrator");
  for (const width of [390, 1440]) {
    await adminPage.setViewportSize({ width, height: 1000 });
    for (const route of ["/admin/models", "/admin/plans", "/admin/users"]) {
      await adminPage.goto(origin + route); await ready(adminPage); await expect(adminPage.locator(".page-title")).toBeVisible();
      record(`admin ${route} ${width} no application error`, await adminPage.locator(".app-error").count(), 0); await noOverflow(adminPage, `admin ${route} ${width} no overflow`);
    }
  }
  const userList = await get(adminContext, "/api/v1/admin/users?username=uat_learner");
  record("admin Users read-only finds existing learner", userList.items.some((item) => item.username === "uat_learner"), true);
  await adminPage.goto(`${origin}/admin/models`); await ready(adminPage);
  const modelRows = await adminPage.locator(".model-list .model-row").count(); record("admin Models read-only rows", modelRows > 0, true);
  await adminPage.screenshot({ path: join(dir, `${run}-admin-models-1440.png`), fullPage: true });
  await logoutOwn(adminContext, "administrator"); await adminContext.close();

  const learnerContext = await newContext("en-US", 390);
  const learnerPage = await loginUI(learnerContext, "uat_learner", "UatLearnerPass6000!", "learner");
  for (const [route, selector] of [["/library", ".stat-label"], ["/review", "#review-start"], ["/account", ".settings-grid"]]) {
    await learnerPage.goto(origin + route); await ready(learnerPage);
    if (route === "/library") await expect(learnerPage.locator(selector)).toHaveCount(6); else await expect(learnerPage.locator(selector)).toBeVisible();
    record(`learner ${route} basic page no error`, await learnerPage.locator(".app-error").count(), 0);
  }
  const trigger = learnerPage.locator(".settings-grid .card-footer .button-secondary");
  await trigger.click(); let dialog = learnerPage.locator("dialog[open]"); let inputs = dialog.locator('input[type="password"]');
  record("English Change password exact copy", await dialogCopy(dialog), {
    title: ["Change password"], labels: ["Current password", "New password", "Confirm new password"], helpers: ["Confirm it’s you", "8–128 characters", "Enter the same password again"], notice: ["Your current session will stay open. Other sessions will be signed out."], buttons: ["Cancel", "Update password"],
  });
  record("password dialog initial focus", await inputs.nth(0).evaluate((node) => node === document.activeElement), true);
  await inputs.nth(0).fill("Uat086CancelOnly!"); await inputs.nth(1).fill("Uat086NotApplied!"); await inputs.nth(2).fill("Uat086NotApplied!");
  await dialog.locator(".dialog-footer .button-secondary").click(); record("password cancel returns focus", await trigger.evaluate((node) => node === document.activeElement), true);
  await trigger.click(); dialog = learnerPage.locator("dialog[open]"); inputs = dialog.locator('input[type="password"]'); record("password cancel reopen clears fields", await inputs.evaluateAll((nodes) => nodes.map((node) => node.value)), ["", "", ""]);

  const securityBeforeWrong = accountSecurity("uat_learner");
  await inputs.nth(0).fill("DefinitelyWrongUat086!"); await inputs.nth(1).fill("Uat086NotApplied!"); await inputs.nth(2).fill("Uat086NotApplied!");
  const wrongWait = learnerPage.waitForResponse((response) => response.request().method() === "PUT" && response.url().endsWith("/api/v1/me/password"));
  await dialog.locator('button[type="submit"]').click(); const wrong = await wrongWait;
  record("wrong current password status/no-store", [wrong.status(), wrong.headers()["cache-control"]], [422, "no-store"]);
  const error = dialog.locator(".app-error"); await expect(error).toHaveText("Check the information you entered.");
  record("wrong-password error only inside dialog", [await learnerPage.locator(".app-error").count(), await error.count(), await error.getAttribute("role")], [1, 1, "alert"]);
  record("wrong-password fields retained", await inputs.evaluateAll((nodes) => nodes.map((node) => node.value)), ["DefinitelyWrongUat086!", "Uat086NotApplied!", "Uat086NotApplied!"]);
  for (const width of [390, 1440]) { await learnerPage.setViewportSize({ width, height: 1000 }); await noOverflow(learnerPage, `password error ${width} no overflow`); await learnerPage.screenshot({ path: join(dir, `${run}-password-error-en-US-${width}.png`), fullPage: true }); }
  const securityAfterWrong = accountSecurity("uat_learner");
  record("wrong-password leaves password and sessions unchanged", same(securityAfterWrong, securityBeforeWrong), true);
  await dialog.locator(".dialog-footer .button-secondary").click(); record("error cancel returns focus", await trigger.evaluate((node) => node === document.activeElement), true);
  await trigger.click(); dialog = learnerPage.locator("dialog[open]"); inputs = dialog.locator('input[type="password"]');
  record("error reopen clears error/fields", [await dialog.locator(".app-error").count(), await inputs.evaluateAll((nodes) => nodes.map((node) => node.value))], [0, ["", "", ""]]);
  await learnerPage.keyboard.press("Escape"); record("Escape returns focus", await trigger.evaluate((node) => node === document.activeElement), true);

  await learnerContext.route("**/api/v1/me/ui-locale", async (route) => { interceptedLocaleWrites += 1; await route.fulfill({ status: 200, headers: { "content-type": "application/json", "cache-control": "no-store" }, json: { data: { ui_locale: "zh-CN" }, meta: { request_id: "req_uat086_presentation_only" } } }); });
  await learnerPage.locator(".app-header .locale-switch select").selectOption("zh-CN"); await expect(learnerPage.locator("html")).toHaveAttribute("lang", "zh-CN");
  for (const width of [390, 1440]) {
    await learnerPage.setViewportSize({ width, height: 1000 }); await trigger.click(); dialog = learnerPage.locator("dialog[open]");
    record(`Chinese Change password exact copy ${width}`, await dialogCopy(dialog), {
      title: ["修改密码"], labels: ["当前密码", "新密码", "确认新密码"], helpers: ["用于确认是账号本人", "8–128 个字符", "再次输入相同密码"], notice: ["修改成功后保留当前会话，其他已有会话全部退出。"], buttons: ["取消", "确认修改"],
    });
    await noOverflow(learnerPage, `Chinese password dialog ${width} no overflow`); if (width === 390) await learnerPage.screenshot({ path: join(dir, `${run}-password-dialog-zh-CN-390.png`), fullPage: true }); await learnerPage.keyboard.press("Escape");
  }
  record("Chinese presentation locale PUT intercepted without DB mutation", interceptedLocaleWrites, 1);
  await learnerContext.unroute("**/api/v1/me/ui-locale");
  await logoutOwn(learnerContext, "learner"); await learnerContext.close();
} catch (error) {
  checks.push({ id: "UAT086 smoke execution", status: "ERROR", error: String(error?.stack || error) });
} finally {
  for (const context of [...loggedIn]) await logoutOwn(context, "failure-cleanup").catch((error) => checks.push({ id: "own smoke-session cleanup", status: "ERROR", error: String(error) }));
  for (const context of contexts) await context.close().catch(() => {});
  await browser.close().catch(() => {});
  const after = publicData(); const privateAfter = privateDigests();
  record("no page runtime errors", errors, []);
  const forbiddenWrites = requests.filter((request) => !["GET", "HEAD", "OPTIONS"].includes(request.method) && !["/api/v1/auth/login", "/api/v1/auth/logout", "/api/v1/me/password", "/api/v1/me/ui-locale"].includes(request.path));
  record("no forbidden browser mutation paths", forbiddenWrites, []);
  record("public accounts/content/models/runs/groups/migrations preserved", after, before);
  record("deployment baseline public data preserved", after, deployment.dataAfter);
  record("password and provider credential material unchanged", privateAfter.passwords === privateBefore.passwords && privateAfter.credentials === privateBefore.credentials, true);
  record("only own newly-created sessions removed", privateAfter.sessions === privateBefore.sessions, true);
  record("no active generation after smoke", after.counts.active_runs, 0);
  const containers = JSON.parse(docker(["inspect", "wordweave_uat-frontend-1", "wordweave_uat-backend-1", "wordweave_uat-nginx-1", "wordweave_uat-postgres-1"]));
  record("verified pair remains deployed", containers.slice(0, 2).map((container) => container.Image), target);
  record("four UAT services healthy", containers.map((container) => container.State.Health?.Status), ["healthy", "healthy", "healthy", "healthy"]);
  record("database and Nginx IDs unchanged", [containers[2].Id, containers[3].Id], [deployment.after[2].id, deployment.after[3].id]);
  const design = await fetch("http://localhost:6010/prototype/").catch(() => null); record("approved design service remains available", design?.status ?? null, 200);
  const counts = { PASS: 0, FAIL: 0, ERROR: 0 }; for (const check of checks) counts[check.status] += 1;
  writeFileSync(join(dir, `${run}-results.json`), JSON.stringify({ date: new Date().toISOString(), agent: "qa-quinn", run, origin, engine: "Chromium", counts, checks, credentialsVerifiedUnchanged: ["uat_admin", "uat_learner"], passwordHashesEmitted: false, interceptedPresentationOnlyLocaleWrites: interceptedLocaleWrites, requestSummary: { total: requests.length, forbiddenWrites: forbiddenWrites.length, realAICalls: requests.filter((request) => request.path.includes("generations")).length }, dataBefore: before, dataAfter: after, actualModel: "not_observed", usage: "not_observed" }, null, 2), { flag: "wx" });
  console.log(JSON.stringify({ counts, dataPreserved: same(after, before), passwordsUnchanged: privateAfter.passwords === privateBefore.passwords, sessionsRestored: privateAfter.sessions === privateBefore.sessions, forbiddenWrites: forbiddenWrites.length }));
  if (counts.FAIL || counts.ERROR) process.exitCode = 1;
}
