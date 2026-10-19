import fs from "node:fs";
import { chromium } from "../../../../../../frontend/node_modules/@playwright/test/index.mjs";

const origin = "http://127.0.0.1:3014";
const privateEnvPath = "/private/tmp/wordweave-m003-uat-local-002/private-env.json";
const providerLog = "/private/tmp/wordweave-m003-uat-local-002/provider-calls.jsonl";
const env = JSON.parse(fs.readFileSync(privateEnvPath, "utf8"));
const result = {
  purpose: "Functional UAT readiness only; no article-quality judgment and no real-provider call.",
  authorization: "USER-M003-UAT-PREPARE-20261012",
  origin,
  checks: {},
  roles: {},
  page_errors: [],
  failures: [],
  result: "FAIL",
};
const check = (name, pass, detail = null) => {
  result.checks[name] = { pass: Boolean(pass), detail };
  if (!pass) result.failures.push(name);
};
const calls = () =>
  fs.existsSync(providerLog)
    ? fs.readFileSync(providerLog, "utf8").split("\n").filter(Boolean)
    : [];
async function ready(page) {
  await page.waitForFunction(
    () => document.documentElement.dataset.appReady === "true",
  );
}
async function login(page, username, password) {
  await page.goto(origin + "/login");
  await ready(page);
  await page.locator('input[name="username"]').fill(username);
  await page.locator('input[name="password"]').fill(password);
  await page.locator('form button[type="submit"]').click();
  await page.waitForURL((url) => !url.pathname.includes("/login"));
}
async function options(page) {
  return page.evaluate(async () => {
    const response = await fetch("/api/v1/generation-options");
    if (!response.ok) throw new Error(`generation-options ${response.status}`);
    return (await response.json()).data;
  });
}
async function select(page, label, value) {
  const control = page.getByRole("combobox", { name: label });
  const native = control.locator("..").locator("select");
  const text = (await native.locator(`option[value="${value}"]`).textContent()).trim();
  await control.click();
  await page
    .locator(`[id="${await control.getAttribute("aria-controls")}"]`)
    .getByRole("option", { name: text, exact: true })
    .click();
}

