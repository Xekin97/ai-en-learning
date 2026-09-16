import{randomUUID}from'node:crypto';
import{writeFileSync}from'node:fs';import{join}from'node:path';
import{request,dir,origin,password,sql,quote}from'./lib.mjs';
const users={},batches=[];
for(const name of['old','empty','paused','changed','password']){
 const username='qa078_range_'+name,c=await request.newContext();
 const b=await(await c.get(origin+'/api/v1/bootstrap')).json();
 const r=await c.post(origin+'/api/v1/auth/register',{headers:{origin,'sec-fetch-site':'same-origin','x-csrf-token':b.data.csrf_token},data:{username,password,password_confirmation:password,ui_locale:'en-US'}});
 if(r.status()!==201)throw Error('register '+name+' '+r.status());
 users[name]={username,id:sql('SELECT id FROM wordweave.accounts WHERE username='+quote(username))};await c.dispose();
}
for(const[who,label,date,active]of[
 ['old','before','2026-07-14T15:59:59Z',true],
 ['old','start','2026-07-14T16:00:00Z',true],
 ['old','middle','2026-07-15T04:00:00Z',true],
 ['old','end','2026-07-15T15:59:59Z',true],
 ['old','after','2026-07-15T16:00:00Z',true],
 ['old','paused','2026-07-15T04:00:00Z',false],
 ['paused','paused-only','2026-07-15T04:00:00Z',false],
 ['changed','changed','2026-07-15T04:00:00Z',true]
]){
 const owner=users[who].id,id=randomUUID(),passage='They build while we learn. Yesterday, we learned and they built. This synthetic reading fixture verifies date selection.';
 let q='BEGIN;INSERT INTO wordweave.learning_batches(id,owner_id,saved_at,group_code_snapshot,model_display_name_snapshot,provider_model_id_snapshot,meaning_language,scenario,length_code,passage,tags,expected_target_count,validator_version,participates_in_range_review) VALUES('+
 [id,owner,date,'registered','QA range fixture','qa/no-provider','zh','story','short',passage].map(quote).join(',')+",ARRAY['共同学习'],2,'m001-v2',"+active+');';
 for(const[i,word,meaning]of[[0,'learn','学习'],[1,'build','建造']]){
  const target=randomUUID(),hint=word+' and '+word;
  q+='INSERT INTO wordweave.batch_targets(id,owner_id,batch_id,vocabulary_entry_id,source_entry_snapshot,input_order,contextual_meaning,hint_phrase,hint_surface,hint_start,hint_end) SELECT '+
  [target,owner,id].map(quote).join(',')+',id,'+quote(word)+','+i+','+[meaning,hint,word].map(quote).join(',')+',0,5 FROM wordweave.vocabulary_entries WHERE entry='+quote(word)+';';
  for(const[j,surface]of(word==='learn'?['learn','learned']:['build','built']).entries()){
   const start=passage.indexOf(surface);
   q+='INSERT INTO wordweave.passage_occurrences(owner_id,batch_id,target_id,occurrence_order,surface,start_offset,end_offset) VALUES('+[quote(owner),quote(id),quote(target),j,quote(surface),start,start+surface.length].join(',')+');';
  }
  for(const[j,start]of[[0,0],[1,10]])q+='INSERT INTO wordweave.hint_occurrences(owner_id,batch_id,target_id,occurrence_order,surface,start_offset,end_offset) VALUES('+[quote(owner),quote(id),quote(target),j,quote(word),start,start+word.length].join(',')+');';
 }
 sql(q+'COMMIT;');batches.push({who,label,date,active,id,passage});
}
writeFileSync(join(dir,'range-fixtures.json'),JSON.stringify({users,batches},null,2),{flag:'wx'});
console.log(JSON.stringify({accounts:5,batches:8,providerCalls:0}));
