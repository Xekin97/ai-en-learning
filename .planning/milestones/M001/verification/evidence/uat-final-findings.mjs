import { chromium } from "../../../../../frontend/node_modules/@playwright/test/index.mjs";

const baseURL = process.env.WORDWEAVE_BASE_URL ?? "http://localhost:6001";
const prototypeURL = process.env.WORDWEAVE_PROTOTYPE_URL ?? "http://localhost:6010/prototype/index.html";
const requestHeaders = { origin: baseURL, "sec-fetch-site": "same-origin" };

function assert(condition, message) {
  if (!condition) throw new Error(message);
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
  const body = raw && response.headers()["content-type"]?.includes("json") ? JSON.parse(raw) : null;
  return { status: response.status(), raw, body };
}

async function login(context, username, password) {
  const bootstrap = await api(context, "GET", "/api/v1/bootstrap");
  const response = await api(context, "POST", "/api/v1/auth/login", bootstrap.body.data.csrf_token, {
    username,
    password,
    browser_ui_locale: "en-US",
  });
  assert(response.status === 200, `login ${response.status}: ${response.raw}`);
  return response.body.data.csrf_token;
}

async function prepareCloze(context, adminContext) {
  const candidates = await api(adminContext, "GET", "/api/v1/admin/users?username=qa_reader_&limit=100");
  assert(candidates.status === 200 && candidates.body.data.items.length, "no reusable QA reader account found");
  let csrf = "";
  for (const candidate of candidates.body.data.items) {
    const bootstrap = await api(context, "GET", "/api/v1/bootstrap");
    const signedIn = await api(context, "POST", "/api/v1/auth/login", bootstrap.body.data.csrf_token, {
      username: candidate.username,
      password: "LearnerPass123!",
      browser_ui_locale: "en-US",
    });
    if (signedIn.status === 200) {
      csrf = signedIn.body.data.csrf_token;
      break;
    }
  }
  assert(csrf, "no reusable QA reader credential succeeded");
  const batches = await api(context, "GET", "/api/v1/me/batches?limit=100");
  const batch = batches.body.data.items.find((item) => item.entries.length > 1);
  assert(batch, "reusable QA reader has no multi-target batch");
  const session = await api(context, "POST", "/api/v1/me/review-sessions", csrf, { mode: "single_batch", batch_id: batch.id });
  const attempt = await api(context, "POST", `/api/v1/me/review-sessions/${session.body.data.session_id}/attempts`, csrf, {});
  const attemptId = attempt.body.data.attempt_id;
  const token = attempt.body.data.attempt_token;
  let item = attempt.body.data.item;
  while (item.stage === "spelling") {
    const action = await api(context, "POST", `/api/v1/me/review-attempts/${attemptId}/actions`, csrf, {
      action_id: crypto.randomUUID(), item_id: item.item_id, action: "skip",
    }, { "x-review-attempt-token": token });
    assert(action.status === 200 && action.body.data.outcome === "advanced", `could not advance to cloze: ${action.raw}`);
    item = action.body.data.item;
  }
  return { sessionId: session.body.data.session_id, item };
}

async function inspectDialog(page) {
  const dialog = page.getByRole("dialog");
  await dialog.waitFor();
  return {
    title: await dialog.getByRole("heading").first().innerText(),
    labels: await dialog.locator(".field-label").allTextContents(),
    inputTypes: await dialog.locator("input").evaluateAll((nodes) => nodes.map((node) => node.type)),
    switches: await dialog.locator(".switch").count(),
    warningNotices: await dialog.locator(".notice-warning").count(),
  };
}

