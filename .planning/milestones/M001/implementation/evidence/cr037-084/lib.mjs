import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export { chromium, webkit, expect, request } from "../../../../../../frontend/node_modules/@playwright/test/index.mjs";
export const dir = dirname(fileURLToPath(import.meta.url));
export const origin = "http://127.0.0.1:6101";
export const password = "Qa084SyntheticOnly!";
export const sql = (statement) =>
  execFileSync(
    "docker",
    [
      "exec",
      "-i",
      "ww-dev-084-db",
      "psql",
      "-U",
      "postgres",
      "-d",
      "qa",
      "-X",
      "-A",
      "-t",
      "-v",
      "ON_ERROR_STOP=1",
    ],
    { input: statement, encoding: "utf8" },
  ).trim();
export async function api(context, method, path, csrf, data) {
  const response = await context.request.fetch(origin + path, {
    method,
    headers: {
      origin,
      "sec-fetch-site": "same-origin",
      ...(csrf ? { "x-csrf-token": csrf } : {}),
    },
    ...(data === undefined ? {} : { data }),
  });
  return {
    status: response.status(),
    headers: response.headers(),
    body: response.status() === 204 ? null : await response.json(),
  };
}
export function recorder(name) {
  const checks = [];
  return {
    checks,
    record(id, actual, expected) {
      checks.push({
        id,
        status: JSON.stringify(actual) === JSON.stringify(expected) ? "PASS" : "FAIL",
        actual,
        expected,
      });
    },
    error(id, error) {
      checks.push({ id, status: "ERROR", error: String(error) });
    },
    save(extra = {}) {
      const counts = { PASS: 0, FAIL: 0, ERROR: 0 };
      for (const check of checks) counts[check.status]++;
      writeFileSync(
        join(dir, `${name}-results.json`),
        JSON.stringify(
          { date: new Date().toISOString(), agent: "frontend-claire", counts, checks, ...extra },
          null,
          2,
        ),
        { flag: "wx" },
      );
      console.log(JSON.stringify({ name, counts }));
      if (counts.FAIL || counts.ERROR) process.exitCode = 1;
    },
  };
}
