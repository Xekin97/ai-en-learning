import{spawnSync}from'node:child_process';import{writeFileSync}from'node:fs';import{join}from'node:path';import{dir}from'./lib.mjs';
const start=Date.now(),r=spawnSync('node',[join(dir,'browser-final2.mjs')],{encoding:'utf8',maxBuffer:8*1024*1024,env:{...process.env,DEBUG:'pw:browser'}});
writeFileSync(join(dir,'browser-final2.log'),(r.stdout||'')+(r.stderr||''),{flag:'wx'});
console.log(JSON.stringify({status:r.status,seconds:(Date.now()-start)/1000,stdout:r.stdout}));
process.exitCode=r.status||0;

