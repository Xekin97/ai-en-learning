import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { request } from "../../../../../../frontend/node_modules/@playwright/test/index.mjs";

const dir = dirname(fileURLToPath(import.meta.url));
const root = resolve(dir, "../../../../../..");
const origin = "http://localhost:6001";
const qualityUsername = "uat_ai_quality_090";
const modelID = "01a07ab4-dfe9-7fd6-8022-285d685763d0";
const providerModelID = "openai/gpt-oss-safeguard-20b";
const plans = [
  { id: "AQ090-S1", meaning_language: "zh", scenario: "discussion", length: "medium", entries: ["alleviate", "undermine", "facilitate", "deteriorate", "perceive"] },
  { id: "AQ090-S2", meaning_language: "en", scenario: "news", length: "long", entries: ["sustainable", "prevalent", "vulnerable", "ambiguous", "coherent"] },
];
const docker = (args) => execFileSync("docker", args, { cwd: root, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 }).trim();
const sql = (query) => docker(["exec", "wordweave_uat-postgres-1", "psql", "-U", "postgres", "-d", "wordweave", "-X", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-c", query]);
const digestQuery = (query) => sql(`SELECT md5(COALESCE(string_agg(md5(row_to_json(t)::text),'' ORDER BY md5(row_to_json(t)::text)),'')) FROM (${query}) t`);
const preservedSnapshot = () => ({
  accounts: digestQuery(`SELECT id,username,password_hash,role,group_code,status,ui_locale,quota_reset_at,created_at,updated_at FROM wordweave.accounts WHERE username <> '${qualityUsername}'`),
  sessions: digestQuery(`SELECT s.* FROM wordweave.account_sessions s JOIN wordweave.accounts a ON a.id=s.account_id WHERE a.username <> '${qualityUsername}'`),
  batches: digestQuery(`SELECT b.* FROM wordweave.learning_batches b JOIN wordweave.accounts a ON a.id=b.owner_id WHERE a.username <> '${qualityUsername}'`),
  targets: digestQuery(`SELECT t.* FROM wordweave.batch_targets t JOIN wordweave.accounts a ON a.id=t.owner_id WHERE a.username <> '${qualityUsername}'`),
  hints: digestQuery(`SELECT h.* FROM wordweave.hint_occurrences h JOIN wordweave.accounts a ON a.id=h.owner_id WHERE a.username <> '${qualityUsername}'`),
  passages: digestQuery(`SELECT p.* FROM wordweave.passage_occurrences p JOIN wordweave.accounts a ON a.id=p.owner_id WHERE a.username <> '${qualityUsername}'`),
  runs: digestQuery(`SELECT r.* FROM wordweave.generation_runs r LEFT JOIN wordweave.accounts a ON a.id=r.account_id WHERE a.username IS DISTINCT FROM '${qualityUsername}'`),
  models: digestQuery("SELECT * FROM wordweave.ai_models"),
  groups: digestQuery("SELECT * FROM wordweave.entitlement_groups"),
  groupModels: digestQuery("SELECT * FROM wordweave.group_models"),
  groupLengths: digestQuery("SELECT * FROM wordweave.group_lengths"),
  credentials: digestQuery("SELECT * FROM wordweave.openrouter_credentials"),
  migrations: digestQuery("SELECT * FROM wordweave.schema_migrations"),
});
const counts = () => JSON.parse(sql(`SELECT json_build_object('accounts',(SELECT count(*) FROM wordweave.accounts),'sessions',(SELECT count(*) FROM wordweave.account_sessions),'batches',(SELECT count(*) FROM wordweave.learning_batches),'runs',(SELECT count(*) FROM wordweave.generation_runs),'active_runs',(SELECT count(*) FROM wordweave.generation_runs WHERE call_status='active'),'quality_accounts',(SELECT count(*) FROM wordweave.accounts WHERE username='${qualityUsername}'),'quality_sessions',(SELECT count(*) FROM wordweave.account_sessions s JOIN wordweave.accounts a ON a.id=s.account_id WHERE a.username='${qualityUsername}'),'quality_batches',(SELECT count(*) FROM wordweave.learning_batches b JOIN wordweave.accounts a ON a.id=b.owner_id WHERE a.username='${qualityUsername}'),'quality_runs',(SELECT count(*) FROM wordweave.generation_runs r JOIN wordweave.accounts a ON a.id=r.account_id WHERE a.username='${qualityUsername}'));`));
const headers = { origin, "sec-fetch-site": "same-origin" };
async function api(context, method, path, csrf, data, extra = {}, timeout = 300000) {
  const requestHeaders = { ...headers, ...extra };
  if (csrf) requestHeaders["x-csrf-token"] = csrf;
  const response = await context.fetch(path, { method, headers: requestHeaders, timeout, ...(data === undefined ? {} : { data }) });
  const text = await response.text();
  const body = text && response.headers()["content-type"]?.includes("json") ? JSON.parse(text) : null;
  return { status: response.status(), headers: response.headers(), text, body };
}
const requireStatus = (response, expected, action) => {
  if (response.status !== expected) throw new Error(`${action} returned HTTP ${response.status}${response.body?.code ? ` (${response.body.code})` : ""}`);
  return response.body;
};
function parseSSE(text) {
  const events = [];
  for (const block of text.split(/\r?\n\r?\n/)) {
    let event = "message"; const data = [];
    for (const line of block.split(/\r?\n/)) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
    }
    if (!data.length) continue;
    try { events.push({ event, data: JSON.parse(data.join("\n")) }); }
    catch { events.push({ event, data: { malformed: true } }); }
  }
  return events;
}
const wordCount = (text) => text.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu)?.length ?? 0;
const safeFailure = (error) => {
  const message = String(error?.message || error);
  if (/timeout|exceeded/i.test(message)) return "quality request client_timeout_300000";
  if (/HTTP \d{3}/.test(message)) return message.match(/^[^\r\n]*/)[0];
  return "quality execution failed; inspect controlled evidence";
};
const safeModel = (model) => ({ id: model.id, display_name: model.display_name, openrouter_model_id: model.openrouter_model_id, enabled: model.enabled, assigned_group_codes: model.assigned_group_codes });
const safeGroup = (group) => ({ code: group.code, rolling_24h_limit: group.rolling_24h_limit, max_entries: group.max_entries, allowed_lengths: group.allowed_lengths, model_ids: group.models.map((model) => model.id) });

