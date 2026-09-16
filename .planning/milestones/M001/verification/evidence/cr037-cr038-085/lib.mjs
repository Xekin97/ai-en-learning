import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export { chromium, webkit, expect, request } from "../../../../../../frontend/node_modules/@playwright/test/index.mjs";
export const dir = dirname(fileURLToPath(import.meta.url));
export const origin = "http://127.0.0.1:6101";
export const password = "Qa085SyntheticOnly!";
export const adminUsername = "qa085_admin";
export const adminPassword = "Qa085AdminSyntheticOnly!";
export const sql = (statement) => execFileSync("docker", [
  "exec", "-i", "ww-qa-085-db", "psql", "-U", "postgres", "-d", "qa",
  "-X", "-A", "-t", "-v", "ON_ERROR_STOP=1",
], { input: statement, encoding: "utf8" }).trim();

export async function bootstrap(context) {
  return (await (await context.request.get(`${origin}/api/v1/bootstrap`)).json()).data;
}

export async function api(context, method, path, csrf, data, headers = {}) {
  const response = await context.request.fetch(origin + path, {
    method,
    headers: {
      origin,
      "sec-fetch-site": "same-origin",
      ...(csrf ? { "x-csrf-token": csrf } : {}),
      ...headers,
    },
    ...(data === undefined ? {} : { data }),
  });
  const raw = await response.body();
  let body = null;
  if (raw.length) {
    try { body = JSON.parse(raw.toString("utf8")); } catch { body = raw.toString("utf8"); }
  }
  return { status: response.status(), headers: response.headers(), raw, body };
}

export async function register(context, username, locale = "en-US", secret = password) {
  const initial = await bootstrap(context);
  return api(context, "POST", "/api/v1/auth/register", initial.csrf_token, {
    username, password: secret, password_confirmation: secret, ui_locale: locale,
  });
}

export async function login(context, username, secret, locale = "en-US") {
  const initial = await bootstrap(context);
  return api(context, "POST", "/api/v1/auth/login", initial.csrf_token, {
    username, password: secret, browser_ui_locale: locale,
  });
}

export function recorder(name) {
  const checks = [];
  return {
    checks,
    record(id, actual, expected) {
      checks.push({ id, status: JSON.stringify(actual) === JSON.stringify(expected) ? "PASS" : "FAIL", actual, expected });
    },
    error(id, error) { checks.push({ id, status: "ERROR", error: String(error?.stack || error) }); },
    save(extra = {}) {
      const counts = { PASS: 0, FAIL: 0, ERROR: 0 };
      for (const check of checks) counts[check.status] += 1;
      writeFileSync(join(dir, `${name}-results.json`), JSON.stringify({ date: new Date().toISOString(), agent: "qa-quinn", counts, checks, ...extra }, null, 2), { flag: "wx" });
      console.log(JSON.stringify({ name, counts }));
      if (counts.FAIL || counts.ERROR) process.exitCode = 1;
    },
  };
}
