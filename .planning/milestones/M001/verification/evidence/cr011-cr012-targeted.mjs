import { chromium } from "../../../../../frontend/node_modules/@playwright/test/index.mjs";
import AxeBuilder from "../../../../../frontend/node_modules/@axe-core/playwright/dist/index.mjs";

const baseURL = process.env.WORDWEAVE_BASE_URL ?? "http://127.0.0.1:3313";
const apiRequestHeaders = { origin: baseURL, "sec-fetch-site": "same-origin" };
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

async function api(context, method, path, csrfToken, data, headers = {}) {
  const options = { method, headers: { ...apiRequestHeaders, ...headers } };
  if (csrfToken) options.headers["x-csrf-token"] = csrfToken;
  if (data !== undefined) options.data = data;
  const response = await context.request.fetch(path, options);
  const raw = await response.text();
  let body = null;
  if (raw && response.headers()["content-type"]?.includes("json")) body = JSON.parse(raw);
  return { status: response.status(), headers: response.headers(), raw, body };
}

async function bootstrap(context) {
  const response = await api(context, "GET", "/api/v1/bootstrap");
  assert(response.status === 200, `bootstrap ${response.status}: ${response.raw}`);
  return response.body.data;
}

async function register(context, username, password, locale = "en-US") {
  const security = await bootstrap(context);
  const response = await api(context, "POST", "/api/v1/auth/register", security.csrf_token, {
    username,
    password,
    password_confirmation: password,
    ui_locale: locale,
  });
  assert(response.status === 201, `register ${username}: ${response.status} ${response.raw}`);
  return response.body.data;
}

