import{writeFileSync}from'node:fs';import{join}from'node:path';import{sql,quote,dir}from'./lib.mjs';
// Separate administrator identities prevent concurrent UI-locale or login-rate interference.
for(const role of['matrix','focus','plans','flow','supp'])sql("INSERT INTO wordweave.accounts(username,password_hash,role,group_code,ui_locale) SELECT "+quote('qa078_'+role+'_admin')+",password_hash,role,group_code,'en-US' FROM wordweave.accounts WHERE username='qa078_admin';");
const names=['abcdefghijklmnopqrstuvwxyz123456','wwwwwwwwwwwwwwwwwwwwwwwwwwwwwwww','reader'];
for(const name of names)sql("INSERT INTO wordweave.accounts(username,password_hash,role,group_code,ui_locale,created_at) SELECT "+quote(name)+",password_hash,'learner','registered','en-US','2026-08-10T01:00:00Z' FROM wordweave.accounts WHERE username='qa078_learner';");
writeFileSync(join(dir,'focus-fixtures.json'),JSON.stringify(names.map(username=>({username,id:sql('SELECT id FROM wordweave.accounts WHERE username='+quote(username))})),null,2),{flag:'wx'});
console.log('5 independent administrator actors and 3 legal-name fixtures created');
