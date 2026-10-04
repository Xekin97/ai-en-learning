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
 const previous=JSON.parse(readFileSync(new URL('S08-paginated-reference.json',out)));const visible=previous.beforeModels[0];
 const late=(await ok(admin,'/admin/models','POST',{display_name:'Hidden later-page model',description:null,openrouter_model_id:'local/pagination-repro'})).model;
 async function define(name,ids){return(await ok(admin,'/admin/growth/items','POST',{kind:'model_trial',name:{zh_CN:null,en_US:name},description:{zh_CN:null,en_US:'Pagination reproduction'},exchange_price:'0',activation_ttl_seconds:86400,effect:{kind:'model_trial',model_ids:ids,trial_seconds:86400,retirement_points:'20'}})).item;}
 const mixed=await define('Pagination control-click',[visible,late.id]),sole=await define('Pagination single reference',[late.id]);const impact=await ok(admin,'/admin/models/'+late.id+'/removal-impact');await ok(admin,'/admin/models/'+late.id,'DELETE',{expected_revision:impact.revision,confirmation_token:impact.confirmation_token,confirmed:true});
 const page=await admin.newPage();page.setDefaultTimeout(12000);const traces=[];
 async function edit(name){await page.goto(origin+'/admin/growth');await page.waitForFunction(()=>document.documentElement.dataset.appReady==='true');await page.locator('tr').filter({hasText:name}).getByRole('button',{name:t('edit'),exact:true}).click();return page.locator('dialog[open]');}
 await check('S08-repro','Actual modifier-click adds a visible option without intending to remove the hidden existing model',async()=>{
  const d=await edit(mixed.name.en_US),s=d.getByRole('listbox',{name:t('model'),exact:true});const options=await s.locator('option').evaluateAll(os=>os.map(o=>({value:o.value,text:o.textContent,selected:o.selected})));const other=options.find(o=>o.value!==visible);expect(await s.locator('option[value="'+late.id+'"]').count()).toBe(0);await s.locator('option[value="'+other.value+'"]').click({modifiers:['Meta']});
  const selected=await s.evaluate(e=>Array.from(e.selectedOptions,o=>o.value));expect(selected.sort()).toEqual([visible,other.value].sort());await page.screenshot({path:new URL('S08-modifier-click-before-save.png',out).pathname,fullPage:true});
  const response=page.waitForResponse(r=>r.request().method()==='PUT'&&r.url().endsWith('/growth/items/'+mixed.id));await d.getByRole('button',{name:t('save'),exact:true}).click();const r=await response,actual=(await ok(admin,'/admin/growth/items/'+mixed.id)).item;traces.push({id:'modifier-click',before:mixed.effect.model_ids,visibleSelected:selected,request:r.request().postDataJSON(),status:r.status(),after:actual.effect.model_ids,hiddenReference:late.id});expect(actual.effect.model_ids).toContain(late.id);
 });
 await check('S13','Existing sole later-page retired reference can be priced without loading unrelated catalog options',async()=>{
  const d=await edit(sole.name.en_US),s=d.getByRole('listbox',{name:t('model'),exact:true});const requests=[];page.on('request',r=>{if(r.method()==='PUT'&&r.url().endsWith('/growth/items/'+sole.id))requests.push(r.postDataJSON())});
  await d.getByLabel(t('retirementpoints'),{exact:true}).fill('35');await d.getByRole('button',{name:t('save'),exact:true}).click();await page.waitForTimeout(300);
  const beforeMore={requests:requests.length,selected:await s.evaluate(e=>Array.from(e.selectedOptions,o=>o.value)),invalid:await s.evaluate(e=>({valueMissing:e.validity.valueMissing,message:e.validationMessage})),storedPoints:(await ok(admin,'/admin/growth/items/'+sole.id)).item.effect.retirement_points};await page.screenshot({path:new URL('S13-empty-selection.png',out).pathname,fullPage:true});
  await d.getByRole('button',{name:t('a.more'),exact:true}).click();await expect(s.locator('option[value="'+late.id+'"]').last()).toBeAttached();expect(await s.evaluate(e=>Array.from(e.selectedOptions,o=>o.value))).toEqual([late.id]);await d.getByRole('button',{name:t('save'),exact:true}).click();await expect(d).toHaveCount(0);const after=(await ok(admin,'/admin/growth/items/'+sole.id)).item;traces.push({id:'sole-reference',beforeMore,afterMore:{requests:requests.length,storedPoints:after.effect.retirement_points,modelIds:after.effect.model_ids}});expect(beforeMore.requests).toBe(1);
 });
 writeFileSync(new URL('pagination-details.json',out),JSON.stringify({traces},null,2));
}catch(e){results.push({id:'setup',result:'FAIL',error:String(e)})}
finally{writeFileSync(new URL('pagination-results.json',out),JSON.stringify({results},null,2));console.log(JSON.stringify(results,null,2));await browser.close();await new Promise(r=>proxy.close(r));if(results.some(r=>r.result==='FAIL'))process.exitCode=1}