async function login(context, username, password, expected = 200) {
  const security = await bootstrap(context);
  const response = await api(context, "POST", "/api/v1/auth/login", security.csrf_token, {
    username,
    password,
    browser_ui_locale: "en-US",
  });
  assert(response.status === expected, `login ${username}: ${response.status} ${response.raw}`);
  return response;
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

async function saveBatch(context, csrf, modelId) {
  const streamed = await api(context, "POST", "/api/v1/generations/stream", csrf, {
    model_id: modelId,
    meaning_language: "en",
    scenario: "story",
    length: "short",
    entries: ["learn"],
  });
  assert(streamed.status === 200, `generation ${streamed.status}: ${streamed.raw}`);
  const events = parseSSE(streamed.raw);
  const started = events.find((event) => event.event === "generation.started")?.data;
  const validated = events.find((event) => event.event === "generation.validated")?.data;
  assert(started && validated, `validated generation missing: ${streamed.raw}`);
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

async function openCreate(page) {
  await page.goto("/create");
  await page.locator("#word-search").waitFor();
  await page.locator(".choice-grid-model button.choice").first().waitFor();
}

async function chooseLearn(page) {
  await page.locator("#word-search").fill("lea");
  await page.locator(".word-search-overlay [role='option']", { hasText: "learn" }).click();
}

const browser = await chromium.launch({ headless: true });
const contexts = [];

async function newContext(options = {}) {
  const context = await browser.newContext({ baseURL, ...options });
  contexts.push(context);
  return context;
}

try {
  const adminContext = await newContext({ locale: "en-US" });
  await login(
    adminContext,
    process.env.WORDWEAVE_ADMIN_USERNAME ?? "uat_admin",
    process.env.WORDWEAVE_ADMIN_PASSWORD ?? "UatAdminPass6000!",
  );
  const models = await api(adminContext, "GET", "/api/v1/admin/models?limit=100");
  assert(models.status === 200, `models ${models.status}: ${models.raw}`);
  const model = models.body.data.items.find((item) => item.openrouter_model_id === "provider/integration");
  assert(model?.enabled, "enabled verification model missing; run live-e2e.mjs first");
  const modelId = model.id;
  const suffix = Date.now().toString(36).slice(-7);

  await check("CR-011 fresh visitor and learner workspaces start without configuration defaults", async () => {
    const visitorContext = await newContext({ locale: "en-US" });
    const learnerContext = await newContext({ locale: "zh-CN" });
    await register(learnerContext, `qa_explicit_${suffix}`, "ExplicitPass123!", "zh-CN");
    const observations = [];
    for (const [kind, context] of [["visitor", visitorContext], ["learner", learnerContext]]) {
      const page = await context.newPage();
      await openCreate(page);
      await chooseLearn(page);
      const selected = await page.locator("button.choice[aria-pressed='true']").count();
      const disabled = await page.locator(".generate-bar .button-primary").isDisabled();
      assert(selected === 0, `${kind} workspace preselected ${selected} choices`);
      assert(disabled, `${kind} generation enabled before explicit choices`);
      observations.push(`${kind}:0 selected/disabled`);
      await page.close();
    }
    return observations.join("; ");
  });

  const journeyContext = await newContext({ locale: "en-US" });
  const journeyName = `qa_journey_${suffix}`;
  await register(journeyContext, journeyName, "JourneyPass123!", "en-US");
  const journeyPage = await journeyContext.newPage();

  await check("CR-011 generation unlocks only after all four explicit choices", async () => {
    await openCreate(journeyPage);
    await chooseLearn(journeyPage);
    const groups = [
      ".choice-grid-model button.choice",
      ".choice-grid-3 button.choice",
      ".choice-grid-scenario button.choice",
      ".choice-grid-4 button.choice",
    ];
    const states = [];
    for (let index = 0; index < groups.length; index += 1) {
      await journeyPage.locator(groups[index]).first().click();
      const selected = await journeyPage.locator("button.choice[aria-pressed='true']").count();
      const disabled = await journeyPage.locator(".generate-bar .button-primary").isDisabled();
      states.push({ selected, disabled });
      assert(selected === index + 1, `step ${index + 1} selected ${selected} choices`);
      assert(disabled === (index < 3), `step ${index + 1} disabled=${disabled}`);
    }
    return states;
  });

  await check("CR-011 locale switching preserves the in-progress task", async () => {
    const before = await journeyPage.locator("button.choice[aria-pressed='true']").evaluateAll((nodes) =>
      nodes.map((node) => node.textContent.trim()),
    );
    await journeyPage.locator(".locale-switch select").selectOption("zh-CN");
    await journeyPage.waitForFunction(() => document.documentElement.lang === "zh-CN");
    const selectedEntries = await journeyPage.locator(".studio-chip-list .chip").allTextContents();
    const selectedCount = await journeyPage.locator("button.choice[aria-pressed='true']").count();
    const enabled = !(await journeyPage.locator(".generate-bar .button-primary").isDisabled());
    assert(selectedEntries.some((entry) => entry.includes("learn")), `word lost after locale switch: ${selectedEntries}`);
    assert(selectedCount === 4, `locale switch retained ${selectedCount}/4 choices`);
    assert(enabled, "locale switch disabled a complete task");
    return `word=learn; selected=4; before labels=${before.join("|")}; locale=zh-CN`;
  });

  await check("CR-011 create-another starts a fully empty task", async () => {
    await journeyPage.locator(".generate-bar .button-primary").click();
    await journeyPage.locator(".result-action-bar .button-primary").waitFor({ timeout: 10_000 });
    journeyPage.once("dialog", (dialog) => dialog.accept());
    await journeyPage.locator(".result-action-bar .button-secondary").click();
    await journeyPage.locator(".output-empty").waitFor();
    const entries = await journeyPage.locator(".studio-chip-list .chip").count();
    const selected = await journeyPage.locator("button.choice[aria-pressed='true']").count();
    const disabled = await journeyPage.locator(".generate-bar .button-primary").isDisabled();
    assert(entries === 0, `new task retained ${entries} target words`);
    assert(selected === 0, `new task retained ${selected} choices`);
    assert(disabled, "new empty task left generation enabled");
    return "discard confirmation accepted; words=0; configuration choices=0; generation disabled";
  });

  await check("CR-012 deletion starts unchecked and requires keyboard-operable explicit consent", async () => {
    const deletionContext = await newContext({ locale: "en-US" });
    const deletionName = `qa_delete_ui_${suffix}`;
    const deletionPassword = "DeleteUiPass123!";
    let deletionCSRF = (await register(deletionContext, deletionName, deletionPassword, "en-US")).csrf_token;
    const secondSession = await newContext({ locale: "en-US" });
    await login(secondSession, deletionName, deletionPassword);
    const batchId = await saveBatch(deletionContext, deletionCSRF, modelId);
    const found = await api(adminContext, "GET", `/api/v1/admin/users?username=${deletionName}`);
    const userId = found.body.data.items[0]?.id;
    assert(userId, "deletion test user missing from admin search");

    const page = await deletionContext.newPage();
    await page.goto("/account");
    await page.getByRole("button", { name: /Delete my account|删除我的账号/, exact: true }).click();
    const zone = page.getByRole("dialog");
    const checkbox = zone.locator("input[type='checkbox']");
    const password = zone.locator("input[type='password']");
    const button = zone.locator("button.button-danger");
    const copy = await zone.innerText();
    assert((await checkbox.count()) === 1, `confirmation checkbox count ${await checkbox.count()}`);
    assert(!(await checkbox.isChecked()), "confirmation is prechecked");
    assert(/immediately|立即/u.test(copy) && /cannot be undone|can’t be undone|无法撤销/u.test(copy) && /stories|短文/u.test(copy) && /review|复习/u.test(copy), `irreversibility copy incomplete: ${copy}`);
    await password.fill(deletionPassword);
    assert(await button.isDisabled(), "password alone enabled account deletion");

    let deleteRequests = 0;
    page.on("request", (request) => {
      if (request.method() === "DELETE" && new URL(request.url()).pathname === "/api/v1/me/account") deleteRequests += 1;
    });
    await checkbox.focus();
    await checkbox.press("Space");
    assert(await checkbox.isChecked(), "Space did not check confirmation");
    assert(await checkbox.evaluate((node) => document.activeElement === node), "checkbox lost focus after keyboard toggle");
    await page.waitForFunction(() => !document.querySelector("dialog button.button-danger")?.disabled);
    assert(!(await button.isDisabled()), "valid password and explicit confirmation did not enable deletion");
    await checkbox.press("Space");
    await page.waitForFunction(() => document.querySelector("dialog button.button-danger")?.disabled);
    assert(!(await checkbox.isChecked()) && await button.isDisabled(), "second Space did not withdraw consent");
    assert(deleteRequests === 0, `non-submit interactions sent ${deleteRequests} delete requests`);

    await password.fill("WrongDeletePass123!");
    await checkbox.check();
    const wrongRequest = page.waitForRequest((request) => request.method() === "DELETE" && new URL(request.url()).pathname === "/api/v1/me/account");
    const wrongResponse = page.waitForResponse((response) => response.request().method() === "DELETE" && new URL(response.url()).pathname === "/api/v1/me/account");
    await button.click();
    const [request, response] = await Promise.all([wrongRequest, wrongResponse]);
    const wrongBody = request.postDataJSON();
    assert(response.status() >= 400, `wrong password deletion returned ${response.status()}`);
    assert(JSON.stringify(wrongBody) === JSON.stringify({ current_password: "WrongDeletePass123!", confirmed: true }), `wrong request body ${JSON.stringify(wrongBody)}`);
    await page.waitForFunction(() => !document.querySelector("dialog input[type='checkbox']")?.checked);
    assert(await button.isDisabled(), "failed deletion retained actionable consent");
    assert((await api(deletionContext, "GET", "/api/v1/me/account")).status === 200, "failed deletion removed account");

    await password.fill(deletionPassword);
    await checkbox.check();
    const successRequest = page.waitForRequest((request) => request.method() === "DELETE" && new URL(request.url()).pathname === "/api/v1/me/account");
    const successResponse = page.waitForResponse((response) => response.request().method() === "DELETE" && new URL(response.url()).pathname === "/api/v1/me/account");
    await button.click();
    const [request2, response2] = await Promise.all([successRequest, successResponse]);
    const successBody = request2.postDataJSON();
    assert(response2.status() === 204, `successful deletion returned ${response2.status()}`);
    assert(JSON.stringify(successBody) === JSON.stringify({ current_password: deletionPassword, confirmed: true }), `success request body ${JSON.stringify(successBody)}`);
    await page.waitForURL((url) => url.pathname === "/");
    assert((await bootstrap(deletionContext)).actor.kind === "visitor", "deleted current session did not become visitor");
    assert((await api(secondSession, "GET", "/api/v1/me/account")).status === 401, "second session survived deletion");
    await login(await newContext({ locale: "en-US" }), deletionName, deletionPassword, 401);
    assert((await api(adminContext, "GET", `/api/v1/admin/users/${userId}`)).status === 404, "deleted identity remained addressable");
    const search = await api(adminContext, "GET", `/api/v1/admin/users?username=${deletionName}`);
    assert(search.body.data.items.length === 0, "deleted identity remained searchable");
    assert((await api(deletionContext, "GET", `/api/v1/me/batches/${batchId}`)).status === 401, "deleted learner retained batch access");
    return `unchecked/keyboard/failed-reset/success cascade verified; account=${deletionName}; batch=${batchId}`;
  });

  await check("targeted pages remain accessible and responsive after both revisions", async () => {
    const violations = [];
    for (const path of ["/create", "/account"]) {
      const page = await journeyContext.newPage();
      await page.goto(path);
      const scan = await new AxeBuilder({ page }).analyze();
      for (const violation of scan.violations.filter((item) => ["critical", "serious"].includes(item.impact))) {
        violations.push(`${path}:${violation.id}:${violation.nodes.length}`);
      }
      await page.close();
    }
    assert(violations.length === 0, violations.join(", "));
    for (const width of [320, 720, 900, 1280]) {
      for (const path of ["/create", "/account"]) {
        const page = await journeyContext.newPage();
        await page.setViewportSize({ width, height: 900 });
        await page.goto(path);
        const dimensions = await page.evaluate(() => ({ viewport: innerWidth, page: document.documentElement.scrollWidth }));
        await page.close();
        assert(dimensions.page <= dimensions.viewport, `${path}@${width} overflow ${dimensions.page}>${dimensions.viewport}`);
      }
    }
    return "Axe serious/critical=0; /create and /account fit 320/720/900/1280px";
  });
} finally {
  await Promise.all(contexts.map((context) => context.close().catch(() => {})));
  await browser.close();
}

const failed = results.filter((result) => result.status === "FAIL");
process.stdout.write(`${JSON.stringify({ baseURL, summary: { passed: results.length - failed.length, failed: failed.length, total: results.length }, results }, null, 2)}\n`);
if (failed.length) process.exitCode = 1;
