import{execFileSync,spawnSync}from'node:child_process';
import{readFileSync,writeFileSync}from'node:fs';import{join,resolve}from'node:path';import{createHash}from'node:crypto';import{dir,sql}from'./lib.mjs';
const docker=args=>execFileSync('docker',args,{encoding:'utf8'}).trim(),baseline=JSON.parse(readFileSync(join(dir,'baseline.json'))),source=JSON.parse(readFileSync(join(dir,'source-baseline.json'))),root=resolve(dir,'../../../../../..');
const modified=Object.entries(source.hashes).filter(([p,h])=>createHash('sha256').update(readFileSync(join(root,p))).digest('hex')!==h).map(([p])=>p);
if(modified.length)throw Error('Unexpected baseline modifications before QA reporting: '+modified.join(','));
const names=['ww-qa-076-nginx','ww-qa-076-frontend','ww-qa-076-backend','ww-qa-076-db'],networks=['ww-qa-076','ww-qa-076-edge'];
for(const name of names){const info=JSON.parse(docker(['inspect',name]))[0];if(info.Config.Labels['wordweave.qa']!=='076')throw Error('Refuse unowned '+name);}
for(const name of networks){const info=JSON.parse(docker(['network','inspect',name]))[0];if(info.Labels['wordweave.qa']!=='076')throw Error('Refuse unowned network '+name);}
const data=JSON.parse(sql("SELECT json_build_object('accounts',(SELECT count(*) FROM wordweave.accounts),'batches',(SELECT count(*) FROM wordweave.learning_batches),'review_sessions',(SELECT count(*) FROM wordweave.review_sessions),'generation_runs',(SELECT count(*) FROM wordweave.generation_runs),'models',(SELECT count(*) FROM wordweave.ai_models),'enabled_models',(SELECT count(*) FROM wordweave.ai_models WHERE enabled),'credentials',(SELECT count(*) FROM wordweave.openrouter_credentials))"));
if(data.credentials!==0||data.enabled_models!==0)throw Error('Unexpected provider configuration');
writeFileSync(join(dir,'pre-cleanup-data.json'),JSON.stringify(data,null,2),{flag:'wx'});
for(const name of names){docker(['stop',name]);docker(['rm',name]);}
for(const name of networks)docker(['network','rm',name]);
const uat=JSON.parse(docker(['inspect','wordweave_uat-frontend-1','wordweave_uat-backend-1','wordweave_uat-nginx-1','wordweave_uat-postgres-1'])).map(x=>({name:x.Name,id:x.Id,image:x.Image,started:x.State.StartedAt}));
const result={date:new Date().toISOString(),verifiedBaselineFiles:Object.keys(source.hashes).length,modifiedBeforeReport:modified,uatUnchanged:JSON.stringify(uat)===JSON.stringify(baseline.uat),original6010Retained:execFileSync('lsof',['-nP','-iTCP:6010','-sTCP:LISTEN'],{encoding:'utf8'}).includes('65630'),port6101Released:spawnSync('lsof',['-nP','-iTCP:6101','-sTCP:LISTEN']).status===1,removedContainers:names,removedNetworks:networks,data,dataRecovery:'Synthetic tmpfs database is removed and not recoverable. Reproducible fixture scripts and evidence retained. No user data was in this stack.'};
writeFileSync(join(dir,'cleanup.json'),JSON.stringify(result,null,2),{flag:'wx'});console.log(JSON.stringify(result));if(!result.uatUnchanged||!result.original6010Retained||!result.port6101Released)process.exitCode=1;
