"""Resume/stop the current local 3302 release using existing private state; never reseed."""
from pathlib import Path
import json, os, signal, socket, subprocess, sys, time, urllib.request

here=Path(__file__).resolve().parent
root=here.parents[4]
work=Path(Path('/tmp/wordweave-m002-integrated-current').read_text().strip())
state=json.loads((work/'processes.json').read_text())
env=json.loads((work/'env.json').read_text())
pg=Path('/opt/homebrew/opt/postgresql@18/bin')
node='/Users/xekinzhuo/.npm/_npx/387698761821791d/node_modules/node/bin/node'
mode=sys.argv[1] if len(sys.argv)>1 else 'status'
assert env['OPENROUTER_BASE_URL']=='https://openrouter.ai/api/v1'

def alive(item):
    result=subprocess.run(['ps','-p',str(item['pid']),'-o','command='],text=True,capture_output=True)
    return item['identity'] in result.stdout

if mode=='status':
    print(json.dumps({'url':state['url'],'processes':{p['name']:alive(p) for p in state['processes']},'release':state['build']}))
elif mode=='stop':
    for item in reversed(state['processes']):
        if alive(item): os.kill(item['pid'],signal.SIGTERM)
    subprocess.run([str(pg/'pg_ctl'),'-D',str(work/'data'),'-m','fast','stop','-w'],check=True,stdout=subprocess.DEVNULL)
    print('Stopped local 3302; database and configuration retained.')
elif mode=='resume':
    if any(alive(p) for p in state['processes']):
        raise SystemExit('Existing service processes remain; use status and stop before resume.')
    for port in [3302,3332,38083,39083]:
        with socket.socket() as sock: sock.bind(('127.0.0.1',port))
    running=subprocess.run([str(pg/'pg_ctl'),'-D',str(work/'data'),'status'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode==0
    if not running:
        subprocess.run([str(pg/'pg_ctl'),'-D',str(work/'data'),'-l',str(work/'postgres.log'),'-o',f'-h 127.0.0.1 -p 63542 -k {work}','start','-w'],check=True,stdout=subprocess.DEVNULL)
    proxy=next(p['identity'] for p in state['processes'] if p['name']=='proxy')
    specs=[('backend',[state['backend_binary']],{}),('frontend',[node,str(Path(state['build'])/'.output/server/index.mjs')],{'NITRO_HOST':'127.0.0.1','NITRO_PORT':'3332','NUXT_BACKEND_INTERNAL_ORIGIN':'http://127.0.0.1:38083'}),('proxy',[node,proxy],{})]
    state['processes']=[]
    for name,args,extra in specs:
        with (work/(name+'.log')).open('a') as log:
            p=subprocess.Popen(args,cwd=root,env={**env,**extra},stdin=subprocess.DEVNULL,stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
        state['processes'].append({'name':name,'pid':p.pid,'identity':args[1] if args[0]==node else args[0]})
        (work/'processes.json').write_text(json.dumps(state,indent=2)+'\n')
    opener=urllib.request.build_opener(urllib.request.ProxyHandler({}))
    for _ in range(80):
        try:
            with opener.open('http://127.0.0.1:3302/api/v1/bootstrap',timeout=1) as response:
                if response.status==200: break
        except Exception: time.sleep(.2)
    else: raise SystemExit('Health check failed; inspect private runtime logs.')
    print('Current local release resumed on 3302; no inference invoked.')
else:
    raise SystemExit('Usage: preview.py status|resume|stop')
