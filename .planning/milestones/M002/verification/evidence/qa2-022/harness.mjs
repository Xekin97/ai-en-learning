import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
export const { chromium, expect } = createRequire(process.cwd() + '/frontend/package.json')('@playwright/test');
export const out = new URL('./', import.meta.url), origin = 'http://127.0.0.1:3302';
export const work = readFileSync('/tmp/wordweave-m002-integrated-current', 'utf8');
const env = JSON.parse(readFileSync(work + '/env.json'));
if (env.APP_DATABASE_URL !== 'postgres://review_test@127.0.0.1:63542/wordweave_review_m002?sslmode=disable' || env.OPENROUTER_BASE_URL !== 'http://127.0.0.1:38084') throw Error('Disposable local stack required');
export const password = 'ReviewLocal2026!';
export const dump = (name, data) => writeFileSync(new URL(name, out), JSON.stringify(data, null, 2) + '\n');
export const sql = query => execFileSync('/opt/homebrew/opt/postgresql@18/bin/psql', [env.APP_DATABASE_URL, '-X', '-v', 'ON_ERROR_STOP=1', '-A', '-t', '-c', query], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const copy = JSON.parse(readFileSync('.planning/milestones/M002/design/copy.json'));
export const t = key => copy.static['en.' + key] ?? copy.templates['en.' + key];
export const ready = page => page.waitForFunction(() => document.documentElement.dataset.appReady === 'true');
export async function raw(context, path, method = 'GET', data) {
  const headers = { origin, 'sec-fetch-site': 'same-origin' };
  if (method !== 'GET') headers['x-csrf-token'] = (await (await context.request.get(origin + '/api/v1/bootstrap')).json()).data.csrf_token;
  return context.request.fetch(origin + '/api/v1' + path, { method, data, headers });
}
export async function ok(...args) {
  const response = await raw(...args);
  if (response.status() < 200 || response.status() >= 300) throw Error(args[1] + ': ' + response.status() + ' ' + await response.text());
  return response.status() === 204 ? null : (await response.json()).data;
}
export const login = (context, username = 'admin_review') => ok(context, '/auth/login', 'POST', { username, password, browser_ui_locale: 'en-US' });
export const providerStats = () => fetch('http://127.0.0.1:38084/stats').then(r => r.json());
