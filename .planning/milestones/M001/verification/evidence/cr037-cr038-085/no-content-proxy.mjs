import { request, origin, password, adminUsername, adminPassword, bootstrap, api, register, login, sql, recorder } from "./lib.mjs";

const out = recorder("no-content-proxy");
const contexts = [];
const context = async () => { const value = await request.newContext(); contexts.push(value); return { request: value }; };
const safeResponses = [];
function recordResponse(id, response) {
  safeResponses.push({ id, status: response.status, bodyBytes: response.raw.length, contentType: response.headers["content-type"] ?? null, cacheControl: response.headers["cache-control"] ?? null, problemCode: response.status >= 400 ? response.body?.code ?? null : null });
}
function noContent(id, response) {
  out.record(`${id} status`, response.status, 204);
  out.record(`${id} body bytes`, response.raw.length, 0);
  out.record(`${id} content-type absent`, response.headers["content-type"] ?? null, null);
  out.record(`${id} cache-control`, response.headers["cache-control"], "no-store");
  recordResponse(id, response);
}
async function currentCSRF(client) { return (await bootstrap(client)).csrf_token; }
async function rawCall(id, client, method, path, csrf, data, expected, headers = {}) {
  const response = await api(client, method, path, csrf, data, headers);
  out.record(`${id} status`, response.status, expected);
  out.record(`${id} cache-control`, response.headers["cache-control"], "no-store");
  recordResponse(id, response);
  return response;
}

