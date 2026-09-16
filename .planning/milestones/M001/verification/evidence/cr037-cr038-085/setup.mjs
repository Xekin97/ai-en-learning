import { execFileSync, spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import net from "node:net";

const dir = dirname(fileURLToPath(import.meta.url));
const root = resolve(dir, "../../../../../..");
const prefix = "ww-qa-085";
const frontend = "sha256:fd251e7439aad8e058656e2751ed84f40715fec570a872da53542688a6dd6904";
const backend = "sha256:642ed57ad0ed6c8a13e4bba1101d8b50188e8ea636791583a6ffb5eaa6917aac";
const postgres = "sha256:b85269e8c6aa961524542eb4dcca44c4aa1deba2cf507e9e28d5ba8f971aeab9";
const playwright = "sha256:caa6083aa787e4cfcaa661c73dd6244e4fa38d754dab0cc3b472156b277b0394";
const nginx = "sha256:5f0efd7fead5e8a290f07e5c025e9204052efb646758e1c6883de0e23a6e085c";
const docker = (args, options = {}) => execFileSync("docker", args, { encoding: "utf8", ...options }).trim();
const sha = (buffer) => createHash("sha256").update(buffer).digest("hex");
const uatSnapshot = () => JSON.parse(docker(["inspect", "wordweave_uat-frontend-1", "wordweave_uat-backend-1", "wordweave_uat-nginx-1", "wordweave_uat-postgres-1"])).map((item) => ({
  name: item.Name, id: item.Id, image: item.Image, created: item.Created, started: item.State.StartedAt, running: item.State.Running,
}));

const state = readFileSync(join(root, ".planning/workflow/state.yaml"), "utf8");
if (!/stage: verification/.test(state) || !/active_role: quality\/base/.test(state) || !/active_agent: qa-quinn/.test(state)) throw new Error("QA085 role/stage is not active");
const agents = readFileSync(join(root, ".planning/agt/agents.yaml"), "utf8");
if (!/display_name: "qa-quinn"[\s\S]*status: "active"/.test(agents)) throw new Error("qa-quinn is not the active registry entry");

for (const [image, expectedUser] of [[frontend, "wordweave"], [backend, "nonroot:nonroot"]]) {
  const inspected = JSON.parse(docker(["image", "inspect", image]))[0];
  if (inspected.Id !== image || inspected.Architecture !== "arm64" || inspected.Os !== "linux" || inspected.Config.User !== expectedUser) throw new Error(`Candidate drift: ${image}`);
}
for (const image of [postgres, playwright, nginx]) docker(["image", "inspect", image, "--format", "{{.Id}}"]);

const expectedSource = {
  "backend/internal/httpapi/response.go": "7b3e69b6d2080f2a5086a3f02082c9484028df50ed0c49fac692525a274ed0b2",
  "backend/internal/httpapi/response_test.go": "aa6cc5b757f22ae0bc55d13b579edf6169bb2358c89d0cea0f268b92e2ec7ce1",
  "backend/internal/httpapi/response_no_content_integration_test.go": "497b33fda185eea8d265994d16e2236afa192841cb3915c75706452244123b44",
  "frontend/app/pages/account.vue": "baa32328bcd00f7309f70fa8bc834581046c11e000bbba1fc46fc719b6633583",
  "frontend/app/runtime/stores/account.ts": "6e913bffd238eb24708857f8f1840788f6d38f854a9f1cac54f126555ed6a6c3",
  "frontend/tests/unit/account-password-error.test.ts": "1ed6595371aa16dd04499122234f90ec171665590a5049b0599e9ecf5ea24822",
  "frontend/tests/e2e/cr037-auth-account.spec.ts": "f561c81cf2bbd4a9478009841d447ee3dde7052687b7b3807c1c5ce108468c94",
};
for (const [path, expected] of Object.entries(expectedSource)) if (sha(readFileSync(join(root, path))) !== expected) throw new Error(`Source drift: ${path}`);

const protectedPaths = [
  ".planning/workflow/state.yaml", ".planning/agt/agents.yaml", ".planning/agt/project.yaml", ".planning/agt/model-routing-v1.lock.json",
  ".planning/milestones/M001/reviews/cr037-cr038-continuous-to-uat-approval.md", ".planning/milestones/M001/reviews/cr037-cr038-independent-verification-approval.md",
  ".planning/milestones/M001/implementation/backend-cr038-083-validation.md", ".planning/milestones/M001/implementation/frontend-cr037-084-validation.md",
  ".planning/milestones/M001/implementation/evidence/cr038-083/candidate.json", ".planning/milestones/M001/implementation/evidence/cr037-084/candidate.json",
  ".planning/milestones/M001/technical/api/index.md", ".planning/milestones/M001/technical/frontend.md",
  ".planning/milestones/M001/design/prototype/app.js", ".planning/milestones/M001/design/prototype/i18n.js", ".planning/milestones/M001/design/theme.css",
  ".planning/milestones/M001/design/cr031-cr032-interaction-contract.md", ".planning/milestones/M001/product/abilities.md", ".planning/milestones/M001/product/pages/index.md",
  ...Object.keys(expectedSource),
];
const protectedHashes = Object.fromEntries(protectedPaths.map((path) => [path, sha(readFileSync(join(root, path)))]));

const names = ["db", "provider", "backend", "frontend", "nginx"].map((part) => `${prefix}-${part}`);
const existing = docker(["ps", "-a", "--format", "{{.Names}}"]).split("\n");
if (names.some((name) => existing.includes(name))) throw new Error("Existing QA085 container requires inspection before reuse");
for (const network of [prefix, `${prefix}-edge`]) if (spawnSync("docker", ["network", "inspect", network]).status === 0) throw new Error(`Existing QA085 network: ${network}`);
await new Promise((resolvePromise, reject) => {
  const server = net.createServer();
  server.once("error", reject);
  server.listen(6101, "127.0.0.1", () => server.close(resolvePromise));
});
const uat = uatSnapshot();
if (!uat.every((item) => item.running)) throw new Error("UAT baseline is not fully running");
writeFileSync(join(dir, "baseline.json"), JSON.stringify({ date: new Date().toISOString(), uat, candidates: { frontend, backend, postgres, playwright, nginx }, protectedHashes }, null, 2), { flag: "wx" });

docker(["network", "create", "--internal", "--label", "wordweave.qa=085", prefix]);
docker(["network", "create", "--label", "wordweave.qa=085", `${prefix}-edge`]);
docker(["run", "-d", "--name", `${prefix}-db`, "--network", prefix, "--network-alias", "db", "--label", "wordweave.qa=085", "--tmpfs", "/var/lib/postgresql", "-e", "POSTGRES_HOST_AUTH_METHOD=trust", "-e", "POSTGRES_DB=qa", postgres]);
for (let attempt = 0; attempt < 60; attempt += 1) {
  if (spawnSync("docker", ["exec", `${prefix}-db`, "pg_isready", "-h", "db", "-U", "postgres", "-d", "qa"]).status === 0) break;
  await new Promise((resolvePromise) => setTimeout(resolvePromise, 500));
  if (attempt === 59) throw new Error("QA085 PostgreSQL unavailable");
}
docker(["run", "-d", "--name", `${prefix}-provider`, "--network", prefix, "--network-alias", "provider", "--label", "wordweave.qa=085", "--read-only", "--tmpfs", "/tmp", "-v", `${join(dir, "fake-provider.mjs")}:/tmp/fake-provider.mjs:ro`, "--entrypoint", "node", frontend, "/tmp/fake-provider.mjs"]);

const common = {
  PUBLIC_ORIGIN: "http://127.0.0.1:6101",
  APP_DATABASE_URL: "postgres://postgres@db:5432/qa?sslmode=disable",
  COOKIE_SECURE: "false",
  OPENROUTER_BASE_URL: "http://provider:8888",
  OPENROUTER_MASTER_KEYS: `1:${randomBytes(32).toString("base64")}`,
  OPENROUTER_CURRENT_KEY_VERSION: "1", TRUSTED_PROXY_CIDRS: "0.0.0.0/0", LOG_LEVEL: "warn",
};
for (const key of ["SESSION_PEPPER", "CAPABILITY_PEPPER", "CSRF_HMAC_KEY", "CURSOR_HMAC_KEY"]) common[key] = randomBytes(32).toString("hex");
const envArgs = (values) => Object.entries(values).flatMap(([key, value]) => ["-e", `${key}=${value}`]);
docker(["run", "--rm", "--network", prefix, ...envArgs(common), "--entrypoint", "/usr/local/bin/wordweave-admin", backend, "migrate"]);
docker(["exec", "-i", `${prefix}-db`, "psql", "-U", "postgres", "-d", "qa", "-v", "ON_ERROR_STOP=1"], { input: "ALTER ROLE wordweave_app LOGIN; ALTER ROLE wordweave_ai LOGIN;" });
docker(["run", "--rm", "--network", prefix, ...envArgs({ ...common, ADMIN_USERNAME: "qa085_admin", ADMIN_PASSWORD: "Qa085AdminSyntheticOnly!" }), "--entrypoint", "/usr/local/bin/wordweave-admin", backend, "create-admin"]);
docker(["run", "-d", "--name", `${prefix}-backend`, "--label", "wordweave.qa=085", "--network", prefix, "--network-alias", "backend", ...envArgs({ ...common, APP_DATABASE_URL: "postgres://wordweave_app@db:5432/qa?sslmode=disable", AI_DATABASE_URL: "postgres://wordweave_ai@db:5432/qa?sslmode=disable" }), backend]);
docker(["run", "-d", "--name", `${prefix}-frontend`, "--label", "wordweave.qa=085", "--network", prefix, "--network-alias", "frontend", "-e", "NUXT_BACKEND_INTERNAL_ORIGIN=http://backend:8080", frontend]);
docker(["run", "-d", "--name", `${prefix}-nginx`, "--label", "wordweave.qa=085", "--network", `${prefix}-edge`, "-p", "127.0.0.1:6101:8080", ...envArgs({ NGINX_LISTEN_PORT: "8080", BACKEND_HOST: "backend", BACKEND_PORT: "8080", FRONTEND_HOST: "frontend", FRONTEND_PORT: "3000" }), nginx]);
docker(["network", "connect", prefix, `${prefix}-nginx`]);
docker(["restart", `${prefix}-nginx`]);
let ready = false;
for (let attempt = 0; attempt < 90; attempt += 1) {
  try { if ((await fetch("http://127.0.0.1:6101/api/v1/bootstrap")).ok) { ready = true; break; } } catch {}
  await new Promise((resolvePromise) => setTimeout(resolvePromise, 500));
}
if (!ready) throw new Error("QA085 edge unavailable");
writeFileSync(join(dir, "environment.json"), JSON.stringify({
  date: new Date().toISOString(), origin: "http://127.0.0.1:6101", prefix,
  candidates: { frontend, backend, postgres, playwright, nginx },
  uatUnchanged: JSON.stringify(uatSnapshot()) === JSON.stringify(uat),
  provider: "isolated synthetic fixture on internal network; no external provider or historical credentials",
}, null, 2), { flag: "wx" });
console.log("QA085 isolated stack ready on 6101; UAT unchanged.");
