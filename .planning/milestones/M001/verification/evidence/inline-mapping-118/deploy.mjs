// One approved local UAT backend replacement. No AI, migrations, data cleanup or secret output.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { docker, sql, inspect, envOf, safe, hash, root } from '../uat-108/helpers.mjs';

const candidate = 'sha256:90f23b57b1706d2f102a4ef7db5efe03bc95012033b1973ccf221a9673ef794c';
const previous = 'sha256:b1e8de6a90cac3fe4806359a0a7616445777186970868d39fe4663dee766f249';
const result = { gate:'TRANSITION-M001-118', authorization:'UAT-INLINE-117-DEPLOY', startedAt:new Date().toISOString(), realModelCalls:0, explicitDatabaseWrites:0, migrations:0, dataCleanup:0, userAccepted:false, releaseApproved:false };
const requireThat = (ok, message) => { if (!ok) throw Error(message); };
const canonical = obj => JSON.stringify(Object.fromEntries(Object.entries(obj).sort(([a],[b])=>a.localeCompare(b))));
const protectedTables = ['ai_models','openrouter_credentials','entitlement_groups','group_models','group_lengths','schema_migrations','accounts','learning_batches','batch_targets','passage_occurrences','hint_occurrences','review_results','review_session_targets','review_session_batches','review_sessions'];
function protectedDigests() {
  const fields = protectedTables.map(t=>"'"+t+"',(SELECT md5(coalesce(string_agg(md5(row_to_json(x)::text),'' ORDER BY md5(row_to_json(x)::text)),'')) FROM (SELECT * FROM wordweave."+t+") x)");
  return JSON.parse(sql('BEGIN READ ONLY; SELECT json_build_object('+fields.join(',')+'); COMMIT;').split('\n').find(line=>line.startsWith('{')));
}
const active = () => Number(sql("SELECT count(*) FROM wordweave.generation_runs WHERE call_status='active';"));
let before, backendEnv, deployEnv, replacementAttempted=false;
const composeBase=['compose','--env-file','/dev/null','--project-name','wordweave_uat','-f',join(root,'compose.yaml'),'-f','-'];
function compose(image,args) {
  // No capture environment or mount: the approved capture is spent; ordinary build is used.
  const override={services:{backend:{image}}};
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
  const e=JSON.parse(readFileSync(join(root,'.planning/milestones/M001/verification/evidence/inline-mapping-117/qa.json'),'utf8'));
  for(const x of [...e.sourceFiles,...e.qaFiles]) requireThat(hash(readFileSync(join(root,x.path)))===x.sha256,'Reviewed source changed: '+x.path);
  return e.sourceFiles;
}
try {
  const auth=readFileSync(join(root,'.planning/workflow/state.yaml'),'utf8').split('\ninline_mapping_uat_execution_request:\n')[1]?.split('\nfailure_capture_revision_authorization:')[0] || '';
  requireThat(auth.includes('status: authorized_for_one_local_backend_update') && auth.includes('gate: TRANSITION-M001-118') && auth.includes('deployment_authorized: true') && auth.includes('real_model_calls_authorized: false'),'Missing current one-shot deployment authority');
  result.sourceFiles=reviewedSources();
  const image=JSON.parse(docker(['image','inspect',candidate]))[0];
  requireThat(image.Id===candidate && image.Config.User==='nonroot:nonroot' && JSON.stringify(image.Config.Entrypoint)==='["/usr/local/bin/wordweave"]','Candidate image identity or execution boundary mismatch');
  before=inspect();
  result.before=Object.fromEntries(Object.entries(before).map(([k,c])=>[k,safe(c)]));
  for(const c of Object.values(before)) requireThat(c.State.Running && c.State.Health?.Status==='healthy','Existing UAT service unhealthy');
  requireThat(before.backend.Image===previous && before.backend.Id==='51b748cd8e7cbfb10ab3fb6d76cc02edb9f8bdfc6ae0a73dd38bf90204f27cad','Unexpected restored backend baseline');
  requireThat(before.backend.Mounts.length===0,'Unexpected restored backend mount');
  requireThat(before.postgres.Id==='37a6d2fa58c578b1c6b4dbe10028b5ddf0c696fe44fc849a129293a85bbaf839' && before.postgres.Mounts.some(x=>x.Name==='wordweave_uat_wordweave-pg'),'Unexpected database instance or volume');
  requireThat(active()===0,'Active generation exists; runtime not modified');
  result.activeBefore=0;
  result.protectedBefore=protectedDigests();
  backendEnv=envOf(before.backend);
  requireThat(backendEnv.PUBLIC_ORIGIN==='http://localhost:6001' && !backendEnv.UAT_FAILURE_CAPTURE_DIR,'Unexpected restored runtime origin/capture baseline');
  const appEnv=Object.fromEntries(Object.entries(backendEnv).filter(([key])=>!['PATH','SSL_CERT_FILE','UAT_FAILURE_CAPTURE_DIR'].includes(key)));
  deployEnv={...process.env,...appEnv,BACKEND_INTERNAL_ORIGIN:envOf(before.frontend).NUXT_BACKEND_INTERNAL_ORIGIN,WORDWEAVE_PORT:'6001',COMPOSE_PROJECT_NAME:'wordweave_uat',COMPOSE_DISABLE_ENV_FILE:'1'};
  const config=JSON.parse(compose(candidate,['config','--format','json']));
  requireThat(canonical(config.services.backend.environment)===canonical(appEnv),'Compose would change application environment');
  requireThat(config.services.backend.read_only===true && !config.services.backend.volumes?.length && canonical(config.services.backend.healthcheck.test)===canonical(before.backend.Config.Healthcheck.Test),'Unexpected read-only/mount/readiness configuration');
  requireThat(active()===0,'New active generation appeared; runtime not modified');
  reviewedSources();
  console.log(JSON.stringify({progress:'preflight_pass_replacing_only_backend',activeGenerations:0,protectedTableDigests:protectedTables.length,diagnosticCapture:'disabled_in_ordinary_build'}));
  replacementAttempted=true;
  compose(candidate,['up','-d','--no-deps','--no-build','--pull','never','--timeout','150','backend']);
  await healthy();
  const after=inspect();
  const expectedEnv=Object.fromEntries(Object.entries(backendEnv).filter(([key])=>key!=='UAT_FAILURE_CAPTURE_DIR'));
  requireThat(after.backend.Image===candidate,'Wrong running candidate');
  requireThat(canonical(envOf(after.backend))===canonical(expectedEnv),'Application configuration not preserved');
  requireThat(after.backend.HostConfig.ReadonlyRootfs && after.backend.Mounts.length===0,'Ordinary runtime must be read-only and not mount capture');
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
  result.captureEnabled=false; result.currentImage=candidate;
  result.status='deployed_no_ai_smoke_pass_awaiting_user_uat';
} catch(error) {
  result.status='deployment_failed';
  result.error=error.message;
  if(replacementAttempted) {
    try {
      requireThat(active()===0,'Active generation prevents fallback');
      // Operational restoration only; no legacy code path or data conversion, capture remains disabled.
      compose(previous,['up','-d','--no-deps','--no-build','--pull','never','--timeout','150','backend']);
      await healthy();
      docker(['exec','wordweave_uat-nginx-1','nginx','-s','reload']);
      result.rollback=inspect().backend.Image===previous?'previous_backend_restored_capture_disabled':'identity_mismatch';
    } catch(e) { result.rollbackError=e.message; }
  }
  process.exitCode=1;
} finally {
  result.finishedAt=new Date().toISOString();
  console.log(JSON.stringify(result,null,2));
}
