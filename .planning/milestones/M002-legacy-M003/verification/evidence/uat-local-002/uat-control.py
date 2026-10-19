#!/usr/bin/env python3
"""Control only the M003 uat-local-002 backend and frontend runtimes."""
import json
from pathlib import Path
import subprocess
import sys

BACKEND = Path("/tmp/wordweave-m003-uat-local-002")
FRONTEND = Path("/tmp/wordweave-m003-uat002-frontend/control.py")


def run(command):
    completed = subprocess.run(command, capture_output=True, text=True)
    if completed.returncode:
        raise RuntimeError(completed.stderr.strip() or completed.stdout.strip())
    output = completed.stdout.strip().splitlines()
    return json.loads(output[-1]) if output else {"result": "ok"}


def status():
    result = {
        "backend": run([str(BACKEND / "status")]),
        "frontend": run([sys.executable, str(FRONTEND), "status"]),
        "older_uat_managed": False,
    }
    print(json.dumps(result, ensure_ascii=False))


def start():
    run([str(BACKEND / "start")])
    run([sys.executable, str(FRONTEND), "start"])
    status()


def stop():
    # Stop owned processes only; both runtime directories and the UAT database remain.
    frontend = run([sys.executable, str(FRONTEND), "stop"])
    backend = run([str(BACKEND / "stop")])
    print(
        json.dumps(
            {
                "backend": backend,
                "frontend": frontend,
                "data_preserved": True,
                "older_uat_managed": False,
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    {"start": start, "status": status, "stop": stop}[sys.argv[1]]()
