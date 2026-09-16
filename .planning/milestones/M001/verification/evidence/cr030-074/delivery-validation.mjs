import{readFileSync,writeFileSync,readdirSync,existsSync}from'node:fs';import{join,resolve,dirname}from'node:path';import{createHash}from'node:crypto';import{execFileSync}from'node:child_process';
import{dir,chromium,webkit}from'./lib.mjs';
const root=resolve(dir,'../../../../../..'),base=join(root,'.planning/milestones/M001'),sha=s=>createHash('sha256').update(s).digest('hex');
const baseline=JSON.parse(readFileSync(join(dir,'source-baseline.json'))),reporting=JSON.parse(readFileSync(join(dir,'reporting-baseline.json')));
const modified=Object.entries(baseline.hashes).filter(([p,h])=>!existsSync(join(root,p))||sha(readFileSync(join(root,p)))!==h).map(([p])=>p);
const allowed=reporting.docs.map(d=>'.planning/milestones/M001/'+d.path),unexpected=modified.filter(p=>!allowed.includes(p));
const histories=reporting.docs.map(d=>{const s=readFileSync(join(base,d.path),'utf8'),body=s.slice(s.indexOf('\n---\n',4)+5),old=body.replace(/\n<!-- QA074 CURRENT BEGIN -->[\s\S]*?<!-- QA074 CURRENT END -->\n/u,'');return{path:d.path,oldBodyUnchanged:sha(old)===d.bodyHash};});
const links=[];for(const item of[...reporting.added,...reporting.newDocs.map(path=>({path,content:readFileSync(join(base,path),'utf8')}))]){
 for(const m of item.content.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)){const target=m[1];if(/^(https?:|#)/.test(target))continue;links.push({source:item.path,target,exists:existsSync(resolve(dirname(join(base,item.path)),decodeURIComponent(target.split('#')[0])))});}
}
const docker=a=>execFileSync('docker',a,{encoding:'utf8'}).trim();
const ownedContainers=docker(['ps','-a','--filter','label=wordweave.qa=074','--format','{{.Names}}']),ownedNetworks=docker(['network','ls','--filter','label=wordweave.qa=074','--format','{{.Name}}']);
const uat=JSON.parse(docker(['inspect','wordweave_uat-frontend-1','wordweave_uat-backend-1','wordweave_uat-nginx-1','wordweave_uat-postgres-1'])).map(x=>({name:x.Name,id:x.Id,image:x.Image,started:x.State.StartedAt}));
const uatBefore=JSON.parse(readFileSync(join(dir,'baseline.json'))).uat;
const scripts=readdirSync(dir).filter(n=>n.endsWith('.mjs'));for(const s of scripts)execFileSync(process.execPath,['--check',join(dir,s)]);
const browserVersions={};for(const[name,type]of[['chromium',chromium],['webkit',webkit]]){const b=await type.launch();browserVersions[name]=b.version();await b.close();}
const retainedDesign=execFileSync('lsof',['-nP','-iTCP:6010','-sTCP:LISTEN'],{encoding:'utf8'}).includes('65630');
const rawResults=readdirSync(dir).filter(n=>n.endsWith('-results.json')).map(file=>({file,counts:JSON.parse(readFileSync(join(dir,file))).counts}));
const crs=['029','030','031','032','033','034','035'].map(n=>({id:'CR-'+n,open:/\nstatus: open\n/.test(readFileSync(join(base,'changes/CR-'+n+'.md'),'utf8'))}));
const result={date:new Date().toISOString(),verdict:'fail_rework_required',validated:false,baselineFiles:Object.keys(baseline.hashes).length,modifiedExistingFiles:modified,unexpectedModifiedFiles:unexpected,histories,linksChecked:links.length,brokenLinks:links.filter(x=>!x.exists),scriptsSyntaxChecked:scripts.length,browserVersions,remainingOwnedContainers:ownedContainers,remainingOwnedNetworks:ownedNetworks,uatUnchanged:JSON.stringify(uat)===JSON.stringify(uatBefore),original6010Retained:retainedDesign,productionAndStageControlsUnchanged:unexpected.length===0,openCRs:crs,controlPlaneNewCR035SyncPending:true,rawResults};
result.validated=unexpected.length===0&&histories.every(x=>x.oldBodyUnchanged)&&result.brokenLinks.length===0&&!ownedContainers&&!ownedNetworks&&result.uatUnchanged&&retainedDesign&&crs.every(x=>x.open);
writeFileSync(join(dir,'delivery-validation.json'),JSON.stringify(result,null,2),{flag:'wx'});
console.log(JSON.stringify({...result,rawResults:rawResults.length,histories:result.histories}));if(!result.validated)process.exitCode=1;