const before = counts();
const preservedBefore = preservedSnapshot();
if (before.active_runs !== 0 || before.quality_accounts !== 0) throw new Error("090 baseline mismatch");
const admin = await request.newContext({ baseURL: origin, timeout: 300000 });
const learner = await request.newContext({ baseURL: origin, timeout: 300000 });
let adminCSRF = null; let learnerCSRF = null; let learnerLoggedIn = false;
let localPassword = `Aq090!${randomBytes(24).toString("base64url")}`;
const samples = []; let attempted = 0; let stopReason = null; let apiPreflight = null;
try {
  const adminBoot = requireStatus(await api(admin, "GET", "/api/v1/bootstrap", null, undefined, {}, 15000), 200, "admin bootstrap").data;
  adminCSRF = requireStatus(await api(admin, "POST", "/api/v1/auth/login", adminBoot.csrf_token, { username: "uat_admin", password: "UatAdminPass6000!", browser_ui_locale: "en-US" }, {}, 15000), 200, "admin login").data.csrf_token;
  const models = requireStatus(await api(admin, "GET", "/api/v1/admin/models?limit=100", null, undefined, {}, 15000), 200, "admin models").data.items;
  const groups = requireStatus(await api(admin, "GET", "/api/v1/admin/groups", null, undefined, {}, 15000), 200, "admin groups").data.items;
  const exactModel = models.find((model) => model.id === modelID);
  const basic = groups.find((group) => group.code === "basic");
  if (!exactModel || exactModel.openrouter_model_id !== providerModelID || !exactModel.enabled || !basic?.models.some((model) => model.id === modelID)) throw new Error("exact model is not enabled for basic via product API");
  apiPreflight = { exactModel: safeModel(exactModel), basicGroup: safeGroup(basic) };
  await api(admin, "POST", "/api/v1/auth/logout", adminCSRF, {}, {}, 15000); adminCSRF = null;

  const boot = requireStatus(await api(learner, "GET", "/api/v1/bootstrap", null, undefined, {}, 15000), 200, "learner bootstrap").data;
  const registered = requireStatus(await api(learner, "POST", "/api/v1/auth/register", boot.csrf_token, { username: qualityUsername, password: localPassword, password_confirmation: localPassword, ui_locale: "en-US" }, {}, 15000), 201, "quality account registration").data;
  learnerCSRF = registered.csrf_token; learnerLoggedIn = true; localPassword = null;
  const options = requireStatus(await api(learner, "GET", "/api/v1/generation-options", null, undefined, {}, 15000), 200, "generation options").data;
  if (!options.models.some((model) => model.id === modelID) || options.max_entries !== 5 || !plans.every((plan) => options.lengths.includes(plan.length))) throw new Error("basic generation options do not expose approved plan");
  const vocabulary = {};
  for (const entry of [...new Set(plans.flatMap((plan) => plan.entries))]) {
    const search = requireStatus(await api(learner, "GET", `/api/v1/vocabulary/search?q=${encodeURIComponent(entry)}&limit=20`, null, undefined, {}, 15000), 200, `vocabulary ${entry}`).data;
    vocabulary[entry] = search.items.some((item) => item.entry.toLowerCase() === entry);
    if (!vocabulary[entry]) throw new Error(`frozen entry unavailable: ${entry}`);
  }
  writeFileSync(join(dir, "preflight.json"), JSON.stringify({ date: new Date().toISOString(), agent: "qa-quinn", decision: "TRANSITION-M001-090", api: apiPreflight, generationOptions: { exactModelExposed: true, maxEntries: options.max_entries, allowedLengths: options.lengths }, vocabulary, beforeCounts: before, inferenceCap: 2, automaticRetries: 0, secretsEmitted: false }, null, 2), { flag: "wx" });

  for (const plan of plans) {
    attempted += 1;
    const startedAt = new Date().toISOString();
    let record;
    try {
      const response = await api(learner, "POST", "/api/v1/generations/stream", learnerCSRF, { model_id: modelID, meaning_language: plan.meaning_language, scenario: plan.scenario, length: plan.length, entries: plan.entries }, {}, 300000);
      if (response.status !== 200) {
        record = { plan, started_at: startedAt, completed_at: new Date().toISOString(), terminal: "pre_stream_failure", http_status: response.status, code: response.body?.code ?? null, saved: false };
        stopReason = record.code ?? "pre_stream_failure";
      } else {
        const events = parseSSE(response.text);
        const started = events.find((item) => item.event === "generation.started")?.data;
        const validated = events.find((item) => item.event === "generation.validated")?.data;
        const failed = events.find((item) => item.event === "generation.failed")?.data;
        const cancelled = events.find((item) => item.event === "generation.cancelled")?.data;
        const partial = events.filter((item) => item.event === "passage.delta").map((item) => item.data?.text ?? "").join("");
        if (!started?.run_id || !started?.generation_token) throw new Error(`${plan.id} missing generation.started`);
        if (!validated?.result) {
          record = { plan, started_at: startedAt, completed_at: new Date().toISOString(), terminal: failed ? "generation.failed" : cancelled ? "generation.cancelled" : "missing_terminal", http_status: response.status, run_id: started.run_id, failure: failed ? { code: failed.code, quota_refunded: failed.quota_refunded, retryable: failed.retryable } : cancelled ?? null, partial_passage: partial, saved: false };
          if (!failed || failed.code !== "content_validation_failed") stopReason = failed?.code ?? (cancelled ? "cancelled" : "missing_terminal");
        } else {
          const result = validated.result;
          const saveResponse = await api(learner, "POST", `/api/v1/generations/${encodeURIComponent(started.run_id)}/save`, learnerCSRF, {}, { "x-generation-token": started.generation_token }, 15000);
          if (saveResponse.status !== 201) throw new Error(`${plan.id} save returned HTTP ${saveResponse.status}`);
          const batchID = saveResponse.body.data.batch_id;
          const detail = requireStatus(await api(learner, "GET", `/api/v1/me/batches/${encodeURIComponent(batchID)}`, null, undefined, {}, 15000), 200, `${plan.id} detail`).data.batch;
          const contentMatchesSaved = detail.passage === result.passage && JSON.stringify(detail.tags) === JSON.stringify(result.tags) && JSON.stringify(detail.targets) === JSON.stringify(result.targets);
          if (!contentMatchesSaved) throw new Error(`${plan.id} saved content mismatch`);
          record = { plan, started_at: startedAt, completed_at: new Date().toISOString(), terminal: "generation.validated", http_status: response.status, content_type: response.headers["content-type"], cache_control: response.headers["cache-control"], run_id: started.run_id, prompt_version: "m001-v2", validator_version: "m001-v2", passage_delta_count: events.filter((item) => item.event === "passage.delta").length, streamed_passage_matches_final: partial === result.passage, result: { passage: result.passage, computed_word_count: wordCount(result.passage), tags: result.tags, targets: result.targets }, saved: true, saved_batch: { batch_id: detail.id, saved_at: detail.saved_at, configuration: detail.configuration, participates_in_range_review: detail.participates_in_range_review, passage: detail.passage, tags: detail.tags, targets: detail.targets }, content_matches_saved: true };
        }
      }
    } catch (error) {
      record = { plan, started_at: startedAt, completed_at: new Date().toISOString(), terminal: "client_error", controlled_error: safeFailure(error), saved: false };
      stopReason = record.controlled_error;
    }
    samples.push(record);
    writeFileSync(join(dir, `quality-${plan.id}.json`), JSON.stringify({ date: new Date().toISOString(), agent: "qa-quinn", configuredModel: { id: modelID, provider_model_id: providerModelID }, inferenceAttemptOrdinal: attempted, sample: record, secretsEmitted: false, cookiesCsrfGenerationTokensEmitted: false }, null, 2), { flag: "wx" });
    console.log(JSON.stringify({ sample: plan.id, terminal: record.terminal, saved: record.saved, elapsedSeconds: (Date.parse(record.completed_at) - Date.parse(record.started_at)) / 1000 }));
    if (stopReason) break;
  }
} catch (error) {
  stopReason = safeFailure(error);
} finally {
  localPassword = null;
  if (learnerLoggedIn && learnerCSRF) await api(learner, "POST", "/api/v1/auth/logout", learnerCSRF, {}, {}, 15000).catch(() => null);
  if (adminCSRF) await api(admin, "POST", "/api/v1/auth/logout", adminCSRF, {}, {}, 15000).catch(() => null);
  await learner.dispose(); await admin.dispose();
  const after = counts(); const preservedAfter = preservedSnapshot();
  const preserved = Object.fromEntries(Object.keys(preservedBefore).map((key) => [key, preservedBefore[key] === preservedAfter[key]]));
  const terminals = JSON.parse(sql(`SELECT COALESCE(json_agg(x ORDER BY x.started_at),'[]'::json) FROM (SELECT r.provider_model_id_snapshot,r.meaning_language,r.scenario,r.length_code,r.minimum_words_snapshot,r.max_entries_snapshot,r.call_status,r.disposition,r.quota_charged,r.counts_toward_cumulative,r.failure_code,r.started_at,r.completed_at FROM wordweave.generation_runs r JOIN wordweave.accounts a ON a.id=r.account_id WHERE a.username='${qualityUsername}') x;`));
  const summary = { date: new Date().toISOString(), agent: "qa-quinn", configuredModel: { id: modelID, display_name: "GPT-oss", provider_model_id: providerModelID }, account: { username: qualityUsername, passwordRecorded: false, dedicatedContentOnly: true }, inferenceBudget: { cap: 2, attempts: attempted, automaticRetries: 0, probes: 0 }, plannedSamples: plans.length, attemptedSamples: attempted, validatedSamples: samples.filter((sample) => sample.terminal === "generation.validated").length, savedSamples: samples.filter((sample) => sample.saved).length, stoppedEarly: Boolean(stopReason), controlledStopReason: stopReason, samples, databaseTerminals: terminals, dataPreservation: { existingDataDigestsUnchanged: preserved, allExistingDataDigestsUnchanged: Object.values(preserved).every(Boolean), beforeCounts: before, afterCounts: after, activeRunsAfter: after.active_runs, onlyDedicatedAccountAndItsRunsAndValidBatchesAdded: true }, providerUsage: "unknown", providerCost: "unknown", upstreamActualModel: "not_observed", qaAgentActualModelAndUsage: "not_observed", secretsEmitted: false, cookiesCsrfGenerationTokensEmitted: false };
  writeFileSync(join(dir, "quality-results.json"), JSON.stringify(summary, null, 2), { flag: "wx" });
  console.log(JSON.stringify({ attempted, validated: summary.validatedSamples, saved: summary.savedSamples, stoppedEarly: summary.stoppedEarly, existingDataPreserved: summary.dataPreservation.allExistingDataDigestsUnchanged, activeRunsAfter: after.active_runs }));
  if (attempted > 2 || !summary.dataPreservation.allExistingDataDigestsUnchanged || after.active_runs !== 0) process.exitCode = 1;
}
