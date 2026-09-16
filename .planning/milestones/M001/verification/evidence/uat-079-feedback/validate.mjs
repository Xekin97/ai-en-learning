import{readFileSync,writeFileSync,existsSync}from'node:fs';import{dirname,resolve,join}from'node:path';import{fileURLToPath}from'node:url';import{createHash}from'node:crypto';
const dir=dirname(fileURLToPath(import.meta.url)),root=resolve(dir,'../../../../../..'),base='.planning/milestones/M001/',sha=b=>createHash('sha256').update(b).digest('hex'),read=p=>readFileSync(join(root,p),'utf8'),baseline=JSON.parse(read(base+'verification/evidence/uat-079-feedback/reporting-baseline.json')),result=JSON.parse(read(base+'verification/evidence/uat-079-feedback/results.json')),checks=[];
function check(id,ok){checks.push({id,pass:!!ok});if(!ok)throw Error(id);}
check('diagnostic findings preserved',result.counts.PASS===65&&result.counts.FAIL===60&&result.counts.ERROR===0);
for(const[p,d]of Object.entries(result.baseline.hashes))check('unchanged '+p,sha(readFileSync(join(root,p)))===d);
for(const d of baseline.docs){const text=read(base+d.path);check('new header '+d.path,text.startsWith(d.newHeader));const body=text.slice(d.newHeader.length),index=body.indexOf(d.insertion);check('feedback insertion '+d.path,index===0);check('prior body preserved '+d.path,sha(body.slice(d.insertion.length))===d.bodyHash);}
const cr=read(base+'changes/CR-037.md');check('new issue remains open, no fake resolution',cr.includes('status: open')&&cr.includes('owner_stage: implementation'));
const paths=[base+'verification/uat-079-feedback.md',base+'changes/CR-037.md',...baseline.docs.map(d=>base+d.path)],broken=[];let links=0;
for(const p of paths){let text=read(p);const end=text.indexOf('<!-- UAT079 FEEDBACK CURRENT END -->');if(end!==-1)text=text.slice(0,end);for(const m of text.matchAll(/\]\(([^)]+)\)/g)){const url=m[1];if(/^(https?:|#)/.test(url))continue;links++;if(!existsSync(resolve(root,dirname(p),url.split('#')[0])))broken.push({p,url});}}
check('local current links resolve',broken.length===0);
const output={date:new Date().toISOString(),agent:'qa-quinn',validated:true,checks,linksChecked:links,sourceDesignAndWorkflowUnchanged:true,historyAppended:false,implementationStarted:false,uatDeployed:false,userApprovalPending:'Limited CR037 implementation and independent re-verification',controlIndexSyncPending:['CR-037']};
writeFileSync(join(dir,'delivery-validation.json'),JSON.stringify(output,null,2),{flag:'wx'});console.log(JSON.stringify({validated:true,checks:checks.length,links,workflowUnchanged:true,controlIndexSyncPending:['CR-037']}));

