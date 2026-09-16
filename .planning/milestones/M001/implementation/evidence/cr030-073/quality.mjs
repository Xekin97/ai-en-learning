import {spawnSync} from 'node:child_process';
import {writeFileSync} from 'node:fs';
import {dirname,resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const dir=dirname(fileURLToPath(import.meta.url)),root=resolve(dir,'../../../../../..');
const commands=[
 ['format','pnpm',['--dir','frontend','format:check']],
 ['build','docker',['build','--progress=plain','--tag','wordweave-frontend:cr030-073','frontend']],
];
const results=[];
for(const [name,cmd,args]of commands){console.log('START '+name);const start=Date.now();const r=spawnSync(cmd,args,{cwd:root,encoding:'utf8',maxBuffer:32*1024*1024});writeFileSync(join(dir,name+'.log'),(r.stdout||'')+(r.stderr||''),{flag:'wx'});results.push({name,cmd,args,status:r.status,seconds:(Date.now()-start)/1000});console.log(JSON.stringify(results.at(-1)));if(r.status!==0)break;}
writeFileSync(join(dir,'quality-commands.json'),JSON.stringify(results,null,2),{flag:'wx'});if(results.some(r=>r.status!==0))process.exitCode=1;

