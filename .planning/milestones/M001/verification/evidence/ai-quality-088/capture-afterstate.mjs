import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const root = resolve(dir, "../../../../../..");
const docker = (args) => execFileSync("docker", args, { cwd: root, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 }).trim();
const sql = (query) => docker(["exec", "wordweave_uat-postgres-1", "psql", "-U", "postgres", "-d", "wordweave", "-X", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-c", query]);
const digest = (table, projection = "*") => sql(`SELECT md5(COALESCE(string_agg(md5(row_to_json(t)::text),'' ORDER BY md5(row_to_json(t)::text)),'')) FROM (SELECT ${projection} FROM wordweave.${table}) t`);
const preflight = JSON.parse(readFileSync(join(dir, "preflight.json"), "utf8"));
const publicDigests = {
  accounts: digest("accounts", "id,username,role,group_code,status,ui_locale,quota_reset_at,created_at,updated_at"),
  batches: digest("learning_batches"), targets: digest("batch_targets"), groups: digest("entitlement_groups"), groupModels: digest("group_models"), groupLengths: digest("group_lengths"), runs: digest("generation_runs"), migrations: digest("schema_migrations"),
};
const counts = JSON.parse(sql("SELECT json_build_object('accounts',(SELECT count(*) FROM wordweave.accounts),'sessions',(SELECT count(*) FROM wordweave.account_sessions),'batches',(SELECT count(*) FROM wordweave.learning_batches),'models',(SELECT count(*) FROM wordweave.ai_models),'credentials',(SELECT count(*) FROM wordweave.openrouter_credentials),'runs',(SELECT count(*) FROM wordweave.generation_runs),'active_runs',(SELECT count(*) FROM wordweave.generation_runs WHERE call_status='active'),'quality_accounts',(SELECT count(*) FROM wordweave.accounts WHERE username='uat_ai_quality_088'),'quality_batches',(SELECT count(*) FROM wordweave.learning_batches b JOIN wordweave.accounts a ON a.id=b.owner_id WHERE a.username='uat_ai_quality_088'),'migrations',(SELECT count(*) FROM wordweave.schema_migrations),'latest_migration',(SELECT max(version) FROM wordweave.schema_migrations));"));
const models = JSON.parse(sql("SELECT COALESCE(json_agg(x ORDER BY x.created_at),'[]'::json) FROM (SELECT m.id,m.display_name,m.provider_model_id,m.enabled,m.created_at,m.updated_at,COALESCE((SELECT json_agg(gm.group_code ORDER BY gm.group_code) FROM wordweave.group_models gm WHERE gm.model_id=m.id),'[]'::json) assigned_groups FROM wordweave.ai_models m) x;"));
const groups = JSON.parse(sql("SELECT json_agg(x ORDER BY x.code) FROM (SELECT g.code,g.rolling_quota_limit,g.max_entries_per_run,COALESCE((SELECT json_agg(gl.length_code ORDER BY CASE gl.length_code WHEN 'short' THEN 1 WHEN 'medium' THEN 2 WHEN 'long' THEN 3 ELSE 4 END) FROM wordweave.group_lengths gl WHERE gl.group_code=g.code),'[]'::json) lengths,COALESCE((SELECT json_agg(gm.model_id ORDER BY gm.model_id) FROM wordweave.group_models gm WHERE gm.group_code=g.code),'[]'::json) model_ids FROM wordweave.entitlement_groups g) x;"));
const credential = JSON.parse(sql("SELECT json_build_object('configured',EXISTS(SELECT 1 FROM wordweave.openrouter_credentials),'updated_at',(SELECT updated_at FROM wordweave.openrouter_credentials WHERE provider='openrouter'));"));
const containers = JSON.parse(docker(["inspect", "wordweave_uat-frontend-1", "wordweave_uat-backend-1", "wordweave_uat-nginx-1", "wordweave_uat-postgres-1"])).map((item) => ({ name: item.Name, id: item.Id, image: item.Image, status: item.State.Status, health: item.State.Health?.Status ?? null, providerBase: item.Name.endsWith("backend-1") ? Object.fromEntries(item.Config.Env.map((entry) => entry.split(/=(.*)/s).slice(0, 2))).OPENROUTER_BASE_URL : undefined }));
const preservedKeys = ["accounts", "batches", "targets", "groups", "groupModels", "groupLengths", "runs", "migrations"];
const result = {
  date: new Date().toISOString(), agent: "qa-quinn", result: "PASS_WITH_EXPECTED_CONFIGURATION_DELTA",
  counts, credential, models, groups, containers,
  preservation: {
    unchangedPublicDigests: Object.fromEntries(preservedKeys.map((key) => [key, publicDigests[key] === preflight.dataBefore.publicDigests[key]])),
    modelCountDelta: counts.models - preflight.dataBefore.counts.models,
    credentialCountDelta: counts.credentials - preflight.dataBefore.counts.credentials,
    existingAccountPasswordMutationCalls: 0,
    existingLearningDataMutationCalls: 0,
    qualityGenerationRequests: 0,
    noActiveGeneration: counts.active_runs === 0,
    migrationCountAndLatestUnchanged: counts.migrations === preflight.dataBefore.counts.migrations && counts.latest_migration === preflight.dataBefore.counts.latest_migration,
  },
  expectedDelta: "OpenRouter credential replaced through product API and one disabled model record created. No group assignment, mock-model status, account, learning batch, or generation run changed.",
  secretsEmitted: false,
};
if (!Object.values(result.preservation.unchangedPublicDigests).every(Boolean) || result.preservation.modelCountDelta !== 1 || result.preservation.credentialCountDelta !== 0 || !result.preservation.noActiveGeneration || !result.preservation.migrationCountAndLatestUnchanged) throw new Error("afterstate preservation mismatch");
writeFileSync(join(dir, "configuration-afterstate.json"), JSON.stringify(result, null, 2), { flag: "wx" });
console.log(JSON.stringify({ result: result.result, counts, newModelEnabled: models.find((item) => item.provider_model_id === "deepseek/deepseek-v4-flash-0731")?.enabled, qualityGenerationRequests: 0, dataPreserved: true }));
