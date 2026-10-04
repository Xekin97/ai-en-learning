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
 const identity=await ok(user,'/auth/register','POST',{username:'qa2_cards_'+Date.now(),password:env.ADMIN_PASSWORD,password_confirmation:env.ADMIN_PASSWORD,ui_locale:'en-US'});
 const uid=identity.actor.id;
 await ok(admin,'/admin/users/'+uid+'/point-grants','POST',{points:'200',reason:'isolated QA'},randomUUID());
 const models=await ok(admin,'/admin/models'),model=models.items.find(x=>x.enabled);
 if(!model)throw Error('Fixture model unavailable');
 const groups=await ok(admin,'/admin/groups'),basic=groups.items.find(x=>x.code==='basic');
 await ok(admin,'/admin/groups/basic','PUT',{expected_revision:groups.revision,priority:basic.priority,rolling_24h_limit:basic.rolling_24h_limit,max_entries:basic.max_entries,allowed_lengths:basic.allowed_lengths,model_ids:[]});
 async function define(kind,effect){const r=await ok(admin,'/admin/growth/items','POST',{kind,name:{zh_CN:'验收卡',en_US:'QA '+kind+' '+(effect.trial_seconds??'')},description:{zh_CN:'隔离验证',en_US:'Isolated QA'},exchange_price:'5',activation_ttl_seconds:2592000,effect});return (await ok(admin,'/admin/growth/items/'+r.item.id+'/listing','PUT',{listed:true,expected_revision:r.revision})).item;}
 const six=await define('model_trial',{kind:'model_trial',model_ids:[model.id],trial_seconds:518400,retirement_points:'20'}),three=await define('model_trial',{kind:'model_trial',model_ids:[model.id],trial_seconds:259200,retirement_points:'20'});
 let item6,item3,firstEnd,secondEnd,firstActivation,key;
 await check('C01','Exchange uses current price and same idempotency key cannot charge twice',async()=>{
   key=randomUUID();const a=await ok(user,'/shop/exchanges','POST',{definition_id:six.id,quantity:1},key),b=await ok(user,'/shop/exchanges','POST',{definition_id:six.id,quantity:1},key);
   expect(a.receipt.id).toBe(b.receipt.id);expect(a.receipt.points_after).toBe('195');item6=a.receipt.items[0].item_id;
   item3=(await ok(user,'/shop/exchanges','POST',{definition_id:three.id,quantity:1},randomUUID())).receipt.items[0].item_id;
   expect((await ok(user,'/me/growth')).points).toBe('190');
 });
 await check('C02','Same-model six-day plus three-day card adds three days to original tail',async()=>{
   const p6=await ok(user,'/me/items/'+item6+'/activation-preview','POST',{});expect(p6.can_activate).toBe(true);
   key=randomUUID();firstActivation=await ok(user,'/me/items/'+item6+'/activate','POST',{confirmation_token:p6.confirmation_token,confirm_discard:false},key);
   firstEnd=firstActivation.item.model_times[0].aggregate_ends_at;
   const p3=await ok(user,'/me/items/'+item3+'/activation-preview','POST',{});expect(p3.can_activate).toBe(true);
   expect(Date.parse(p3.model_times[0].result_ends_at)-Date.parse(firstEnd)).toBe(259200000);
   const second=await ok(user,'/me/items/'+item3+'/activate','POST',{confirmation_token:p3.confirmation_token,confirm_discard:false},randomUUID());secondEnd=second.item.model_times[0].aggregate_ends_at;
   expect(Date.parse(secondEnd)-Date.parse(firstEnd)).toBe(259200000);
   const repeat=await ok(user,'/me/items/'+item6+'/activate','POST',{confirmation_token:p6.confirmation_token,confirm_discard:false},key);expect(repeat.receipt.id).toBe(firstActivation.receipt.id);
 });
 await check('C03','Admin grant cannot deduct points; model card cannot add creation counts',async()=>{
   const negative=await call(admin,'/admin/users/'+uid+'/point-grants','POST',{points:'-1',reason:'invalid negative test'},randomUUID());expect(negative.status).toBeGreaterThanOrEqual(400);expect(negative.status).toBeLessThan(500);
   const invalid=await call(admin,'/admin/growth/items','POST',{kind:'model_trial',name:{zh_CN:null,en_US:'invalid'},description:{zh_CN:null,en_US:'invalid'},exchange_price:'1',activation_ttl_seconds:100,effect:{kind:'model_trial',model_ids:[model.id],trial_seconds:100,retirement_points:'1',extra_count:5}});expect(invalid.status).toBeGreaterThanOrEqual(400);expect(invalid.status).toBeLessThan(500);expect((await ok(user,'/me/growth')).points).toBe('190');
 });
 await check('C04','Base plan reset preserves active trial expiry and separate quota origin',async()=>{
   const def=await define('plan_trial',{kind:'plan_trial',target_plan_code:'pro',trial_seconds:259200});
   const item=(await ok(user,'/shop/exchanges','POST',{definition_id:def.id,quantity:1},randomUUID())).receipt.items[0].item_id;
   const preview=await ok(user,'/me/items/'+item+'/activation-preview','POST',{});expect(preview.can_activate).toBe(true);
   await ok(user,'/me/items/'+item+'/activate','POST',{confirmation_token:preview.confirmation_token,confirm_discard:false},randomUUID());
   const before=await ok(admin,'/admin/users/'+uid+'/benefits'),detail=await ok(admin,'/admin/users/'+uid);
   await ok(admin,'/admin/users/'+uid+'/group','PUT',{group_code:'pro',confirmed:true,expected_base_revision:detail.user.base_revision});
   const after=await ok(admin,'/admin/users/'+uid+'/benefits');expect(after.trial).toEqual(before.trial);expect(after.effective_origin).toBe('base');expect(after.base_plan.code).toBe('pro');
 });
 writeFileSync(work+'/qa-card-fixture.json',JSON.stringify({userId:uid,definitionId:six.id,otherDefinitionId:three.id,item6,item3,modelId:model.id}));
 let oldRefund;
 await check('C05','Retirement makes already-used model cards manually refundable',async()=>{
   const impact=await ok(admin,'/admin/models/'+model.id+'/removal-impact');
   await ok(admin,'/admin/models/'+model.id,'DELETE',{expected_revision:impact.revision,confirmation_token:impact.confirmation_token,confirmed:true});
   oldRefund=await ok(user,'/me/items/'+item6+'/refund-preview','POST',{});expect(oldRefund.eligible).toBe(true);expect(oldRefund.points).toBe('20');
 });
 await check('R08','Real admin page can edit retirement points after the referenced model was retired',async()=>{
   const page=await admin.newPage();page.setDefaultTimeout(7000);const writes=[];
   page.on('request',r=>{if(r.method()==='PUT'&&r.url().endsWith('/admin/growth/items/'+six.id))writes.push(r.postDataJSON())});
   try{await page.goto(origin+'/admin/growth');await page.waitForFunction(()=>document.documentElement.dataset.appReady==='true');
    await page.getByRole('button',{name:t('itemsettings'),exact:true}).click();
    await page.locator('tr').filter({hasText:'QA model_trial 518400'}).getByRole('button',{name:t('edit'),exact:true}).click();
    const dialog=page.locator('dialog[open]');await dialog.getByLabel(t('retirementpoints'),{exact:true}).fill('35');
    await dialog.getByRole('button',{name:t('save'),exact:true}).click();await page.waitForTimeout(500);
    const invalid=await dialog.locator('input:invalid,select:invalid').evaluateAll(es=>es.map(el=>({tag:el.tagName,required:el.required,value:el.value,options:el.tagName==='SELECT'?Array.from(el.options).map(o=>({text:o.textContent,value:o.value,selected:o.selected})):null,message:el.validationMessage})));
    const actual=(await ok(admin,'/admin/growth/items/'+six.id)).item;
    writeFileSync(new URL('admin-retired-card-ui.json',out),JSON.stringify({writesSent:writes.length,invalidControls:invalid,retirementPoints:actual.effect.retirement_points,modelIdsUnchanged:JSON.stringify(actual.effect.model_ids)===JSON.stringify(six.effect.model_ids)},null,2));
    await page.screenshot({path:new URL('admin-retired-card-ui.png',out).pathname,fullPage:true});
    expect(writes.length).toBe(1);expect(actual.effect.retirement_points).toBe('35');
   }finally{await page.close()}
 });
 await check('C06','Updated retirement points invalidate old preview; manual refund uses new amount once',async()=>{
   const d=await ok(admin,'/admin/growth/items/'+six.id),value=d.item;
   await ok(admin,'/admin/growth/items/'+six.id,'PUT',{kind:value.kind,name:value.name,description:value.description,exchange_price:value.exchange_price,activation_ttl_seconds:value.activation_ttl_seconds,effect:{...value.effect,retirement_points:'35'},expected_revision:d.revision});
   const stale=await call(user,'/me/items/'+item6+'/retirement-refund','POST',{confirmation_token:oldRefund.confirmation_token},randomUUID());expect(stale.status).toBe(409);expect(stale.body.error.code).toBe('preview_stale');
   const p=await ok(user,'/me/items/'+item6+'/refund-preview','POST',{});expect(p.points).toBe('35');const key=randomUUID();
   const refunded=await ok(user,'/me/items/'+item6+'/retirement-refund','POST',{confirmation_token:p.confirmation_token},key);expect(refunded.receipt.points_delta).toBe('35');
   const repeat=await ok(user,'/me/items/'+item6+'/retirement-refund','POST',{confirmation_token:p.confirmation_token},key);expect(repeat.receipt.id).toBe(refunded.receipt.id);expect((await ok(user,'/me/growth')).points).toBe('220');
   const latest=await ok(admin,'/admin/growth/items/'+six.id);await ok(admin,'/admin/growth/items/'+six.id,'PUT',{kind:latest.item.kind,name:latest.item.name,description:latest.item.description,exchange_price:latest.item.exchange_price,activation_ttl_seconds:latest.item.activation_ttl_seconds,effect:{...latest.item.effect,retirement_points:'50'},expected_revision:latest.revision});
   const afterPriceChange=await ok(user,'/me/items/'+item6+'/retirement-refund','POST',{confirmation_token:p.confirmation_token},randomUUID());expect(afterPriceChange.receipt.id).toBe(refunded.receipt.id);expect(afterPriceChange.receipt.points_delta).toBe('35');expect((await ok(user,'/me/growth')).points).toBe('220');
   const denied=await call(admin,'/admin/growth/items','POST',{kind:'model_trial',name:{zh_CN:'新卡',en_US:'New retired ref'},description:{zh_CN:null,en_US:'Invalid new reference'},exchange_price:'1',activation_ttl_seconds:100,effect:{kind:'model_trial',model_ids:[model.id],trial_seconds:100,retirement_points:'1'}});expect(denied.status).toBe(422);
 });
 await check('C07','Owned cards page renders real refund/active states without DTO errors',async()=>{
   const page=await user.newPage();await page.goto(origin+'/account/items');await page.waitForFunction(()=>document.documentElement.dataset.appReady==='true');
   await expect(page.locator('.notice.error')).toHaveCount(0);await expect(page.locator('main')).toContainText('QA model_trial');
   await page.screenshot({path:new URL('cards-real.png',out).pathname,fullPage:true});
 });
}catch(e){results.push({id:'setup',result:'FAIL',error:String(e)})}
finally{writeFileSync(new URL('cards-audit.json',out),JSON.stringify({results,realProviderCalls:0},null,2));console.log(JSON.stringify(results,null,2));await browser.close();await new Promise(r=>proxy.close(r));if(results.some(r=>r.result==='FAIL'))process.exitCode=1}
