import { execFileSync } from 'node:child_process';
import { writeFileSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { createHash, randomBytes } from 'node:crypto';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const dir=dirname(fileURLToPath(import.meta.url));
const root=resolve(dir,'../../../../../..');
const docker=(args,options={})=>execFileSync('docker',args,{encoding:'utf8',...options}).trim();
const prefix='ww-qa-065';
const frontend='sha256:1c9b43c803ceeefd0e0b261fc027413416948acf585b1db5c1829f6e50029cec';
const backend='sha256:e8c4ee91a7c3265cda8c496ccc8fb485328d95b6c1662eaf2502011ce5d005a5';
const pg='sha256:b85269e8c6aa961524542eb4dcca44c4aa1deba2cf507e9e28d5ba8f971aeab9';
const snapshot=()=>JSON.parse(docker(['inspect','wordweave_uat-frontend-1','wordweave_uat-backend-1','wordweave_uat-nginx-1','wordweave_uat-postgres-1'])).map(x=>({name:x.Name,id:x.Id,image:x.Image,started:x.State.StartedAt}));
const hashes={};
for(const folder of ['frontend/app','frontend/i18n','backend','nginx','.planning/milestones/M001/design','.planning/milestones/M001/technical']){
 const walk=p=>{for(const name of readdirSync(p)){const f=join(p,name);if(statSync(f).isDirectory()){if(!['node_modules','.git'].includes(name))walk(f);}else hashes[f.slice(root.length+1)]=createHash('sha256').update(readFileSync(f)).digest('hex');}};walk(join(root,folder));
}
writeFileSync(join(dir,'baseline.json'),JSON.stringify({date:new Date().toISOString(),uat:snapshot(),hashes},null,2));
docker(['network','create',prefix]);
docker(['run','-d','--name',prefix+'-db','--network',prefix,'--network-alias','db','--label','wordweave.qa=065','--tmpfs','/var/lib/postgresql','-e','POSTGRES_HOST_AUTH_METHOD=trust','-e','POSTGRES_DB=qa',pg]);
for(let i=0;i<60;i++){try{docker(['exec',prefix+'-db','pg_isready','-U','postgres','-d','qa']);break;}catch{await new Promise(r=>setTimeout(r,500));}}
const common={PUBLIC_ORIGIN:'http://127.0.0.1:6101',APP_DATABASE_URL:'postgres://postgres@db:5432/qa?sslmode=disable',COOKIE_SECURE:'false',OPENROUTER_BASE_URL:'http://127.0.0.1:9/disabled',OPENROUTER_MASTER_KEYS:'1:'+randomBytes(32).toString('base64'),OPENROUTER_CURRENT_KEY_VERSION:'1',TRUSTED_PROXY_CIDRS:'0.0.0.0/0',LOG_LEVEL:'warn'};
for(const k of ['SESSION_PEPPER','CAPABILITY_PEPPER','CSRF_HMAC_KEY','CURSOR_HMAC_KEY'])common[k]=randomBytes(32).toString('hex');
const envArgs=obj=>Object.entries(obj).flatMap(([k,v])=>['-e',k+'='+v]);
docker(['run','--rm','--network',prefix,...envArgs(common),'--entrypoint','/usr/local/bin/wordweave-admin',backend,'migrate']);
docker(['exec','-i',prefix+'-db','psql','-U','postgres','-d','qa','-v','ON_ERROR_STOP=1'],{input:'ALTER ROLE wordweave_app LOGIN; ALTER ROLE wordweave_ai LOGIN;'});
docker(['run','--rm','--network',prefix,...envArgs({...common,ADMIN_USERNAME:'qa065_admin',ADMIN_PASSWORD:'Qa065SyntheticOnly!'}),'--entrypoint','/usr/local/bin/wordweave-admin',backend,'create-admin']);
docker(['run','-d','--name',prefix+'-backend','--label','wordweave.qa=065','--network',prefix,'--network-alias','backend',...envArgs({...common,APP_DATABASE_URL:'postgres://wordweave_app@db:5432/qa?sslmode=disable',AI_DATABASE_URL:'postgres://wordweave_ai@db:5432/qa?sslmode=disable'}),backend]);
docker(['run','-d','--name',prefix+'-frontend','--label','wordweave.qa=065','--network',prefix,'--network-alias','frontend','-e','NUXT_BACKEND_INTERNAL_ORIGIN=http://backend:8080',frontend]);
docker(['run','-d','--name',prefix+'-nginx','--label','wordweave.qa=065','--network',prefix,'-p','127.0.0.1:6101:8080',...envArgs({NGINX_LISTEN_PORT:'8080',BACKEND_HOST:'backend',BACKEND_PORT:'8080',FRONTEND_HOST:'frontend',FRONTEND_PORT:'3000'}),'wordweave_uat-nginx:latest']);
for(let i=0;i<60;i++){try{const response=await fetch('http://127.0.0.1:6101/api/v1/bootstrap');if(response.ok)break;}catch{}await new Promise(r=>setTimeout(r,500));}
writeFileSync(join(dir,'environment.json'),JSON.stringify({date:new Date().toISOString(),origin:'http://127.0.0.1:6101',frontend,backend,postgres:pg,uatUnchanged:JSON.stringify(snapshot())===JSON.stringify(JSON.parse(readFileSync(join(dir,'baseline.json'))).uat),provider:'disabled; no credentials'},null,2));
console.log('QA isolated stack ready on 6101; UAT unchanged.');

