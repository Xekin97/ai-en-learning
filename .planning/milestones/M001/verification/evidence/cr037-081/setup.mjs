import { execFileSync } from 'node:child_process';
import { writeFileSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { createHash, randomBytes } from 'node:crypto';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const dir=dirname(fileURLToPath(import.meta.url));
const root=resolve(dir,'../../../../../..');
const docker=(args,options={})=>{try{return execFileSync('docker',args,{encoding:'utf8',...options}).trim();}catch(e){throw Error('Docker '+args[0]+' failed: '+(e.stdout||e.stderr||e.status));}};
const prefix='ww-qa-081';
const frontend='sha256:170b8f2c58a2792b21cfe71244f80f263beb825a55fb84d5c2c0dec72adb0e3b';
const backend='sha256:e8c4ee91a7c3265cda8c496ccc8fb485328d95b6c1662eaf2502011ce5d005a5';
const pg='sha256:b85269e8c6aa961524542eb4dcca44c4aa1deba2cf507e9e28d5ba8f971aeab9';
const snapshot=()=>JSON.parse(docker(['inspect','wordweave_uat-frontend-1','wordweave_uat-backend-1','wordweave_uat-nginx-1','wordweave_uat-postgres-1'])).map(x=>({name:x.Name,id:x.Id,image:x.Image,started:x.State.StartedAt}));
// All baseline files were hashed before any QA edits; environment files were excluded.
const hashes=JSON.parse(readFileSync(join(dir,'source-baseline.json'),'utf8')).hashes;
const existing=docker(['ps','-a','--format','{{.Names}}']).split('\n');
if(existing.some(n=>n.startsWith(prefix)))throw Error('Existing QA081 container; inspect before reuse');
const net=await import('node:net');
for(const port of [6101])await new Promise((ok,bad)=>{const s=net.createServer();s.once('error',bad);s.listen(port,'127.0.0.1',()=>s.close(ok));});
writeFileSync(join(dir,'baseline.json'),JSON.stringify({date:new Date().toISOString(),uat:snapshot(),hashes},null,2),{flag:'wx'});
docker(['network','create','--internal','--label','wordweave.qa=081',prefix]);
docker(['network','create','--label','wordweave.qa=081',prefix+'-edge']);
docker(['run','-d','--name',prefix+'-db','--network',prefix,'--network-alias','db','--label','wordweave.qa=081','--tmpfs','/var/lib/postgresql','-e','POSTGRES_HOST_AUTH_METHOD=trust','-e','POSTGRES_DB=qa',pg]);
for(let i=0;i<60;i++){try{docker(['exec',prefix+'-db','pg_isready','-h','db','-U','postgres','-d','qa']);break;}catch{await new Promise(r=>setTimeout(r,500));}}
const common={PUBLIC_ORIGIN:'http://127.0.0.1:6101',APP_DATABASE_URL:'postgres://postgres@db:5432/qa?sslmode=disable',COOKIE_SECURE:'false',OPENROUTER_BASE_URL:'http://127.0.0.1:9/disabled',OPENROUTER_MASTER_KEYS:'1:'+randomBytes(32).toString('base64'),OPENROUTER_CURRENT_KEY_VERSION:'1',TRUSTED_PROXY_CIDRS:'0.0.0.0/0',LOG_LEVEL:'warn'};
for(const k of ['SESSION_PEPPER','CAPABILITY_PEPPER','CSRF_HMAC_KEY','CURSOR_HMAC_KEY'])common[k]=randomBytes(32).toString('hex');
const envArgs=obj=>Object.entries(obj).flatMap(([k,v])=>['-e',k+'='+v]);
docker(['run','--rm','--network',prefix,...envArgs(common),'--entrypoint','/usr/local/bin/wordweave-admin',backend,'migrate']);
docker(['exec','-i',prefix+'-db','psql','-U','postgres','-d','qa','-v','ON_ERROR_STOP=1'],{input:'ALTER ROLE wordweave_app LOGIN; ALTER ROLE wordweave_ai LOGIN;'});
docker(['run','--rm','--network',prefix,...envArgs({...common,ADMIN_USERNAME:'qa081_admin',ADMIN_PASSWORD:'Qa081SyntheticOnly!'}),'--entrypoint','/usr/local/bin/wordweave-admin',backend,'create-admin']);
docker(['run','-d','--name',prefix+'-backend','--label','wordweave.qa=081','--network',prefix,'--network-alias','backend',...envArgs({...common,APP_DATABASE_URL:'postgres://wordweave_app@db:5432/qa?sslmode=disable',AI_DATABASE_URL:'postgres://wordweave_ai@db:5432/qa?sslmode=disable'}),backend]);
docker(['run','-d','--name',prefix+'-frontend','--label','wordweave.qa=081','--network',prefix,'--network-alias','frontend','-e','NUXT_BACKEND_INTERNAL_ORIGIN=http://backend:8080',frontend]);
docker(['run','-d','--name',prefix+'-nginx','--label','wordweave.qa=081','--network',prefix+'-edge','-p','127.0.0.1:6101:8080',...envArgs({NGINX_LISTEN_PORT:'8080',BACKEND_HOST:'backend',BACKEND_PORT:'8080',FRONTEND_HOST:'frontend',FRONTEND_PORT:'3000'}),'wordweave_uat-nginx:latest']);
docker(['network','connect',prefix,prefix+'-nginx']);docker(['restart',prefix+'-nginx']);
let healthy=false;
for(let i=0;i<60;i++){try{const response=await fetch('http://127.0.0.1:6101/api/v1/bootstrap');if(response.ok){healthy=true;break;}}catch{}await new Promise(r=>setTimeout(r,500));}
if(!healthy)throw Error('QA edge unavailable');
writeFileSync(join(dir,'environment.json'),JSON.stringify({date:new Date().toISOString(),origin:'http://127.0.0.1:6101',frontend,backend,postgres:pg,uatUnchanged:JSON.stringify(snapshot())===JSON.stringify(JSON.parse(readFileSync(join(dir,'baseline.json'))).uat),provider:'disabled; no credentials; backend on internal network'},null,2),{flag:'wx'});
console.log('QA isolated stack ready on 6101; UAT unchanged.');

