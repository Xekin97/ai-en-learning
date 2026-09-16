import {readFileSync,readdirSync,statSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {dir,prefix,docker,sql,output,uat,hashes} from './setup.mjs';
const baseline=JSON.parse(readFileSync(join(dir,'baseline.json'))),after=hashes();
const differences=[...new Set([...Object.keys(baseline.hashes),...Object.keys(after)])].filter(p=>baseline.hashes[p]!==after[p]);
const provider=await(await fetch('http://127.0.0.1:6195/qa/stats')).json();output('provider-final.json',provider);
const names=['nginx','gateway','frontend','backend','old','provider','db'].map(x=>prefix+'-'+x);
const evidence={date:new Date().toISOString(),uat_before:baseline.uat,uat_after:uat(),protected_hash_differences:differences,provider_calls:provider.calls.length,provider_catalogs:provider.catalogs,provider_queue:provider.queued,real_model_calls:0,synthetic_db:JSON.parse(sql("SELECT json_build_object('accounts',(SELECT count(*) FROM wordweave.accounts),'runs',(SELECT count(*) FROM wordweave.generation_runs),'active_runs',(SELECT count(*) FROM wordweave.generation_runs WHERE call_status='active'),'batches',(SELECT count(*) FROM wordweave.learning_batches),'vocabulary_entries',(SELECT count(*) FROM wordweave.vocabulary_entries));")),containers:docker(['inspect','--format','{{.Name}} {{.Id}} {{.Image}}',...names]),networks:docker(['network','inspect','--format','{{.Name}} internal={{.Internal}}',prefix,prefix+'-ingress'])};
if(differences.length||evidence.uat_before!==evidence.uat_after)throw Error('Protected state changed; inspect before cleanup');
for(const name of names)if(docker(['inspect','--format','{{index .Config.Labels "wordweave.qa"}}',name])!=='cr039-094')throw Error('Unowned cleanup target '+name);
for(const network of [prefix,prefix+'-ingress'])if(docker(['network','inspect','--format','{{index .Labels "wordweave.qa"}}',network])!=='cr039-094')throw Error('Unowned network '+network);
docker(['rm','-f',...names]);docker(['network','rm',prefix,prefix+'-ingress']);
evidence.removed=names;evidence.removed_data='Only disposable tmpfs QA094 synthetic cluster; recreatable with setup and fixtures. No existing data or candidate image removed.';evidence.uat_after_cleanup=uat();
output('closure.json',evidence);
const files={};for(const name of readdirSync(dir)){if(name==='manifest.json')continue;const p=join(dir,name);if(statSync(p).isFile())files[name]=createHash('sha256').update(readFileSync(p)).digest('hex');}
output('manifest.json',{date:new Date().toISOString(),agent:'qa-quinn',scope:'CR-039 independent synthetic verification',real_model_calls:0,uat_modified:false,actual_model:'not_observed',usage:'not_observed',files});
console.log(JSON.stringify({protected_files:Object.keys(after).length,differences,uat_unchanged:evidence.uat_before===evidence.uat_after_cleanup,provider_calls:provider.calls.length,removed_containers:names.length}));
