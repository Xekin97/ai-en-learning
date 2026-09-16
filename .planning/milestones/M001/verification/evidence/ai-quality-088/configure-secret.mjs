import { existsSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { request } from "../../../../../../frontend/node_modules/@playwright/test/index.mjs";

const dir = dirname(fileURLToPath(import.meta.url));
const origin = "http://localhost:6001";
const providerBase = "https://openrouter.ai/api/v1";
const providerModelID = "deepseek/deepseek-v4-flash-0731";
const adminUsername = "uat_admin";
const adminPassword = "UatAdminPass6000!";
const commonHeaders = { origin, "sec-fetch-site": "same-origin" };
const safeCredential = (value) => ({ configured: value?.configured === true, updated_at: value?.updated_at ?? null });
const safeModel = (model) => ({ id: model.id, display_name: model.display_name, description: model.description, openrouter_model_id: model.openrouter_model_id, enabled: model.enabled, assigned_group_codes: model.assigned_group_codes, created_at: model.created_at, updated_at: model.updated_at });
const safeGroup = (group) => ({ code: group.code, rolling_24h_limit: group.rolling_24h_limit, max_entries: group.max_entries, allowed_lengths: group.allowed_lengths, models: group.models.map((model) => ({ id: model.id, display_name: model.display_name, enabled: model.enabled })) });
const safeFailure = (error) => {
  const message = String(error?.message || error);
  if (/timeout|exceeded/i.test(message)) return "admin model enable client_timeout";
  if (/secret input cancelled/i.test(message)) return "secret input cancelled";
  if (/HTTP \d{3}/.test(message)) return message.match(/^[^\r\n]*/)[0];
  return "configuration helper failed; inspect controlled server evidence";
};

async function api(context, method, path, csrf, data) {
  const headers = { ...commonHeaders };
  if (csrf) headers["x-csrf-token"] = csrf;
  const response = await context.fetch(path, { method, headers, ...(data === undefined ? {} : { data }) });
  const text = await response.text();
  let body = null;
  if (text && response.headers()["content-type"]?.includes("json")) body = JSON.parse(text);
  return { status: response.status(), body, code: body?.code ?? null };
}
const requireStatus = (response, expected, action) => {
  if (response.status !== expected) throw new Error(`${action} returned HTTP ${response.status}${response.code ? ` (${response.code})` : ""}`);
  return response.body;
};
async function readSecretLine() {
  if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== "function") throw new Error("secret input requires a TTY");
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdout.write("READY_FOR_SECRET\n");
  const characters = [];
  try {
    return await new Promise((resolveSecret, rejectSecret) => {
      const onData = (chunk) => {
        for (const byte of chunk) {
          if (byte === 3) { cleanup(); rejectSecret(new Error("secret input cancelled")); return; }
          if (byte === 10 || byte === 13) { cleanup(); resolveSecret(characters.join("")); return; }
          characters.push(String.fromCharCode(byte));
          if (characters.length > 4096) { cleanup(); rejectSecret(new Error("secret input exceeds limit")); return; }
        }
      };
      const cleanup = () => { process.stdin.off("data", onData); process.stdin.setRawMode(false); process.stdin.pause(); };
      process.stdin.on("data", onData);
    });
  } finally {
    characters.fill("\0");
    if (process.stdin.isRaw) process.stdin.setRawMode(false);
  }
}

