import{readFileSync,writeFileSync,existsSync}from'node:fs';import{join,resolve}from'node:path';import{createHash}from'node:crypto';import{execFileSync}from'node:child_process';import{dir}from'./lib.mjs';
const root=resolve(dir,'../../../../../..'),m=join(root,'.planning/milestones/M001'),read=p=>readFileSync(p,'utf8'),json=n=>JSON.parse(read(join(dir,n))),sha=b=>createHash('sha256').update(b).digest('hex'),checks=[];
const add=(id,actual,expected)=>checks.push({id,status:JSON.stringify(actual)===JSON.stringify(expected)?'PASS':'FAIL',actual,expected});
for(const e of json('reporting-baseline.json')){
 const current=read(join(m,e.path)),marker='<!-- DEV080 CURRENT END -->\n',index=current.indexOf(marker);
 add('preserved history '+e.path,index>=0?sha(current.slice(index+marker.length)):null,e.bodyHash);
}
const candidate=json('candidate.json');
for(const e of candidate.sourceFiles)add('candidate source '+e.path,sha(readFileSync(join(root,e.path))),e.sha256);
const source=json('source-baseline.json'),modified=Object.entries(source.hashes).filter(([p,h])=>!existsSync(join(root,p))||sha(readFileSync(join(root,p)))!==h).map(([p])=>p).sort();
const allowed=[...candidate.modifiedExistingFiles,'.planning/milestones/M001/implementation/frontend-validation.md','.planning/milestones/M001/handoffs/frontend-implementation.md','.planning/milestones/M001/changes/CR-037.md'].sort();
add('only approved source/report edits',modified,allowed);
for(const p of ['.planning/workflow/state.yaml','.planning/workflow/history.yaml','.planning/agt/agents.yaml'])add('control plane unchanged '+p,sha(readFileSync(join(root,p))),source.hashes[p]);
const documents=['implementation/frontend-cr037-080-validation.md','implementation/frontend-validation.md','handoffs/frontend-implementation.md','changes/CR-037.md'];
for(const p of documents){
 const all=read(join(m,p)),content=p.includes('frontend-cr037-080')?all:all.slice(0,all.indexOf('<!-- DEV080 CURRENT END -->'));
 const missing=[...content.matchAll(/\]\(([^)]+)\)/g)].map(v=>v[1]).filter(v=>!v.startsWith('http')&&!existsSync(resolve(join(m,p,'..'),v)));
 add('current document links '+p,missing,[]);
}
add('CR037 remains open',/^status: open$/m.test(read(join(m,'changes/CR-037.md'))),true);
add('partial browser status exposed',candidate.browser.status,'PARTIAL_BROWSER_COVERAGE');
add('UAT protected',json('cleanup.json').uatUnchanged,true);
const containers=execFileSync('docker',['ps','-a','--filter','label=wordweave.dev=080','--format','{{.Names}}'],{encoding:'utf8'}).trim();
const networks=execFileSync('docker',['network','ls','--filter','label=wordweave.dev=080','--format','{{.Name}}'],{encoding:'utf8'}).trim();
add('no remaining DEV080 containers',containers,'');add('no remaining DEV080 networks',networks,'');
const result={date:new Date().toISOString(),scope:'Delivery integrity only, NOT independent QA or WebKit input PASS',counts:{PASS:checks.filter(c=>c.status==='PASS').length,FAIL:checks.filter(c=>c.status==='FAIL').length},checks};
writeFileSync(join(dir,process.argv[2]==='final'?'delivery-validation-final.json':'delivery-validation.json'),JSON.stringify(result,null,2),{flag:'wx'});console.log(JSON.stringify(result));if(result.counts.FAIL)process.exitCode=1;
