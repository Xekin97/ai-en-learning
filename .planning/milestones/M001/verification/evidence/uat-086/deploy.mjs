import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const root = resolve(dir, "../../../../../..");
const docker = (args, env = process.env) => execFileSync("docker", args, { cwd: root, encoding: "utf8", maxBuffer: 32 * 1024 * 1024, env }).trim();
const sha = (buffer) => createHash("sha256").update(buffer).digest("hex");
const names = ["wordweave_uat-frontend-1", "wordweave_uat-backend-1", "wordweave_uat-nginx-1", "wordweave_uat-postgres-1"];
const target = {
  frontend: "sha256:fd251e7439aad8e058656e2751ed84f40715fec570a872da53542688a6dd6904",
  backend: "sha256:642ed57ad0ed6c8a13e4bba1101d8b50188e8ea636791583a6ffb5eaa6917aac",
};
const envOf = (container) => Object.fromEntries(container.Config.Env.map((item) => { const at = item.indexOf("="); return [item.slice(0, at), item.slice(at + 1)]; }));
const safeContainer = (container) => ({
  name: container.Name,
  id: container.Id,
  image: container.Image,
  created: container.Created,
  started: container.State.StartedAt,
  status: container.State.Status,
  health: container.State.Health?.Status ?? null,
  mounts: container.Mounts.map((mount) => ({ type: mount.Type, name: mount.Name, destination: mount.Destination })),
  networks: Object.keys(container.NetworkSettings.Networks),
});
const sql = (query) => docker(["exec", "wordweave_uat-postgres-1", "psql", "-U", "postgres", "-d", "wordweave", "-X", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-c", query]);
const tableDigest = (table, projection = "*") => sql(`SELECT md5(COALESCE(string_agg(md5(row_to_json(t)::text),'' ORDER BY md5(row_to_json(t)::text)),'')) FROM (SELECT ${projection} FROM wordweave.${table}) t`);
function publicData() {
  const counts = JSON.parse(sql("SELECT json_build_object('accounts',(SELECT count(*) FROM wordweave.accounts),'sessions',(SELECT count(*) FROM wordweave.account_sessions),'batches',(SELECT count(*) FROM wordweave.learning_batches),'models',(SELECT count(*) FROM wordweave.ai_models),'runs',(SELECT count(*) FROM wordweave.generation_runs),'active_runs',(SELECT count(*) FROM wordweave.generation_runs WHERE call_status='active'),'migration_count',(SELECT count(*) FROM wordweave.schema_migrations),'latest_version',(SELECT max(version) FROM wordweave.schema_migrations));"));
  return {
    counts,
    digests: {
      accountMetadata: tableDigest("accounts", "id,username,role,group_code,status,ui_locale,quota_reset_at,created_at,updated_at"),
      batches: tableDigest("learning_batches"),
      batchTargets: tableDigest("batch_targets"),
      vocabularyEntries: tableDigest("vocabulary_entries"),
      vocabularySnapshots: tableDigest("vocabulary_snapshots"),
      passageOccurrences: tableDigest("passage_occurrences"),
      hintOccurrences: tableDigest("hint_occurrences"),
      models: tableDigest("ai_models"),
      generationRuns: tableDigest("generation_runs"),
      groups: tableDigest("entitlement_groups"),
      groupModels: tableDigest("group_models"),
      groupLengths: tableDigest("group_lengths"),
      migrations: tableDigest("schema_migrations"),
    },
  };
}
const privateDigests = () => ({
  passwords: tableDigest("accounts", "id,password_hash"),
  credentials: tableDigest("openrouter_credentials"),
  sessions: tableDigest("account_sessions", "id,account_id,token_hash,created_at,expires_at"),
});
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
async function waitHealthy() {
  for (let count = 0; count < 120; count += 1) {
    const current = JSON.parse(docker(["inspect", names[0], names[1]]));
    if (current.every((item) => item.State.Running && item.State.Health?.Status === "healthy")) return true;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return false;
}

let backupDirectory = null;
let runEnv = null;
let before = null;
let oldImages = null;
let deploymentStarted = false;
try {
  const state = readFileSync(join(root, ".planning/workflow/state.yaml"), "utf8");
  const agents = readFileSync(join(root, ".planning/agt/agents.yaml"), "utf8");
  const continuous = readFileSync(join(root, ".planning/milestones/M001/reviews/cr037-cr038-continuous-to-uat-approval.md"), "utf8");
  const gate = readFileSync(join(root, ".planning/milestones/M001/reviews/cr037-cr038-uat-preparation-approval.md"), "utf8");
  const qaReport = readFileSync(join(root, ".planning/milestones/M001/verification/cr037-cr038-085-report.md"), "utf8");
  if (!state.includes("stage: verification") || !state.includes("active_role: quality/base") || !state.includes("active_agent: qa-quinn") || !state.includes("decision_id: TRANSITION-M001-086")) throw new Error("UAT086 workflow identity/gate mismatch");
  if ((agents.match(/status: "active"/g) ?? []).length !== 1 || !agents.match(/display_name: "qa-quinn"[\s\S]*?status: "active"/)) throw new Error("qa-quinn is not the unique active specialist");
  if (!continuous.includes("approved_continuous_until_uat") || !gate.includes("approved_for_local_uat_preparation") || !qaReport.includes("verdict: pass")) throw new Error("UAT086 authorization or QA PASS missing");

  const backendCandidate = JSON.parse(readFileSync(join(root, ".planning/milestones/M001/implementation/evidence/cr038-083/candidate.json"), "utf8"));
  const frontendCandidate = JSON.parse(readFileSync(join(root, ".planning/milestones/M001/implementation/evidence/cr037-084/candidate.json"), "utf8"));
  if (backendCandidate.image_id !== target.backend || frontendCandidate.image_id !== target.frontend || frontendCandidate.paired_backend.image_id !== target.backend) throw new Error("Candidate pair mismatch");
  for (const candidate of [backendCandidate, frontendCandidate]) for (const [path, expected] of Object.entries(candidate.source)) if (`sha256:${sha(readFileSync(join(root, path)))}` !== expected) throw new Error(`Candidate source drift: ${path}`);
  const images = JSON.parse(docker(["image", "inspect", target.frontend, target.backend]));
  if (images[0].Id !== target.frontend || images[1].Id !== target.backend) throw new Error("Pinned candidate image unavailable");

  before = JSON.parse(docker(["inspect", ...names]));
  for (const container of before) if (container.Config.Labels["com.docker.compose.project"] !== "wordweave_uat" || !container.State.Running || container.State.Health?.Status !== "healthy") throw new Error(`Unsafe UAT service state: ${container.Name}`);
  oldImages = { frontend: before[0].Image, backend: before[1].Image };
  const dataBefore = publicData();
  const secretsBefore = privateDigests();
  if (dataBefore.counts.active_runs !== 0 || dataBefore.counts.migration_count !== 6 || dataBefore.counts.latest_version !== "0006_hint_occurrences_enforce.sql") throw new Error("Active generation or migration baseline mismatch; deployment refused");

  const currentBackend = envOf(before[1]);
  const currentFrontend = envOf(before[0]);
  runEnv = { ...process.env, COMPOSE_PROJECT_NAME: "wordweave_uat" };
  for (const [key, value] of Object.entries(currentBackend)) if (!["PATH", "HOME", "CODEX_HOME", "SHELL"].includes(key)) runEnv[key] = value;
  if (!currentFrontend.NUXT_BACKEND_INTERNAL_ORIGIN) throw new Error("Current frontend backend origin unavailable");
  runEnv.BACKEND_INTERNAL_ORIGIN = currentFrontend.NUXT_BACKEND_INTERNAL_ORIGIN;
  const composeFile = join(dir, "compose-images.yaml");
  const baseArgs = ["compose", "--project-name", "wordweave_uat", "-f", "compose.yaml", "-f", composeFile];
  const resolved = JSON.parse(docker([...baseArgs, "config", "--format", "json"], runEnv));
  for (const [service, current] of [["backend", currentBackend], ["frontend", currentFrontend]]) for (const [key, value] of Object.entries(resolved.services[service].environment)) if (String(value) !== current[key]) throw new Error(`Runtime environment drift: ${service}.${key}`);

  backupDirectory = mkdtempSync(join(tmpdir(), "wordweave-uat-086-"));
  chmodSync(backupDirectory, 0o700);
  const runtimePath = join(backupDirectory, "runtime-private.json");
  writeFileSync(runtimePath, JSON.stringify(before, null, 2), { mode: 0o600, flag: "wx" });
  const dump = execFileSync("docker", ["exec", "wordweave_uat-postgres-1", "pg_dump", "-U", "postgres", "-d", "wordweave", "--format=custom", "--no-owner", "--no-acl"], { maxBuffer: 256 * 1024 * 1024 });
  const dumpPath = join(backupDirectory, "wordweave.dump");
  writeFileSync(dumpPath, dump, { mode: 0o600, flag: "wx" });
  const rollbackPath = join(backupDirectory, "rollback-compose.yaml");
  writeFileSync(rollbackPath, `services:\n  backend:\n    image: ${oldImages.backend}\n  frontend:\n    image: ${oldImages.frontend}\n`, { mode: 0o600, flag: "wx" });
  for (const path of [runtimePath, dumpPath, rollbackPath]) chmodSync(path, 0o600);

  const immediateData = publicData();
  const immediateSecrets = privateDigests();
  if (!same(immediateData, dataBefore) || !same(immediateSecrets, secretsBefore)) throw new Error("Concurrent UAT data change detected between backup and deployment; deployment refused");
  writeFileSync(join(dir, "preflight.json"), JSON.stringify({
    date: new Date().toISOString(), agent: "qa-quinn", decision: "TRANSITION-M001-086",
    before: before.map(safeContainer), target, dataBefore,
    sourceHashesMatchCandidate: true, candidateImagesPresent: true, activeGenerationAbsent: true, migrationsUnchanged: true,
    runtimeConfiguration: "Resolved only from current Docker Config.Env in memory; backend/.env values were not used or emitted",
    privateSensitiveDigestsCaptured: true,
    backup: { directory: backupDirectory, directoryMode: (statSync(backupDirectory).mode & 0o777).toString(8), files: [runtimePath, dumpPath, rollbackPath].map((path) => ({ name: path.split("/").at(-1), bytes: statSync(path).size, mode: (statSync(path).mode & 0o777).toString(8) })) },
    rollback: { frontendImage: oldImages.frontend, backendImage: oldImages.backend, privateCompose: rollbackPath },
    realAICalls: 0,
  }, null, 2), { flag: "wx" });
  writeFileSync(join(dir, "commands.json"), JSON.stringify({ date: new Date().toISOString(), commands: [
    "docker inspect wordweave_uat-frontend-1 wordweave_uat-backend-1 wordweave_uat-nginx-1 wordweave_uat-postgres-1",
    "docker exec wordweave_uat-postgres-1 pg_dump -U postgres -d wordweave --format=custom --no-owner --no-acl",
    `docker tag ${target.frontend} wordweave-uat-frontend:qa085`,
    `docker tag ${target.backend} wordweave-uat-backend:qa085`,
    "docker compose --project-name wordweave_uat -f compose.yaml -f <uat-086>/compose-images.yaml up -d --no-deps --no-build --pull never backend frontend",
    "docker exec wordweave_uat-nginx-1 nginx -s reload",
  ], sensitiveRuntimeValues: "not recorded" }, null, 2), { flag: "wx" });

  docker(["tag", oldImages.frontend, "wordweave-uat-frontend:rollback-uat086"]);
  docker(["tag", oldImages.backend, "wordweave-uat-backend:rollback-uat086"]);
  docker(["tag", target.frontend, "wordweave-uat-frontend:qa085"]);
  docker(["tag", target.backend, "wordweave-uat-backend:qa085"]);
  deploymentStarted = true;
  const composeOutput = docker([...baseArgs, "up", "-d", "--no-deps", "--no-build", "--pull", "never", "backend", "frontend"], runEnv);
  writeFileSync(join(dir, "compose-update.log"), composeOutput || "compose update completed without stdout\n", { flag: "wx" });
  const healthy = await waitHealthy();
  if (!healthy) throw new Error("Updated frontend/backend did not become healthy");
  docker(["exec", "wordweave_uat-nginx-1", "nginx", "-s", "reload"]);

  const after = JSON.parse(docker(["inspect", ...names]));
  const dataAfter = publicData();
  const secretsAfter = privateDigests();
  const environmentPreserved = [[after[0], currentFrontend], [after[1], currentBackend]].every(([container, old]) => { const now = envOf(container); return Object.keys(old).filter((key) => !["PATH", "HOME", "CODEX_HOME", "SHELL"].includes(key)).every((key) => now[key] === old[key]); });
  const result = {
    date: new Date().toISOString(), agent: "qa-quinn", deploymentStatus: "PASS", before: before.map(safeContainer), after: after.map(safeContainer), target, oldImages,
    rollback: { directory: backupDirectory, frontendTag: "wordweave-uat-frontend:rollback-uat086", backendTag: "wordweave-uat-backend:rollback-uat086", privateCompose: rollbackPath },
    checks: {
      pairedImages: after[0].Image === target.frontend && after[1].Image === target.backend,
      frontendHealthy: after[0].State.Health?.Status === "healthy",
      backendHealthy: after[1].State.Health?.Status === "healthy",
      databaseContainerUnchanged: before[3].Id === after[3].Id,
      nginxContainerUnchanged: before[2].Id === after[2].Id,
      databaseVolumeUnchanged: same(safeContainer(before[3]).mounts, safeContainer(after[3]).mounts),
      runtimeEnvironmentPreserved: environmentPreserved,
      publicDataUnchanged: same(dataAfter, dataBefore),
      passwordsAndCredentialCiphertextUnchanged: secretsAfter.passwords === secretsBefore.passwords && secretsAfter.credentials === secretsBefore.credentials,
      sessionsUnchangedDuringDeployment: secretsAfter.sessions === secretsBefore.sessions,
      noActiveGeneration: dataAfter.counts.active_runs === 0,
      migrationCountAndLatestUnchanged: dataAfter.counts.migration_count === dataBefore.counts.migration_count && dataAfter.counts.latest_version === dataBefore.counts.latest_version,
      migrationsRun: false,
      imagesBuiltOrPulled: false,
      realAICalls: 0,
    },
    dataBefore, dataAfter,
  };
  writeFileSync(join(dir, "deployment.json"), JSON.stringify(result, null, 2), { flag: "wx" });
  const required = Object.entries(result.checks).filter(([key]) => !["migrationsRun", "imagesBuiltOrPulled", "realAICalls"].includes(key)).every(([, value]) => value === true) && result.checks.migrationsRun === false && result.checks.imagesBuiltOrPulled === false && result.checks.realAICalls === 0;
  if (!required) throw new Error("Post-deployment preservation check failed");
  console.log(JSON.stringify({ deploymentStatus: result.deploymentStatus, pairedImages: result.checks.pairedImages, healthy: [result.checks.frontendHealthy, result.checks.backendHealthy], dataUnchanged: result.checks.publicDataUnchanged, passwordsUnchanged: result.checks.passwordsAndCredentialCiphertextUnchanged, backupDirectory }));
} catch (error) {
  let rollback = { attempted: false, success: false };
  if (deploymentStarted && backupDirectory && runEnv && oldImages) {
    rollback.attempted = true;
    try {
      const rollbackCompose = join(backupDirectory, "rollback-compose.yaml");
      docker(["compose", "--project-name", "wordweave_uat", "-f", "compose.yaml", "-f", rollbackCompose, "up", "-d", "--no-deps", "--no-build", "--pull", "never", "backend", "frontend"], runEnv);
      rollback.success = await waitHealthy();
      if (rollback.success) docker(["exec", "wordweave_uat-nginx-1", "nginx", "-s", "reload"]);
    } catch (rollbackError) { rollback.error = String(rollbackError?.message || rollbackError); }
  }
  writeFileSync(join(dir, "deployment-failure.json"), JSON.stringify({ date: new Date().toISOString(), agent: "qa-quinn", error: String(error?.message || error), backupDirectory, rollback }, null, 2), { flag: "wx" });
  console.error(String(error?.message || error));
  process.exitCode = 1;
}
