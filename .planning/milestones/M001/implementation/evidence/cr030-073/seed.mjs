import{writeFileSync}from'node:fs';import{join}from'node:path';import{dir,sql,quote}from'./lib.mjs';
const visuals=[['lin_context','plus','2026-08-11'],['lin_news','registered','2026-08-29'],['lin_story','pro','2026-08-08'],['lin_weave','registered','2026-08-03'],['linda_reads','registered','2026-08-15'],['linguistic_thread_collector_2026','pro','2026-08-21']];
sql("INSERT INTO wordweave.accounts(username,password_hash,role,group_code,ui_locale,created_at) SELECT 'dev073_search_'||lpad(n::text,2,'0'),password_hash,'learner','registered','en-US','2026-08-10T01:00:00Z' FROM wordweave.accounts CROSS JOIN generate_series(1,45)n WHERE username='dev073_admin';");
for(const[n,g,d]of visuals)sql("INSERT INTO wordweave.accounts(username,password_hash,role,group_code,ui_locale,created_at) SELECT "+quote(n)+",password_hash,'learner',"+quote(g)+",'en-US',"+quote(d+'T01:00:00Z')+" FROM wordweave.accounts WHERE username='dev073_admin';");
const users=JSON.parse(sql("SELECT json_object_agg(username,id) FROM wordweave.accounts"));
writeFileSync(join(dir,'fixtures.json'),JSON.stringify({users,visuals,searchRows:45,syntheticAccounts:52,learningBatches:0,providerCalls:0},null,2),{flag:'wx'});
console.log(JSON.stringify({accounts:Object.keys(users).length,learningBatches:0,providerCalls:0}));

