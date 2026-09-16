import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,join} from 'node:path';
const dir=dirname(fileURLToPath(import.meta.url));
const docker=args=>execFileSync('docker',args,{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:30000}).trim();
const db='ww-dev-cr039-097-db',name='ww-dev-cr039-097-backend',network='ww-dev-cr039-097';
const candidate=JSON.parse(readFileSync(join(dir,'candidate.json'),'utf8'));
if(docker(['ps','-a','--filter','name=^/'+name+'$','--format','{{.Names}}']))throw Error('Smoke name already exists');
docker(['exec',db,'createdb','-U','postgres','dev097_smoke']);
const env={PUBLIC_ORIGIN:'http://wordweave.test',APP_DATABASE_URL:'postgres://postgres@db:5432/dev097_smoke?sslmode=disable',COOKIE_SECURE:'false',OPENROUTER_BASE_URL:'http://127.0.0.1:1',OPENROUTER_MASTER_KEYS:'1:'+Buffer.alloc(32,97).toString('base64'),OPENROUTER_CURRENT_KEY_VERSION:'1'};
for(const key of ['SESSION_PEPPER','CAPABILITY_PEPPER','CSRF_HMAC_KEY','CURSOR_HMAC_KEY'])env[key]=('dev097-synthetic-only-'+key).padEnd(64,'x');
const envArgs=values=>Object.entries(values).flatMap(([k,v])=>['-e',k+'='+v]);
docker(['run','--rm','--network',network,...envArgs(env),'--entrypoint','/usr/local/bin/wordweave-admin',candidate.image,'migrate']);
docker(['exec',db,'psql','-U','postgres','-d','dev097_smoke','-XAt','-v','ON_ERROR_STOP=1','-c','ALTER ROLE wordweave_app LOGIN; ALTER ROLE wordweave_ai LOGIN;']);
docker(['run','-d','--name',name,'--label','wordweave.dev=cr039-097','--network',network,'--network-alias','backend',...envArgs({...env,APP_DATABASE_URL:'postgres://wordweave_app@db:5432/dev097_smoke?sslmode=disable',AI_DATABASE_URL:'postgres://wordweave_ai@db:5432/dev097_smoke?sslmode=disable'}),candidate.image]);
let ready='';
for(let i=0;i<20;i++){
  try{ready=docker(['run','--rm','--network',network,'golang@sha256:e8c859f5632dcfde7b32d2012b4351728f6437930887c2f6a91ea242459e5514','curl','-fsS','--max-time','2','http://backend:8080/health/ready']);break;}catch{}
  await new Promise(resolve=>setTimeout(resolve,500));
}
if(!ready)throw Error('Candidate not ready');
const image=docker(['inspect','--format','{{.Image}}',name]);
const counts=docker(['exec',db,'psql','-U','postgres','-d','dev097_smoke','-XAt','-c',"SELECT (SELECT count(*) FROM wordweave.generation_runs),(SELECT count(*) FROM wordweave.ai_models),has_table_privilege('wordweave_app','wordweave.visitor_claims','DELETE');"]);
if(image!==candidate.image||counts!=='0|0|t')throw Error('Candidate identity, no-inference or application privilege check failed');
const result={date:new Date().toISOString(),image,ready,counts,internal_network:docker(['network','inspect','--format','{{.Internal}}',network]),real_model_calls:0,provider:'unreachable loopback',uat_modified:false};
writeFileSync(join(dir,'candidate-smoke.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result));
