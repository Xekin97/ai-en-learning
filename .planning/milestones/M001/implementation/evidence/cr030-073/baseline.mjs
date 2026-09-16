import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {dirname,resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const dir=dirname(fileURLToPath(import.meta.url)),root=resolve(dir,'../../../../../..');
const files=execFileSync('rg',['--files','--hidden','-g','!.git','-g','!node_modules','-g','!.nuxt','-g','!.output','-g','!test-results','-g','!playwright-report','-g','!.env','-g','!**/.env.*','-g','!**/evidence/cr030-073/**'],{cwd:root,encoding:'utf8'}).trim().split('\n');
const hashes=Object.fromEntries(files.map(f=>[f,createHash('sha256').update(readFileSync(join(root,f))).digest('hex')]));
const uat=JSON.parse(execFileSync('docker',['inspect','wordweave_uat-frontend-1','wordweave_uat-backend-1','wordweave_uat-nginx-1','wordweave_uat-postgres-1'],{encoding:'utf8'})).map(x=>({name:x.Name,id:x.Id,image:x.Image,started:x.State.StartedAt}));
writeFileSync(join(dir,'baseline.json'),JSON.stringify({date:new Date().toISOString(),hashes,uat},null,2),{flag:'wx'});
console.log(JSON.stringify({files:files.length,uat:uat.map(x=>x.name)}));

