# Local service lifecycle reused from developer harness; QA assertions are independent.
from pathlib import Path
import os,json,socket,subprocess,time,urllib.request
r=Path(__file__).resolve().parents[6];e=Path(__file__).resolve().parent
assert (r/'frontend/package.json').is_file()
env=dict(os.environ);env['PATH']='/Users/xekinzhuo/.npm/_npx/387698761821791d/node_modules/node/bin:'+env['PATH']
build=Path(json.loads((e/'inputs.json').read_text())['build_directory'])
ports=[3300,3330,3332,38080]
for port in ports:
    with socket.socket() as sock:
        sock.setsockopt(socket.SOL_SOCKET,socket.SO_REUSEADDR,1);sock.bind(('127.0.0.1',port))
services=[];logs=[];result={'ports':ports,'provider_calls':0}
try:
    commands=[('mock',['node','frontend/tests/e2e/mock-backend.mjs'],env),('frontend',['node',str(build/'.output/server/index.mjs')],{**env,'NITRO_HOST':'127.0.0.1','NITRO_PORT':'3330','NUXT_BACKEND_INTERNAL_ORIGIN':'http://127.0.0.1:38080'}),('proxy',['node','frontend/tests/integration/m002-mock-proxy.mjs'],env),('prototype',['python3','-m','http.server','3332','--bind','127.0.0.1','--directory',str(r/'.planning/milestones/M002/design')],env)]
    for name,cmd,service_env in commands:
        log=(e/(name+'-server.log')).open('w');logs.append(log)
        services.append(subprocess.Popen(cmd,cwd=r,env=service_env,stdout=log,stderr=subprocess.STDOUT))
    for url in ['http://127.0.0.1:38080/api/v1/bootstrap','http://127.0.0.1:3300','http://127.0.0.1:3332/prototype/index.html']:
        for attempt in range(60):
            try:
                with urllib.request.urlopen(url,timeout=2) as response:
                    if response.status==200:break
            except Exception:time.sleep(.25)
        else:raise RuntimeError('Service not ready: '+url)
    with (e/'browser.log').open('w') as log:
        run=subprocess.run(['node',str(e/'entry-flows.mjs')],cwd=r,env=env,stdout=log,stderr=subprocess.STDOUT)
    result['exit_code']=run.returncode
finally:
    for process in reversed(services):
        process.terminate()
        try:process.wait(timeout=10)
        except subprocess.TimeoutExpired:process.kill();process.wait()
    for log in logs:log.close()
    result['services_stopped']=all(x.poll() is not None for x in services)
    result['listening_ports']=[]
    for port in ports:
        with socket.socket() as sock:
            if sock.connect_ex(('127.0.0.1',port))==0:result['listening_ports'].append(port)
    (e/'runtime.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result))
assert result.get('exit_code')==0 and not result['listening_ports']
