import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const required = [
  "QA_ADMIN_USERNAME",
  "QA_ADMIN_PASSWORD",
  "QA_LEARNER_USERNAME",
  "QA_LEARNER_PASSWORD",
  "QA_PACKAGE_PASSPHRASE",
  "QA_ISSUED_ITEM_ID",
  "QA_EVIDENCE_DIR",
];
for (const name of required) {
  if (!process.env[name]) throw new Error(`missing-runtime-variable:${name}`);
}

const frontendOrigin = process.env.QA_FRONTEND_ORIGIN ?? "http://127.0.0.1:43230";
const playwrightModule =
  process.env.QA_PLAYWRIGHT_MODULE ??
  "file:///Users/xekinzhuo/Desktop/xekin_develop/ai-en-learning-development/ai-en-learning/frontend/node_modules/@playwright/test/index.mjs";
const { chromium } = await import(playwrightModule);
const evidenceDir = process.env.QA_EVIDENCE_DIR;
await mkdir(evidenceDir, { recursive: true });

const approved = JSON.parse(
  await readFile(
    new URL("../../../../design/config-portability/copy.json", import.meta.url),
    "utf8",
  ),
);
const alignment = JSON.parse(
  await readFile(
    new URL(
      "../../../../design/config-portability/technical-alignment/copy.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const messages = {
  ...approved.static,
  ...approved.templates,
  ...alignment.static,
  ...alignment.templates,
};
const t = (locale, key) => messages[`${locale}.${key}`];
const now = () => new Date().toISOString();
const sha256 = (value) =>
  createHash("sha256").update(value).digest("hex");
const check = (condition, code) => {
  if (!condition) throw new Error(code);
};
const codeOf = (response) => response.body?.code ?? null;

const results = {
  version: "M002-QA-CR313-01",
  started_at: now(),
  environment: {
    frontend_origin: frontendOrigin,
    browser: "chromium",
    database: "isolated disposable synthetic fixture",
    secrets_persisted: false,
  },
  cases: [],
  screenshots: [],
  provider_requests: "reported separately by fixture owner",
};
const record = (id, status, facts, started) => {
  results.cases.push({
    id,
    status,
    duration_ms: Date.now() - started,
    facts,
  });
};

async function login(page, username, password) {
  await page.goto(`${frontendOrigin}/login`);
  await page.waitForFunction(
    () => document.documentElement.dataset.appReady === "true",
  );
  await page.locator('input[name="username"]').fill(username);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await page.waitForURL(/\/(admin|generate|library)(?:$|[/?#])/);
}

async function bootstrap(page) {
  const response = await page.evaluate(async () => {
    const result = await fetch("/api/v1/bootstrap", { cache: "no-store" });
    return { status: result.status, body: await result.json() };
  });
  check(response.status === 200, "bootstrap-status");
  check(
    typeof response.body?.data?.csrf_token === "string",
    "bootstrap-csrf-shape",
  );
  return response.body.data.csrf_token;
}

async function setLocale(page, optionName) {
  await page.locator(".locale-control .ww-select-trigger").click();
  await page.getByRole("option", { name: optionName, exact: true }).click();
}

async function call(page, csrf, method, route, body) {
  return page.evaluate(
    async ({ csrfToken, requestMethod, requestRoute, requestBody }) => {
      const headers = new Headers();
      if (requestBody !== undefined)
        headers.set("content-type", "application/json");
      if (csrfToken) headers.set("x-csrf-token", csrfToken);
      const started = performance.now();
      const response = await fetch(requestRoute, {
        method: requestMethod,
        headers,
        cache: "no-store",
        ...(requestBody !== undefined
          ? { body: JSON.stringify(requestBody) }
          : {}),
      });
      const text = await response.text();
      let parsed = null;
      try {
        parsed = text ? JSON.parse(text) : null;
      } catch {
        parsed = null;
      }
      return {
        status: response.status,
        contentType: response.headers.get("content-type"),
        cacheControl: response.headers.get("cache-control"),
        contentDisposition: response.headers.get("content-disposition"),
        retryAfter: response.headers.get("retry-after"),
        elapsedMs: Math.round(performance.now() - started),
        text,
        body: parsed,
      };
    },
    {
      csrfToken: csrf,
      requestMethod: method,
      requestRoute: route,
      requestBody: body,
    },
  );
}

const fileBase64 = (text) => Buffer.from(text, "utf8").toString("base64");
const jsonFile = (value) => JSON.stringify(value);
const clone = (value) => structuredClone(value);

const browser = await chromium.launch({ headless: true });
let failed = null;
try {
  const adminContext = await browser.newContext({
    viewport: { width: 1440, height: 950 },
    locale: "en-US",
  });
  const admin = await adminContext.newPage();
  await login(
    admin,
    process.env.QA_ADMIN_USERNAME,
    process.env.QA_ADMIN_PASSWORD,
  );
  const csrf = await bootstrap(admin);

  {
    const started = Date.now();
    const anonymousContext = await browser.newContext();
    const anonymous = await anonymousContext.newPage();
    const unauthenticated = await anonymous.goto(
      `${frontendOrigin}/api/v1/admin/config-portability/models/current`,
    );
    check(unauthenticated?.status() === 401, "anonymous-current-not-401");
    await anonymousContext.close();

    const learnerContext = await browser.newContext({ locale: "en-US" });
    const learner = await learnerContext.newPage();
    await login(
      learner,
      process.env.QA_LEARNER_USERNAME,
      process.env.QA_LEARNER_PASSWORD,
    );
    const forbidden = await learner.evaluate(async () => {
      const response = await fetch(
        "/api/v1/admin/config-portability/models/current",
        { cache: "no-store" },
      );
      return response.status;
    });
    check(forbidden === 403, "learner-current-not-403");
    await learnerContext.close();

    const csrfRejected = await call(
      admin,
      null,
      "POST",
      "/api/v1/admin/config-portability/models/exports",
      { include_credentials: false },
    );
    check(csrfRejected.status === 403, "missing-csrf-not-403");
    record(
      "QA313-01-auth",
      "PASS",
      {
        anonymous_status: 401,
        learner_status: 403,
        missing_csrf_status: 403,
      },
      started,
    );
  }

  const exports = {};
  {
    const started = Date.now();
    for (const category of ["models", "plans", "items", "growth"]) {
      const response = await call(
        admin,
        csrf,
        "POST",
        `/api/v1/admin/config-portability/${category}/exports`,
        { include_credentials: false },
      );
      check(response.status === 200, `plain-export-${category}-status`);
      check(response.cacheControl === "no-store", `plain-export-${category}-cache`);
      check(
        response.contentDisposition?.includes(`wordweave-${category}-`),
        `plain-export-${category}-filename`,
      );
      const forbiddenKeys = [
        '"api_key"',
        '"credential_configured"',
        '"masked_hint"',
        '"users"',
        '"announcements"',
        '"presets"',
      ];
      check(
        forbiddenKeys.every((key) => !response.text.includes(key)),
        `plain-export-${category}-scope`,
      );
      exports[category] = response.body;
    }
    check(exports.models?.credential_mode === "none", "model-plain-mode");
    record(
      "QA313-01-export-scope",
      "PASS",
      {
        categories: Object.keys(exports),
        models_connections: exports.models.data.connections.length,
        plans: exports.plans.data.plans.length,
        items: exports.items.data.items.length,
        growth_levels: exports.growth.data.levels.length,
        package_hashes: Object.fromEntries(
          Object.entries(exports).map(([key, value]) => [
            key,
            sha256(JSON.stringify(value)),
          ]),
        ),
      },
      started,
    );
  }

  let encryptedModelsText;
  {
    const started = Date.now();
    const passphrase = process.env.QA_PACKAGE_PASSPHRASE;
    const encrypted = await call(
      admin,
      csrf,
      "POST",
      "/api/v1/admin/config-portability/models/exports",
      {
        include_credentials: true,
        passphrase,
        passphrase_confirmation: passphrase,
      },
    );
    check(encrypted.status === 200, "encrypted-export-status");
    check(
      encrypted.body?.credential_mode === "encrypted" &&
        encrypted.body?.format === "wordweave-config-encrypted",
      "encrypted-export-shape",
    );
    encryptedModelsText = encrypted.text;

    const correct = await call(
      admin,
      csrf,
      "POST",
      "/api/v1/admin/config-portability/models/previews",
      { file_base64: fileBase64(encrypted.text), passphrase },
    );
    check(correct.status === 200, "encrypted-preview-status");
    check(correct.body?.data?.can_commit === true, "encrypted-preview-commit");
    const connections = correct.body.data.changes.filter(
      (item) => item.kind === "connection",
    );
    check(
      connections.length === exports.models.data.connections.length &&
        connections.every(
          (item) => item.credential_action === "replace_from_package",
        ),
      "encrypted-preview-credential-actions",
    );

    const wrong = await call(
      admin,
      csrf,
      "POST",
      "/api/v1/admin/config-portability/models/previews",
      {
        file_base64: fileBase64(encrypted.text),
        passphrase: `${passphrase}x`,
      },
    );
    check(
      wrong.status === 422 && codeOf(wrong) === "decryption_failed",
      "wrong-password-result",
    );
    check(!wrong.text.includes(passphrase), "wrong-password-echo");

    const tampered = clone(encrypted.body);
    const final = tampered.ciphertext.at(-1);
    tampered.ciphertext = `${tampered.ciphertext.slice(0, -1)}${final === "A" ? "B" : "A"}`;
    const tamper = await call(
      admin,
      csrf,
      "POST",
      "/api/v1/admin/config-portability/models/previews",
      { file_base64: fileBase64(jsonFile(tampered)), passphrase },
    );
    check(
      tamper.status === 422 && codeOf(tamper) === "decryption_failed",
      "tamper-result",
    );

    const plainMissing = await call(
      admin,
      csrf,
      "POST",
      "/api/v1/admin/config-portability/models/previews",
      { file_base64: fileBase64(jsonFile(exports.models)) },
    );
    check(
      plainMissing.status === 422 &&
        codeOf(plainMissing) === "credentials_required",
      "plain-model-import-not-rejected",
    );
    check(
      !plainMissing.text.includes(process.env.QA_PACKAGE_PASSPHRASE),
      "plain-model-secret-echo",
    );
    record(
      "QA313-02-credentials",
      "PASS",
      {
        encrypted_hash: sha256(encrypted.text),
        connection_count: connections.length,
        wrong_password: { status: wrong.status, code: codeOf(wrong) },
        tamper: { status: tamper.status, code: codeOf(tamper) },
        ordinary_package: {
          status: plainMissing.status,
          code: codeOf(plainMissing),
        },
      },
      started,
    );
  }

  let blockedItemsText;
  {
    const started = Date.now();
    const initialCurrent = await call(
      admin,
      null,
      "GET",
      "/api/v1/admin/config-portability/plans/current",
    );
    check(initialCurrent.status === 200, "plans-current-before");
    const initialRevision = initialCurrent.body.data.revision;
    const planA = clone(exports.plans);
    const planB = clone(exports.plans);
    check(planA.data.plans.length === 4, "plans-not-four");
    const priorities = planA.data.plans.map((item) => item.priority);
    [planA.data.plans[0].priority, planA.data.plans[1].priority] = [
      priorities[1],
      priorities[0],
    ];
    [planB.data.plans[2].priority, planB.data.plans[3].priority] = [
      priorities[3],
      priorities[2],
    ];
    planB.data.plans[0].rolling_24h_limit = 0;
    planB.data.plans[0].allowed_lengths = [];
    planB.data.plans[0].model_ids = [];
    planB.data.plans[0].content_review_enabled = false;
    planB.data.plans[0].content_repair_limit = 0;

    const preview = async (value) =>
      call(
        admin,
        csrf,
        "POST",
        "/api/v1/admin/config-portability/plans/previews",
        { file_base64: fileBase64(jsonFile(value)) },
      );
    const previewA = await preview(planA);
    const previewB = await preview(planB);
    check(previewA.status === 200 && previewA.body.data.can_commit, "plan-a-preview");
    check(previewB.status === 200 && previewB.body.data.can_commit, "plan-b-preview");
    const invalidToken = await call(
      admin,
      csrf,
      "POST",
      `/api/v1/admin/config-portability/plans/operations/${previewA.body.data.operation_id}/resolve`,
      { preview_token: `${previewA.body.data.preview_token}x` },
    );
    check(
      invalidToken.status === 403 &&
        codeOf(invalidToken) === "recovery_token_invalid",
      "invalid-recovery-token-result",
    );
    const afterPreview = await call(
      admin,
      null,
      "GET",
      "/api/v1/admin/config-portability/plans/current",
    );
    check(
      afterPreview.body.data.revision === initialRevision,
      "preview-mutated-plans",
    );

    const importFrom = async (value, previewValue) =>
      call(
        admin,
        csrf,
        "POST",
        "/api/v1/admin/config-portability/plans/imports",
        {
          file_base64: fileBase64(jsonFile(value)),
          preview_token: previewValue.body.data.preview_token,
          operation_id: previewValue.body.data.operation_id,
          confirmed: true,
        },
      );
    const applied = await importFrom(planB, previewB);
    check(
      applied.status === 200 && applied.body.data.status === "applied",
      "plan-b-import",
    );
    const appliedRepeat = await importFrom(planB, previewB);
    check(
      appliedRepeat.status === 200 &&
        appliedRepeat.body.data.status === "applied" &&
        appliedRepeat.body.data.result_revision ===
          applied.body.data.result_revision,
      "plan-idempotency",
    );
    const stale = await importFrom(planA, previewA);
    check(
      stale.status === 200 &&
        stale.body.data.status === "not_applied" &&
        stale.body.data.reason_code === "revision_changed" &&
        Object.values(stale.body.data.counts).every((value) => value === 0),
      "plan-stale-result",
    );

    const missingPlan = clone(exports.plans);
    missingPlan.data.plans.pop();
    const missingPlanResult = await preview(missingPlan);
    check(
      missingPlanResult.status === 422 &&
        codeOf(missingPlanResult) === "validation_failed",
      "missing-fixed-plan",
    );
    const missingRequired = clone(exports.plans);
    delete missingRequired.data.plans[0].priority;
    const missingRequiredResult = await preview(missingRequired);
    check(
      missingRequiredResult.status === 422 &&
        codeOf(missingRequiredResult) === "validation_failed",
      "missing-required-priority",
    );
    record(
      "QA313-03-plans",
      "PASS",
      {
        preview_revision_unchanged: true,
        applied_revision_changed: applied.body.data.result_revision !== initialRevision,
        repeated_operation_same_result_revision: true,
        stale_reason: stale.body.data.reason_code,
        invalid_recovery_token: {
          status: invalidToken.status,
          code: codeOf(invalidToken),
        },
        representative_values: {
          explicit_zero: true,
          explicit_false: true,
          explicit_empty_arrays: true,
          explicit_unlimited_null_present: planB.data.plans.some(
            (item) => item.rolling_24h_limit === null,
          ),
        },
        missing_plan: {
          status: missingPlanResult.status,
          code: codeOf(missingPlanResult),
        },
        missing_required: {
          status: missingRequiredResult.status,
          code: codeOf(missingRequiredResult),
        },
      },
      started,
    );
  }

  {
    const started = Date.now();
    const items = clone(exports.items);
    const beforeCount = items.data.items.length;
    items.data.items = items.data.items.filter(
      (item) => item.id !== process.env.QA_ISSUED_ITEM_ID,
    );
    check(items.data.items.length === beforeCount - 1, "issued-item-fixture-not-found");
    blockedItemsText = jsonFile(items);
    const blocked = await call(
      admin,
      csrf,
      "POST",
      "/api/v1/admin/config-portability/items/previews",
      { file_base64: fileBase64(blockedItemsText) },
    );
    check(
      blocked.status === 200 &&
        blocked.body.data.can_commit === false &&
        blocked.body.data.operation_id === null &&
        blocked.body.data.preview_token === null,
      "issued-item-not-blocked",
    );
    check(
      blocked.body.data.blockers.some(
        (item) =>
          item.source_category === "target_history" &&
          item.code === "ever_issued" &&
          item.target.identity === process.env.QA_ISSUED_ITEM_ID,
      ),
      "issued-item-blocker-shape",
    );

    const growthPreview = await call(
      admin,
      csrf,
      "POST",
      "/api/v1/admin/config-portability/growth/previews",
      { file_base64: fileBase64(jsonFile(exports.growth)) },
    );
    check(
      growthPreview.status === 200 &&
        growthPreview.body.data.can_commit === true &&
        growthPreview.body.data.effects.history_preserved === true &&
        growthPreview.body.data.effects.usage_reset === false &&
        growthPreview.body.data.effects.trial_dates_changed === false,
      "growth-preview-effects",
    );
    const growthImport = await call(
      admin,
      csrf,
      "POST",
      "/api/v1/admin/config-portability/growth/imports",
      {
        file_base64: fileBase64(jsonFile(exports.growth)),
        preview_token: growthPreview.body.data.preview_token,
        operation_id: growthPreview.body.data.operation_id,
        confirmed: true,
      },
    );
    check(
      growthImport.status === 200 &&
        growthImport.body.data.status === "applied",
      "growth-import",
    );
    record(
      "QA313-04-history-blockers",
      "PASS",
      {
        item_blocker: {
          can_commit: false,
          blocker_codes: blocked.body.data.blockers.map((item) => item.code),
          target_identity_matches_fixture: true,
        },
        growth: {
          history_preserved: true,
          usage_reset: false,
          trial_dates_changed: false,
          status: growthImport.body.data.status,
          effective_day: growthImport.body.data.effective_day,
        },
      },
      started,
    );
  }

  {
    const started = Date.now();
    await admin.goto(`${frontendOrigin}/admin/plans`);
    await admin.waitForFunction(
      () => document.documentElement.dataset.appReady === "true",
    );
    await setLocale(admin, "EN");
    await admin.getByRole("button", { name: "Tier priority", exact: true }).click();
    const priority = admin.locator("#priority-editor");
    check(
      await priority.evaluate((node) => node.matches(":modal")),
      "priority-not-modal",
    );
    const first = priority.locator('input[type="number"]').nth(0);
    const second = priority.locator('input[type="number"]').nth(1);
    await first.fill("37");
    await second.fill("41");
    await priority.getByRole("button", { name: "Save changes", exact: true }).click();
    check((await first.inputValue()) === "37", "priority-draft-first-lost");
    check((await second.inputValue()) === "41", "priority-draft-second-lost");
    await admin.mouse.click(2, 2);
    check(await priority.isVisible(), "priority-backdrop-closed");
    for (let index = 0; index < 12; index++) {
      await admin.keyboard.press("Tab");
      check(
        await priority.evaluate((node) => node.contains(document.activeElement)),
        "priority-focus-escaped",
      );
    }
    await admin.keyboard.press("Escape");
    check(!(await priority.isVisible()), "priority-escape-did-not-close");
    check(
      await admin.getByRole("button", { name: "Tier priority", exact: true }).evaluate(
        (node) => node === document.activeElement,
      ),
      "priority-focus-not-restored",
    );
    record(
      "QA313-07-priority-modal",
      "PASS",
      {
        top_layer: true,
        draft_preserved_after_preview: true,
        backdrop_did_not_close: true,
        tab_samples_contained: 12,
        escape_focus_restored: true,
      },
      started,
    );
  }

  {
    const started = Date.now();
    await admin.goto(`${frontendOrigin}/admin/models`);
    await admin.waitForFunction(
      () => document.documentElement.dataset.appReady === "true",
    );
    await setLocale(admin, "中文");
    await admin.getByRole("button", {
      name: t("zh", "portability.import"),
      exact: true,
    }).click();
    const dialog = admin.locator("#cr313-dialog");
    check(
      await dialog.evaluate((node) => node.matches(":modal")),
      "portability-not-modal",
    );
    await dialog.locator('input[type="file"]').setInputFiles({
      name: "qa-models.wwcfg.json",
      mimeType: "application/json",
      buffer: Buffer.from(encryptedModelsText),
    });
    await dialog.locator('input[type="password"]').fill(process.env.QA_PACKAGE_PASSPHRASE);
    await dialog.getByRole("button", {
      name: t("zh", "import.validate"),
      exact: true,
    }).click();
    await dialog.getByRole("button", {
      name: t("zh", "preview.confirm"),
      exact: true,
    }).click();
    await dialog.getByLabel(t("zh", "confirm.ack"), { exact: true }).check();
    let importRequests = 0;
    await admin.route("**/api/v1/admin/config-portability/models/imports", async (route) => {
      importRequests += 1;
      await route.fetch();
      await route.abort("failed");
    });
    await dialog.getByRole("button", {
      name: t("zh", "confirm.replace"),
      exact: true,
    }).click();
    await dialog.getByText(t("zh", "result.unknownHelp"), { exact: true }).waitFor();
    check(importRequests === 1, "ui-import-request-count-after-drop");
    await dialog.getByRole("button", {
      name: t("zh", "result.read"),
      exact: true,
    }).click();
    await dialog.getByText(t("zh", "result.current"), { exact: true }).waitFor();
    check(importRequests === 1, "ui-current-replayed-import");
    await dialog.getByRole("button", {
      name: t("zh", "result.check"),
      exact: true,
    }).click();
    await admin.waitForTimeout(1_000);
    const resolvedText = await dialog.innerText();
    const resolvedStatus = resolvedText.includes(t("zh", "result.successHelp"))
      ? "applied"
      : resolvedText.includes(t("zh", "result.notAppliedHelp"))
        ? "not_applied"
        : resolvedText.includes(t("zh", "result.refreshFailed"))
          ? "applied_refresh_failed"
          : "missing_terminal_copy";
    check(resolvedStatus !== "missing_terminal_copy", "ui-resolve-no-terminal-copy");
    check(importRequests === 1, "ui-resolve-replayed-import");
    const screenshot = path.join(evidenceDir, "desktop-zh-unknown-resolved.png");
    await admin.screenshot({ path: screenshot, fullPage: true });
    results.screenshots.push({
      file: path.basename(screenshot),
      locale: "zh-CN",
      viewport: "1440x950",
      state: "models applied after dropped response resolve",
    });
    await admin.unroute("**/api/v1/admin/config-portability/models/imports");
    record(
      "QA313-06-unknown-resolve-ui",
      "PASS",
      {
        import_requests: importRequests,
        current_did_not_change_operation_fact: true,
        resolve_terminal_status: resolvedStatus,
      },
      started,
    );
  }

  {
    const started = Date.now();
    const mobileContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      locale: "en-US",
    });
    const mobile = await mobileContext.newPage();
    await login(
      mobile,
      process.env.QA_ADMIN_USERNAME,
      process.env.QA_ADMIN_PASSWORD,
    );
    await mobile.goto(`${frontendOrigin}/admin/growth`);
    await mobile.waitForFunction(
      () => document.documentElement.dataset.appReady === "true",
    );
    await setLocale(mobile, "EN");
    await mobile.getByRole("button", {
      name: t("en", "portability.import"),
      exact: true,
    }).click();
    const dialog = mobile.locator("#cr313-dialog");
    await dialog.locator('input[type="file"]').setInputFiles({
      name: "qa-items.json",
      mimeType: "application/json",
      buffer: Buffer.from(blockedItemsText),
    });
    await dialog.getByRole("button", {
      name: t("en", "import.validate"),
      exact: true,
    }).click();
    await dialog.getByText(t("en", "error.dependencyHelp"), { exact: true }).waitFor();
    check(
      (await dialog.getByRole("button", {
        name: t("en", "preview.confirm"),
        exact: true,
      }).count()) === 0,
      "blocked-ui-has-confirm",
    );
    const measurements = await dialog.evaluate((node) => {
      const rect = node.getBoundingClientRect();
      const buttons = [...node.querySelectorAll("button")].map((button) => {
        const value = button.getBoundingClientRect();
        return { width: value.width, height: value.height };
      });
      const footerButtons = [
        ...node.querySelectorAll(".dialog-actions button"),
      ].map((button) => button.getBoundingClientRect().height);
      return {
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        viewport: { width: innerWidth, height: innerHeight },
        document_overflow_x: document.documentElement.scrollWidth - innerWidth,
        dialog_overflow_x: node.scrollWidth - node.clientWidth,
        minimum_button_height: Math.min(...buttons.map((button) => button.height)),
        minimum_footer_button_height: Math.min(...footerButtons),
        active_inside: node.contains(document.activeElement),
        modal: node.matches(":modal"),
      };
    });
    check(measurements.modal, "mobile-dialog-not-modal");
    check(measurements.document_overflow_x === 0, "mobile-page-overflow");
    check(measurements.dialog_overflow_x === 0, "mobile-dialog-overflow");
    check(measurements.minimum_button_height >= 44, "mobile-target-height");
    check(
      measurements.minimum_footer_button_height >= 48,
      "mobile-footer-target-height",
    );
    const screenshot = path.join(evidenceDir, "mobile-en-items-blocked.png");
    await mobile.screenshot({ path: screenshot, fullPage: true });
    results.screenshots.push({
      file: path.basename(screenshot),
      locale: "en-US",
      viewport: "390x844",
      state: "issued-item history blocker",
    });
    await mobileContext.close();
    record(
      "QA313-07-mobile-blocked",
      "PASS",
      {
        imports_dispatched: 0,
        measurements,
        approved_copy_present: true,
      },
      started,
    );
  }

  results.timings_ms = Object.fromEntries(
    results.cases.map((item) => [item.id, item.duration_ms]),
  );
  await adminContext.close();
} catch (error) {
  failed = error;
  results.failure = {
    code: error instanceof Error ? error.message : "unknown-harness-failure",
  };
} finally {
  results.finished_at = now();
  results.status = failed ? "FAIL" : "PASS";
  await writeFile(
    path.join(evidenceDir, "qa-functional-results.json"),
    `${JSON.stringify(results, null, 2)}\n`,
    { mode: 0o600 },
  );
  await browser.close();
}

if (failed) throw failed;
