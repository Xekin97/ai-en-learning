import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { request } from "../../../../../../frontend/node_modules/@playwright/test/index.mjs";

const dir = dirname(fileURLToPath(import.meta.url));
const origin = "http://localhost:6001";
const providerModelID = "deepseek/deepseek-v4-flash-0731";
const headers = { origin, "sec-fetch-site": "same-origin" };
const safeModel = (model) => ({ id: model.id, display_name: model.display_name, openrouter_model_id: model.openrouter_model_id, enabled: model.enabled, assigned_group_codes: model.assigned_group_codes });
const safeGroup = (group) => ({ code: group.code, rolling_24h_limit: group.rolling_24h_limit, max_entries: group.max_entries, allowed_lengths: group.allowed_lengths, model_ids: group.models.map((model) => model.id) });
const safeFailure = (error) => {
  const message = String(error?.message || error);
  if (/timeout|exceeded/i.test(message)) return "recovery enable client_timeout_300000";
  if (/HTTP \d{3}/.test(message)) return message.match(/^[^\r\n]*/)[0];
  return "recovery configuration failed; inspect controlled server evidence";
};
async function api(context, method, path, csrf, data, timeout = 300000) {
  const requestHeaders = { ...headers };
  if (csrf) requestHeaders["x-csrf-token"] = csrf;
  const response = await context.fetch(path, { method, headers: requestHeaders, timeout, ...(data === undefined ? {} : { data }) });
  const text = await response.text();
  const body = text && response.headers()["content-type"]?.includes("json") ? JSON.parse(text) : null;
  return { status: response.status(), body, code: body?.code ?? null };
}
const requireStatus = (response, expected, action) => {
  if (response.status !== expected) throw new Error(`${action} returned HTTP ${response.status}${response.code ? ` (${response.code})` : ""}`);
  return response.body;
};

