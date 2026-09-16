import { request } from "../../../../../frontend/node_modules/@playwright/test/index.mjs";

const baseURL = process.env.WORDWEAVE_BASE_URL ?? "http://localhost:6001";
const adminUsername = process.env.WORDWEAVE_UAT_ADMIN_USERNAME ?? "uat_admin";
const adminPassword = process.env.WORDWEAVE_UAT_ADMIN_PASSWORD ?? "UatAdminPass6000!";
const learnerUsername = process.env.WORDWEAVE_UAT_LEARNER_USERNAME ?? "uat_learner";
const learnerPassword = process.env.WORDWEAVE_UAT_LEARNER_PASSWORD ?? "UatLearnerPass6000!";
const headers = { origin: baseURL, "sec-fetch-site": "same-origin" };

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function api(context, method, path, csrfToken, data) {
  const options = { method, headers: { ...headers } };
  if (csrfToken) options.headers["x-csrf-token"] = csrfToken;
  if (data !== undefined) options.data = data;
  const response = await context.fetch(path, options);
  const raw = await response.text();
  const body = raw && response.headers()["content-type"]?.includes("json") ? JSON.parse(raw) : null;
  return { status: response.status(), raw, body };
}

async function bootstrap(context) {
  const response = await api(context, "GET", "/api/v1/bootstrap");
  assert(response.status === 200, `bootstrap ${response.status}: ${response.raw}`);
  return response.body.data;
}

const adminContext = await request.newContext({ baseURL });
const learnerContext = await request.newContext({ baseURL });

try {
  const adminBootstrap = await bootstrap(adminContext);
  const loggedIn = await api(adminContext, "POST", "/api/v1/auth/login", adminBootstrap.csrf_token, {
    username: adminUsername,
    password: adminPassword,
    browser_ui_locale: "zh-CN",
  });
  assert(loggedIn.status === 200, `admin login ${loggedIn.status}: ${loggedIn.raw}`);
  const adminCSRF = loggedIn.body.data.csrf_token;

  const credential = await api(adminContext, "PUT", "/api/v1/admin/openrouter-credential", adminCSRF, {
    api_key: "integration-secret-key",
    confirmed: true,
  });
  assert(credential.status === 200, `credential ${credential.status}: ${credential.raw}`);

  const created = await api(adminContext, "POST", "/api/v1/admin/models", adminCSRF, {
    display_name: "UAT deterministic model",
    description: "Local functional UAT provider",
    openrouter_model_id: "provider/integration",
  });
  let modelId = created.body?.data?.model?.id;
  if (created.status === 409) {
    const models = await api(adminContext, "GET", "/api/v1/admin/models?limit=100");
    assert(models.status === 200, `models ${models.status}: ${models.raw}`);
    modelId = models.body.data.items.find((model) => model.openrouter_model_id === "provider/integration")?.id;
    assert(modelId, "existing UAT model ID missing");
    const updated = await api(adminContext, "PATCH", `/api/v1/admin/models/${modelId}`, adminCSRF, {
      display_name: "UAT deterministic model",
      description: "Local functional UAT provider",
    });
    assert(updated.status === 200, `model update ${updated.status}: ${updated.raw}`);
  } else {
    assert(created.status === 201, `model create ${created.status}: ${created.raw}`);
  }
  assert(modelId, "UAT model ID missing");

  const enabled = await api(adminContext, "POST", `/api/v1/admin/models/${modelId}/enable`, adminCSRF, {});
  assert(enabled.status === 200, `model enable ${enabled.status}: ${enabled.raw}`);

  for (const [code, limit, lengths] of [
    ["visitor", 5, ["short"]],
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
    assert(group.status === 200, `group ${code} ${group.status}: ${group.raw}`);
  }

  const learnerBootstrap = await bootstrap(learnerContext);
  const registered = await api(learnerContext, "POST", "/api/v1/auth/register", learnerBootstrap.csrf_token, {
    username: learnerUsername,
    password: learnerPassword,
    password_confirmation: learnerPassword,
    ui_locale: "zh-CN",
  });
  if (registered.status === 409) {
    const reloginBootstrap = await bootstrap(learnerContext);
    const relogin = await api(learnerContext, "POST", "/api/v1/auth/login", reloginBootstrap.csrf_token, {
      username: learnerUsername,
      password: learnerPassword,
      browser_ui_locale: "zh-CN",
    });
    assert(relogin.status === 200, `existing learner login ${relogin.status}: ${relogin.raw}`);
  } else {
    assert(registered.status === 201, `learner register ${registered.status}: ${registered.raw}`);
  }

  const learnerOptions = await api(learnerContext, "GET", "/api/v1/generation-options");
  assert(learnerOptions.status === 200, `learner options ${learnerOptions.status}: ${learnerOptions.raw}`);
  assert(
    learnerOptions.body.data.models.some((model) => model.id === modelId),
    "UAT model is not available to the learner group",
  );

  process.stdout.write(`${JSON.stringify({
    baseURL,
    provider: "deterministic local OpenRouter protocol service",
    modelId,
    adminUsername,
    learnerUsername,
    learnerModelAvailable: true,
    status: "ready",
  }, null, 2)}\n`);
} finally {
  await adminContext.dispose();
  await learnerContext.dispose();
}
