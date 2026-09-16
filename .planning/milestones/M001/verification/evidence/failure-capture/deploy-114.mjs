// One-shot local diagnostic deployment; no model calls, migration or database writes.
// Runtime secrets remain in memory and are never printed or persisted.
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { docker, sql, inspect, envOf, safe, hash, root } from '../uat-108/helpers.mjs';

const candidate = 'sha256:b1e8de6a90cac3fe4806359a0a7616445777186970868d39fe4663dee766f249';
const previous = 'sha256:7c1d2b0eb19ba4328292fabad8698f7738f4a62fe277e2f6079e4d133c0f1963';
const helperImage = 'sha256:587c6fae871c9d14eb79352bd3df80670ffb2c297997085aefc39797f3e8af37';
const volume = 'wordweave-uat-failure-capture-114';
const helper = 'wordweave-uat-failure-capture-init-114';
const result = { gate: 'TRANSITION-M001-114', startedAt: new Date().toISOString(), realModelCalls: 0, databaseWrites: 0, userAccepted: false, releaseApproved: false };
const requireThat = (ok, message) => { if (!ok) throw Error(message); };
const canonical = obj => JSON.stringify(Object.fromEntries(Object.entries(obj).sort(([a], [b]) => a.localeCompare(b))));
const configTables = ['ai_models', 'openrouter_credentials', 'entitlement_groups', 'group_models', 'group_lengths'];
function configDigests() {
  return Object.fromEntries(configTables.map(table => [table, sql("SELECT md5(coalesce(string_agg(md5(row_to_json(x)::text),'' ORDER BY md5(row_to_json(x)::text)),'')) FROM (SELECT * FROM wordweave." + table + ') x;')]));
}
const active = () => Number(sql("SELECT count(*) FROM wordweave.generation_runs WHERE call_status='active';"));
let volumeCreated = false, helperCreated = false, replacementAttempted = false, before, deployEnv;
const composeBase = ['compose', '--env-file', '/dev/null', '--project-name', 'wordweave_uat', '-f', join(root, 'compose.yaml'), '-f', '-'];
function compose(diagnostic, args) {
  const override = { services: { backend: { image: diagnostic ? candidate : previous } } };
  if (diagnostic) {
    override.services.backend.environment = { UAT_FAILURE_CAPTURE_DIR: '/uat-capture' };
    override.services.backend.volumes = [{ type: 'volume', source: 'failure-capture-114', target: '/uat-capture', volume: { nocopy: true } }];
    override.volumes = { 'failure-capture-114': { external: true, name: volume } };
  }
  return docker([...composeBase, ...args], { input: JSON.stringify(override), env: deployEnv });
}
async function healthy() {
  for (let i = 0; i < 50; i++) {
    const backend = inspect().backend;
    if (backend.State.Running && backend.State.Health?.Status === 'healthy') return;
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  throw Error('Backend readiness did not pass within 50 seconds');
}

try {
  const auth = readFileSync(join(root, '.planning/workflow/state.yaml'), 'utf8').split('\nfailure_capture_revision_authorization:\n')[1]?.split('\nfailure_capture_authorization:')[0] || '';
  requireThat(auth.includes('decision: USER-FAILURE-CAPTURE-SUBJECT-113') && auth.includes('status: qa_pass_deployment_authorized') && auth.includes('local_backend_replacement_authorized: true') && auth.includes('real_model_calls_authorized: false'), 'Missing one-shot deployment authority');
  const ticketPath = process.argv[2];
  requireThat(ticketPath && statSync(ticketPath).isFile() && (statSync(ticketPath).mode & 0o777) === 0o600, 'Private ticket must be an existing 0600 file');
  const ticket = JSON.parse(readFileSync(ticketPath, 'utf8'));
  const remaining = Date.parse(ticket.expires_at) - Date.now();
  requireThat(remaining > 5 * 60_000 && remaining <= 60 * 60_000, 'Ticket must leave 5–60 minutes');
  const subject = sql("SELECT CASE WHEN account_id IS NOT NULL THEN 'account:' || account_id::text ELSE 'visitor:' || visitor_id::text END FROM wordweave.generation_runs WHERE id='01a08545-17ee-76ba-a812-9e7086dabb82';");
  requireThat(/^(account|visitor):[0-9a-f-]{36}$/.test(subject), 'Testing identity could not be resolved from approved run');
  requireThat(ticket.model_id === '01a07fe3-f046-7017-97f8-c15539050441' && ticket.subject_hash === hash('wordweave-uat-capture:' + subject) && Object.keys(ticket).sort().join(',') === 'expires_at,model_id,subject_hash', 'Ticket does not match approved testing identity and model');
  result.subjectSourceRun = '01a08545-17ee-76ba-a812-9e7086dabb82';
  result.testingIdentityKind = subject.split(':')[0];
  result.subjectBindingVerified = true;
  result.expiresAt = ticket.expires_at;
  const developer = JSON.parse(readFileSync(join(root, '.planning/milestones/M001/implementation/evidence/failure-capture/developer-113.json'), 'utf8'));
  for (const source of developer.sources) requireThat(hash(readFileSync(join(root, source.path))) === source.sha256, 'Reviewed source hash changed: ' + source.path);
  result.verifiedSourceHashes = developer.sources.length;
  const image = JSON.parse(docker(['image', 'inspect', candidate]))[0];
  requireThat(image.Id === candidate && image.Config.User === 'nonroot:nonroot', 'Diagnostic image identity/user mismatch');
  before = inspect();
  result.before = Object.fromEntries(Object.entries(before).map(([key, c]) => [key, safe(c)]));
  requireThat(before.backend.Image === previous && before.backend.Mounts.length === 1 && before.backend.Mounts[0].Name === 'wordweave-uat-failure-capture-112', 'Unexpected backend baseline');
  for (const c of Object.values(before)) requireThat(c.State.Running && c.State.Health?.Status === 'healthy', 'Existing UAT service not healthy');
  requireThat(active() === 0, 'An active generation exists; no runtime mutation performed');
  result.activeBefore = 0;
  result.configBefore = configDigests();
  const backendEnv = envOf(before.backend);
  requireThat(backendEnv.PUBLIC_ORIGIN === 'http://localhost:6001' && backendEnv.UAT_FAILURE_CAPTURE_DIR === '/uat-capture', 'Unexpected runtime origin/capture setting');
  const appEnv = Object.fromEntries(Object.entries(backendEnv).filter(([key]) => !['PATH', 'SSL_CERT_FILE', 'UAT_FAILURE_CAPTURE_DIR'].includes(key)));
  deployEnv = { ...process.env, ...appEnv, BACKEND_INTERNAL_ORIGIN: envOf(before.frontend).NUXT_BACKEND_INTERNAL_ORIGIN, WORDWEAVE_PORT: '6001', COMPOSE_PROJECT_NAME: 'wordweave_uat', COMPOSE_DISABLE_ENV_FILE: '1' };
  const config = JSON.parse(compose(true, ['config', '--format', 'json']));
  const expected = { ...appEnv, UAT_FAILURE_CAPTURE_DIR: '/uat-capture' };
  requireThat(canonical(config.services.backend.environment) === canonical(expected), 'Compose would change an existing backend configuration value');
  requireThat(config.services.backend.read_only === true && canonical(config.services.backend.healthcheck.test) === canonical(before.backend.Config.Healthcheck.Test), 'Compose changes readiness/read-only settings');
  requireThat(!docker(['volume', 'ls', '--format', '{{.Name}}']).split('\n').includes(volume), 'Capture volume already exists; refusing reuse');
  requireThat(!docker(['ps', '-a', '--format', '{{.Names}}']).split('\n').includes(helper), 'Capture helper already exists; refusing reuse');

  docker(['volume', 'create', '--driver', 'local', '--opt', 'type=tmpfs', '--opt', 'device=tmpfs', '--opt', 'o=size=2m,uid=65532,gid=65532,mode=0700', '--label', 'wordweave.task=uat-failure-capture-114', volume]);
  volumeCreated = true;
  docker(['run', '-d', '--pull', 'never', '--name', helper, '--network', 'none', '--mount', 'type=volume,src=' + volume + ',dst=/capture,volume-nocopy', '--entrypoint', '/bin/sleep', helperImage, '3600']);
  helperCreated = true;
  docker(['cp', ticketPath, helper + ':/capture/ticket.json']);
  docker(['exec', helper, 'chown', '65532:65532', '/capture/ticket.json']);
  docker(['exec', helper, 'chmod', '0600', '/capture/ticket.json']);
  result.privatePermissions = docker(['exec', helper, 'stat', '-c', '%a %u %g', '/capture', '/capture/ticket.json']).split('\n');
  requireThat(JSON.stringify(result.privatePermissions) === JSON.stringify(['700 65532 65532', '600 65532 65532']), 'Capture permission mismatch');
  result.filesystem = docker(['exec', helper, 'stat', '-f', '-c', '%T', '/capture']);
  requireThat(result.filesystem === 'tmpfs', 'Capture is not backed by tmpfs');
  requireThat(active() === 0, 'New active generation appeared before backend replacement');
  result.previousCaptureEntries = docker(['run','--rm','--pull','never','--network','none','--read-only','--user','65532:65532','--mount','type=volume,src=wordweave-uat-failure-capture-112,dst=/previous,readonly,volume-nocopy','--entrypoint','/bin/ls',helperImage,'-1A','/previous']).split('\n');
  requireThat(!result.previousCaptureEntries.includes('failure.json'), 'Earlier diagnostic captured a sample; inspect it before replacement');
  console.log(JSON.stringify({ progress: 'preflight_pass_replacing_backend_only', expiresAt: ticket.expires_at }));
  replacementAttempted = true;
  compose(true, ['up', '-d', '--no-deps', '--no-build', '--pull', 'never', '--timeout', '30', 'backend']);
  await healthy();
  const after = inspect();
  requireThat(after.backend.Image === candidate, 'Running backend is not the diagnostic candidate');
  requireThat(canonical(envOf(after.backend)) === canonical({ ...backendEnv, UAT_FAILURE_CAPTURE_DIR: '/uat-capture' }), 'Runtime configuration preservation failed');
  for (const key of ['frontend', 'nginx', 'postgres']) requireThat(canonical(safe(after[key])) === canonical(safe(before[key])), 'Unrelated UAT service changed: ' + key);
  requireThat(after.backend.HostConfig.ReadonlyRootfs && after.backend.Mounts.some(m => m.Name === volume && m.Destination === '/uat-capture'), 'Runtime capture mount/read-only boundary missing');
  result.configAfter = configDigests();
  requireThat(canonical(result.configAfter) === canonical(result.configBefore), 'Model/credential/group configuration changed during deployment');
  docker(['exec', 'wordweave_uat-nginx-1', 'nginx', '-s', 'reload']);
  result.routes = [];
  for (const path of ['/health/live', '/health/ready', '/']) {
    const response = await fetch('http://localhost:6001' + path, { signal: AbortSignal.timeout(5000) });
    await response.arrayBuffer();
    result.routes.push({ path, status: response.status });
    requireThat(response.status === 200, 'Local route failed: ' + path);
  }
  result.initialCaptureDirectoryEntries = docker(['exec', helper, 'ls', '-1A', '/capture']).split('\n');
  result.after = Object.fromEntries(Object.entries(inspect()).map(([key, c]) => [key, safe(c)]));
  result.configPreserved = true;
  result.status = 'diagnostic_enabled_awaiting_user_reproduction';
  result.captureVolume = volume;
  result.currentImage = candidate;
} catch (error) {
  result.status = 'deployment_failed';
  result.error = error.message;
  if (replacementAttempted) {
    try {
      requireThat(active() === 0, 'Active generation prevents automatic rollback');
      compose(false, ['up', '-d', '--no-deps', '--no-build', '--pull', 'never', '--timeout', '30', 'backend']);
      await healthy();
      docker(['exec', 'wordweave_uat-nginx-1', 'nginx', '-s', 'reload']);
      result.rollback = inspect().backend.Image === previous ? 'previous_backend_restored_with_capture_disabled' : 'rollback_identity_mismatch';
    } catch (rollbackError) { result.rollbackError = rollbackError.message; }
  }
  process.exitCode = 1;
} finally {
  if (helperCreated) {
    try { docker(['stop', '--time', '1', helper]); docker(['rm', helper]); result.helperRemoved = true; }
    catch (error) { result.helperCleanupError = error.message; process.exitCode = 1; }
  }
  if (volumeCreated && result.status !== 'diagnostic_enabled_awaiting_user_reproduction') {
    try { docker(['volume', 'rm', volume]); result.failedAttemptVolumeRemoved = true; }
    catch (error) { result.volumeCleanupError = error.message; }
  }
  result.finishedAt = new Date().toISOString();
  console.log(JSON.stringify(result, null, 2));
}
