// QA098: reused QA096 isolated HTTP harness infrastructure; fresh database and candidate097.
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {dirname,resolve,join} from 'node:path';
export const dir=dirname(fileURLToPath(import.meta.url)),root=resolve(dir,'../../../../../..');
export const prefix='ww-qa-cr039-098',origin='http://127.0.0.1:6199',label='cr039-098';
export const backend='sha256:ab12e7dec0a6a8beb55df2ec6a8174d01d288681215c1108cec997e6f99f8eee';
export const nodeImage='sha256:fd251e7439aad8e058656e2751ed84f40715fec570a872da53542688a6dd6904';
export const pg='postgres@sha256:1c59e2c3c818eaa0f0628f695b36e7c9e362d6b219b36a54a32df645cbd7e1af';
export const docker=(args,input)=>execFileSync('docker',args,{encoding:'utf8',stdio:['pipe','pipe','pipe'],...(input===undefined?{}:{input}),maxBuffer:16*1024*1024}).trim();
export const sql=s=>docker(['exec','-i',prefix+'-db','psql','-U','postgres','-d','qa098','-XAt','-v','ON_ERROR_STOP=1'],s);
export const quote=s=>"'"+String(s).replaceAll("'","''")+"'";
export const output=(name,data)=>writeFileSync(join(dir,name),JSON.stringify(data,null,2)+'\n');
export const hash=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
export const uat=()=>docker(['inspect','--format','{{.Name}} {{.Id}} {{.Image}} {{.State.StartedAt}}','wordweave_uat-frontend-1','wordweave_uat-backend-1','wordweave_uat-nginx-1','wordweave_uat-postgres-1']);
export const hashes=()=>{
 const allowed=new Set(['coverage-matrix.md','report.md','ai-evaluation.md','uat.md'].map(x=>'.planning/milestones/M001/verification/'+x).concat('.planning/milestones/M001/handoffs/verification.md'));
 const paths=execFileSync('rg',['--files','--hidden','backend','frontend','nginx','.planning/milestones','.planning/workflow','.planning/agt'],{cwd:root,encoding:'utf8'}).trim().split('\n').filter(p=>!allowed.has(p)&&!p.includes('/verification/evidence/cr039-098/')&&!p.includes('/verification/cr039-098-')).sort();
 return Object.fromEntries(paths.map(p=>[p,hash(join(root,p))]));
};
// Public synthetic secrets confined to this disposable database and internal network.
const common={PUBLIC_ORIGIN:origin,APP_DATABASE_URL:'postgres://postgres@db:5432/qa098?sslmode=disable',COOKIE_SECURE:'false',OPENROUTER_BASE_URL:'http://provider:8081',OPENROUTER_MASTER_KEYS:'1:'+Buffer.alloc(32,98).toString('base64'),OPENROUTER_CURRENT_KEY_VERSION:'1',TRUSTED_PROXY_CIDRS:'0.0.0.0/0',LOG_LEVEL:'info'};
for(const k of ['SESSION_PEPPER','CAPABILITY_PEPPER','CSRF_HMAC_KEY','CURSOR_HMAC_KEY'])common[k]=('qa098-only-'+k).padEnd(64,'x');
const envArgs=obj=>Object.entries(obj).flatMap(([k,v])=>['-e',k+'='+v]);
export async function waitReady(url){for(let i=0;i<60;i++){try{if((await fetch(url,{signal:AbortSignal.timeout(1500)})).ok)return;}catch{}await new Promise(r=>setTimeout(r,250));}throw Error('QA readiness timeout '+url);}
export async function restart(){
 if(docker(['inspect','--format','{{index .Config.Labels "wordweave.qa"}}',prefix+'-backend'])!==label)throw Error('Wrong restart target');
 if(sql("SELECT count(*) FROM wordweave.generation_runs WHERE call_status='active';")!=='0')throw Error('Refuse restart with active generation');
 const before=docker(['inspect','--format','{{.Image}} {{.State.StartedAt}}',prefix+'-backend']);
 docker(['restart',prefix+'-backend']);await waitReady(origin+'/health/ready');
 return {before,after:docker(['inspect','--format','{{.Image}} {{.State.StartedAt}}',prefix+'-backend'])};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 if(existsSync(join(dir,'baseline.json')))throw Error('Baseline exists; do not overwrite');
 if(docker(['ps','-a','--filter','name='+prefix,'--format','{{.Names}}']))throw Error('QA names already exist');
 const baseline={date:new Date().toISOString(),uat:uat(),hashes:hashes()};output('baseline.json',baseline);
 if(docker(['image','inspect','wordweave-backend:cr039-097','--format','{{.Id}}'])!==backend)throw Error('Candidate mismatch');
 const manifest=JSON.parse(readFileSync(join(root,'.planning/milestones/M001/implementation/evidence/cr039-097/manifest.json')));
 for(const [p,h] of Object.entries(manifest.files))if(hash(join(root,'.planning/milestones/M001/implementation/evidence/cr039-097',p))!==h)throw Error('Dev evidence mismatch '+p);
 docker(['network','create','--internal','--label','wordweave.qa='+label,prefix]);
 docker(['network','create','--label','wordweave.qa='+label,prefix+'-ingress']);
 docker(['run','-d','--name',prefix+'-db','--label','wordweave.qa='+label,'--network',prefix,'--network-alias','db','--tmpfs','/var/lib/postgresql','-e','POSTGRES_HOST_AUTH_METHOD=trust','-e','POSTGRES_DB=qa098',pg]);
 let ready=false;for(let i=0;i<60;i++){try{docker(['exec',prefix+'-db','pg_isready','-U','postgres','-d','qa098']);ready=true;break;}catch{}await new Promise(r=>setTimeout(r,250));}if(!ready)throw Error('QA postgres unavailable');
 docker(['run','--rm','--network',prefix,...envArgs(common),'--entrypoint','/usr/local/bin/wordweave-admin',backend,'migrate']);
 sql('ALTER ROLE wordweave_app LOGIN; ALTER ROLE wordweave_ai LOGIN;');
 docker(['run','--rm','--network',prefix,...envArgs({...common,ADMIN_USERNAME:'qa098_admin',ADMIN_PASSWORD:'Qa098SyntheticOnly!'}),'--entrypoint','/usr/local/bin/wordweave-admin',backend,'create-admin']);
 docker(['run','-d','--name',prefix+'-provider','--label','wordweave.qa='+label,'--network',prefix,'--network-alias','provider','-v',dir+':/qa:ro','--entrypoint','node',nodeImage,'/qa/provider.mjs']);
 docker(['run','-d','--name',prefix+'-backend','--label','wordweave.qa='+label,'--network',prefix,'--network-alias','backend',...envArgs({...common,APP_DATABASE_URL:'postgres://wordweave_app@db:5432/qa098?sslmode=disable',AI_DATABASE_URL:'postgres://wordweave_ai@db:5432/qa098?sslmode=disable'}),backend]);
 docker(['create','--name',prefix+'-gateway','--label','wordweave.qa='+label,'--network',prefix+'-ingress','-p','127.0.0.1:6199:8080','-p','127.0.0.1:6200:8081','-v',dir+':/qa:ro','--entrypoint','node',nodeImage,'/qa/gateway.mjs']);
 docker(['network','connect',prefix,prefix+'-gateway']);docker(['start',prefix+'-gateway']);
 await waitReady(origin+'/health/ready');await waitReady('http://127.0.0.1:6200/qa/stats');
 output('environment.json',{date:new Date().toISOString(),origin,backend,nodeImage,pg,network_internal:docker(['network','inspect','--format','{{.Internal}}',prefix]),uat_unchanged:uat()===baseline.uat,real_model_calls:0,frontend_application_started:false});
 console.log('QA098 isolated current candidate ready; UAT unchanged.');
}
