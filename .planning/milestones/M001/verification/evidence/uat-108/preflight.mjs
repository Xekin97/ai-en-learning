import {mkdtempSync,chmodSync,readFileSync,statSync,existsSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {dir,root,names,images,docker,sql,inspect,envOf,safe,same,hash,authority,keptTables,counts,keepDigests,publish,privateWrite} from "./helpers.mjs";
authority();
const clone="wordweave-uat108-recovery-check";let created=false,backup;const result={date:new Date().toISOString(),stage:"preflight",realModelCalls:0};
try {
 if(existsSync(join(dir,"preflight-recheck.json")))throw Error("Existing recheck; inspect before repeating");
 const runtime=inspect();if(Object.values(runtime).some(c=>c.Config.Labels["com.docker.compose.project"]!=="wordweave_uat"||!c.State.Running||c.State.Health?.Status!=="healthy"))throw Error("Unexpected runtime owner/health");
 if(runtime.postgres.Id!=="37a6d2fa58c578b1c6b4dbe10028b5ddf0c696fe44fc849a129293a85bbaf839")throw Error("Database container identity mismatch");
 if(runtime.backend.Image!=="sha256:ab12e7dec0a6a8beb55df2ec6a8174d01d288681215c1108cec997e6f99f8eee")throw Error("Unexpected backend prestate");
 const identity=JSON.parse(sql("SELECT json_build_object('database',current_database(),'role',current_user,'system_id',(SELECT system_identifier::text FROM pg_control_system()),'version',current_setting('server_version_num'),'bytes',pg_database_size(current_database()),'wal_bytes',(SELECT sum(size) FROM pg_ls_waldir()),'active_runs',(SELECT count(*) FROM wordweave.generation_runs WHERE call_status='active'),'bad_key_owner',(SELECT count(*) FROM wordweave.openrouter_credentials c LEFT JOIN wordweave.accounts a ON a.id=c.updated_by WHERE c.updated_by IS NOT NULL AND (a.id IS NULL OR a.role<>'admin')));"));
 if(identity.database!=="wordweave"||identity.system_id!=="7681129149544701995"||Math.floor(Number(identity.version)/10000)!==18||identity.active_runs!==0||identity.bad_key_owner!==0)throw Error("Database precondition failed");
 const tables=JSON.parse(sql("SELECT json_agg(table_name ORDER BY table_name) FROM information_schema.tables WHERE table_schema='wordweave' AND table_type='BASE TABLE';"));
 if(tables.length!==23)throw Error("Unknown table set");
 const before=counts(),digests=keepDigests();if(before.admins<1||before.schema_migrations!==6)throw Error("Administrator or ledger precondition");
 backup=mkdtempSync(join(tmpdir(),"wordweave-uat108-preserved-"));chmodSync(backup,0o700);
 privateWrite(backup,"runtime-private.json",JSON.stringify(runtime));
 privateWrite(backup,"preserved-digests.json",JSON.stringify(digests));
 privateWrite(backup,"schema.dump",docker(["exec",names.postgres,"pg_dump","-U","postgres","-d","wordweave","--format=custom","--schema-only","--no-owner","--no-acl","--schema=wordweave"],{binary:true}));
 for(const table of keptTables){const filter=table==="accounts"?" WHERE role='admin'":"";privateWrite(backup,table+".csv",docker(["exec","-i",names.postgres,...["psql","-U","postgres","-d","wordweave","-XqAt","-v","ON_ERROR_STOP=1"]],{input:"COPY (SELECT * FROM wordweave."+table+filter+") TO STDOUT WITH (FORMAT csv, HEADER true);",binary:true}));}
 if(!same(digests,keepDigests()))throw Error("Retained data changed during snapshot");
 console.log(JSON.stringify({progress:"retained-only backup created; restoring isolated copy",backupDirectory:backup}));
 docker(["run","-d","--name",clone,"--label","wordweave.task=uat108-recovery","--network","none","--tmpfs","/var/lib/postgresql","-e","POSTGRES_PASSWORD=uat108-synthetic-only","-e","POSTGRES_DB=wordweave",runtime.postgres.Image]);created=true;
 for(let i=0;i<40;i++){try{docker(["exec",clone,"pg_isready","-U","postgres","-d","wordweave"]);break;}catch{if(i===39)throw Error("Recovery sandbox startup failed");await new Promise(r=>setTimeout(r,500));}}
 docker(["exec","-i",clone,"pg_restore","-U","postgres","-d","wordweave","--no-owner","--no-acl","--exit-on-error"],{input:readFileSync(join(backup,"schema.dump"))});
 for(const table of keptTables)docker(["exec","-i",clone,"psql","-U","postgres","-d","wordweave","-Xq","-v","ON_ERROR_STOP=1","-c","COPY wordweave."+table+" FROM STDIN WITH (FORMAT csv, HEADER true)"],{input:readFileSync(join(backup,table+".csv"))});
 const restored=counts(clone),restoredDigests=keepDigests(clone);
 if(!same(digests,restoredDigests)||restored.learners!==0||restored.generation_runs!==0||restored.learning_batches!==0)throw Error("Recovery check mismatch");
 const backupFiles=["runtime-private.json","preserved-digests.json","schema.dump",...keptTables.map(t=>t+".csv")].map(name=>({name,mode:(statSync(join(backup,name)).mode&0o777).toString(8),bytes:statSync(join(backup,name)).size,sha256:hash(readFileSync(join(backup,name)))}));
 if(backupFiles.some(x=>x.mode!=="600"))throw Error("Backup permissions mismatch");
 const free=docker(["exec",names.postgres,"df","-Pk","/var/lib/postgresql"]);
 const declarations={...images};for(const [kind,image] of Object.entries(images))if(docker(["image","inspect",image,"--format","{{.Id}}"])!==image)throw Error("Candidate missing "+kind);
 Object.assign(result,{status:"PASS",before:Object.fromEntries(Object.entries(runtime).map(([k,c])=>[k,safe(c)])),identity,countsBefore:before,tables,backup:{directory:backup,mode:"700",files:backupFiles,scope:"Schema and explicitly retained data only; no learner/session/generation/library/review/claim rows",restoreVerified:true,retainedRowsEqual:true,deletedBusinessRowsExcluded:true},freeSpace:free,candidateImages:declarations,lockTimeout:"1s",statementTimeout:"20s",timeoutBasis:"Same tested values as QA107; current database approximately 25MB, zero active generation; fail closed on any timeout",deploymentStarted:false});
} catch(e){Object.assign(result,{status:"FAIL",error:e.message,backupDirectory:backup??null});process.exitCode=1;}
finally {
 if(created){docker(["rm","-f",clone]);result.recoverySandboxRemoved=true;}
 publish("preflight-recheck.json",result);console.log(JSON.stringify(result));
}
