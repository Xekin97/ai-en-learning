"""Local 3302 delivery only. Existing data and provider configuration are authoritative."""
from pathlib import Path
import datetime, hashlib, json, os, shutil, signal, socket, subprocess, sys, tarfile, time, urllib.parse, urllib.request

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[4]
M = HERE.parents[1]
WORK = Path(Path('/tmp/wordweave-m002-integrated-current').read_text().strip())
ENV = json.loads((WORK / 'env.json').read_text())
PG = Path('/opt/homebrew/opt/postgresql@18/bin')
NODE = '/Users/xekinzhuo/.npm/_npx/387698761821791d/node_modules/node/bin/node'
PRIVATE = WORK / 'delivery-20261001'
RELEASE = PRIVATE / 'release'
URL = urllib.parse.urlparse(ENV['APP_DATABASE_URL'])
DBENV = {**os.environ, 'PGHOST': URL.hostname, 'PGPORT': str(URL.port), 'PGDATABASE': URL.path.lstrip('/'), 'PGUSER': URL.username, 'PGPASSWORD': URL.password or ''}
os.umask(0o077)

def write(name, value):
    (HERE / name).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')

def digest(p):
    h = hashlib.sha256()
    with Path(p).open('rb') as f:
        for block in iter(lambda: f.read(1024*1024), b''): h.update(block)
    return h.hexdigest()

def sql(query):
    result = subprocess.run([str(PG/'psql'), '-XAt', '-v', 'ON_ERROR_STOP=1', '-c', query], env=DBENV, text=True, capture_output=True)
    if result.returncode: raise RuntimeError('Database query failed; private log required')
    return result.stdout.strip()

def snapshot():
    tables = sql("SELECT tablename FROM pg_tables WHERE schemaname='wordweave' ORDER BY tablename").splitlines()
    result = {}
    for table in tables:
        if table == 'schema_migrations': continue
        expr = "to_jsonb(t)-'remind_once'" if table == 'platform_notices' else 'to_jsonb(t)'
        rows = sql(f'SELECT ({expr})::text FROM wordweave."{table}" t ORDER BY ({expr})::text')
        result[table] = {'rows': len(rows.splitlines()) if rows else 0, 'sha256': hashlib.sha256(rows.encode()).hexdigest()}
    return result

def process_alive(item):
    result = subprocess.run(['ps','-p',str(item['pid']),'-o','command='], capture_output=True,text=True)
    return item['identity'] in result.stdout

def stop(item):
    if not process_alive(item): return
    os.kill(item['pid'], signal.SIGTERM)
    for _ in range(100):
        if not process_alive(item): return
        time.sleep(.1)
    raise RuntimeError('Service did not stop gracefully: '+item['name'])

