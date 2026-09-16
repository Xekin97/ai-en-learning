import {execFileSync,spawnSync} from "node:child_process";
import {readFileSync,writeFileSync,chmodSync,statSync,existsSync} from "node:fs";
import {dirname,resolve,join} from "node:path";
import {fileURLToPath} from "node:url";
import {createHash} from "node:crypto";
export const dir=dirname(fileURLToPath(import.meta.url)),root=resolve(dir,"../../../../../..");
export const names={backend:"wordweave_uat-backend-1",frontend:"wordweave_uat-frontend-1",nginx:"wordweave_uat-nginx-1",postgres:"wordweave_uat-postgres-1"};
export const images={backend:"sha256:7cb89a2d4628cc568790cf4a556133cc76270f97d3e246aeb3e95374541b936d",frontend:"sha256:5903591c881165071c1cba08984cfb835854187f5df21a281640b3aacccf4b27"};
export const sqlArgs=["psql","-U","postgres","-d","wordweave","-XAt","-v","ON_ERROR_STOP=1"];
export function docker(args,{input,env=process.env,binary=false}={}) {
 try {const b=execFileSync("docker",args,{cwd:root,input,env,encoding:binary?undefined:"utf8",maxBuffer:128*1024*1024,stdio:["pipe","pipe","pipe"]});return binary?b:b.trim();}
 catch(error){throw Error("Docker "+args[0]+" failed (exit "+error.status+"); runtime output withheld");}
}
export const sql=(query,container=names.postgres)=>docker(["exec","-i",container,...sqlArgs],{input:query});
export const inspect=()=>Object.fromEntries(Object.entries(names).map(([key,name])=>[key,JSON.parse(docker(["inspect",name]))[0]]));
export const envOf=c=>Object.fromEntries(c.Config.Env.map(x=>{const i=x.indexOf("=");return [x.slice(0,i),x.slice(i+1)];}));
export const safe=c=>({id:c.Id,name:c.Name,image:c.Image,status:c.State.Status,health:c.State.Health?.Status,started:c.State.StartedAt,networks:Object.keys(c.NetworkSettings.Networks).sort(),mounts:c.Mounts.map(m=>({type:m.Type,name:m.Name,destination:m.Destination})),readonly:c.HostConfig.ReadonlyRootfs});
export const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export const hash=x=>createHash("sha256").update(x).digest("hex");
export function authority(){const s=readFileSync(join(root,".planning/workflow/state.yaml"),"utf8").split("\ncr040_uat_execution_authorization:\n")[1];if(!s||!s.includes("decision_id: TRANSITION-M001-108")||!s.includes("status: active")||!s.includes("actual_database_operations_authorized: true")||!s.includes("real_model_calls_authorized: false"))throw Error("Missing scoped authority");}
export const keptTables=["schema_migrations","entitlement_groups","vocabulary_snapshots","vocabulary_entries","ai_models","accounts","openrouter_credentials"];
export const businessTables=["visitor_claims","review_results","review_session_targets","review_session_batches","review_sessions","passage_occurrences","hint_occurrences","batch_targets","learning_batches","generation_drafts","generation_run_entries","generation_runs","account_sessions","visitor_identities","group_models"];
export function counts(container=names.postgres){return JSON.parse(sql("SELECT json_build_object("+[...keptTables,...businessTables,"group_lengths"].map(t=>"'"+t+"',(SELECT count(*) FROM wordweave."+t+")").concat(["'admins',(SELECT count(*) FROM wordweave.accounts WHERE role='admin')","'learners',(SELECT count(*) FROM wordweave.accounts WHERE role='learner')"]).join(",")+");",container));}
export function keepDigests(container=names.postgres){const out={};for(const t of keptTables){const where=t==="accounts"?" WHERE role='admin'":t==="schema_migrations"?" WHERE version<>'0007_entry_meaning.sql'":"";const projection=t==="entitlement_groups"?"code":"*";out[t]=sql("SELECT md5(coalesce(string_agg(md5(row_to_json(x)::text),'' ORDER BY md5(row_to_json(x)::text)),'')) FROM (SELECT "+projection+" FROM wordweave."+t+where+") x;",container);}return out;}
export function publish(name,value){const p=join(dir,name);writeFileSync(p,JSON.stringify(value,null,2)+"\n",{flag:"wx"});}
export function privateWrite(folder,name,content){const p=join(folder,name);writeFileSync(p,content,{flag:"wx",mode:0o600});chmodSync(p,0o600);return p;}
export const privateRead=(folder,name)=>JSON.parse(readFileSync(join(folder,name),"utf8"));
export async function healthy(which){for(let i=0;i<50;i++){const c=inspect()[which];if(c.State.Health?.Status==="healthy"&&c.State.Running)return;await new Promise(r=>setTimeout(r,1000));}throw Error(which+" did not become healthy");}
