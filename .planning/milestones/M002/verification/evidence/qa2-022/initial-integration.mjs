import { readFileSync } from 'node:fs';
import { chromium, expect, origin, out, dump, ok, raw, login, ready, t, password, providerStats, sql } from './harness.mjs';
const fixture = JSON.parse(readFileSync(new URL('fixture.json', out)));
const browser = await chromium.launch();
const learner = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'en-US' });
const admin = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'en-US' });
const results = [], runtime = [], samples = [];
let action = '', page = await learner.newPage(), batchId;
function track(p) {
  p.setDefaultTimeout(12000);
  p.on('pageerror', error => runtime.push({ action, kind: 'pageerror', text: error.message }));
  p.on('console', message => { if (['error', 'warning'].includes(message.type())) runtime.push({ action, kind: message.type(), text: message.text() }); });
}
track(page);
async function test(id, name, fn) {
  action = id;
  const start = Date.now();
  try { await fn(); results.push({ id, name, result: 'PASS', duration_ms: Date.now() - start }); }
  catch (e) { results.push({ id, name, result: 'FAIL', duration_ms: Date.now() - start, error: String(e) }); }
  dump('results.json', { results, runtime, samples, screenshotsSaved: 0, imagesSentToModel: 0, provider: await providerStats() });
  console.log(id, results.at(-1).result, results.at(-1).error ?? '');
}
const button = key => page.getByRole('button', { name: t(key), exact: true });
try {
  await test('INT22-01', 'Guest generation, browser registration and one persisted batch/check-in', async () => {
    await page.goto(origin + '/trial/' + fixture.presetId); await ready(page);
    const before = (await ok(learner, '/generation-options')).quota;
    const calls = (await providerStats()).localProviderCalls;
    await button('start').click(); await expect(button('guestcollect')).toBeVisible();
    expect((await ok(learner, '/generation-options')).quota.remaining).toBe(before.remaining - 1);
    await button('guestcollect').click(); await expect(page).toHaveURL(/\/login\?claim=1/);
    await page.locator('.auth-form a[href^="/register"]').click();
    await page.locator('input[autocomplete="username"]').fill('learner_review');
    await page.locator('input[type="password"]').nth(0).fill(password);
    await page.locator('input[type="password"]').nth(1).fill(password);
    await page.locator('form button[type="submit"]').click();
    await expect(page).toHaveURL(/\/library\/[a-f0-9-]+/); await ready(page);
    batchId = page.url().split('/').at(-1);
    await expect(page.locator('.batch-title')).toHaveText('learn · weave · book');
    await page.reload(); await ready(page); await expect(page.locator('.batch-title')).toHaveText('learn · weave · book');
    expect((await ok(learner, '/me/batches')).items).toHaveLength(1);
    expect((await ok(learner, '/generation-options')).quota.remaining).toBe(50);
    expect((await ok(learner, '/me/growth')).checkin.signed_today).toBe(true);
    expect((await providerStats()).localProviderCalls).toBe(calls + 1);
    const accountId = (await ok(learner, '/bootstrap')).actor.id;
    expect(Number(sql("SELECT count(*) FROM wordweave.accounts WHERE username='learner_review'"))).toBe(1);
    samples.push({ action, batchId, accountId, savedBatches: 1, guestCharge: 1, learnerRemaining: 50, signedToday: true, reloadPersisted: true, authExtraProviderCalls: 0 });
    dump('learner.json', { username: 'learner_review', batchId, accountId });
  });
  if (batchId) await test('INT22-02', 'Persist title, edit partial review through overview, settle and discard comparisons', async () => {
    await button('l.title.edit').click(); await page.locator('#batch-title').fill('My first learning session');
    await button('l.title.save').click(); await expect(page.locator('.batch-title')).toHaveText('My first learning session');
    await page.reload(); await ready(page); await expect(page.locator('.batch-title')).toHaveText('My first learning session');
    expect((await ok(learner, '/me/batches')).items[0].title).toBe('My first learning session');
    await button('l.single').click(); await expect(page).toHaveURL(/\/review\/[a-f0-9-]+/);
    await expect(page.locator('.slot').first()).toBeVisible();
    await page.locator('.slot').first().fill('x'); await button('next').click();
    await button('skip').click(); await button('skip').click();
    await expect(page.locator('.gap')).toHaveCount(5);
    await page.locator('.gap').first().fill('wrong'); await button('next').click();
    await expect(button('submit')).toBeVisible();
    await expect(page.locator('.review-paper > .answer-row .answer-link').first()).toHaveText('x');
    const words = { 'gain knowledge through study': 'learn', 'combine into a connected whole': 'weave', 'a written collection of pages': 'book' };
    for (let i = 0; i < 3; i++) {
      await page.locator('.review-paper > .answer-row .answer-link').nth(i).click();
      const meaning = await page.locator('section.hint p').first().textContent();
      const word = words[meaning.trim()]; expect(word).toBeTruthy();
      await expect(page.locator('.slot')).toHaveCount(word.length);
      for (const [n, letter] of [...word].entries()) await page.locator('.slot').nth(n).fill(letter);
      await button('next').click(); await expect(button('submit')).toBeVisible();
    }
    await page.locator('[data-region="passage"] .answer-link').first().click();
    for (const [i, word] of ['learns', 'learning', 'learned', 'weave', 'book'].entries()) await page.locator('.gap').nth(i).fill(word);
    await button('next').click();
    const pending = page.waitForResponse(r => r.request().method() === 'POST' && r.url().endsWith('/submit'));
    await button('submit').click(); const response = await pending;
    expect(response.status()).toBe(200); const data = (await response.json()).data;
    expect(data.receipt.successful).toBe(true); expect(data.growth.new_masteries).toBe(3);
    expect(data.comparison.words.every(x => x.result === 'correct')).toBe(true);
    expect(data.comparison.passage_segments.filter(x => x.kind === 'answer').every(x => x.result === 'correct')).toBe(true);
    await expect(page.locator('.result-word')).toHaveCount(8);
    expect((await ok(learner, '/me/growth')).mastered_total).toBe(3);
    await page.reload(); await ready(page); await expect(page.locator('.result-word')).toHaveCount(0);
    await expect(page.getByText(t('l.summary.unavailable'), { exact: true })).toBeVisible();
    const read = await ok(learner, '/me/review-attempts/' + data.receipt.attempt_id);
    expect(read.state).toBe('submitted'); expect(read.comparison).toBeUndefined(); expect(read.attempt).toBeUndefined();
    const fresh = await browser.newContext(); await login(fresh, 'learner_review');
    const restored = (await ok(fresh, '/me/batches/' + batchId)).batch;
    expect(restored.title).toBe('My first learning session'); expect(restored.review_summary.successful_count).toBe(1);
    expect((await ok(fresh, '/me/growth')).mastered_total).toBe(3); await fresh.close();
    samples.push({ action, titlePersistedAcrossSession: true, partialAndWrongAdvanced: true, overviewEdited: true, attemptId: data.receipt.attempt_id, newMasteries: 3, successfulCount: 1, comparisonsAbsentAfterReload: true });
  });
  await test('INT22-03', 'Admin model edit persists, live options update, saved snapshot and permissions remain', async () => {
    await login(admin); const adminPage = await admin.newPage(); track(adminPage);
    await adminPage.goto(origin + '/admin/models'); await ready(adminPage);
    const row = adminPage.locator('tbody tr').filter({ hasText: fixture.modelName });
    await row.getByRole('button', { name: t('a.edit'), exact: true }).click();
    await adminPage.locator('#model-form input').nth(0).fill('Local sample model — updated');
    await adminPage.locator('button[form="model-form"]').click();
    await expect(adminPage.locator('tbody tr').filter({ hasText: 'Local sample model — updated' })).toBeVisible();
    await adminPage.reload(); await ready(adminPage);
    await expect(adminPage.locator('tbody tr').filter({ hasText: 'Local sample model — updated' })).toBeVisible();
    const options = await ok(learner, '/generation-options');
    expect(options.models.find(x => x.id === fixture.modelId).name).toBe('Local sample model — updated');
    if (batchId) expect((await ok(learner, '/me/batches/' + batchId)).batch.configuration.model.name).toBe(fixture.modelName);
    expect((await raw(learner, '/admin/models')).status()).toBe(403);
    samples.push({ action, liveModelName: 'Local sample model — updated', frozenBatchModelName: fixture.modelName, learnerAdminStatus: 403, adminReloadPersisted: true });
  });
  expect(runtime).toEqual([]);
} catch (error) { results.push({ id: 'RUNTIME', result: 'FAIL', error: String(error) }); }
finally {
  dump('results.json', { results, runtime, samples, screenshotsSaved: 0, imagesSentToModel: 0, provider: await providerStats() });
  await browser.close();
  if (results.some(x => x.result === 'FAIL') || results.length !== 3) process.exitCode = 1;
}