def start(name, args, extra):
    with (PRIVATE/(name+'.log')).open('a') as log:
        p = subprocess.Popen(args, cwd=ROOT, env={**ENV, **extra}, stdin=subprocess.DEVNULL, stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
    return {'name':name, 'pid':p.pid, 'identity':args[1] if args[0]==NODE else args[0]}

def healthy():
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    for _ in range(80):
        try:
            with opener.open('http://127.0.0.1:3302/api/v1/bootstrap', timeout=1) as r:
                if r.status == 200: return
        except Exception: time.sleep(.2)
    raise RuntimeError('3302 bootstrap health failed')

assert ENV['OPENROUTER_BASE_URL'] == 'https://openrouter.ai/api/v1'
assert URL.hostname == '127.0.0.1' and URL.port == 63542 and URL.path == '/wordweave_review_m002'
mode = sys.argv[1]
if mode == 'prepare':
    assert not PRIVATE.exists(), 'Refusing to overwrite previous delivery'
    PRIVATE.mkdir(mode=0o700)
    RELEASE.mkdir()
    maps = []
    base = M/'implementation/evidence'
    maps.append(json.loads((base/'backend-cr013/source.json').read_text())['files'])
    maps.append(json.loads((base/'backend-cr027/manifest.json').read_text())['files'])
    maps.append(json.loads((base/'notice-once/backend-source-final.json').read_text()))
    backend = {}
    for mapping in maps: backend.update(mapping)
    frontend = json.loads((base/'notice-once/source.json').read_text())
    bad = [p for p,h in {**backend,**frontend}.items() if not (ROOT/p).exists() or digest(ROOT/p)!=h]
    write('source-check.json', {'backend_files':len(backend), 'frontend_files':len(frontend), 'mismatches':bad})
    assert not bad, 'Accepted source differs'
    for name in ['env.json','processes.json','build.json','wordweave','wordweave-admin']:
        if (WORK/name).exists(): shutil.copy2(WORK/name, PRIVATE/('before-'+name))
    state = json.loads((WORK/'processes.json').read_text())
    assert all(process_alive(p) for p in state['processes'])
    old_front = Path(state['build'])/'.output'
    with tarfile.open(PRIVATE/'before-frontend.tar.gz','w:gz') as tar: tar.add(old_front,arcname='.output')
    shutil.copytree(ROOT/'frontend/.output', RELEASE/'.output',symlinks=True)
    artifacts = {str(p.relative_to(RELEASE)):digest(p) for p in RELEASE.rglob('*') if p.is_file()}
    write('frontend-artifacts.json',artifacts)
    with (HERE/'build.log').open('w') as log:
        for cmd in ['wordweave','wordweave-admin']:
            subprocess.run(['/opt/homebrew/bin/go','build','-o',str(RELEASE/cmd),'./cmd/'+cmd],cwd=ROOT/'backend',env={**os.environ,'GOTOOLCHAIN':'auto'},stdout=log,stderr=subprocess.STDOUT,check=True)
    migrations = sql('SELECT version FROM wordweave.schema_migrations ORDER BY version').splitlines()
    pending = sorted(p.name for p in (ROOT/'backend/db/migrations').glob('*.sql') if p.name not in migrations)
    assert pending == ['0014_notice_remind_once.sql'], pending
    write('inputs.json', {'scope':'Update accepted M002 to existing local real-provider UAT on 3302; milestone remains complete', 'authorization':'User 下一步 after proposed 3302 update', 'accepted_source':'CR026-UI28-DB04-BE05-FE05-fixed-input', 'private_backup_directory':str(PRIVATE), 'release':str(RELEASE), 'pending_migrations':pending, 'real_model_calls':0, 'reuse':'QA29/30/31 and user acceptance QA32; no developer suite rerun', 'checks':['database preservation','bootstrap and login','real vocabulary search','admin/public notice field','latest header and admin control'], 'built_binaries':{x:digest(RELEASE/x) for x in ['wordweave','wordweave-admin']}})
    print('Prepared accepted frontend and backend; backup directory private; services unchanged.')
elif mode == 'apply':
    assert (HERE/'inputs.json').exists() and not (HERE/'deployment.json').exists()
    state = json.loads((WORK/'processes.json').read_text())
    assert all(process_alive(p) for p in state['processes'])
    # No interruption of active learner generation/administrator preview.
    for table, column in [('generation_runs','call_status'),('preset_preview_runs','status')]:
        assert sql(f"SELECT count(*) FROM wordweave.{table} WHERE {column}='active'") == '0', 'Active generation; retry later'
    backend = next(p for p in state['processes'] if p['name']=='backend')
    frontend = next(p for p in state['processes'] if p['name']=='frontend')
    stop(backend)
    before = snapshot()
    write('database-before.json',before)
    with (PRIVATE/'backup.log').open('w') as log:
        subprocess.run([str(PG/'pg_dump'),'-Fc','-f',str(PRIVATE/'before.dump')],env=DBENV,stdout=log,stderr=subprocess.STDOUT,check=True)
        subprocess.run([str(PG/'pg_dumpall'),'--globals-only','-f',str(PRIVATE/'globals.sql')],env=DBENV,stdout=log,stderr=subprocess.STDOUT,check=True)
        subprocess.run([str(PG/'pg_restore'),'--list',str(PRIVATE/'before.dump')],stdout=log,stderr=subprocess.STDOUT,check=True)
    write('backup.json',{'files':{x:digest(PRIVATE/x) for x in ['before.dump','globals.sql','before-env.json','before-processes.json','before-wordweave','before-wordweave-admin','before-frontend.tar.gz']},'archive_catalog_readable':True,'full_restore_test':False,'directory_mode':oct(PRIVATE.stat().st_mode & 0o777)})
    with (PRIVATE/'migrate.log').open('w') as log:
        subprocess.run([str(RELEASE/'wordweave-admin'),'migrate'],env=ENV,cwd=ROOT,stdout=log,stderr=subprocess.STDOUT,check=True)
    after = snapshot()
    write('database-after-migration.json',after)
    assert before==after, 'Unexpected application row changes during migration'
    assert sql('SELECT count(*) FROM wordweave.platform_notices WHERE remind_once')=='0'
    assert digest(WORK/'env.json')==digest(PRIVATE/'before-env.json')
    stop(frontend)
    new_backend = start('backend',[str(RELEASE/'wordweave')],{})
    new_frontend = start('frontend',[NODE,str(RELEASE/'.output/server/index.mjs')],{'NITRO_HOST':'127.0.0.1','NITRO_PORT':'3332','NUXT_BACKEND_INTERNAL_ORIGIN':'http://127.0.0.1:38083'})
    state.update({'build':str(RELEASE),'delivery':str(HERE),'backend_binary':str(RELEASE/'wordweave')})
    state['processes']=[new_backend,new_frontend,next(p for p in state['processes'] if p['name']=='proxy')]
    (WORK/'processes.json').write_text(json.dumps(state,indent=2)+'\n')
    healthy()
    write('deployment.json',{'result':'PASS','url':'http://127.0.0.1:3302','schema_version':sql('SELECT max(version) FROM wordweave.schema_migrations'),'preserved_tables':len(before),'all_existing_rows_unchanged':True,'original_configuration_unchanged':True,'runtime':state,'real_model_calls':0})
    print('3302 updated; migration 0014 complete; all existing application rows preserved.')
else:
    raise SystemExit('Usage: deploy.py prepare|apply')
