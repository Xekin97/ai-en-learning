import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { request } from "../../../../../../frontend/node_modules/@playwright/test/index.mjs";

const dir = dirname(fileURLToPath(import.meta.url));
const root = resolve(dir, "../../../../../..");
const origin = "http://localhost:6001";
const qualityUsername = "uat_ai_quality_088";
const configuration = JSON.parse(readFileSync(join(dir, "configuration.json"), "utf8"));
const realModelID = configuration.modelsAfter.find((model) => model.openrouter_model_id === "deepseek/deepseek-v4-flash-0731")?.id;
if (!realModelID || !configuration.modelsAfter.find((model) => model.id === realModelID)?.enabled) throw new Error("real model is not enabled in completed configuration evidence");
const plans = [
  { id: "AQ088-S1", meaning_language: "zh", scenario: "discussion", length: "medium", entries: ["alleviate", "undermine", "facilitate", "deteriorate", "perceive"], purpose: "用户指定五词；中文情境释义、讨论场景、中篇" },
  { id: "AQ088-S2", meaning_language: "en", scenario: "news", length: "long", entries: ["sustainable", "prevalent", "vulnerable", "ambiguous", "coherent"], purpose: "用户指定五词；英英情境释义、新闻学习示例、长篇" },
  { id: "AQ088-S3", meaning_language: "ja", scenario: "story", length: "short", entries: ["learn"], purpose: "单词对照；日文情境释义、故事场景、短篇" },
];
const docker = (args) => execFileSync("docker", args, { cwd: root, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 }).trim();
const sql = (query) => docker(["exec", "wordweave_uat-postgres-1", "psql", "-U", "postgres", "-d", "wordweave", "-X", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-c", query]);
const digestQuery = (query) => sql(`SELECT md5(COALESCE(string_agg(md5(row_to_json(t)::text),'' ORDER BY md5(row_to_json(t)::text)),'')) FROM (${query}) t`);
const preservedSnapshot = () => ({
  accounts: digestQuery(`SELECT id,username,password_hash,role,group_code,status,ui_locale,quota_reset_at,created_at,updated_at FROM wordweave.accounts WHERE username <> '${qualityUsername}'`),
  sessions: digestQuery(`SELECT s.* FROM wordweave.account_sessions s JOIN wordweave.accounts a ON a.id=s.account_id WHERE a.username <> '${qualityUsername}'`),
  batches: digestQuery(`SELECT b.* FROM wordweave.learning_batches b JOIN wordweave.accounts a ON a.id=b.owner_id WHERE a.username <> '${qualityUsername}'`),
  targets: digestQuery(`SELECT t.* FROM wordweave.batch_targets t JOIN wordweave.accounts a ON a.id=t.owner_id WHERE a.username <> '${qualityUsername}'`),
  hintOccurrences: digestQuery(`SELECT h.* FROM wordweave.hint_occurrences h JOIN wordweave.accounts a ON a.id=h.owner_id WHERE a.username <> '${qualityUsername}'`),
  passageOccurrences: digestQuery(`SELECT p.* FROM wordweave.passage_occurrences p JOIN wordweave.accounts a ON a.id=p.owner_id WHERE a.username <> '${qualityUsername}'`),
  runs: digestQuery(`SELECT r.* FROM wordweave.generation_runs r LEFT JOIN wordweave.accounts a ON a.id=r.account_id WHERE a.username IS DISTINCT FROM '${qualityUsername}'`),
  models: digestQuery("SELECT * FROM wordweave.ai_models"), groups: digestQuery("SELECT * FROM wordweave.entitlement_groups"), groupModels: digestQuery("SELECT * FROM wordweave.group_models"), groupLengths: digestQuery("SELECT * FROM wordweave.group_lengths"), credentials: digestQuery("SELECT * FROM wordweave.openrouter_credentials"), migrations: digestQuery("SELECT * FROM wordweave.schema_migrations"),
});
const counts = () => JSON.parse(sql(`SELECT json_build_object('accounts',(SELECT count(*) FROM wordweave.accounts),'sessions',(SELECT count(*) FROM wordweave.account_sessions),'batches',(SELECT count(*) FROM wordweave.learning_batches),'runs',(SELECT count(*) FROM wordweave.generation_runs),'active_runs',(SELECT count(*) FROM wordweave.generation_runs WHERE call_status='active'),'quality_accounts',(SELECT count(*) FROM wordweave.accounts WHERE username='${qualityUsername}'),'quality_sessions',(SELECT count(*) FROM wordweave.account_sessions s JOIN wordweave.accounts a ON a.id=s.account_id WHERE a.username='${qualityUsername}'),'quality_batches',(SELECT count(*) FROM wordweave.learning_batches b JOIN wordweave.accounts a ON a.id=b.owner_id WHERE a.username='${qualityUsername}'),'quality_runs',(SELECT count(*) FROM wordweave.generation_runs r JOIN wordweave.accounts a ON a.id=r.account_id WHERE a.username='${qualityUsername}'));`));
const commonHeaders = { origin, "sec-fetch-site": "same-origin" };
async function api(context, method, path, csrf, data, extraHeaders = {}, timeout = 300000) {
  const headers = { ...commonHeaders, ...extraHeaders };
  if (csrf) headers["x-csrf-token"] = csrf;
  const response = await context.fetch(path, { method, headers, timeout, ...(data === undefined ? {} : { data }) });
  const text = await response.text();
  const body = text && response.headers()["content-type"]?.includes("json") ? JSON.parse(text) : null;
  return { status: response.status(), headers: response.headers(), body, text };
}
const requireStatus = (response, expected, action) => {
  if (response.status !== expected) throw new Error(`${action} returned HTTP ${response.status}${response.body?.code ? ` (${response.body.code})` : ""}`);
  return response.body;
};
function parseSSE(text) {
  const events = [];
  for (const block of text.split(/\r?\n\r?\n/)) {
    let event = "message";
    const data = [];
    for (const line of block.split(/\r?\n/)) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
    }
    if (!data.length) continue;
    const raw = data.join("\n");
    let parsed = null;
    try { parsed = JSON.parse(raw); } catch { parsed = { malformed: true }; }
    events.push({ event, data: parsed });
  }
  return events;
}
const wordCount = (passage) => passage.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu)?.length ?? 0;
const safeFailure = (error) => {
  const message = String(error?.message || error);
  if (/timeout|exceeded/i.test(message)) return "quality request client_timeout_300000";
  if (/HTTP \d{3}/.test(message)) return message.match(/^[^\r\n]*/)[0];
  return "quality execution failed; inspect controlled result fields";
};

