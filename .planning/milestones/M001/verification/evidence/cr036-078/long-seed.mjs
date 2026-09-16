import{randomUUID}from'node:crypto';import{writeFileSync}from'node:fs';import{join}from'node:path';import{dir,sql,quote}from'./lib.mjs';
const users=Object.fromEntries(['abcdefghijklmnopqrstuvwxyz123456','reader'].map(n=>[n,sql('SELECT id FROM wordweave.accounts WHERE username='+quote(n))]));
const batches=[];
for(const [username,label,long]of [['abcdefghijklmnopqrstuvwxyz123456','alpha',false],['abcdefghijklmnopqrstuvwxyz123456','beta',true],['reader','gamma',false]]){
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
writeFileSync(join(dir,'long-fixtures.json'),JSON.stringify({users,batches},null,2),{flag:'wx'});
console.log(JSON.stringify({users:Object.keys(users),batches:3,credentials:0,providerCalls:0}));
