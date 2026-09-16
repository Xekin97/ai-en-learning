// QA098: reused QA096 isolated HTTP harness infrastructure; fresh database and candidate097.
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {dir,prefix,label,docker,sql,output,uat,hashes,backend} from './setup.mjs';
const baseline=JSON.parse(readFileSync(join(dir,'baseline.json'))),after=hashes();
const differences=[...new Set([...Object.keys(baseline.hashes),...Object.keys(after)])].filter(p=>baseline.hashes[p]!==after[p]);
const provider=await(await fetch('http://127.0.0.1:6200/qa/stats')).json();output('provider-final.json',provider);
const names=['ww-qa-cr039-098-gateway','ww-qa-cr039-098-backend','ww-qa-cr039-098-provider','ww-qa-cr039-098-db'];
const networks=['ww-qa-cr039-098','ww-qa-cr039-098-ingress'];
const evidence={date:new Date().toISOString(),protected_files:Object.keys(after).length,protected_hash_differences:differences,uat_before:baseline.uat,uat_after:uat(),provider_calls:provider.calls.length,provider_catalogs:provider.catalogs,provider_queue:provider.queued,real_model_calls:0,synthetic_db:JSON.parse(sql("SELECT json_build_object('accounts',(SELECT count(*) FROM wordweave.accounts),'runs',(SELECT count(*) FROM wordweave.generation_runs),'active_runs',(SELECT count(*) FROM wordweave.generation_runs WHERE call_status='active'),'batches',(SELECT count(*) FROM wordweave.learning_batches),'claims',(SELECT count(*) FROM wordweave.visitor_claims),'vocabulary_entries',(SELECT count(*) FROM wordweave.vocabulary_entries));")),containers:docker(['inspect','--format','{{.Name}} {{.Id}} {{.Image}}',...names]),networks:docker(['network','inspect','--format','{{.Name}} internal={{.Internal}}',...networks])};
if(differences.length||evidence.uat_before!==evidence.uat_after||evidence.synthetic_db.active_runs!==0||provider.queued!==0)throw Error('Refuse cleanup: inspect changed state or active calls');
for(const name of names)if(docker(['inspect','--format','{{index .Config.Labels "wordweave.qa"}}',name])!==label)throw Error('Unowned target '+name);
for(const name of networks)if(docker(['network','inspect','--format','{{index .Labels "wordweave.qa"}}',name])!==label)throw Error('Unowned network '+name);
docker(['rm','-f',...names]);docker(['network','rm',...networks]);
evidence.removed=names;evidence.removed_networks=networks;evidence.removed_data='Only this round disposable tmpfs synthetic database; exact temporary contents removed, scenarios can be regenerated from retained scripts. No existing data or candidate image removed.';evidence.uat_after_cleanup=uat();evidence.candidate_retained=docker(['image','inspect','wordweave-backend:cr039-097','--format','{{.Id}}'])===backend;evidence.residual_containers=docker(['ps','-a','--filter','label=wordweave.qa='+label,'--format','{{.Names}}']);
output('closure.json',evidence);console.log(JSON.stringify({protected_files:evidence.protected_files,differences,uat_unchanged:evidence.uat_before===evidence.uat_after_cleanup,synthetic_db:evidence.synthetic_db,provider_calls:provider.calls.length,removed_containers:names.length,removed_networks:networks.length,candidate_retained:evidence.candidate_retained}));
