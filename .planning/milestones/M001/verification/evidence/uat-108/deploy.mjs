import {readFileSync,existsSync} from "node:fs";
import {join} from "node:path";
import {dir,root,names,images,docker,sql,inspect,envOf,safe,same,hash,authority,businessTables,counts,keepDigests,publish,privateRead,healthy} from "./helpers.mjs";
authority();
const result={date:new Date().toISOString(),stage:"deploy",realModelCalls:0,stopped:false,cutoverCommitted:false};
try {
 if(existsSync(join(dir,"deployment.json")))throw Error("Deployment receipt exists; no automatic repeat");
 const pre=JSON.parse(readFileSync(join(dir,"preflight-recheck.json"),"utf8"));if(pre.status!=="PASS")throw Error("Preflight not passed");
 const folder=pre.backup.directory,original=privateRead(folder,"runtime-private.json"),digests=privateRead(folder,"preserved-digests.json"),before=inspect();
 if(!same(Object.fromEntries(Object.entries(before).map(([k,c])=>[k,safe(c)])),pre.before)||!same(digests,keepDigests()))throw Error("Runtime or retained rows changed since preflight");
 for(const f of pre.backup.files)if(hash(readFileSync(join(folder,f.name)))!==f.sha256)throw Error("Recovery backup changed");
 const be=envOf(original.backend),fe=envOf(original.frontend),pe=envOf(original.postgres);
 const env={...process.env,COMPOSE_DISABLE_ENV_FILE:"1",COMPOSE_PROJECT_NAME:"wordweave_uat",WORDWEAVE_PORT:"6001",BACKEND_INTERNAL_ORIGIN:fe.NUXT_BACKEND_INTERNAL_ORIGIN};
 for(const [k,v] of Object.entries(be))if(!["PATH","HOME","CODEX_HOME","SHELL"].includes(k))env[k]=v;
 const args=["compose","--env-file","/dev/null","--project-name","wordweave_uat","-f",join(root,"compose.yaml"),"-f",join(dir,"compose-images.yaml")];
 const config=JSON.parse(docker([...args,"config","--format","json"],{env}));
 if(config.services.backend.image!==images.backend||config.services.frontend.image!==images.frontend)throw Error("Candidate image configuration mismatch");
 for(const [k,v] of Object.entries(config.services.backend.environment))if(String(v)!==be[k])throw Error("Backend runtime drift at "+k);
 if(config.services.frontend.environment.NUXT_BACKEND_INTERNAL_ORIGIN!==fe.NUXT_BACKEND_INTERNAL_ORIGIN)throw Error("Frontend backend origin drift");
 if(config.services.backend.read_only!==original.backend.HostConfig.ReadonlyRootfs)throw Error("Backend readonly drift");
 if(pe.POSTGRES_DB!=="wordweave"||pe.POSTGRES_USER!=="postgres"||!pe.POSTGRES_PASSWORD)throw Error("Explicit maintenance connection unavailable");
 if(Number(sql("SELECT count(*) FROM wordweave.generation_runs WHERE call_status='active';"))!==0)throw Error("Active generation appeared");
 docker(["stop","--time","30",names.nginx,names.frontend,names.backend]);result.stopped=true;
 console.log(JSON.stringify({progress:"UAT writers stopped; checking exact target before cutover"}));
 const current=inspect();if([current.backend,current.frontend,current.nginx].some(c=>c.State.Running))throw Error("Writer remained running");
 const identity=JSON.parse(sql("SELECT json_build_object('db',current_database(),'system_id',(SELECT system_identifier::text FROM pg_control_system()),'other_clients',(SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() AND backend_type='client backend'));"));
 if(identity.db!==pre.identity.database||identity.system_id!==pre.identity.system_id||identity.other_clients!==0)throw Error("Unknown writer or target after shutdown; no termination attempted");
 const stoppedCounts=counts();result.countsAtStop=stoppedCounts;
 if(!same(digests,keepDigests()))throw Error("Retained data changed while stopping");
 const maintenanceURL="postgres://"+encodeURIComponent(pe.POSTGRES_USER)+":"+encodeURIComponent(pe.POSTGRES_PASSWORD)+"@postgres:5432/wordweave?sslmode=disable";
 const out=docker(["run","--rm","--name","wordweave-uat108-cutover","--label","wordweave.task=uat108-cutover","--pull=never","--network","wordweave_uat_data","--read-only","-e","MAINTENANCE_DATABASE_URL","--entrypoint","/usr/local/bin/wordweave-admin",images.backend,"cutover-entry-meaning","--database","wordweave","--system-id",pre.identity.system_id,"--role","postgres","--writers-stopped","--lock-timeout",pre.lockTimeout,"--statement-timeout",pre.statementTimeout],{env:{...process.env,MAINTENANCE_DATABASE_URL:maintenanceURL}});
 result.cutoverCommandExit=0;result.cutoverStdout=out;result.cutoverCommitted=true;
 const clean=counts(),afterDigests=keepDigests();
 const shape=JSON.parse(sql("SELECT json_build_object('new_column',(SELECT count(*) FROM information_schema.columns WHERE table_schema='wordweave' AND table_name='batch_targets' AND column_name='entry_meaning' AND data_type='text' AND is_nullable='NO'),'old_column',(SELECT count(*) FROM information_schema.columns WHERE table_schema='wordweave' AND table_name='batch_targets' AND column_name='contextual_meaning'),'ledger',(SELECT count(*) FROM wordweave.schema_migrations WHERE version='0007_entry_meaning.sql'));"));
 const groups=JSON.parse(sql("SELECT json_agg(json_build_object('code',g.code,'quota',g.rolling_quota_limit,'max_entries',g.max_entries_per_run,'lengths',(SELECT json_agg(length_code ORDER BY length_code) FROM wordweave.group_lengths l WHERE l.group_code=g.code),'model_count',(SELECT count(*) FROM wordweave.group_models m WHERE m.group_code=g.code)) ORDER BY g.code) FROM wordweave.entitlement_groups g;"));
 if(!same(digests,afterDigests)||clean.learners!==0||businessTables.some(t=>clean[t]!==0)||shape.new_column!==1||shape.old_column!==0||shape.ledger!==1||clean.schema_migrations!==7)throw Error("Cutover postcondition mismatch; keep closed");
 if(groups.length!==4||groups.some(g=>g.quota!==(g.code==="visitor"?5:null)||g.max_entries!==5||g.model_count!==0||!same(g.lengths,["long","medium","short","xlong"])))throw Error("Group reset mismatch");
 publish("cutover.json",{date:new Date().toISOString(),status:"PASS",commitKnown:true,commandExit:0,countsBefore:stoppedCounts,countsAfter:clean,retainedRowsEqual:true,shape,groups,realModelCalls:0,backupDirectory:folder});
 console.log(JSON.stringify({progress:"One-time cutover committed; retained data matches; starting paired candidate",deletedLearners:stoppedCounts.learners,deletedBatches:stoppedCounts.learning_batches,keptModels:clean.ai_models,keptAdmins:clean.admins}));
 const verifyArgs=["run","--rm","--pull=never","--network","wordweave_uat_data","--read-only"];
 for(const k of Object.keys(config.services.backend.environment))verifyArgs.push("-e",k);
 docker([...verifyArgs,"--entrypoint","/usr/local/bin/wordweave-admin",images.backend,"verify"],{env});
 docker([...args,"up","-d","--no-deps","--no-build","--pull","never","--timeout","30","backend","frontend"],{env});
 await healthy("backend");await healthy("frontend");
 docker(["start",names.nginx]);docker(["exec",names.nginx,"nginx","-t"]);docker(["exec",names.nginx,"nginx","-s","reload"]);
 await healthy("nginx");
 const after=inspect();if(after.backend.Image!==images.backend||after.frontend.Image!==images.frontend||after.postgres.Id!==before.postgres.Id||after.nginx.Id!==before.nginx.Id)throw Error("Container identity mismatch");
 for(const [k,v] of Object.entries(be))if(envOf(after.backend)[k]!==v)throw Error("Backend actual environment drift");
 if(!same(safe(before.backend).networks,safe(after.backend).networks)||!same(safe(before.frontend).networks,safe(after.frontend).networks))throw Error("Runtime network drift");
 const health={};for(const p of ["/health/live","/health/ready","/"]){const res=await fetch("http://localhost:6001"+p,{signal:AbortSignal.timeout(15000)});health[p]=res.status;if(res.status!==200)throw Error("Public readiness failed");}
 if(!same(digests,keepDigests()))throw Error("Preserved rows changed after startup");
 Object.assign(result,{status:"PASS",countsImmediatelyAfterCutover:clean,countsAfterStartup:counts(),shape,groups,retainedRowsEqual:true,runtimeEnvironmentPreserved:true,frontendOriginPreserved:true,databaseContainerAndVolumePreserved:true,before:pre.before,after:Object.fromEntries(Object.entries(after).map(([k,c])=>[k,safe(c)])),health,backupDirectory:folder,pairedReadinessPassed:true,nginxReusedAndRestarted:true});
} catch(e) {
 Object.assign(result,{status:"FAIL",error:e.message,recovery:"No cleanup retry or old-data restore; inspect exact transaction/ledger state before further action"});
 if(result.stopped){try{docker(["stop","--time","10",names.nginx]);result.ingressKeptClosed=true;}catch{result.ingressClosureNotConfirmed=true;}}
 process.exitCode=1;
}finally{publish("deployment.json",result);console.log(JSON.stringify(result));}
