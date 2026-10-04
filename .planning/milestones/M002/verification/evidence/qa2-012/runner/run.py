"""Run the prepared QA cases once. All new evidence goes to a fresh temp folder.

Usage, from the ai-en-learning repository: python3 /path/to/this/run.py
Does not apply QA11 documents, update workflow state, or call an external model.
"""
from pathlib import Path
import hashlib
import json
import os
import shutil
import signal
import socket
import subprocess
import tempfile
import time
import urllib.request

PACKAGE = Path(__file__).resolve().parent
ROOT = Path.cwd()
NODE = '/Users/xekinzhuo/.npm/_npx/387698761821791d/node_modules/node/bin/node'
PG_CTL = '/opt/homebrew/opt/postgresql@18/bin/pg_ctl'


def verify_inputs():
    inputs = json.loads((PACKAGE / 'inputs.json').read_text())
    changed = [name for name, digest in inputs['source_files'].items()
               if not (ROOT / name).is_file() or hashlib.sha256((ROOT / name).read_bytes()).hexdigest() != digest]
    if changed:
        raise RuntimeError('Source baseline changed; reassess before executing: ' + ', '.join(changed[:8]))
    build = Path(json.loads((ROOT / '.planning/milestones/M002/implementation/evidence/frontend-cr014-015/build-location.json').read_text())['isolated'])
    for name, digest in inputs['production_build_files'].items():
        if not (build / name).is_file() or hashlib.sha256((build / name).read_bytes()).hexdigest() != digest:
            raise RuntimeError('Recorded production build is missing or changed: ' + name)
    if not Path(NODE).is_file():
        raise RuntimeError('Recorded Node 24 binary is unavailable')
    return build


def listener_preflight():
    held = []
    try:
        for port in [63541, 38081, 39081, 38082, 3331, 3301]:
            server = socket.socket()
            held.append(server)
            server.bind(('127.0.0.1', port))
    finally:
        for server in held:
            server.close()


def wait_http(url, process=None):
    deadline = time.monotonic() + 45
    while time.monotonic() < deadline:
        if process is not None and process.poll() is not None:
            raise RuntimeError('Service stopped before it became ready')
        try:
            with urllib.request.urlopen(url, timeout=2) as response:
                if response.status == 200:
                    return
        except OSError:
            pass
        time.sleep(0.2)
    raise RuntimeError('Timed out waiting for local service: ' + url)


def main():
    build = verify_inputs()
    # Fail before creating processes if sandbox or an existing service blocks any port.
    listener_preflight()
    output = Path(tempfile.mkdtemp(prefix='wordweave-title-runtime-'))
    for path in PACKAGE.iterdir():
        if path.is_file():
            shutil.copy2(path, output / path.name)
    run_env = dict(os.environ, QA_TITLE_STACK_FILE=str(output / 'stack-location.txt'))
    print('Evidence directory:', output, flush=True)
    frontend = None
    exit_code = 1
    lifecycle = {'result': 'NOT_EXECUTED', 'real_provider_calls': 0}
    try:
        with (output / 'stack.log').open('w') as log:
            subprocess.run(['python3', str(output / 'stack.py')], cwd=ROOT, env=run_env,
                           stdout=log, stderr=subprocess.STDOUT, check=True, timeout=180)
        wait_http('http://127.0.0.1:38081/health/ready')
        frontend_env = dict(run_env, PORT='3331', HOST='127.0.0.1', NUXT_BACKEND_INTERNAL_ORIGIN='http://127.0.0.1:38081')
        with (output / 'frontend.log').open('w') as log:
            frontend = subprocess.Popen([NODE, str(build / '.output/server/index.mjs')], cwd=ROOT,
                                        env=frontend_env, stdout=log, stderr=subprocess.STDOUT,
                                        start_new_session=True)
        wait_http('http://127.0.0.1:3331/', frontend)
        with (output / 'tests.log').open('w') as log:
            result = subprocess.run([NODE, str(output / 'title-followup.mjs')], cwd=ROOT, env=run_env,
                                    stdout=log, stderr=subprocess.STDOUT, timeout=240)
        exit_code = result.returncode
        lifecycle['result'] = 'EXECUTED'
        lifecycle['test_exit_code'] = exit_code
        print((output / 'tests.log').read_text(), flush=True)
    except Exception as error:
        lifecycle['error'] = str(error)
        print('Execution incomplete:', error, flush=True)
    finally:
        cleanup = []
        if frontend is not None and frontend.poll() is None:
            os.killpg(frontend.pid, signal.SIGTERM)
            try:
                frontend.wait(timeout=10)
            except subprocess.TimeoutExpired:
                os.killpg(frontend.pid, signal.SIGKILL)
                frontend.wait(timeout=5)
            cleanup.append('frontend_stopped')
        pointer = Path(run_env['QA_TITLE_STACK_FILE'])
        if pointer.exists():
            work = Path(pointer.read_text().strip())
            if (work / 'backend.pid').exists():
                try:
                    os.kill(int((work / 'backend.pid').read_text()), signal.SIGTERM)
                except ProcessLookupError:
                    pass
                cleanup.append('backend_stop_requested')
            if (work / 'data/postmaster.pid').exists():
                with (output / 'stop.log').open('w') as log:
                    stopped = subprocess.run([PG_CTL, '-D', str(work / 'data'), '-m', 'fast', 'stop', '-w'],
                                             stdout=log, stderr=subprocess.STDOUT, timeout=30)
                cleanup.append('database_stopped' if stopped.returncode == 0 else 'database_stop_failed')
                if stopped.returncode != 0:
                    exit_code = 1
        lifecycle['cleanup'] = cleanup
        (output / 'execution.json').write_text(json.dumps(lifecycle, indent=2) + '\n')
        # Private stack env.json is deliberately outside this evidence directory.
        files = {str(path.relative_to(output)): hashlib.sha256(path.read_bytes()).hexdigest()
                 for path in output.iterdir() if path.is_file() and path.name != 'runtime-manifest.json'}
        (output / 'runtime-manifest.json').write_text(json.dumps({'files': files}, indent=2) + '\n')
    return exit_code


if __name__ == '__main__':
    raise SystemExit(main())
