import {createRequire} from 'node:module';
import {readFileSync,writeFileSync} from 'node:fs';
import {createServer,request as httpRequest} from 'node:http';
import {randomUUID} from 'node:crypto';
const require=createRequire(process.cwd()+'/frontend/package.json'),{chromium,expect}=require('@playwright/test');
const copy=JSON.parse(readFileSync(process.cwd()+'/.planning/milestones/M002/design/copy.json'));const t=k=>copy.static['en.'+k]??copy.templates['en.'+k];
const work=readFileSync('/tmp/wordweave-fe-m002-current','utf8'),env=JSON.parse(readFileSync(work+'/env.json'));
if(!env.APP_DATABASE_URL.includes('63541/wordweave_fe_m002')||env.OPENROUTER_BASE_URL!=='http://127.0.0.1:38082')throw Error('Isolated stack required');
const origin='http://127.0.0.1:3301',out=new URL('./',import.meta.url),results=[];
const proxy=createServer((req,res)=>{const up=httpRequest({hostname:'127.0.0.1',port:req.url.startsWith('/api/v1')?38081:3331,path:req.url,method:req.method,headers:{...req.headers,'x-forwarded-host':'127.0.0.1:3301','x-forwarded-proto':'http'}},r=>{res.writeHead(r.statusCode,r.headers);r.pipe(res)});up.on('error',()=>{res.writeHead(502);res.end()});req.pipe(up)});
await new Promise(r=>proxy.listen(3301,'127.0.0.1',r));
const browser=await chromium.launch(),admin=await browser.newContext(),user=await browser.newContext();
async function call(c,path,method='GET',data,idem){
 const headers={origin,'sec-fetch-site':'same-origin'};
 if(method!=='GET'){headers['x-csrf-token']=(await (await c.request.get(origin+'/api/v1/bootstrap')).json()).data.csrf_token;if(idem)headers['Idempotency-Key']=idem;}
 const r=await c.request.fetch(origin+'/api/v1'+path,{method,data,headers});return {status:r.status(),body:r.status()===204?null:await r.json()};
}
async function ok(...args){const r=await call(...args);if(r.status<200||r.status>=300)throw Error(args[1]+' '+r.status+' '+JSON.stringify(r.body));return r.body?.data;}
async function check(id,name,fn){try{await fn();results.push({id,name,result:'PASS'})}catch(e){results.push({id,name,result:'FAIL',error:String(e)})}console.log(id,results.at(-1).result)}
try{
 await ok(admin,'/auth/login','POST',{username:env.ADMIN_USERNAME,password:env.ADMIN_PASSWORD,browser_ui_locale:'en-US'});
 const registered=await ok(user,'/auth/register','POST',{username:'qa3_cards_'+Date.now(),password:env.ADMIN_PASSWORD,password_confirmation:env.ADMIN_PASSWORD,ui_locale:'en-US'});
 await ok(admin,'/admin/users/'+registered.actor.id+'/point-grants','POST',{points:'200',reason:'Independent card verification'},randomUUID());
 const models=await ok(admin,'/admin/models'),a=models.items.find(m=>m.enabled&&!m.retired_at);
 if(!a)throw Error('Active local model required');
 const b=(await ok(admin,'/admin/models','POST',{display_name:'Secondary model',description:null,openrouter_model_id:'local/secondary'})).model;
 async function define(name,ids){const r=await ok(admin,'/admin/growth/items','POST',{kind:'model_trial',name:{zh_CN:null,en_US:name},description:{zh_CN:null,en_US:'Model access for three days'},exchange_price:'5',activation_ttl_seconds:2592000,effect:{kind:'model_trial',model_ids:ids,trial_seconds:259200,retirement_points:'20'}});return(await ok(admin,'/admin/growth/items/'+r.item.id+'/listing','PUT',{listed:true,expected_revision:r.revision})).item;}
 const single=await define('Retired model card',[a.id]),mixed=await define('Mixed model card',[a.id,b.id]);
 const owned=(await ok(user,'/shop/exchanges','POST',{definition_id:single.id,quantity:1},randomUUID())).receipt.items[0].item_id;
 async function retire(id){const impact=await ok(admin,'/admin/models/'+id+'/removal-impact');await ok(admin,'/admin/models/'+id,'DELETE',{expected_revision:impact.revision,confirmation_token:impact.confirmation_token,confirmed:true});}
 await retire(a.id);
 const page=await admin.newPage(),up=await user.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));up.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(10000);up.setDefaultTimeout(10000);
 const ready=p=>p.waitForFunction(()=>document.documentElement.dataset.appReady==='true');
 async function edit(name){await page.goto(origin+'/admin/growth');await ready(page);await page.locator('tr').filter({hasText:name}).getByRole('button',{name:t('edit'),exact:true}).click();return page.locator('dialog[open]');}
 const select=d=>d.getByRole('listbox',{name:t('model'),exact:true}),save=d=>d.getByRole('button',{name:t('save'),exact:true}).click();
 let editTrace,refundTrace;
 await check('S05','Admin UI updates retained retired model; customer must re-preview changed price before refund',async()=>{
  await up.goto(origin+'/account/items');await ready(up);await up.locator('.item-model').getByRole('button',{name:t('refund'),exact:true}).click();let ud=up.locator('dialog[open]');await expect(ud).toContainText('20');
  const d=await edit(single.name.en_US);expect(await select(d).evaluate(e=>Array.from(e.selectedOptions,o=>o.value))).toEqual([a.id]);await expect(select(d).locator('option').filter({hasText:a.display_name})).toContainText(t('retired'));
  await d.getByLabel(t('retirementpoints'),{exact:true}).fill('35');await select(d).scrollIntoViewIfNeeded();await page.screenshot({path:new URL('S05-retired-editor.png',out).pathname,fullPage:true});
  const saved=page.waitForResponse(r=>r.request().method()==='PUT'&&r.url().endsWith('/admin/growth/items/'+single.id));await save(d);const response=await saved;expect(response.status()).toBe(200);await expect(d).toHaveCount(0);
  const actual=(await ok(admin,'/admin/growth/items/'+single.id)).item;editTrace={status:response.status(),body:response.request().postDataJSON(),storedPoints:actual.effect.retirement_points,storedModels:actual.effect.model_ids};expect(actual.effect.model_ids).toEqual(single.effect.model_ids);expect(actual.effect.retirement_points).toBe('35');
  const reloaded=await edit(single.name.en_US);await expect(reloaded.getByLabel(t('retirementpoints'),{exact:true})).toHaveValue('35');await page.keyboard.press('Escape');
  const stale=up.waitForResponse(r=>r.request().method()==='POST'&&r.url().endsWith('/retirement-refund'));await ud.getByRole('button',{name:t('confirm'),exact:true}).click();expect((await stale).status()).toBe(409);await expect(ud.getByRole('button',{name:t('retry'),exact:true})).toBeVisible();expect((await ok(user,'/me/growth')).points).toBe('195');
  await ud.getByRole('button',{name:t('retry'),exact:true}).click();await expect(ud).toContainText('35');await up.screenshot({path:new URL('S05-current-refund.png',out).pathname,fullPage:true});
  const settled=up.waitForResponse(r=>r.request().method()==='POST'&&r.url().endsWith('/retirement-refund'));await ud.getByRole('button',{name:t('confirm'),exact:true}).click();const settlement=await settled;expect(settlement.status()).toBe(200);await expect(ud).toHaveCount(0);const receipt=(await settlement.json()).data.receipt;expect(receipt.points_delta).toBe('35');expect((await ok(user,'/me/growth')).points).toBe('230');
  const replay=await ok(user,'/me/items/'+owned+'/retirement-refund','POST',settlement.request().postDataJSON(),randomUUID());expect(replay.receipt.id).toBe(receipt.id);expect((await ok(user,'/me/growth')).points).toBe('230');refundTrace={oldStatus:409,currentAmount:receipt.points_delta,finalBalance:'230',replaySameReceipt:true};
  await expect(up.locator('.item-model button')).toBeDisabled();
 });
 await check('S06','Mixed live and retired model selection remains intact when changing retirement points on mobile',async()=>{
  await page.setViewportSize({width:320,height:760});const d=await edit(mixed.name.en_US);expect((await select(d).evaluate(e=>Array.from(e.selectedOptions,o=>o.value))).sort()).toEqual([a.id,b.id].sort());await d.getByLabel(t('retirementpoints'),{exact:true}).fill('45');await select(d).scrollIntoViewIfNeeded();await page.screenshot({path:new URL('S06-mixed-mobile.png',out).pathname,fullPage:true});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await save(d);await expect(d).toHaveCount(0);expect((await ok(admin,'/admin/growth/items/'+mixed.id)).item.effect).toEqual({...mixed.effect,retirement_points:'45'});await page.setViewportSize({width:1440,height:1000});
 });
 await check('S07','New card cannot select a retired model or submit an empty model selection',async()=>{
  await page.getByRole('button',{name:t('newitem'),exact:true}).click();const d=page.locator('dialog[open]');await expect(select(d).locator('option[value="'+a.id+'"]')).toHaveCount(0);
  for(const [key,value]of [['name.en','New QA card'],['desc.en','Three days of access'],['price','5'],['deadline','30'],['duration','3'],['retirementpoints','10']])await d.getByLabel(t(key),{exact:true}).fill(value);
  let sent=0;const observe=r=>{if(r.method()==='POST'&&r.url().endsWith('/admin/growth/items'))sent++;};page.on('request',observe);await save(d);expect(await select(d).evaluate(e=>e.validity.valueMissing)).toBe(true);expect(sent).toBe(0);await select(d).selectOption(b.id);await save(d);await expect(d).toHaveCount(0);expect(sent).toBe(1);page.off('request',observe);
 });
 // The model catalog is paginated; existing references must not be lost during edits.
 for(let i=0;i<20;i++)await ok(admin,'/admin/models','POST',{display_name:'Catalog model '+i,description:null,openrouter_model_id:'local/catalog-'+i});
 const late=(await ok(admin,'/admin/models','POST',{display_name:'Later-page retired model',description:null,openrouter_model_id:'local/later-page'})).model;
 const paged=await define('Later-page reference card',[b.id,late.id]);await retire(late.id);
 await check('S08','Paginated catalog does not silently discard an existing later-page reference during a visible selection change',async()=>{
  const d=await edit(paged.name.en_US);const currentOptions=await select(d).locator('option').evaluateAll(es=>es.map(e=>({value:e.value,text:e.textContent,selected:e.selected})));
  // Select another visible non-retired model in addition to the existing visible one.
  const other=currentOptions.find(o=>o.value!==b.id);if(!other)throw Error('Expected an additional first-page model');
  await select(d).selectOption([b.id,other.value]);await d.getByLabel(t('retirementpoints'),{exact:true}).fill('60');
  const pending=page.waitForResponse(r=>r.request().method()==='PUT'&&r.url().endsWith('/admin/growth/items/'+paged.id));await save(d);const response=await pending;const actual=(await ok(admin,'/admin/growth/items/'+paged.id)).item;
  writeFileSync(new URL('S08-paginated-reference.json',out),JSON.stringify({beforeModels:paged.effect.model_ids,firstPageOptions:currentOptions,request:response.request().postDataJSON(),status:response.status(),afterModels:actual.effect.model_ids,expectedRetainedModel:late.id},null,2));await page.screenshot({path:new URL('S08-after-save.png',out).pathname,fullPage:true});
  expect(actual.effect.model_ids).toContain(late.id);
 });
 writeFileSync(new URL('cards-details.json',out),JSON.stringify({editTrace,refundTrace,pageErrors:errors},null,2));expect(errors).toEqual([]);
}catch(e){results.push({id:'setup',result:'FAIL',error:String(e)})}
finally{writeFileSync(new URL('cards-results.json',out),JSON.stringify({results,realProviderCalls:0},null,2));console.log(JSON.stringify(results,null,2));await browser.close();await new Promise(r=>proxy.close(r));if(results.some(r=>r.result==='FAIL'))process.exitCode=1}
