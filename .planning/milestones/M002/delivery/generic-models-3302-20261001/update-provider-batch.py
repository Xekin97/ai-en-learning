"""Install UI30 and stream validation on local 3302 without migrations or configuration writes."""
from pathlib import Path
import hashlib, json, os, shutil, signal, subprocess, time, urllib.parse, urllib.request

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[4]
WORK = Path(Path('/tmp/wordweave-m002-integrated-current').read_text().strip())
STATE = json.loads((WORK/'processes.json').read_text())
ENV = json.loads((WORK/'env.json').read_text())
NODE = '/Users/xekinzhuo/.npm/_npx/387698761821791d/node_modules/node/bin/node'
RELEASE = WORK/'provider-batch-ui30-20261001'
PG = Path('/opt/homebrew/opt/postgresql@18/bin')
URL = urllib.parse.urlparse(ENV['APP_DATABASE_URL'])
DBENV = {**os.environ, 'PGHOST':URL.hostname, 'PGPORT':str(URL.port), 'PGDATABASE':URL.path.lstrip('/'), 'PGUSER':URL.username, 'PGPASSWORD':URL.password or ''}
assert URL.hostname == '127.0.0.1' and URL.port == 63542
os.umask(0o077)

def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()

def sql(query):
    result = subprocess.run([str(PG/'psql'),'-XAt','-v','ON_ERROR_STOP=1','-c',query],env=DBENV,text=True,capture_output=True)
    if result.returncode: raise RuntimeError('Database check failed; inspect private runtime')
    return result.stdout.strip()

def configuration():
    # Only digest/count encrypted data; never write credentials or model data to public evidence.
    result = {}
    for table in ['ai_models','ai_providers','ai_provider_credentials','user_groups','group_models','group_generation_lengths','schema_migrations']:
        exists = sql(f"SELECT count(*) FROM pg_tables WHERE schemaname='wordweave' AND tablename='{table}'")
        if exists != '1': continue
        rows = sql(f'SELECT to_jsonb(t)::text FROM wordweave."{table}" t ORDER BY to_jsonb(t)::text')
        result[table] = {'rows':len(rows.splitlines()) if rows else 0,'sha256':hashlib.sha256(rows.encode()).hexdigest()}
    return result

def alive(item):
    return item['identity'] in subprocess.run(['ps','-p',str(item['pid']),'-o','command='],text=True,capture_output=True).stdout

def stop(item):
    if not alive(item): return
    os.kill(item['pid'],signal.SIGTERM)
    for _ in range(100):
        if not alive(item): return
        time.sleep(.1)
    raise RuntimeError(item['name']+' did not stop gracefully')

def start(name, identity):
    extra = {'NITRO_HOST':'127.0.0.1','NITRO_PORT':'3332','NUXT_BACKEND_INTERNAL_ORIGIN':'http://127.0.0.1:38083'} if name == 'frontend' else {}
    with (RELEASE/(name+'.log')).open('a') as log:
        proc = subprocess.Popen([NODE,identity] if name=='frontend' else [identity],cwd=ROOT,env={**ENV,**extra},stdin=subprocess.DEVNULL,stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
    return {'name':name,'pid':proc.pid,'identity':identity}

def healthy():
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    for _ in range(100):
        try:
            for path in ['/api/v1/bootstrap','/admin/models']:
                with opener.open('http://127.0.0.1:3302'+path,timeout=2) as response:
                    assert response.status == 200
            return
        except Exception: time.sleep(.2)
    raise RuntimeError('3302 health check failed')

assert not RELEASE.exists(), 'Existing release must not be overwritten'
assert all(alive(p) for p in STATE['processes'])
for table,column in [('generation_runs','call_status'),('preset_preview_runs','status')]:
    assert sql(f"SELECT count(*) FROM wordweave.{table} WHERE {column}='active'") == '0', 'Active generation; retry later'
RELEASE.mkdir(mode=0o700)
shutil.copy2(WORK/'processes.json', RELEASE/'before-processes.json')
shutil.copytree(ROOT/'frontend/.output', RELEASE/'.output', symlinks=True)
for source,target in [('/tmp/wordweave-ui30-backend','wordweave'),('/tmp/wordweave-ui30-admin','wordweave-admin')]:
    shutil.copy2(source,RELEASE/target)
before = configuration()
env_digest = digest(WORK/'env.json')
previous = [p for p in STATE['processes'] if p['name'] in ['backend','frontend']]
started = []
try:
    for item in previous: stop(item)
    started.append(start('backend',str(RELEASE/'wordweave')))
    started.append(start('frontend',str(RELEASE/'.output/server/index.mjs')))
    healthy()
    assert before == configuration(), 'Configuration unexpectedly changed'
    assert env_digest == digest(WORK/'env.json'), 'Runtime settings unexpectedly changed'
except Exception:
    for item in started: stop(item)
    restored = [p if alive(p) else start(p['name'],p['identity']) for p in previous]
    STATE['processes'] = [next((x for x in restored if x['name']==p['name']),p) for p in STATE['processes']]
    (WORK/'processes.json').write_text(json.dumps(STATE,indent=2)+'\n')
    healthy()
    raise
STATE.update(build=str(RELEASE),backend_binary=str(RELEASE/'wordweave'),frontend_fix='CR029-F03 provider-first multi-model form; CR029-F04 streaming validation')
STATE['processes'] = [next((x for x in started if x['name']==p['name']),p) for p in STATE['processes']]
(WORK/'processes.json').write_text(json.dumps(STATE,indent=2)+'\n')
source_paths = ['backend/internal/admin/model_batch.go','backend/internal/ai/gateway.go','backend/internal/ai/probe_stream_test.go','backend/internal/httpapi/admin_handlers.go','backend/internal/httpapi/server.go','frontend/app/pages/admin/models.vue','frontend/app/application/admin/model-draft.ts','frontend/app/infrastructure/http/repositories/api-repository.ts','frontend/app/runtime/stores/admin.ts','frontend/app/assets/css/theme.css','frontend/design/source-manifest.json']
report = {'result':'PASS','url':'http://127.0.0.1:3302/admin/models','release':str(RELEASE),'migrations':[],'configuration_unchanged':True,'configuration':before,'real_model_calls':0,'source':{p:digest(ROOT/p) for p in source_paths},'artifacts':{str(p.relative_to(RELEASE)):digest(p) for p in RELEASE.rglob('*') if p.is_file() and p.name not in ['frontend.log','backend.log','before-processes.json']}}
(HERE/'provider-batch-deployment.json').write_text(json.dumps(report,indent=2)+'\n')
print('3302 updated: provider-first batch form and stream validation; model configuration unchanged.')