const context = await request.newContext({ baseURL: origin, timeout: 300000 });
let csrf = null;
try {
  const bootstrap = requireStatus(await api(context, "GET", "/api/v1/bootstrap", null, undefined, 15000), 200, "bootstrap").data;
  const login = requireStatus(await api(context, "POST", "/api/v1/auth/login", bootstrap.csrf_token, { username: "uat_admin", password: "UatAdminPass6000!", browser_ui_locale: "en-US" }, 15000), 200, "admin login").data;
  csrf = login.csrf_token;
  const modelsBefore = requireStatus(await api(context, "GET", "/api/v1/admin/models?limit=100", null, undefined, 15000), 200, "models prestate").data.items;
  const groupsBefore = requireStatus(await api(context, "GET", "/api/v1/admin/groups", null, undefined, 15000), 200, "groups prestate").data.items;
  const model = modelsBefore.find((item) => item.openrouter_model_id === providerModelID);
  if (!model) throw new Error("specified model missing before recovery");
  if (model.enabled) throw new Error("specified model already enabled; recovery probe refused");

  const startedAt = new Date().toISOString();
  const enabledResponse = await api(context, "POST", `/api/v1/admin/models/${model.id}/enable`, csrf, {}, 300000);
  const completedAt = new Date().toISOString();
  const enabled = requireStatus(enabledResponse, 200, "single recovery compatibility probe").data.model;
  if (!enabled.enabled) throw new Error("recovery compatibility probe returned disabled model");

  const basicBefore = groupsBefore.find((group) => group.code === "basic");
  if (!basicBefore) throw new Error("basic group missing");
  const preservedIDs = basicBefore.models.map((item) => item.id);
  const basicAfter = requireStatus(await api(context, "PUT", "/api/v1/admin/groups/basic", csrf, { rolling_24h_limit: basicBefore.rolling_24h_limit, max_entries: basicBefore.max_entries, allowed_lengths: basicBefore.allowed_lengths, model_ids: [...new Set([...preservedIDs, model.id])] }, 15000), 200, "basic group update").data.group;
  const mock = modelsBefore.find((item) => item.openrouter_model_id === "provider/integration");
  let mockDisposition = "not_present";
  if (mock?.enabled) {
    const disabled = requireStatus(await api(context, "POST", `/api/v1/admin/models/${mock.id}/disable`, csrf, {}, 15000), 200, "mock model disable").data.model;
    if (disabled.enabled) throw new Error("mock model remained enabled");
    mockDisposition = "disabled_not_deleted";
  } else if (mock) mockDisposition = "already_disabled_not_deleted";

  const modelsAfter = requireStatus(await api(context, "GET", "/api/v1/admin/models?limit=100", null, undefined, 15000), 200, "models afterstate").data.items;
  const groupsAfter = requireStatus(await api(context, "GET", "/api/v1/admin/groups", null, undefined, 15000), 200, "groups afterstate").data.items;
  const basicPolicyPreserved = basicAfter.rolling_24h_limit === basicBefore.rolling_24h_limit && basicAfter.max_entries === basicBefore.max_entries && JSON.stringify(basicAfter.allowed_lengths) === JSON.stringify(basicBefore.allowed_lengths) && preservedIDs.every((id) => basicAfter.models.some((item) => item.id === id)) && basicAfter.models.some((item) => item.id === model.id);
  const otherGroupsPreserved = groupsBefore.filter((group) => group.code !== "basic").every((beforeGroup) => {
    const afterGroup = groupsAfter.find((group) => group.code === beforeGroup.code);
    return JSON.stringify(safeGroup(beforeGroup)) === JSON.stringify(safeGroup(afterGroup));
  });
  if (!basicPolicyPreserved || !otherGroupsPreserved) throw new Error("group preservation assertion failed");
  const result = {
    date: completedAt, agent: "qa-quinn", result: "PASS", providerModelID,
    recoveryProbe: { startedAt, completedAt, timeoutMs: 300000, attempts: 1, previousCancelledAttempts: 1, totalInferenceAttemptsSoFar: 2, status: 200, enabled: true },
    basicGroup: { modelAdded: true, priorModelIDsPreserved: true, quotaPreserved: true, maxEntriesPreserved: true, lengthsPreserved: true },
    otherGroupsPreserved: true, mockModel: { providerModelID: "provider/integration", disposition: mockDisposition },
    modelsAfter: modelsAfter.map(safeModel), groupsAfter: groupsAfter.map(safeGroup), automaticRetries: 0, secretsEmitted: false,
  };
  writeFileSync(join(dir, "configuration-recovery.json"), JSON.stringify(result, null, 2), { flag: "wx" });
  writeFileSync(join(dir, "configuration.json"), JSON.stringify({ date: completedAt, agent: "qa-quinn", result: "PASS_AFTER_AUTHORIZED_TIMEOUT_RECOVERY", providerBase: "https://openrouter.ai/api/v1", realModelID: providerModelID, credentialConfigured: true, credentialPlaintextObservedByQaAgent: false, initialProbe: { status: "client_cancelled_at_30000ms", modelEnabled: false }, recoveryProbe: result.recoveryProbe, basicGroup: result.basicGroup, otherGroupsPreserved: true, mockModel: result.mockModel, modelsAfter: result.modelsAfter, groupsAfter: result.groupsAfter, secretsEmitted: false }, null, 2), { flag: "wx" });
  console.log(JSON.stringify({ result: result.result, modelEnabled: true, recoveryProbeAttempts: 1, totalInferenceAttemptsSoFar: 2, basicConfigured: true, mockDisposition }));
} catch (error) {
  const controlled = safeFailure(error);
  writeFileSync(join(dir, "configuration-recovery-failure.json"), JSON.stringify({ date: new Date().toISOString(), agent: "qa-quinn", result: "FAIL", controlledError: controlled, timeoutMs: 300000, automaticRetries: 0, secretOrRequestHeadersRecorded: false }, null, 2), { flag: "wx" });
  console.error(controlled);
  process.exitCode = 1;
} finally {
  if (csrf) await api(context, "POST", "/api/v1/auth/logout", csrf, {}, 15000).catch(() => null);
  await context.dispose();
}
