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
  const {c,p}=await setup(1440,'zh');await login(p);
  const pending=[];
  await p.route('**/api/v1/admin/model-connection-test',route=>{pending.push(route);});
  await p.goto(origin+'/admin/models');await ready(p);
  const lang=(await p.locator('html').getAttribute('lang'))?.startsWith('zh')?'zh':'en';
  const models=await get(c,'/admin/models'), rows=p.locator('.generic-model-row');
  await expect(rows).toHaveCount(models.items.length);expect(models.items.length).toBeGreaterThan(1);
  const first=rows.nth(0), second=rows.nth(1);
  await first.getByRole('button',{name:t(lang,'gm.test'),exact:true}).click();
  await expect.poll(()=>pending.length).toBe(1);
  await expect(first.getByRole('button',{name:t(lang,'gm.testing'),exact:true})).toHaveAttribute('aria-busy','true');
  await expect(second.getByRole('button',{name:t(lang,'gm.test'),exact:true})).toHaveAttribute('aria-busy','false');
  await expect(second.getByRole('status')).toHaveCount(0);
  expect(pending[0].request().postDataJSON().provider_model_id).toBe(models.items[0].provider_model_id);
  await pending[0].fulfill({json:{data:{ok:true},meta:{request_id:'local-feedback-smoke'}}});
  await expect(first.getByRole('status')).toHaveText(t(lang,'gm.test.ok'));
  await second.getByRole('button',{name:t(lang,'gm.test'),exact:true}).click();
  await expect.poll(()=>pending.length).toBe(2);
  await expect(second.getByRole('button',{name:t(lang,'gm.testing'),exact:true})).toHaveAttribute('aria-busy','true');
  await expect(first.getByRole('button',{name:t(lang,'gm.test'),exact:true})).toHaveAttribute('aria-busy','false');
  expect(pending[1].request().postDataJSON().provider_model_id).toBe(models.items[1].provider_model_id);
  await pending[1].fulfill({status:422,contentType:'application/problem+json',json:{type:'about:blank',title:'Authentication failed',status:422,code:'model_connection_auth',detail:'Synthetic test result',request_id:'local-feedback-smoke-2'}});
  await expect(second.getByRole('status')).toHaveText(t(lang,'gm.testing.auth'));
  await expect(first.getByRole('status')).toHaveCount(0);
  expect(errors).toEqual([]);expect(blocked).toEqual([]);
  await c.close();
  writeFileSync(new URL('test-state-smoke.json',out),JSON.stringify({result:'PASS',scope:'production frontend with real metadata, test responses intercepted',cases:['only clicked model loading','request model identifiers isolated','success and failure feedback scoped to row'],test_requests_intercepted:2,real_model_calls:0,configuration_writes:0,errors},null,2)+'\n');
  console.log('PASS: model-specific test feedback on 3302; no real upstream calls.');
} finally {await browser.close();}
