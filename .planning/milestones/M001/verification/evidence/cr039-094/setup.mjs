import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,readdirSync,statSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {dirname,resolve,join} from 'node:path';
export const dir=dirname(fileURLToPath(import.meta.url)),root=resolve(dir,'../../../../../..');
export const prefix='ww-qa-cr039-094',origin='http://127.0.0.1:6194';
export const backend='sha256:557782d0cfb1d551d3897abbbe22f74c369e4f309e58c202b54c7137f9e03a5e';
export const oldBackend='sha256:642ed57ad0ed6c8a13e4bba1101d8b50188e8ea636791583a6ffb5eaa6917aac';
export const frontend='sha256:fd251e7439aad8e058656e2751ed84f40715fec570a872da53542688a6dd6904';
export const pg='postgres@sha256:1c59e2c3c818eaa0f0628f695b36e7c9e362d6b219b36a54a32df645cbd7e1af';
export const docker=(args,input)=>execFileSync('docker',args,{encoding:'utf8',...(input===undefined?{}:{input}),maxBuffer:16*1024*1024}).trim();
export const sql=s=>docker(['exec','-i',prefix+'-db','psql','-U','postgres','-d','qa094','-XAt','-v','ON_ERROR_STOP=1'],s);
export const output=(name,data)=>writeFileSync(join(dir,name),JSON.stringify(data,null,2)+'\n');
export const quote=s=>"'"+String(s).replaceAll("'","''")+"'";
const inspectNames=['wordweave_uat-frontend-1','wordweave_uat-backend-1','wordweave_uat-nginx-1','wordweave_uat-postgres-1'];
export const uat=()=>docker(['inspect','--format','{{.Name}} {{.Id}} {{.Image}} {{.State.StartedAt}}',...inspectNames]);
export const hashes=()=>{
 const result={};const walk=p=>{for(const e of readdirSync(p)){if(e.startsWith('.')||['node_modules','vendor'].includes(e))continue;const f=join(p,e);if(statSync(f).isDirectory())walk(f);else result[f.slice(root.length+1)]=createHash('sha256').update(readFileSync(f)).digest('hex');}};
 for(const p of ['backend','frontend/app','frontend/i18n','nginx','.planning/milestones/M001/design','.planning/milestones/M001/technical'])walk(join(root,p));
 for(const p of ['.planning/workflow/state.yaml','.planning/workflow/history.yaml','.planning/agt/agents.yaml'])result[p]=createHash('sha256').update(readFileSync(join(root,p))).digest('hex');
 return result;
};
// Intentionally public synthetic QA secrets, never used outside this disposable network.
const common={PUBLIC_ORIGIN:origin,APP_DATABASE_URL:'postgres://postgres@db:5432/qa094?sslmode=disable',COOKIE_SECURE:'false',OPENROUTER_BASE_URL:'http://provider:8081',OPENROUTER_MASTER_KEYS:'1:'+Buffer.alloc(32,94).toString('base64'),OPENROUTER_CURRENT_KEY_VERSION:'1',TRUSTED_PROXY_CIDRS:'0.0.0.0/0',LOG_LEVEL:'info'};
for(const k of ['SESSION_PEPPER','CAPABILITY_PEPPER','CSRF_HMAC_KEY','CURSOR_HMAC_KEY'])common[k]=('qa094-only-'+k).padEnd(64,'x');
const envArgs=obj=>Object.entries(obj).flatMap(([k,v])=>['-e',k+'='+v]);
export const startOld=()=>docker(['run','-d','--name',prefix+'-old','--label','wordweave.qa=cr039-094','--network',prefix,'--network-alias','old',...envArgs({...common,APP_DATABASE_URL:'postgres://wordweave_app@db:5432/qa094?sslmode=disable',AI_DATABASE_URL:'postgres://wordweave_ai@db:5432/qa094?sslmode=disable'}),oldBackend]);
export const hostIngress=()=>{
 docker(['run','-d','--name',prefix+'-gateway','--label','wordweave.qa=cr039-094','--network',prefix+'-ingress','-p','127.0.0.1:6195:8081','-p','127.0.0.1:6196:8082','-v',dir+':/qa:ro','--entrypoint','node',frontend,'/qa/gateway.mjs']);
 docker(['network','connect',prefix,prefix+'-gateway']);
};
export async function waitReady(url){for(let i=0;i<60;i++){try{if((await fetch(url)).ok)return;}catch{}await new Promise(r=>setTimeout(r,500));}throw Error('QA readiness timeout '+url);}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 if(docker(['ps','-a','--filter','name='+prefix,'--format','{{.Names}}']))throw Error('QA names already exist; inspect instead of overwrite');
 output('baseline.json',{date:new Date().toISOString(),uat:uat(),hashes:hashes()});
 docker(['network','create','--internal','--label','wordweave.qa=cr039-094',prefix]);
 docker(['network','create','--label','wordweave.qa=cr039-094',prefix+'-ingress']);
 docker(['run','-d','--name',prefix+'-db','--label','wordweave.qa=cr039-094','--network',prefix,'--network-alias','db','--tmpfs','/var/lib/postgresql','-e','POSTGRES_HOST_AUTH_METHOD=trust','-e','POSTGRES_DB=qa094',pg]);
 for(let i=0;i<60;i++){try{docker(['exec',prefix+'-db','pg_isready','-U','postgres','-d','qa094']);break;}catch{}await new Promise(r=>setTimeout(r,500));}
 docker(['run','--rm','--network',prefix,...envArgs(common),'--entrypoint','/usr/local/bin/wordweave-admin',backend,'migrate']);
 sql('ALTER ROLE wordweave_app LOGIN; ALTER ROLE wordweave_ai LOGIN;');
 docker(['run','--rm','--network',prefix,...envArgs({...common,ADMIN_USERNAME:'qa094_admin',ADMIN_PASSWORD:'Qa094SyntheticOnly!'}),'--entrypoint','/usr/local/bin/wordweave-admin',backend,'create-admin']);
 docker(['run','-d','--name',prefix+'-provider','--label','wordweave.qa=cr039-094','--network',prefix,'--network-alias','provider','-p','127.0.0.1:6195:8081','-v',dir+':/qa:ro','--entrypoint','node',frontend,'/qa/provider.mjs']);
 docker(['run','-d','--name',prefix+'-backend','--label','wordweave.qa=cr039-094','--network',prefix,'--network-alias','backend',...envArgs({...common,APP_DATABASE_URL:'postgres://wordweave_app@db:5432/qa094?sslmode=disable',AI_DATABASE_URL:'postgres://wordweave_ai@db:5432/qa094?sslmode=disable'}),backend]);
 docker(['run','-d','--name',prefix+'-frontend','--label','wordweave.qa=cr039-094','--network',prefix,'--network-alias','frontend','-e','NUXT_BACKEND_INTERNAL_ORIGIN=http://backend:8080',frontend]);
 docker(['create','--name',prefix+'-nginx','--label','wordweave.qa=cr039-094','--network',prefix+'-ingress','-p','127.0.0.1:6194:8080',...envArgs({NGINX_LISTEN_PORT:'8080',BACKEND_HOST:'backend',BACKEND_PORT:'8080',FRONTEND_HOST:'frontend',FRONTEND_PORT:'3000'}),'wordweave_uat-nginx:latest']);
 docker(['network','connect',prefix,prefix+'-nginx']);docker(['start',prefix+'-nginx']);
 hostIngress();await waitReady(origin+'/api/v1/bootstrap');await waitReady('http://127.0.0.1:6195/qa/stats');
 output('environment.json',{date:new Date().toISOString(),origin,backend,oldBackend,frontend,pg,network_internal:docker(['network','inspect','--format','{{.Internal}}',prefix]),uat_unchanged:uat()===JSON.parse(readFileSync(join(dir,'baseline.json'))).uat,provider:'in-process synthetic only; no egress; no real keys',startup_provider_calls:await(await fetch('http://127.0.0.1:6195/qa/stats')).json()});
 console.log('Isolated QA094 ready at 6194; no UAT changes.');
}
