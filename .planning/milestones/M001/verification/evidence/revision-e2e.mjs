import { chromium } from "../../../../../frontend/node_modules/@playwright/test/index.mjs";
import AxeBuilder from "../../../../../frontend/node_modules/@axe-core/playwright/dist/index.mjs";

const baseURL = process.env.WORDWEAVE_BASE_URL ?? "http://127.0.0.1:3312";
const mockURL = process.env.MOCK_OPENROUTER_URL ?? "http://127.0.0.1:39091";
const verificationDate = process.env.WORDWEAVE_VERIFY_DATE ?? "2026-09-02";
const apiRequestHeaders = { origin: baseURL, "sec-fetch-site": "same-origin" };
const results = [];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function check(name, run) {
  const started = performance.now();
  try {
    const evidence = await run();
    results.push({ name, status: "PASS", duration_ms: Math.round(performance.now() - started), evidence });
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
  assert(response.status === 200, `bootstrap status ${response.status}: ${response.raw}`);
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

async function login(context, username, password, locale = "en-US", expected = 200) {
  const security = await bootstrap(context);
  const response = await api(context, "POST", "/api/v1/auth/login", security.csrf_token, {
    username,
    password,
    browser_ui_locale: locale,
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

async function stream(context, csrf, modelId, entries = ["learn"], overrides = {}) {
  const response = await api(context, "POST", "/api/v1/generations/stream", csrf, {
    model_id: modelId,
    meaning_language: "en",
    scenario: "story",
    length: "short",
    entries,
    ...overrides,
  });
  assert(response.status === 200, `generation status ${response.status}: ${response.raw}`);
  const events = parseSSE(response.raw);
  const started = events.find((event) => event.event === "generation.started")?.data;
  const validated = events.find((event) => event.event === "generation.validated")?.data;
  assert(started && validated, `validated generation missing: ${response.raw}`);
  return { started, validated, events };
}

async function saveBatch(context, csrf, modelId, entries = ["learn"]) {
  const generation = await stream(context, csrf, modelId, entries);
  const response = await api(
    context,
    "POST",
    `/api/v1/generations/${generation.started.run_id}/save`,
    csrf,
    {},
    { "x-generation-token": generation.started.generation_token },
  );
  assert([200, 201].includes(response.status), `save status ${response.status}: ${response.raw}`);
  return response.body.data.batch_id;
}

async function setMockMode(value) {
  const response = await fetch(`${mockURL}/__mode?value=${encodeURIComponent(value)}`, { method: "POST" });
  assert(response.ok, `mock mode ${value}: ${response.status}`);
}

async function browserStream(context, csrf, modelId) {
  const cookies = await context.cookies(baseURL);
  const cookie = cookies.map((item) => `${item.name}=${item.value}`).join("; ");
  const controller = new AbortController();
  const response = await fetch(`${baseURL}/api/v1/generations/stream`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: baseURL,
      "sec-fetch-site": "same-origin",
      "x-csrf-token": csrf,
      cookie,
    },
    body: JSON.stringify({
      model_id: modelId,
      meaning_language: "en",
      scenario: "story",
      length: "short",
      entries: ["learn"],
    }),
    signal: controller.signal,
  });
  assert(response.status === 200 && response.body, `stream start status ${response.status}`);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let started = null;
  while (!started) {
    const chunk = await reader.read();
    assert(!chunk.done, "stream ended before generation.started");
    buffer += decoder.decode(chunk.value, { stream: true });
    let boundary = buffer.search(/\r?\n\r?\n/u);
    while (boundary >= 0) {
      const block = buffer.slice(0, boundary);
      const separator = buffer.slice(boundary).match(/^\r?\n\r?\n/u)?.[0] ?? "\n\n";
      buffer = buffer.slice(boundary + separator.length);
      const event = block.match(/^event:\s*(.+)$/mu)?.[1];
      const data = block.match(/^data:\s*(.+)$/mu)?.[1];
      if (event === "generation.started" && data) started = JSON.parse(data);
      boundary = buffer.search(/\r?\n\r?\n/u);
    }
  }
  return { controller, reader, started };
}

async function generationOptions(context) {
  const response = await api(context, "GET", "/api/v1/generation-options");
  assert(response.status === 200, `generation options ${response.status}: ${response.raw}`);
  return response.body.data;
}

async function completeRangeBySkipping(context, csrf, sessionId) {
  let completed = null;
  while (!completed) {
    const started = await api(context, "POST", `/api/v1/me/review-sessions/${sessionId}/attempts`, csrf, {});
    assert(started.status === 201, `attempt start ${started.status}: ${started.raw}`);
    const attemptId = started.body.data.attempt_id;
    const attemptToken = started.body.data.attempt_token;
    let item = started.body.data.item;
    let moveToNextBatch = false;
    while (!moveToNextBatch && !completed) {
      const action = await api(
        context,
        "POST",
        `/api/v1/me/review-attempts/${attemptId}/actions`,
        csrf,
        { action_id: crypto.randomUUID(), item_id: item.item_id, action: "skip" },
        { "x-review-attempt-token": attemptToken },
      );
      assert(action.status === 200, `review skip ${action.status}: ${action.raw}`);
      if (action.body.data.outcome === "advanced") item = action.body.data.item;
      else if (action.body.data.outcome === "batch_completed") moveToNextBatch = true;
      else if (action.body.data.outcome === "session_completed") completed = action.body.data;
      else throw new Error(`unexpected review outcome ${action.body.data.outcome}`);
    }
  }
  return completed;
}

const browser = await chromium.launch({ headless: true });
const contexts = [];

function newContext(options = {}) {
  const context = browser.newContext({ baseURL, ...options });
  contexts.push(context);
  return context;
}

try {
  const adminContext = await newContext({ locale: "en-US" });
  const adminLogin = await login(
    adminContext,
    process.env.WORDWEAVE_ADMIN_USERNAME ?? "uat_admin",
    process.env.WORDWEAVE_ADMIN_PASSWORD ?? "UatAdminPass6000!",
  );
  let adminCSRF = adminLogin.body.data.csrf_token;
  const models = await api(adminContext, "GET", "/api/v1/admin/models?limit=100");
  assert(models.status === 200, `models status ${models.status}: ${models.raw}`);
  const model = models.body.data.items.find((item) => item.openrouter_model_id === "provider/integration");
  assert(model?.enabled, "enabled verification model missing; run live-e2e.mjs first");
  const modelId = model.id;

  const suffix = Date.now().toString(36).slice(-7);
  const learnerName = `qa_rev_${suffix}`;
  let learnerPassword = "RevisionPass123!";
  const learnerContext = await newContext({ locale: "zh-CN" });
  const learnerActor = await register(learnerContext, learnerName, learnerPassword, "zh-CN");
  let learnerCSRF = learnerActor.csrf_token;

  await check("CR-008 keyset list envelopes preserve explicit terminal metadata", async () => {
    const emptyContext = await newContext({ locale: "en-US" });
    const emptyName = `qa_empty_${suffix}`;
    await register(emptyContext, emptyName, "EmptyPass123!", "en-US");
    const learnerList = await api(emptyContext, "GET", "/api/v1/me/batches?limit=1");
    assert(learnerList.status === 200, learnerList.raw);
    assert(learnerList.body.meta.next_cursor === null && learnerList.body.meta.has_more === false, "empty learner list meta mismatch");
    const usersEmpty = await api(adminContext, "GET", `/api/v1/admin/users?username=definitely_missing_${suffix}&limit=1`);
    assert(usersEmpty.body.meta.next_cursor === null && usersEmpty.body.meta.has_more === false, "empty admin user list meta mismatch");
    const emptyUserSearch = await api(adminContext, "GET", `/api/v1/admin/users?username=${emptyName}&limit=1`);
    const emptyUserId = emptyUserSearch.body.data.items[0].id;
    const adminBatches = await api(adminContext, "GET", `/api/v1/admin/users/${emptyUserId}/batches?limit=1`);
    assert(adminBatches.body.meta.next_cursor === null && adminBatches.body.meta.has_more === false, "empty admin batch list meta mismatch");
    assert(models.body.meta.next_cursor === null && models.body.meta.has_more === false, "model terminal meta mismatch");
    return "empty and terminal learner/admin/model lists return next_cursor=null and has_more=false";
  });

  await check("homepage exposes three primary tasks and protected pages keep their auth gate", async () => {
    const visitor = await newContext({ locale: "en-US", viewport: { width: 1280, height: 900 } });
    const page = await visitor.newPage();
    await page.goto("/");
    const actions = page.locator(".hero-actions a");
    assert((await actions.count()) === 3, `homepage task count ${await actions.count()}`);
    const hrefs = await actions.evaluateAll((nodes) => nodes.map((node) => node.getAttribute("href")));
    assert(hrefs.includes("/create") && hrefs.includes("/review") && hrefs.includes("/library"), `homepage hrefs ${hrefs.join(",")}`);
    const privateRequests = [];
    page.on("request", (request) => {
      const path = new URL(request.url()).pathname;
      if (/^\/api\/v1\/me\/(?:learning-summary|batches|review-range|review-sessions)/u.test(path)) privateRequests.push(path);
    });
    await page.locator('.hero-actions a[href="/library"]').click();
    await page.locator(".auth-gate").waitFor();
    assert(new URL(page.url()).pathname === "/library", `auth gate changed route to ${page.url()}`);
    assert(privateRequests.length === 0, `auth gate loaded private data: ${privateRequests.join(",")}`);
    const loginHref = await page.locator('.auth-gate a[href^="/login"]').getAttribute("href");
    const registerHref = await page.locator('.auth-gate a[href^="/register"]').getAttribute("href");
    assert(loginHref?.includes("redirect=/library"), `login intent mismatch: ${loginHref}`);
    assert(registerHref?.includes("redirect=/library"), `registration intent mismatch: ${registerHref}`);
    return "three homepage tasks present; /library keeps its auth gate, two safe return actions, and no private request";
  });

  await check("new generation workspaces require four explicit configuration choices", async () => {
    const visitor = await newContext({ locale: "en-US" });
    const page = await visitor.newPage();
    await page.goto("/create");
    await page.locator("#word-search").fill("lea");
    await page.locator(".word-search-overlay [role='option']", { hasText: "learn" }).click();
    const selected = await page.locator("button.choice[aria-pressed='true']").count();
    const disabled = await page.getByRole("button", { name: "Create story", exact: true }).isDisabled();
    assert(selected === 0, `workspace preselected ${selected} configuration choices`);
    assert(disabled, "generate action became available without four explicit choices");
    return "fresh workspace has no preselected model, meaning language, scenario, or length";
  });

  let retainedBatchId = "";
  await check("validated unsaved generation protects navigation and discards only after confirmation", async () => {
    const page = await learnerContext.newPage();
    await page.goto("/create");
    await Promise.all([
      page.waitForResponse(
        (response) =>
          response.request().method() === "PUT" &&
          response.url().endsWith("/api/v1/me/ui-locale"),
      ),
      page.locator(".locale-switch select").selectOption("en-US"),
    ]);
    await page.waitForFunction(() => document.documentElement.lang === "en-US");
    await page.locator("#word-search").fill("lea");
    await page.locator(".word-search-overlay [role='option']", { hasText: "learn" }).click();
    await page.getByRole("button", { name: new RegExp("Verification model") }).click();
    await page.getByRole("button", { name: "English", exact: true }).click();
    await page.getByRole("button", { name: "Story", exact: true }).click();
    await page.getByRole("button", { name: "Brief", exact: true }).click();
    const selectedStyle = await page.getByRole("button", { name: "Story", exact: true }).evaluate((node) => getComputedStyle(node).backgroundColor);
    const unselectedStyle = await page.getByRole("button", { name: "Business", exact: true }).evaluate((node) => getComputedStyle(node).backgroundColor);
    assert(selectedStyle !== unselectedStyle, "selected and unselected choice styles are indistinguishable");
    await page.getByRole("button", { name: "Create story", exact: true }).click();
    await page.getByRole("button", { name: "Save to library", exact: true }).waitFor({ timeout: 10_000 });
    let discardRequests = 0;
    page.on("request", (request) => {
      if (request.method() === "POST" && /\/generations\/[^/]+\/discard$/u.test(new URL(request.url()).pathname)) discardRequests += 1;
    });
    page.once("dialog", (dialog) => dialog.dismiss());
    await page.locator('a[href="/library"]').first().click();
    await page.waitForTimeout(250);
    assert(new URL(page.url()).pathname === "/create", `dismissed navigation reached ${page.url()}`);
    assert(discardRequests === 0 && await page.getByRole("button", { name: "Save to library", exact: true }).isVisible(), "dismiss lost the validated result");
    page.once("dialog", (dialog) => dialog.accept());
    await page.locator('a[href="/library"]').first().click();
    await page.waitForURL(/\/library$/);
    assert(discardRequests === 1, `confirmed navigation sent ${discardRequests} discard requests`);
    retainedBatchId = await saveBatch(learnerContext, learnerCSRF, modelId, ["learn"]);
    return `dismiss retained result; confirm discarded once; retained test batch=${retainedBatchId}`;
  });

  await check("library checkbox keeps focus and single-batch review action", async () => {
    const page = await learnerContext.newPage();
    await page.goto("/library");
    const row = page.locator(".batch-row", { hasText: "learn" }).first();
    const checkbox = row.locator("input[type='checkbox']");
    const reviewButton = row.getByRole("button", { name: /Review this story|复习本篇/u });
    await checkbox.focus();
    const responsePromise = page.waitForResponse((response) => response.request().method() === "PATCH" && response.url().includes(`/batches/${retainedBatchId}`));
    await checkbox.uncheck();
    await responsePromise;
    assert(await checkbox.evaluate((node) => document.activeElement === node), "checkbox lost focus after update");
    assert(await reviewButton.isVisible(), "single-batch review action disappeared when participation was unchecked");
    return "participation changed in place; focus and direct review action were preserved";
  });

  let rangeSessionId = "";
  await check("multi-batch date review is independent and completes with fixed session progress", async () => {
    const second = await saveBatch(learnerContext, learnerCSRF, modelId, ["build"]);
    const third = await saveBatch(learnerContext, learnerCSRF, modelId, ["change"]);
    for (const id of [retainedBatchId, second, third]) {
      const updated = await api(learnerContext, "PATCH", `/api/v1/me/batches/${id}`, learnerCSRF, { participates_in_range_review: true });
      assert(updated.status === 200, updated.raw);
    }
    const query = `start_date=${verificationDate}&end_date=${verificationDate}&timezone=Asia%2FShanghai`;
    const preview = await api(learnerContext, "GET", `/api/v1/me/review-range/preview?${query}`);
    assert(preview.status === 200 && preview.body.data.batch_count >= 3, `range preview ${preview.raw}`);
    const created = await api(learnerContext, "POST", "/api/v1/me/review-sessions", learnerCSRF, {
      mode: "range",
      start_date: verificationDate,
      end_date: verificationDate,
      timezone: "Asia/Shanghai",
    });
    assert([200, 201].includes(created.status) && created.body.data.mode === "range", created.raw);
    rangeSessionId = created.body.data.session_id;
    const page = await learnerContext.newPage();
    await page.goto(`/review/${rangeSessionId}`);
    await page.locator(".review-source-badge").waitFor();
    const back = await page.locator(".review-context a").getAttribute("href");
    assert(back === "/review", `range review returns to ${back}`);
    assert((await page.locator("body").innerText()).includes("日期复习") || (await page.locator("body").innerText()).includes("Date review"), "range source label missing");
    const completed = await completeRangeBySkipping(learnerContext, learnerCSRF, rangeSessionId);
    assert(completed.session_summary.total_batches === preview.body.data.batch_count, "range total changed after creation");
    assert(completed.session_summary.skipped_batches === preview.body.data.batch_count, "skipped range summary mismatch");
    return `range session=${rangeSessionId}; fixed total=${completed.session_summary.total_batches}; all skipped without answer disclosure`;
  });

  await check("self-service password change keeps current session and invalidates other sessions", async () => {
    const otherSession = await newContext({ locale: "zh-CN" });
    await login(otherSession, learnerName, learnerPassword, "zh-CN");
    learnerCSRF = (await bootstrap(learnerContext)).csrf_token;
    const nextPassword = "RevisionPass456!";
    const changed = await api(learnerContext, "PUT", "/api/v1/me/password", learnerCSRF, {
      current_password: learnerPassword,
      new_password: nextPassword,
      new_password_confirmation: nextPassword,
    });
    assert(changed.status === 204, `password change ${changed.status}: ${changed.raw}`);
    assert((await api(learnerContext, "GET", "/api/v1/me/account")).status === 200, "current session was invalidated");
    assert((await api(otherSession, "GET", "/api/v1/me/account")).status === 401, "other session remained valid");
    const oldLogin = await newContext({ locale: "en-US" });
    await login(oldLogin, learnerName, learnerPassword, "en-US", 401);
    const newLogin = await newContext({ locale: "en-US" });
    await login(newLogin, learnerName, nextPassword, "en-US", 200);
    learnerPassword = nextPassword;
    return "current session retained; other session and old password rejected; new password accepted";
  });

  let supportUserId = "";
  let supportNewContext = null;
  await check("administrator group and password changes require confirmation and apply exact side effects", async () => {
    const supportName = `qa_support_${suffix}`;
    const supportOldPassword = "SupportPass123!";
    const supportContext = await newContext({ locale: "en-US" });
    await register(supportContext, supportName, supportOldPassword, "en-US");
    const supportOther = await newContext({ locale: "en-US" });
    await login(supportOther, supportName, supportOldPassword, "en-US");
    const users = await api(adminContext, "GET", `/api/v1/admin/users?username=${supportName}`);
    supportUserId = users.body.data.items[0].id;
    const page = await adminContext.newPage();
    await page.goto(`/admin/users/${supportUserId}`);
    let groupWrites = 0;
    let passwordWrites = 0;
    page.on("request", (request) => {
      const path = new URL(request.url()).pathname;
      if (request.method() === "PUT" && path.endsWith("/group")) groupWrites += 1;
      if (request.method() === "PUT" && path.endsWith("/password")) passwordWrites += 1;
    });
    const changeGroupButton = page.getByRole("button", { name: /Change plan|更改方案/, exact: true });
    await changeGroupButton.click();
    let dialog = page.getByRole("dialog");
    await dialog.locator(".select-input").selectOption("pro");
    await dialog.getByRole("button", { name: /Cancel|取消/, exact: true }).click();
    assert(groupWrites === 0, "dismissed group confirmation still wrote data");
    await changeGroupButton.click();
    dialog = page.getByRole("dialog");
    await dialog.locator(".select-input").selectOption("pro");
    await Promise.all([
      page.waitForResponse((response) => response.request().method() === "PUT" && response.url().endsWith("/group")),
      dialog.getByRole("button", { name: /Change plan|更改方案/, exact: true }).click(),
    ]);
    const detail = await api(adminContext, "GET", `/api/v1/admin/users/${supportUserId}`);
    assert(groupWrites === 1 && detail.body.data.user.plan_code === "pro", `group writes=${groupWrites}; plan=${detail.body.data.user.plan_code}`);
    const newPassword = "SupportPass456!";
    const resetPasswordButton = page.getByRole("button", { name: /Reset password|重置密码/, exact: true });
    await resetPasswordButton.click();
    dialog = page.getByRole("dialog");
    let passwordInputs = dialog.locator("input[type='password']");
    await passwordInputs.nth(0).fill(newPassword);
    await passwordInputs.nth(1).fill(newPassword);
    await dialog.getByRole("button", { name: /Cancel|取消/, exact: true }).click();
    assert(passwordWrites === 0 && (await api(supportContext, "GET", "/api/v1/me/account")).status === 200, "dismissed password reset had side effects");
    await resetPasswordButton.click();
    dialog = page.getByRole("dialog");
    passwordInputs = dialog.locator("input[type='password']");
    await passwordInputs.nth(0).fill(newPassword);
    await passwordInputs.nth(1).fill(newPassword);
    await Promise.all([
      page.waitForResponse((response) => response.request().method() === "PUT" && response.url().endsWith("/password")),
      dialog.getByRole("button", { name: /Reset password|重置密码/, exact: true }).click(),
    ]);
    assert(passwordWrites === 1, `password writes=${passwordWrites}`);
    assert((await api(supportContext, "GET", "/api/v1/me/account")).status === 401, "first old session survived admin reset");
    assert((await api(supportOther, "GET", "/api/v1/me/account")).status === 401, "second old session survived admin reset");
    await login(await newContext({ locale: "en-US" }), supportName, supportOldPassword, "en-US", 401);
    supportNewContext = await newContext({ locale: "en-US" });
    await login(supportNewContext, supportName, newPassword, "en-US", 200);
    return "both dialogs cancel without writes; accepted group writes once; accepted reset invalidates all sessions";
  });

  await check("group configurations expose no-model, no-length, and zero-quota states", async () => {
    adminCSRF = (await bootstrap(adminContext)).csrf_token;
    const setPro = (rolling_24h_limit, allowed_lengths, model_ids) => api(adminContext, "PUT", "/api/v1/admin/groups/pro", adminCSRF, {
      rolling_24h_limit,
      max_entries: 5,
      allowed_lengths,
      model_ids,
    });
    assert((await setPro(null, ["short"], [])).status === 200, "could not save no-model group");
    assert((await generationOptions(supportNewContext)).availability.reason === "no_models", "no-model availability mismatch");
    assert((await setPro(null, [], [modelId])).status === 200, "could not save no-length group");
    assert((await generationOptions(supportNewContext)).availability.reason === "no_lengths", "no-length availability mismatch");
    assert((await setPro(0, ["short"], [modelId])).status === 200, "could not save zero-quota group");
    assert((await generationOptions(supportNewContext)).availability.reason === "quota_disabled", "zero-quota availability mismatch");
    assert((await setPro(null, ["short", "medium", "long", "xlong"], [modelId])).status === 200, "could not restore pro group");
    return "all three intentionally unavailable group states are saved and projected distinctly";
  });

  await check("batch deletion removes content and related active single-batch review without changing generation count", async () => {
    const batchId = await saveBatch(learnerContext, learnerCSRF, modelId, ["create"]);
    const before = await api(learnerContext, "GET", "/api/v1/me/learning-summary");
    const session = await api(learnerContext, "POST", "/api/v1/me/review-sessions", learnerCSRF, { mode: "single_batch", batch_id: batchId });
    assert([200, 201].includes(session.status), session.raw);
    const deleted = await api(learnerContext, "DELETE", `/api/v1/me/batches/${batchId}`, learnerCSRF, {});
    assert(deleted.status === 204, `delete batch ${deleted.status}: ${deleted.raw}`);
    assert((await api(learnerContext, "GET", `/api/v1/me/batches/${batchId}`)).status === 404, "deleted batch detail remained visible");
    const list = await api(learnerContext, "GET", "/api/v1/me/batches?entry=create");
    assert(!list.body.data.items.some((item) => item.id === batchId), "deleted batch remained searchable");
    assert((await api(learnerContext, "GET", `/api/v1/me/review-sessions/${session.body.data.session_id}`)).status === 404, "review session survived batch deletion");
    const after = await api(learnerContext, "GET", "/api/v1/me/learning-summary");
    assert(after.body.data.generation_count === before.body.data.generation_count, "batch deletion changed cumulative generation count");
    return `batch=${batchId} and active review removed; cumulative generation count preserved`;
  });

  await check("account deletion cascades learning data, sessions, and login identity", async () => {
    const deleteName = `qa_delete_${suffix}`;
    const deletePassword = "DeletePass123!";
    const deleteContext = await newContext({ locale: "en-US" });
    let deleteCSRF = (await register(deleteContext, deleteName, deletePassword, "en-US")).csrf_token;
    const deleteOther = await newContext({ locale: "en-US" });
    await login(deleteOther, deleteName, deletePassword, "en-US");
    await saveBatch(deleteContext, deleteCSRF, modelId, ["learn"]);
    const found = await api(adminContext, "GET", `/api/v1/admin/users?username=${deleteName}`);
    const deleteUserId = found.body.data.items[0].id;
    deleteCSRF = (await bootstrap(deleteContext)).csrf_token;
    const deleted = await api(deleteContext, "DELETE", "/api/v1/me/account", deleteCSRF, { current_password: deletePassword, confirmed: true });
    assert(deleted.status === 204, `account delete ${deleted.status}: ${deleted.raw}`);
    assert((await bootstrap(deleteContext)).actor.kind === "visitor", "deleted current browser did not become visitor");
    assert((await api(deleteOther, "GET", "/api/v1/me/account")).status === 401, "other session survived account deletion");
    await login(await newContext({ locale: "en-US" }), deleteName, deletePassword, "en-US", 401);
    assert((await api(adminContext, "GET", `/api/v1/admin/users/${deleteUserId}`)).status === 404, "deleted account remained in admin lookup");
    const search = await api(adminContext, "GET", `/api/v1/admin/users?username=${deleteName}`);
    assert(search.body.data.items.length === 0, "deleted account remained searchable");
    return `account=${deleteName} removed with sessions and learning ownership`;
  });

  await check("account deletion UI requires an explicit unchecked second confirmation control", async () => {
    const page = await learnerContext.newPage();
    await page.goto("/account");
    await page.getByRole("button", { name: /Delete my account|删除我的账号/, exact: true }).click();
    const dialog = page.getByRole("dialog");
    const confirmation = dialog.locator("input[type='checkbox']");
    assert((await confirmation.count()) === 1, `danger zone exposes ${await confirmation.count()} confirmation checkboxes`);
    assert(!(await confirmation.isChecked()), "account deletion confirmation is preselected");
    await dialog.getByRole("button", { name: /Keep account|保留账号/, exact: true }).click();
    return "danger zone contains one explicit unchecked confirmation checkbox";
  });

  await check("account locale preference wins across browser contexts and synchronizes after change", async () => {
    const localeOwner = await newContext({ locale: "zh-CN" });
    const localeName = `qa_locale_${suffix}`;
    const localePassword = "LocalePass123!";
    await register(localeOwner, localeName, localePassword, "zh-CN");
    const secondBrowser = await newContext({ locale: "en-US" });
    const loggedIn = await login(secondBrowser, localeName, localePassword, "en-US");
    assert(loggedIn.body.data.ui_locale === "zh-CN", `browser locale overrode account locale: ${loggedIn.raw}`);
    const csrf = loggedIn.body.data.csrf_token;
    const changed = await api(secondBrowser, "PUT", "/api/v1/me/ui-locale", csrf, { ui_locale: "en-US" });
    assert(changed.status === 200, changed.raw);
    const refreshed = await bootstrap(localeOwner);
    assert(refreshed.ui_locale === "en-US", `other browser did not observe account locale: ${JSON.stringify(refreshed)}`);
    return "account zh-CN overrides a new en-US browser; switching to en-US is visible to the other session";
  });

  await check("active cancel consumes visitor quota while passive disconnect refunds it", async () => {
    await setMockMode("slow");
    const cancelContext = await newContext({ locale: "en-US" });
    const cancelCSRF = (await bootstrap(cancelContext)).csrf_token;
    const active = await browserStream(cancelContext, cancelCSRF, modelId);
    const cancelled = await api(
      cancelContext,
      "POST",
      `/api/v1/generations/${active.started.run_id}/cancel`,
      cancelCSRF,
      {},
      { "x-generation-token": active.started.generation_token },
    );
    assert(cancelled.status === 200 && cancelled.body.data.status === "cancelled" && cancelled.body.data.quota_refunded === false, cancelled.raw);
    await active.reader.cancel().catch(() => {});
    assert((await generationOptions(cancelContext)).quota.remaining === 0, "active cancel did not consume visitor quota");

    const disconnectContext = await newContext({ locale: "en-US" });
    const disconnectCSRF = (await bootstrap(disconnectContext)).csrf_token;
    const passive = await browserStream(disconnectContext, disconnectCSRF, modelId);
    passive.controller.abort();
    await passive.reader.cancel().catch(() => {});
    await new Promise((resolve) => setTimeout(resolve, 500));
    assert((await generationOptions(disconnectContext)).quota.remaining === 1, "passive disconnect did not refund visitor quota");
    await setMockMode("success");
    return "explicit cancel remaining=0; passive disconnect remaining=1";
  });

  await check("provider, protocol, and content failures refund visitor quota", async () => {
    const cases = [
      ["provider_error", false],
      ["malformed", true],
      ["content_invalid", true],
    ];
    const observed = [];
    for (const [mode, expectsStream] of cases) {
      await setMockMode(mode);
      const context = await newContext({ locale: "en-US" });
      const csrf = (await bootstrap(context)).csrf_token;
      const response = await api(context, "POST", "/api/v1/generations/stream", csrf, {
        model_id: modelId,
        meaning_language: "en",
        scenario: "story",
        length: "short",
        entries: ["learn"],
      });
      if (expectsStream) {
        assert(response.status === 200, `${mode} status ${response.status}: ${response.raw}`);
        const failed = parseSSE(response.raw).find((event) => event.event === "generation.failed");
        assert(failed?.data.quota_refunded === true, `${mode} did not emit refunded failure: ${response.raw}`);
      } else {
        assert(response.status === 503, `${mode} status ${response.status}: ${response.raw}`);
      }
      const options = await generationOptions(context);
      assert(options.quota.remaining === 1, `${mode} remaining quota ${options.quota.remaining}`);
      observed.push(mode);
    }
    await setMockMode("success");
    return `${observed.join(", ")} all refunded visitor quota and saved no resource`;
  });

  await check("live pages have no serious/critical Axe findings and no page-level responsive overflow", async () => {
    const learnerBatches = await api(learnerContext, "GET", "/api/v1/me/batches?limit=100");
    const learnerBatchId = learnerBatches.body.data.items[0].id;
    const adminUsers = await api(adminContext, "GET", `/api/v1/admin/users?username=${learnerName}`);
    const learnerUserId = adminUsers.body.data.items[0].id;
    const routeSets = [
      { context: await newContext({ locale: "en-US" }), routes: ["/", "/login", "/register"] },
      { context: learnerContext, routes: ["/create", "/library", `/library/${learnerBatchId}`, "/review", `/review/${rangeSessionId}`, "/account"] },
      { context: adminContext, routes: ["/admin/models", "/admin/plans", "/admin/users", `/admin/users/${learnerUserId}`] },
    ];
    const violations = [];
    for (const set of routeSets) {
      const page = await set.context.newPage();
      for (const path of set.routes) {
        await page.setViewportSize({ width: 1280, height: 900 });
        await page.goto(path);
        const scan = await new AxeBuilder({ page }).analyze();
        for (const violation of scan.violations.filter((item) => ["critical", "serious"].includes(item.impact))) {
          violations.push(`${path}:${violation.id}:${violation.nodes.length}`);
        }
      }
      await page.close();
    }
    assert(violations.length === 0, violations.join(", "));
    const responsive = [
      [learnerContext, "/create"],
      [learnerContext, "/library"],
      [learnerContext, "/account"],
      [adminContext, "/admin/users"],
    ];
    for (const width of [320, 720, 900, 1280]) {
      for (const [context, path] of responsive) {
        const page = await context.newPage();
        await page.setViewportSize({ width, height: 900 });
        await page.goto(path);
        const size = await page.evaluate(() => ({ viewport: innerWidth, page: document.documentElement.scrollWidth }));
        await page.close();
        assert(size.page <= size.viewport, `${path}@${width} overflow ${size.page}>${size.viewport}`);
      }
    }
    return "13 live routes scanned with Axe; 4 representative pages fit at 320/720/900/1280px";
  });
} finally {
  await setMockMode("success").catch(() => {});
  await Promise.all((await Promise.all(contexts)).map((context) => context.close().catch(() => {})));
  await browser.close();
}

const failed = results.filter((result) => result.status === "FAIL");
process.stdout.write(`${JSON.stringify({ baseURL, summary: { passed: results.length - failed.length, failed: failed.length, total: results.length }, results }, null, 2)}\n`);
if (failed.length) process.exitCode = 1;
