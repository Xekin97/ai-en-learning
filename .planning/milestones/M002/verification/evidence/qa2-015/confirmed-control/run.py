from pathlib import Path
import json, os, signal, subprocess, socket, time, urllib.request, tempfile, hashlib

root = Path.cwd()
out = Path(__file__).resolve().parent
source = Path(json.loads((out / 'input.json').read_text())['source_run'])
base = Path((source / 'stack-location.txt').read_text().strip())
original_env = json.loads((base / 'env.json').read_text())
assert original_env['APP_DATABASE_URL'] == 'postgres://fe_test@127.0.0.1:63541/wordweave_fe_m002?sslmode=disable'
assert original_env['OPENROUTER_BASE_URL'] == 'http://127.0.0.1:38082'
work = Path(tempfile.mkdtemp(prefix='wordweave-qa15-'))
database = 'wordweave_qa15_confirmed_control'
uri = 'postgres://fe_test@127.0.0.1:63541/' + database + '?sslmode=disable'
env = dict(original_env, APP_DATABASE_URL=uri, AI_DATABASE_URL=uri)
(work / 'env.json').write_text(json.dumps(env))
os.chmod(work / 'env.json', 0o600)
(out / 'stack-location.txt').write_text(str(work))
node = '/Users/xekinzhuo/.npm/_npx/387698761821791d/node_modules/node/bin/node'
pg = Path('/opt/homebrew/opt/postgresql@18/bin')
build = Path(json.loads((out.parent / 'inputs.json').read_text())['build_directory'])
for port in [63541, 38081, 39081, 3331, 3301, 3391]:
    with socket.socket() as sock:
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        sock.bind(('127.0.0.1', port))

processes = []
cluster_started = database_created = False
result = {'localProviderCalls': 0, 'realProviderCalls': 0, 'database': database,
          'database_source': 'clone of disposable wordweave_fe_m002',
          'original_database_mutated_by_tests': False}
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
    # Reuse QA14 backend binary whose source and executable hashes match.
    import shutil
    runtime_source = Path('/var/folders/z9/99ckxr957v901zwwc8jdk8640000gn/T/wordweave-qa14-te13v6v3/wordweave')
    assert hashlib.sha256(runtime_source.read_bytes()).hexdigest() == '6c1df37e17583d2dc22a1f7597a11ce51c6659b293587bde25766ab40c1eb8e0'
    shutil.copy2(runtime_source, work / 'wordweave')
    result['backend_runtime_sha256'] = '6c1df37e17583d2dc22a1f7597a11ce51c6659b293587bde25766ab40c1eb8e0'
    result['backend_runtime_rebuilt'] = False
    with (out / 'stack.log').open('w') as log:
        subprocess.run([str(pg / 'pg_ctl'), '-D', str(base / 'data'), '-l', str(work / 'postgres.log'),
                        '-o', f'-h 127.0.0.1 -p 63541 -k {base}', 'start', '-w'],
                       check=True, stdout=log, stderr=subprocess.STDOUT)
        cluster_started = True
        subprocess.run([str(pg / 'createdb'), '-h', '127.0.0.1', '-p', '63541', '-U', 'fe_test',
                        '-T', 'wordweave_fe_m002', database], check=True, stdout=log, stderr=subprocess.STDOUT)
        database_created = True
    with (out / 'backend.log').open('w') as log:
        processes.append(subprocess.Popen([str(work / 'wordweave')], cwd=root, env=env,
                                          stdout=log, stderr=subprocess.STDOUT, start_new_session=True))
    wait('http://127.0.0.1:38081/health/ready')
    with (out / 'frontend.log').open('w') as log:
        processes.append(subprocess.Popen([node, str(build / '.output/server/index.mjs')], cwd=root,
                                          env=dict(os.environ, PORT='3331', HOST='127.0.0.1', NUXT_BACKEND_INTERNAL_ORIGIN='http://127.0.0.1:38081'),
                                          stdout=log, stderr=subprocess.STDOUT, start_new_session=True))
    wait('http://127.0.0.1:3331/')
    with (out / 'prototype.log').open('w') as log:
        processes.append(subprocess.Popen(['python3', '-m', 'http.server', '3391', '--bind', '127.0.0.1', '--directory', str(root / '.planning/milestones/M002/design')], stdout=log, stderr=subprocess.STDOUT, start_new_session=True))
    wait('http://127.0.0.1:3391/prototype/index.html')
    code = 0
    for script, output, result_file in [('title-ui.mjs', 'tests.log', 'results.json')]:
        with (out / output).open('w') as log:
            run = subprocess.run([node, str(out / script)], cwd=root,
                                 env=dict(os.environ, QA_TITLE_STACK_FILE=str(out / 'stack-location.txt')),
                                 stdout=log, stderr=subprocess.STDOUT, timeout=240)
        code = code or run.returncode
        result[script] = run.returncode
        result['localProviderCalls'] += json.loads((out / result_file).read_text())['localProviderCalls']
        print((out / output).read_text(), flush=True)
finally:
    for process in reversed(processes):
        if process.poll() is None:
            os.killpg(process.pid, signal.SIGTERM)
            process.wait(timeout=10)
    result['processes_stopped'] = all(p.poll() is not None for p in processes)
    if database_created:
        with (out / 'drop-database.log').open('w') as log:
            drop = subprocess.run([str(pg / 'dropdb'), '-h', '127.0.0.1', '-p', '63541', '-U', 'fe_test', database],
                                  stdout=log, stderr=subprocess.STDOUT, timeout=30)
        result['isolated_database_removed'] = drop.returncode == 0
    if cluster_started:
        with (out / 'stop.log').open('w') as log:
            stop = subprocess.run([str(pg / 'pg_ctl'), '-D', str(base / 'data'), '-m', 'fast', 'stop', '-w'],
                                  stdout=log, stderr=subprocess.STDOUT, timeout=30)
        result['cluster_stopped'] = stop.returncode == 0
    (out / 'execution.json').write_text(json.dumps(result, indent=2) + '\n')
raise SystemExit(code)
