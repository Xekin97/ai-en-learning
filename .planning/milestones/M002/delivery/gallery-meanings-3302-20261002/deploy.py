"""Frontend-only local hotfix; no database, backend, or model configuration changes."""
from pathlib import Path
import json, os, shutil, signal, subprocess, time, urllib.request, hashlib
HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[4]
WORK=Path(Path('/tmp/wordweave-m002-integrated-current').read_text().strip())
STATE=json.loads((WORK/'processes.json').read_text())
ENV=json.loads((WORK/'env.json').read_text())
NODE='/Users/xekinzhuo/.npm/_npx/387698761821791d/node_modules/node/bin/node'
RELEASE=WORK/'frontend-gallery-meanings-20261002'
os.umask(0o077)
assert not RELEASE.exists(), 'Existing release must not be overwritten'
RELEASE.mkdir(mode=0o700)
shutil.copy2(WORK/'processes.json',RELEASE/'before-processes.json')
shutil.copytree(ROOT/'frontend/.output',RELEASE/'.output',symlinks=True)
for name in ['wordweave','wordweave-admin']:
    shutil.copy2(Path(STATE['build'])/name,RELEASE/name)
previous=next(p for p in STATE['processes'] if p['name']=='frontend')
def alive(item):
    return item['identity'] in subprocess.run(['ps','-p',str(item['pid']),'-o','command='],text=True,capture_output=True).stdout
def start(script):
    with (RELEASE/'frontend.log').open('a') as log:
        p=subprocess.Popen([NODE,script],cwd=ROOT,env={**ENV,'NITRO_HOST':'127.0.0.1','NITRO_PORT':'3332','NUXT_BACKEND_INTERNAL_ORIGIN':'http://127.0.0.1:38083'},stdin=subprocess.DEVNULL,stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
    return {'name':'frontend','pid':p.pid,'identity':script}
assert alive(previous)
os.kill(previous['pid'],signal.SIGTERM)
for _ in range(100):
    if not alive(previous):break
    time.sleep(.1)
else:raise RuntimeError('Frontend did not stop gracefully')
new=start(str(RELEASE/'.output/server/index.mjs'))
try:
    opener=urllib.request.build_opener(urllib.request.ProxyHandler({}))
    for _ in range(80):
        try:
            with opener.open('http://127.0.0.1:3332/explore',timeout=2) as response:
                if response.status==200:break
        except Exception:time.sleep(.2)
    else:raise RuntimeError('New frontend not ready')
except Exception:
    if alive(new):os.kill(new['pid'],signal.SIGTERM);time.sleep(.5)
    restored=start(previous['identity']);STATE['processes']=[restored if p['name']=='frontend' else p for p in STATE['processes']]
    (WORK/'processes.json').write_text(json.dumps(STATE,indent=2)+'\n')
    raise
STATE['build']=str(RELEASE)
STATE['processes']=[new if p['name']=='frontend' else p for p in STATE['processes']]
STATE['frontend_fix']='GALLERY-MEANINGS-F01 restore approved configuration word meanings'
(WORK/'processes.json').write_text(json.dumps(STATE,indent=2)+'\n')
report={'result':'PASS','url':'http://127.0.0.1:3302/explore','scope':'featured trial word meanings layout','previous_frontend':previous['identity'],'release':str(RELEASE),'backend_restarted':False,'database_changed':False,'paid_calls':0,'source':{name:hashlib.sha256((ROOT/name).read_bytes()).hexdigest() for name in ['frontend/app/pages/explore.vue','frontend/tests/e2e/m002-generic-models.spec.ts']},'artifacts':{str(p.relative_to(RELEASE)):hashlib.sha256(p.read_bytes()).hexdigest() for p in (RELEASE/'.output').rglob('*') if p.is_file()}}
(HERE/'deployment.json').write_text(json.dumps(report,indent=2)+'\n')
print('3302 frontend updated; original backend and data unchanged.')
