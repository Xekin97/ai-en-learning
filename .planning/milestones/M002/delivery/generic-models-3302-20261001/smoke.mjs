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
  const guest=await setup();
  expect((await guest.c.request.get(origin+'/api/v1/admin/model-connections')).status()).toBe(401);
  await guest.p.goto(origin+'/create'); await ready(guest.p);
  await expect(guest.p.locator('.creation-model select')).toHaveValue('');
  results.push({case:'guest-cannot-configure-and-model-must-be-manually-selected',result:'PASS'});
  await guest.c.close();
  for(const [width,lang] of [[1440,'zh'],[390,'en']]) {
    const {c,p}=await setup(width,lang);await login(p);
    await p.goto(origin+'/admin/models');await ready(p);
    const actualLang=(await p.locator('html').getAttribute('lang'))?.startsWith('zh')?'zh':'en';
    const models=await get(c,'/admin/models'), connections=await get(c,'/admin/model-connections');
    expect(models.items.length).toBeGreaterThan(0);expect(connections.items).toHaveLength(1);
    expect(connections.items[0].credential_configured).toBe(true);
    for(const model of models.items) {
      expect(model.provider_model_id).toBeTruthy();expect(model.connection.protocol).toBe('openai_chat');
      expect('api_key' in model.connection).toBe(false);expect('is_default' in model).toBe(false);
      const detail=await get(c,'/admin/models/'+model.id);expect(detail.model.id).toBe(model.id);
    }
    const rows=p.locator('.generic-model-row');await expect(rows).toHaveCount(models.items.filter(m=>!m.retired_at).length);
    await p.screenshot({path:new URL('real-list-'+width+'.png',out).pathname,fullPage:true});
    await rows.first().getByRole('button',{name:t(actualLang,'a.edit'),exact:true}).click();
    await expect(p.locator('[name="apiKey"]')).toHaveValue('');
    await expect(p.locator('[name="baseUrl"]')).toHaveValue('https://openrouter.ai/api/v1');
    expect(await p.locator('[name="apiKey"]').getAttribute('required')).toBe(null);
    await expect(p.locator('#admin-model .dialog-actions')).toBeInViewport();
    expect(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
    await p.screenshot({path:new URL('real-edit-'+width+'.png',out).pathname});
    await p.locator('#admin-model').getByRole('button',{name:t(actualLang,'cancel'),exact:true}).click();
    await expect(p.locator('#admin-model')).not.toBeVisible();
    results.push({case:'admin-unified-list-migrated-key-blank-edit-unchanged-close',width,lang:actualLang,result:'PASS',models:models.items.length});
    await c.close();
  }
  expect(blocked).toEqual([]);expect(errors).toEqual([]);
  writeFileSync(new URL('smoke.json',out),JSON.stringify({result:'PASS',results,errors,blocked,real_model_calls:0,configuration_writes:0},null,2)+'\n');
  console.log(JSON.stringify({result:'PASS',cases:results.length,real_model_calls:0}));
} catch(e) {
  writeFileSync(new URL('smoke-failure.json',out),JSON.stringify({result:'FAIL',results,errors,blocked,error:String(e)},null,2)+'\n');
  console.error(String(e));process.exitCode=1;
} finally {await browser.close();}
