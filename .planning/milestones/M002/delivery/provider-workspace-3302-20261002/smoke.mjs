import {createRequire} from 'node:module';
import {readFileSync,writeFileSync} from 'node:fs';
const {chromium,expect}=createRequire(process.cwd()+'/frontend/package.json')('@playwright/test');
const work=readFileSync('/tmp/wordweave-m002-integrated-current','utf8').trim();const env=JSON.parse(readFileSync(work+'/env.json'));
const source=JSON.parse(readFileSync('.planning/milestones/M002/design/copy.json'));const origin='http://127.0.0.1:3302';const browser=await chromium.launch();
const ready=p=>p.waitForFunction(()=>document.documentElement.dataset.appReady==='true');const results=[],errors=[],blocked=[];let storage;
try{for(const width of [1440,390]){
 const c=await browser.newContext({viewport:{width,height:width===390?844:1000},storageState:storage,reducedMotion:'reduce'});
 await c.route('**/api/v1/**',async route=>{const r=route.request(),path=new URL(r.url()).pathname;if(!['GET','HEAD'].includes(r.method())&&(path.startsWith('/api/v1/admin/model')||/\/generation-runs$|\/preview-runs$/.test(path))){blocked.push(path);await route.abort();return;}await route.continue();});
 const p=await c.newPage();p.on('pageerror',e=>errors.push(e.message));p.on('response',r=>{if(r.status()>=500)errors.push(new URL(r.url()).pathname+':'+r.status());});
 if(!storage){await p.goto(origin+'/login');await ready(p);await p.locator('input[autocomplete="username"]').fill(env.ADMIN_USERNAME);await p.locator('input[autocomplete="current-password"]').fill(env.ADMIN_PASSWORD);const logged=p.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname==='/api/v1/auth/login');await p.locator('form button[type="submit"]').click();expect((await logged).status()).toBe(200);await p.waitForURL(u=>u.pathname!='/login');await ready(p);storage=await c.storageState();}
 const response=await c.request.get(origin+'/api/v1/admin/model-providers');expect(response.status()).toBe(200);const before=(await response.json()).data;
 await p.goto(origin+'/admin/models');await ready(p);const lang=(await p.locator('html').getAttribute('lang'))?.startsWith('zh')?'zh':'en',t=k=>source.static[lang+'.'+k];
 await expect(p.locator('.generic-provider-card')).toHaveCount(before.items.length);
 for(const provider of before.items){await expect(p.locator(`[data-provider-id="${provider.connection.id}"] .generic-model-row`)).toHaveCount(provider.models.length);}
 await p.screenshot({path:new URL('list-'+width+'.png',import.meta.url).pathname,fullPage:false});
 const current=before.items.find(x=>x.models.length>0);expect(current).toBeTruthy();
 const card=p.locator(`[data-provider-id="${current.connection.id}"]`);await card.getByRole('button',{name:t('gm.edit'),exact:true}).click();const d=p.locator('#admin-model'),rows=d.locator('.generic-model-item');
 await expect(rows).toHaveCount(current.models.length);await expect(d.locator('select')).toHaveCount(1);await expect(d.locator('[name="apiKey"]')).toHaveValue('');await expect(d.getByText(t('gm.changed.connection'),{exact:true})).toBeVisible();
 for(let i=0;i<current.models.length;i++)await expect(rows.nth(i).locator('[name="providerModelId"]')).toHaveValue(current.models[i].provider_model_id);
 await d.getByRole('button',{name:t('gm.model.add'),exact:true}).click();await rows.last().locator('[name="providerModelId"]').fill('UI31/unsaved-model');
 const pending=[];await p.route('**/api/v1/admin/model-connection-test',route=>{pending.push(route);});await rows.last().getByRole('button',{name:t('gm.test'),exact:true}).click();await expect.poll(()=>pending.length).toBe(1);expect(pending[0].request().postDataJSON()).toMatchObject({provider_model_id:'UI31/unsaved-model',connection_id:current.connection.id,connection:null});await expect(rows.first().getByRole('button',{name:t('gm.test'),exact:true})).toHaveAttribute('aria-busy','false');await pending[0].fulfill({json:{data:{ok:true},meta:{request_id:'ui31-intercepted-probe'}}});await expect(rows.last().getByRole('status')).toHaveText(t('gm.test.ok'));
 await rows.last().locator('summary').click();await rows.last().locator('[name="maxOutputTokens"]').fill('4096');await rows.last().scrollIntoViewIfNeeded();
 await expect.poll(async()=>(await d.locator('h2').boundingBox()).y).toBeGreaterThanOrEqual(0);const footer=await d.locator('.dialog-actions').boundingBox();expect(footer.y+footer.height).toBeLessThanOrEqual(p.viewportSize().height);expect(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
 await p.screenshot({path:new URL('edit-'+width+'.png',import.meta.url).pathname,fullPage:false});await d.getByRole('button',{name:t('cancel'),exact:true}).click();await p.locator('#model-discard').getByRole('button',{name:t('gm.discard'),exact:true}).click();await expect(d).not.toBeVisible();
 await p.getByRole('button',{name:t('gm.add'),exact:true}).click();await expect(rows).toHaveCount(1);await expect(d.locator('[name="connectionName"]')).toHaveValue('');await expect(d.locator('[name="apiKey"]')).toHaveAttribute('required','');await expect(d.locator('select')).toHaveCount(1);await d.getByRole('button',{name:t('cancel'),exact:true}).click();await expect(d).not.toBeVisible();
 const after=(await (await c.request.get(origin+'/api/v1/admin/model-providers')).json()).data;expect(after).toEqual(before);expect(errors).toEqual([]);expect(blocked).toEqual([]);
 results.push({width,lang,result:'PASS',providers:before.items.length,models:before.items.reduce((n,p)=>n+p.models.length,0),test_requests_intercepted:pending.length});await c.close();
}
writeFileSync(new URL('smoke.json',import.meta.url),JSON.stringify({result:'PASS',cases:results,scope:'production build, real grouped metadata, probes intercepted; actual atomic saves validated in isolated HTTP/DB tests',real_model_calls:0,configuration_writes:0,errors},null,2)+'\n');console.log('PASS: grouped providers and complete provider editor on 3302 desktop/mobile; original configuration preserved.');
}finally{await browser.close();}
