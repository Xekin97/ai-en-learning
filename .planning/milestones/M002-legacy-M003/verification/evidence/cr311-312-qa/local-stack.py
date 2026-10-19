"""Disposable CR311/312 QA stack. Uses only a local deterministic provider."""
import base64
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
PG = Path("/opt/homebrew/opt/postgresql@18/bin")
NODE = Path("/Users/xekinzhuo/.npm/_npx/387698761821791d/node_modules/node/bin/node")
POINTER = HERE / "local-stack-location.txt"


def unused_port():
    with socket.socket() as server:
        server.bind(("127.0.0.1", 0))
        return server.getsockname()[1]


def serve_provider(work):
    public = json.loads((work / "public.json").read_text())

    class Provider(BaseHTTPRequestHandler):
        def log_message(self, *_):
            pass

        def do_GET(self):
            self.send_response(200)
            self.send_header("content-type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"data": [{"id": "synthetic/pass", "supported_parameters": ["structured_outputs"]}, {"id": "synthetic/q02", "supported_parameters": ["structured_outputs"]}]}).encode())

        def do_POST(self):
            request = json.loads(self.rfile.read(int(self.headers.get("content-length", "0"))))
            messages = request.get("messages", [])
            user = next((message.get("content", "") for message in reversed(messages) if message.get("role") == "user"), "{}")
            try:
                payload = json.loads(user)
            except json.JSONDecodeError:
                payload = {}
            task = payload.get("task", payload)
            entries = task.get("entries", ["wander", "gentle"])
            language = task.get("meaning_language", "en")
            schema_name = request.get("response_format", {}).get("json_schema", {}).get("name", "")
            system = " ".join(str(message.get("content", "")) for message in messages if message.get("role") == "system")
            if schema_name == "wordweave_scene_plan":
                stage = "planning"
            elif schema_name == "wordweave_content_review" or "REVIEW_SCHEMA" in system:
                stage = "content_review"
            elif "issues" in payload:
                stage = "content_repair"
            elif "draft" in payload:
                stage = "fixed_edit"
            else:
                stage = "generation"
            with (work / "provider-calls.jsonl").open("a") as log:
                log.write(json.dumps({"time": time.time(), "stage": stage, "model": request.get("model"), "entries": entries, "synthetic": True}) + "\n")
            meaning = lambda entry: {"zh": f"{entry} 的本地测试词义", "ja": f"{entry} のローカルテスト語義"}.get(language, f"a local test meaning for {entry}")
            if stage == "planning":
                candidate = {
                    "scene": "Mia joins a small writing group in an old bookshop.",
                    "participants": [{"id": "Mia", "role": "learner"}],
                    "fixed_facts": ["The group meets in an old bookshop."],
                    "beats": ["Mia enters the shop.", "The group writes together."],
                    "word_uses": [{"entry": entry, "form": entry, "meaning": meaning(entry), "phrase": f"use {entry} naturally", "role": "Part of the shared scene."} for entry in entries],
                }
            elif stage == "content_review":
                candidate = {"invalid_review": True} if request.get("model") == "synthetic/q02" else {"schema_version": 1, "verdict": "pass", "issues": []}
            else:
                first = "Mia entered a tiny old bookshop and greeted the writing group." if stage == "fixed_edit" else "Mia entered an old bookshop and greeted the writing group."
                second = "She listened carefully before the shared exercise began."
                third = " ".join(f"The group practiced {entry}({entry}) naturally in a sentence." for entry in entries)
                minimum = int(task.get("minimum_words", 100))
                filler = "Neighbors offered practical ideas and helpful support during the calm afternoon. "
                third += " " + filler * max(10, minimum // 10 + 2)
                passage = "\n\n".join([first, second, third]).strip()
                candidate = {"passage": passage, "tags": ["bookshop", "writing"], "targets": {entry: {"entry_meaning": meaning(entry), "hint_phrase": f"use {entry}({entry}) naturally"} for entry in entries}}
            raw = json.dumps(candidate, ensure_ascii=False)
            self.send_response(200)
            self.send_header("content-type", "text/event-stream")
            self.send_header("cache-control", "no-store")
            self.end_headers()
            try:
                for offset in range(0, len(raw), 72):
                    chunk = {"choices": [{"delta": {"content": raw[offset:offset + 72]}}]}
                    self.wfile.write(("data: " + json.dumps(chunk, ensure_ascii=False) + "\n\n").encode())
                    self.wfile.flush()
                    time.sleep(0.10)
                self.wfile.write(b"data: [DONE]\n\n")
                self.wfile.flush()
            except (BrokenPipeError, ConnectionResetError):
                pass

    ThreadingHTTPServer(("127.0.0.1", public["provider_port"]), Provider).serve_forever()


def start():
    if POINTER.exists():
        raise RuntimeError("Owned stack pointer already exists; inspect it before starting another stack")
    work = Path(tempfile.mkdtemp(prefix="ww-cr311-312-qa103-"))
    POINTER.write_text(str(work))
    ports = {name: unused_port() for name in ["database", "backend", "metrics", "provider", "frontend"]}
    if len(set(ports.values())) != len(ports):
        raise RuntimeError("Port allocation collision")
    public = {f"{name}_port": port for name, port in ports.items()}
    public.update({"work": str(work), "api_origin": f"http://127.0.0.1:{ports['backend']}", "frontend_origin": f"http://127.0.0.1:{ports['frontend']}", "database_name": "wordweave_cr311_312_qa103", "synthetic_only": True})
    (work / "public.json").write_text(json.dumps(public, indent=2))
    setup_log = (work / "setup.log").open("w")

    def run(args, env=None, cwd=None):
        result = subprocess.run([str(arg) for arg in args], env=env, cwd=cwd, stdout=setup_log, stderr=subprocess.STDOUT)
        setup_log.flush()
        if result.returncode:
            raise RuntimeError(f"Setup failed at {args[0]}; inspect {work / 'setup.log'}")

    run([PG / "initdb", "-D", work / "data", "-A", "trust", "-U", "qa103", "--no-locale", "--encoding=UTF8"])
    run([PG / "pg_ctl", "-D", work / "data", "-l", work / "postgres.log", "-o", f"-h 127.0.0.1 -p {ports['database']} -k {work}", "start", "-w"])
    run([PG / "createdb", "-h", "127.0.0.1", "-p", ports["database"], "-U", "qa103", public["database_name"]])
    database_url = f"postgres://qa103@127.0.0.1:{ports['database']}/{public['database_name']}?sslmode=disable"
    task_env = {
        "HTTP_ADDR": f"127.0.0.1:{ports['backend']}", "METRICS_ADDR": f"127.0.0.1:{ports['metrics']}",
        "PUBLIC_ORIGIN": public["frontend_origin"], "APP_DATABASE_URL": database_url, "AI_DATABASE_URL": database_url,
        "COOKIE_SECURE": "false", "OPENROUTER_BASE_URL": f"http://127.0.0.1:{ports['provider']}",
        "OPENROUTER_MASTER_KEYS": "1:" + base64.b64encode(secrets.token_bytes(32)).decode(), "OPENROUTER_CURRENT_KEY_VERSION": "1",
        "TRUSTED_PROXY_CIDRS": "127.0.0.1/32", "ADMIN_USERNAME": "qa103_admin", "ADMIN_PASSWORD": secrets.token_urlsafe(24),
        "GENERATION_MAX_IN_FLIGHT": "1", "PREVIEW_MAX_IN_FLIGHT": "1", "GENERATION_PROBE_MAX_IN_FLIGHT": "1", "GENERATION_PREFLIGHT_MAX": "1",
        "AI_CONNECTION_MAX_IN_FLIGHT": "1", "AI_CONNECTION_DEFAULT_CAPACITY_GROUP": "qa103-local", "AI_CONNECTION_CAPACITY_GROUPS": "{}",
        "SHUTDOWN_TIMEOUT": "10s", "APP_DB_MAX_CONNS": "4", "AI_DB_MAX_CONNS": "4",
    }
    for key in ["SESSION_PEPPER", "CAPABILITY_PEPPER", "CSRF_HMAC_KEY", "CURSOR_HMAC_KEY"]:
        task_env[key] = secrets.token_hex(32)
    (work / "env.json").write_text(json.dumps(task_env))
    os.chmod(work / "env.json", 0o600)
    env = {key: os.environ[key] for key in ["PATH", "HOME", "TMPDIR", "LANG"] if key in os.environ}
    env["PATH"] = str(NODE.parent) + os.pathsep + env.get("PATH", "")
    env.update(task_env)
    run(["go", "build", "-o", work / "wordweave", "./cmd/wordweave"], env, ROOT / "backend")
    run(["go", "build", "-o", work / "wordweave-admin", "./cmd/wordweave-admin"], env, ROOT / "backend")
    run([work / "wordweave-admin", "migrate"], env)
    run([work / "wordweave-admin", "create-admin"], env)
    for name, args in [("provider", [sys.executable, str(Path(__file__).resolve()), "serve", str(work)]), ("backend", [str(work / "wordweave")])]:
        process = subprocess.Popen(args, env=env, stdout=(work / f"{name}.log").open("w"), stderr=subprocess.STDOUT, start_new_session=True)
        (work / f"{name}.pid").write_text(str(process.pid))
    for _ in range(80):
        try:
            urllib.request.urlopen(public["api_origin"] + "/api/v1/bootstrap", timeout=2).read()
            break
        except (urllib.error.URLError, ConnectionError, TimeoutError):
            time.sleep(0.1)
    else:
        raise RuntimeError("Backend did not become ready")
    frontend_env = dict(env)
    frontend_env.update({"NUXT_BACKEND_INTERNAL_ORIGIN": public["api_origin"], "NUXT_IGNORE_LOCK": "1"})
    frontend = subprocess.Popen([str(NODE), str(ROOT / "frontend/node_modules/nuxt/bin/nuxt.mjs"), "dev", "--host", "127.0.0.1", "--port", str(ports["frontend"])], cwd=ROOT / "frontend", env=frontend_env, stdout=(work / "frontend.log").open("w"), stderr=subprocess.STDOUT, start_new_session=True)
    (work / "frontend.pid").write_text(str(frontend.pid))
    for _ in range(160):
        try:
            urllib.request.urlopen(public["frontend_origin"] + "/login", timeout=2).read()
            break
        except (urllib.error.URLError, ConnectionError, TimeoutError):
            time.sleep(0.25)
    else:
        raise RuntimeError("Frontend did not become ready")
    (HERE / "local-stack-public.json").write_text(json.dumps(public, indent=2) + "\n")
    print(json.dumps(public))


def stop():
    work = Path(POINTER.read_text())
    if not work.name.startswith("ww-cr311-312-qa103-"):
        raise RuntimeError("Refusing to stop an unowned stack")
    public = json.loads((work / "public.json").read_text())
    result = {}
    for name in ["frontend", "backend", "provider"]:
        pid_file = work / f"{name}.pid"
        if not pid_file.exists():
            continue
        pid = int(pid_file.read_text())
        command = subprocess.run(["ps", "-p", str(pid), "-o", "command="], capture_output=True, text=True).stdout.strip()
        expected = str(public["frontend_port"]) if name == "frontend" else str(work / "wordweave") if name == "backend" else str(work)
        if command and expected not in command:
            raise RuntimeError(f"Refusing to stop process with ownership mismatch: {name}")
        try:
            os.killpg(pid, signal.SIGTERM)
            result[name] = "SIGTERM sent"
        except ProcessLookupError:
            result[name] = "already stopped"
    time.sleep(1)
    pg = subprocess.run([str(PG / "pg_ctl"), "-D", str(work / "data"), "-m", "fast", "stop", "-w"], capture_output=True, text=True, timeout=20)
    result["postgres_exit_code"] = pg.returncode
    result["closed_ports"] = {}
    for name in ["database", "backend", "metrics", "provider", "frontend"]:
        with socket.socket() as connection:
            connection.settimeout(0.3)
            result["closed_ports"][name] = connection.connect_ex(("127.0.0.1", public[f"{name}_port"])) != 0
    result["work"] = str(work)
    (HERE / "local-stack-cleanup.json").write_text(json.dumps(result, indent=2) + "\n")
    POINTER.unlink()
    print(json.dumps(result))


if __name__ == "__main__":
    {"start": start, "stop": stop}.get(sys.argv[1], lambda: serve_provider(Path(sys.argv[2])))()
