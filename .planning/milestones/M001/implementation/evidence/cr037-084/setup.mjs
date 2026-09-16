import { execFileSync, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import net from "node:net";

const dir = dirname(fileURLToPath(import.meta.url));
const prefix = "ww-dev-084";
const frontend =
  "sha256:fd251e7439aad8e058656e2751ed84f40715fec570a872da53542688a6dd6904";
const backend =
  "sha256:642ed57ad0ed6c8a13e4bba1101d8b50188e8ea636791583a6ffb5eaa6917aac";
const postgres =
  "sha256:b85269e8c6aa961524542eb4dcca44c4aa1deba2cf507e9e28d5ba8f971aeab9";
const docker = (args, options = {}) =>
  execFileSync("docker", args, { encoding: "utf8", ...options }).trim();
const snapshot = () =>
  JSON.parse(
    docker([
      "inspect",
      "wordweave_uat-frontend-1",
      "wordweave_uat-backend-1",
      "wordweave_uat-nginx-1",
      "wordweave_uat-postgres-1",
    ]),
  ).map((item) => ({
    name: item.Name,
    id: item.Id,
    image: item.Image,
    started: item.State.StartedAt,
  }));

const names = ["db", "backend", "frontend", "nginx"].map(
  (part) => `${prefix}-${part}`,
);
const existing = docker(["ps", "-a", "--format", "{{.Names}}"]).split("\n");
if (names.some((name) => existing.includes(name)))
  throw new Error("Existing DEV084 container requires inspection before reuse");
for (const network of [prefix, `${prefix}-edge`]) {
  if (spawnSync("docker", ["network", "inspect", network]).status === 0)
    throw new Error(`Existing DEV084 network: ${network}`);
}
await new Promise((resolve, reject) => {
  const server = net.createServer();
  server.once("error", reject);
  server.listen(6101, "127.0.0.1", () => server.close(resolve));
});

const uat = snapshot();
writeFileSync(
  join(dir, "baseline.json"),
  JSON.stringify({ date: new Date().toISOString(), uat }, null, 2),
  { flag: "wx" },
);
docker(["network", "create", "--internal", "--label", "wordweave.dev=084", prefix]);
docker([
  "network",
  "create",
  "--label",
  "wordweave.dev=084",
  `${prefix}-edge`,
]);
docker([
  "run",
  "-d",
  "--name",
  `${prefix}-db`,
  "--network",
  prefix,
  "--network-alias",
  "db",
  "--label",
  "wordweave.dev=084",
  "--tmpfs",
  "/var/lib/postgresql",
  "-e",
  "POSTGRES_HOST_AUTH_METHOD=trust",
  "-e",
  "POSTGRES_DB=qa",
  postgres,
]);
for (let attempt = 0; attempt < 60; attempt++) {
  try {
    docker(["exec", `${prefix}-db`, "pg_isready", "-h", "db", "-U", "postgres", "-d", "qa"]);
    break;
  } catch {
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

const common = {
  PUBLIC_ORIGIN: "http://127.0.0.1:6101",
  APP_DATABASE_URL: "postgres://postgres@db:5432/qa?sslmode=disable",
  COOKIE_SECURE: "false",
  OPENROUTER_BASE_URL: "http://127.0.0.1:9/disabled",
  OPENROUTER_MASTER_KEYS: `1:${randomBytes(32).toString("base64")}`,
  OPENROUTER_CURRENT_KEY_VERSION: "1",
  TRUSTED_PROXY_CIDRS: "0.0.0.0/0",
  LOG_LEVEL: "warn",
};
for (const key of [
  "SESSION_PEPPER",
  "CAPABILITY_PEPPER",
  "CSRF_HMAC_KEY",
  "CURSOR_HMAC_KEY",
])
  common[key] = randomBytes(32).toString("hex");
const envArgs = (values) =>
  Object.entries(values).flatMap(([key, value]) => ["-e", `${key}=${value}`]);

docker([
  "run",
  "--rm",
  "--network",
  prefix,
  ...envArgs(common),
  "--entrypoint",
  "/usr/local/bin/wordweave-admin",
  backend,
  "migrate",
]);
docker(
  [
    "exec",
    "-i",
    `${prefix}-db`,
    "psql",
    "-U",
    "postgres",
    "-d",
    "qa",
    "-v",
    "ON_ERROR_STOP=1",
  ],
  { input: "ALTER ROLE wordweave_app LOGIN; ALTER ROLE wordweave_ai LOGIN;" },
);
docker([
  "run",
  "-d",
  "--name",
  `${prefix}-backend`,
  "--label",
  "wordweave.dev=084",
  "--network",
  prefix,
  "--network-alias",
  "backend",
  ...envArgs({
    ...common,
    APP_DATABASE_URL: "postgres://wordweave_app@db:5432/qa?sslmode=disable",
    AI_DATABASE_URL: "postgres://wordweave_ai@db:5432/qa?sslmode=disable",
  }),
  backend,
]);
docker([
  "run",
  "-d",
  "--name",
  `${prefix}-frontend`,
  "--label",
  "wordweave.dev=084",
  "--network",
  prefix,
  "--network-alias",
  "frontend",
  "-e",
  "NUXT_BACKEND_INTERNAL_ORIGIN=http://backend:8080",
  frontend,
]);
docker([
  "run",
  "-d",
  "--name",
  `${prefix}-nginx`,
  "--label",
  "wordweave.dev=084",
  "--network",
  `${prefix}-edge`,
  "-p",
  "127.0.0.1:6101:8080",
  ...envArgs({
    NGINX_LISTEN_PORT: "8080",
    BACKEND_HOST: "backend",
    BACKEND_PORT: "8080",
    FRONTEND_HOST: "frontend",
    FRONTEND_PORT: "3000",
  }),
  "wordweave_uat-nginx:latest",
]);
docker(["network", "connect", prefix, `${prefix}-nginx`]);
docker(["restart", `${prefix}-nginx`]);
let healthy = false;
for (let attempt = 0; attempt < 60; attempt++) {
  try {
    const response = await fetch("http://127.0.0.1:6101/api/v1/bootstrap");
    if (response.ok) {
      healthy = true;
      break;
    }
  } catch {}
  await new Promise((resolve) => setTimeout(resolve, 500));
}
if (!healthy) throw new Error("DEV084 edge unavailable");
writeFileSync(
  join(dir, "environment.json"),
  JSON.stringify(
    {
      date: new Date().toISOString(),
      origin: "http://127.0.0.1:6101",
      frontend,
      backend,
      postgres,
      uatUnchanged: JSON.stringify(snapshot()) === JSON.stringify(uat),
      provider: "disabled; no credentials; backend on internal network",
    },
    null,
    2,
  ),
  { flag: "wx" },
);
console.log("DEV084 isolated stack ready on 6101; UAT unchanged.");
