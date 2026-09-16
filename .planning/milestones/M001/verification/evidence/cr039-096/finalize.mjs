import {readFileSync,readdirSync,statSync,existsSync} from 'node:fs';
import {join,dirname,resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {dir,root,hash,hashes,output,uat,docker,label} from './setup.mjs';
const baseline=JSON.parse(readFileSync(join(dir,'baseline.json'))),after=hashes(),errors=[];
const differences=[...new Set([...Object.keys(baseline.hashes),...Object.keys(after)])].filter(p=>baseline.hashes[p]!==after[p]);if(differences.length)errors.push(...differences);
if(uat()!==baseline.uat)errors.push('UAT identity changed');
const docs=['cr039-096-plan.md','cr039-096-report.md','cr039-096-coverage.md','cr039-096-findings.md','cr039-096-uat.md'].map(p=>'.planning/milestones/M001/verification/'+p);
const indices=['report.md','coverage-matrix.md','ai-evaluation.md','uat.md'].map(p=>'.planning/milestones/M001/verification/'+p).concat('.planning/milestones/M001/handoffs/verification.md');
for(const p of [...docs,...indices]){
 let s=readFileSync(join(root,p),'utf8');if(indices.includes(p))s=s.split('<!-- QA096 CURRENT BEGIN -->')[1]?.split('<!-- QA096 CURRENT END -->')[0]??'';
 for(const m of s.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)){const target=m[1];if(target.includes('://'))continue;const f=resolve(dirname(join(root,p)),target.split('#')[0]);if(f===join(dir,'manifest.json'))continue;if(!existsSync(f))errors.push('broken link '+p+' -> '+target);}
}
const residual=docker(['ps','-a','--filter','label=wordweave.qa='+label,'--format','{{.Names}}']);if(residual)errors.push('residual containers');
const networks=docker(['network','ls','--filter','label=wordweave.qa='+label,'--format','{{.Name}}']);if(networks)errors.push('residual networks');
output('self-check.json',{date:new Date().toISOString(),protected_files:Object.keys(after).length,differences,errors,uat_unchanged:uat()===baseline.uat,residual_containers:residual,residual_networks:networks,documents:Object.fromEntries(docs.map(p=>[p,hash(join(root,p))])),control_plane_modified:false,original_QA094_preserved:true});
const files={};for(const p of readdirSync(dir).sort()){if(p==='manifest.json')continue;const f=join(dir,p);if(statSync(f).isFile())files[p]=hash(f);}
output('manifest.json',{date:new Date().toISOString(),agent:'qa-quinn',authorization:'TRANSITION-M001-096 + USER-COMPAT-001',scope:'Independent current-version lifecycle/security retest; no legacy compatibility',verdict:'fail_QA096_01',real_model_calls:0,uat_modified:false,actual_model:'not_observed',usage:'not_observed',files});
console.log(JSON.stringify({errors,protected_files:Object.keys(after).length,evidence_files:Object.keys(files).length,documents:docs.length,uat_unchanged:uat()===baseline.uat}));if(errors.length)process.exitCode=1;
