import{readFileSync,writeFileSync,existsSync}from'node:fs';import{createHash}from'node:crypto';import{dirname,join,resolve}from'node:path';import{fileURLToPath}from'node:url';import{execFileSync}from'node:child_process';
import YAML from '../../../../../../frontend/node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/index.js';
const dir=dirname(fileURLToPath(import.meta.url)),root=resolve(dir,'../../../../../..'),read=p=>readFileSync(join(root,p)),json=p=>JSON.parse(read(p)),sha=b=>createHash('sha256').update(b).digest('hex'),checks=[];
function check(id,ok){checks.push({id,pass:!!ok});if(!ok)throw Error(id);}
const pre=json('.planning/milestones/M001/verification/evidence/uat-079/gate-preflight.json'),state=YAML.parse(read('.planning/workflow/state.yaml').toString()),historyBytes=read('.planning/workflow/history.yaml'),history=YAML.parse(historyBytes.toString());
check('79 unique history entries',history.transitions.length===79&&new Set(history.transitions.map(t=>t.id)).size===79);
check('001-078 byte-preserved',sha(historyBytes.subarray(0,pre.oldHistoryBytes))===pre.oldHistorySha256);
check('last history matches control',history.transitions.at(-1).id===state.last_transition.decision_id&&state.last_transition.decision_id==='TRANSITION-M001-079');
check('remains in verification awaiting user',state.stage==='verification'&&state.status==='awaiting_user_review'&&state.active_role==='quality/base'&&state.active_agent==='qa-quinn');
check('no stale open CR or decisions',state.open_change_requests.length===0&&state.pending_user_decisions.length===0);
check('UAT never auto-accepted or released',state.uat.user_accepted===false&&state.uat.functional_status==='awaiting_user_acceptance'&&state.uat.release_readiness==='blocked'&&state.uat.real_ai==='not_verified');
for(const s of pre.snapshots)check('approved snapshot '+s.path,sha(read(s.path))===s.sha256);
const baseline=json('.planning/milestones/M001/verification/evidence/cr036-078/source-baseline.json'),qa=json('.planning/milestones/M001/verification/evidence/cr036-078/delivery-validation.json');
const changed=Object.entries(baseline.hashes).filter(([p,d])=>sha(read(p))!==d).map(([p])=>p),allowed=new Set([...qa.modifiedExistingFiles,'.planning/workflow/state.yaml','.planning/workflow/history.yaml']);
check('only approved QA/control existing files modified',changed.every(p=>allowed.has(p)));
check('registered role still consistent',YAML.parse(read('.planning/agt/agents.yaml').toString()).agents.filter(a=>a.status==='active').map(a=>a.display_name).join(',')==='qa-quinn');
const links=[];for(const s of [...pre.snapshots,{path:state.last_transition.evidence}]){if(!s.path.endsWith('.md'))continue;const txt=read(s.path).toString();const current=s.path.endsWith('/report.md')||s.path.endsWith('/uat.md')||s.path.endsWith('/handoffs/verification.md')?txt.slice(0,txt.indexOf('<!-- UAT079 CURRENT END -->')+32):txt;for(const m of current.matchAll(/\]\(([^)]+)\)/g)){const u=m[1];if(!/^(https?:|#)/.test(u))links.push({source:s.path,url:u,exists:existsSync(resolve(root,dirname(s.path),u.split('#')[0]))});}}
check('current handoff links resolve',links.every(l=>l.exists));
const containers=JSON.parse(execFileSync('docker',['inspect','wordweave_uat-frontend-1','wordweave_uat-backend-1','wordweave_uat-nginx-1','wordweave_uat-postgres-1'],{encoding:'utf8'})).map(c=>({name:c.Name,image:c.Image,health:c.State.Health?.Status}));
check('UAT four healthy paired services',containers.every(c=>c.health==='healthy')&&containers[0].image===state.uat.frontend_image&&containers[1].image===state.uat.backend_image);
const responses=[];for(const path of ['/', '/api/v1/bootstrap']){const r=await fetch('http://localhost:6001'+path);responses.push({path,status:r.status});await r.arrayBuffer();}
check('live UAT HTTP reachable',responses.every(r=>r.status===200));
const result={date:new Date().toISOString(),agent:'gatekeeper-owen',validated:true,checks,historyEntries:79,currentState:{stage:state.stage,agent:state.active_agent,status:state.status,openCR:state.open_change_requests,uat:state.uat},changedExistingFiles:changed,linksChecked:links.length,containers,responses,userAccepted:false,releaseApproved:false};
writeFileSync(join(dir,'handoff-validation.json'),JSON.stringify(result,null,2),{flag:'wx'});console.log(JSON.stringify({validated:result.validated,checks:checks.length,historyEntries:79,stage:state.stage,status:state.status,openCR:state.open_change_requests,linksChecked:links.length,responses}));

