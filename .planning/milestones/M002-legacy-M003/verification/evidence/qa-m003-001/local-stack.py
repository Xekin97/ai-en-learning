"""Disposable M003 QA services. Local synthetic provider only."""
import base64
import http.cookiejar
import json
import os
from pathlib import Path
import secrets
import signal
import socket
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[5]
PG = Path('/opt/homebrew/opt/postgresql@18/bin')
NODE24 = Path('/Users/xekinzhuo/.npm/_npx/387698761821791d/node_modules/node/bin')
PNPM_CJS = Path('/Users/xekinzhuo/.nvm/versions/node/v22.22.2/lib/node_modules/pnpm/bin/pnpm.cjs')
POINTER = HERE / 'local-stack-location.txt'


def unused_port():
    with socket.socket() as server:
        server.bind(('127.0.0.1', 0))
        return server.getsockname()[1]


def serve(work):
    config = json.loads((work / 'public.json').read_text())

    class Provider(BaseHTTPRequestHandler):
        def log_message(self, *_):
            pass

        def do_GET(self):
            self.send_response(200)
            self.send_header('content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'data': [{'id': 'synthetic/pass', 'supported_parameters': ['structured_outputs']}]}).encode())

        def do_POST(self):
            request = json.loads(self.rfile.read(int(self.headers.get('content-length', '0'))))
            messages = request.get('messages', [])
            user = next((m['content'] for m in reversed(messages) if m.get('role') == 'user'), '{}')
            try:
                payload = json.loads(user)
            except json.JSONDecodeError:
                payload = {}
            task = payload.get('task', payload)
            entries = task.get('entries', ['learn', 'vulnerable'])
            lang = task.get('meaning_language', 'en')
            name = request.get('response_format', {}).get('json_schema', {}).get('name', '')
            system = ' '.join(m.get('content', '') for m in messages if m.get('role') == 'system')
            kind = 'planning' if name == 'wordweave_scene_plan' else 'content_review' if name == 'wordweave_content_review' or 'REVIEW_SCHEMA' in system else 'content_repair' if 'issues' in payload else 'fixed_edit' if 'draft' in payload else 'generation'
            with (work / 'provider-calls.jsonl').open('a') as log:
                log.write(json.dumps({'time': time.time(), 'stage': kind, 'model': request.get('model'), 'entries': entries, 'synthetic': True}) + '\n')
            meaning = lambda entry: {'zh': '在本地联调中使用的词义', 'ja': 'ローカル検証用の語義'}.get(lang, 'a synthetic local meaning for ' + entry)
            if kind == 'planning':
                candidate = {'scene': {'zh': '邻居在社区花园分水果。', 'ja': '近所の人が庭で果物を分ける。'}.get(lang, 'Neighbors share fruit in a community garden.'), 'participants': [{'id': 'Mara', 'role': 'volunteer'}], 'fixed_facts': ['The table stands in the community garden.'], 'beats': ['Mara prepares the table.', 'Neighbors divide the fruit.'], 'word_uses': [{'entry': entry, 'form': entry, 'meaning': meaning(entry), 'phrase': 'the ' + entry, 'role': 'Part of the shared situation.'} for entry in entries]}
            elif kind == 'content_review':
                if request.get('model') == 'synthetic/q02':
                    candidate = {'invalid_review': True}
                elif request.get('model') == 'synthetic/repair-mixed':
                    candidate = {'schema_version': 1, 'verdict': 'issues', 'issues': [
                        {'code': 'forced_wording', 'evidence': ['Young people share grapes at a community table.'], 'problem': 'Synthetic forced wording issue.', 'repair_goal': 'Use the selected word naturally.'},
                        {'code': 'contradiction', 'evidence': ['Neighbors offer practical ideas'], 'problem': 'Synthetic continuity issue.', 'repair_goal': 'Keep the shared scene consistent.'}
                    ]}
                else:
                    candidate = {'schema_version': 1, 'verdict': 'pass', 'issues': []}
            else:
                lead = 'Mara arranged the table beside the garden. ' if kind == 'fixed_edit' else 'Mara moved a chair beside the garden. '
                if set(entries) == {'grape', 'young'}:
                    lead += 'Young(young) people share grapes(grape) at a community table. '
                    surfaces = {'grape': 'grapes', 'young': 'young'}
                else:
                    lead += 'The group discussed ' + ', '.join(entry + '(' + entry + ')' for entry in entries) + '. '
                    surfaces = {entry: entry for entry in entries}
                minimum = int(task.get('minimum_words', 100))
                filler = 'Neighbors offer practical ideas and helpful support during the calm afternoon. '
                passage = lead + filler * max(10, minimum // 10 + 2)
                candidate = {'passage': passage.strip(), 'tags': ['community'], 'targets': {entry: {'entry_meaning': meaning(entry), 'hint_phrase': 'the ' + surfaces[entry] + '(' + entry + ')'} for entry in entries}}
            raw = json.dumps(candidate, ensure_ascii=False)
            self.send_response(200)
            self.send_header('content-type', 'text/event-stream')
            self.send_header('cache-control', 'no-store')
            self.end_headers()
            try:
                for offset in range(0, len(raw), 96):
                    chunk = {'choices': [{'delta': {'content': raw[offset:offset + 96]}}]}
                    self.wfile.write(('data: ' + json.dumps(chunk, ensure_ascii=False) + '\n\n').encode())
                    self.wfile.flush()
                    time.sleep(0.025)
                self.wfile.write(b'data: [DONE]\n\n')
                self.wfile.flush()
            except (BrokenPipeError, ConnectionResetError):
                pass

    ThreadingHTTPServer(('127.0.0.1', config['provider_port']), Provider).serve_forever()


def start():
    if POINTER.exists():
        raise RuntimeError('This turn already owns a stack; inspect its location before creating another.')
    work = Path(tempfile.mkdtemp(prefix='ww-m003-qa-001-'))
    POINTER.write_text(str(work))
    ports = {key: unused_port() for key in ['database', 'backend', 'metrics', 'provider', 'frontend']}
    assert len(set(ports.values())) == len(ports)
    public = {key + '_port': value for key, value in ports.items()}
    public.update({'work': str(work), 'api_origin': 'http://127.0.0.1:' + str(ports['backend']), 'frontend_origin': 'http://127.0.0.1:' + str(ports['frontend']), 'database_name': 'wordweave_m003_qa_001', 'synthetic_only': True})
    (work / 'public.json').write_text(json.dumps(public, indent=2))
    log = (work / 'setup.log').open('w')
    def run(args, env=None, cwd=None):
        result = subprocess.run([str(arg) for arg in args], env=env, cwd=cwd, stdout=log, stderr=subprocess.STDOUT)
        log.flush()
        if result.returncode:
            raise RuntimeError('Setup failed at ' + str(args[0]) + '; inspect ' + str(work / 'setup.log'))
    run([PG / 'initdb', '-D', work / 'data', '-A', 'trust', '-U', 'm003_test', '--no-locale', '--encoding=UTF8'])
    run([PG / 'pg_ctl', '-D', work / 'data', '-l', work / 'postgres.log', '-o', '-h 127.0.0.1 -p ' + str(ports['database']) + ' -k ' + str(work), 'start', '-w'])
    run([PG / 'createdb', '-h', '127.0.0.1', '-p', ports['database'], '-U', 'm003_test', public['database_name']])
    url = 'postgres://m003_test@127.0.0.1:' + str(ports['database']) + '/' + public['database_name'] + '?sslmode=disable'
    task_env = {'HTTP_ADDR': '127.0.0.1:' + str(ports['backend']), 'METRICS_ADDR': '127.0.0.1:' + str(ports['metrics']), 'PUBLIC_ORIGIN': public['frontend_origin'], 'APP_DATABASE_URL': url, 'AI_DATABASE_URL': url, 'COOKIE_SECURE': 'false', 'OPENROUTER_BASE_URL': 'http://127.0.0.1:' + str(ports['provider']), 'OPENROUTER_MASTER_KEYS': '1:' + base64.b64encode(secrets.token_bytes(32)).decode(), 'OPENROUTER_CURRENT_KEY_VERSION': '1', 'TRUSTED_PROXY_CIDRS': '127.0.0.1/32', 'ADMIN_USERNAME': 'm003_local_admin', 'ADMIN_PASSWORD': secrets.token_urlsafe(24), 'GENERATION_MAX_IN_FLIGHT': '1', 'PREVIEW_MAX_IN_FLIGHT': '1', 'GENERATION_PROBE_MAX_IN_FLIGHT': '1', 'GENERATION_PREFLIGHT_MAX': '1', 'AI_CONNECTION_MAX_IN_FLIGHT': '1', 'AI_CONNECTION_DEFAULT_CAPACITY_GROUP': 'synthetic-local-account', 'AI_CONNECTION_CAPACITY_GROUPS': '{}', 'SHUTDOWN_TIMEOUT': '10s', 'APP_DB_MAX_CONNS': '4', 'AI_DB_MAX_CONNS': '4'}
    for key in ['SESSION_PEPPER', 'CAPABILITY_PEPPER', 'CSRF_HMAC_KEY', 'CURSOR_HMAC_KEY']:
        task_env[key] = secrets.token_hex(32)
    (work / 'env.json').write_text(json.dumps(task_env))
    os.chmod(work / 'env.json', 0o600)
    env = {key: os.environ[key] for key in ['PATH', 'HOME', 'TMPDIR', 'LANG'] if key in os.environ}
    env['PATH'] = str(NODE24) + os.pathsep + env.get('PATH', '')
    env.update(task_env)
    run(['go', 'build', '-o', work / 'wordweave', './cmd/wordweave'], env, ROOT / 'backend')
    run(['go', 'build', '-o', work / 'wordweave-admin', './cmd/wordweave-admin'], env, ROOT / 'backend')
    # The database was created empty immediately above; this is initialization only.
    run([work / 'wordweave-admin', 'migrate'], env)
    run([work / 'wordweave-admin', 'create-admin'], env)
    for name, args in [('provider', [sys.executable, str(Path(__file__).resolve()), 'serve', str(work)]), ('backend', [str(work / 'wordweave')])]:
        proc = subprocess.Popen(args, env=env, stdout=(work / (name + '.log')).open('w'), stderr=subprocess.STDOUT, start_new_session=True)
        (work / (name + '.pid')).write_text(str(proc.pid))
    for _ in range(50):
        try:
            urllib.request.urlopen(public['api_origin'] + '/api/v1/bootstrap', timeout=2).read()
            break
        except (urllib.error.URLError, ConnectionError):
            time.sleep(0.1)
    else:
        raise RuntimeError('API did not become ready; inspect disposable backend.log')
    frontend_env = dict(env)
    frontend_env.update({'NUXT_BACKEND_INTERNAL_ORIGIN': public['api_origin'], 'NUXT_IGNORE_LOCK': '1'})
    frontend = subprocess.Popen([str(NODE24 / 'node'), str(PNPM_CJS), 'dev', '--host', '127.0.0.1', '--port', str(ports['frontend'])], cwd=ROOT / 'frontend', env=frontend_env, stdout=(work / 'frontend.log').open('w'), stderr=subprocess.STDOUT, start_new_session=True)
    (work / 'frontend.pid').write_text(str(frontend.pid))
    for _ in range(120):
        try:
            urllib.request.urlopen(public['frontend_origin'] + '/login', timeout=2).read()
            break
        except (urllib.error.URLError, ConnectionError, TimeoutError):
            time.sleep(0.25)
    else:
        raise RuntimeError('Frontend did not become ready; inspect disposable frontend.log')
    (HERE / 'local-stack-public.json').write_text(json.dumps(public, indent=2) + '\n')
    print(json.dumps(public))


def stop():
    work = Path(POINTER.read_text())
    assert work.name.startswith('ww-m003-qa-001-')
    public = json.loads((work / 'public.json').read_text())
    result = {}
    for name in ['frontend', 'backend', 'provider']:
        pid_file = work / (name + '.pid')
        if pid_file.exists():
            pid = int(pid_file.read_text())
            command = subprocess.run(['ps', '-p', str(pid), '-o', 'command='], capture_output=True, text=True).stdout.strip()
            expected = str(public['frontend_port']) if name == 'frontend' else str(work / 'wordweave') if name == 'backend' else str(work)
            if command and expected not in command:
                raise RuntimeError('Refusing to stop a process whose task ownership does not match: ' + name)
            try:
                os.killpg(pid, signal.SIGTERM)
                deadline = time.monotonic() + 12
                while time.monotonic() < deadline:
                    state = subprocess.run(['ps', '-p', str(pid), '-o', 'stat='], capture_output=True, text=True).stdout.strip()
                    if not state or state.startswith('Z'):
                        break
                    time.sleep(0.1)
                else:
                    raise RuntimeError('Owned process did not stop after SIGTERM: ' + name)
                result[name] = 'stopped after SIGTERM'
            except ProcessLookupError:
                result[name] = 'already stopped'
    pg = subprocess.run([str(PG / 'pg_ctl'), '-D', str(work / 'data'), '-m', 'fast', 'stop', '-w'], capture_output=True, text=True, timeout=20)
    result['postgres_exit_code'] = pg.returncode
    result['closed_ports'] = {}
    for name in ['backend', 'metrics', 'provider', 'frontend', 'database']:
        with socket.socket() as connection:
            connection.settimeout(0.3)
            result['closed_ports'][name] = connection.connect_ex(('127.0.0.1', public[name + '_port'])) != 0
    result['work'] = str(work)
    (HERE / 'local-stack-cleanup.json').write_text(json.dumps(result, indent=2) + '\n')
    POINTER.unlink()
    print(json.dumps(result))


if __name__ == '__main__':
    {'start': start, 'stop': stop}.get(sys.argv[1], lambda: serve(Path(sys.argv[2])))()
