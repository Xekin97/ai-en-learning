import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

for (const name of [
  "QA_ADMIN_USERNAME",
  "QA_ADMIN_PASSWORD",
  "QA_PACKAGE_PASSPHRASE",
  "QA_MODELS_ENCRYPTED_PATH",
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
const check = (condition, code) => {
  if (!condition) throw new Error(code);
};
const result = {
  version: "M002-QA-CR313-01",
  scope: "focused UI retest after harness-method failures",
  started_at: new Date().toISOString(),
  cases: [],
  screenshots: [],
};
const browser = await chromium.launch({ headless: true });

async function login(page) {
  await page.goto(`${frontendOrigin}/login`);
  await page.waitForFunction(
    () => document.documentElement.dataset.appReady === "true",
  );
  await page.locator('input[name="username"]').fill(process.env.QA_ADMIN_USERNAME);
  await page.locator('input[name="password"]').fill(process.env.QA_ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await page.waitForURL("**/admin");
}
async function ready(page) {
  await page.waitForFunction(
    () => document.documentElement.dataset.appReady === "true",
  );
}
async function setLocale(page, optionName) {
  await page.locator(".locale-control .ww-select-trigger").click();
  await page.getByRole("option", { name: optionName, exact: true }).click();
}

let failure = null;
try {
  const desktopContext = await browser.newContext({
    viewport: { width: 1440, height: 950 },
    locale: "en-US",
  });
  const desktop = await desktopContext.newPage();
  await login(desktop);
  await desktop.goto(`${frontendOrigin}/admin/models`);
  await ready(desktop);
  await setLocale(desktop, "中文");
  await desktop.getByRole("button", {
    name: t("zh", "portability.import"),
    exact: true,
  }).click();
  const dialog = desktop.locator("#cr313-dialog");
  await dialog.locator('input[type="file"]').setInputFiles(
    process.env.QA_MODELS_ENCRYPTED_PATH,
  );
  await dialog.locator('input[type="password"]').fill(
    process.env.QA_PACKAGE_PASSPHRASE,
  );
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
  await desktop.route("**/api/v1/admin/config-portability/models/imports", async (route) => {
    importRequests += 1;
    await route.fetch();
    await route.abort("failed");
  });
  await dialog.getByRole("button", {
    name: t("zh", "confirm.replace"),
    exact: true,
  }).click();
  await dialog.getByText(t("zh", "result.unknownHelp"), { exact: true }).waitFor();
  check(importRequests === 1, "desktop-unknown-import-count");
  await dialog.getByRole("button", {
    name: t("zh", "result.read"),
    exact: true,
  }).click();
  await dialog.getByText(t("zh", "result.current"), { exact: true }).waitFor();
  check(importRequests === 1, "desktop-current-replayed-import");
  await dialog.getByRole("button", {
    name: t("zh", "result.check"),
    exact: true,
  }).click();
  await desktop.waitForTimeout(1_000);
  const resolvedText = await dialog.innerText();
  const terminal = resolvedText.includes(t("zh", "result.successHelp"))
    ? "applied"
    : resolvedText.includes(t("zh", "result.notAppliedHelp"))
      ? "not_applied"
      : resolvedText.includes(t("zh", "result.refreshFailed"))
        ? "applied_refresh_failed"
        : "missing";
  check(terminal !== "missing", "desktop-resolve-terminal-copy");
  check(importRequests === 1, "desktop-resolve-replayed-import");
  const desktopShot = path.join(evidenceDir, "desktop-zh-unknown-resolved.png");
  await desktop.screenshot({ path: desktopShot, fullPage: true });
  result.screenshots.push({
    file: path.basename(desktopShot),
    viewport: "1440x950",
    locale: "zh-CN",
    state: `unknown resolved ${terminal}`,
  });
  result.cases.push({
    id: "QA313-06-unknown-resolve-ui",
    status: "PASS",
    facts: {
      import_requests: importRequests,
      current_did_not_change_operation_fact: true,
      terminal,
    },
  });
  await desktopContext.close();

  const mobileContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    locale: "en-US",
  });
  const mobile = await mobileContext.newPage();
  await login(mobile);
  await mobile.goto(`${frontendOrigin}/admin/growth`);
  await ready(mobile);
  await setLocale(mobile, "EN");
  await mobile.getByRole("button", {
    name: t("en", "portability.import"),
    exact: true,
  }).click();
  const mobileDialog = mobile.locator("#cr313-dialog");
  await mobileDialog.locator('input[type="file"]').setInputFiles(
    process.env.QA_ITEMS_BLOCKED_PATH,
  );
  await mobileDialog.getByRole("button", {
    name: t("en", "import.validate"),
    exact: true,
  }).click();
  await mobileDialog.getByText(t("en", "error.dependencyHelp"), {
    exact: true,
  }).waitFor();
  check(
    (await mobileDialog.getByRole("button", {
      name: t("en", "preview.confirm"),
      exact: true,
    }).count()) === 0,
    "mobile-blocked-has-confirm",
  );
  const measurements = await mobileDialog.evaluate((node) => {
    const rect = node.getBoundingClientRect();
    const all = [...node.querySelectorAll("button")].map(
      (button) => button.getBoundingClientRect().height,
    );
    const footer = [...node.querySelectorAll(".dialog-actions button")].map(
      (button) => button.getBoundingClientRect().height,
    );
    return {
      rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      page_overflow_x: document.documentElement.scrollWidth - innerWidth,
      dialog_overflow_x: node.scrollWidth - node.clientWidth,
      minimum_button_height: Math.min(...all),
      minimum_footer_button_height: Math.min(...footer),
      modal: node.matches(":modal"),
      active_inside: node.contains(document.activeElement),
    };
  });
  check(measurements.modal, "mobile-not-modal");
  check(measurements.page_overflow_x === 0, "mobile-page-overflow");
  check(measurements.dialog_overflow_x === 0, "mobile-dialog-overflow");
  check(measurements.minimum_button_height >= 44, "mobile-button-target");
  check(
    measurements.minimum_footer_button_height >= 48,
    "mobile-footer-target",
  );
  const mobileShot = path.join(evidenceDir, "mobile-en-items-blocked.png");
  await mobile.screenshot({ path: mobileShot, fullPage: true });
  result.screenshots.push({
    file: path.basename(mobileShot),
    viewport: "390x844",
    locale: "en-US",
    state: "issued-item dependency/history blocker",
  });
  result.cases.push({
    id: "QA313-07-mobile-blocked",
    status: "PASS",
    facts: { imports_dispatched: 0, measurements },
  });
  await mobileContext.close();
} catch (error) {
  failure = error;
  result.failure = {
    code: error instanceof Error ? error.message : "unknown-focused-ui-failure",
  };
} finally {
  result.finished_at = new Date().toISOString();
  result.status = failure ? "FAIL" : "PASS";
  await writeFile(
    path.join(evidenceDir, "qa-ui-focused-results.json"),
    `${JSON.stringify(result, null, 2)}\n`,
    { mode: 0o600 },
  );
  await browser.close();
}
if (failure) throw failure;
