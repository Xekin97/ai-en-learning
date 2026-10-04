import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
const { chromium, expect } = createRequire(process.cwd() + '/frontend/package.json')('@playwright/test');
const out = new URL('./', import.meta.url), origin = 'http://127.0.0.1:3302';
const work = readFileSync('/tmp/wordweave-m002-integrated-current', 'utf8').trim();
const env = JSON.parse(readFileSync(work + '/env.json'));
const oldHarness = readFileSync('.planning/milestones/M002/verification/evidence/qa2-022/harness.mjs','utf8');
const password = oldHarness.match(/export const password\s*=\s*(['"])(.*?)\1/)[2];
const results = [], errors = [], blocked = [];
const b = await chromium.launch();
const ready = page => page.waitForFunction(() => document.documentElement.dataset.appReady === 'true');
async function setup() {
  const c = await b.newContext({ viewport:{width:1440,height:1000} });
  await c.route('**/api/v1/**', async route => {
    const r = route.request(), p = new URL(r.url()).pathname;
    if (r.method()==='POST' && (/\/generation-runs$/.test(p)||/\/preview-runs$/.test(p)||/\/generate/.test(p))) {
      blocked.push(p); await route.abort(); return;
    }
    await route.continue();
  });
  const p = await c.newPage();
  p.on('pageerror',e=>errors.push({type:'pageerror',message:e.message}));
  p.on('response',r=>{if(r.status()>=500) errors.push({type:'http',status:r.status(),path:new URL(r.url()).pathname});});
  return { c, p };
}
async function get(c, path) {
  const r = await c.request.get(origin+'/api/v1'+path);
  expect(r.status(), path).toBe(200);
  return (await r.json()).data;
}
async function login(p, username) {
  await p.goto(origin+'/login'); await ready(p);
  await p.locator('input[autocomplete="username"]').fill(username);
  await p.locator('input[autocomplete="current-password"]').fill(password);
  const response = p.waitForResponse(r=>r.request().method()==='POST' && new URL(r.url()).pathname==='/api/v1/auth/login');
  await p.locator('form button[type="submit"]').click();
  expect((await response).status()).toBe(200);
  await p.waitForURL(url=>url.pathname!='/login'); await ready(p);
}
try {
  const guest=await setup();
  await guest.p.goto(origin); await ready(guest.p);
  await expect(guest.p.locator('header .ww-select-trigger')).toBeVisible();
  const select=guest.p.locator('header .ww-select-trigger');
  await select.click(); await expect(guest.p.locator('.ww-select-menu:visible')).toBeVisible();
  await guest.p.keyboard.press('Escape');
  results.push({case:'guest-home-and-custom-language-select',result:'PASS'});
  for (const q of ['garden','learn']) {
    const d=await get(guest.c,'/vocabulary/search?q='+q);
    expect(d.items.some(i=>i.entry===q)).toBe(true);
    expect(d.items.every(i=>i.entry.toLowerCase().startsWith(q))).toBe(true);
    results.push({case:'real-vocabulary-'+q,result:'PASS',entries:d.items.map(i=>i.entry)});
  }
  await guest.p.goto(origin+'/create'); await ready(guest.p);
  await guest.p.locator('.word-picker input').fill('garden');
  await expect(guest.p.locator('.word-picker-option').filter({hasText:/^garden/}).first()).toBeVisible();
  await guest.p.locator('.word-picker-option').filter({hasText:/^garden/}).first().click();
  await expect(guest.p.locator('[data-picker-remove]')).toHaveCount(1);
  results.push({case:'guest-word-picker-search-and-select',result:'PASS'});
  await guest.c.close();
  const learner=await setup();
  await login(learner.p,'learner_review');
  const notices=await get(learner.c,'/notices');
  expect(notices.items.length).toBeGreaterThan(0);
  expect(notices.items.every(i=>typeof i.remind_once==='boolean')).toBe(true);
  const reminders=notices.items.filter(i=>i.remind);
  if(reminders.length) {
    const modal=learner.p.locator('dialog[open]');
    await expect(modal).toBeVisible();
    await expect(modal.locator('.notice-heading')).toBeVisible();
    await expect(modal.locator('button').last()).toBeVisible();
    await learner.p.keyboard.press('Escape');
  }
  await learner.p.goto(origin+'/notices'); await ready(learner.p);
  await expect(learner.p.locator('.notice-list')).toBeVisible();
  expect(await learner.p.locator('.notice-entry .badge').count()).toBe(0);
  for(const path of ['/library','/review']) {
    await learner.p.goto(origin+path); await ready(learner.p);
    expect(new URL(learner.p.url()).pathname).toBe(path);
  }
  results.push({case:'learner-login-notice-modal-list-library-review',result:'PASS',notices:notices.items.length,automatic_reminder:reminders.length>0});
  await learner.c.close();
  const admin=await setup();
  await login(admin.p,env.ADMIN_USERNAME);
  await admin.p.goto(origin+'/admin/notices'); await ready(admin.p);
  const config=await get(admin.c,'/admin/notices');
  expect(config.items.length).toBeGreaterThan(0);
  expect(config.items.every(i=>i.remind_once===false)).toBe(true);
  const once=admin.p.getByRole('checkbox',{name:/Remind once|只提醒一次/});
  await expect(once).toBeVisible(); await expect(once).not.toBeChecked();
  await once.check(); await expect(once).toBeChecked(); await once.uncheck();
  results.push({case:'admin-login-and-unsaved-once-control',result:'PASS',existing_notices_default_false:true,persisted_configuration_writes:0});
  await admin.c.close();
  expect(blocked).toEqual([]); expect(errors).toEqual([]);
  writeFileSync(new URL('smoke.json',out),JSON.stringify({result:'PASS',url:origin,results,errors,blocked,real_model_calls:0},null,2)+'\n');
  console.log(JSON.stringify({result:'PASS',cases:results.length,real_model_calls:0}));
} catch(e) {
  writeFileSync(new URL('smoke-failure.json',out),JSON.stringify({result:'FAIL',results,errors,blocked,error:String(e)},null,2)+'\n');
  console.error(String(e)); process.exitCode=1;
} finally {await b.close();}
