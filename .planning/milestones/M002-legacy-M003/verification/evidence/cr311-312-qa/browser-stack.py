"""Start/stop the QA-owned CR311/312 controlled browser stack."""
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import time
import urllib.request

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[5]
NODE = Path("/Users/xekinzhuo/.npm/_npx/387698761821791d/node_modules/node/bin/node")
PUBLIC = HERE / "browser-stack-public.json"
BACKEND_PORT = 38122
FRONTEND_PORT = 3322


def wait(url, process):
    for _ in range(240):
        if process.poll() is not None:
            raise RuntimeError(f"process exited before {url} became ready")
        try:
            urllib.request.urlopen(url, timeout=1).read()
            return
        except Exception:
            time.sleep(0.25)
    raise RuntimeError(f"timed out waiting for {url}")


def start():
    if PUBLIC.exists():
        raise RuntimeError("browser stack already has an ownership file")
    env = os.environ.copy()
    env["PATH"] = str(NODE.parent) + os.pathsep + env.get("PATH", "")
    env["WORDWEAVE_MOCK_PORT"] = str(BACKEND_PORT)
    backend_log = (HERE / "browser-backend.log").open("w")
    frontend_log = (HERE / "browser-frontend.log").open("w")
    backend = subprocess.Popen(
        [str(NODE), "tests/e2e/mock-backend.mjs"], cwd=ROOT / "frontend",
        env=env, stdout=backend_log, stderr=subprocess.STDOUT, start_new_session=True,
    )
    frontend_env = dict(env)
    frontend_env.update({
        "NUXT_BACKEND_INTERNAL_ORIGIN": f"http://127.0.0.1:{BACKEND_PORT}",
        "NUXT_IGNORE_LOCK": "1",
    })
    frontend = subprocess.Popen(
        [str(NODE), str(ROOT / "frontend/node_modules/nuxt/bin/nuxt.mjs"),
         "dev", "--host", "127.0.0.1", "--port", str(FRONTEND_PORT)],
        cwd=ROOT / "frontend", env=frontend_env, stdout=frontend_log,
        stderr=subprocess.STDOUT, start_new_session=True,
    )
    data = {
        "backend_pid": backend.pid, "frontend_pid": frontend.pid,
        "backend_port": BACKEND_PORT, "frontend_port": FRONTEND_PORT,
        "origin": f"http://127.0.0.1:{FRONTEND_PORT}",
        "synthetic_only": True,
    }
    PUBLIC.write_text(json.dumps(data, indent=2) + "\n")
    wait(f"http://127.0.0.1:{BACKEND_PORT}/api/v1/bootstrap", backend)
    wait(f"http://127.0.0.1:{FRONTEND_PORT}/create", frontend)
    print(json.dumps(data))


def stop():
    data = json.loads(PUBLIC.read_text())
    result = {}
    for name in ["frontend", "backend"]:
        pid = data[f"{name}_pid"]
        command = subprocess.run(
            ["ps", "-p", str(pid), "-o", "command="], capture_output=True, text=True
        ).stdout.strip()
        expected = str(data[f"{name}_port"]) if name == "frontend" else "tests/e2e/mock-backend.mjs"
        if command and expected not in command:
            raise RuntimeError(f"ownership mismatch for {name}: {command}")
        try:
            os.killpg(pid, signal.SIGTERM)
            result[name] = "SIGTERM sent"
        except ProcessLookupError:
            result[name] = "already stopped"
    time.sleep(1)
    result["closed"] = {}
    for name in ["backend", "frontend"]:
        port = data[f"{name}_port"]
        probe = subprocess.run(
            ["lsof", "-nP", f"-iTCP:{port}", "-sTCP:LISTEN"],
            capture_output=True,
        )
        result["closed"][name] = probe.returncode != 0
    (HERE / "browser-stack-cleanup.json").write_text(json.dumps(result, indent=2) + "\n")
    PUBLIC.unlink()
    print(json.dumps(result))


{"start": start, "stop": stop}[sys.argv[1]]()
