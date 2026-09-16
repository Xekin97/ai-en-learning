import { chromium } from "../../../../../frontend/node_modules/@playwright/test/index.mjs";
import AxeBuilder from "../../../../../frontend/node_modules/@axe-core/playwright/dist/index.mjs";

const baseURL = process.env.WORDWEAVE_BASE_URL ?? "http://127.0.0.1:3310";
const mockURL = process.env.MOCK_OPENROUTER_URL ?? "http://127.0.0.1:39090";
const screenshots = new URL("./screenshots/", import.meta.url);
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
  return response.body.data.csrf_token;
}

async function login(context, username, password, locale = "en-US") {
  let csrf = await bootstrap(context);
  const response = await api(context, "POST", "/api/v1/auth/login", csrf, {
    username,
    password,
    browser_ui_locale: locale,
  });
  assert(response.status === 200, `login status ${response.status}: ${response.raw}`);
  return response.body.data.csrf_token;
}

async function register(context, username, password, locale = "en-US") {
  let csrf = await bootstrap(context);
  const response = await api(context, "POST", "/api/v1/auth/register", csrf, {
    username,
    password,
    password_confirmation: password,
    ui_locale: locale,
  });
  assert(response.status === 201, `register status ${response.status}: ${response.raw}`);
  return response.body.data.csrf_token;
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

async function streamViaAPI(context, csrf, payload) {
  const response = await api(context, "POST", "/api/v1/generations/stream", csrf, payload);
  assert(response.status === 200, `generation status ${response.status}: ${response.raw}`);
  assert(response.headers["content-type"]?.startsWith("text/event-stream"), "generation was not SSE");
  assert(response.headers["x-accel-buffering"] === "no", "Nginx buffering was not disabled");
  const events = parseSSE(response.raw);
  const started = events.find((event) => event.event === "generation.started");
  const validated = events.find((event) => event.event === "generation.validated");
  assert(started, "generation.started missing");
  assert(events.some((event) => event.event === "passage.delta"), "passage.delta missing");
  assert(validated, `generation.validated missing: ${response.raw}`);
  return { events, started: started.data, validated: validated.data };
}

async function discard(context, csrf, generation) {
  const response = await api(
    context,
    "POST",
    `/api/v1/generations/${generation.started.run_id}/discard`,
    csrf,
    {},
    { "x-generation-token": generation.started.generation_token },
  );
  assert(response.status === 204, `discard status ${response.status}: ${response.raw}`);
}

function allOccurrences(batch) {
  return batch.targets
    .flatMap((target) => target.occurrences)
    .sort((left, right) => left.start - right.start || left.end - right.end);
}

function groupedOccurrences(batch) {
  return batch.targets
    .flatMap((target, targetIndex) =>
      target.occurrences.map((occurrence) => ({ ...occurrence, targetIndex })),
    )
    .sort((left, right) => left.start - right.start || left.end - right.end);
}

const browser = await chromium.launch({ headless: true });
const apiRequestHeaders = { origin: baseURL, "sec-fetch-site": "same-origin" };
const adminContext = await browser.newContext({ baseURL, locale: "en-US" });
const learnerContext = await browser.newContext({ baseURL, locale: "zh-CN" });
const outsiderContext = await browser.newContext({ baseURL, locale: "en-US" });
const visitorContext = await browser.newContext({ baseURL, locale: "en-US" });

try {
  await check("deployment health and edge isolation", async () => {
    const live = await adminContext.request.get("/health/live");
    const ready = await adminContext.request.get("/health/ready");
    const metrics = await adminContext.request.get("/internal/metrics");
    assert(live.status() === 200 && (await live.text()) === "ok\n", "live health failed");
    assert(ready.status() === 200 && (await ready.text()) === "ok\n", "ready health failed");
    assert(metrics.status() === 404, `public metrics status ${metrics.status()}`);
    return "live=200, ready=200, public metrics=404";
  });

  let adminCSRF = await login(
    adminContext,
    process.env.WORDWEAVE_ADMIN_USERNAME ?? "uat_admin",
    process.env.WORDWEAVE_ADMIN_PASSWORD ?? "UatAdminPass6000!",
  );
  let modelId = "";
  const verificationRunId = Date.now();
  const modelName = `Verification model with a long localized display name that must wrap safely ${verificationRunId}`;

  await check("administrator configures encrypted credential and compatible model", async () => {
    const credential = await api(adminContext, "PUT", "/api/v1/admin/openrouter-credential", adminCSRF, {
      api_key: "integration-secret-key",
      confirmed: true,
    });
    assert(credential.status === 200, `credential status ${credential.status}: ${credential.raw}`);
    assert(credential.body.data.configured === true, "credential not marked configured");
    assert(!credential.raw.includes("integration-secret-key"), "credential leaked in response");

    const created = await api(adminContext, "POST", "/api/v1/admin/models", adminCSRF, {
      display_name: modelName,
      description: "Deterministic verification provider",
      openrouter_model_id: "provider/integration",
    });
    if (created.status === 201) {
      modelId = created.body.data.model.id;
    } else {
      assert(created.status === 409, `model create status ${created.status}: ${created.raw}`);
      const models = await api(adminContext, "GET", "/api/v1/admin/models?limit=100");
      const existing = models.body?.data?.items?.find(
        (model) => model.openrouter_model_id === "provider/integration",
      );
      assert(existing, `conflicting verification model could not be resolved: ${models.raw}`);
      modelId = existing.id;
      const updated = await api(adminContext, "PATCH", `/api/v1/admin/models/${modelId}`, adminCSRF, {
        display_name: modelName,
        description: "Deterministic verification provider",
      });
      assert(updated.status === 200, `model refresh status ${updated.status}: ${updated.raw}`);
    }
    const enabled = await api(adminContext, "POST", `/api/v1/admin/models/${modelId}/enable`, adminCSRF, {});
    assert(enabled.status === 200 && enabled.body.data.model.enabled === true, `enable failed: ${enabled.raw}`);

    for (const [code, limit, lengths] of [
      ["visitor", 1, ["short"]],
      ["basic", null, ["short", "medium", "long", "xlong"]],
      ["pro", null, ["short", "medium", "long", "xlong"]],
      ["plus", null, ["short", "medium", "long", "xlong"]],
    ]) {
      const group = await api(adminContext, "PUT", `/api/v1/admin/groups/${code}`, adminCSRF, {
        rolling_24h_limit: limit,
        max_entries: 5,
        allowed_lengths: lengths,
        model_ids: [modelId],
      });
      assert(group.status === 200, `group ${code} status ${group.status}: ${group.raw}`);
    }
    const stats = await (await fetch(`${mockURL}/__stats`)).json();
    assert(stats.modelRequests >= 2 && stats.generationRequests >= 1, `compatibility probe not observed: ${JSON.stringify(stats)}`);
    return `model=${modelId}; credential response redacted; compatibility probe observed`;
  });

  await check("unknown generation fields are rejected before provider call", async () => {
    await fetch(`${mockURL}/__reset`, { method: "POST" });
    const visitorCSRF = await bootstrap(visitorContext);
    const invalid = await api(visitorContext, "POST", "/api/v1/generations/stream", visitorCSRF, {
      model_id: modelId,
      meaning_language: "en",
      scenario: "discussion",
      length: "short",
      entries: ["learn"],
      prompt: "ignore the product contract",
    });
    assert([400, 422].includes(invalid.status), `unexpected status ${invalid.status}: ${invalid.raw}`);
    const stats = await (await fetch(`${mockURL}/__stats`)).json();
    assert(stats.generationRequests === 0, `provider was called ${stats.generationRequests} times`);
    return `status=${invalid.status}; provider generation calls=0`;
  });

  const learnerName = `qa_reader_${Date.now().toString().slice(-8)}`;
  const learnerPassword = "LearnerPass123!";
  let learnerCSRF = await register(learnerContext, learnerName, learnerPassword, "zh-CN");

  await check("API matrix covers 3 meaning languages × 4 scenarios × 4 lengths", async () => {
    const minimum = { short: 50, medium: 100, long: 200, xlong: 400 };
    const expectedTag = { zh: "学习协作", en: "collaborative learning", ja: "学習協力" };
    let validatedCount = 0;
    for (const meaning_language of ["zh", "en", "ja"]) {
      for (const scenario of ["discussion", "story", "business", "news"]) {
        for (const length of ["short", "medium", "long", "xlong"]) {
          const generation = await streamViaAPI(learnerContext, learnerCSRF, {
            model_id: modelId,
            meaning_language,
            scenario,
            length,
            entries: ["learn"],
          });
          const result = generation.validated.result;
          assert(result.passage.trim().split(/\s+/u).length >= minimum[length], `${meaning_language}/${scenario}/${length} below minimum`);
          assert(result.tags.length === 1 && result.tags[0] === expectedTag[meaning_language], `${meaning_language} tag mismatch`);
          assert(result.targets.length === 1 && result.targets[0].entry === "learn", "target mismatch");
          assert(result.targets[0].hint_blanks.length === 2, "all repeated hint positions were not projected");
          await discard(learnerContext, learnerCSRF, generation);
          validatedCount += 1;
        }
      }
    }
    return `${validatedCount}/48 deterministic provider cases validated and discarded`;
  });

  let batchId = "";
  let batchDetail = null;
  await check("multi-target generation streams, validates, and saves atomically", async () => {
    const generation = await streamViaAPI(learnerContext, learnerCSRF, {
      model_id: modelId,
      meaning_language: "en",
      scenario: "discussion",
      length: "short",
      entries: ["learn", "build", "change"],
    });
    assert(generation.validated.result.targets.length === 3, "target count mismatch");
    for (const target of generation.validated.result.targets) {
      assert(target.hint_blanks.length === 2, `${target.entry} repeated hint positions missing`);
      assert(target.occurrences.length >= 2, `${target.entry} passage occurrences missing`);
    }
    const saved = await api(
      learnerContext,
      "POST",
      `/api/v1/generations/${generation.started.run_id}/save`,
      learnerCSRF,
      {},
      { "x-generation-token": generation.started.generation_token },
    );
    assert([200, 201].includes(saved.status), `save status ${saved.status}: ${saved.raw}`);
    batchId = saved.body.data.batch_id;
    const detail = await api(learnerContext, "GET", `/api/v1/me/batches/${batchId}`);
    assert(detail.status === 200, `detail status ${detail.status}: ${detail.raw}`);
    batchDetail = detail.body.data.batch;
    assert(!detail.raw.includes('"hint_blank":'), "legacy singular hint field leaked");
    assert(batchDetail.tags.length === 1 && batchDetail.targets.every((target) => !("tags" in target)), "tags are not passage-level only");
    return `batch=${batchId}; targets=3; passage-level tags only`;
  });

  await check("learning statistics preserve all six metric values", async () => {
    const summary = await api(learnerContext, "GET", "/api/v1/me/learning-summary");
    assert(summary.status === 200, `summary status ${summary.status}`);
    const keys = Object.keys(summary.body.data).sort();
    assert(keys.length === 6, `API returned ${keys.length} metrics: ${keys.join(", ")}`);
    assert(summary.body.data.generation_count === 49, `generation count ${summary.body.data.generation_count}, expected 49`);
    assert(summary.body.data.unique_learned_entries === 3, "unique learned entries mismatch");
    return keys.join(", ");
  });

  await check("participation checkbox controls date review but not single-batch review", async () => {
    const paused = await api(learnerContext, "PATCH", `/api/v1/me/batches/${batchId}`, learnerCSRF, {
      participates_in_range_review: false,
    });
    assert(paused.status === 200 && paused.body.data.participates_in_range_review === false, `pause failed: ${paused.raw}`);
    const previewPaused = await api(learnerContext, "GET", "/api/v1/me/review-range/preview?start_date=2026-09-01&end_date=2026-09-01&timezone=Asia%2FShanghai");
    assert(previewPaused.status === 200 && previewPaused.body.data.batch_count === 0, `paused batch entered range: ${previewPaused.raw}`);
    const single = await api(learnerContext, "POST", "/api/v1/me/review-sessions", learnerCSRF, {
      mode: "single_batch",
      batch_id: batchId,
    });
    assert([200, 201].includes(single.status), `single review status ${single.status}: ${single.raw}`);
    const resumed = await api(learnerContext, "POST", "/api/v1/me/review-sessions", learnerCSRF, {
      mode: "single_batch",
      batch_id: batchId,
    });
    assert(resumed.status === 200 && resumed.body.data.reused === true, `single review was duplicated: ${resumed.raw}`);
    return `range count=0; single session=${single.body.data.session_id}; duplicate reused`;
  });

  await check("two-stage review hides every answer and supports corrected errors", async () => {
    const sessions = await api(learnerContext, "GET", "/api/v1/me/batches?entry=learn");
    const row = sessions.body.data.items.find((item) => item.id === batchId);
    assert(row.single_batch_review.action === "resume", "single review resume projection missing");
    const sessionId = row.single_batch_review.session_id;
    const started = await api(learnerContext, "POST", `/api/v1/me/review-sessions/${sessionId}/attempts`, learnerCSRF, {});
    assert(started.status === 201, `attempt status ${started.status}: ${started.raw}`);
    const attemptId = started.body.data.attempt_id;
    const attemptToken = started.body.data.attempt_token;
    let item = started.body.data.item;
    let spellingItems = 0;
    while (item.stage === "spelling") {
      const rawItem = JSON.stringify(item).toLowerCase();
      for (const entry of ["learn", "build", "change"]) assert(!rawItem.includes(entry), `spelling answer leaked: ${entry}`);
      assert(item.hint.segments.filter((segment) => segment.kind === "blank").length === 2, "not all hint positions blanked");
      let advanced = null;
      for (const candidate of ["learn", "build", "change"]) {
        const action = await api(
          learnerContext,
          "POST",
          `/api/v1/me/review-attempts/${attemptId}/actions`,
          learnerCSRF,
          { action_id: crypto.randomUUID(), item_id: item.item_id, action: "answer", answer: candidate },
          { "x-review-attempt-token": attemptToken },
        );
        assert(action.status === 200, `spelling action status ${action.status}: ${action.raw}`);
        if (action.body.data.outcome !== "retry") {
          advanced = action.body.data;
          break;
        }
        assert(action.body.data.result === "incorrect" && action.body.data.incorrect_blank_ids === null, "spelling retry contract mismatch");
      }
      assert(advanced, "none of the original entries answered the spelling item");
      item = advanced.item;
      spellingItems += 1;
    }
    assert(spellingItems === 3, `spelling item count ${spellingItems}`);
    const passageRaw = JSON.stringify(item).toLowerCase();
    for (const entry of ["learn", "build", "change"]) assert(!passageRaw.includes(entry), `passage answer leaked: ${entry}`);
    const blanks = item.passage_segments.filter((segment) => segment.kind === "blank");
    const occurrences = allOccurrences(batchDetail);
    assert(blanks.length === occurrences.length, `cloze blanks=${blanks.length}, occurrences=${occurrences.length}`);
    assert(
      blanks.every((blank) => /^grp_[A-Za-z0-9_-]{22}$/u.test(blank.group_key)),
      "API v1.3 passage group_key is missing or malformed",
    );
    const expectedGroups = new Map();
    for (const [index, occurrence] of groupedOccurrences(batchDetail).entries()) {
      const key = blanks[index].group_key;
      const existing = expectedGroups.get(occurrence.targetIndex);
      if (existing) assert(existing === key, `target ${occurrence.targetIndex} changed group_key`);
      else expectedGroups.set(occurrence.targetIndex, key);
    }
    assert(new Set(expectedGroups.values()).size === batchDetail.targets.length, "different targets shared a group_key");

    const forbiddenGroupEcho = await api(
      learnerContext,
      "POST",
      `/api/v1/me/review-attempts/${attemptId}/actions`,
      learnerCSRF,
      {
        action_id: crypto.randomUUID(),
        item_id: item.item_id,
        action: "answer",
        answers: blanks.map((blank) => ({ blank_id: blank.blank_id, answer: "wrong", group_key: blank.group_key })),
      },
      { "x-review-attempt-token": attemptToken },
    );
    assert(forbiddenGroupEcho.status === 400, `action accepted group_key: ${forbiddenGroupEcho.raw}`);

    const retry = await api(
      learnerContext,
      "POST",
      `/api/v1/me/review-attempts/${attemptId}/actions`,
      learnerCSRF,
      {
        action_id: crypto.randomUUID(),
        item_id: item.item_id,
        action: "answer",
        answers: blanks.map((blank) => ({ blank_id: blank.blank_id, answer: "wrong" })),
      },
      { "x-review-attempt-token": attemptToken },
    );
    assert(retry.status === 200 && retry.body.data.outcome === "retry", `passage retry failed: ${retry.raw}`);
    const retryBlanks = retry.body.data.item.passage_segments.filter((segment) => segment.kind === "blank");
    assert(
      retryBlanks.every((blank, index) => blank.blank_id === blanks[index].blank_id && blank.group_key === blanks[index].group_key),
      "retry changed passage blank identity or group topology",
    );
    const completed = await api(
      learnerContext,
      "POST",
      `/api/v1/me/review-attempts/${attemptId}/actions`,
      learnerCSRF,
      {
        action_id: crypto.randomUUID(),
        item_id: item.item_id,
        action: "answer",
        answers: blanks.map((blank, index) => ({ blank_id: blank.blank_id, answer: occurrences[index].surface })),
      },
      { "x-review-attempt-token": attemptToken },
    );
    assert(completed.status === 200 && completed.body.data.outcome === "session_completed", `review did not complete: ${completed.raw}`);
    assert(completed.body.data.batch_result.successful === true, "corrected spelling errors prevented success");
    return `spelling items=3; cloze blanks=${blanks.length}; groups=${expectedGroups.size}; retry topology stable; action group echo rejected; no answer leaked; session successful`;
  });

  await check("ownership and administrator read-only projections are isolated", async () => {
    const outsiderName = `qa_other_${Date.now().toString().slice(-8)}`;
    await register(outsiderContext, outsiderName, "OtherPass123!", "en-US");
    const forbiddenDetail = await api(outsiderContext, "GET", `/api/v1/me/batches/${batchId}`);
    assert(forbiddenDetail.status === 404, `cross-user detail status ${forbiddenDetail.status}`);
    const users = await api(adminContext, "GET", `/api/v1/admin/users?username=${encodeURIComponent(learnerName)}`);
    assert(users.status === 200 && users.body.data.items.length === 1, `admin user search failed: ${users.raw}`);
    const userId = users.body.data.items[0].id;
    const adminBatches = await api(adminContext, "GET", `/api/v1/admin/users/${userId}/batches`);
    assert(adminBatches.status === 200 && adminBatches.body.data.items.some((batch) => batch.id === batchId), "admin batch missing");
    assert(!adminBatches.raw.includes("single_batch_review"), "admin received learner action projection");
    const learnerAdmin = await api(learnerContext, "GET", "/api/v1/admin/groups");
    assert(learnerAdmin.status === 403, `learner admin access status ${learnerAdmin.status}`);
    return `cross-user=404; learner admin=403; admin batch DTO is read-only`;
  });

  await check("visitor quota and one-time authenticated claim work end to end", async () => {
    let visitorCSRF = await bootstrap(visitorContext);
    const generation = await streamViaAPI(visitorContext, visitorCSRF, {
      model_id: modelId,
      meaning_language: "en",
      scenario: "story",
      length: "short",
      entries: ["learn"],
    });
    const claim = await api(
      visitorContext,
      "POST",
      `/api/v1/generations/${generation.started.run_id}/visitor-claim`,
      visitorCSRF,
      {},
      { "x-generation-token": generation.started.generation_token },
    );
    assert(claim.status === 200, `claim status ${claim.status}: ${claim.raw}`);
    const exhausted = await api(visitorContext, "POST", "/api/v1/generations/stream", visitorCSRF, {
      model_id: modelId,
      meaning_language: "en",
      scenario: "story",
      length: "short",
      entries: ["learn"],
    });
    assert(exhausted.status === 429 && exhausted.body.code === "quota_exhausted", `visitor quota mismatch: ${exhausted.raw}`);
    const claimUser = `qa_claim_${Date.now().toString().slice(-8)}`;
    visitorCSRF = await register(visitorContext, claimUser, "ClaimPass123!", "en-US");
    const consume = () => api(
      visitorContext,
      "POST",
      "/api/v1/visitor-claims/consume",
      visitorCSRF,
      {},
      { "x-claim-token": claim.body.data.claim_token },
    );
    const first = await consume();
    const second = await consume();
    assert(first.status === 200 && second.status === 200, `claim consumption failed: ${first.raw} / ${second.raw}`);
    assert(first.body.data.batch_id === second.body.data.batch_id, "claim retry created a second batch");
    return `quota exhausted after one generation; claim retry reused batch=${first.body.data.batch_id}`;
  });

  await check("English fallback and Chinese brand are mutually exclusive", async () => {
    const fallbackContext = await browser.newContext({ baseURL, locale: "fr-FR" });
    const fallbackPage = await fallbackContext.newPage();
    await fallbackPage.goto("/");
    const fallbackText = await fallbackPage.locator("body").innerText();
    assert(fallbackText.includes("WordWeave") && !fallbackText.includes("词涟"), "unsupported locale did not use English-only brand");
    await fallbackPage.screenshot({ path: new URL("home-en.png", screenshots).pathname, fullPage: true });
    await fallbackContext.close();

    const chineseContext = await browser.newContext({ baseURL, locale: "zh-CN", viewport: { width: 390, height: 844 } });
    const chinesePage = await chineseContext.newPage();
    await chinesePage.goto("/");
    const chineseText = await chinesePage.locator("body").innerText();
    assert(chineseText.includes("词涟") && !chineseText.includes("WordWeave"), "Chinese page did not use Chinese-only brand");
    await chinesePage.screenshot({ path: new URL("home-zh-mobile.png", screenshots).pathname, fullPage: true });
    await chineseContext.close();
    return "fr-FR→WordWeave only; zh-CN→词涟 only";
  });

  const learnerPage = await learnerContext.newPage();
  await check("word suggestions float without changing studio height", async () => {
    await learnerPage.goto("/create");
    await learnerPage.locator(".studio-sidebar").waitFor();
    const before = await learnerPage.locator(".studio-sidebar").evaluate((node) => node.getBoundingClientRect().height);
    await learnerPage.locator("#word-search").fill("lea");
    await learnerPage.locator(".word-search-overlay [role='option']").first().waitFor();
    const after = await learnerPage.locator(".studio-sidebar").evaluate((node) => node.getBoundingClientRect().height);
    const position = await learnerPage.locator(".word-search-overlay").evaluate((node) => getComputedStyle(node).position);
    assert(position === "absolute", `overlay position=${position}`);
    assert(Math.abs(after - before) < 1, `studio height changed ${before}→${after}`);
    return `position=absolute; height delta=${Math.abs(after - before)}`;
  });

  await check("frontend consumes live SSE, preserves configuration across locale switch, and renders validated result", async () => {
    await learnerPage.locator(".word-search-overlay [role='option']", { hasText: "learn" }).click();
    await learnerPage.locator(".locale-switch select").selectOption("en-US");
    const modelChoice = learnerPage.locator(".choice-grid-model button.choice").first();
    await modelChoice.click();
    await learnerPage.getByRole("button", { name: "English", exact: true }).click();
    await learnerPage.getByRole("button", { name: "Discussion", exact: true }).click();
    await learnerPage.getByRole("button", { name: "Brief", exact: true }).click();
    await learnerPage.locator(".locale-switch select").selectOption("zh-CN");
    assert(await learnerPage.locator(".chip", { hasText: "learn" }).isVisible(), "selected entry was lost after locale switch");
    assert(await learnerPage.locator(".choice-grid-model button.choice").first().getAttribute("aria-pressed") === "true", "model selection was lost after locale switch");
    await learnerPage.locator(".locale-switch select").selectOption("en-US");
    await learnerPage.getByRole("button", { name: "Create story", exact: true }).click();
    await learnerPage.locator(".stream-status").waitFor({ state: "visible", timeout: 5_000 }).catch(() => {});
    await learnerPage.getByRole("button", { name: "Save to library", exact: true }).waitFor({ timeout: 10_000 });
    assert(await learnerPage.locator(".tag-passage").count() === 1, "passage tags missing or duplicated");
    assert(await learnerPage.locator(".resource-card").count() === 1, "target resource card mismatch");
    await learnerPage.screenshot({ path: new URL("create-live-result.png", screenshots).pathname, fullPage: true });
    return "live POST SSE reached validated UI; selected word/model survived zh↔en switch";
  });

  await check("mobile layout contains long model text without horizontal overflow", async () => {
    await learnerPage.setViewportSize({ width: 320, height: 780 });
    await learnerPage.goto("/create");
    const dimensions = await learnerPage.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth }));
    assert(dimensions.scrollWidth <= dimensions.width, `horizontal overflow ${dimensions.scrollWidth}>${dimensions.width}`);
    const modelBox = await learnerPage.locator(".choice-grid-model button.choice").first().boundingBox();
    assert(modelBox && modelBox.x >= 0 && modelBox.x + modelBox.width <= 320, `model card outside viewport: ${JSON.stringify(modelBox)}`);
    return `viewport=320; scrollWidth=${dimensions.scrollWidth}; model card contained`;
  });

  await check("learning record renders all six approved statistics", async () => {
    await learnerPage.setViewportSize({ width: 1280, height: 900 });
    await learnerPage.goto("/library");
    await learnerPage.locator(".stats-grid").waitFor();
    const statCards = await learnerPage.locator(".stat-card").count();
    await learnerPage.screenshot({ path: new URL("library-desktop.png", screenshots).pathname, fullPage: true });
    assert(statCards === 6, `rendered ${statCards} statistics; expected 6`);
    return `rendered ${statCards} statistics`;
  });

  await check("learner plan uses the approved user-facing name", async () => {
    await api(learnerContext, "PUT", "/api/v1/me/ui-locale", learnerCSRF, { ui_locale: "zh-CN" });
    await learnerPage.goto("/account");
    const text = await learnerPage.locator(".definition-list").innerText();
    assert(text.includes("基础版") && !text.includes("正式账号"), `account plan copy is ${JSON.stringify(text)}`);
    return text;
  });

  await check("single-batch review exposes its distinct source and return path", async () => {
    const newSession = await api(learnerContext, "POST", "/api/v1/me/review-sessions", learnerCSRF, { mode: "single_batch", batch_id: batchId });
    assert([200, 201].includes(newSession.status), `new single session failed: ${newSession.raw}`);
    const sessionId = newSession.body.data.session_id;
    await learnerPage.goto(`/review/${sessionId}`);
    await learnerPage.locator(".review-source-badge").waitFor({ timeout: 10_000 });
    const backHref = await learnerPage.locator(".review-context a").getAttribute("href");
    const bodyText = await learnerPage.locator("body").innerText();
    assert(backHref === "/library", `single-batch review returns to ${backHref}`);
    assert(bodyText.includes("本篇复习") || bodyText.includes("This story"), "single-batch source label missing");
    return `back=${backHref}; source label present`;
  });

  await check("administrator group changes require an explicit confirmation", async () => {
    const users = await api(adminContext, "GET", `/api/v1/admin/users?username=${encodeURIComponent(learnerName)}`);
    const userId = users.body.data.items[0].id;
    const before = await api(adminContext, "GET", `/api/v1/admin/users/${userId}`);
    const beforePlan = before.body.data.user.plan_code;
    const candidatePlan = beforePlan === "pro" ? "plus" : "pro";
    const page = await adminContext.newPage();
    await page.goto(`/admin/users/${userId}`);
    await page.getByRole("button", { name: /Change plan|更改方案/, exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.waitFor();
    await dialog.locator(".select-input").selectOption(candidatePlan);
    const whileOpen = await api(adminContext, "GET", `/api/v1/admin/users/${userId}`);
    assert(whileOpen.body.data.user.plan_code === beforePlan, "group changed before explicit modal submission");
    await dialog.getByRole("button", { name: /Cancel|取消/, exact: true }).click();
    await dialog.waitFor({ state: "hidden" });
    const after = await api(adminContext, "GET", `/api/v1/admin/users/${userId}`);
    await page.close();
    assert(after.body.data.user.plan_code === beforePlan, `cancelled group change mutated ${beforePlan}→${after.body.data.user.plan_code}`);
    return `native confirmation modal appeared; cancel kept ${beforePlan}`;
  });

  await check("critical pages have no serious or critical automated accessibility violations", async () => {
    const pages = ["/", "/create", "/library", "/account"];
    const violations = [];
    for (const path of pages) {
      await learnerPage.goto(path);
      const scan = await new AxeBuilder({ page: learnerPage }).analyze();
      for (const violation of scan.violations.filter((item) => ["critical", "serious"].includes(item.impact))) {
        violations.push(`${path}:${violation.id}:${violation.nodes.length}`);
      }
    }
    assert(violations.length === 0, violations.join(", "));
    return `${pages.length} pages scanned; no serious/critical Axe findings`;
  });

  await check("SSR navigation remains responsive in the composed environment", async () => {
    await learnerPage.goto("/");
    const navigation = await learnerPage.evaluate(() => {
      const entry = performance.getEntriesByType("navigation")[0];
      return { responseStart: entry.responseStart, domContentLoaded: entry.domContentLoadedEventEnd, load: entry.loadEventEnd };
    });
    assert(navigation.responseStart < 2_000, `responseStart ${navigation.responseStart}ms`);
    assert(navigation.load < 5_000, `load ${navigation.load}ms`);
    return navigation;
  });
} finally {
  await Promise.all([adminContext.close(), learnerContext.close(), outsiderContext.close(), visitorContext.close()]);
  await browser.close();
}

const failed = results.filter((result) => result.status === "FAIL");
process.stdout.write(`${JSON.stringify({ baseURL, summary: { passed: results.length - failed.length, failed: failed.length, total: results.length }, results }, null, 2)}\n`);
