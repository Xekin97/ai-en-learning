import{execFileSync}from'node:child_process';import{readFileSync,writeFileSync}from'node:fs';import{join,resolve}from'node:path';import{createHash}from'node:crypto';import{dir}from'./lib.mjs';
const docker=args=>execFileSync('docker',args,{encoding:'utf8'}).trim(),baseline=JSON.parse(readFileSync(join(dir,'baseline.json'))),root=resolve(dir,'../../../../../..');
const modified=Object.entries(baseline.hashes).filter(([p,h])=>createHash('sha256').update(readFileSync(join(root,p))).digest('hex')!==h).map(([p])=>p);
const removed=[];
for(const name of['ww-qa-065-nginx','ww-qa-065-newfront-old','ww-qa-065-oldfront-old','ww-qa-065-oldfront-new','ww-qa-065-oldbackend','ww-qa-065-frontend','ww-qa-065-backend','ww-qa-065-db']){
 const info=JSON.parse(docker(['inspect',name]))[0];if(info.Config.Labels['wordweave.qa']!=='065')throw Error('Refuse unowned container '+name);docker(['stop',name]);docker(['rm',name]);removed.push(name);
}
docker(['network','rm','ww-qa-065']);
const uat=JSON.parse(docker(['inspect','wordweave_uat-frontend-1','wordweave_uat-backend-1','wordweave_uat-nginx-1','wordweave_uat-postgres-1'])).map(x=>({name:x.Name,id:x.Id,image:x.Image,started:x.State.StartedAt}));
const result={date:new Date().toISOString(),modifiedProductionOrApprovedSource:modified,uatUnchanged:JSON.stringify(uat)===JSON.stringify(baseline.uat),removedContainers:removed,removedNetwork:'ww-qa-065',data:JSON.parse(readFileSync(join(dir,'pre-cleanup-data.json'))),dataRecovery:'Synthetic QA database was tmpfs and is not recoverable. Source seed, scripts and evidence retained.'};
writeFileSync(join(dir,'cleanup.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));

