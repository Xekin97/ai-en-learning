import { chromium, expect } from '/tmp/wordweave-m003-uat-real-003/frontend/node_modules/@playwright/test/index.mjs';
import fs from 'node:fs';

const origin = 'http://127.0.0.1:3015';
const runtime = '/tmp/wordweave-m003-uat-real-003';
const evidence = new URL('.', import.meta.url).pathname;
const accounts = JSON.parse(fs.readFileSync(`${runtime}/uat-accounts.json`, 'utf8'));
const browser = await chromium.launch({ headless: true });
const checks = [];
const failures = [];
const apiRequests = [];

async function create(locale = 'en-US', viewport = { width: 1440, height: 1000 }, reducedMotion = 'no-preference') {
  const context = await browser.newContext({ locale, viewport, reducedMotion });
  const page = await context.newPage();
  page.on('pageerror', error => failures.push({ type: 'pageerror', message: error.message }));
  page.on('requestfailed', request => failures.push({ type: 'requestfailed', path: new URL(request.url()).pathname, reason: request.failure()?.errorText }));
  page.on('response', response => {
    const url = new URL(response.url());
    if (url.pathname.startsWith('/api/v1/')) apiRequests.push({ method: response.request().method(), path: url.pathname, status: response.status() });
  });
  return { context, page };
}

async function ready(page, path) {
  const response = await page.goto(origin + path);
  expect(response.status()).toBe(200);
  await page.waitForFunction(() => document.documentElement.dataset.appReady === 'true');
}

async function login(role, destination) {
  const { context, page } = await create('zh-CN');
  await ready(page, '/login');
  await page.locator('input[name="username"]').fill(accounts[`${role}_USERNAME`]);
  await page.locator('input[name="password"]').fill(accounts[`${role}_PASSWORD`]);
  await page.locator('form button[type="submit"]').click();
  await expect(page).not.toHaveURL(/\/login/);
  await ready(page, destination);
  return { context, page };
}

try {
  const desktop = await create();
  await ready(desktop.page, '/create');
  await expect(desktop.page.locator('#create-words-search')).toBeVisible();
  await expect(desktop.page.getByText('Your story starts with a few words', { exact: true })).toBeVisible();
  await expect(desktop.page.getByText('Your story will appear here.', { exact: true })).toBeVisible();
  await desktop.page.getByRole('combobox', { name: 'AI model', exact: true }).click();
  await desktop.page.getByRole('option', { name: 'DeepSeek V4 Flash', exact: true }).click();
  await desktop.page.getByRole('combobox', { name: 'Explanation language', exact: true }).click();
  await desktop.page.getByRole('option', { name: 'Chinese', exact: true }).click();
  await desktop.page.locator('#create-words-search').fill('theater');
  await desktop.page.getByRole('option', { name: 'theater', exact: true }).click();
  await expect(desktop.page.getByRole('button', { name: 'Generate story', exact: true })).toBeEnabled();
  const layout = await desktop.page.evaluate(() => {
    const resultElement = document.querySelector('#generation-status');
    const settings = resultElement?.previousElementSibling?.getBoundingClientRect();
    const result = resultElement?.getBoundingClientRect();
    return settings && result ? { settingsLeft: settings.left, settingsRight: settings.right, resultLeft: result.left, resultWidth: result.width } : null;
  });
  expect(layout).not.toBeNull();
  expect(layout.resultWidth).toBeGreaterThan(300);
  await desktop.page.screenshot({ path: `${evidence}/create-desktop-ready.png`, fullPage: true });
  checks.push({ case: 'visitor_create_current_copy_layout_and_real_options', result: 'PASS', generationClicked: false, layout });
  await desktop.context.close();

  const reduced = await create('en-US', { width: 1440, height: 1000 }, 'reduce');
  await ready(reduced.page, '/create');
  const motion = await reduced.page.evaluate(() => {
    const style = getComputedStyle(document.documentElement);
    return {
      enter: style.getPropertyValue('--m003-motion-enter').trim(),
      replace: style.getPropertyValue('--m003-motion-replace').trim(),
      exit: style.getPropertyValue('--m003-motion-exit').trim(),
      final: style.getPropertyValue('--m003-motion-final').trim(),
      status: style.getPropertyValue('--m003-motion-status').trim(),
    };
  });
  expect(motion).toEqual({ enter: '1ms', replace: '1ms', exit: '1ms', final: '1ms', status: '1ms' });
  checks.push({ case: 'reduced_motion_current_css_contract', result: 'PASS', motion });
  await reduced.context.close();

  for (const role of ['BASIC', 'PRO']) {
    const session = await login(role, '/create');
    await expect(session.page.locator('#create-words-search')).toBeVisible();
    await expect(session.page.locator('body')).not.toContainText('Unable to load');
    checks.push({ case: `${role.toLowerCase()}_real_password_form_login`, result: 'PASS' });
    await session.context.close();
  }

  const admin = await login('ADMIN', '/admin/models');
  for (const model of ['deepseek/deepseek-v4.1-flash', 'mimo-v2.6-pro', 'mimo-v2.6-flash']) {
    await expect(admin.page.locator('body')).toContainText(model);
  }
  await expect(admin.page.locator('.generic-model-row')).toHaveCount(3);
  await admin.page.screenshot({ path: `${evidence}/admin-models-readonly.png`, fullPage: true });
  checks.push({ case: 'admin_real_password_form_login_models_readonly', result: 'PASS', models: 3, modelActionClicked: false });
  await admin.context.close();

  const mobile = await create('zh-CN', { width: 390, height: 844 });
  await ready(mobile.page, '/create');
  await expect(mobile.page.locator('#create-words-search')).toBeVisible();
  const mobileMetrics = await mobile.page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, viewportWidth: innerWidth }));
  expect(mobileMetrics.scrollWidth).toBeLessThanOrEqual(mobileMetrics.viewportWidth);
  await mobile.page.screenshot({ path: `${evidence}/create-mobile-ready.png`, fullPage: true });
  checks.push({ case: 'mobile_create_no_horizontal_overflow', result: 'PASS', ...mobileMetrics });
  await mobile.context.close();

  expect(apiRequests.filter(item => item.status >= 400)).toEqual([]);
  const prohibited = apiRequests.filter(item => /generations|preview|connection.*test|probe/i.test(item.path));
  expect(prohibited).toEqual([]);
} catch (error) {
  failures.push({ type: 'assertion', message: error.message });
  process.exitCode = 1;
} finally {
  await browser.close();
  const result = {
    result: failures.length ? 'FAIL' : 'PASS', checkedAt: new Date().toISOString(), origin,
    checks, failures, apiRequests, apiInterception: false, mockedResponses: 0,
    realGenerationExecuted: false, providerProbeExecuted: false,
  };
  fs.writeFileSync(`${evidence}/live-browser-readiness.json`, JSON.stringify(result, null, 2) + '\n', { mode: 0o600 });
  console.log(JSON.stringify({ result: result.result, checks: checks.length, failures }));
}
