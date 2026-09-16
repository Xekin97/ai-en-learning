import{randomUUID}from'node:crypto';import{writeFileSync}from'node:fs';import{join}from'node:path';
import{request,dir,origin,password,sql,quote}from'./lib.mjs';
const users={};
for(const username of ['qa077_learner','qa077_other','qa077_empty']){
 const context=await request.newContext();
 const b=await(await context.get(origin+'/api/v1/bootstrap')).json();
 const r=await context.post(origin+'/api/v1/auth/register',{headers:{origin,'sec-fetch-site':'same-origin','x-csrf-token':b.data.csrf_token},data:{username,password,password_confirmation:password,ui_locale:'en-US'}});
 if(r.status()!==201)throw Error('Seed register '+r.status());
 users[username]=sql('SELECT id FROM wordweave.accounts WHERE username='+quote(username));
 await context.dispose();
}
users.qa077_admin=sql("SELECT id FROM wordweave.accounts WHERE username='qa077_admin'");
sql("UPDATE wordweave.entitlement_groups SET rolling_quota_limit=CASE code WHEN 'registered' THEN 5 WHEN 'plus' THEN 0 ELSE NULL END; UPDATE wordweave.accounts SET quota_reset_at=now()-interval '48 hours',created_at='2026-08-10T01:00:00Z'; INSERT INTO wordweave.accounts(username,password_hash,role,group_code,ui_locale) SELECT 'qa077_search_'||lpad(n::text,2,'0'),password_hash,'learner','registered','en-US' FROM wordweave.accounts CROSS JOIN generate_series(1,45)n WHERE username='qa077_learner';");
const batches=[];
for(const [username,label,long]of [['qa077_learner','alpha',false],['qa077_learner','beta',true],['qa077_other','gamma',false]]){
 const id=randomUUID(),target=randomUUID(),owner=users[username];
 const passage='We learn together. They learned yesterday, and we are learning today. '+('Careful readers compare ideas and explore a calm community garden. '.repeat(long?220:4))+'End of '+label+'.';
 let commands='BEGIN;';
 commands+='INSERT INTO wordweave.learning_batches(id,owner_id,saved_at,group_code_snapshot,model_display_name_snapshot,provider_model_id_snapshot,meaning_language,scenario,length_code,passage,tags,expected_target_count,validator_version) VALUES('+[id,owner,'2026-08-'+(label==='alpha'?'10':'11')+'T01:00:00Z','registered','QA reading model','private/provider-id','zh','story',long?'xlong':'short',passage].map(quote).join(',')+",ARRAY['共同学习','花园'],1,'m001-v2');";
 commands+='INSERT INTO wordweave.batch_targets(id,owner_id,batch_id,vocabulary_entry_id,source_entry_snapshot,input_order,contextual_meaning,hint_phrase,hint_surface,hint_start,hint_end) SELECT '+[target,owner,id].map(quote).join(',')+",id,'learn',0,'学习','learn and learn','learn',0,5 FROM wordweave.vocabulary_entries WHERE entry='learn';";
 for(const [i,start,end,surface]of [[0,3,8,'learn'],[1,24,31,'learned'],[2,54,62,'learning']]){
 // Actual offsets are derived from fixed source, never from production mapper.
 const offset=passage.indexOf(surface,i===0?0:surface==='learned'?10:40);
 commands+='INSERT INTO wordweave.passage_occurrences(owner_id,batch_id,target_id,occurrence_order,surface,start_offset,end_offset) VALUES('+[quote(owner),quote(id),quote(target),i,quote(surface),offset,offset+surface.length].join(',')+');';
 }
 for(const [i,start]of [[0,0],[1,10]])commands+='INSERT INTO wordweave.hint_occurrences(owner_id,batch_id,target_id,occurrence_order,surface,start_offset,end_offset) VALUES('+[quote(owner),quote(id),quote(target),i,quote('learn'),start,start+5].join(',')+');';
 sql(commands+'COMMIT;');batches.push({id,owner,username,label,passage});
}
writeFileSync(join(dir,'fixtures.json'),JSON.stringify({users,batches},null,2),{flag:'wx'});
console.log(JSON.stringify({users:Object.keys(users),searchRows:45,batches:3,credentials:0,providerCalls:0}));
