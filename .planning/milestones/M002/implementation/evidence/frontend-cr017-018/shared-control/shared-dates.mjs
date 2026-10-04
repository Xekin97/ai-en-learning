import { readFileSync } from 'node:fs';
import { webkit, expect, start, stop, ok, sql, origin, out, dump, ready, env, randomUUID } from './harness.mjs';

const fixture = JSON.parse(readFileSync(new URL('input.json', out))).fixture;
const username = sql(`SELECT username FROM wordweave.accounts WHERE id='${fixture.owner}'`);
const ids = { level: randomUUID(), notice: randomUUID(), definition: randomUUID(), settlement: randomUUID(), item: randomUUID() };
const results = [], samples = [], runtime = [];
let browser, action, page;
const flush = () => dump('shared-results.json', { results, samples, runtime, localProviderCalls: 0, realProviderCalls: 0 });
try {
  const levelsBefore = Number(sql('SELECT count(*) FROM wordweave.growth_levels'));
  if (levelsBefore === 0) sql(`INSERT INTO wordweave.growth_levels(id,level_no,min_experience,reward_enabled,points) VALUES('${ids.level}',1,0,false,0)`);
  dump('fixture-control.json', { levelsBefore, addedLevel1: levelsBefore === 0, reason: 'Core title fixture had no level configuration; growth returns 503 and admin growth has no positive level. Add configured baseline for date display only.', retainedIssuedDefinition: ids.definition });
  // Synthetic display fixtures in the existing disposable test DB only.
  sql(`BEGIN;
    INSERT INTO wordweave.platform_notices(id,title_zh,title_en,body_zh,body_en,visible,remind,published_at)
      VALUES('${ids.notice}','日期显示测试','Date display test','测试正文','Test body',true,false,'2026-09-28T06:46:00Z');
    INSERT INTO wordweave.item_definitions(id,kind,name_zh,name_en,description_zh,description_en,exchange_price,activation_ttl_seconds,ever_issued)
      VALUES('${ids.definition}','makeup','测试补签卡','Test makeup card','本地显示测试','Local display test',0,86400,true);
    INSERT INTO wordweave.growth_settlements(id,owner_id,kind,source_key,config_snapshot)
      VALUES('${ids.settlement}','${fixture.owner}','admin_grant','${ids.item}','{}');
    INSERT INTO wordweave.user_items(id,owner_id,definition_id,issuance_settlement_id,issuance_component,issued_at,activation_deadline,kind_snapshot,parameters_snapshot)
      VALUES('${ids.item}','${fixture.owner}','${ids.definition}','${ids.settlement}','item:1',clock_timestamp(),clock_timestamp()+interval '10 days','makeup','{"kind":"makeup"}');
    COMMIT;`);
  browser = await start(webkit);
  for (const [lang, width] of [['en-US', 1440], ['zh-CN', 390]]) {
    const contexts = {};
    for (const [role, name] of [['learner', username], ['admin', env.ADMIN_USERNAME]]) {
      const context = await browser.newContext({ locale: lang, timezoneId: 'America/Los_Angeles', viewport: { width, height: 900 }, reducedMotion: 'reduce' });
      await ok(context, '/auth/login', 'POST', { username: name, password: env.ADMIN_PASSWORD, browser_ui_locale: lang });
      await ok(context, '/me/ui-locale', 'PUT', { ui_locale: lang });
      contexts[role] = context;
    }
    for (const [id, role, route, selector] of [
      ['items', 'learner', '/account/items', '.item-dates dd'],
      ['admin-users', 'admin', '/admin/users?all=1', 'tbody tr td:nth-child(4)'],
      ['admin-user-detail', 'admin', '/admin/users/' + fixture.owner, '.admin-facts > div:nth-child(4) dd, .admin-facts > div:nth-child(5) dd, .admin-facts > div:nth-child(6) dd'],
    ]) {
      action = `${lang}-${id}`;
      page = await contexts[role].newPage();
      page.setDefaultTimeout(12000);
      page.on('console', m => { if (['warning', 'error'].includes(m.type())) runtime.push({ action, kind: m.type(), message: m.text() }); });
      page.on('pageerror', e => runtime.push({ action, kind: 'pageerror', message: e.message }));
      try {
        const response = await page.goto(origin + route);
        expect(response.status()).toBe(200);
        const html = await response.text();
        await ready(page); await page.waitForLoadState('networkidle');
        const server = await page.evaluate(({ html, selector }) => Array.from(new DOMParser().parseFromString(html, 'text/html').querySelectorAll(selector), el => el.textContent.trim()), { html, selector });
        const client = await page.locator(selector).evaluateAll(nodes => nodes.map(el => el.textContent.trim()));
        expect(server.length).toBeGreaterThan(0);
        expect(server.some(x => /\d{1,2}:\d{2}/.test(x))).toBe(true);
        expect(client).toEqual(server);
        expect(await page.locator('html').getAttribute('lang')).toBe(lang);
        expect(runtime.filter(x => x.action === action)).toEqual([]);
        samples.push({ id: action, route, selector, width, browserTimeZone: 'America/Los_Angeles', server, client });
        if (id === 'items') await page.screenshot({ path: new URL(action + '.png', out).pathname });
        results.push({ id: action, result: 'PASS' });
      } catch (error) {
        results.push({ id: action, result: 'FAIL', error: String(error) });
        await page.screenshot({ path: new URL(action + '-failure.png', out).pathname }).catch(() => {});
      }
      flush(); console.log(action, results.at(-1).result, results.at(-1).error ?? '');
      await page.close();
    }
    for (const context of Object.values(contexts)) await context.close();
  }
} finally {
  await stop(browser);
  sql(`BEGIN;
    DELETE FROM wordweave.platform_notices WHERE id='${ids.notice}';
    DELETE FROM wordweave.user_items WHERE id='${ids.item}';
    DELETE FROM wordweave.growth_settlements WHERE id='${ids.settlement}';
    COMMIT;`);
  dump('fixture-cleanup.json', { transientRowsRemoved: true, issuedDefinitionRetained: ids.definition, reason: 'Issued definitions are immutable; left unlisted in disposable DB without bypassing the guard.' });
  flush();
  if (results.length !== 6 || results.some(x => x.result !== 'PASS')) process.exitCode = 1;
}
