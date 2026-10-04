import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
const {chromium,expect} = createRequire(process.cwd()+'/frontend/package.json')('@playwright/test');
const work=readFileSync('/tmp/wordweave-m002-integrated-current','utf8').trim();
const env=JSON.parse(readFileSync(work+'/env.json'));
const source=JSON.parse(readFileSync('.planning/milestones/M002/design/copy.json'));
const origin='http://127.0.0.1:3302', browser=await chromium.launch();
const ready=p=>p.waitForFunction(()=>document.documentElement.dataset.appReady==='true');
const results=[],errors=[],blocked=[];
let storage;
try {
  for(const width of [1440,390]) {
    const c=await browser.newContext({viewport:{width,height:width===390?844:1000},reducedMotion:'reduce',storageState:storage});
    await c.route('**/api/v1/**',async route=>{
      const r=route.request(),p=new URL(r.url()).pathname;
      if(!['GET','HEAD'].includes(r.method())&&(p.startsWith('/api/v1/admin/model')||/\/generation-runs$|\/preview-runs$/.test(p))){blocked.push(p);await route.abort();return;}
      await route.continue();
    });
    const p=await c.newPage();p.on('pageerror',e=>errors.push(e.message));
    p.on('response',r=>{if(r.status()>=500)errors.push(new URL(r.url()).pathname+':'+r.status());});
    if(!storage){
      await p.goto(origin+'/login');await ready(p);
      await p.locator('input[autocomplete="username"]').fill(env.ADMIN_USERNAME);
      await p.locator('input[autocomplete="current-password"]').fill(env.ADMIN_PASSWORD);
      const login=p.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname==='/api/v1/auth/login');
      await p.locator('form button[type="submit"]').click();expect((await login).status()).toBe(200);
      await p.waitForURL(url=>url.pathname!='/login');await ready(p);storage=await c.storageState();
    }
    const before=await c.request.get(origin+'/api/v1/admin/models');expect(before.status()).toBe(200);
    const models=(await before.json()).data;
    await p.goto(origin+'/admin/models');await ready(p);
    const lang=(await p.locator('html').getAttribute('lang'))?.startsWith('zh')?'zh':'en';
    const t=k=>source.static[lang+'.'+k];
    await expect(p.locator('.generic-model-row')).toHaveCount(models.items.length);
    await p.getByRole('button',{name:t('gm.add'),exact:true}).click();
    const d=p.locator('#admin-model'), form=d.locator('#model-form'), rows=d.locator('.generic-model-item');
    expect(await form.locator('[data-model-section]').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('data-model-section')))).toEqual(['provider','models']);
    const select=form.locator('select').first();
    const label=await select.locator('option').evaluateAll((nodes,id)=>nodes.find(n=>n.value===id).textContent.trim(),models.items[0].connection.id);
    await select.locator('..').getByRole('combobox').click();await p.getByRole('option',{name:label,exact:true}).click();
    await rows.first().locator('[name="providerModelId"]').fill('UI30/first-model');
    await d.locator('.dialog-body').evaluate(e=>e.scrollTop=0);
    await expect.poll(async()=>(await d.locator('h2').boundingBox()).y).toBeGreaterThanOrEqual(0);
    await p.screenshot({path:new URL('provider-batch-'+width+'-provider.png',import.meta.url).pathname,fullPage:true});
    await d.getByRole('button',{name:t('gm.model.add'),exact:true}).click();
    await rows.nth(1).locator('[name="providerModelId"]').fill('UI30/second-model');
    await rows.nth(1).locator('summary').click();
    await rows.nth(1).locator('[name="maxOutputTokens"]').fill('4096');
    const probes=[];
    await p.route('**/api/v1/admin/model-connection-test',route=>probes.push(route));
    await rows.nth(1).getByRole('button',{name:t('gm.test'),exact:true}).click();
    await expect.poll(()=>probes.length).toBe(1);
    await expect(rows.nth(1).getByRole('button',{name:t('gm.testing'),exact:true})).toHaveAttribute('aria-busy','true');
    await expect(rows.first().getByRole('button',{name:t('gm.test'),exact:true})).toHaveAttribute('aria-busy','false');
    expect(probes[0].request().postDataJSON()).toMatchObject({provider_model_id:'UI30/second-model',connection_id:models.items[0].connection.id,max_output_tokens:4096});
    await probes[0].fulfill({json:{data:{ok:true},meta:{request_id:'ui30-intercepted-stream'}}});
    await expect(rows.nth(1).getByRole('status')).toHaveText(t('gm.test.ok'));
    const footer=await d.locator('.dialog-actions').boundingBox();expect(footer.y+footer.height).toBeLessThanOrEqual(p.viewportSize().height);
    await expect.poll(async()=>(await d.locator('h2').boundingBox()).y).toBeGreaterThanOrEqual(0);
    expect(await rows.nth(1).locator('.model-advanced-fields').evaluate(e=>parseFloat(getComputedStyle(e).rowGap))).toBeGreaterThanOrEqual(16);
    expect(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
    await p.screenshot({path:new URL('provider-batch-'+width+'-models.png',import.meta.url).pathname,fullPage:true});
    await d.getByRole('button',{name:t('cancel'),exact:true}).click();
    await p.locator('#model-discard').getByRole('button',{name:t('gm.discard'),exact:true}).click();
    await expect(d).not.toBeVisible();
    const after=(await (await c.request.get(origin+'/api/v1/admin/models')).json()).data;
    expect(after).toEqual(models);expect(errors).toEqual([]);expect(blocked).toEqual([]);
    results.push({width,lang,result:'PASS',test_requests_intercepted:probes.length});await c.close();
  }
  writeFileSync(new URL('provider-batch-smoke.json',import.meta.url),JSON.stringify({result:'PASS',scope:'production build with real saved metadata and intercepted probe response; protocol verified separately on local HTTP fixtures',cases:results,real_model_calls:0,configuration_writes:0,errors},null,2)+'\n');
  console.log('PASS: provider-first batch form on desktop/mobile 3302; original model configuration preserved; probes intercepted.');
}finally{await browser.close();}
