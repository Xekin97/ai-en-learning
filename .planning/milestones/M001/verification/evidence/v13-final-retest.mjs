import { chromium } from "../../../../../frontend/node_modules/@playwright/test/index.mjs";
import AxeBuilder from "../../../../../frontend/node_modules/@axe-core/playwright/dist/index.mjs";

const baseURL = process.env.WORDWEAVE_BASE_URL ?? "http://localhost:6001";
const prototypeURL =
  process.env.WORDWEAVE_PROTOTYPE_URL ??
  "http://localhost:6010/prototype/index.html";
const adminUsername = process.env.WORDWEAVE_ADMIN_USERNAME ?? "uat_admin";
const adminPassword =
  process.env.WORDWEAVE_ADMIN_PASSWORD ?? "UatAdminPass6000!";
const requestHeaders = { origin: baseURL, "sec-fetch-site": "same-origin" };
const screenshotRoot = new URL("./screenshots/v13-final-retest/", import.meta.url);
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

async function api(context, method, path, csrfToken, data, extraHeaders = {}) {
  const headers = { ...requestHeaders, ...extraHeaders };
  if (csrfToken) headers["x-csrf-token"] = csrfToken;
  const response = await context.request.fetch(path, {
    method,
    headers,
    ...(data === undefined ? {} : { data }),
  });
  const raw = await response.text();
  const body =
    raw && response.headers()["content-type"]?.includes("json")
      ? JSON.parse(raw)
      : null;
  return { status: response.status(), raw, body };
}

async function bootstrap(context) {
  const response = await api(context, "GET", "/api/v1/bootstrap");
  assert(response.status === 200, `bootstrap ${response.status}: ${response.raw}`);
  return response.body.data;
}

async function login(context, username, password, locale = "en-US") {
  const security = await bootstrap(context);
  const response = await api(
    context,
    "POST",
    "/api/v1/auth/login",
    security.csrf_token,
    { username, password, browser_ui_locale: locale },
  );
  assert(response.status === 200, `login ${response.status}: ${response.raw}`);
  return response.body.data;
}

async function register(context, username, password, locale = "en-US") {
  const security = await bootstrap(context);
  const response = await api(
    context,
    "POST",
    "/api/v1/auth/register",
    security.csrf_token,
    {
      username,
      password,
      password_confirmation: password,
      ui_locale: locale,
    },
  );
  assert(
    response.status === 201,
    `register ${username} ${response.status}: ${response.raw}`,
  );
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

async function createBatch(context, csrf, modelId, entries) {
  const streamed = await api(
    context,
    "POST",
    "/api/v1/generations/stream",
    csrf,
    {
      model_id: modelId,
      meaning_language: "en",
      scenario: "story",
      length: "short",
      entries,
    },
  );
  assert(streamed.status === 200, `generation ${streamed.status}: ${streamed.raw}`);
  const events = parseSSE(streamed.raw);
  const started = events.find((event) => event.event === "generation.started")?.data;
  const validated = events.find(
    (event) => event.event === "generation.validated",
  )?.data;
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
  const detail = await api(
    context,
    "GET",
    `/api/v1/me/batches/${saved.body.data.batch_id}`,
  );
  assert(detail.status === 200, `batch detail ${detail.status}: ${detail.raw}`);
  return detail.body.data.batch;
}

function groupStyleTokens(className) {
  return className
    .split(/\s+/u)
    .filter(
      (value) =>
        value.startsWith("cloze-tone-") || value.startsWith("cloze-pattern-"),
    )
    .sort()
    .join(" ");
}

function groupedValues(keys, values) {
  const groups = new Map();
  keys.forEach((key, index) => {
    const group = groups.get(key) ?? [];
    group.push(values[index]);
    groups.set(key, group);
  });
  return groups;
}

function assertSameWithinDistinctAcross(keys, values, label) {
  const groups = groupedValues(keys, values);
  for (const [key, group] of groups) {
    assert(new Set(group).size === 1, `${label} changed within ${key}`);
  }
  assert(
    new Set([...groups.values()].map((group) => group[0])).size === groups.size,
    `${label} was reused across different groups`,
  );
  return groups.size;
}

async function switchLocale(page, locale) {
  const responsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === "PUT" &&
      response.url().endsWith("/api/v1/me/ui-locale"),
  );
  await page.locator(".locale-switch select").selectOption(locale);
  await responsePromise;
  await page.waitForFunction(
    (value) => document.documentElement.lang === value,
    locale,
  );
}

