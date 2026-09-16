import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const root = resolve(dir, "../../../../../..");
const baseline = JSON.parse(readFileSync(join(dir, "baseline.json"), "utf8"));
const run = (command, args, options = {}) => execFileSync(command, args, { encoding: "utf8", ...options }).trim();
const sha256 = (path) => createHash("sha256").update(readFileSync(join(root, path))).digest("hex");
const inspectUat = () => baseline.uat.map((entry) => {
  const raw = run("docker", ["inspect", entry.name.slice(1), "--format", "{{json .}}"]) ;
  const item = JSON.parse(raw);
  return { name: item.Name, id: item.Id, image: item.Image, created: item.Created, started: item.State.StartedAt, running: item.State.Running };
});
const portAvailable = (port) => {
  try { run("curl", ["--silent", "--show-error", "--max-time", "2", `http://127.0.0.1:${port}/`]); return false; }
  catch { return true; }
};
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);

const preCleanup = {
  databaseTmpfs: JSON.parse(run("docker", ["inspect", "ww-qa-085-db", "--format", "{{json .HostConfig.Tmpfs}}"])),
  syntheticCounts: Object.fromEntries(run("docker", ["exec", "-i", "ww-qa-085-db", "psql", "-U", "postgres", "-d", "qa", "-X", "-A", "-F", "|", "-t", "-c", "SELECT 'accounts',count(*) FROM wordweave.accounts UNION ALL SELECT 'sessions',count(*) FROM wordweave.account_sessions UNION ALL SELECT 'batches',count(*) FROM wordweave.learning_batches UNION ALL SELECT 'reviews',count(*) FROM wordweave.review_sessions UNION ALL SELECT 'runs',count(*) FROM wordweave.generation_runs UNION ALL SELECT 'credentials',count(*) FROM wordweave.openrouter_credentials UNION ALL SELECT 'models',count(*) FROM wordweave.ai_models ORDER BY 1"]).split("\n").map((line) => line.split("|"))),
  uat: inspectUat(),
};

for (const name of ["ww-qa-085-nginx", "ww-qa-085-frontend", "ww-qa-085-backend", "ww-qa-085-provider", "ww-qa-085-db"]) run("docker", ["rm", "-f", name]);
for (const name of ["ww-qa-085-edge", "ww-qa-085"]) run("docker", ["network", "rm", name]);

const protectedAfter = Object.fromEntries(Object.keys(baseline.protectedHashes).map((path) => [path, sha256(path)]));
const uatAfter = inspectUat();
const designStatus = Number(run("curl", ["--silent", "--output", "/dev/null", "--write-out", "%{http_code}", "--max-time", "5", "http://127.0.0.1:6010/prototype/"]));
const candidateImagesPresent = Object.fromEntries(["frontend", "backend", "postgres", "playwright", "nginx"].map((name) => {
  try { run("docker", ["image", "inspect", baseline.candidates[name]]); return [name, true]; }
  catch { return [name, false]; }
}));
let unavailableTagInstalled = true;
try { run("docker", ["image", "inspect", "mcr.microsoft.com/playwright:v1.56.1-noble"]); }
catch { unavailableTagInstalled = false; }

const checks = {
  databaseWasTmpfs: Object.hasOwn(preCleanup.databaseTmpfs, "/var/lib/postgresql"),
  uatUnchangedBeforeCleanup: same(preCleanup.uat, baseline.uat),
  uatUnchangedAfterCleanup: same(uatAfter, baseline.uat),
  protectedFilesUnchanged: same(protectedAfter, baseline.protectedHashes),
  qaPort6101Released: portAvailable(6101),
  design6010StillHealthy: designStatus === 200,
  fixedCandidateImagesPreserved: Object.values(candidateImagesPresent).every(Boolean),
  abortedUnavailableTagNotInstalled: unavailableTagInstalled === false,
};
writeFileSync(join(dir, "cleanup.json"), JSON.stringify({ date: new Date().toISOString(), agent: "qa-quinn", checks, preCleanup, uatAfter, protectedAfter, candidateImagesPresent, unavailableTagInstalled, removed: { containers: ["ww-qa-085-nginx", "ww-qa-085-frontend", "ww-qa-085-backend", "ww-qa-085-provider", "ww-qa-085-db"], networks: ["ww-qa-085-edge", "ww-qa-085"], recovery: "tmpfs synthetic database is not recoverable; evidence and setup scripts are retained" } }, null, 2), { flag: "wx" });
console.log(JSON.stringify(checks));
if (!Object.values(checks).every(Boolean)) process.exitCode = 1;
