import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
const { chromium, expect } = createRequire(process.cwd() + '/frontend/package.json')('@playwright/test');
const out = new URL('./', import.meta.url), origin = 'http://127.0.0.1:3302';
const work = readFileSync('/tmp/wordweave-m002-integrated-current', 'utf8').trim();
const env = JSON.parse(readFileSync(work + '/env.json'));
const source = JSON.parse(readFileSync('.planning/milestones/M002/design/copy.json'));
const results = [], errors = [], blocked = [];
const browser = await chromium.launch();
const ready = page => page.waitForFunction(() => document.documentElement.dataset.appReady === 'true');
const t = (lang, key) => source.static[lang + '.' + key];
async function setup(width=1440, lang='en') {
  const c = await browser.newContext({viewport:{width,height:width===390?844:1000}});
  await c.addCookies([{name:'wordweave_ui_locale',value:lang==='zh'?'zh-CN':'en-US',url:origin}]);
  await c.route('**/api/v1/**', async route => {
    const r=route.request(), p=new URL(r.url()).pathname;
    // Real credentials are present. No test, generation or configuration write is permitted in this smoke.
    if (r.method()!=='GET' && r.method()!=='HEAD' && (p.includes('/admin/model') || /\/generation-runs$|\/preview-runs$|\/generate/.test(p))) {
      blocked.push(p); await route.abort(); return;
    }
    await route.continue();
  });
  const p=await c.newPage();
  p.on('pageerror',e=>errors.push(e.message));
  p.on('response',r=>{if(r.status()>=500)errors.push(new URL(r.url()).pathname+':'+r.status());});
  return {c,p};
}
async function get(c, path) {
  const r=await c.request.get(origin+'/api/v1'+path);expect(r.status(),path).toBe(200);return (await r.json()).data;
}
async function login(p) {
  await p.goto(origin+'/login'); await ready(p);
  await p.locator('input[autocomplete="username"]').fill(env.ADMIN_USERNAME);
  await p.locator('input[autocomplete="current-password"]').fill(env.ADMIN_PASSWORD);
  const response=p.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname==='/api/v1/auth/login');
  await p.locator('form button[type="submit"]').click();expect((await response).status()).toBe(200);
  await p.waitForURL(url=>url.pathname!='/login');await ready(p);
}
try {
  for(const width of [1440,390]) {
    const {c,p}=await setup(width,'zh');await login(p);
    await p.goto(origin+'/admin/models');await ready(p);
    await p.locator('.generic-model-row').first().getByRole('button',{name:t('zh','a.edit'),exact:true}).click();
    await p.waitForFunction(()=>{const d=document.querySelector('#admin-model');return d?.open && getComputedStyle(d).opacity==='1';});
    await p.locator('#admin-model').evaluate(async el=>{await Promise.all(el.getAnimations().filter(a=>Number.isFinite(a.effect.getComputedTiming().endTime)).map(a=>a.finished.catch(()=>{})));});
    await p.screenshot({path:new URL('real-edit-settled-'+width+'.png',out).pathname});
    await c.close();
  }
  expect(blocked).toEqual([]);expect(errors).toEqual([]);
  console.log('Final desktop/mobile visual capture completed; no writes or provider calls.');
} finally {await browser.close();}