const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({
    locale: "zh-CN",
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  page.on("pageerror", (error) => result.page_errors.push(error.message));

  await page.goto(origin + "/create");
  await ready(page);
  const settings = page.locator("details.settings");
  if (!(await settings.evaluate((node) => node.open)))
    await settings.locator("summary").click();
  const visitor = await options(page);
  const visitorModelNames = visitor.models.map((model) => model.name);
  result.roles.visitor = {
    plan: visitor.effective_plan,
    content_service: visitor.content_service,
    model_count: visitor.models.length,
  };
  check(
    "visitor_chinese_create_and_real_model_visible",
    (await page.locator("html").getAttribute("lang")) === "zh-CN" &&
      visitorModelNames.includes("UAT 真实｜DeepSeek V4 Flash 0731"),
    { real_model_visible: visitorModelNames.includes("UAT 真实｜DeepSeek V4 Flash 0731") },
  );

  for (const role of ["BASIC", "PRO"]) {
    await context.clearCookies();
    await login(page, env[`${role}_USERNAME`], env[`${role}_PASSWORD`]);
    await page.goto(origin + "/create");
    await ready(page);
    const model = await options(page);
    result.roles[role.toLowerCase()] = {
      login: "pass",
      plan: model.effective_plan,
      content_service: model.content_service,
      quota_kind: model.quota.kind,
      quota_remaining: model.quota.remaining ?? null,
    };
  }
  check(
    "basic_and_pro_password_login_and_plan_configuration",
    result.roles.basic.plan.code === "basic" &&
      result.roles.basic.content_service.content_repair_limit === 0 &&
      result.roles.pro.plan.code === "pro" &&
      result.roles.pro.content_service.content_repair_limit === 1,
    { basic: result.roles.basic, pro: result.roles.pro },
  );

  await context.clearCookies();
  await login(page, env.ADMIN_USERNAME, env.ADMIN_PASSWORD);
  await page.goto(origin + "/admin/models");
  await ready(page);
  result.roles.admin = { login: "pass", page: "/admin/models" };
  const provider = page.locator(".generic-provider-card", {
    hasText: "UAT local synthetic provider",
  });
  await provider.getByRole("button", { name: "编辑服务商", exact: true }).click();
  const dialog = page.locator("#admin-model");
  await dialog.waitFor({ state: "visible" });
  let row = dialog.locator(".generic-model-item").nth(5);
  if (
    (await row.locator('input[name="providerModelId"]').inputValue()) !==
    "synthetic/snapshot"
  )
    throw new Error("snapshot fixture is not the expected sixth model row");
  await row.locator(".generic-model-advanced > summary").click();
  let custom = row.locator(".custom-parameters");
  const original = await custom.inputValue();
  const smokeValue = '{"temperature":0.27,"qa_uat_readback":true}';
  const callsBeforeEdit = calls().length;
  await custom.fill(smokeValue);
  await dialog.getByRole("button", { name: "保存服务商", exact: true }).click();
  await dialog.waitFor({ state: "hidden" });
  await provider.getByRole("button", { name: "编辑服务商", exact: true }).click();
  await dialog.waitFor({ state: "visible" });
  row = dialog.locator(".generic-model-item").nth(5);
  await row.locator(".generic-model-advanced > summary").click();
  custom = row.locator(".custom-parameters");
  const readback = await custom.inputValue();
  await custom.fill(original);
  await dialog.getByRole("button", { name: "保存服务商", exact: true }).click();
  await dialog.waitFor({ state: "hidden" });
  await provider.getByRole("button", { name: "编辑服务商", exact: true }).click();
  await dialog.waitFor({ state: "visible" });
  row = dialog.locator(".generic-model-item").nth(5);
  await row.locator(".generic-model-advanced > summary").click();
  const restored = (await row.locator(".custom-parameters").inputValue()) === original;
  await dialog.getByRole("button", { name: "取消", exact: true }).click();
  await dialog.waitFor({ state: "hidden" });
  check(
    "admin_custom_parameters_save_readback_restore_without_provider_call",
    JSON.stringify(JSON.parse(readback)) === JSON.stringify(JSON.parse(smokeValue)) &&
      restored &&
      calls().length === callsBeforeEdit,
    {
      readback_match:
        JSON.stringify(JSON.parse(readback)) === JSON.stringify(JSON.parse(smokeValue)),
      restored,
      provider_call_delta: calls().length - callsBeforeEdit,
    },
  );

  await context.clearCookies();
  await login(page, env.BASIC_USERNAME, env.BASIC_PASSWORD);
  await page.goto(origin + "/create");
  await ready(page);
  if (!(await page.locator("details.settings").evaluate((node) => node.open)))
    await page.locator("details.settings > summary").click();
  const before = await options(page);
  await select(page, "AI 模型", "01a12f98-eac2-7448-8fa2-71224c837ffc");
  await select(page, "场景", "story");
  await select(page, "长度", "short");
  await select(page, "释义语言", "zh");
  const entries = ["machine", "preclude", "interim", "juvenile", "retroactive"];
  const search = page.locator("#create-words-search");
  for (const entry of entries) {
    await search.fill(entry);
    await page.getByRole("option", { name: entry, exact: true }).click();
  }
  const callsBeforeGeneration = calls().length;
  await page.getByRole("button", { name: "开始生成", exact: true }).click();
  await page.locator(".m003-plan-preview").waitFor({ state: "visible" });
  await page.locator(".m003-live-draft").waitFor({ state: "visible" });
  await page.locator(".m003-final-result").waitFor({ state: "visible", timeout: 60000 });
  const after = await options(page);
  const newCalls = calls().slice(callsBeforeGeneration).map((line) => JSON.parse(line));
  result.synthetic_flow = {
    entries,
    plan_seen: true,
    live_draft_seen: true,
    final_seen: true,
    call_count: newCalls.length,
    stages: newCalls.map((call) => call.stage),
    models: [...new Set(newCalls.map((call) => call.model))],
    quota_before: before.quota.remaining ?? null,
    quota_after: after.quota.remaining ?? null,
  };
  check(
    "synthetic_five_word_chinese_story_brief_complete",
    newCalls.length >= 2 &&
      newCalls.every((call) => call.model === "synthetic/pass") &&
      result.synthetic_flow.quota_after === result.synthetic_flow.quota_before - 1,
    result.synthetic_flow,
  );
  check("no_browser_page_errors", result.page_errors.length === 0, result.page_errors);
  await context.close();
} catch (error) {
  result.error = error.stack;
  result.failures.push("readiness_script_completed");
} finally {
  await browser.close();
}
result.result = result.failures.length ? "FAIL" : "PASS";
fs.writeFileSync(
  new URL("./readiness.json", import.meta.url),
  JSON.stringify(result, null, 2) + "\n",
);
console.log(JSON.stringify({ result: result.result, failures: result.failures }));
if (result.result !== "PASS") process.exitCode = 1;
