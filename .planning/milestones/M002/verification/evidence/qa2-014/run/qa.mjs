import { readFileSync } from 'node:fs';
import { chromium, firefox, webkit, expect, start, stop, ok, call, sql, origin, out, dump, ready, env } from './harness.mjs';
import { stream, runCall, terminal } from './api-support.mjs';
import { startProvider } from './provider-fixed.mjs';

const fixture = JSON.parse(readFileSync(new URL('input.json', out))).fixture;
const copy = JSON.parse(readFileSync('.planning/milestones/M002/design/copy.json'));
const text = (lang, key) => copy.static[`${lang}.${key}`] ?? copy.templates[`${lang}.${key}`];
const username = sql(`SELECT username FROM wordweave.accounts WHERE id='${fixture.owner}'`);
const results = [], samples = [], runtime = [], requests = [], responses = [], browserVersions = [];
let browser, provider, page, action = 'SETUP', expectedHTTP = [];
const hash = id => sql(`SELECT md5(to_jsonb(b)::text) FROM wordweave.learning_batches b WHERE id='${id}'`);
const stable = id => sql(`SELECT md5((to_jsonb(b)-'title'-'title_revision')::text) FROM wordweave.learning_batches b WHERE id='${id}'`);
const flush = () => dump('results.json', { results, samples, runtime, requests, responses, browserVersions, localProviderCalls: provider?.calls ?? 0, realProviderCalls: 0 });
function observe(p) {
  p.setDefaultTimeout(12000);
  p.on('console', m => { if (['warning', 'error'].includes(m.type())) runtime.push({ action, kind: m.type(), message: m.text(), url: m.location().url }); });
  p.on('pageerror', error => runtime.push({ action, kind: 'pageerror', message: error.message }));
  p.on('request', r => {
    const path = new URL(r.url()).pathname;
    if (path.startsWith('/api/v1/me/batches/') && r.method() === 'PATCH') requests.push({ action, path, title: r.postDataJSON()?.title });
  });
  p.on('response', r => {
    const path = new URL(r.url()).pathname;
    if (path.startsWith('/api/v1/me/batches/')) responses.push({ action, path, method: r.request().method(), status: r.status() });
  });
}
async function scenario(id, fn) {
  action = id; expectedHTTP = [];
  try {
    await fn();
    if (page && !page.isClosed()) await page.evaluate(() => new Promise(requestAnimationFrame));
    const unexpected = runtime.filter(x => x.action === action).filter(x => {
      const status = x.message.match(/^Failed to load resource: the server responded with a status of (\d{3})\b/)?.[1];
      return !(x.kind === 'error' && status && expectedHTTP.some(e => Number(status) === e.status && x.url === origin + e.path));
    });
    expect(unexpected).toEqual([]);
    results.push({ id, result: 'PASS' });
  } catch (error) {
    results.push({ id, result: 'FAIL', error: String(error) });
    if (page && !page.isClosed()) await page.screenshot({ path: new URL(id + '-failed.png', out).pathname }).catch(() => {});
  }
  flush(); console.log(id, results.at(-1).result, results.at(-1).error ?? '');
}
async function login(context, lang) {
  await ok(context, '/auth/login', 'POST', { username, password: env.ADMIN_PASSWORD, browser_ui_locale: lang === 'zh' ? 'zh-CN' : 'en-US' });
  await ok(context, '/me/ui-locale', 'PUT', { ui_locale: lang === 'zh' ? 'zh-CN' : 'en-US' });
}
async function open(context, id) {
  await page?.close(); page = await context.newPage(); observe(page);
  await page.goto(origin + '/library/' + id); await ready(page);
  await expect(page.locator('#saved-batch-title')).toBeVisible();
}
async function edit(value, lang) {
  await page.getByRole('button', { name: text(lang, 'l.title.edit'), exact: true }).click();
  await expect(page.locator('#batch-title')).toBeFocused();
  await expect(page.locator('.batch-title-editor label span')).toHaveText(text(lang, 'l.title.label'));
  await expect(page.locator('#batch-title-hint')).toHaveText(text(lang, 'l.title.hint'));
  await page.locator('#batch-title').fill(value);
}
async function save(id, status, keyboard = false) {
  const response = page.waitForResponse(r => r.request().method() === 'PATCH' && new URL(r.url()).pathname === '/api/v1/me/batches/' + id);
  if (keyboard) await page.locator('#batch-title').press('Enter');
  else await page.locator('.batch-title-editor button[type="submit"]').click();
  expect((await response).status()).toBe(status);
}
async function success(id, value, lang) {
  await expect(page.locator('#saved-batch-title')).toHaveText(value);
  await expect(page.locator('#toast')).toHaveText(text(lang, 'l.title.saved'));
  const db = sql(`SELECT title FROM wordweave.learning_batches WHERE id='${id}'`);
  expect(db).toBe(value);
}

