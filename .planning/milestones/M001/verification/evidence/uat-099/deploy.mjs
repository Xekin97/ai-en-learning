// UAT099 deployment-only: no model invocation, no migration, no business mutation.
import {readFileSync,writeFileSync,chmodSync,mkdtempSync,statSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {dir,root,names,target,frontend,previous,docker,sql,hash,output,same,inspect,envOf,safe,data,privateData,models,protectedHashes,inFlight,waitHealthy,assertAuthority} from './helpers.mjs';
const mode=process.argv[2];let backup,changed=false,runEnv,rollbackArgs;
const baseArgs=['compose','--env-file','/dev/null','--project-name','wordweave_uat','-f',join(root,'compose.yaml')];
const envFor=c=>{const e={...process.env,COMPOSE_DISABLE_ENV_FILE:'1',COMPOSE_PROJECT_NAME:'wordweave_uat'};for(const [k,v] of Object.entries(envOf(c)))if(!['PATH','HOME','CODEX_HOME','SHELL'].includes(k))e[k]=v;return e;};
const assertQuiescent=async()=>{const c=JSON.parse(sql("SELECT json_build_object('active',(SELECT count(*) FROM wordweave.generation_runs WHERE call_status='active'),'drafts',(SELECT count(*) FROM wordweave.generation_drafts WHERE expires_at>clock_timestamp()),'claims',(SELECT count(*) FROM wordweave.visitor_claims WHERE status='active' AND expires_at>clock_timestamp()));"));if(Object.values(c).some(n=>n!==0)||await inFlight()!==0)throw Error('Active requests/generation/drafts/claims; refuse deployment');return c;};
const checkRuntime=(resolved,current)=>{const desired=resolved.services.backend;if(desired.image!==target||desired.read_only!==current.HostConfig.ReadonlyRootfs)throw Error('Backend image/read-only intent drift');for(const [k,v] of Object.entries(desired.environment))if(String(v)!==envOf(current)[k])throw Error('Runtime environment mismatch at '+k);const intended=Object.keys(desired.networks).map(k=>resolved.networks[k].name).sort();if(!same(intended,Object.keys(current.NetworkSettings.Networks).sort()))throw Error('Network change would be required');if(current.Mounts.length||Object.keys(current.HostConfig.PortBindings||{}).length)throw Error('Unexpected backend mount/port override');};
try{
 assertAuthority();if(!['--preflight','--resume-preflight','--deploy'].includes(mode))throw Error('Choose --preflight, --resume-preflight or --deploy');
 if(mode!=='--deploy'){
  const resume=mode==='--resume-preflight';
  if(existsSync(join(dir,'preflight.json')))throw Error('Preflight already completed');
  if(resume){
   const failure=JSON.parse(readFileSync(join(dir,'preflight-failure.json')));
   if(failure.deploymentStarted||failure.mode!=='--preflight'||!failure.backupDirectory)throw Error('Not a resumable preflight');
   backup=failure.backupDirectory;
   if(!same(protectedHashes(),JSON.parse(readFileSync(join(dir,'baseline.json'))).hashes))throw Error('Protected file drift since original preflight');
  }else{
   if(existsSync(join(dir,'baseline.json')))throw Error('Preflight baseline already exists');
   output('baseline.json',{date:new Date().toISOString(),hashes:protectedHashes()});
  }
  const receipts={};for(const [kind,r] of [['verification','098'],['implementation','097']]){const p=join(root,'.planning/milestones/M001',kind,'evidence/cr039-'+r),m=JSON.parse(readFileSync(join(p,'manifest.json')));for(const [f,h] of Object.entries(m.files))if(hash(join(p,f))!==h)throw Error('Upstream evidence drift '+r+'/'+f);receipts[kind+r]=Object.keys(m.files).length;}
  for(const f of JSON.parse(readFileSync(join(root,'.planning/milestones/M001/implementation/evidence/cr039-097/source-manifest.json'))).files)if(hash(join(root,f.path))!==f.sha256)throw Error('Candidate source drift');
  const before=inspect();if(before.some(c=>c.Config.Labels['com.docker.compose.project']!=='wordweave_uat'||!c.State.Running||c.State.Health?.Status!=='healthy'))throw Error('UAT services not healthy/owned');
  if(before[0].Image!==frontend||before[1].Image!==previous)throw Error('Unexpected UAT baseline');
  if(docker(['image','inspect','wordweave-backend:cr039-097','--format','{{.Id}}'])!==target)throw Error('Candidate image mismatch');
  const beforeData=data(),secret=privateData(),quiescent=await assertQuiescent();
  if(beforeData.counts.migration_count!==6||beforeData.counts.latest_migration!=='0006_hint_occurrences_enforce.sql')throw Error('Migration baseline mismatch');
  runEnv=envFor(before[1]);const composeArgs=[...baseArgs,'-f',join(dir,'compose-images.yaml')];
  const resolved=JSON.parse(docker([...composeArgs,'config','--format','json'],{env:runEnv}));checkRuntime(resolved,before[1]);
  if(resume){
   const original=JSON.parse(readFileSync(join(backup,'runtime-private.json'))),saved=JSON.parse(readFileSync(join(backup,'data-private.json')));
   if(!same(before.map(safe),original.map(safe))||!same(beforeData,saved.data)||!same(secret,saved.secrets))throw Error('Original backup baseline no longer matches; no deployment');
  }else{
  backup=mkdtempSync(join(tmpdir(),'wordweave-uat-099-'));chmodSync(backup,0o700);
  const privateWrite=(n,bytes)=>{const p=join(backup,n);writeFileSync(p,bytes,{mode:0o600,flag:'wx'});chmodSync(p,0o600);return p;};
  privateWrite('runtime-private.json',JSON.stringify(before));privateWrite('data-private.json',JSON.stringify({data:beforeData,secrets:secret}));
  if(before[1].Config.Env.some(x=>/[\r\n]/.test(x)))throw Error('Multiline runtime environment cannot be safely reused by env-file');
  privateWrite('backend-private.env',before[1].Config.Env.join('\n')+'\n');
  privateWrite('wordweave.dump',docker(['exec',names[3],'pg_dump','-U','postgres','-d','wordweave','--format=custom','--no-owner','--no-acl'],{binary:true}));
  privateWrite('restore-application.yaml','services:\n  backend:\n    image: '+previous+'\n');
  }
  const envFile=join(backup,'backend-private.env');
  docker(['run','--rm','--pull=never','--network','wordweave_uat_data','--read-only','--env-file',envFile,'--entrypoint','/usr/local/bin/wordweave-admin',target,'verify']);
  // pg_restore --list may close stdin after reading the TOC; accept EPIPE only
  // with successful process exit AND a validated TOC, never for DB/application commands.
  const archive=spawnSync('docker',['exec','-i',names[3],'pg_restore','--list'],{input:readFileSync(join(backup,'wordweave.dump')),encoding:'utf8',maxBuffer:1024*1024});
  if(archive.status!==0||(archive.error&&archive.error.code!=='EPIPE'))throw Error('Backup TOC reader did not complete successfully');
  const listing=archive.stdout??'';
  if(!listing.includes('learning_batches')||!same(data(),beforeData)||!same(privateData(),secret))throw Error('Backup consistency/readability or concurrent data change');
  if(resume)output('preflight-recovery.json',{date:new Date().toISOString(),originalFailureRetained:true,originalBackupReused:true,originalContainersDataAndSecretsUnchanged:true,readOnlyCandidateVerifyRepeated:true,archiveExitCode:archive.status,archiveInputErrorCode:archive.error?.code??null,archiveContainsLearningBatches:true,archiveListingBytes:Buffer.byteLength(listing),realModelCalls:0,deploymentStarted:false});
  output('preflight.json',{date:new Date().toISOString(),agent:'qa-quinn',authorization:'TRANSITION-M001-099',status:'PASS',before:before.map(safe),target,frontend,previous,dataBefore:beforeData,models:models(),quiescent,receipts,candidateReadOnlyVerify:true,backup:{directory:backup,mode:(statSync(backup).mode&0o777).toString(8),files:['runtime-private.json','data-private.json','backend-private.env','wordweave.dump','restore-application.yaml'].map(n=>({name:n,bytes:statSync(join(backup,n)).size,mode:(statSync(join(backup,n)).mode&0o777).toString(8)})),dumpListValid:true},runtimeSource:'Exact current Docker Config.Env; --env-file /dev/null disables stale Compose env files; secrets remain private',realModelCalls:0,realV3Quality:'not_verified',deploymentStarted:false});
  console.log(JSON.stringify({preflight:'PASS',quiescent,models:models().map(m=>({name:m.name,enabled:m.enabled,provider_model:m.provider_model})),backupDirectory:backup,readOnlyCandidateVerify:true}));
 }else{
  if(existsSync(join(dir,'deployment.json'))||existsSync(join(dir,'deployment-failure.json')))throw Error('Deployment result exists; inspect before any retry');
  const pre=JSON.parse(readFileSync(join(dir,'preflight.json')));backup=pre.backup.directory;
  const original=JSON.parse(readFileSync(join(backup,'runtime-private.json'))),expected=JSON.parse(readFileSync(join(backup,'data-private.json'))),before=inspect();
  if(pre.status!=='PASS'||!same(before.map(safe),original.map(safe))||!same(data(),expected.data)||!same(privateData(),expected.secrets))throw Error('Baseline changed after preflight; deployment not started');
  if(!same(protectedHashes(),JSON.parse(readFileSync(join(dir,'baseline.json'))).hashes))throw Error('Protected file drift before deployment');
  await assertQuiescent();runEnv=envFor(before[1]);const args=[...baseArgs,'-f',join(dir,'compose-images.yaml')];rollbackArgs=[...baseArgs,'-f',join(backup,'restore-application.yaml')];
  checkRuntime(JSON.parse(docker([...args,'config','--format','json'],{env:runEnv})),before[1]);
  // Recreate first stops/removes the old backend before starting its replacement.
  const start=performance.now();changed=true;
  docker([...args,'up','-d','--no-deps','--no-build','--pull','never','--timeout','30','backend'],{env:runEnv});
  await waitHealthy();docker(['exec',names[2],'nginx','-t']);docker(['exec',names[2],'nginx','-s','reload']);
  const after=inspect(),afterData=data(),afterSecrets=privateData();
  const checks={backendCandidate:after[1].Image===target,backendRecreated:before[1].Id!==after[1].Id,otherContainerIdentityUnchanged:[0,2,3].every(i=>same(safe(before[i]),safe(after[i]))),allHealthy:after.every(c=>c.State.Health?.Status==='healthy'),runtimeEnvironmentPreserved:same(envOf(before[1]),envOf(after[1])),backendNetworkPreserved:same(safe(before[1]).networks,safe(after[1]).networks),backendReadonlyPreserved:safe(before[1]).readonly===safe(after[1]).readonly,publicDataPreserved:same(expected.data,afterData),passwordCredentialSessionPreserved:same(expected.secrets,afterSecrets),noActiveGeneration:afterData.counts.active_runs===0,noRealGeneration:afterData.counts.runs===expected.data.counts.runs};
  for(const path of ['/health/live','/health/ready']){const r=await fetch('http://localhost:6001'+path,{signal:AbortSignal.timeout(10000)});checks[path]=r.status===200;}
  const result={date:new Date().toISOString(),agent:'qa-quinn',status:Object.values(checks).every(Boolean)?'PASS':'FAIL',target,frontend,previous,before:before.map(safe),after:after.map(safe),checks,dataBefore:expected.data,dataAfter:afterData,elapsed_ms:Math.round(performance.now()-start),privateBackupDirectory:backup,realModelCalls:0,migrationsRun:false,imagesBuiltOrPulled:false,frontendRecreated:false,nginxReloaded:true};
  output('deployment.json',result);if(result.status!=='PASS')throw Error('Post-deployment preservation/health check failed');
  console.log(JSON.stringify({deployment:'PASS',checks,elapsed_ms:result.elapsed_ms}));
 }
}catch(e){
 const rollback={attempted:false,success:false};if(changed&&runEnv&&rollbackArgs){rollback.attempted=true;try{docker([...rollbackArgs,'up','-d','--no-deps','--no-build','--pull','never','--timeout','30','backend'],{env:runEnv});await waitHealthy();docker(['exec',names[2],'nginx','-s','reload']);rollback.success=inspect()[1].Image===previous;}catch{rollback.error='Application restore did not complete; private runtime snapshot retained';}}
 const result={date:new Date().toISOString(),mode,error:e.message,backupDirectory:backup??null,deploymentStarted:changed,rollback,realModelCalls:0};output(mode==='--preflight'?'preflight-failure.json':mode==='--resume-preflight'?'preflight-recovery-failure.json':'deployment-failure.json',result);console.log(JSON.stringify(result));process.exitCode=1;
}
