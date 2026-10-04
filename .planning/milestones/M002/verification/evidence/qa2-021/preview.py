"""Local production-build UI review with disposable contract test data; never a live AI endpoint."""
from pathlib import Path
import json,os,signal,socket,subprocess,tempfile,time,urllib.request,sys
r=Path(__file__).resolve().parents[6];e=Path(__file__).resolve().parent
pointer=Path('/tmp/wordweave-m002-review-current')
if len(sys.argv)>1 and sys.argv[1]=='stop':
    work=Path(pointer.read_text());state=json.loads((work/'processes.json').read_text())
    for item in reversed(state['processes']):
        actual=subprocess.run(['ps','-p',str(item['pid']),'-o','command='],capture_output=True,text=True).stdout.strip()
        if item['identity'] in actual:
            try:os.kill(item['pid'],signal.SIGTERM)
            except ProcessLookupError:pass
    print('Stopped this review preview. Logs retained at '+str(work));sys.exit(0)
ports=[3300,3330,38080]
for port in ports:
    with socket.socket() as sock:
        sock.setsockopt(socket.SOL_SOCKET,socket.SO_REUSEADDR,1);sock.bind(('127.0.0.1',port))
build=Path(json.loads((e/'inputs.json').read_text())['build_directory']);work=Path(tempfile.mkdtemp(prefix='wordweave-m002-review-'))
env=dict(os.environ);env['PATH']='/Users/xekinzhuo/.npm/_npx/387698761821791d/node_modules/node/bin:'+env['PATH']
services=[('mock',['node','frontend/tests/e2e/mock-backend.mjs'],env),('frontend',['node',str(build/'.output/server/index.mjs')],{**env,'NITRO_HOST':'127.0.0.1','NITRO_PORT':'3330','NUXT_BACKEND_INTERNAL_ORIGIN':'http://127.0.0.1:38080'}),('proxy',['node','frontend/tests/integration/m002-mock-proxy.mjs'],env)]
processes=[]
try:
    for name,cmd,service_env in services:
        with (work/(name+'.log')).open('w') as log:p=subprocess.Popen(cmd,cwd=r,env=service_env,stdin=subprocess.DEVNULL,stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
        processes.append({'name':name,'pid':p.pid,'identity':cmd[1]})
    for url in ['http://127.0.0.1:38080/api/v1/bootstrap','http://127.0.0.1:3300','http://127.0.0.1:3300/explore']:
        for _ in range(60):
            try:
                with urllib.request.urlopen(url,timeout=2) as response:
                    if response.status==200:break
            except Exception:time.sleep(.25)
        else:raise RuntimeError('Review service did not become ready: '+url)
except Exception:
    for item in reversed(processes):
        try:os.kill(item['pid'],signal.SIGTERM)
        except ProcessLookupError:pass
    raise
state={'url':'http://127.0.0.1:3300','mode':'production frontend + disposable contract mock; UI walkthrough only, not real backend UAT or AI quality','build_directory':str(build),'logs':str(work),'processes':processes,'provider_calls':0}
(work/'processes.json').write_text(json.dumps(state,indent=2)+'\n');pointer.write_text(str(work));print(json.dumps(state,indent=2))
