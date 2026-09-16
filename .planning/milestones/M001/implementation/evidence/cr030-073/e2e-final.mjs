import{spawnSync}from'node:child_process';import{writeFileSync}from'node:fs';import{dirname,resolve,join}from'node:path';import{fileURLToPath}from'node:url';
const dir=dirname(fileURLToPath(import.meta.url)),root=resolve(dir,'../../../../../..'),start=Date.now();
const r=spawnSync('pnpm',['--dir','frontend','exec','playwright','test','--workers=1','--reporter=line,json'],{cwd:root,encoding:'utf8',maxBuffer:32*1024*1024,env:{...process.env,PLAYWRIGHT_JSON_OUTPUT_FILE:join(dir,'e2e-full-final.json')}});
writeFileSync(join(dir,'e2e-full-final.log'),(r.stdout||'')+(r.stderr||''),{flag:'wx'});
writeFileSync(join(dir,'e2e-command-final.json'),JSON.stringify({command:'pnpm --dir frontend exec playwright test --workers=1 --reporter=line,json',status:r.status,seconds:(Date.now()-start)/1000},null,2),{flag:'wx'});
console.log(JSON.stringify({status:r.status,seconds:(Date.now()-start)/1000}));process.exitCode=r.status||0;


