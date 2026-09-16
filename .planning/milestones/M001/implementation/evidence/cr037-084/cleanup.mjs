import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { sql } from "./lib.mjs";

const dir = dirname(fileURLToPath(import.meta.url));
const docker = (args) => execFileSync("docker", args, { encoding: "utf8" }).trim();
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

const data = JSON.parse(
  sql(
    "SELECT json_build_object('accounts',(SELECT count(*) FROM wordweave.accounts),'credentials',(SELECT count(*) FROM wordweave.openrouter_credentials),'generation_runs',(SELECT count(*) FROM wordweave.generation_runs),'learning_batches',(SELECT count(*) FROM wordweave.learning_batches),'review_sessions',(SELECT count(*) FROM wordweave.review_sessions));",
  ),
);
if (data.credentials || data.generation_runs || data.learning_batches || data.review_sessions)
  throw new Error("Unexpected non-account test data in DEV084 database");

const realNames = ["nginx", "frontend", "backend", "db"].map(
  (part) => `ww-dev-084-${part}`,
);
const mockNames = ["mock-backend", "mock-edge", "mock-app"].map(
  (part) => `ww-dev-084-${part}`,
);
for (const name of realNames) {
  const label = JSON.parse(docker(["inspect", name]))[0].Config.Labels["wordweave.dev"];
  if (label !== "084") throw new Error(`Unowned container ${name}`);
}
for (const name of mockNames) {
  const label = JSON.parse(docker(["inspect", name]))[0].Config.Labels["wordweave.dev"];
  if (label !== "084-mock") throw new Error(`Unowned mock container ${name}`);
}
for (const name of [...mockNames, ...realNames]) docker(["rm", "-f", name]);
for (const name of ["ww-dev-084", "ww-dev-084-edge"]) {
  const label = JSON.parse(docker(["network", "inspect", name]))[0].Labels[
    "wordweave.dev"
  ];
  if (label !== "084") throw new Error(`Unowned network ${name}`);
  docker(["network", "rm", name]);
}
const baseline = JSON.parse(readFileSync(join(dir, "baseline.json"), "utf8"));
const uat = snapshot();
const port6101Released = await new Promise((resolve) => {
  const server = createServer();
  server.once("error", () => resolve(false));
  server.listen(6101, "127.0.0.1", () => server.close(() => resolve(true)));
});
const result = {
  date: new Date().toISOString(),
  data,
  removedContainers: [...mockNames, ...realNames],
  removedNetworks: ["ww-dev-084", "ww-dev-084-edge"],
  removedVolume: spawnSync("docker", ["volume", "inspect", "ww-dev-084-e2e-work"]).status === 1,
  uatUnchanged: JSON.stringify(uat) === JSON.stringify(baseline.uat),
  port6101Released,
  retainedImages: [
    "wordweave-frontend:cr037-084",
    "wordweave-backend:cr038-083",
  ],
  dataRecovery:
    "Only six synthetic DEV084 accounts in tmpfs PostgreSQL were destroyed; setup and browser scripts reproduce them. UAT data, passwords, containers and images were preserved.",
};
writeFileSync(join(dir, "cleanup.json"), JSON.stringify(result, null, 2), {
  flag: "wx",
});
console.log(JSON.stringify(result));
if (!result.uatUnchanged || !result.port6101Released || !result.removedVolume)
  process.exitCode = 1;
