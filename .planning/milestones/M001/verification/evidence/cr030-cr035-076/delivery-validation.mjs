import{readFileSync,writeFileSync,readdirSync,existsSync}from'node:fs';import{join,resolve,dirname}from'node:path';import{createHash}from'node:crypto';import{execFileSync,spawnSync}from'node:child_process';import{dir,chromium,webkit}from'./lib.mjs';
const root=resolve(dir,'../../../../../..'),base=join(root,'.planning/milestones/M001'),sha=s=>createHash('sha256').update(s).digest('hex');
const baseline=JSON.parse(readFileSync(join(dir,'source-baseline.json'))),reporting=JSON.parse(readFileSync(join(dir,'reporting-baseline.json')));
const modified=Object.entries(baseline.hashes).filter(([p,h])=>!existsSync(join(root,p))||sha(readFileSync(join(root,p)))!==h).map(([p])=>p);
const allowed=reporting.docs.map(d=>'.planning/milestones/M001/'+d.path),unexpected=modified.filter(p=>!allowed.includes(p));
const histories=reporting.docs.map(d=>{const s=readFileSync(join(base,d.path),'utf8'),header=s.match(/^---\n[\s\S]*?\n---\n/)[0],body=s.slice(header.length),old=body.replace(d.insertion,'');return{path:d.path,insertionPresent:body.startsWith(d.insertion),oldBodyUnchanged:sha(old)===d.bodyHash,crHeaderUnchanged:!d.path.startsWith('changes/')||header===d.header};});
const paths=execFileSync('rg',['--files','--hidden','-g','!.git','-g','!node_modules','-g','!.nuxt','-g','!.output','-g','!test-results','-g','!playwright-report','-g','!.env','-g','!**/.env.*'],{cwd:root,encoding:'utf8'}).trim().split('\n');
const newPaths=paths.filter(p=>!(p in baseline.hashes)),newAllowed=reporting.newDocs.map(p=>'.planning/milestones/M001/'+p),unexpectedAdded=newPaths.filter(p=>!p.startsWith('.planning/milestones/M001/verification/evidence/cr030-cr035-076/')&&!newAllowed.includes(p));
const links=[];for(const item of[...reporting.added,...reporting.newDocs.map(path=>({path,content:readFileSync(join(base,path),'utf8')}))]){
 for(const m of item.content.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)){const target=m[1];if(/^(https?:|#)/.test(target))continue;links.push({source:item.path,target,exists:existsSync(resolve(dirname(join(base,item.path)),decodeURIComponent(target.split('#')[0])))});}
}
const docker=a=>execFileSync('docker',a,{encoding:'utf8'}).trim();
const ownedContainers=docker(['ps','-a','--filter','label=wordweave.qa=076','--format','{{.Names}}']),ownedNetworks=docker(['network','ls','--filter','label=wordweave.qa=076','--format','{{.Name}}']);
const uat=JSON.parse(docker(['inspect','wordweave_uat-frontend-1','wordweave_uat-backend-1','wordweave_uat-nginx-1','wordweave_uat-postgres-1'])).map(x=>({name:x.Name,id:x.Id,image:x.Image,started:x.State.StartedAt}));
const uatBefore=JSON.parse(readFileSync(join(dir,'baseline.json'))).uat;
const scripts=readdirSync(dir).filter(n=>n.endsWith('.mjs'));for(const s of scripts)execFileSync(process.execPath,['--check',join(dir,s)]);
const browserVersions={};for(const[name,type]of[['chromium',chromium],['webkit',webkit]]){const b=await type.launch();browserVersions[name]=b.version();await b.close();}
const retainedDesign=execFileSync('lsof',['-nP','-iTCP:6010','-sTCP:LISTEN'],{encoding:'utf8'}).includes('65630');
const rawResults=readdirSync(dir).filter(n=>n.endsWith('-results.json')).map(file=>{const j=JSON.parse(readFileSync(join(dir,file))),actual={PASS:0,FAIL:0,ERROR:0};for(const c of j.checks)actual[c.status]++;return{file,counts:j.counts,countsVerified:JSON.stringify(j.counts)===JSON.stringify(actual)};});
const failedFiles=rawResults.filter(r=>r.counts.FAIL||r.counts.ERROR),failuresMatch=failedFiles.length===2&&failedFiles.every(r=>['plans-warning-results.json','plans-warning-finite-results.json'].includes(r.file)&&r.counts.FAIL===8&&r.counts.ERROR===0);
const crs=['029','030','031','032','033','034','035','036'].map(n=>({id:'CR-'+n,open:/\nstatus: open\n/.test(readFileSync(join(base,'changes/CR-'+n+'.md'),'utf8'))}));
const state=readFileSync(join(root,'.planning/workflow/state.yaml'),'utf8'),cleanup=JSON.parse(readFileSync(join(dir,'cleanup.json')));
const result={date:new Date().toISOString(),verdict:'fail_rework_required',validated:false,baselineFiles:Object.keys(baseline.hashes).length,approvedSnapshotsVerifiedBeforeTesting:baseline.approvedSnapshots,modifiedExistingFiles:modified,unexpectedModifiedFiles:unexpected,unexpectedAddedFiles:unexpectedAdded,histories,linksChecked:links.length,brokenLinks:links.filter(x=>!x.exists),scriptsSyntaxChecked:scripts.length,browserVersions,remainingOwnedContainers:ownedContainers,remainingOwnedNetworks:ownedNetworks,uatUnchanged:JSON.stringify(uat)===JSON.stringify(uatBefore),original6010Retained:retainedDesign,port6101Released:spawnSync('lsof',['-nP','-iTCP:6101','-sTCP:LISTEN']).status===1,productionAndStageControlsUnchanged:unexpected.length===0,activeStagePreserved:state.includes('active_agent: "qa-quinn"')&&state.includes('stage: "verification"')&&state.includes('TRANSITION-M001-076'),openCRs:crs,controlPlaneNewCR036SyncPending:!state.includes('CR-036'),rawResults,failuresMatchOneCR036:failuresMatch,cleanup};
result.validated=unexpected.length===0&&unexpectedAdded.length===0&&histories.every(x=>x.insertionPresent&&x.oldBodyUnchanged&&x.crHeaderUnchanged)&&result.brokenLinks.length===0&&!ownedContainers&&!ownedNetworks&&result.uatUnchanged&&retainedDesign&&result.port6101Released&&crs.every(x=>x.open)&&result.activeStagePreserved&&rawResults.length===18&&rawResults.every(r=>r.countsVerified)&&failuresMatch&&cleanup.modifiedBeforeReport.length===0;
const output=join(dir,'delivery-validation.json');let flag='wx';
if(existsSync(output)){
 const previous=JSON.parse(readFileSync(output)),archive=join(dir,'delivery-validation-initial.json');
 if(previous.validated||previous.brokenLinks.length!==2||!previous.brokenLinks.every(x=>x.target.endsWith('/delivery-validation.json'))||!existsSync(archive)||JSON.stringify(JSON.parse(readFileSync(archive)))!==JSON.stringify(previous))throw Error('Refuse replacing unarchived or unrelated validation');
 flag='w';
}
writeFileSync(output,JSON.stringify(result,null,2),{flag});
console.log(JSON.stringify({...result,rawResults:rawResults.length}));if(!result.validated)process.exitCode=1;
