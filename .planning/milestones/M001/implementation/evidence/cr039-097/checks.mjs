import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,existsSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {dirname,resolve,join} from 'node:path';

const dir=dirname(fileURLToPath(import.meta.url)), root=resolve(dir,'../../../../../..');
const label='cr039-097', network='ww-dev-cr039-097', db=network+'-db';
const image='golang@sha256:e8c859f5632dcfde7b32d2012b4351728f6437930887c2f6a91ea242459e5514';
const tag='wordweave-backend:cr039-097';
const exec=(args)=>execFileSync('docker',args,{encoding:'utf8',stdio:['ignore','pipe','pipe'],maxBuffer:16*1024*1024,timeout:300000}).trim();
const sha=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
const write=(name,data)=>writeFileSync(join(dir,name),JSON.stringify(data,null,2)+'\n');
const uat=()=>exec(['inspect','--format','{{.Name}} {{.Id}} {{.Image}} {{.State.StartedAt}}','wordweave_uat-backend-1','wordweave_uat-frontend-1','wordweave_uat-nginx-1','wordweave_uat-postgres-1']);
const hashes=()=>Object.fromEntries(execFileSync('rg',['--files','--hidden','-g','!.git','-g','!node_modules','-g','!.nuxt','-g','!.output','-g','!.env','-g','!.env.*','backend','frontend','nginx','.planning'],{cwd:root,encoding:'utf8'}).trim().split('\n').filter(p=>!p.startsWith('.planning/milestones/M001/implementation/evidence/cr039-097/')).sort().map(p=>[p,sha(join(root,p))]));
const task=process.argv[2];
if(task==='setup') {
  if(existsSync(join(dir,'baseline.json')))throw Error('Baseline already exists; do not overwrite');
  write('baseline.json',{date:new Date().toISOString(),hashes:hashes(),uat:uat(),backend_baseline:exec(['image','inspect','--format','{{.Id}}','wordweave-backend:cr039-095']),actual_model:'not_observed',usage:'not_observed'});
  exec(['network','create','--internal','--label','wordweave.dev='+label,network]);
  const pg=exec(['image','inspect','--format','{{.Id}}','postgres:18-bookworm']);
  exec(['run','-d','--name',db,'--label','wordweave.dev='+label,'--network',network,'--network-alias','db','--tmpfs','/var/lib/postgresql','-e','POSTGRES_HOST_AUTH_METHOD=trust',pg]);
  let ready=false;
  for(let i=0;i<30;i++){try{exec(['exec',db,'pg_isready','-U','postgres']);ready=true;break;}catch{await new Promise(r=>setTimeout(r,500));}}
  if(!ready)throw Error('Synthetic DB not ready');
  write('environment.json',{network,db,postgres_image:pg,postgres_version:exec(['exec',db,'postgres','--version']),go_image:image,no_host_ports:true,internal_network:true,tmpfs:true});
  console.log('Isolated synthetic database ready');
} else if(task==='close') {
  const before=JSON.parse(readFileSync(join(dir,'baseline.json'),'utf8')),current=hashes();
  const allowed=new Set(['backend/internal/learning/service.go','backend/internal/httpapi/claimed_batch_delete_integration_test.go','.planning/milestones/M001/implementation/backend-cr039-097-validation.md','.planning/milestones/M001/implementation/backend-cr039-097-worktree-plan.md','.planning/milestones/M001/implementation/backend-validation.md','.planning/milestones/M001/handoffs/backend-implementation.md']);
  const changes=[...new Set([...Object.keys(before.hashes),...Object.keys(current)])].filter(p=>before.hashes[p]!==current[p]);
  if(changes.some(p=>!allowed.has(p)))throw Error('Unexpected changes: '+changes.filter(p=>!allowed.has(p)).join(','));
  if(before.uat!==uat())throw Error('UAT changed');
  const qaDir=join(root,'.planning/milestones/M001/verification/evidence/cr039-096');
  const qa=JSON.parse(readFileSync(join(qaDir,'manifest.json'),'utf8'));
  for(const [p,h] of Object.entries(qa.files))if(sha(join(qaDir,p))!==h)throw Error('QA evidence changed');
  write('source-manifest.json',{date:new Date().toISOString(),files:changes.filter(p=>p.startsWith('backend/')).map(p=>({path:p,before_sha256:before.hashes[p]??null,sha256:current[p]}))});
  const containers=[network+'-backend',db];
  for(const name of containers)if(exec(['inspect','--format','{{index .Config.Labels "wordweave.dev"}}',name])!==label)throw Error('Container ownership mismatch');
  if(exec(['network','inspect','--format','{{index .Labels "wordweave.dev"}}',network])!==label)throw Error('Network ownership mismatch');
  for(const name of containers)exec(['rm','-f',name]);exec(['network','rm',network]);
  write('closure.json',{date:new Date().toISOString(),protected_files:Object.keys(before.hashes).length,changed:changes,uat_unchanged:before.uat===uat(),qa_evidence_unchanged:Object.keys(qa.files).length,removed_containers:containers,removed_network:network,removed_data:'Only disposable tmpfs synthetic fixtures; reproducible from tests',real_model_calls:0,workflow_unchanged:true});
  console.log('Scoped changes verified; synthetic DB/network removed; UAT unchanged');
} else if(task==='manifest') {
  write('manifest.json',{date:new Date().toISOString(),agent:'backend-ethan',authorization:'TRANSITION-M001-097 + USER-CLAIM-DELETE-001',files:Object.fromEntries(readdirSync(dir).filter(p=>p!=='manifest.json').sort().map(p=>[p,sha(join(dir,p))]))});
} else {
  const commands={
    red:['go','test','-race','-tags=integration','./internal/httpapi','-run','^TestClaimedBatchDeletionHTTP$','-count=1','-v'],
    targeted:['go','test','-race','-tags=integration','./internal/httpapi','-run','^TestClaimedBatchDeletion','-count=1','-v'],
    repeat:['go','test','-race','-tags=integration','./internal/httpapi','-run','^TestClaimedBatchDeletion(Concurrency|Rollback|Retention)$','-count=5','-v'],
    related:['go','test','-race','-tags=integration','./internal/httpapi','-run','^TestDraft|^TestNoContentConsumers','-count=1','-v'],
    unit:['go','test','-race','./...','-count=1'],
    vet:['go','vet','-tags=integration','./...'],
    modules:['go','mod','verify'],
    format:['gofmt','-l','internal/learning/service.go','internal/httpapi/claimed_batch_delete_integration_test.go'],
    build:[],
  };
  if(!commands[task])throw Error('Unknown task');
  if(existsSync(join(dir,task+'.json')))throw Error('Do not overwrite prior check evidence');
  const integration=['red','targeted','repeat','related'].includes(task);
  let args=['run','--rm','--network',integration?network:'none','-v',join(root,'backend')+':/src:ro','-w','/src','-v','wordweave-go-mod:/go/pkg/mod','-v','wordweave-go-build:/root/.cache/go-build','-e','GOPROXY=off','-e','GOSUMDB=off'];
  if(integration)args.push('-e','TEST_DATABASE_URL=postgres://postgres@db:5432/postgres?sslmode=disable');
  args.push(image,...commands[task]);
  if(task==='build')args=['build','--network=none','-t',tag,join(root,'backend')];
  const started=Date.now();let status=0,output='';
  try{output=exec(args);if(task==='format'&&output)status=1;}
  catch(error){status=error.status??1;output=String(error.stdout??'')+'\n'+String(error.stderr??'');}
  writeFileSync(join(dir,task+'.log'),output+'\n');
  write(task+'.json',{date:new Date().toISOString(),command:['docker',...args],exit_code:status,elapsed_ms:Date.now()-started,real_model_calls:0});
  if(task==='build'&&status===0)write('candidate.json',{tag,image:exec(['image','inspect','--format','{{.Id}}',tag]),uat_deployed:false,legacy_compatibility_candidate:false});
  console.log(JSON.stringify({task,status,elapsed_ms:Date.now()-started}));console.log(output.slice(-6000));process.exitCode=status;
}
