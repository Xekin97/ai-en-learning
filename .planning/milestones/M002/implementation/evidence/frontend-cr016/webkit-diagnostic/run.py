from pathlib import Path
import json, os, signal, subprocess, socket, time, urllib.request

root = Path.cwd()
out = Path(__file__).resolve().parent
source = Path(json.loads((out / 'input.json').read_text())['source_run'])
work = Path((source / 'stack-location.txt').read_text())
env = json.loads((work / 'env.json').read_text())
assert env['APP_DATABASE_URL'] == 'postgres://fe_test@127.0.0.1:63541/wordweave_fe_m002?sslmode=disable'
assert env['OPENROUTER_BASE_URL'] == 'http://127.0.0.1:38082'
node = '/Users/xekinzhuo/.npm/_npx/387698761821791d/node_modules/node/bin/node'
pg = '/opt/homebrew/opt/postgresql@18/bin/pg_ctl'
for port in [63541, 38081, 39081, 38082, 3331, 3301]:
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', port))
build = Path(json.loads((root / '.planning/milestones/M002/implementation/evidence/frontend-cr016/build-location.json').read_text())['isolated'])
processes = []
db_started = False
result = {'localProviderCalls': 0, 'realProviderCalls': 0}
code = 1


def wait(url):
    for _ in range(100):
        try:
            with urllib.request.urlopen(url, timeout=1) as response:
                if response.status == 200:
                    return
        except OSError:
            pass
        time.sleep(0.2)
    raise RuntimeError('Local service not ready')


try:
    with (out / 'stack.log').open('w') as log:
        subprocess.run([pg, '-D', str(work / 'data'), '-l', str(work / 'control-postgres.log'),
                        '-o', f'-h 127.0.0.1 -p 63541 -k {work}', 'start', '-w'],
                       check=True, stdout=log, stderr=subprocess.STDOUT)
        db_started = True
    with (out / 'backend.log').open('w') as log:
        processes.append(subprocess.Popen([str(work / 'wordweave')], cwd=root, env=env,
                                          stdout=log, stderr=subprocess.STDOUT, start_new_session=True))
    wait('http://127.0.0.1:38081/health/ready')
    with (out / 'frontend.log').open('w') as log:
        processes.append(subprocess.Popen([node, str(build / '.output/server/index.mjs')], cwd=root,
                                          env=dict(os.environ, PORT='3331', HOST='127.0.0.1', NUXT_BACKEND_INTERNAL_ORIGIN='http://127.0.0.1:38081'),
                                          stdout=log, stderr=subprocess.STDOUT, start_new_session=True))
    wait('http://127.0.0.1:3331/')
    with (out / 'tests.log').open('w') as log:
        run = subprocess.run([node, str(out / 'diagnostic.mjs')], cwd=root,
                             env=dict(os.environ, QA_TITLE_STACK_FILE=str(source / 'stack-location.txt')),
                             stdout=log, stderr=subprocess.STDOUT, timeout=240)
    code = run.returncode
    print((out / 'tests.log').read_text())
    result['test_exit_code'] = code
    result['localProviderCalls'] = json.loads((out / 'results.json').read_text())['localProviderCalls']
finally:
    for process in reversed(processes):
        if process.poll() is None:
            os.killpg(process.pid, signal.SIGTERM)
            process.wait(timeout=10)
    result['processes_stopped'] = all(p.poll() is not None for p in processes)
    if db_started:
        with (out / 'stop.log').open('w') as log:
            stop = subprocess.run([pg, '-D', str(work / 'data'), '-m', 'fast', 'stop', '-w'],
                                  stdout=log, stderr=subprocess.STDOUT, timeout=30)
        result['database_stopped'] = stop.returncode == 0
    (out / 'execution.json').write_text(json.dumps(result, indent=2) + '\n')
raise SystemExit(code)
