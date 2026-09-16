import{execFileSync}from'node:child_process';import{readFileSync,writeFileSync,readdirSync,statSync,existsSync}from'node:fs';import{join,resolve,dirname}from'node:path';import{createHash}from'node:crypto';import{fileURLToPath}from'node:url';
const dir=dirname(fileURLToPath(import.meta.url)),root=resolve(dir,'../../../../../..'),baseline=JSON.parse(readFileSync(join(dir,'baseline.json'))),hash=f=>createHash('sha256').update(readFileSync(f)).digest('hex');
const expected=['frontend/i18n/locales/en-US.json','frontend/app/assets/css/application.css','frontend/tests/unit/admin-approved-copy.test.ts','.planning/milestones/M001/implementation/frontend-cr030-073-worktree-plan.md','.planning/milestones/M001/implementation/frontend-validation.md','.planning/milestones/M001/handoffs/frontend-implementation.md','.planning/milestones/M001/changes/CR-030.md'].sort();
const modified=Object.entries(baseline.hashes).filter(([f,h])=>hash(join(root,f))!==h).map(([f])=>f).sort();
const checks={};checks.onlyExpectedExistingFilesChanged=JSON.stringify(modified)===JSON.stringify(expected);
checks.designBackendApiQaControlUnchanged=Object.entries(baseline.hashes).filter(([f])=>/^backend\/|^\.planning\/(workflow|agt)\/|^\.planning\/milestones\/M001\/(design|technical|product|verification|reviews)\//.test(f)).every(([f,h])=>hash(join(root,f))===h);
const crFile='.planning/milestones/M001/changes/CR-030.md',cr=readFileSync(join(root,crFile),'utf8'),idx=cr.indexOf('\n### 第073轮前端有限返工进展');
checks.crOriginalBytesPreserved=Array.from({length:10},(_,i)=>idx-5+i).some(n=>createHash('sha256').update(cr.slice(0,n)).digest('hex')===baseline.hashes[crFile]);
checks.allSixCrOpen=['029','030','031','032','033','034'].every(id=>/^status: open$/m.test(readFileSync(join(root,'.planning/milestones/M001/changes/CR-'+id+'.md'),'utf8').split('---')[1]));
const json=name=>JSON.parse(readFileSync(join(dir,name)));
checks.design1040Passed=json('design-comparison-final-results.json').counts.PASS===1040&&json('design-comparison-final-results.json').counts.FAIL===0&&json('design-comparison-final-results.json').counts.ERROR===0;
checks.real372Passed=json('real-flows-final-results.json').counts.PASS===372&&json('real-flows-final-results.json').counts.FAIL===0&&json('real-flows-final-results.json').counts.ERROR===0;
const e2e=json('e2e-full-final.json').stats;checks.e2e102Passed=e2e.expected===102&&e2e.unexpected===0&&e2e.flaky===0&&e2e.skipped===0;
checks.qualityPassed=json('quality-commands-final2.json').every(r=>r.status===0);
checks.unit157Passed=/157 passed/.test(readFileSync(join(dir,'build-final2.log'),'utf8').replace(/\x1b\[[0-9;]*m/g,''));
checks.cleanupPassed=json('cleanup.json').uatUnchanged&&json('cleanup.json').removedContainers.length===4&&json('cleanup.json').removedNetworks.length===2&&json('cleanup.json').data.generation_runs===0&&json('cleanup.json').data.credentials===0;
const uat=JSON.parse(execFileSync('docker',['inspect','wordweave_uat-frontend-1','wordweave_uat-backend-1','wordweave_uat-nginx-1','wordweave_uat-postgres-1'],{encoding:'utf8'})).map(x=>({name:x.Name,id:x.Id,image:x.Image,started:x.State.StartedAt}));
checks.uatStillUnchanged=JSON.stringify(uat)===JSON.stringify(baseline.uat);
const docs=['.planning/milestones/M001/implementation/frontend-cr030-073-validation.md','.planning/milestones/M001/implementation/frontend-cr030-073-worktree-plan.md','.planning/milestones/M001/implementation/frontend-validation.md','.planning/milestones/M001/handoffs/frontend-implementation.md',crFile,dir.slice(root.length+1)+'/README.md'];
docs[5]='.planning/milestones/M001/implementation/evidence/cr030-073/README.md';
const links=[],missing=[];for(const f of docs){const body=readFileSync(join(root,f),'utf8');for(const match of body.matchAll(/\]\(([^)]+)\)/g)){const target=match[1];if(/^(https?:|#)/.test(target))continue;const absolute=resolve(dirname(join(root,f)),target.split('#')[0]);links.push({file:f,target});if(!existsSync(absolute))missing.push({file:f,target});}}
checks.localLinksResolve=missing.length===0;
const scripts=readdirSync(dir).filter(f=>f.endsWith('.mjs'));for(const s of scripts)execFileSync('node',['--check',join(dir,s)],{stdio:'pipe'});checks.scriptsParse=true;
const finalSources=['frontend/app/assets/css/application.css','frontend/i18n/locales/en-US.json','frontend/tests/unit/admin-approved-copy.test.ts','frontend/tests/e2e/cr030-073.spec.ts'];
const result={date:new Date().toISOString(),agent:'frontend-claire',stage:'implementation',checks,validated:Object.values(checks).every(Boolean),modifiedExisting:modified,newTest:'frontend/tests/e2e/cr030-073.spec.ts',sourceHashes:Object.fromEntries(finalSources.map(f=>[f,hash(join(root,f))])),candidate:json('candidate-final.json').candidate,localLinks:links.length,missingLinks:missing,scriptsParsed:scripts.length,qaConclusionUnchanged:'FAIL; independent retest required',uat:'not reissued'};
writeFileSync(join(dir,'delivery-validation.json'),JSON.stringify(result,null,2),{flag:'wx'});console.log(JSON.stringify(result,null,2));if(!result.validated)process.exitCode=1;

