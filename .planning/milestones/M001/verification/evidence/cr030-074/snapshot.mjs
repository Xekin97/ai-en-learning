import{execFileSync}from'node:child_process';import{readFileSync,writeFileSync}from'node:fs';import{createHash}from'node:crypto';import{dirname,resolve,join}from'node:path';import{fileURLToPath}from'node:url';
const dir=dirname(fileURLToPath(import.meta.url)),root=resolve(dir,'../../../../../..'),sha=b=>createHash('sha256').update(b).digest('hex');
const files=execFileSync('rg',['--files','--hidden','-g','!.git','-g','!node_modules','-g','!.nuxt','-g','!.output','-g','!test-results','-g','!playwright-report','-g','!.env','-g','!**/.env.*','-g','!**/evidence/cr030-074/**'],{cwd:root,encoding:'utf8'}).trim().split('\n');
const hashes=Object.fromEntries(files.map(f=>[f,sha(readFileSync(join(root,f)))]));
const delivery=JSON.parse(readFileSync(join(root,'.planning/milestones/M001/implementation/evidence/cr030-073/delivery-validation.json')));const drift=Object.entries(delivery.sourceHashes).filter(([f,h])=>hashes[f]!==h);
if(drift.length)throw Error('Unapproved source drift');
const approval=readFileSync(join(root,'.planning/milestones/M001/reviews/implementation-cr030-users-reverification-approval.md'),'utf8');
const locked=[...approval.matchAll(/\| \[([^\]]+)\]\([^)]*\) \| (\d+) \| `([a-f0-9]+)` \|/g)];for(const[,rel,size,hash]of locked){const f=join(root,'.planning/milestones/M001',rel),b=readFileSync(f);if(sha(b)!==hash||b.length!==Number(size))throw Error('Approved artifact drift '+rel);}
writeFileSync(join(dir,'source-baseline.json'),JSON.stringify({date:new Date().toISOString(),hashes,approvedSnapshots:locked.length,sourceDrift:drift},null,2),{flag:'wx'});console.log(JSON.stringify({files:files.length,approvedSnapshots:locked.length,sourceDrift:drift}));

