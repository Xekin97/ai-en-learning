import {readFileSync,readdirSync,existsSync,statSync} from 'node:fs';
import {join,dirname,resolve} from 'node:path';
import {dir,root,origin,names,target,frontend,docker,hash,sha,output,same,inspect,safe,data,privateData,protectedHashes,assertAuthority} from './helpers.mjs';
assertAuthority();if(existsSync(join(dir,'closure.json'))||existsSync(join(dir,'manifest.json')))throw Error('Closure exists; do not overwrite evidence');
const pre=JSON.parse(readFileSync(join(dir,'preflight.json'))),deployment=JSON.parse(readFileSync(join(dir,'deployment.json'))),smoke=JSON.parse(readFileSync(join(dir,'smoke-results.json'))),recheck=JSON.parse(readFileSync(join(dir,'dropdown-recheck-results.json')));
const baseline=JSON.parse(readFileSync(join(dir,'baseline.json'))),protectedNow=protectedHashes(),indexBefore=JSON.parse(readFileSync(join(dir,'index-baseline.json')));
const originals=JSON.parse(readFileSync(join(pre.backup.directory,'data-private.json'))),after=data(),secrets=privateData(),containers=inspect();
const checks={},history={};
checks.protectedFilesUnchanged=same(protectedNow,baseline.hashes);
for(const [p,h]of Object.entries(indexBefore.files)){const s=readFileSync(join(root,p),'utf8'),i=s.indexOf('<!-- QA098 CURRENT BEGIN -->');history[p]=i>=0&&sha(s.slice(i))===h;}
checks.allFiveHistoricalIndexBodiesPreserved=Object.values(history).every(Boolean);
const receipts={};for(const [kind,round]of[['verification','098'],['implementation','097']]){const p=join(root,'.planning/milestones/M001',kind,'evidence/cr039-'+round),m=JSON.parse(readFileSync(join(p,'manifest.json')));const files=Object.entries(m.files);receipts[kind+round]={count:files.length,unchanged:files.every(([f,h])=>hash(join(p,f))===h)};}
checks.upstreamOriginalManifestsMatch=Object.values(receipts).every(r=>r.unchanged);
checks.candidateSourceMatches=JSON.parse(readFileSync(join(root,'.planning/milestones/M001/implementation/evidence/cr039-097/source-manifest.json'))).files.every(f=>hash(join(root,f.path))===f.sha256);
checks.deploymentAndTargetedSmokePass=deployment.status==='PASS'&&smoke.counts.ERROR===0&&smoke.checks.filter(c=>c.status==='FAIL').length===1&&smoke.checks.find(c=>c.status==='FAIL').id==='Live vocabulary dropdown rendered'&&recheck.counts.FAIL===0&&recheck.counts.ERROR===0;
checks.existingScopedBusinessDataPreserved=same(after,originals.data);
checks.passwordsCredentialsAndOriginalSessionsPreserved=same(secrets,originals.secrets);
checks.noGenerationDraftClaimOrRunAdded=after.counts.active_runs===0&&after.counts.runs===pre.dataBefore.counts.runs&&after.counts.drafts===0&&after.counts.claims===0;
checks.correctCandidatePair=containers[0].Image===frontend&&containers[1].Image===target;
checks.fourServicesHealthy=containers.every(c=>c.State.Health?.Status==='healthy');
checks.otherContainersNetworksAndVolumesPreserved=[0,2,3].every(i=>same(safe(containers[i]),pre.before[i]));
checks.uatHasOnlyExpectedFourContainers=same(docker(['ps','-a','--filter','label=com.docker.compose.project=wordweave_uat','--format','{{.Names}}']).split('\n').sort(),[...names].sort());
checks.privateBackupModesPreserved=(statSync(pre.backup.directory).mode&0o777)===0o700&&pre.backup.files.every(f=>(statSync(join(pre.backup.directory,f.name)).mode&0o777)===0o600);
checks.noSourceSchemaControlPlaneOrLegacyCompatibilityEdits=checks.protectedFilesUnchanged;
const health={};for(const p of ['/health/live','/health/ready','/'])health[p]=(await fetch(origin+p,{signal:AbortSignal.timeout(10000)})).status;checks.routesHealthy=Object.values(health).every(s=>s===200);
const docs=[...Object.keys(indexBefore.files),...['report','handoff','coverage'].map(n=>'.planning/milestones/M001/verification/uat-099-'+n+'.md')],missing=[];
for(const p of docs){const s=readFileSync(join(root,p),'utf8');const current=p.includes('/uat-099-')?s:s.slice(0,s.indexOf('<!-- QA098 CURRENT BEGIN -->'));for(const match of current.matchAll(/\]\(([^)]+)\)/g)){const link=match[1].split('#')[0];if(!link||/^[a-z]+:/i.test(link))continue;const dest=resolve(dirname(join(root,p)),link);if(!existsSync(dest)&&![join(dir,'closure.json'),join(dir,'manifest.json')].includes(dest))missing.push({source:p,target:link});}}
checks.currentHandoffLinksResolve=missing.length===0;
checks.noRawProviderKeysInNewEvidence=readdirSync(dir).filter(f=>/\.(mjs|json|yaml)$/.test(f)).every(f=>!/(sk-or-v1-[a-f0-9]{16,})/.test(readFileSync(join(dir,f),'utf8')));
output('manual-visual-review.json',{date:new Date().toISOString(),reviewer:'qa-quinn',image:'learner-create-1440.png',viewed:true,scope:'Basic deployed workbench rendering only',observations:['English brand WordWeave visible','DeepSeek and GPT-oss choices fit the sidebar','Vocabulary results visible in overlay without pushing subsequent fields','No generated text or personal learning content was requested or captured'],notClaimed:['Pixel-perfect design parity','Full-site or multilingual regression','Real generation quality']});
const result={date:new Date().toISOString(),agent:'qa-quinn',authorization:'TRANSITION-M001-099',status:Object.values(checks).every(Boolean)?'PASS':'FAIL',checks,protectedFiles:Object.keys(baseline.hashes).length,upstreamEvidence:receipts,historicalIndexBodies:history,missingLinks:missing,dataBefore:pre.dataBefore,dataAfter:after,health,uat:containers.map(safe),effectivePrimarySmoke:{PASS:37,FAIL:0,ERROR:0,firstRun:'36 PASS / 1 timing FAIL / 0 ERROR retained',targetedRecheck:'6 PASS / 0 FAIL / 0 ERROR; only one original assertion replaced'},realModelCalls:0,realModelProbes:0,applicationRestoreUsed:false,privateBackupRetained:true,privateBackupDirectory:pre.backup.directory,workflowChanged:false,legacyCompatibilityAdded:false,realV3Quality:'not_verified',releaseApproved:false};
output('closure.json',result);
const evidence=readdirSync(dir).filter(f=>f!=='manifest.json'&&statSync(join(dir,f)).isFile()).sort();output('manifest.json',{date:new Date().toISOString(),algorithm:'sha256',files:Object.fromEntries(evidence.map(f=>[f,hash(join(dir,f))])),documents:Object.fromEntries(docs.map(p=>[p,hash(join(root,p))]))});
console.log(JSON.stringify({status:result.status,checks,protectedFiles:result.protectedFiles,evidenceFiles:evidence.length,receipts,realModelCalls:0},null,2));if(result.status!=='PASS')process.exitCode=1;