async function seriousAxeFindings(page) {
  const scan = await new AxeBuilder({ page }).analyze();
  return scan.violations
    .filter((violation) => ["critical", "serious"].includes(violation.impact))
    .map(
      (violation) =>
        `${violation.id}:${violation.nodes
          .flatMap((node) => node.target)
          .join("|")}`,
    );
}

const browser = await chromium.launch({ headless: true });
const contexts = [];
function newContext(options = {}) {
  const context = browser.newContext({ baseURL, ...options });
  contexts.push(context);
  return context;
}

const suffix = Date.now().toString(36).slice(-7);
const learnerUsername = `qa_v13_${suffix}`;
const learnerPassword = "V13RetestPass123!";
let learnerCSRF = "";
let learnerBatch = null;
let reviewSessionId = "";
let reviewPage = null;
let adminPage = null;

try {
  const adminContext = await newContext({
    locale: "en-US",
    viewport: { width: 1440, height: 1000 },
  });
  const learnerContext = await newContext({
    locale: "en-US",
    viewport: { width: 1440, height: 1000 },
  });
  const adminActor = await login(
    adminContext,
    adminUsername,
    adminPassword,
    "en-US",
  );
  const learnerActor = await register(
    learnerContext,
    learnerUsername,
    learnerPassword,
    "en-US",
  );
  learnerCSRF = learnerActor.csrf_token;
  const options = await api(learnerContext, "GET", "/api/v1/generation-options");
  assert(
    options.status === 200 && options.body.data.models.length,
    `generation options unavailable: ${options.raw}`,
  );
  learnerBatch = await createBatch(
    learnerContext,
    learnerCSRF,
    options.body.data.models[0].id,
    ["learn", "build", "change"],
  );
  const reviewSession = await api(
    learnerContext,
    "POST",
    "/api/v1/me/review-sessions",
    learnerCSRF,
    { mode: "single_batch", batch_id: learnerBatch.id },
  );
  assert(
    [200, 201].includes(reviewSession.status),
    `review session ${reviewSession.status}: ${reviewSession.raw}`,
  );
  reviewSessionId = reviewSession.body.data.session_id;

  await check("CR-017 guest gates remain on /library and /review", async () => {
    const publicContext = await newContext({
      locale: "en-US",
      viewport: { width: 390, height: 844 },
    });
    const evidence = [];
    for (const path of ["/library", "/review"]) {
      const page = await publicContext.newPage();
      const privateRequests = [];
      page.on("request", (request) => {
        const requestPath = new URL(request.url()).pathname;
        if (
          /^\/api\/v1\/me\/(?:learning-summary|batches|review-range|review-sessions)/u.test(
            requestPath,
          )
        )
          privateRequests.push(requestPath);
      });
      await page.goto(path);
      await page.locator(".auth-gate").waitFor();
      await page.waitForTimeout(150);
      assert(new URL(page.url()).pathname === path, `${path} landed at ${page.url()}`);
      assert(privateRequests.length === 0, `${path} loaded ${privateRequests.join(",")}`);
      const links = await page.locator(".auth-gate a").evaluateAll((nodes) =>
        nodes.map((node) => node.getAttribute("href")),
      );
      for (const target of ["/login", "/register"]) {
        const href = links.find((value) => value?.startsWith(target));
        assert(href, `${path} missing ${target} action`);
        assert(
          new URL(href, baseURL).searchParams.get("redirect") === path,
          `${path} ${target} return intent mismatch: ${href}`,
        );
      }
      evidence.push(`${path}:gate+login+register+no-private-api`);
      await page.close();
    }

    return `${evidence.join("; ")}; both login and registration actions preserve a validated return path`;
  });

  await check("CR-018 admin heading, dialogs, key surface, and plans match approved details", async () => {
    adminPage = await adminContext.newPage();
    await adminPage.goto("/admin/models");
    await adminPage.locator(".page-heading").waitFor();
    if ((await adminPage.locator("html").getAttribute("lang")) !== "en-US")
      await switchLocale(adminPage, "en-US");
    assert(
      (await adminPage.locator(".page-heading .eyebrow").innerText()) ===
        "ADMIN WORKSPACE",
      "admin eyebrow is not ADMIN WORKSPACE",
    );

    const inspectModelDialog = async (button) => {
      await button.click();
      const dialog = adminPage.getByRole("dialog");
      await dialog.waitFor();
      const facts = {
        fields: await dialog.locator('input:not([type="checkbox"])').count(),
        enabledSwitches: await dialog.locator(".admin-model-enabled").count(),
        warningNotices: await dialog.locator(".notice-warning").count(),
      };
      assert(
        facts.fields === 3 &&
          facts.enabledSwitches === 1 &&
          facts.warningNotices === 1,
        `model dialog mismatch: ${JSON.stringify(facts)}`,
      );
      await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
      return facts;
    };
    const add = await inspectModelDialog(
      adminPage.getByRole("button", { name: "Add model", exact: true }),
    );
    const edit = await inspectModelDialog(
      adminPage.getByRole("button", { name: "Edit model", exact: true }).first(),
    );

    await adminPage.getByRole("button", { name: "Replace key", exact: true }).click();
    const keyInput = adminPage.getByRole("dialog").locator(".admin-key-input");
    const actualKeyBackground = await keyInput.evaluate(
      (node) => getComputedStyle(node).backgroundColor,
    );
    await adminPage.screenshot({
      path: new URL("admin-key.png", screenshotRoot).pathname,
      fullPage: true,
    });
    await adminPage
      .getByRole("dialog")
      .getByRole("button", { name: "Cancel", exact: true })
      .click();

    await adminPage.goto("/admin/plans");
    const plan = await adminPage.evaluate(() => {
      const legend = document.querySelector(".admin-available-models > .field-label");
      const list = document.querySelector(".admin-available-models > .checkbox-list");
      const legendBox = legend?.getBoundingClientRect();
      const listBox = list?.getBoundingClientRect();
      return {
        gap:
          legendBox && listBox
            ? Math.round((listBox.y - legendBox.bottom) * 10) / 10
            : null,
        save: document.querySelector(".card-footer .button-primary")?.textContent?.trim(),
      };
    });
    assert(plan.gap === 8, `Available models gap ${plan.gap}px`);
    assert(plan.save === "Save changes", `plans save copy ${plan.save}`);

    const prototypeContext = await newContext({
      locale: "en-US",
      viewport: { width: 1440, height: 1000 },
    });
    const prototype = await prototypeContext.newPage();
    await prototype.goto(
      `${prototypeURL}?page=PAGE-101&role=admin&state=default&locale=en-US`,
    );
    await prototype.getByRole("button", { name: "Replace key", exact: true }).click();
    const prototypeKeyBackground = await prototype
      .getByRole("dialog")
      .locator("input")
      .evaluate((node) => getComputedStyle(node).backgroundColor);
    assert(
      prototypeKeyBackground === actualKeyBackground,
      `actual/prototype key input differ: ${actualKeyBackground}/${prototypeKeyBackground}`,
    );
    assert(
      actualKeyBackground === "rgb(255, 255, 255)",
      `key input background ${actualKeyBackground}`,
    );
    await prototype.close();
    return `heading exact; add=${JSON.stringify(add)}; edit=${JSON.stringify(edit)}; key=${actualKeyBackground}; plans gap=8px and Save changes`;
  });

  await check("PAGE-103 search-first user lifecycle and focus return are complete", async () => {
    const prefix = `qav13${suffix}`.slice(0, 15);
    for (let index = 0; index < 23; index += 1) {
      const context = await newContext({ locale: "en-US" });
      await register(
        context,
        `${prefix}_${String(index).padStart(2, "0")}`.slice(0, 32),
        "SearchUserPass123!",
        "en-US",
      );
    }

    const page = await adminContext.newPage();
    const initialListRequests = [];
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (url.pathname === "/api/v1/admin/users") initialListRequests.push(url.href);
    });
    await page.goto("/admin/users");
    await page.locator(".admin-user-empty").waitFor();
    assert(
      (await page.locator(".admin-user-result").count()) === 0,
      "initial state preloaded users",
    );
    assert(initialListRequests.length === 0, "initial state requested the user list");

    let delayNext = true;
    await page.route("**/api/v1/admin/users?**", async (route) => {
      if (delayNext) {
        delayNext = false;
        await new Promise((resolve) => setTimeout(resolve, 350));
      }
      await route.continue();
    });
    const search = page.getByRole("search");
    await search.getByRole("textbox").fill(prefix);
    await search.getByRole("button", { name: "Search", exact: true }).click();
    await page.locator('.admin-user-results[aria-busy="true"]').waitFor();
    await page.locator(".admin-user-result").first().waitFor();
    const firstPageCount = await page.locator(".admin-user-result").count();
    assert(firstPageCount === 20, `first search page count ${firstPageCount}`);
    const names = await page.locator(".admin-user-result .user-name").allTextContents();
    assert(
      JSON.stringify(names) ===
        JSON.stringify([...names].sort((left, right) => left.localeCompare(right, undefined, { sensitivity: "base" }))),
      "user results are not case-insensitive username order",
    );
    const loadMore = page.getByRole("button", { name: "Load more", exact: true });
    assert(await loadMore.isVisible(), "load-more state missing");
    await loadMore.click();
    await page.waitForFunction(
      () => document.querySelectorAll(".admin-user-result").length > 20,
    );
    assert(
      (await page.locator(".admin-user-result").count()) === 23,
      "load more did not append all matching users",
    );

    const firstOpen = page.locator(".admin-user-result a[data-user-id]").first();
    const selectedId = await firstOpen.getAttribute("data-user-id");
    await firstOpen.click();
    await page.waitForURL((url) => url.pathname.startsWith("/admin/users/") && url.searchParams.get("q") === prefix);
    await page.locator(".admin-user-detail-toolbar a").click();
    await page.waitForURL((url) => url.pathname === "/admin/users" && url.searchParams.get("q") === prefix);
    assert(
      (await page.getByRole("search").getByRole("textbox").inputValue()) === prefix,
      "search query was not restored",
    );
    assert(
      selectedId &&
        (await page
          .locator(`[data-user-id="${selectedId}"]`)
          .evaluate((node) => document.activeElement === node)),
      "focus did not return to the selected user",
    );

    await page.getByRole("search").getByRole("textbox").fill(`${prefix}_00`);
    await page.getByRole("search").getByRole("button", { name: "Search", exact: true }).click();
    await page.waitForFunction(
      () => document.querySelectorAll(".admin-user-result").length === 1,
    );

    await page.getByRole("search").getByRole("textbox").fill(`missing_${suffix}`);
    await Promise.all([
      page.waitForResponse((response) => {
        const url = new URL(response.url());
        return (
          response.request().method() === "GET" &&
          url.pathname === "/api/v1/admin/users" &&
          url.searchParams.get("username") === `missing_${suffix}`
        );
      }),
      page
        .getByRole("search")
        .getByRole("button", { name: "Search", exact: true })
        .click(),
    ]);
    await page.locator(".admin-user-empty").waitFor();
    assert(
      (await page.locator(".admin-user-result").count()) === 0,
      "empty search rendered user rows",
    );

    let abortNext = true;
    await page.unroute("**/api/v1/admin/users?**");
    await page.route("**/api/v1/admin/users?**", async (route) => {
      if (abortNext) {
        abortNext = false;
        await route.abort("failed");
      } else await route.continue();
    });
    await page.getByRole("search").getByRole("textbox").fill(`error_${suffix}`);
    await page.getByRole("search").getByRole("button", { name: "Search", exact: true }).click();
    await page.getByRole("alert").waitFor();
    await page.screenshot({
      path: new URL("admin-users-error.png", screenshotRoot).pathname,
      fullPage: true,
    });
    return "no initial list; loading, 20+3 pagination, sorted results, single, empty, error, detail return, query and focus all verified";
  });

  await check("API v1.3 cloze grouping renders safely and remains stable", async () => {
    reviewPage = await learnerContext.newPage();
    const attemptResponsePromise = reviewPage.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        response.url().endsWith(`/review-sessions/${reviewSessionId}/attempts`),
    );
    await reviewPage.goto(`/review/${reviewSessionId}`);
    let actionData = (await (await attemptResponsePromise).json()).data;
    while (actionData.item.stage === "spelling") {
      const skipButton = reviewPage.getByRole("button", {
        name: "Skip for now",
        exact: true,
      });
      await skipButton.waitFor();
      assert(await skipButton.isEnabled(), "spelling skip action is disabled");
      const [actionResponse] = await Promise.all([
        reviewPage.waitForResponse(
          (response) =>
            response.request().method() === "POST" &&
            /\/api\/v1\/me\/review-attempts\/[^/]+\/actions$/u.test(
              new URL(response.url()).pathname,
            ),
        ),
        skipButton.click(),
      ]);
      actionData = (await actionResponse.json()).data;
    }
    assert(actionData.item.stage === "passage_cloze", "did not reach passage cloze");
    await reviewPage.locator(".cloze-slot").first().waitFor();
    const passageBlanks = actionData.item.passage_segments.filter(
      (segment) => segment.kind === "blank",
    );
    const keys = passageBlanks.map((blank) => blank.group_key);
    assert(
      keys.every((key) => /^grp_[A-Za-z0-9_-]{22}$/u.test(key)),
      "invalid v1.3 group key",
    );
    assert(new Set(keys).size === 3, `expected 3 anonymous groups, got ${new Set(keys).size}`);

    const slots = reviewPage.locator(".cloze-slot");
    const beforeClasses = (
      await slots.evaluateAll((nodes) => nodes.map((node) => node.className))
    ).map(groupStyleTokens);
    const beforeNames = await reviewPage
      .locator(".cloze-input")
      .evaluateAll((nodes) =>
        nodes.map((node) => node.labels?.[0]?.textContent?.trim() ?? ""),
      );
    const groupCount = assertSameWithinDistinctAcross(keys, beforeClasses, "style");
    assertSameWithinDistinctAcross(keys, beforeNames, "accessible group name");
    assert(
      !beforeNames.join(" ").match(/learn|build|change|\d/u),
      `accessible names leak answer or numeric group: ${beforeNames.join(" | ")}`,
    );
    const rawHtml = await reviewPage.content();
    for (const key of new Set(keys))
      assert(!rawHtml.includes(key), `raw group key leaked into DOM: ${key}`);
    const inputMarkup = await reviewPage
      .locator(".cloze-input")
      .evaluateAll((nodes) => nodes.map((node) => node.outerHTML).join(" "));
    assert(
      !inputMarkup.match(/learn|build|change|group_key|groupRef/u),
      `input attributes leak review data: ${inputMarkup}`,
    );

    await reviewPage.locator(".cloze-input").first().focus();
    const firstKey = keys[0];
    for (let index = 0; index < keys.length; index += 1) {
      const className = await slots.nth(index).getAttribute("class");
      assert(
        keys[index] === firstKey
          ? className.includes("is-group-active")
          : className.includes("is-group-muted"),
        `focus linkage mismatch at blank ${index}`,
      );
    }

    await switchLocale(reviewPage, "zh-CN");
    const afterLocaleClasses = (
      await slots.evaluateAll((nodes) => nodes.map((node) => node.className))
    ).map(groupStyleTokens);
    assert(
      JSON.stringify(afterLocaleClasses) === JSON.stringify(beforeClasses),
      "locale switch reassigned group styles",
    );
    const zhNames = await reviewPage
      .locator(".cloze-input")
      .evaluateAll((nodes) =>
        nodes.map((node) => node.labels?.[0]?.textContent?.trim() ?? ""),
      );
    assertSameWithinDistinctAcross(keys, zhNames, "localized accessible group name");

    const layoutEvidence = [];
    for (const width of [320, 390, 640, 720, 1440]) {
      await reviewPage.setViewportSize({ width, height: 1000 });
      const layout = await reviewPage.evaluate(() => {
        const passage = document.querySelector(".review-cloze-passage p");
        const inputs = [...document.querySelectorAll(".cloze-input")];
        const rects = inputs.map((node) => {
          const rect = node.getBoundingClientRect();
          return {
            left: rect.left,
            right: rect.right,
            top: rect.top,
            bottom: rect.bottom,
            width: rect.width,
            height: rect.height,
          };
        });
        const overlaps = [];
        for (let left = 0; left < rects.length; left += 1)
          for (let right = left + 1; right < rects.length; right += 1)
            if (
              rects[left].left < rects[right].right &&
              rects[left].right > rects[right].left &&
              rects[left].top < rects[right].bottom &&
              rects[left].bottom > rects[right].top
            )
              overlaps.push([left, right]);
        const style = passage ? getComputedStyle(passage) : null;
        return {
          viewport: innerWidth,
          documentWidth: document.documentElement.scrollWidth,
          ratio: style
            ? Number.parseFloat(style.lineHeight) / Number.parseFloat(style.fontSize)
            : 0,
          overlaps,
          rects,
        };
      });
      assert(layout.documentWidth <= layout.viewport, `${width}px page overflow`);
      assert(layout.ratio >= 3.09, `${width}px cloze line-height ratio ${layout.ratio}`);
      assert(layout.overlaps.length === 0, `${width}px overlapping inputs ${JSON.stringify(layout.overlaps)}`);
      assert(
        layout.rects.every(
          (rect) =>
            rect.height >= 35 &&
            (width > 720 || rect.width <= width * 0.42 + 2),
        ),
        `${width}px input dimensions violate the responsive contract`,
      );
      layoutEvidence.push(`${width}:${layout.ratio.toFixed(2)}`);
    }

    await switchLocale(reviewPage, "en-US");
    const sortedOccurrences = learnerBatch.targets
      .flatMap((target) => target.occurrences)
      .sort((left, right) => left.start - right.start || left.end - right.end);
    const inputs = reviewPage.locator(".cloze-input");
    await inputs.nth(0).fill(sortedOccurrences[0].surface);
    for (let index = 1; index < passageBlanks.length; index += 1)
      await inputs.nth(index).fill("definitely-wrong");
    let submittedBody = null;
    reviewPage.on("request", (request) => {
      if (
        request.method() === "POST" &&
        /\/api\/v1\/me\/review-attempts\/[^/]+\/actions$/u.test(
          new URL(request.url()).pathname,
        )
      )
        submittedBody = request.postDataJSON();
    });
    const [retryResponse] = await Promise.all([
      reviewPage.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          /\/api\/v1\/me\/review-attempts\/[^/]+\/actions$/u.test(
            new URL(response.url()).pathname,
          ),
      ),
      reviewPage
        .locator(".review-card-actions .button-primary")
        .click(),
    ]);
    const retryData = (await retryResponse.json()).data;
    assert(retryData.outcome === "retry", "wrong cloze answers did not retry");
    assert(
      !/group/i.test(JSON.stringify(submittedBody)),
      `action request leaked grouping: ${JSON.stringify(submittedBody)}`,
    );
    const retryKeys = retryData.item.passage_segments
      .filter((segment) => segment.kind === "blank")
      .map((blank) => blank.group_key);
    assert(JSON.stringify(retryKeys) === JSON.stringify(keys), "retry changed group topology");
    await reviewPage.locator(".feedback-error").waitFor();
    assert(
      (await reviewPage.locator(".cloze-slot.is-incorrect").count()) ===
        passageBlanks.length - 1,
      "incorrect state was not applied independently per blank",
    );
    const afterRetryClasses = (
      await slots.evaluateAll((nodes) => nodes.map((node) => node.className))
    ).map(groupStyleTokens);
    assert(
      JSON.stringify(afterRetryClasses) === JSON.stringify(beforeClasses),
      "error retry reassigned group styles",
    );
    await reviewPage.setViewportSize({ width: 390, height: 1000 });
    await reviewPage.screenshot({
      path: new URL("cloze-mobile-error.png", screenshotRoot).pathname,
      fullPage: true,
    });
    return `9 blanks/${groupCount} groups; DOM and action redacted; focus, locale and retry stable; one correct + eight independent errors; layouts ${layoutEvidence.join(", ")}`;
  });

  await check("targeted responsive and accessibility regression is clean", async () => {
    const publicContext = await newContext({ locale: "en-US" });
    const targets = [
      [publicContext, "/library"],
      [publicContext, "/review"],
      [adminContext, "/admin/models"],
      [adminContext, "/admin/plans"],
      [adminContext, "/admin/users"],
    ];
    const findings = [];
    let cases = 0;
    for (const width of [320, 390, 720, 1440]) {
      for (const [context, path] of targets) {
        const page = await context.newPage();
        await page.setViewportSize({ width, height: 1000 });
        await page.goto(path);
        const dimensions = await page.evaluate(() => ({
          viewport: innerWidth,
          documentWidth: document.documentElement.scrollWidth,
        }));
        if (dimensions.documentWidth > dimensions.viewport)
          findings.push(`${path}@${width}:overflow`);
        if (width === 390 || width === 1440) {
          for (const violation of await seriousAxeFindings(page))
            findings.push(`${path}@${width}:${violation}`);
        }
        cases += 1;
        await page.close();
      }
    }
    for (const width of [390, 1440]) {
      await reviewPage.setViewportSize({ width, height: 1000 });
      const dimensions = await reviewPage.evaluate(() => ({
        viewport: innerWidth,
        documentWidth: document.documentElement.scrollWidth,
      }));
      if (dimensions.documentWidth > dimensions.viewport)
        findings.push(`/review/${reviewSessionId}@${width}:overflow`);
      for (const violation of await seriousAxeFindings(reviewPage))
        findings.push(`/review/${reviewSessionId}@${width}:${violation}`);
      cases += 1;
    }
    assert(findings.length === 0, findings.join(", "));
    return `${cases} responsive cases and 12 Axe page scans; no overflow or serious/critical finding`;
  });
} finally {
  await Promise.all((await Promise.all(contexts)).map((context) => context.close().catch(() => {})));
  await browser.close();
}

const failed = results.filter((result) => result.status === "FAIL");
process.stdout.write(
  `${JSON.stringify(
    {
      baseURL,
      prototypeURL,
      learnerUsername,
      batchId: learnerBatch?.id ?? null,
      reviewSessionId,
      summary: {
        passed: results.length - failed.length,
        failed: failed.length,
        total: results.length,
      },
      results,
    },
    null,
    2,
  )}\n`,
);
if (failed.length) process.exitCode = 1;
