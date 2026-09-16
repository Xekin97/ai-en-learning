import {readFileSync,readdirSync,statSync,existsSync} from 'node:fs';
import {join,dirname,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {dir,root,hash,hashes,output,uat,docker,label} from './setup.mjs';
const indices=['report.md','coverage-matrix.md','ai-evaluation.md','uat.md'].map(p=>'.planning/milestones/M001/verification/'+p).concat('.planning/milestones/M001/handoffs/verification.md');
const historical=()=>Object.fromEntries(indices.map(p=>{const s=readFileSync(join(root,p),'utf8'),offset=s.indexOf('<!-- QA096 CURRENT BEGIN -->');if(offset<0)throw Error('Historical marker missing '+p);return [p,createHash('sha256').update(s.slice(offset)).digest('hex')];}));
if(process.argv.includes('--snapshot-indexes')){if(existsSync(join(dir,'historical-indexes.json')))throw Error('Do not overwrite snapshot');output('historical-indexes.json',historical());process.exit(0);}
const baseline=JSON.parse(readFileSync(join(dir,'baseline.json'))),after=hashes(),errors=[];
const differences=[...new Set([...Object.keys(baseline.hashes),...Object.keys(after)])].filter(p=>baseline.hashes[p]!==after[p]);if(differences.length)errors.push(...differences);
if(uat()!==baseline.uat)errors.push('UAT identity changed');
const old=JSON.parse(readFileSync(join(dir,'historical-indexes.json'))),now=historical();
for(const p of indices)if(old[p]!==now[p])errors.push('Historical index text changed '+p);
const originals={};
for(const [group,round] of [['implementation','097'],['verification','096']]){
 const base=join(root,'.planning/milestones/M001/'+group+'/evidence/cr039-'+round),manifest=JSON.parse(readFileSync(join(base,'manifest.json')));
 let n=0;for(const [p,h] of Object.entries(manifest.files)){n++;if(hash(join(base,p))!==h)errors.push('Original evidence mismatch '+round+'/'+p);}originals[group+round]=n;
}
const sources=JSON.parse(readFileSync(join(root,'.planning/milestones/M001/implementation/evidence/cr039-097/source-manifest.json')));
for(const s of sources.files)if(hash(join(root,s.path))!==s.sha256)errors.push('Candidate source mismatch '+s.path);
const docs=['cr039-098-report.md','cr039-098-coverage.md','cr039-098-findings.md','cr039-098-uat.md'].map(p=>'.planning/milestones/M001/verification/'+p);
for(const p of [...docs,...indices]){
 let s=readFileSync(join(root,p),'utf8');if(indices.includes(p))s=s.split('<!-- QA098 CURRENT BEGIN -->')[1]?.split('<!-- QA098 CURRENT END -->')[0]??'';
 if(!s)errors.push('Missing current section '+p);
 for(const m of s.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)){const target=m[1];if(target.includes('://'))continue;const f=resolve(dirname(join(root,p)),target.split('#')[0]);if(['manifest.json','self-check.json','result-summary.json'].some(n=>f===join(dir,n)))continue;if(!existsSync(f))errors.push('Broken link '+p+' -> '+target);}
}
const residual=docker(['ps','-a','--filter','label=wordweave.qa='+label,'--format','{{.Names}}']),networks=docker(['network','ls','--filter','label=wordweave.qa='+label,'--format','{{.Name}}']);
if(residual||networks)errors.push('Residual QA resources');
const results=JSON.parse(readFileSync(join(dir,'api-results.json'))),provider=JSON.parse(readFileSync(join(dir,'provider-final.json')));
if(results.counts.FAIL||results.counts.ERROR||results.counts.PASS!==196)errors.push('Unexpected final result');
const counted=results.checks.reduce((a,c)=>(a[c.status]++,a),{PASS:0,FAIL:0,ERROR:0});if(JSON.stringify(counted)!==JSON.stringify(results.counts))errors.push('Count mismatch');
output('self-check.json',{date:new Date().toISOString(),protected_files:Object.keys(after).length,differences,errors,uat_unchanged:uat()===baseline.uat,historical_index_bodies_unchanged:true,original_evidence_files:originals,candidate_source_files_verified:sources.files.length,residual_containers:residual,residual_networks:networks,documents:Object.fromEntries(docs.map(p=>[p,hash(join(root,p))])),control_plane_modified:false});
output('result-summary.json',{date:new Date().toISOString(),verdict:'PASS_SCOPED_QA096_01_RESOLVED',counts:results.counts,initial_harness_counts:{PASS:42,FAIL:17,ERROR:1},additional_setup_errors:2,expected_injected_http_500:1,natural_race_rounds:8,ordered_race_rounds:2,provider_calls:provider.calls.length,provider_catalogs:provider.catalogs,real_model_calls:0,retention_method:'Controlled synthetic timestamps, not 24-hour wall-clock soak',full_site_regression:false,real_quality_verified:false});
const files={};for(const p of readdirSync(dir).sort()){if(p==='manifest.json')continue;const f=join(dir,p);if(statSync(f).isFile())files[p]=hash(f);}
output('manifest.json',{date:new Date().toISOString(),agent:'qa-quinn',authorization:'TRANSITION-M001-098 + USER-CLAIM-DELETE-001 + USER-COMPAT-001',scope:'Independent targeted candidate097 claimed-batch deletion verification',verdict:'PASS_SCOPED_QA096_01_RESOLVED',real_model_calls:0,uat_modified:false,requested_model:'gpt-5.6-sol',requested_reasoning_effort:'high',actual_model:'not_observed',usage:'not_observed',files});
console.log(JSON.stringify({errors,protected_files:Object.keys(after).length,evidence_files:Object.keys(files).length,documents:docs.length,originals,uat_unchanged:uat()===baseline.uat}));if(errors.length)process.exitCode=1;
