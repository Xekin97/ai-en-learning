// One approved minimal-annotation capture deployment. No full content, AI calls or migrations.
import { readFileSync, mkdtempSync, unlinkSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { docker, sql, inspect, envOf, safe, hash, root, privateWrite } from '../uat-108/helpers.mjs';

const candidate = 'sha256:7d16e9027ad44134352b5f9022e8d7e13fd5449b94491373c801683cf85ff95c';
const previous = candidate;
const oldVolume = 'wordweave-uat-annotation-capture-120';
const result = { gate:'TRANSITION-M001-120', authorization:'USER-ANNOTATION-WINDOW-20260910', startedAt:new Date().toISOString(), realModelCalls:0, explicitDatabaseWrites:0, migrations:0, dataCleanup:0, userAccepted:false, releaseApproved:false };
const requireThat = (ok, message) => { if (!ok) throw Error(message); };
const canonical = obj => JSON.stringify(Object.fromEntries(Object.entries(obj).sort(([a],[b])=>a.localeCompare(b))));
const protectedTables = ['ai_models','openrouter_credentials','entitlement_groups','group_models','group_lengths','schema_migrations','accounts','learning_batches','batch_targets','passage_occurrences','hint_occurrences','review_results','review_session_targets','review_session_batches','review_sessions'];
function protectedDigests() {
  const fields = protectedTables.map(t=>"'"+t+"',(SELECT md5(coalesce(string_agg(md5(row_to_json(x)::text),'' ORDER BY md5(row_to_json(x)::text)),'')) FROM (SELECT * FROM wordweave."+t+") x)");
  return JSON.parse(sql('BEGIN READ ONLY; SELECT json_build_object('+fields.join(',')+'); COMMIT;').split('\n').find(line=>line.startsWith('{')));
}
const active = () => Number(sql("SELECT count(*) FROM wordweave.generation_runs WHERE call_status='active';"));
let before, backendEnv, deployEnv, replacementAttempted=false, volumeCreated=false, helperCreated=false, privateFolder, ticketPath;
const volume='wordweave-uat-annotation-capture-120-renew-20260910', helper='wordweave-uat-annotation-init-renew-20260910';
const helperImage='sha256:587c6fae871c9d14eb79352bd3df80670ffb2c297997085aefc39797f3e8af37';
const composeBase=['compose','--env-file','/dev/null','--project-name','wordweave_uat','-f',join(root,'compose.yaml'),'-f','-'];
function compose(image,args,volumeName=volume) {
  // Only the minimal annotation mode; never enable full candidate capture.
  const override={services:{backend:{image}}};
  if(image===candidate){override.services.backend.environment={UAT_ANNOTATION_CAPTURE_DIR:'/uat-annotation'};override.services.backend.volumes=[{type:'volume',source:'annotation-capture-120',target:'/uat-annotation',volume:{nocopy:true}}];override.volumes={'annotation-capture-120':{external:true,name:volumeName}};}
  return docker([...composeBase,...args],{input:JSON.stringify(override),env:deployEnv});
}
async function healthy() {
  for(let i=0;i<50;i++) {
    const b=inspect().backend;
    if(b.State.Running && b.State.Health?.Status==='healthy') return;
    await new Promise(resolve=>setTimeout(resolve,1000));
  }
  throw Error('Backend readiness did not pass within50seconds');
}
function reviewedSources() {
  const e=JSON.parse(readFileSync(join(root,'.planning/milestones/M001/implementation/evidence/annotation-capture-119/developer.json'),'utf8'));
  for(const x of e.sourceFiles) requireThat(hash(readFileSync(join(root,x.path)))===x.sha256,'Reviewed source changed: '+x.path);
  return e.sourceFiles;
}
try {
  const state=readFileSync(join(root,'.planning/workflow/state.yaml'),'utf8');
  const auth=readFileSync(join(root,'.planning/milestones/M001/verification/stream-failure-diagnosis.md'),'utf8');
  requireThat(state.includes('stage: verification') && state.includes('active_agent: qa-quinn') && auth.includes('CONFIRMED（USER-ANNOTATION-WINDOW-20260910）'),'Missing current renewal authority');
  result.sourceFiles=reviewedSources();
  const image=JSON.parse(docker(['image','inspect',candidate]))[0];
  requireThat(image.Id===candidate && image.Config.User==='nonroot:nonroot' && JSON.stringify(image.Config.Entrypoint)==='["/usr/local/bin/wordweave"]','Candidate image identity or execution boundary mismatch');
  before=inspect();
  result.before=Object.fromEntries(Object.entries(before).map(([k,c])=>[k,safe(c)]));
  for(const c of Object.values(before)) requireThat(c.State.Running && c.State.Health?.Status==='healthy','Existing UAT service unhealthy');
  requireThat(before.backend.Image===previous && before.backend.Id==='a5d87453ed63ef4cff37fea9c34513dbf88e453779ba106f5fe594ee86131387','Unexpected restored backend baseline');
  requireThat(before.backend.Mounts.length===1 && before.backend.Mounts[0].Name===oldVolume && before.backend.Mounts[0].Destination==='/uat-annotation','Unexpected restored backend mount');
  requireThat(before.postgres.Id==='37a6d2fa58c578b1c6b4dbe10028b5ddf0c696fe44fc849a129293a85bbaf839' && before.postgres.Mounts.some(x=>x.Name==='wordweave_uat_wordweave-pg'),'Unexpected database instance or volume');
  requireThat(active()===0,'Active generation exists; runtime not modified');
  result.activeBefore=0;
  result.protectedBefore=protectedDigests();
  backendEnv=envOf(before.backend);
  requireThat(backendEnv.PUBLIC_ORIGIN==='http://localhost:6001' && !backendEnv.UAT_FAILURE_CAPTURE_DIR && backendEnv.UAT_ANNOTATION_CAPTURE_DIR==='/uat-annotation','Unexpected restored runtime origin/capture baseline');
  const appEnv=Object.fromEntries(Object.entries(backendEnv).filter(([key])=>!['PATH','SSL_CERT_FILE','UAT_FAILURE_CAPTURE_DIR','UAT_ANNOTATION_CAPTURE_DIR'].includes(key)));
  deployEnv={...process.env,...appEnv,BACKEND_INTERNAL_ORIGIN:envOf(before.frontend).NUXT_BACKEND_INTERNAL_ORIGIN,WORDWEAVE_PORT:'6001',COMPOSE_PROJECT_NAME:'wordweave_uat',COMPOSE_DISABLE_ENV_FILE:'1'};
  const config=JSON.parse(compose(candidate,['config','--format','json']));
  requireThat(canonical(config.services.backend.environment)===canonical({...appEnv,UAT_ANNOTATION_CAPTURE_DIR:'/uat-annotation'}),'Compose would change application environment');
  requireThat(config.services.backend.read_only===true && config.services.backend.volumes?.length===1 && canonical(config.services.backend.healthcheck.test)===canonical(before.backend.Config.Healthcheck.Test),'Unexpected read-only/mount/readiness configuration');
  requireThat(active()===0,'New active generation appeared; runtime not modified');
  reviewedSources();
  requireThat(!docker(['volume','ls','--format','{{.Name}}']).split('\n').includes(volume),'Diagnostic volume already exists; refuse reuse');
  requireThat(!docker(['ps','-a','--format','{{.Names}}']).split('\n').includes(helper),'Diagnostic initializer already exists');
  const binding=JSON.parse(sql("SELECT json_build_object('subject',CASE WHEN account_id IS NOT NULL THEN 'account:'||account_id::text ELSE 'visitor:'||visitor_id::text END,'model_id',model_id) FROM wordweave.generation_runs WHERE id='01a085f3-4938-737e-a4f8-0effffdb5438';"));
  requireThat(/^(account|visitor):[0-9a-f-]{36}$/.test(binding.subject) && binding.model_id==='01a07fe3-5c48-736a-a86b-1f4dabd7cb87','Run binding does not match approved scope');
  const ticket={expires_at:new Date(Date.now()+60*60_000).toISOString(),model_id:binding.model_id,subject_hash:hash('wordweave-uat-capture:'+binding.subject)};
  result.expiresAt=ticket.expires_at;result.testingIdentityKind=binding.subject.split(':')[0];result.subjectBindingVerified=true;
  privateFolder=mkdtempSync(join(tmpdir(),'ww-annotation-renew-20260910-'));
  ticketPath=privateWrite(privateFolder,'ticket.json',JSON.stringify(ticket));
  docker(['volume','create','--driver','local','--opt','type=tmpfs','--opt','device=tmpfs','--opt','o=size=2m,uid=65532,gid=65532,mode=0700','--label','wordweave.task=uat-annotation-capture-120',volume]);volumeCreated=true;
  docker(['run','-d','--pull','never','--name',helper,'--network','none','--mount','type=volume,src='+volume+',dst=/capture,volume-nocopy','--mount','type=volume,src='+oldVolume+',dst=/old,readonly,volume-nocopy','--entrypoint','/bin/sleep',helperImage,'3600']);helperCreated=true;
  const oldTicket=JSON.parse(docker(['exec',helper,'cat','/old/ticket.json']));
  requireThat(Date.parse(oldTicket.expires_at)<Date.now(),'Previous window has not expired');
  requireThat(oldTicket.subject_hash===ticket.subject_hash && oldTicket.model_id===ticket.model_id,'Binding differs from previous window');
  result.oldWindowExpired=true; result.previousExpiresAt=oldTicket.expires_at;
  result.oldEntries=docker(['exec',helper,'ls','-1A','/old']).split('\n');
  requireThat(!result.oldEntries.includes('annotation.json') && !result.oldEntries.includes('failure.json'),'Expired sample remains; stop for cleanup investigation');
  result.oldSampleAbsent=true;
  docker(['cp',ticketPath,helper+':/capture/ticket.json']);
  docker(['exec',helper,'chown','65532:65532','/capture/ticket.json']);
  docker(['exec',helper,'chmod','0600','/capture/ticket.json']);
  result.permissions=docker(['exec',helper,'stat','-c','%a %u %g','/capture','/capture/ticket.json']).split('\n');
  requireThat(JSON.stringify(result.permissions)===JSON.stringify(['700 65532 65532','600 65532 65532']),'Private permission mismatch');
  requireThat(docker(['exec',helper,'stat','-f','-c','%T','/capture'])==='tmpfs','Capture storage is not tmpfs');
  requireThat(active()===0,'Active generation appeared before replacement');
  console.log(JSON.stringify({progress:'preflight_pass_minimal_annotation_capture',expiresAt:ticket.expires_at,fullCandidateCapture:false}));
  replacementAttempted=true;
  compose(candidate,['up','-d','--no-deps','--no-build','--pull','never','--timeout','150','backend']);
  await healthy();
  const after=inspect();
  const expectedEnv={...backendEnv,UAT_ANNOTATION_CAPTURE_DIR:'/uat-annotation'};
  requireThat(after.backend.Image===candidate,'Wrong running candidate');
  requireThat(canonical(envOf(after.backend))===canonical(expectedEnv),'Application configuration not preserved');
  requireThat(after.backend.HostConfig.ReadonlyRootfs && after.backend.Mounts.length===1 && after.backend.Mounts[0].Name===volume && after.backend.Mounts[0].Destination==='/uat-annotation','Private minimal capture mount missing');
  for(const k of ['frontend','nginx','postgres']) requireThat(canonical(safe(after[k]))===canonical(safe(before[k])),'Unrelated container changed: '+k);
  result.protectedAfter=protectedDigests();
  requireThat(canonical(result.protectedAfter)===canonical(result.protectedBefore),'Protected configuration or learning data changed; investigate without modifying data');
  requireThat(active()===0,'Unexpected startup active generation');
  result.activeAfter=0;
  docker(['exec','wordweave_uat-nginx-1','nginx','-t']);
  docker(['exec','wordweave_uat-nginx-1','nginx','-s','reload']);
  result.nginxAction='syntax_check_and_reload_only';
  result.routes=[];
  for(const [path,expectedStatus] of [['/health/live',200],['/health/ready',200],['/',200],['/api/v1/me/account',401]]) {
    const res=await fetch('http://localhost:6001'+path,{redirect:'manual',signal:AbortSignal.timeout(8000)});
    await res.arrayBuffer();
    result.routes.push({path,status:res.status,expectedStatus});
    requireThat(res.status===expectedStatus,'Local route mismatch: '+path);
  }
  result.protectedAfterRoutes=protectedDigests();
  requireThat(canonical(result.protectedAfterRoutes)===canonical(result.protectedBefore),'Protected rows changed across route checks');
  result.after=Object.fromEntries(Object.entries(inspect()).map(([k,c])=>[k,safe(c)]));
  result.configPreserved=true; result.protectedRowsPreserved=true;
  result.captureEnabled=true; result.fullCandidateCapture=false; result.currentImage=candidate;
  result.captureVolume=volume;result.initialEntries=docker(['exec',helper,'ls','-1A','/capture']).split('\n');
  result.samplePresentAtDeployment=result.initialEntries.includes('annotation.json');
  result.status='minimal_annotation_capture_enabled_awaiting_user_reproduction';
} catch(error) {
  result.status='deployment_failed';
  result.error=error.message;
  if(replacementAttempted) {
    try {
      requireThat(active()===0,'Active generation prevents fallback');
      // Restore the same image and the old expired ticket; no new capture window on fallback.
      compose(previous,['up','-d','--no-deps','--no-build','--pull','never','--timeout','150','backend'],oldVolume);
      await healthy();
      docker(['exec','wordweave_uat-nginx-1','nginx','-s','reload']);
      result.rollback=inspect().backend.Image===previous?'previous_backend_restored_expired_capture_ticket':'identity_mismatch';
    } catch(e) { result.rollbackError=e.message; }
  }
  process.exitCode=1;
} finally {
  if(helperCreated){try{docker(['stop','--time','1',helper]);docker(['rm',helper]);result.helperRemoved=true;}catch(e){result.helperCleanupError=e.message;process.exitCode=1;}}
  if(ticketPath){try{unlinkSync(ticketPath);result.hostTicketRemoved=true;}catch{result.hostTicketCleanupFailed=true;process.exitCode=1;}}
  if(privateFolder){try{rmdirSync(privateFolder);}catch{result.hostDirectoryCleanupFailed=true;process.exitCode=1;}}
  if(volumeCreated && result.status!=='minimal_annotation_capture_enabled_awaiting_user_reproduction'){try{docker(['volume','rm',volume]);result.failedVolumeRemoved=true;}catch(e){result.volumeCleanupError=e.message;}}
  result.finishedAt=new Date().toISOString();
  console.log(JSON.stringify(result,null,2));
}
