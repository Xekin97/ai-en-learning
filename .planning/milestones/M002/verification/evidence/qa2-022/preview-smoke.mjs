import { readFileSync } from 'node:fs';
import { chromium, expect, origin, out, ok, ready, password, dump } from './harness.mjs';
const fixture = JSON.parse(readFileSync(new URL('fixture.json', out)));
const learner = JSON.parse(readFileSync(new URL('learner.json', out)));
const b = await chromium.launch(), results = [];
try {
  const guest = await b.newContext(), p = await guest.newPage();
  await p.goto(origin + '/trial/' + fixture.presetId); await ready(p);
  await expect(p.locator('.trial-settings')).toBeVisible();
  results.push({ identity: 'guest', result: 'PASS', route: '/trial/' + fixture.presetId });
  for (const username of ['learner_review', 'admin_review']) {
    const c = await b.newContext(), page = await c.newPage();
    await page.goto(origin + '/login'); await ready(page);
    await page.locator('input[autocomplete="username"]').fill(username);
    await page.locator('input[type="password"]').fill(password);
    const response = page.waitForResponse(r => r.request().method() === 'POST' && r.url().endsWith('/auth/login'));
    await page.locator('form button[type="submit"]').click(); expect((await response).status()).toBe(200);
    await expect(page).not.toHaveURL(/\/login/);
    const route = username.startsWith('admin') ? '/admin/models' : '/library/' + learner.batchId;
    await page.goto(origin + route); await ready(page);
    if (username.startsWith('learner')) {
      await expect(page.locator('.batch-title')).toHaveText('My first learning session');
      expect((await ok(c, '/me/growth')).mastered_total).toBe(3);
    } else await expect(page.locator('tbody tr').filter({ hasText: 'Local review model' })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
    results.push({ identity: username, route, result: 'PASS', locale: 'zh-CN', afterBackendAndDatabaseRestart: true });
    await c.close();
  }
} finally { dump('preview-smoke.json', { results, screenshots: 0 }); await b.close(); }