const admin = await context();
const learner = await context();
const other = await context();
const logoutUser = await context();
const deleteUser = await context();
const visitor = await context();
try {
  out.record("admin login", (await login(admin, adminUsername, adminPassword)).status, 200);
  let adminCSRF = await currentCSRF(admin);
  const credential = await rawCall("synthetic credential configure", admin, "PUT", "/api/v1/admin/openrouter-credential", adminCSRF, { api_key: "qa085-synthetic-provider-key", confirmed: true }, 200);
  out.record("credential response does not echo key", JSON.stringify(credential.body).includes("qa085-synthetic-provider-key"), false);
  const model = await rawCall("synthetic model create", admin, "POST", "/api/v1/admin/models", adminCSRF, { display_name: "QA085 synthetic model", description: null, openrouter_model_id: "provider/qa085" }, 201);
  const modelID = model.body.data.model.id;
  await rawCall("synthetic model enable", admin, "POST", `/api/v1/admin/models/${modelID}/enable`, adminCSRF, {}, 200);
  await rawCall("basic group synthetic model", admin, "PUT", "/api/v1/admin/groups/basic", adminCSRF, { rolling_24h_limit: null, max_entries: 5, allowed_lengths: ["short"], model_ids: [modelID] }, 200);

  out.record("learner register", (await register(learner, "qa085_nocontent", "en-US")).status, 201);
  out.record("other learner session", (await login(other, "qa085_nocontent", password)).status, 200);
  let learnerCSRF = await currentCSRF(learner);

  await rawCall("401 unauthenticated password", visitor, "PUT", "/api/v1/me/password", await currentCSRF(visitor), { current_password: password, new_password: "Qa085NegativeOnly!", new_password_confirmation: "Qa085NegativeOnly!" }, 401);
  await rawCall("403 missing csrf logout", learner, "POST", "/api/v1/auth/logout", undefined, {}, 403);
  await rawCall("400 malformed logout", learner, "POST", "/api/v1/auth/logout", learnerCSRF, { unexpected: true }, 400);
  const invalid = await rawCall("422 wrong current password", learner, "PUT", "/api/v1/me/password", learnerCSRF, { current_password: "Qa085WrongCurrent!", new_password: "Qa085NegativeOnly!", new_password_confirmation: "Qa085NegativeOnly!" }, 422);
  out.record("422 safe normalized code", invalid.body?.code, "validation_failed");
  out.record("422 does not echo credentials", JSON.stringify(invalid.body).includes("Qa085WrongCurrent!") || JSON.stringify(invalid.body).includes(password), false);
  out.record("negative requests preserve second session", (await api(other, "GET", "/api/v1/me/account")).status, 200);

  out.record("logout user register", (await register(logoutUser, "qa085_logout", "en-US")).status, 201);
  const logoutResponse = await api(logoutUser, "POST", "/api/v1/auth/logout", await currentCSRF(logoutUser), {});
  noContent("consumer logout", logoutResponse);
  out.record("logout invalidates current session", (await api(logoutUser, "GET", "/api/v1/me/account")).status, 401);

  const changed = "Qa085NoContentChanged!";
  const passwordResponse = await api(learner, "PUT", "/api/v1/me/password", learnerCSRF, { current_password: password, new_password: changed, new_password_confirmation: changed });
  noContent("consumer self password", passwordResponse);
  out.record("self password current session retained", (await api(learner, "GET", "/api/v1/me/account")).status, 200);
  out.record("self password other session revoked", (await api(other, "GET", "/api/v1/me/account")).status, 401);
  learnerCSRF = await currentCSRF(learner);

  async function generate() {
    const response = await api(learner, "POST", "/api/v1/generations/stream", learnerCSRF, { model_id: modelID, meaning_language: "en", scenario: "discussion", length: "short", entries: ["learn"] });
    out.record("generation fixture HTTP", response.status, 200);
    out.record("generation fixture no-store", response.headers["cache-control"], "no-store");
    const text = response.raw.toString("utf8");
    const started = text.match(/event: generation\.started\ndata: (\{[^\n]+\})/);
    out.record("generation validated event", text.includes("event: generation.validated"), true);
    if (!started) throw new Error("missing generation.started fixture event");
    const data = JSON.parse(started[1]);
    return { runID: data.run_id, token: data.generation_token };
  }

  let generated = await generate();
  noContent("consumer generation discard", await api(learner, "POST", `/api/v1/generations/${generated.runID}/discard`, learnerCSRF, {}, { "x-generation-token": generated.token }));

  generated = await generate();
  const saved = await rawCall("save synthetic batch", learner, "POST", `/api/v1/generations/${generated.runID}/save`, learnerCSRF, {}, 201, { "x-generation-token": generated.token });
  const batchID = saved.body.data.batch_id;
  const review = await rawCall("create synthetic review session", learner, "POST", "/api/v1/me/review-sessions", learnerCSRF, { mode: "single_batch", batch_id: batchID }, 201);
  const sessionID = review.body.data.session_id;
  noContent("consumer batch deletion", await api(learner, "DELETE", `/api/v1/me/batches/${batchID}`, learnerCSRF));
  out.record("batch delete cascades review session", Number(sql(`SELECT count(*) FROM wordweave.review_sessions WHERE id='${sessionID}'`)), 0);
  out.record("deleted batch cannot be read", (await api(learner, "GET", `/api/v1/me/batches/${batchID}`)).status, 404);

  const learnerID = sql("SELECT id FROM wordweave.accounts WHERE lower(username)='qa085_nocontent'");
  const reset = "Qa085AdminResetOnly!";
  adminCSRF = await currentCSRF(admin);
  noContent("consumer admin password reset", await api(admin, "PUT", `/api/v1/admin/users/${learnerID}/password`, adminCSRF, { new_password: reset, new_password_confirmation: reset, confirmed: true }));
  out.record("admin reset invalidates learner current", (await api(learner, "GET", "/api/v1/me/account")).status, 401);
  const resetProbe = await context();
  out.record("admin reset new password accepted", (await login(resetProbe, "qa085_nocontent", reset)).status, 200);

  out.record("delete user register", (await register(deleteUser, "qa085_delete", "en-US")).status, 201);
  noContent("consumer account deletion", await api(deleteUser, "DELETE", "/api/v1/me/account", await currentCSRF(deleteUser), { current_password: password, confirmed: true }));
  out.record("deleted account absent", Number(sql("SELECT count(*) FROM wordweave.accounts WHERE lower(username)='qa085_delete'")), 0);
  const deleteProbe = await context();
  out.record("deleted account cannot login", (await login(deleteProbe, "qa085_delete", password)).status, 401);
} catch (error) {
  out.error("proxy no-content execution", error);
} finally {
  for (const item of contexts) await item.dispose().catch(() => {});
}
out.save({ origin, topology: "fixed candidate backend through real QA085 Nginx", successfulConsumers: 6, safeResponses });
