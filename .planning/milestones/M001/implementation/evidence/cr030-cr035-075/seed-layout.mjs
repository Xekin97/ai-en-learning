import{readFileSync,writeFileSync}from'node:fs';import{join}from'node:path';import{dir,sql,quote}from'./lib.mjs';
const f=JSON.parse(readFileSync(join(dir,'fixtures.json'))),longUsername='abcdefghijklmnopqrstuvwxyz123456';
sql('UPDATE wordweave.accounts SET username='+quote(longUsername)+' WHERE id='+quote(f.users.dev075_learner));
writeFileSync(join(dir,'layout-fixtures.json'),JSON.stringify({...f,longUsername,longUserId:f.users.dev075_learner,shortUserId:f.users.dev075_other},null,2),{flag:'wx'});
console.log('Renamed synthetic long-name fixture; real batches preserved.');
