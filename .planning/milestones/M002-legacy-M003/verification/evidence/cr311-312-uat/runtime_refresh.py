#!/usr/bin/env python3
"""App-only CR311/312 switch/rollback for the owned real UAT3015 runtime."""
import hashlib
import importlib.util
import json
import os
import shutil
import signal
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path

RUNTIME = Path("/tmp/wordweave-m003-uat-real-003")
EVIDENCE = Path(__file__).resolve().parent
PSQL = "/opt/homebrew/bin/psql"
os.umask(0o077)


def paths():
    return json.loads((EVIDENCE / "release-paths.json").read_text())


def load_control():
    spec = importlib.util.spec_from_file_location("uat_control", RUNTIME / "control.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def db_scalar(sql: str) -> str:
    url = json.loads((RUNTIME / "private-env.json").read_text())["APP_DATABASE_URL"]
    result = subprocess.run(
        [PSQL, url, "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-c", sql],
        capture_output=True,
        text=True,
        env={**os.environ, "LC_ALL": "C", "LANG": "C"},
    )
    if result.returncode:
        raise RuntimeError("database safety query failed: " + result.stderr.strip())
    return result.stdout.strip()


def assert_idle():
    counts = db_scalar("""
      SELECT (SELECT count(*) FROM wordweave.generation_runs WHERE completed_at IS NULL)::text
        || ':' ||
        (SELECT count(*) FROM wordweave.preset_preview_runs WHERE completed_at IS NULL)::text;
    """)
    if counts != "0:0":
        raise RuntimeError("active generation/preview present; switch refused: " + counts)


def stop_apps(control):
    stopped = {}
    for name in ["frontend", "backend"]:
        pid = control.owned(name)
        if not pid:
            continue
        os.kill(pid, signal.SIGTERM)
        deadline = time.monotonic() + (660 if name == "backend" else 30)
        while time.monotonic() < deadline:
            if not control.owned(name):
                break
            time.sleep(0.2)
        else:
            raise RuntimeError("graceful app stop still pending: " + name)
        (RUNTIME / f"{name}.pid").unlink(missing_ok=True)
        stopped[name] = pid
    return stopped


def copy_atomic(source: Path, target: Path):
    temporary = target.with_name(target.name + ".refreshing")
    if temporary.exists():
        if temporary.is_dir():
            shutil.rmtree(temporary)
        else:
            temporary.unlink()
    if source.is_dir():
        shutil.copytree(source, temporary)
    else:
        shutil.copy2(source, temporary)
    if target.is_dir():
        retired = target.with_name(target.name + ".retired")
        if retired.exists():
            shutil.rmtree(retired)
        os.replace(target, retired)
        try:
            os.replace(temporary, target)
        except Exception:
            os.replace(retired, target)
            raise
        shutil.rmtree(retired)
    else:
        os.replace(temporary, target)


def verify_release(stage: Path):
    manifest = json.loads((stage / "artifact-manifest.json").read_text())
    bad = []
    for item in manifest["files"]:
        path = stage / item["path"]
        actual = hashlib.sha256(path.read_bytes()).hexdigest() if path.is_file() else None
        if actual != item["sha256"]:
            bad.append(item["path"])
    if bad:
        raise RuntimeError("release hash mismatch: " + ", ".join(bad[:5]))
    return manifest


def record(payload):
    payload["recorded_at"] = datetime.now().astimezone().isoformat()
    (EVIDENCE / "runtime-switch.json").write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n")
    os.chmod(EVIDENCE / "runtime-switch.json", 0o600)


def switch():
    selected = paths()
    stage, backup = Path(selected["stage"]), Path(selected["backup"])
    manifest = verify_release(stage)
    control = load_control()
    assert_idle()
    before = control.status()
    pg_pid = int(subprocess.run(["lsof", "-tiTCP:54882", "-sTCP:LISTEN"], capture_output=True, text=True, check=True).stdout.splitlines()[0])
    nginx_pid = control.owned("nginx")
    stopped = stop_apps(control)
    try:
        copy_atomic(stage / "wordweave", RUNTIME / "wordweave")
        copy_atomic(stage / "wordweave-admin", RUNTIME / "wordweave-admin")
        copy_atomic(stage / "frontend/.output", RUNTIME / "frontend/.output")
        after = control.start()
        if after["status"] != "ready":
            raise RuntimeError("runtime did not become ready")
        assert_idle()
        result = {
            "result": "PASS", "action": "switch_to_cr311_312", "before": before, "after": after,
            "stopped_app_pids": stopped, "postgres_pid_before": pg_pid,
            "postgres_pid_after": int(subprocess.run(["lsof", "-tiTCP:54882", "-sTCP:LISTEN"], capture_output=True, text=True, check=True).stdout.splitlines()[0]),
            "nginx_pid_before": nginx_pid, "nginx_pid_after": control.owned("nginx"),
            "release_artifact_files": len(manifest["files"]), "backup": str(backup), "stage": str(stage),
            "database_migrated_or_seeded": False, "provider_request_triggered": False,
        }
        record(result)
        print(json.dumps(result))
    except Exception:
        stop_apps(control)
        copy_atomic(backup / "wordweave", RUNTIME / "wordweave")
        copy_atomic(backup / "wordweave-admin", RUNTIME / "wordweave-admin")
        copy_atomic(backup / "frontend-output", RUNTIME / "frontend/.output")
        control.start()
        record({"result": "ROLLED_BACK", "action": "failed_switch", "backup": str(backup)})
        raise


def rollback():
    selected = paths()
    backup = Path(selected["backup"])
    control = load_control()
    assert_idle()
    stop_apps(control)
    copy_atomic(backup / "wordweave", RUNTIME / "wordweave")
    copy_atomic(backup / "wordweave-admin", RUNTIME / "wordweave-admin")
    copy_atomic(backup / "frontend-output", RUNTIME / "frontend/.output")
    copy_atomic(backup / "public.json", RUNTIME / "public.json")
    result = control.start()
    print(json.dumps({"result": result, "restored_from": str(backup)}))


if __name__ == "__main__":
    if len(sys.argv) != 2 or sys.argv[1] not in {"switch", "rollback"}:
        raise SystemExit("usage: runtime_refresh.py switch|rollback")
    {"switch": switch, "rollback": rollback}[sys.argv[1]]()
