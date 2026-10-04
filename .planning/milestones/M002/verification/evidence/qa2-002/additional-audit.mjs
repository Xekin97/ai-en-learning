import {createRequire} from 'node:module';
import {readFileSync,writeFileSync} from 'node:fs';
import {createServer,request as httpRequest} from 'node:http';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
const require=createRequire(process.cwd()+'/frontend/package.json'),{chromium,expect}=require('@playwright/test');
const copy=JSON.parse(readFileSync(process.cwd()+'/.planning/milestones/M002/design/copy.json'));const t=k=>copy.static['en.'+k]??copy.templates['en.'+k];
const work=readFileSync('/tmp/wordweave-fe-m002-current','utf8'),env=JSON.parse(readFileSync(work+'/env.json'));
if(!env.APP_DATABASE_URL.includes('63541/wordweave_fe_m002')||env.OPENROUTER_BASE_URL!=='http://127.0.0.1:38082')throw Error('Isolated stack required');
const origin='http://127.0.0.1:3301',out=new URL('./',import.meta.url),results=[];
const passage =
  "A thoughtful student learns(learn) by building a steady learning(learn) routine through daily reading and discussion. Each morning the student reviews a few ideas, connects them with practical examples, and writes a short reflection. Friends later compare their observations, ask clear questions, and share useful explanations about what they learned(learn). This patient practice makes new knowledge easier to remember and apply with confidence.";