async function planFacts(page, actual) {
  const field = actual ? page.locator("fieldset.field").first() : page.locator(".admin-grid section .field").first();
  const label = field.locator(".field-label").first();
  const list = field.locator(".checkbox-list").first();
  const gap = await Promise.all([label.boundingBox(), list.boundingBox()]).then(([labelBox, listBox]) =>
    labelBox && listBox ? Math.round((listBox.y - (labelBox.y + labelBox.height)) * 10) / 10 : null,
  );
  return {
    saveText: await page.locator(".card-footer .button-primary").innerText(),
    availableModelsGapPx: gap,
  };
}

const browser = await chromium.launch({ headless: true });
const publicContext = await browser.newContext({ baseURL, locale: "en-US" });
const adminContext = await browser.newContext({ baseURL, locale: "en-US", viewport: { width: 1440, height: 1000 } });
const learnerContext = await browser.newContext({ baseURL, locale: "en-US", viewport: { width: 390, height: 844 } });
const prototypeContext = await browser.newContext({ locale: "en-US", viewport: { width: 1440, height: 1000 } });

try {
  const guestResults = [];
  for (const path of ["/review", "/library"]) {
    const page = await publicContext.newPage();
    await page.goto(path);
    guestResults.push({
      requested: path,
      landed: new URL(page.url()).pathname,
      redirect: new URL(page.url()).searchParams.get("redirect"),
      hasAuthGate: (await page.getByText(/Sign in to open|登录后打开/).count()) > 0,
    });
    await page.close();
  }

  const csrf = await login(adminContext, "uat_admin", "UatAdminPass6000!");
  await api(adminContext, "PUT", "/api/v1/me/ui-locale", csrf, { ui_locale: "en-US" });

  const actual = await adminContext.newPage();
  await actual.goto("/admin/models");
  const actualEyebrow = await actual.locator(".page-heading .eyebrow").innerText();
  await actual.getByRole("button", { name: "Add model", exact: true }).click();
  const actualAdd = await inspectDialog(actual);
  await actual.screenshot({ path: new URL("./screenshots/uat-final-actual-add-model.png", import.meta.url).pathname, fullPage: true });
  await actual.getByRole("dialog").getByRole("button", { name: "Cancel", exact: true }).click();
  await actual.getByRole("button", { name: "Edit model", exact: true }).first().click();
  const actualEdit = await inspectDialog(actual);
  await actual.screenshot({ path: new URL("./screenshots/uat-final-actual-edit-model.png", import.meta.url).pathname, fullPage: true });
  await actual.getByRole("dialog").getByRole("button", { name: "Cancel", exact: true }).click();
  await actual.getByRole("button", { name: "Replace key", exact: true }).click();
  const actualKeyBackground = await actual.getByRole("dialog").locator("input").evaluate((node) => getComputedStyle(node).backgroundColor);
  await actual.screenshot({ path: new URL("./screenshots/uat-final-actual-replace-key.png", import.meta.url).pathname, fullPage: true });
  await actual.getByRole("dialog").getByRole("button", { name: "Cancel", exact: true }).click();

  const prototype = await prototypeContext.newPage();
  await prototype.goto(`${prototypeURL}?page=PAGE-101&role=admin&state=default&locale=en-US`);
  await prototype.locator(".prototype-tools").evaluate((node) => { node.style.display = "none"; });
  const prototypeEyebrow = await prototype.locator(".page-heading .eyebrow").innerText();
  await prototype.getByRole("button", { name: "Add model", exact: true }).click();
  const prototypeAdd = await inspectDialog(prototype);
  await prototype.screenshot({ path: new URL("./screenshots/uat-final-prototype-add-model.png", import.meta.url).pathname, fullPage: true });
  await prototype.getByRole("dialog").getByRole("button", { name: "Cancel", exact: true }).click();
  await prototype.getByRole("button", { name: "Edit", exact: true }).first().click();
  const prototypeEdit = await inspectDialog(prototype);
  await prototype.screenshot({ path: new URL("./screenshots/uat-final-prototype-edit-model.png", import.meta.url).pathname, fullPage: true });
  await prototype.getByRole("dialog").getByRole("button", { name: "Cancel", exact: true }).click();
  await prototype.getByRole("button", { name: "Replace key", exact: true }).click();
  const prototypeKeyBackground = await prototype.getByRole("dialog").locator("input").evaluate((node) => getComputedStyle(node).backgroundColor);
  await prototype.screenshot({ path: new URL("./screenshots/uat-final-prototype-replace-key.png", import.meta.url).pathname, fullPage: true });
  await prototype.getByRole("dialog").getByRole("button", { name: "Cancel", exact: true }).click();

  await actual.goto("/admin/plans");
  const actualPlan = await planFacts(actual, true);
  await prototype.goto(`${prototypeURL}?page=PAGE-102&role=admin&state=default&locale=en-US`);
  await prototype.locator(".prototype-tools").evaluate((node) => { node.style.display = "none"; });
  const prototypePlan = await planFacts(prototype, false);

  await actual.goto("/admin/users");
  const actualUserListRows = await actual.locator(".model-list .model-row").count();
  const designPageStates = ["default", "empty"];

  const cloze = await prepareCloze(learnerContext, adminContext);
  const blankSegments = cloze.item.passage_segments.filter((segment) => segment.kind === "blank");
  const blankKeys = [...new Set(blankSegments.flatMap((segment) => Object.keys(segment)))].sort();
  const clozePage = await learnerContext.newPage();
  await clozePage.goto("/review");
  await clozePage.evaluate((count) => {
    const passage = document.createElement("p");
    passage.className = "reading-passage review-cloze-passage";
    passage.setAttribute("data-qa-layout-probe", "true");
    for (let index = 0; index < count; index += 1) {
      passage.append(`This passage places several related blanks in natural reading flow ${index + 1}: `);
      const wrapper = document.createElement("span");
      wrapper.className = "cloze-inline";
      const input = document.createElement("input");
      input.className = "cloze-input";
      wrapper.append(input);
      passage.append(wrapper, ". ");
    }
    document.querySelector("main")?.append(passage);
  }, blankSegments.length);
  const clozeLayout = await clozePage.evaluate(() => {
    const passage = document.querySelector(".review-cloze-passage");
    const inputs = [...document.querySelectorAll(".review-cloze-passage .cloze-input")];
    return {
      passageLineHeight: passage ? getComputedStyle(passage).lineHeight : null,
      inputHeight: inputs[0]?.getBoundingClientRect().height ?? null,
      blankCount: inputs.length,
      groupMarkers: document.querySelectorAll(".review-cloze-passage [data-blank-group], .review-cloze-passage .blank-group-marker").length,
      designReviewRequired: true,
    };
  });
  await clozePage.screenshot({ path: new URL("./screenshots/uat-final-cloze-mobile.png", import.meta.url).pathname, fullPage: true });

  await api(adminContext, "PUT", "/api/v1/me/ui-locale", csrf, { ui_locale: "zh-CN" });
  process.stdout.write(`${JSON.stringify({
    status: "REPRODUCED",
    guestResults,
    adminHeading: { actual: actualEyebrow, prototype: prototypeEyebrow },
    modelDialogs: { actualAdd, prototypeAdd, actualEdit, prototypeEdit },
    keyInputBackground: { actual: actualKeyBackground, prototype: prototypeKeyBackground },
    plans: { actual: actualPlan, prototype: prototypePlan },
    adminUsers: { actualInitialRows: actualUserListRows, approvedDesignStates: designPageStates, listStateDesigned: false },
    cloze: { apiBlankKeys: blankKeys, apiBlankCount: blankSegments.length, sameWordGroupFieldPresent: blankKeys.some((key) => key.includes("group") || key.includes("target")), layout: clozeLayout },
  }, null, 2)}\n`);
} finally {
  await Promise.all([publicContext.close(), adminContext.close(), learnerContext.close(), prototypeContext.close()]);
  await browser.close();
}
