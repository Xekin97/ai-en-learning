import{execFileSync}from'node:child_process';import{readFileSync,writeFileSync}from'node:fs';import{join,resolve}from'node:path';import{createHash}from'node:crypto';import{dir,sql}from'./lib.mjs';
const docker=args=>execFileSync('docker',args,{encoding:'utf8'}).trim(),baseline=JSON.parse(readFileSync(join(dir,'baseline.json'))),root=resolve(dir,'../../../../../..');
const allowed=['frontend/i18n/locales/en-US.json','frontend/app/assets/css/application.css','frontend/tests/unit/admin-approved-copy.test.ts','.planning/milestones/M001/implementation/frontend-cr030-073-worktree-plan.md','.planning/milestones/M001/implementation/frontend-validation.md','.planning/milestones/M001/handoffs/frontend-implementation.md','.planning/milestones/M001/changes/CR-030.md'];
const modified=Object.entries(baseline.hashes).filter(([p,h])=>createHash('sha256').update(readFileSync(join(root,p))).digest('hex')!==h).map(([p])=>p);
if(modified.some(p=>!allowed.includes(p)))throw Error('Unexpected modifications: '+modified.join(','));
const data=JSON.parse(sql("SELECT json_build_object('accounts',(SELECT count(*) FROM wordweave.accounts),'batches',(SELECT count(*) FROM wordweave.learning_batches),'review_sessions',(SELECT count(*) FROM wordweave.review_sessions),'generation_runs',(SELECT count(*) FROM wordweave.generation_runs),'credentials',(SELECT count(*) FROM wordweave.openrouter_credentials))"));
const containers=['ww-dev-073-nginx','ww-dev-073-frontend','ww-dev-073-backend','ww-dev-073-db'],networks=['ww-dev-073','ww-dev-073-edge'];
// Validate all exact targets first; never operate on compose/UAT resources.
for(const name of containers){const x=JSON.parse(docker(['inspect',name]))[0];if(x.Config.Labels['wordweave.development']!=='cr030-073')throw Error('Unowned container '+name);}
for(const name of networks){const x=JSON.parse(docker(['network','inspect',name]))[0];if(x.Labels['wordweave.development']!=='cr030-073')throw Error('Unowned network '+name);}
writeFileSync(join(dir,'pre-cleanup-data.json'),JSON.stringify(data,null,2),{flag:'wx'});
for(const name of containers){docker(['stop',name]);docker(['rm',name]);}
for(const name of networks)docker(['network','rm',name]);
const uat=JSON.parse(docker(['inspect','wordweave_uat-frontend-1','wordweave_uat-backend-1','wordweave_uat-nginx-1','wordweave_uat-postgres-1'])).map(x=>({name:x.Name,id:x.Id,image:x.Image,started:x.State.StartedAt}));
const prototypeListener=execFileSync('lsof',['-nP','-iTCP:6010','-sTCP:LISTEN'],{encoding:'utf8'}).trim();
const result={date:new Date().toISOString(),baselineFiles:Object.keys(baseline.hashes).length,modifiedBeforeReport:modified,uatUnchanged:JSON.stringify(uat)===JSON.stringify(baseline.uat),prototypeListener,removedContainers:containers,removedNetworks:networks,data,dataRecovery:'Only synthetic tmpfs data deleted; cannot recover the exact database. setup/seed retained to reconstruct equivalent fixtures. No real users, model credentials or AI calls.'};
writeFileSync(join(dir,'cleanup.json'),JSON.stringify(result,null,2),{flag:'wx'});console.log(JSON.stringify(result));if(!result.uatUnchanged)process.exitCode=1;