const context = await request.newContext({ baseURL: origin });
let secret = null;
let csrf = null;
let loggedIn = false;
let configuration = null;
try {
  const catalogResponse = await fetch(`${providerBase}/models`);
  if (catalogResponse.status !== 200) throw new Error(`public model catalog returned HTTP ${catalogResponse.status}`);
  const catalog = await catalogResponse.json();
  const catalogModel = catalog.data?.find((model) => model.id === providerModelID);
  if (!catalogModel) throw new Error("specified model missing from public catalog");
  const declared = Array.isArray(catalogModel.supported_parameters) ? catalogModel.supported_parameters : [];
  if (!declared.includes("structured_outputs") && !declared.includes("response_format")) throw new Error("specified model lacks declared structured output support");
  const catalogPath = join(dir, "model-catalog.json");
  if (!existsSync(catalogPath)) writeFileSync(catalogPath, JSON.stringify({ date: new Date().toISOString(), source: `${providerBase}/models`, status: 200, model: { id: catalogModel.id, supported_parameters: declared.filter((value) => ["structured_outputs", "response_format"].includes(value)) } }, null, 2), { flag: "wx" });

  const bootstrap = requireStatus(await api(context, "GET", "/api/v1/bootstrap"), 200, "bootstrap").data;
  const login = requireStatus(await api(context, "POST", "/api/v1/auth/login", bootstrap.csrf_token, { username: adminUsername, password: adminPassword, browser_ui_locale: "en-US" }), 200, "admin login").data;
  csrf = login.csrf_token;
  loggedIn = true;
  const credentialBefore = requireStatus(await api(context, "GET", "/api/v1/admin/openrouter-credential"), 200, "credential prestate").data;
  const modelsBefore = requireStatus(await api(context, "GET", "/api/v1/admin/models?limit=100"), 200, "models prestate").data.items;
  const groupsBefore = requireStatus(await api(context, "GET", "/api/v1/admin/groups"), 200, "groups prestate").data.items;
  const prestatePath = join(dir, "configuration-prestate.json");
  if (!existsSync(prestatePath)) writeFileSync(prestatePath, JSON.stringify({ date: new Date().toISOString(), agent: "qa-quinn", providerBase, credential: safeCredential(credentialBefore), models: modelsBefore.map(safeModel), groups: groupsBefore.map(safeGroup), activeGenerationCheckedByDeployment: true, secretsEmitted: false }, null, 2), { flag: "wx" });

  secret = await readSecretLine();
  if (!secret || !secret.trim()) throw new Error("empty secret refused");
  const keyResponse = await fetch(`${providerBase}/key`, { headers: { Authorization: `Bearer ${secret}` } });
  let keyNotExhausted = false;
  if (keyResponse.status === 200) {
    const keyMetadata = await keyResponse.json();
    const remaining = keyMetadata?.data?.limit_remaining;
    keyNotExhausted = remaining == null || (Number.isFinite(Number(remaining)) && Number(remaining) > 0);
  } else {
    await keyResponse.body?.cancel().catch(() => {});
  }
  if (keyResponse.status !== 200 || !keyNotExhausted) throw new Error(keyResponse.status === 200 ? "OpenRouter key is exhausted" : `OpenRouter key verification returned HTTP ${keyResponse.status}`);

  const credentialAfter = requireStatus(await api(context, "PUT", "/api/v1/admin/openrouter-credential", csrf, { api_key: secret, confirmed: true }), 200, "credential replacement").data;
  secret = null;

  let model = modelsBefore.find((item) => item.openrouter_model_id === providerModelID);
  let modelCreation = "reused";
  if (!model) {
    const created = requireStatus(await api(context, "POST", "/api/v1/admin/models", csrf, { display_name: "DeepSeek V4 Flash 0731", description: "Structured English-learning passages via OpenRouter", openrouter_model_id: providerModelID }), 201, "model creation").data.model;
    model = created;
    modelCreation = "created";
  }
  if (model.enabled) throw new Error("specified model unexpectedly enabled before the single authorized probe");
  const enabled = requireStatus(await api(context, "POST", `/api/v1/admin/models/${model.id}/enable`, csrf, {}), 200, "single model compatibility probe and enable").data.model;
  if (!enabled.enabled) throw new Error("compatibility probe did not enable model");

  const basicBefore = groupsBefore.find((group) => group.code === "basic");
  if (!basicBefore) throw new Error("basic group missing");
  const preservedBasicIDs = basicBefore.models.map((item) => item.id);
  const modelIDs = [...new Set([...preservedBasicIDs, model.id])];
  const basicAfter = requireStatus(await api(context, "PUT", "/api/v1/admin/groups/basic", csrf, { rolling_24h_limit: basicBefore.rolling_24h_limit, max_entries: basicBefore.max_entries, allowed_lengths: basicBefore.allowed_lengths, model_ids: modelIDs }), 200, "basic group update").data.group;

  const mock = modelsBefore.find((item) => item.openrouter_model_id === "provider/integration");
  let mockDisposition = "not_present";
  if (mock) {
    if (mock.enabled) {
      const disabled = requireStatus(await api(context, "POST", `/api/v1/admin/models/${mock.id}/disable`, csrf, {}), 200, "mock model disable").data.model;
      if (disabled.enabled) throw new Error("mock model remained enabled");
      mockDisposition = "disabled_not_deleted";
    } else mockDisposition = "already_disabled_not_deleted";
  }

  const modelsAfter = requireStatus(await api(context, "GET", "/api/v1/admin/models?limit=100"), 200, "models afterstate").data.items;
  const groupsAfter = requireStatus(await api(context, "GET", "/api/v1/admin/groups"), 200, "groups afterstate").data.items;
  const otherGroupsUnchanged = groupsBefore.filter((group) => group.code !== "basic").every((oldGroup) => {
    const now = groupsAfter.find((group) => group.code === oldGroup.code);
    return JSON.stringify({ ...safeGroup(oldGroup), models: oldGroup.models.map((item) => ({ id: item.id })) }) === JSON.stringify({ ...safeGroup(now), models: now.models.map((item) => ({ id: item.id })) });
  });
  const basicPolicyPreserved = basicAfter.rolling_24h_limit === basicBefore.rolling_24h_limit && basicAfter.max_entries === basicBefore.max_entries && JSON.stringify(basicAfter.allowed_lengths) === JSON.stringify(basicBefore.allowed_lengths) && preservedBasicIDs.every((id) => basicAfter.models.some((item) => item.id === id));
  if (!otherGroupsUnchanged || !basicPolicyPreserved || !basicAfter.models.some((item) => item.id === model.id)) throw new Error("group preservation assertion failed");
  configuration = {
    date: new Date().toISOString(), agent: "qa-quinn", result: "PASS", providerBase, realModelID: providerModelID,
    keyVerification: { endpoint: `${providerBase}/key`, authenticated: true, notExhausted: true, privateMetadataEmitted: false },
    credentialBefore: safeCredential(credentialBefore), credentialAfter: safeCredential(credentialAfter),
    model: { operation: modelCreation, id: model.id, enabledAfterSingleCompatibilityProbe: true, compatibilityProbeCalls: 1 },
    basicGroup: { priorModelIDsPreserved: true, newModelAdded: true, quotaPreserved: true, maxEntriesPreserved: true, lengthsPreserved: true },
    otherGroupsUnchanged: true, mockModel: { providerModelID: "provider/integration", disposition: mockDisposition },
    modelsAfter: modelsAfter.map(safeModel), groupsAfter: groupsAfter.map(safeGroup),
    secretsEmitted: false, providerUsageObserved: false,
  };
  writeFileSync(join(dir, "configuration.json"), JSON.stringify(configuration, null, 2), { flag: "wx" });
  process.stdout.write(`${JSON.stringify({ result: "PASS", realModelID: providerModelID, compatibilityProbeCalls: 1, keyAuthenticated: true, basicGroupConfigured: true, mockDisposition })}\n`);
} catch (error) {
  secret = null;
  const failurePath = join(dir, "configuration-failure.json");
  if (!existsSync(failurePath)) writeFileSync(failurePath, JSON.stringify({ date: new Date().toISOString(), agent: "qa-quinn", result: "FAIL", safeError: safeFailure(error), secretEmitted: false, configurationCompleted: Boolean(configuration) }, null, 2), { flag: "wx" });
  console.error(safeFailure(error));
  process.exitCode = 1;
} finally {
  secret = null;
  if (loggedIn && csrf) await api(context, "POST", "/api/v1/auth/logout", csrf, {}).catch(() => null);
  await context.dispose();
}
