import{readFileSync,writeFileSync}from'node:fs';import{execFileSync}from'node:child_process';import{createHash}from'node:crypto';import{dirname,join,resolve}from'node:path';import{fileURLToPath}from'node:url';
const dir=dirname(fileURLToPath(import.meta.url)),root=resolve(dir,'../../../../../..'),sha=b=>createHash('sha256').update(b).digest('hex');
const paths=execFileSync('rg',['--files','--hidden','-g','!.git','-g','!node_modules','-g','!.nuxt','-g','!.output','-g','!test-results','-g','!playwright-report','-g','!.env','-g','!**/.env.*','-g','!**/evidence/cr037-080/**'],{cwd:root,encoding:'utf8'}).trim().split('\n');
const state=readFileSync(join(root,'.planning/workflow/state.yaml'),'utf8');if(!state.includes('frontend-claire')||!state.includes('stage: implementation'))throw Error('Wrong role');
const hashes=Object.fromEntries(paths.map(p=>[p,sha(readFileSync(join(root,p)))]));
writeFileSync(join(dir,'source-baseline.json'),JSON.stringify({date:new Date().toISOString(),hashes},null,2),{flag:'wx'});console.log(JSON.stringify({files:paths.length}));

