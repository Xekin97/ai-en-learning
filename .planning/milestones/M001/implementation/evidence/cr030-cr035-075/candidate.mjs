import{execFileSync}from'node:child_process';import{readFileSync,writeFileSync}from'node:fs';import{join}from'node:path';import{dir}from'./lib.mjs';
const docker=a=>execFileSync('docker',a,{encoding:'utf8'}).trim(),prefix='ww-dev-075',inspect=name=>JSON.parse(docker(['inspect',name]))[0];
const before=inspect(prefix+'-frontend'),nginx=inspect(prefix+'-nginx');
if([before,nginx].some(x=>x.Config.Labels['wordweave.dev']!=='075'))throw Error('Ownership mismatch');
if(before.Image!=='sha256:18c9e266ed0bb74ee3d50d1f7aac8bb1c6f6945ee8e33460319ca86010552944')throw Error('Unexpected pre-fix image');
const candidate=inspect('wordweave-frontend:cr030-cr035-075').Id;
docker(['stop',prefix+'-frontend']);docker(['rm',prefix+'-frontend']);
docker(['run','-d','--name',prefix+'-frontend','--label','wordweave.dev=075','--network',prefix,'--network-alias','frontend','-e','NUXT_BACKEND_INTERNAL_ORIGIN=http://backend:8080',candidate]);docker(['restart',prefix+'-nginx']);
let healthy=false;for(let i=0;i<60;i++){try{if((await fetch('http://127.0.0.1:6101/admin/users')).ok){healthy=true;break;}}catch{}await new Promise(r=>setTimeout(r,500));}
const uat=JSON.parse(docker(['inspect','wordweave_uat-frontend-1','wordweave_uat-backend-1','wordweave_uat-nginx-1','wordweave_uat-postgres-1'])).map(x=>({name:x.Name,id:x.Id,image:x.Image,started:x.State.StartedAt}));
const result={date:new Date().toISOString(),previous:before.Image,candidate,healthy,uatUnchanged:JSON.stringify(uat)===JSON.stringify(JSON.parse(readFileSync(join(dir,'baseline.json'))).uat)};
writeFileSync(join(dir,'candidate.json'),JSON.stringify(result,null,2),{flag:'wx'});console.log(JSON.stringify(result));if(!healthy||!result.uatUnchanged)process.exitCode=1;