try {
  provider = await startProvider();
  for (const [label, engine, lang, width] of [['chromium-en', chromium, 'en', 1440], ['webkit-zh', webkit, 'zh', 390]]) {
    browser = await start(engine); browserVersions.push({ label, version: browser.version() });
    const context = await browser.newContext({ locale: lang === 'zh' ? 'zh-CN' : 'en-US', viewport: { width, height: 900 }, reducedMotion: 'reduce' });
    await login(context, lang);
    let failureCopy;
    await scenario(label + '-R01', async () => {
      await open(context, fixture.siblingB);
      const before = hash(fixture.siblingB), nonTitle = stable(fixture.siblingB);
      await edit('QA14 retained draft', lang);
      const url = '/api/v1/me/batches/' + fixture.siblingB, pattern = '**' + url;
      expectedHTTP.push({ path: url, status: 503 });
      let releases;
      const release = new Promise(resolve => { releases = resolve; });
      await page.route(pattern, async route => {
        if (route.request().method() !== 'PATCH') return route.continue();
        await release;
        return route.fulfill({ status: 503, contentType: 'application/problem+json', body: JSON.stringify({ type: 'https://wordweave.example/problems/temporarily-unavailable', title: 'Temporarily unavailable', status: 503, code: 'temporarily_unavailable', detail: 'QA14 isolated failure', request_id: 'qa14-controlled-service-error' }) });
      });
      try {
        await page.locator('.batch-title-editor button[type="submit"]').click();
        await expect(page.locator('#batch-title')).toBeDisabled();
        await expect(page.locator('.batch-title-editor button[type="submit"]')).toHaveText(text(lang, 'l.title.saving'));
        releases();
        await expect(page.locator('.batch-title-editor [role="alert"]')).toBeVisible();
        await expect(page.locator('#batch-title')).toBeEnabled();
        await expect(page.locator('#batch-title')).toBeFocused();
        await expect(page.locator('#batch-title')).toHaveValue('QA14 retained draft');
        const messages = JSON.parse(readFileSync(`frontend/i18n/locales/${lang === 'zh' ? 'zh-CN' : 'en-US'}.json`));
        await expect(page.locator('.app-error')).toHaveText(messages.error.service_unavailable);
        expect(hash(fixture.siblingB)).toBe(before);
        await expect(page.locator('#toast')).not.toHaveText(text(lang, 'l.title.saved'));
        failureCopy = { action, lang, actual: await page.locator('.batch-title-editor [role="alert"]').innerText(), expected: text(lang, 'l.title.failed') };
        const layout = await page.locator('.batch-title-editor').evaluate(el => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth, inputY: el.querySelector('input').getBoundingClientRect().y, hintY: el.querySelector('.field-help').getBoundingClientRect().y, errorY: el.querySelector('[role=alert]').getBoundingClientRect().y, buttonsY: el.querySelector('.actions').getBoundingClientRect().y, focus: document.activeElement.id }));
        expect(layout.scrollWidth).toBeLessThanOrEqual(width); expect(layout.inputY).toBeLessThan(layout.hintY); expect(layout.hintY).toBeLessThan(layout.errorY); expect(layout.errorY).toBeLessThan(layout.buttonsY);
        samples.push({ id: action, afterFailure: layout, storedUnchanged: true, failureCopy });
        await page.screenshot({ path: new URL(label + '-ordinary-failure.png', out).pathname });
      } finally { releases(); await page.unroute(pattern); }
      await page.keyboard.type(' - revised');
      const value = 'QA14 retained draft - revised';
      await expect(page.locator('#batch-title')).toHaveValue(value);
      await save(fixture.siblingB, 200, true); await success(fixture.siblingB, value, lang);
      expect(stable(fixture.siblingB)).toBe(nonTitle);
      expect(requests.filter(r => r.action === action)).toHaveLength(2);
    });
    await scenario(label + '-R02', async () => {
      await open(context, fixture.siblingB); const original = await page.locator('#saved-batch-title').innerText(), before = hash(fixture.siblingB);
      await edit('Cancel this', lang); await page.locator('.batch-title-editor button[type="button"]').click();
      await expect(page.locator('#saved-batch-title')).toHaveText(original); expect(hash(fixture.siblingB)).toBe(before);
      await edit('   ', lang); await page.locator('#batch-title').press('Enter');
      await expect(page.locator('.batch-title-editor [role="alert"]')).toHaveText(text(lang, 'l.title.empty')); expect(requests.filter(r => r.action === action)).toHaveLength(0);
      await page.locator('#batch-title').fill('Keep local conflict draft');
      const old = (await ok(context, '/me/batches/' + fixture.siblingB)).batch;
      await ok(context, '/me/batches/' + fixture.siblingB, 'PATCH', { title: 'Saved from another client', expected_title_revision: old.title_revision });
      const changed = hash(fixture.siblingB); expectedHTTP.push({ path: '/api/v1/me/batches/' + fixture.siblingB, status: 409 });
      await save(fixture.siblingB, 409);
      await expect(page.locator('#batch-title')).toBeFocused(); await expect(page.locator('#batch-title')).toHaveValue('Keep local conflict draft');
      await expect(page.locator('.batch-title-editor [role="alert"]')).toContainText(text(lang, 'l.title.failed'));
      await expect(page.locator('.batch-title-editor [role="alert"]')).toContainText('Saved from another client'); expect(hash(fixture.siblingB)).toBe(changed);
      await save(fixture.siblingB, 200, true); await success(fixture.siblingB, 'Keep local conflict draft', lang);
      samples.push({ id: action, cancelledAndBlankWrites: 0, conflictKeptDraft: true, explicitRetry: 200 });
    });
    await scenario(label + '-R03', async () => {
      await open(context, fixture.normalId); const original = await page.locator('#saved-batch-title').innerText(), before = hash(fixture.normalId);
      await edit('Discard after expired session', lang);
      sql(`DELETE FROM wordweave.account_sessions WHERE account_id='${fixture.owner}'`);
      await page.locator('.batch-title-editor button[type="submit"]').click();
      await expect(page.locator('.auth-gate')).toBeVisible(); await expect(page.locator('#batch-title')).toHaveCount(0);
      await expect(page.locator('#toast')).not.toHaveText(text(lang, 'l.title.saved')); expect(hash(fixture.normalId)).toBe(before);
      expect(requests.filter(r => r.action === action)).toHaveLength(0);
      expect((await call(context, '/me/batches/' + fixture.normalId, 'PATCH', { title: 'Denied', expected_title_revision: '1' })).status).toBe(401);
      await page.screenshot({ path: new URL(label + '-expired-session.png', out).pathname });
      await page.goto(origin + '/login'); await ready(page);
      await page.locator('input[autocomplete="username"]').fill(username); await page.locator('input[type="password"]').fill(env.ADMIN_PASSWORD);
      await page.locator('form button[type="submit"]').click(); await expect(page).not.toHaveURL(/\/login(?:[?#]|$)/); await ready(page);
      await page.goto(origin + '/library/' + fixture.normalId); await ready(page); await expect(page.locator('#saved-batch-title')).toHaveText(original); expect(hash(fixture.normalId)).toBe(before);
      samples.push({ id: action, writeRequestSkippedAfterBootstrap: true, unauthorizedWrite: 401, realUiRelogin: true, originalTitleRetained: true });
    });
    if (label === 'chromium-en') await scenario('chromium-en-R04', async () => {
      const model = sql("SELECT id FROM wordweave.ai_models WHERE display_name='Title QA local model'");
      const run = await stream(context, '/generations/stream', { model_id: model, meaning_language: 'en', scenario: 'story', length: 'short', entries: ['learn'] }); await run.done; terminal(run, 'validated');
      const created = await runCall(run, context, '/save'); expect(created.status()).toBe(201); const id = (await created.json()).data.batch_id;
      await open(context, id); await edit('Must not recreate a deleted batch', lang); await ok(context, '/me/batches/' + id, 'DELETE', {});
      expectedHTTP.push({ path: '/api/v1/me/batches/' + id, status: 404 }); await save(id, 404);
      await expect(page.locator('.batch-title-editor [role="alert"]')).toBeVisible(); await expect(page.locator('#toast')).not.toHaveText(text(lang, 'l.title.saved'));
      expect(sql(`SELECT count(*) FROM wordweave.learning_batches WHERE id='${id}'`)).toBe('0');
      await page.reload(); await ready(page); await expect(page.locator('#saved-batch-title')).toHaveCount(0); await expect(page.getByText(text(lang, 'l.unavailable'), { exact: true })).toBeVisible();
      samples.push({ id: action, deletedBatch: id, response: 404, noResurrection: true });
    });
    await scenario(label + '-C01', async () => {
      expect(failureCopy).toBeDefined(); samples.push({ id: action, ...failureCopy, source: 'UI22 prototype/learning.js saveTitle + copy.json l.title.failed' });
      expect(failureCopy.actual).toBe(failureCopy.expected);
    });
    await stop(browser); browser = undefined; page = undefined;
  }
  for (const [id, engine, lang] of [['H01-webkit-en', webkit, 'en'], ['H02-chromium-en', chromium, 'en'], ['H03-webkit-zh', webkit, 'zh'], ['H04-firefox-en', firefox, 'en']]) {
    browser = await start(engine); browserVersions.push({ label: id, version: browser.version() });
    const context = await browser.newContext({ locale: lang === 'en' ? 'en-US' : 'zh-CN', viewport: { width: 1440, height: 900 }, timezoneId: 'America/Los_Angeles', reducedMotion: 'reduce' });
    await login(context, lang); page = await context.newPage(); observe(page);
    await scenario(id, async () => {
      const dates = [], before = hash(fixture.normalId);
      for (const mode of ['direct', 'reload']) {
        const response = mode === 'direct' ? await page.goto(origin + '/library/' + fixture.normalId) : await page.reload();
        // Extract only the displayed date, not the SSR payload or account data.
        const server = (await response.text()).match(/<p[^>]*class="eyebrow"[^>]*>([^<]*)<\/p>/)?.[1];
        expect(server).toBeDefined(); await ready(page);
        const client = await page.locator('.batch-detail > article > .eyebrow').textContent();
        const locale = await page.locator('html').getAttribute('lang'); expect(locale).toBe(lang === 'en' ? 'en-US' : 'zh-CN');
        await edit('Unsubmitted title', lang); await page.locator('.batch-title-editor button[type="button"]').click();
        dates.push({ mode, server, client, locale, equal: server === client, editAndCancelUsable: true });
      }
      expect(hash(fixture.normalId)).toBe(before);
      if (engine === webkit) {
        const savedAt = sql(`SELECT saved_at::text FROM wordweave.learning_batches WHERE id='${fixture.normalId}'`);
        try {
          for (const [at, en, zh] of [
            ['2026-12-31T16:00:00Z', 'Jan 1, 2027, 12:00 AM', '2027年1月1日 00:00'],
            ['2026-09-28T04:00:00Z', 'Sep 28, 2026, 12:00 PM', '2026年9月28日 12:00'],
          ]) {
            sql(`UPDATE wordweave.learning_batches SET saved_at='${at}' WHERE id='${fixture.normalId}'`);
            const r=await page.reload();const server=(await r.text()).match(/<p[^>]*class="eyebrow"[^>]*>([^<]*)<\/p>/)?.[1];await ready(page);
            const client=await page.locator('.batch-detail > article > .eyebrow').textContent();
            const expected=lang==='en'?en:zh;
            expect(server).toBe(expected);expect(client).toBe(expected);
            dates.push({mode:'boundary-reload',at,server,client,expected,equal:server===client,browserTimeZone:'America/Los_Angeles'});
          }
        } finally {sql(`UPDATE wordweave.learning_batches SET saved_at='${savedAt}' WHERE id='${fixture.normalId}'`);}
        expect(hash(fixture.normalId)).toBe(before);
      }
      samples.push({ id: action, dates, runtime: runtime.filter(x => x.action === action), databaseUnchanged: true });
      await page.screenshot({ path: new URL(id + '-date.png', out).pathname });
      expect(dates.every(d => d.equal)).toBe(true);
    });
    await stop(browser); browser = undefined; page = undefined;
  }
} catch (error) {
  results.push({ id: 'SETUP', result: 'FAIL', error: String(error) }); console.log('SETUP', String(error));
} finally {
  flush(); await stop(browser); await provider?.close();
  if (results.length !== 13 || results.some(x => x.result !== 'PASS')) process.exitCode = 1;
}
