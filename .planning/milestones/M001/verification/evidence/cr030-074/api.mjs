import{readFileSync}from'node:fs';import{join}from'node:path';import{randomUUID}from'node:crypto';
import{request,dir,origin,login,api,sql,quote,recorder}from'./lib.mjs';
const f=JSON.parse(readFileSync(join(dir,'fixtures.json'))),r=recorder('api');
const admin=await request.newContext(),learner=await request.newContext(),guest=await request.newContext();
const wrap=c=>({request:c,addCookies:async()=>{}});const csrf=await login(wrap(admin),'qa074_admin');await login(wrap(learner),'qa074_other');
const get=(c,path)=>api({request:c},'GET',path);
const put=(path,data)=>api({request:admin},'PUT',path,csrf,data);
const user=f.users.qa074_other,path='/api/v1/admin/users/'+user;
const quota=async(name,expected)=>{const x=await get(admin,path);r.record(name+' HTTP',x.status,200);r.record(name+' quota',x.body.data.user.generation_quota,expected);r.record(name+' no-store',x.headers['cache-control'],'no-store');};
const finite=n=>({kind:'limited',remaining:n});
try{
 for(const[c,name,status]of[[guest,'guest',401],[learner,'learner',403]])for(const id of[user,'bad-id','00000000-0000-0000-0000-000000000001'])r.record(name+' permission '+id,(await get(c,'/api/v1/admin/users/'+id)).status,status);
 r.record('admin unknown',(await get(admin,'/api/v1/admin/users/00000000-0000-0000-0000-000000000001')).status,404);
 await quota('no model or credential',finite(5));
 const detail=(await get(admin,path)).body.data.user;
 r.record('exact detail keys',Object.keys(detail).sort(),['id','username','role','plan_code','status','ui_locale','created_at','learning_batch_count','generation_quota'].sort());
 r.record('admin quota null',(await get(admin,'/api/v1/admin/users/'+f.users.qa074_admin)).body.data.user.generation_quota,null);
 const baseline=sql('SELECT quota_reset_at FROM wordweave.accounts WHERE id='+quote(user));
 for(let i=0;i<4;i++)await get(admin,path);
 r.record('GET no reset',sql('SELECT quota_reset_at FROM wordweave.accounts WHERE id='+quote(user)),baseline);
 const model=randomUUID();sql('INSERT INTO wordweave.ai_models(id,display_name,provider_model_id) VALUES('+[model,'QA quota fixture','qa/no-provider'].map(quote).join(',')+');');
 const run=(owner,age,status,charged)=>'INSERT INTO wordweave.generation_runs(account_id,credited_account_id,group_code_snapshot,model_id,model_display_name_snapshot,provider_model_id_snapshot,meaning_language,scenario,length_code,minimum_words_snapshot,max_entries_snapshot,call_status,quota_charged,counts_toward_cumulative,started_at,completed_at) VALUES('+[quote(owner),quote(owner),quote('registered'),quote(model),quote('QA quota fixture'),quote('qa/no-provider'),quote('en'),quote('story'),quote('short'),50,5,quote(status),charged,status==='active'?false:charged,"now()-interval "+quote(age),status==='active'?'NULL':'now()'].join(',')+');';
 sql(run(user,'1 hour','valid',true)+run(user,'2 hours','user_cancelled',true)+run(user,'24 hours 10 seconds','valid',true)+run(user,'23 hours 50 minutes','server_failed',false)+run(f.users.qa074_empty,'1 hour','valid',true));
 await quota('charged cancel + valid; expired/refund/other excluded',finite(3));
 sql(run(user,'5 seconds','active',true));await quota('active reservation',finite(2));
 sql("UPDATE wordweave.generation_runs SET call_status='stream_failed',quota_charged=false,counts_toward_cumulative=false,completed_at=now() WHERE account_id="+quote(user)+" AND call_status='active'");
 await quota('refund observed',finite(3));
 sql("UPDATE wordweave.entitlement_groups SET rolling_quota_limit=1 WHERE code='registered'");await quota('lowered policy clamps',finite(0));
 sql("UPDATE wordweave.entitlement_groups SET rolling_quota_limit=5 WHERE code='registered'");
 for(const[code,q]of[['plus',finite(0)],['pro',{kind:'unlimited',remaining:null}],['basic',finite(5)]]){
 const x=await put(path+'/group',{group_code:code,confirmed:true});r.record('PUT '+code+' status',x.status,200);r.record('PUT '+code+' full atomic projection',{plan:x.body.data.user.plan_code,quota:x.body.data.user.generation_quota,reset:x.body.data.quota_reset,count:x.body.data.user.learning_batch_count},{plan:code,quota:q,reset:true,count:1});await quota('GET after '+code,q);}
 r.record('malformed extra quota write',(await put(path+'/group',{group_code:'pro',confirmed:true,generation_quota:{kind:'unlimited',remaining:null}})).status,400);
 r.record('cannot change admin',(await put('/api/v1/admin/users/'+f.users.qa074_admin+'/group',{group_code:'pro',confirmed:true})).status,404);
 const before=sql('SELECT quota_reset_at FROM wordweave.accounts WHERE id='+quote(user));r.record('unconfirmed rejected',(await put(path+'/group',{group_code:'pro',confirmed:false})).status,422);r.record('rejected no reset',sql('SELECT quota_reset_at FROM wordweave.accounts WHERE id='+quote(user)),before);
 const own=await get(admin,path+'/batches/'+f.batches[2].id),cross=await get(admin,path+'/batches/'+f.batches[0].id);
 r.record('real owner batch',own.status,200);r.record('wrong user batch',cross.status,404);
 for(const method of['PATCH','DELETE','POST'])r.record('admin batch is read only '+method,(await api({request:admin},method,path+'/batches/'+f.batches[2].id,csrf,{})).status,405);
 let cursor=null,all=[],pages=0;
 do{const x=await get(admin,'/api/v1/admin/users?username=qa074_search&limit=20'+(cursor?'&cursor='+encodeURIComponent(cursor):''));r.record('search summary no quota '+pages,x.body.data.items.some(i=>'generation_quota'in i),false);all.push(...x.body.data.items.map(x=>x.username));cursor=x.body.meta.next_cursor;pages++;}while(cursor&&pages<10);
 r.record('search 3 pages',pages,3);r.record('search no missing duplicate',new Set(all).size,45);r.record('search backend sorted',all,[...all].sort());
 const p1=await get(admin,'/api/v1/admin/users?username=qa074_search&limit=20');
 r.record('cursor wrong scope',(await get(admin,'/api/v1/admin/users?username=qa074_other&cursor='+encodeURIComponent(p1.body.meta.next_cursor))).status,422);
 const timings=[];for(let i=0;i<20;i++){const start=performance.now();await get(admin,path);timings.push(performance.now()-start);}r.record('detail local p95 under 1s',timings.sort((a,b)=>a-b)[18]<1000,true);
 r.record('no real credential',sql('SELECT count(*) FROM wordweave.openrouter_credentials'),'0');
} catch(e){r.error('execution',e);}finally{await admin.dispose();await learner.dispose();await guest.dispose();r.save();}
