import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

for (const name of [
  "QA_ADMIN_USERNAME",
  "QA_ADMIN_PASSWORD",
  "QA_PACKAGE_PASSPHRASE",
  "QA_MODELS_ENCRYPTED_PATH",
  "QA_PLANS_PATH",
  "QA_ITEMS_PATH",
  "QA_GROWTH_PATH",
  "QA_ITEMS_BLOCKED_PATH",
  "QA_EVIDENCE_DIR",
]) {
  if (!process.env[name]) throw new Error(`missing-runtime-variable:${name}`);
}
const frontendOrigin = process.env.QA_FRONTEND_ORIGIN ?? "http://127.0.0.1:43230";
const { chromium } = await import(
  process.env.QA_PLAYWRIGHT_MODULE ??
    "file:///Users/xekinzhuo/Desktop/xekin_develop/ai-en-learning-development/ai-en-learning/frontend/node_modules/@playwright/test/index.mjs"
);
const evidenceDir = process.env.QA_EVIDENCE_DIR;
await mkdir(evidenceDir, { recursive: true });
const digest = (value) => createHash("sha256").update(value).digest("hex");
const check = (condition, code) => {
  if (!condition) throw new Error(code);
};
const result = {
  version: "M002-QA-CR313-01",
  scope: "config-only protected-history isolation retest",
  learner_authenticated: false,
  started_at: new Date().toISOString(),
  operations: [],
};
const browser = await chromium.launch({ headless: true });
let failure = null;
try {
  const context = await browser.newContext({ locale: "en-US" });
  const page = await context.newPage();
  await page.goto(`${frontendOrigin}/login`);
  await page.waitForFunction(
    () => document.documentElement.dataset.appReady === "true",
  );
  await page.locator('input[name="username"]').fill(process.env.QA_ADMIN_USERNAME);
  await page.locator('input[name="password"]').fill(process.env.QA_ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await page.waitForURL("**/admin");
  const csrf = await page.evaluate(async () => {
    const response = await fetch("/api/v1/bootstrap", { cache: "no-store" });
    return (await response.json()).data.csrf_token;
  });
  const call = (method, route, body) =>
    page.evaluate(
      async ({ method, route, body, csrf }) => {
        const response = await fetch(route, {
          method,
          headers: {
            "content-type": "application/json",
            "x-csrf-token": csrf,
          },
          body: JSON.stringify(body),
          cache: "no-store",
        });
        return { status: response.status, body: await response.json() };
      },
      { method, route, body, csrf },
    );
  const packageFor = async (category, filePath, passphrase) => {
    const bytes = await readFile(filePath);
    const file_base64 = bytes.toString("base64");
    const preview = await call(
      "POST",
      `/api/v1/admin/config-portability/${category}/previews`,
      { file_base64, ...(passphrase ? { passphrase } : {}) },
    );
    check(preview.status === 200, `${category}-preview-status`);
    check(preview.body.data.can_commit === true, `${category}-preview-blocked`);
    const imported = await call(
      "POST",
      `/api/v1/admin/config-portability/${category}/imports`,
      {
        file_base64,
        preview_token: preview.body.data.preview_token,
        operation_id: preview.body.data.operation_id,
        confirmed: true,
        ...(passphrase ? { passphrase } : {}),
      },
    );
    check(
      imported.status === 200 && imported.body.data.status === "applied",
      `${category}-import-status`,
    );
    result.operations.push({
      category,
      package_sha256: digest(bytes),
      preview_counts: preview.body.data.counts,
      import_status: imported.body.data.status,
      result_revision: imported.body.data.result_revision,
      effective_day: imported.body.data.effective_day,
    });
  };
  await packageFor("plans", process.env.QA_PLANS_PATH);
  await packageFor("items", process.env.QA_ITEMS_PATH);
  await packageFor("growth", process.env.QA_GROWTH_PATH);
  await packageFor(
    "models",
    process.env.QA_MODELS_ENCRYPTED_PATH,
    process.env.QA_PACKAGE_PASSPHRASE,
  );

  const blockedBytes = await readFile(process.env.QA_ITEMS_BLOCKED_PATH);
  const blocked = await call(
    "POST",
    "/api/v1/admin/config-portability/items/previews",
    { file_base64: blockedBytes.toString("base64") },
  );
  check(
    blocked.status === 200 &&
      blocked.body.data.can_commit === false &&
      blocked.body.data.operation_id === null &&
      blocked.body.data.preview_token === null,
    "items-blocked-preview",
  );
  result.operations.push({
    category: "items",
    package_sha256: digest(blockedBytes),
    preview_only: true,
    can_commit: false,
    blocker_codes: blocked.body.data.blockers.map((item) => item.code),
  });
  await context.close();
} catch (error) {
  failure = error;
  result.failure = {
    code: error instanceof Error ? error.message : "unknown-history-retest-failure",
  };
} finally {
  result.finished_at = new Date().toISOString();
  result.status = failure ? "FAIL" : "PASS";
  await writeFile(
    path.join(evidenceDir, "qa-history-focused-results.json"),
    `${JSON.stringify(result, null, 2)}\n`,
    { mode: 0o600 },
  );
  await browser.close();
}
if (failure) throw failure;