let calls = 0;
const provider = createServer(async (req, res) => {
  if (req.url === "/models") {
    res.setHeader("content-type", "application/json");
    res.end(
      JSON.stringify({
        data: [
          {
            id: "provider/qa-refund-retest",
            supported_parameters: ["structured_outputs"],
          },
        ],
      }),
    );
    return;
  }
  if (req.url !== "/chat/completions") {
    res.writeHead(404);
    res.end();
    return;
  }
  let body = "";
  for await (const c of req) body += c;
  calls++;
  const probe = JSON.parse(body).messages.some((m) =>
    m.content.includes("fixed compatibility probe"),
  );
  const candidate = {
    passage:
      passage +
      (probe
        ? " The group also discussed vulnerability(vulnerable) with empathy."
        : ""),
    tags: ["study"],
    targets: {
      learn: {
        entry_meaning: "gain knowledge through study",
        hint_phrase:
          "learning(learn) through learned(learn) examples while learning(learn)",
      },
    },
  };
  if (probe)
    candidate.targets.vulnerable = {
      entry_meaning: "open to harm",
      hint_phrase: "vulnerable(vulnerable) communities",
    };
  res.setHeader("content-type", "text/event-stream");
  res.end(
    "data: " +
      JSON.stringify({
        choices: [{ delta: { content: JSON.stringify(candidate) } }],
      }) +
      "\n\ndata: [DONE]\n\n",
  );
});
await new Promise((r) => provider.listen(38082, "127.0.0.1", r));

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
const details={};
const sql=(query)=>execFileSync('/opt/homebrew/opt/postgresql@18/bin/psql',[env.APP_DATABASE_URL,'-A','-t','-v','ON_ERROR_STOP=1','-c',query],{encoding:'utf8'}).trim();
try{
 await ok(admin,'/auth/login','POST',{username:env.ADMIN_USERNAME,password:env.ADMIN_PASSWORD,browser_ui_locale:'en-US'});
 await check('R07-repro','Account with consumed visitor claim cannot be deleted; fresh-account control can be deleted',async()=>{
  const username=sql("SELECT username FROM wordweave.accounts WHERE username LIKE 'qa2_learner_%' ORDER BY created_at DESC LIMIT 1");
  const owner=await browser.newContext(),control=await browser.newContext();
  try{
   const identity=await ok(owner,'/auth/login','POST',{username,password:'QA-temporary-password-2026',browser_ui_locale:'en-US'}),uid=identity.actor.id;
   const before=(await ok(owner,'/me/batches')).items.map(x=>x.id);
   const beforeClaims=Number(sql("SELECT count(*) FROM wordweave.visitor_claims WHERE consumed_account_id='"+uid+"'"));
   const deletion=await call(owner,'/me/account','DELETE',{current_password:'QA-temporary-password-2026',confirmed:true});
   const after=(await ok(owner,'/me/batches')).items.map(x=>x.id);
   const afterClaims=Number(sql("SELECT count(*) FROM wordweave.visitor_claims WHERE consumed_account_id='"+uid+"'"));
   await ok(control,'/auth/register','POST',{username:'qa2_delete_control_'+Date.now(),password:env.ADMIN_PASSWORD,password_confirmation:env.ADMIN_PASSWORD,ui_locale:'en-US'});
   const cleanDelete=await call(control,'/me/account','DELETE',{current_password:env.ADMIN_PASSWORD,confirmed:true});
   const cleanRead=await call(control,'/me/account');
   details.accountDelete={expectedStatus:204,actualStatus:deletion.status,problem:deletion.body,consumedClaimsBefore:beforeClaims,consumedClaimsAfter:afterClaims,batchIdsUnchanged:JSON.stringify(before)===JSON.stringify(after),cleanAccountDeleteStatus:cleanDelete.status,cleanAccountReadAfterDeleteStatus:cleanRead.status};
   expect(cleanDelete.status).toBe(204);expect(cleanRead.status).toBe(401);expect(beforeClaims).toBeGreaterThan(0);expect(after).toEqual(before);expect(afterClaims).toBe(beforeClaims);expect(deletion.status).toBe(204);
  }finally{await owner.close();await control.close()}
 });
 const created=await ok(admin,'/admin/models','POST',{display_name:'QA refund retest model',description:'Loopback only',openrouter_model_id:'provider/qa-refund-retest'});
 const modelId=created.model.id;await ok(admin,'/admin/models/'+modelId+'/enable','POST',{expected_revision:created.revision});
 const identity=await ok(user,'/auth/register','POST',{username:'qa2_refund_retest_'+Date.now(),password:env.ADMIN_PASSWORD,password_confirmation:env.ADMIN_PASSWORD,ui_locale:'en-US'});
 await ok(admin,'/admin/users/'+identity.actor.id+'/point-grants','POST',{points:'200',reason:'isolated refund verification'},randomUUID());
 const definition=await ok(admin,'/admin/growth/items','POST',{kind:'model_trial',name:{zh_CN:'退款复验卡',en_US:'Refund verification card'},description:{zh_CN:'隔离验收',en_US:'Isolated verification'},exchange_price:'5',activation_ttl_seconds:2592000,effect:{kind:'model_trial',model_ids:[modelId],trial_seconds:259200,retirement_points:'20'}});
 await ok(admin,'/admin/growth/items/'+definition.item.id+'/listing','PUT',{listed:true,expected_revision:definition.revision});
 const exchange=await ok(user,'/shop/exchanges','POST',{definition_id:definition.item.id,quantity:2},randomUUID());
 const [used,unused]=exchange.receipt.items.map(i=>i.item_id);
 const activate=await ok(user,'/me/items/'+used+'/activation-preview','POST',{});expect(activate.can_activate).toBe(true);
 await ok(user,'/me/items/'+used+'/activate','POST',{confirmation_token:activate.confirmation_token,confirm_discard:false},randomUUID());
 const removal=await ok(admin,'/admin/models/'+modelId+'/removal-impact');await ok(admin,'/admin/models/'+modelId,'DELETE',{expected_revision:removal.revision,confirmation_token:removal.confirmation_token,confirmed:true});
 async function price(points){const d=await ok(admin,'/admin/growth/items/'+definition.item.id),v=d.item;return ok(admin,'/admin/growth/items/'+v.id,'PUT',{kind:v.kind,name:v.name,description:v.description,exchange_price:v.exchange_price,activation_ttl_seconds:v.activation_ttl_seconds,effect:{...v.effect,retirement_points:points},expected_revision:d.revision});}
 await check('R09','CR-006: actual admin API changes retired-model price; stale preview rejected; used/unused refunds use current price exactly once',async()=>{
  const old=await ok(user,'/me/items/'+used+'/refund-preview','POST',{});expect(old.points).toBe('20');expect(old.eligible).toBe(true);expect((await ok(user,'/me/items/'+unused+'/refund-preview','POST',{})).eligible).toBe(true);
  await price('35');const stale=await call(user,'/me/items/'+used+'/retirement-refund','POST',{confirmation_token:old.confirmation_token},randomUUID());expect(stale.status).toBe(409);expect(stale.body.code).toBe('preview_stale');
  const next=await ok(user,'/me/items/'+used+'/refund-preview','POST',{});expect(next.points).toBe('35');const idem=randomUUID(),body={confirmation_token:next.confirmation_token};
  const first=await ok(user,'/me/items/'+used+'/retirement-refund','POST',body,idem),repeat=await ok(user,'/me/items/'+used+'/retirement-refund','POST',body,idem);expect(first.receipt.points_delta).toBe('35');expect(repeat.receipt.id).toBe(first.receipt.id);
  await price('50');const later=await ok(user,'/me/items/'+used+'/retirement-refund','POST',body,randomUUID());expect(later.receipt.id).toBe(first.receipt.id);expect(later.receipt.points_delta).toBe('35');
  const previewUnused=await ok(user,'/me/items/'+unused+'/refund-preview','POST',{});expect(previewUnused.points).toBe('50');const last=await ok(user,'/me/items/'+unused+'/retirement-refund','POST',{confirmation_token:previewUnused.confirmation_token},randomUUID());expect(last.receipt.points_delta).toBe('50');
  const growth=await ok(user,'/me/growth');expect(growth.points).toBe('275');
  details.refunds={oldPreviewStatus:stale.status,oldPreviewCode:stale.body.code,usedRefund:first.receipt.points_delta,usedAfterFurtherPriceChange:later.receipt.points_delta,unusedRefund:last.receipt.points_delta,finalPoints:growth.points,sameReceiptOnBothKindsOfRetry:repeat.receipt.id===first.receipt.id&&later.receipt.id===first.receipt.id};
 });
 await check('R10','CR-006: new definitions still cannot reference a retired model',async()=>{
  const invalid=await call(admin,'/admin/growth/items','POST',{kind:'model_trial',name:{zh_CN:'非法引用',en_US:'Invalid retired reference'},description:{zh_CN:null,en_US:'Isolated validation'},exchange_price:'1',activation_ttl_seconds:100,effect:{kind:'model_trial',model_ids:[modelId],trial_seconds:100,retirement_points:'1'}});expect(invalid.status).toBe(422);expect(invalid.body.field_errors).toContainEqual({field:'/effect/model_ids',code:'invalid_reference'});details.newRetiredReference={status:invalid.status,problem:invalid.body};
 });
}catch(e){results.push({id:'setup',result:'FAIL',error:String(e)})}
finally{
 const pg=readFileSync(work+'/postgres.log','utf8').split('\n').filter(l=>l.includes('ERROR:')||l.includes('CONTEXT:')).filter(l=>l.includes('visitor_claims'));
 writeFileSync(new URL('additional-audit.json',out),JSON.stringify({results,details,postgresConstraintDiagnostics:pg,localProviderCalls:calls,realProviderCalls:0},null,2));
 console.log(JSON.stringify({results,details},null,2));await browser.close();await new Promise(r=>proxy.close(r));await new Promise(r=>provider.close(r));if(results.some(r=>r.result==='FAIL'))process.exitCode=1;
}
