"""Disposable local integrated review. Provider is a request-aware loopback test fixture, never real AI."""
from pathlib import Path
import base64, hashlib, json, os, secrets, signal, socket, subprocess, sys, tempfile, time, urllib.request

root = Path(__file__).resolve().parents[6]
evidence = Path(__file__).resolve().parent
pointer = Path('/tmp/wordweave-m002-integrated-current')
pg = Path('/opt/homebrew/opt/postgresql@18/bin')
node = '/Users/xekinzhuo/.npm/_npx/387698761821791d/node_modules/node/bin/node'
ports = [3302, 3332, 38083, 38084, 39083, 63542]
mode = sys.argv[1] if len(sys.argv) > 1 else 'start'

def stop(work):
    state = json.loads((work / 'processes.json').read_text())
    for item in reversed(state['processes']):
        actual = subprocess.run(['ps', '-p', str(item['pid']), '-o', 'command='], capture_output=True, text=True).stdout
        if item['identity'] in actual:
            try: os.kill(item['pid'], signal.SIGTERM)
            except ProcessLookupError: pass
    subprocess.run([str(pg / 'pg_ctl'), '-D', str(work / 'data'), '-m', 'fast', 'stop', '-w'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

if mode == 'stop':
    stop(Path(pointer.read_text()))
    print('Integrated preview stopped; disposable database and logs retained.')
    sys.exit(0)
if mode not in ('start', 'resume'):
    raise SystemExit('Usage: preview.py [start|resume|stop]')
for port in ports:
    with socket.socket() as sock:
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        sock.bind(('127.0.0.1', port))

work = Path(pointer.read_text()) if mode == 'resume' else Path(tempfile.mkdtemp(prefix='wordweave-m002-integrated-'))
build = Path(json.loads((evidence / 'inputs.json').read_text())['build_directory'])
processes = []
def run(args, env=None, cwd=None):
    with (work / 'setup.log').open('a') as log:
        subprocess.run(list(map(str, args)), env=env, cwd=cwd, check=True, stdout=log, stderr=subprocess.STDOUT)
def spawn(name, args, env):
    with (work / (name + '.log')).open('a') as log:
        p = subprocess.Popen(args, cwd=root, env=env, stdin=subprocess.DEVNULL, stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
    processes.append({'name': name, 'pid': p.pid, 'identity': args[1] if args[0] == node else args[0]})
def save_state():
    state = {'url': 'http://127.0.0.1:3302', 'mode': 'production frontend + real Go/Postgres + request-aware local test provider', 'work': str(work), 'build': str(build), 'processes': processes, 'real_provider_calls': 0}
    (work / 'processes.json').write_text(json.dumps(state, indent=2) + '\n')
    pointer.write_text(str(work))
    return state
try:
    if mode == 'start':
        run([pg / 'initdb', '-D', work / 'data', '-A', 'trust', '-U', 'review_test', '--no-locale', '--encoding=UTF8'])
        env = {k: v for k, v in os.environ.items() if k in ('PATH', 'HOME', 'TMPDIR', 'LANG', 'LC_ALL', 'GOPATH', 'GOMODCACHE', 'GOCACHE')}
        env.update(GOTOOLCHAIN='go1.26.7', HTTP_ADDR='127.0.0.1:38083', METRICS_ADDR='127.0.0.1:39083', PUBLIC_ORIGIN='http://127.0.0.1:3302', APP_DATABASE_URL='postgres://review_test@127.0.0.1:63542/wordweave_review_m002?sslmode=disable', AI_DATABASE_URL='postgres://review_test@127.0.0.1:63542/wordweave_review_m002?sslmode=disable', COOKIE_SECURE='false', OPENROUTER_BASE_URL='http://127.0.0.1:38084', OPENROUTER_MASTER_KEYS='1:' + base64.b64encode(secrets.token_bytes(32)).decode(), OPENROUTER_CURRENT_KEY_VERSION='1', TRUSTED_PROXY_CIDRS='127.0.0.1/32', ADMIN_USERNAME='admin_review', ADMIN_PASSWORD='ReviewLocal2026!')
        for key in ['SESSION_PEPPER', 'CAPABILITY_PEPPER', 'CSRF_HMAC_KEY', 'CURSOR_HMAC_KEY']: env[key] = secrets.token_hex(32)
        (work / 'env.json').write_text(json.dumps(env)); os.chmod(work / 'env.json', 0o600)
        run(['go', 'build', '-o', work / 'wordweave', './cmd/wordweave'], env, root / 'backend')
        run(['go', 'build', '-o', work / 'wordweave-admin', './cmd/wordweave-admin'], env, root / 'backend')
        (work / 'build.json').write_text(json.dumps({'source_manifest_sha256': json.loads((evidence / 'inputs.json').read_text())['sources']['backend-cr013']['manifest_sha256'], 'binaries': {n: hashlib.sha256((work/n).read_bytes()).hexdigest() for n in ['wordweave', 'wordweave-admin']}}, indent=2))
    else:
        env = json.loads((work / 'env.json').read_text())
    run([pg / 'pg_ctl', '-D', work / 'data', '-l', work / 'postgres.log', '-o', f'-h 127.0.0.1 -p 63542 -k {work}', 'start', '-w'])
    if mode == 'start':
        run([pg / 'createdb', '-h', '127.0.0.1', '-p', '63542', '-U', 'review_test', 'wordweave_review_m002'])
        run([work / 'wordweave-admin', 'migrate'], env)
        run([work / 'wordweave-admin', 'create-admin'], env)
    spawn('backend', [str(work / 'wordweave')], env)
    spawn('frontend', [node, str(build / '.output/server/index.mjs')], {**env, 'NITRO_HOST': '127.0.0.1', 'NITRO_PORT': '3332', 'NUXT_BACKEND_INTERNAL_ORIGIN': 'http://127.0.0.1:38083'})
    spawn('fixture-proxy', [node, str(evidence / 'services.mjs')], env)
    for url in ['http://127.0.0.1:3302/api/v1/bootstrap', 'http://127.0.0.1:3302/']:
        for _ in range(100):
            try:
                with urllib.request.urlopen(url, timeout=2) as response:
                    if response.status == 200: break
            except Exception: time.sleep(.2)
        else: raise RuntimeError('Service not ready: ' + url)
    print(json.dumps(save_state(), indent=2))
except Exception:
    save_state(); stop(work)
    print('Setup failed; diagnostic logs: ' + str(work), file=sys.stderr)
    raise
