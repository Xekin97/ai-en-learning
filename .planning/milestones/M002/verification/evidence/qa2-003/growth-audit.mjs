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
 const {execFileSync}=await import('node:child_process');const sql=q=>execFileSync('/opt/homebrew/opt/postgresql@18/bin/psql',[env.APP_DATABASE_URL,'-X','-t','-A','-v','ON_ERROR_STOP=1','-c',q],{encoding:'utf8'}).trim();
 await ok(admin,'/auth/login','POST',{username:env.ADMIN_USERNAME,password:env.ADMIN_PASSWORD,browser_ui_locale:'en-US'});
 const username=sql("SELECT username FROM wordweave.accounts WHERE username LIKE 'qa3_control_%' ORDER BY created_at DESC LIMIT 1");
 await ok(user,'/auth/login','POST',{username,password:env.ADMIN_PASSWORD,browser_ui_locale:'en-US'});
 const starting=await ok(user,'/me/growth');expect(starting.saved_total).toBe(1);expect(starting.checkin.signed_today).toBe(true);
 const config=await ok(admin,'/admin/growth/levels');const second=config.items.find(r=>r.level_number===2);const input={expected_revision:config.revision,changes:[{client_key:randomUUID(),id:second.id,value:{level_number:2,min_experience:'10',reward_enabled:true,reward:{points:'9',item_definition_id:null,item_count:0}}}]};
 const impact=await ok(admin,'/admin/growth/levels/impact-preview','POST',input);await ok(admin,'/admin/growth/levels','PUT',{...input,confirmation_token:impact.confirmation_token,confirmed:true});
 async function achievement(kind,name,reward){const current=await ok(admin,'/admin/growth/achievements?kind='+kind);const saved=await ok(admin,'/admin/growth/achievements','PUT',{kind,expected_revision:current.revision,changes:[{client_key:randomUUID(),id:null,value:{threshold:1,enabled:true,name:{zh_CN:null,en_US:name},title:{zh_CN:null,en_US:'Original title'},description:{zh_CN:null,en_US:'<b>Plain achievement description</b>'},reward}}]});return saved.configuration.items.find(x=>x.name.en_US===name);}
 const earned=await achievement('saved_passages','First saved story',{points:'7',experience:'20',item_definition_id:null,item_count:0});
 const page=await user.newPage(),events=[];page.on('pageerror',e=>events.push({url:page.url(),message:e.message}));page.on('console',m=>{if(/hydration|mismatch/i.test(m.text()))events.push({url:page.url(),message:m.text()})});
 const ready=()=>page.waitForFunction(()=>document.documentElement.dataset.appReady==='true');let claimReceipt;
 await check('S09','Earned achievement and level rewards are not auto-paid; UI claims achievement then leaves upgrade reward pending',async()=>{
  const before=await ok(user,'/me/growth');expect(before.points).toBe(starting.points);expect(before.experience).toBe(starting.experience);
  const award=(await ok(user,'/me/growth/achievements')).items.find(x=>x.tier_id===earned.id);expect(award.state).toBe('claimable');expect(award.claimed_at).toBeNull();expect(award.title).toBe('Original title');
  await page.goto(origin+'/account/growth');await ready();const card=page.locator('.achievement').filter({hasText:'First saved story'});await expect(card).toContainText('<b>Plain achievement description</b>');await expect(card.locator('b')).toHaveCount(0);
  const response=page.waitForResponse(r=>r.request().method()==='POST'&&r.url().endsWith('/achievements/'+earned.id+'/claim'));await card.getByRole('button',{name:t('claim'),exact:true}).click();const result=await response;expect(result.status()).toBe(200);claimReceipt=(await result.json()).data.receipt;
  const after=await ok(user,'/me/growth');expect(BigInt(after.points)-BigInt(starting.points)).toBe(7n);expect(BigInt(after.experience)-BigInt(starting.experience)).toBe(20n);expect(after.level.number).toBe(2);
  const pending=(await ok(user,'/me/growth/level-rewards')).items.find(r=>r.level_id===second.id);expect(pending.state).toBe('claimable');expect(pending.claimed_at).toBeNull();await page.screenshot({path:new URL('S09-manual-rewards.png',out).pathname,fullPage:true});
 });
 await check('S10','User explicitly claims level reward; repeated achievement claim with a new key returns original receipt',async()=>{
  const level=page.locator('.level-reward').filter({hasText:'Lv. 2'});await level.getByRole('button',{name:t('claimlevel'),exact:true}).click();await expect(level.getByRole('button',{name:t('claimed'),exact:true})).toBeDisabled();const after=await ok(user,'/me/growth');expect(BigInt(after.points)-BigInt(starting.points)).toBe(16n);
  const replay=await ok(user,'/me/growth/achievements/'+earned.id+'/claim','POST',{},randomUUID());expect(replay.receipt.id).toBe(claimReceipt.id);expect((await ok(user,'/me/growth')).points).toBe(after.points);
 });
 const model=(await ok(admin,'/admin/models','POST',{display_name:'Reward availability fixture',description:null,openrouter_model_id:'local/reward'})).model;if(!/^[a-f0-9-]{36}$/.test(model.id))throw Error('Unexpected fixture ID');sql(`UPDATE wordweave.ai_models SET enabled=true WHERE id='${model.id}'`);
 const rewardCard=(await ok(admin,'/admin/growth/items','POST',{kind:'model_trial',name:{zh_CN:null,en_US:'Reward trial'},description:{zh_CN:null,en_US:'Test reward model access'},exchange_price:'10',activation_ttl_seconds:86400,effect:{kind:'model_trial',model_ids:[model.id],trial_seconds:86400,retirement_points:'5'}})).item;
 const blocked=await achievement('checkin_streak','First check-in',{points:'3',experience:'2',item_definition_id:rewardCard.id,item_count:1});
 await ok(user,'/me/growth/achievements');const removal=await ok(admin,'/admin/models/'+model.id+'/removal-impact');await ok(admin,'/admin/models/'+model.id,'DELETE',{expected_revision:removal.revision,confirmation_token:removal.confirmation_token,confirmed:true});
 await check('S11','Unavailable reward blocks the entire award while preserving achievement and title',async()=>{
  const before=await ok(user,'/me/growth'),aw=(await ok(user,'/me/growth/achievements')).items.find(a=>a.tier_id===blocked.id);expect(aw.state).toBe('blocked');expect(aw.block_reason).toBe('reward_unavailable');expect(aw.achieved_at).not.toBeNull();expect(aw.title).toBe('Original title');
  const denied=await call(user,'/me/growth/achievements/'+blocked.id+'/claim','POST',{},randomUUID());expect(denied.status).toBe(422);expect(denied.body.code).toBe('reward_unavailable');const after=await ok(user,'/me/growth');expect(after.points).toBe(before.points);expect(after.experience).toBe(before.experience);
  await page.reload();await ready();const card=page.locator('.achievement').filter({hasText:'First check-in'});await expect(card.getByRole('button',{name:t('claim'),exact:true})).toBeDisabled();await expect(card).toContainText(t('reward.blocked'));await page.screenshot({path:new URL('S11-blocked-reward.png',out).pathname,fullPage:true});
 });
 await check('S12','Reconfigured valid but unlisted reward can be claimed whole; earned title remains unchanged',async()=>{
  const card=(await ok(admin,'/admin/growth/items','POST',{kind:'extra_credit',name:{zh_CN:null,en_US:'Gift credits'},description:{zh_CN:null,en_US:'Two gift creations'},exchange_price:'10',activation_ttl_seconds:86400,effect:{kind:'extra_credit',extra_count:2}})).item;expect(card.listed).toBe(false);
  const current=await ok(admin,'/admin/growth/achievements?kind=checkin_streak'),row=current.items.find(a=>a.id===blocked.id);const {id,kind,...fields}=row;await ok(admin,'/admin/growth/achievements','PUT',{kind,expected_revision:current.revision,changes:[{client_key:randomUUID(),id,value:{...fields,title:{zh_CN:null,en_US:'New configured title'},reward:{...row.reward,item_definition_id:card.id}}}]});
  const before=await ok(user,'/me/growth'),award=(await ok(user,'/me/growth/achievements')).items.find(a=>a.tier_id===blocked.id);expect(award.state).toBe('claimable');expect(award.title).toBe('Original title');const paid=await ok(user,'/me/growth/achievements/'+blocked.id+'/claim','POST',{},randomUUID());expect(paid.receipt.points_delta).toBe('3');expect(paid.receipt.experience_delta).toBe('2');expect(paid.receipt.items).toHaveLength(1);expect(paid.receipt.items[0].definition_id).toBe(card.id);expect(BigInt((await ok(user,'/me/growth')).points)-BigInt(before.points)).toBe(3n);
 });
 writeFileSync(new URL('growth-runtime.json',out),JSON.stringify({events},null,2));
}catch(e){results.push({id:'setup',result:'FAIL',error:String(e)})}
finally{writeFileSync(new URL('growth-results.json',out),JSON.stringify({results,realProviderCalls:0},null,2));console.log(JSON.stringify(results,null,2));await browser.close();await new Promise(r=>proxy.close(r));if(results.some(r=>r.result==='FAIL'))process.exitCode=1}