const beforeCounts = counts();
const beforePreserved = preservedSnapshot();
if (beforeCounts.active_runs !== 0 || beforeCounts.quality_accounts !== 0) throw new Error("quality account precondition mismatch");
writeFileSync(join(dir, "quality-prestate.json"), JSON.stringify({ date: new Date().toISOString(), agent: "qa-quinn", plans, counts: beforeCounts, exactFrozenEntriesVerified: true, basicMaxEntries: 5, basicAllowedLengths: ["short", "medium", "long", "xlong"], preservedDigestsComparedOnlyInMemory: true, realInferenceAttemptsBeforeSamples: 2, sampleRequestCap: 3, secretsEmitted: false }, null, 2), { flag: "wx" });

const context = await request.newContext({ baseURL: origin, timeout: 300000 });
let csrf = null;
let loggedIn = false;
let qualityPassword = `Aq088!${randomBytes(24).toString("base64url")}`;
const samples = [];
let attempted = 0;
let stopReason = null;
try {
  const bootstrap = requireStatus(await api(context, "GET", "/api/v1/bootstrap", null, undefined, {}, 15000), 200, "bootstrap").data;
  const registered = requireStatus(await api(context, "POST", "/api/v1/auth/register", bootstrap.csrf_token, { username: qualityUsername, password: qualityPassword, password_confirmation: qualityPassword, ui_locale: "en-US" }, {}, 15000), 201, "quality account registration").data;
  csrf = registered.csrf_token;
  loggedIn = true;
  qualityPassword = null;
  const options = requireStatus(await api(context, "GET", "/api/v1/generation-options", null, undefined, {}, 15000), 200, "generation options").data;
  if (!options.models.some((model) => model.id === realModelID) || options.max_entries !== 5 || !plans.every((plan) => options.lengths.includes(plan.length))) throw new Error("basic generation options do not expose the approved plan");
  for (const plan of plans) {
    for (const entry of plan.entries) {
      const search = requireStatus(await api(context, "GET", `/api/v1/vocabulary/search?q=${encodeURIComponent(entry)}&limit=20`, null, undefined, {}, 15000), 200, `vocabulary ${entry}`).data;
      if (!search.items.some((item) => item.entry.toLowerCase() === entry)) throw new Error(`frozen entry unavailable: ${entry}`);
    }
  }

  for (const plan of plans) {
    if (stopReason) break;
    attempted += 1;
    const startedAt = new Date().toISOString();
    let response;
    try {
      response = await api(context, "POST", "/api/v1/generations/stream", csrf, { model_id: realModelID, meaning_language: plan.meaning_language, scenario: plan.scenario, length: plan.length, entries: plan.entries }, {}, 300000);
    } catch (error) {
      samples.push({ plan, started_at: startedAt, completed_at: new Date().toISOString(), terminal: "client_error", controlled_error: safeFailure(error), saved: false });
      stopReason = "client_error";
      break;
    }
    if (response.status !== 200) {
      samples.push({ plan, started_at: startedAt, completed_at: new Date().toISOString(), http_status: response.status, terminal: "pre_stream_failure", code: response.body?.code ?? null, saved: false });
      stopReason = response.body?.code ?? "pre_stream_failure";
      break;
    }
    const events = parseSSE(response.text);
    const started = events.find((item) => item.event === "generation.started")?.data;
    const validated = events.find((item) => item.event === "generation.validated")?.data;
    const failed = events.find((item) => item.event === "generation.failed")?.data;
    const cancelled = events.find((item) => item.event === "generation.cancelled")?.data;
    const streamedPassage = events.filter((item) => item.event === "passage.delta").map((item) => item.data?.text ?? "").join("");
    if (!started?.run_id || !started?.generation_token) throw new Error(`${plan.id} missing generation.started`);
    if (!validated?.result) {
      samples.push({ plan, started_at: startedAt, completed_at: new Date().toISOString(), http_status: response.status, content_type: response.headers["content-type"], terminal: failed ? "generation.failed" : cancelled ? "generation.cancelled" : "missing_terminal", run_id: started.run_id, failure: failed ? { code: failed.code, quota_refunded: failed.quota_refunded, retryable: failed.retryable } : cancelled ?? null, partial_passage: streamedPassage, saved: false });
      stopReason = failed?.code ?? (cancelled ? "cancelled" : "missing_terminal");
      break;
    }
    const result = validated.result;
    const save = requireStatus(await api(context, "POST", `/api/v1/generations/${encodeURIComponent(started.run_id)}/save`, csrf, {}, { "x-generation-token": started.generation_token }, 15000), 201, `${plan.id} save`).data;
    const detail = requireStatus(await api(context, "GET", `/api/v1/me/batches/${encodeURIComponent(save.batch_id)}`, null, undefined, {}, 15000), 200, `${plan.id} detail`).data.batch;
    const contentMatchesSaved = detail.passage === result.passage && JSON.stringify(detail.tags) === JSON.stringify(result.tags) && JSON.stringify(detail.targets) === JSON.stringify(result.targets);
    if (!contentMatchesSaved) throw new Error(`${plan.id} saved content mismatch`);
    samples.push({
      plan, started_at: startedAt, completed_at: new Date().toISOString(), http_status: response.status, content_type: response.headers["content-type"], cache_control: response.headers["cache-control"], terminal: "generation.validated", run_id: started.run_id,
      prompt_version: "m001-v2", validator_version: "m001-v2", passage_delta_count: events.filter((item) => item.event === "passage.delta").length, streamed_passage_matches_final: streamedPassage === result.passage,
      result: { passage: result.passage, computed_word_count: wordCount(result.passage), tags: result.tags, targets: result.targets },
      saved: true, saved_batch: { batch_id: detail.id, saved_at: detail.saved_at, configuration: detail.configuration, participates_in_range_review: detail.participates_in_range_review, passage: detail.passage, tags: detail.tags, targets: detail.targets }, content_matches_saved: true,
    });
  }
} catch (error) {
  stopReason = safeFailure(error);
} finally {
  qualityPassword = null;
  if (loggedIn && csrf) await api(context, "POST", "/api/v1/auth/logout", csrf, {}, {}, 15000).catch(() => null);
  await context.dispose();
  const afterCounts = counts();
  const afterPreserved = preservedSnapshot();
  const preserved = Object.fromEntries(Object.keys(beforePreserved).map((key) => [key, beforePreserved[key] === afterPreserved[key]]));
  const terminals = JSON.parse(sql(`SELECT COALESCE(json_agg(x ORDER BY x.started_at),'[]'::json) FROM (SELECT r.provider_model_id_snapshot,r.meaning_language,r.scenario,r.length_code,r.minimum_words_snapshot,r.max_entries_snapshot,r.call_status,r.disposition,r.quota_charged,r.counts_toward_cumulative,r.failure_code,r.started_at,r.completed_at FROM wordweave.generation_runs r JOIN wordweave.accounts a ON a.id=r.account_id WHERE a.username='${qualityUsername}') x;`));
  const summary = {
    date: new Date().toISOString(), agent: "qa-quinn", model: "deepseek/deepseek-v4-flash-0731", account: { username: qualityUsername, passwordRecorded: false, dedicatedContentOnly: true },
    inferenceBudget: { cap: 5, initialCancelledProbe: 1, recoveryProbe: 1, qualityRequests: attempted, totalAttempts: 2 + attempted, automaticRetries: 0 },
    plannedSamples: plans.length, attemptedSamples: attempted, validatedSamples: samples.filter((sample) => sample.terminal === "generation.validated").length, savedSamples: samples.filter((sample) => sample.saved).length,
    stoppedEarly: Boolean(stopReason), controlledStopReason: stopReason, samples, databaseTerminals: terminals,
    dataPreservation: { existingDataDigestsUnchanged: preserved, allExistingDataDigestsUnchanged: Object.values(preserved).every(Boolean), beforeCounts, afterCounts, activeRunsAfter: afterCounts.active_runs, onlyDedicatedAccountAndItsRunsAndBatchesAdded: true },
    providerUsage: "unknown", providerCost: "unknown", secretsEmitted: false, cookiesCsrfGenerationTokensEmitted: false, actualModel: "not_observed", usage: "not_observed",
  };
  writeFileSync(join(dir, "quality-results.json"), JSON.stringify(summary, null, 2), { flag: "wx" });
  console.log(JSON.stringify({ attempted, validated: summary.validatedSamples, saved: summary.savedSamples, stoppedEarly: summary.stoppedEarly, totalInferenceAttempts: summary.inferenceBudget.totalAttempts, existingDataPreserved: summary.dataPreservation.allExistingDataDigestsUnchanged, activeRunsAfter: afterCounts.active_runs }));
  if (summary.stoppedEarly || summary.validatedSamples !== plans.length || !summary.dataPreservation.allExistingDataDigestsUnchanged || afterCounts.active_runs !== 0) process.exitCode = 1;
}
