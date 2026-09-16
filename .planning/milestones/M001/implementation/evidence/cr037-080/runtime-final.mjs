import{execFileSync}from'node:child_process';import{writeFileSync}from'node:fs';import{join}from'node:path';import{dir}from'./lib.mjs';
const docker=a=>execFileSync('docker',a,{encoding:'utf8'}).trim(),name='ww-dev-080-frontend',old=JSON.parse(docker(['inspect',name]))[0],image=JSON.parse(docker(['image','inspect','wordweave-frontend:cr037-080']))[0].Id;
if(old.Config.Labels['wordweave.dev']!=='080'||old.Image===image)throw Error('Unexpected candidate ownership/version');
docker(['stop',name]);docker(['rm',name]);docker(['run','-d','--name',name,'--label','wordweave.dev=080','--network','ww-dev-080','--network-alias','frontend','-e','NUXT_BACKEND_INTERNAL_ORIGIN=http://backend:8080',image]);docker(['restart','ww-dev-080-nginx']);
let healthy=false;for(let i=0;i<60;i++){try{if((await fetch('http://127.0.0.1:6101/')).ok){healthy=true;break;}}catch{}await new Promise(r=>setTimeout(r,500));}
writeFileSync(join(dir,'runtime-final.json'),JSON.stringify({date:new Date().toISOString(),previous:old.Image,frontend:image,healthy},null,2),{flag:'wx'});console.log(JSON.stringify({frontend:image,healthy}));if(!healthy)process.exitCode=1;

