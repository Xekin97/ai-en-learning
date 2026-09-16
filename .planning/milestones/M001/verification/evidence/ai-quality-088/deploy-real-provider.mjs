import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const root = resolve(dir, "../../../../../..");
const targetImage = "sha256:642ed57ad0ed6c8a13e4bba1101d8b50188e8ea636791583a6ffb5eaa6917aac";
const oldBaseURL = "http://host.docker.internal:6002/v1";
const newBaseURL = "https://openrouter.ai/api/v1";
const names = ["wordweave_uat-frontend-1", "wordweave_uat-backend-1", "wordweave_uat-nginx-1", "wordweave_uat-postgres-1"];
const docker = (args, env = process.env) => execFileSync("docker", args, { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, env }).trim();
const sha = (buffer) => createHash("sha256").update(buffer).digest("hex");
const envOf = (container) => Object.fromEntries(container.Config.Env.map((item) => { const at = item.indexOf("="); return [item.slice(0, at), item.slice(at + 1)]; }));
const safeContainer = (container) => ({ name: container.Name, id: container.Id, image: container.Image, created: container.Created, started: container.State.StartedAt, status: container.State.Status, health: container.State.Health?.Status ?? null, mounts: container.Mounts.map((mount) => ({ type: mount.Type, name: mount.Name, destination: mount.Destination })), networks: Object.keys(container.NetworkSettings.Networks) });
const sql = (query) => docker(["exec", "wordweave_uat-postgres-1", "psql", "-U", "postgres", "-d", "wordweave", "-X", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-c", query]);
const tableDigest = (table, projection = "*") => sql(`SELECT md5(COALESCE(string_agg(md5(row_to_json(t)::text),'' ORDER BY md5(row_to_json(t)::text)),'')) FROM (SELECT ${projection} FROM wordweave.${table}) t`);
const snapshot = () => ({
  counts: JSON.parse(sql("SELECT json_build_object('accounts',(SELECT count(*) FROM wordweave.accounts),'sessions',(SELECT count(*) FROM wordweave.account_sessions),'batches',(SELECT count(*) FROM wordweave.learning_batches),'models',(SELECT count(*) FROM wordweave.ai_models),'credentials',(SELECT count(*) FROM wordweave.openrouter_credentials),'runs',(SELECT count(*) FROM wordweave.generation_runs),'active_runs',(SELECT count(*) FROM wordweave.generation_runs WHERE call_status='active'),'migrations',(SELECT count(*) FROM wordweave.schema_migrations),'latest_migration',(SELECT max(version) FROM wordweave.schema_migrations));")),
  digests: {
    accounts: tableDigest("accounts", "id,username,role,group_code,status,ui_locale,quota_reset_at,created_at,updated_at"),
    passwords: tableDigest("accounts", "id,password_hash"), sessions: tableDigest("account_sessions"), batches: tableDigest("learning_batches"), targets: tableDigest("batch_targets"), models: tableDigest("ai_models"), groups: tableDigest("entitlement_groups"), groupModels: tableDigest("group_models"), groupLengths: tableDigest("group_lengths"), runs: tableDigest("generation_runs"), credentials: tableDigest("openrouter_credentials"), migrations: tableDigest("schema_migrations"),
  },
});
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
async function waitBackend() {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const current = JSON.parse(docker(["inspect", "wordweave_uat-backend-1"]))[0];
    if (current.State.Running && current.State.Health?.Status === "healthy") return true;
    await new Promise((resolveWait) => setTimeout(resolveWait, 1000));
  }
  return false;
}

let backupDirectory = null;
let before = null;
let oldEnvironment = null;
let changed = false;
try {
  const state = readFileSync(join(root, ".planning/workflow/state.yaml"), "utf8");
  const agents = readFileSync(join(root, ".planning/agt/agents.yaml"), "utf8");
  const gate = readFileSync(join(root, ".planning/milestones/M001/reviews/uat-086-acceptance-ai-quality-authorization.md"), "utf8");
  if (!state.includes("decision_id: TRANSITION-M001-088") || !state.includes("active_agent: qa-quinn") || !state.includes("user_accepted: true") || !state.includes("release_approved: false")) throw new Error("AI quality workflow gate mismatch");
  if ((agents.match(/status: \"active\"/g) ?? []).length !== 1 || !agents.match(/display_name: \"qa-quinn\"[\s\S]*?status: \"active\"/)) throw new Error("qa-quinn is not the unique active specialist");
  if (!gate.includes("functional_uat_accepted_ai_quality_authorized") || !gate.includes("deepseek/deepseek-v4-flash-0731")) throw new Error("AI quality authorization missing");
  const image = JSON.parse(docker(["image", "inspect", targetImage]))[0];
  if (image.Id !== targetImage) throw new Error("approved backend image unavailable");
  const candidate = JSON.parse(readFileSync(join(root, ".planning/milestones/M001/implementation/evidence/cr038-083/candidate.json"), "utf8"));
  if (candidate.image_id !== targetImage) throw new Error("backend candidate mismatch");
  for (const [path, expected] of Object.entries(candidate.source)) if (`sha256:${sha(readFileSync(join(root, path)))}` !== expected) throw new Error(`candidate source drift: ${path}`);

  before = JSON.parse(docker(["inspect", ...names]));
  if (!before.every((container) => container.Config.Labels["com.docker.compose.project"] === "wordweave_uat" && container.State.Running && container.State.Health?.Status === "healthy")) throw new Error("unsafe UAT service state");
  if (before[1].Image !== targetImage) throw new Error("UAT backend is not the approved candidate");
  oldEnvironment = envOf(before[1]);
  if (oldEnvironment.OPENROUTER_BASE_URL !== oldBaseURL) throw new Error("unexpected provider base; refusing unreviewed change");
  const beforeData = snapshot();
  if (beforeData.counts.active_runs !== 0 || beforeData.counts.migrations !== 6 || beforeData.counts.latest_migration !== "0006_hint_occurrences_enforce.sql") throw new Error("active generation or migration baseline mismatch");

  backupDirectory = mkdtempSync(join(tmpdir(), "wordweave-ai-quality-088-"));
  chmodSync(backupDirectory, 0o700);
  const runtimePath = join(backupDirectory, "runtime-private.json");
  writeFileSync(runtimePath, JSON.stringify(before, null, 2), { mode: 0o600, flag: "wx" });
  const dumpPath = join(backupDirectory, "wordweave.dump");
  const dump = execFileSync("docker", ["exec", "wordweave_uat-postgres-1", "pg_dump", "-U", "postgres", "-d", "wordweave", "--format=custom", "--no-owner", "--no-acl"], { maxBuffer: 256 * 1024 * 1024 });
  writeFileSync(dumpPath, dump, { mode: 0o600, flag: "wx" });
  const rollbackPath = join(backupDirectory, "rollback-provider.yaml");
  writeFileSync(rollbackPath, `services:\n  backend:\n    image: ${targetImage}\n    environment:\n      OPENROUTER_BASE_URL: ${oldBaseURL}\n`, { mode: 0o600, flag: "wx" });
  for (const path of [runtimePath, dumpPath, rollbackPath]) chmodSync(path, 0o600);
  if (!same(snapshot(), beforeData)) throw new Error("concurrent UAT change detected before deployment");

  const preflight = {
    date: new Date().toISOString(), agent: "qa-quinn", decision: "TRANSITION-M001-088", model: "deepseek/deepseek-v4-flash-0731",
    sourceHashesMatchCandidate: true, candidateImagePresent: true, activeGenerationAbsent: true, migrationsUnchanged: true,
    providerBefore: oldBaseURL, providerAfterPlanned: newBaseURL, mockProviderObservation: { pid: 77903, command: "node mock-openrouter.mjs", usedForAIQuality: false },
    before: before.map(safeContainer), dataBefore: { counts: beforeData.counts, publicDigests: Object.fromEntries(Object.entries(beforeData.digests).filter(([key]) => !["passwords", "credentials", "sessions"].includes(key))) },
    sensitiveDigestsComparedInMemory: true,
    backup: { directory: backupDirectory, directoryMode: (statSync(backupDirectory).mode & 0o777).toString(8), files: [runtimePath, dumpPath, rollbackPath].map((path) => ({ name: path.split("/").at(-1), bytes: statSync(path).size, mode: (statSync(path).mode & 0o777).toString(8) })) },
    realInferenceCalls: 0,
  };
  writeFileSync(join(dir, "preflight.json"), JSON.stringify(preflight, null, 2), { flag: "wx" });
  writeFileSync(join(dir, "commands.json"), JSON.stringify({ date: new Date().toISOString(), commands: [
    "docker inspect <four existing UAT containers>", "docker exec wordweave_uat-postgres-1 pg_dump <private 0600 file>",
    "docker compose --project-name wordweave_uat -f compose.yaml -f <ai-quality-088>/compose-backend.yaml up -d --no-deps --no-build --pull never backend",
    "docker exec wordweave_uat-nginx-1 nginx -s reload"
  ], sensitiveRuntimeValues: "resolved only in memory and not recorded" }, null, 2), { flag: "wx" });

  const runEnv = { ...process.env, COMPOSE_PROJECT_NAME: "wordweave_uat" };
  for (const [key, value] of Object.entries(oldEnvironment)) if (!["PATH", "HOME", "CODEX_HOME", "SHELL"].includes(key)) runEnv[key] = value;
  runEnv.OPENROUTER_BASE_URL = newBaseURL;
  const composeArgs = ["compose", "--project-name", "wordweave_uat", "-f", "compose.yaml", "-f", join(dir, "compose-backend.yaml")];
  const resolved = JSON.parse(docker([...composeArgs, "config", "--format", "json"], runEnv));
  for (const [key, value] of Object.entries(resolved.services.backend.environment)) {
    const expected = key === "OPENROUTER_BASE_URL" ? newBaseURL : oldEnvironment[key];
    if (String(value) !== expected) throw new Error(`runtime environment mismatch at ${key}`);
  }
  changed = true;
  const output = docker([...composeArgs, "up", "-d", "--no-deps", "--no-build", "--pull", "never", "backend"], runEnv);
  writeFileSync(join(dir, "compose-update.log"), output || "backend recreate completed without stdout\n", { flag: "wx" });
  if (!(await waitBackend())) throw new Error("real-provider backend did not become healthy");
  docker(["exec", "wordweave_uat-nginx-1", "nginx", "-s", "reload"]);

  const after = JSON.parse(docker(["inspect", ...names]));
  const afterEnvironment = envOf(after[1]);
  const changedKeys = [...new Set([...Object.keys(oldEnvironment), ...Object.keys(afterEnvironment)])].filter((key) => oldEnvironment[key] !== afterEnvironment[key]);
  const afterData = snapshot();
  const result = {
    date: new Date().toISOString(), agent: "qa-quinn", deploymentStatus: "PASS", before: before.map(safeContainer), after: after.map(safeContainer), backendImage: targetImage,
    providerBaseBefore: oldBaseURL, providerBaseAfter: newBaseURL, changedEnvironmentKeys: changedKeys,
    backup: { directory: backupDirectory, privateRollback: rollbackPath },
    checks: {
      backendHealthy: after[1].State.Health?.Status === "healthy", backendImageUnchanged: after[1].Image === targetImage,
      frontendContainerUnchanged: before[0].Id === after[0].Id, nginxContainerUnchanged: before[2].Id === after[2].Id, postgresContainerUnchanged: before[3].Id === after[3].Id,
      databaseVolumeUnchanged: same(safeContainer(before[3]).mounts, safeContainer(after[3]).mounts), onlyProviderBaseChanged: same(changedKeys, ["OPENROUTER_BASE_URL"]),
      protectedDataUnchangedBeforeCredentialConfiguration: same(afterData, beforeData), migrationsRun: false, imagesBuiltOrPulled: false, realInferenceCalls: 0,
    },
    dataBefore: { counts: beforeData.counts }, dataAfter: { counts: afterData.counts }, sensitiveDigestsEmitted: false,
  };
  writeFileSync(join(dir, "deployment.json"), JSON.stringify(result, null, 2), { flag: "wx" });
  const positive = Object.entries(result.checks).filter(([key]) => !["migrationsRun", "imagesBuiltOrPulled", "realInferenceCalls"].includes(key)).every(([, value]) => value === true);
  if (!positive || result.checks.migrationsRun || result.checks.imagesBuiltOrPulled || result.checks.realInferenceCalls !== 0) throw new Error("deployment preservation check failed");
  console.log(JSON.stringify({ deploymentStatus: "PASS", backendHealthy: true, onlyProviderBaseChanged: true, dataUnchanged: true, backupDirectory }));
} catch (error) {
  let rollback = { attempted: false, success: false };
  if (changed && before && oldEnvironment) {
    rollback.attempted = true;
    try {
      const rollbackEnv = { ...process.env, COMPOSE_PROJECT_NAME: "wordweave_uat" };
      for (const [key, value] of Object.entries(oldEnvironment)) if (!["PATH", "HOME", "CODEX_HOME", "SHELL"].includes(key)) rollbackEnv[key] = value;
      docker(["compose", "--project-name", "wordweave_uat", "-f", "compose.yaml", "-f", join(dir, "compose-backend.yaml"), "up", "-d", "--no-deps", "--no-build", "--pull", "never", "backend"], rollbackEnv);
      rollback.success = await waitBackend();
      if (rollback.success) docker(["exec", "wordweave_uat-nginx-1", "nginx", "-s", "reload"]);
    } catch (rollbackError) { rollback.error = String(rollbackError?.message || rollbackError); }
  }
  writeFileSync(join(dir, "deployment-failure.json"), JSON.stringify({ date: new Date().toISOString(), agent: "qa-quinn", error: String(error?.message || error), backupDirectory, rollback }, null, 2), { flag: "wx" });
  console.error(String(error?.message || error));
  process.exitCode = 1;
}
