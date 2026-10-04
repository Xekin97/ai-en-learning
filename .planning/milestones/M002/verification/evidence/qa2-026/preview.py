"""Resume/stop the existing M002 real-provider UAT data; never seed or start mock."""
from pathlib import Path
import json, os, signal, socket, subprocess, sys, time, urllib.request

root = Path(__file__).resolve().parents[6]
evidence = Path(__file__).resolve().parent
work = Path(Path('/tmp/wordweave-m002-integrated-current').read_text())
pg = Path('/opt/homebrew/opt/postgresql@18/bin')
node = '/Users/xekinzhuo/.npm/_npx/387698761821791d/node_modules/node/bin/node'
mode = sys.argv[1] if len(sys.argv) > 1 else 'resume'
state = json.loads((work / 'processes.json').read_text())
if mode == 'stop':
    for item in reversed(state['processes']):
        command = subprocess.run(['ps', '-p', str(item['pid']), '-o', 'command='], capture_output=True, text=True).stdout
        if item['identity'] in command:
            try: os.kill(item['pid'], signal.SIGTERM)
            except ProcessLookupError: pass
    subprocess.run([str(pg / 'pg_ctl'), '-D', str(work / 'data'), '-m', 'fast', 'stop', '-w'], check=True)
    print('Stopped M002 preview; existing database and real-provider configuration retained.')
    raise SystemExit(0)
if mode != 'resume':
    raise SystemExit('Usage: preview.py [resume|stop]. Existing data only; no fresh initialization.')
env = json.loads((work / 'env.json').read_text())
if env['OPENROUTER_BASE_URL'] != 'https://openrouter.ai/api/v1':
    raise SystemExit('Expected real OpenRouter configuration; refusing mock fallback.')
for port in [3302, 3332, 38083, 39083, 63542]:
    with socket.socket() as sock:
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        sock.bind(('127.0.0.1', port))
build = Path(json.loads((evidence / 'inputs.json').read_text())['build_directory'])
with (work / 'setup.log').open('a') as log:
    subprocess.run([str(pg / 'pg_ctl'), '-D', str(work / 'data'), '-l', str(work / 'postgres.log'), '-o', f'-h 127.0.0.1 -p 63542 -k {work}', 'start', '-w'], check=True, stdout=log, stderr=subprocess.STDOUT)
state['processes'] = []
for name, args, extra in [
    ('backend', [str(work / 'wordweave')], {}),
    ('frontend', [node, str(build / '.output/server/index.mjs')], {'NITRO_HOST':'127.0.0.1','NITRO_PORT':'3332','NUXT_BACKEND_INTERNAL_ORIGIN':'http://127.0.0.1:38083'}),
    ('proxy', [node, str(evidence / 'services.mjs')], {}),
]:
    with (work / (name + '.log')).open('a') as log:
        process = subprocess.Popen(args, cwd=root, env={**env, **extra}, stdin=subprocess.DEVNULL, stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
    state['processes'].append({'name':name, 'pid':process.pid, 'identity':args[1] if args[0] == node else args[0]})
    (work / 'processes.json').write_text(json.dumps(state, indent=2) + '\n')
opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
for attempt in range(100):
    try:
        with opener.open('http://127.0.0.1:3302/api/v1/bootstrap', timeout=2) as response:
            if response.status == 200: break
    except Exception: time.sleep(.2)
else: raise SystemExit('Preview health check failed; inspect existing runtime logs.')
print('Real-provider preview resumed at http://127.0.0.1:3302; no inference invoked.')
