import{execFileSync}from'node:child_process';import{readFileSync,writeFileSync}from'node:fs';import{join,resolve}from'node:path';import{createHash}from'node:crypto';import{dir,sql}from'./lib.mjs';
const docker=args=>execFileSync('docker',args,{encoding:'utf8'}).trim(),baseline=JSON.parse(readFileSync(join(dir,'baseline.json'))),root=resolve(dir,'../../../../../..');
const modified=Object.entries(JSON.parse(readFileSync(join(dir,'source-baseline.json'))).hashes).filter(([p,h])=>createHash('sha256').update(readFileSync(join(root,p))).digest('hex')!==h).map(([p])=>p);
if(modified.length)throw Error('Unexpected baseline modifications before QA reporting: '+modified.join(','));
const data=JSON.parse(sql("SELECT json_build_object('accounts',(SELECT count(*) FROM wordweave.accounts),'batches',(SELECT count(*) FROM wordweave.learning_batches),'review_sessions',(SELECT count(*) FROM wordweave.review_sessions),'generation_runs',(SELECT count(*) FROM wordweave.generation_runs),'credentials',(SELECT count(*) FROM wordweave.openrouter_credentials))"));
writeFileSync(join(dir,'pre-cleanup-data.json'),JSON.stringify(data,null,2),{flag:'wx'});
const removed=[];
for(const name of['ww-qa-074-nginx','ww-qa-074-frontend','ww-qa-074-backend','ww-qa-074-db']){
 const info=JSON.parse(docker(['inspect',name]))[0];if(info.Config.Labels['wordweave.qa']!=='074')throw Error('Refuse unowned '+name);
 docker(['stop',name]);docker(['rm',name]);removed.push(name);
}
const removedNetworks=[];
for(const name of['ww-qa-074','ww-qa-074-edge']){
 const info=JSON.parse(docker(['network','inspect',name]))[0];if(info.Labels['wordweave.qa']!=='074')throw Error('Refuse unowned network '+name);docker(['network','rm',name]);removedNetworks.push(name);
}
const uat=JSON.parse(docker(['inspect','wordweave_uat-frontend-1','wordweave_uat-backend-1','wordweave_uat-nginx-1','wordweave_uat-postgres-1'])).map(x=>({name:x.Name,id:x.Id,image:x.Image,started:x.State.StartedAt}));
const result={date:new Date().toISOString(),verifiedBaselineFiles:Object.keys(JSON.parse(readFileSync(join(dir,'source-baseline.json'))).hashes).length,modifiedBeforeReport:modified,uatUnchanged:JSON.stringify(uat)===JSON.stringify(baseline.uat),removedContainers:removed,removedNetworks,data,dataRecovery:'Synthetic tmpfs database is removed and not recoverable. Reproducible fixture scripts and evidence retained. No user data was in this stack.'};
writeFileSync(join(dir,'cleanup.json'),JSON.stringify(result,null,2),{flag:'wx'});console.log(JSON.stringify(result));if(!result.uatUnchanged)process.exitCode=1;
