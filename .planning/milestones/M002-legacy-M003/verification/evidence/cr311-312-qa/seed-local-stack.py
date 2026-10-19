"""Seed only the QA103-owned fresh database."""
import http.cookiejar
import json
import os
from pathlib import Path
import secrets
import subprocess
import urllib.error
import urllib.request

HERE = Path(__file__).resolve().parent
work = Path((HERE / "local-stack-location.txt").read_text())
assert work.name.startswith("ww-cr311-312-qa103-")
public = json.loads((work / "public.json").read_text())
env = json.loads((work / "env.json").read_text())
assert "/wordweave_cr311_312_qa103?" in env["APP_DATABASE_URL"]


def client():
    return urllib.request.build_opener(urllib.request.ProxyHandler({}), urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))


def call(opener, path, data=None, method=None):
    headers = {"origin": public["frontend_origin"], "sec-fetch-site": "same-origin"}
    if data is not None:
        headers["x-csrf-token"] = call(opener, "/bootstrap")["data"]["csrf_token"]
        headers["content-type"] = "application/json"
    request = urllib.request.Request(public["api_origin"] + "/api/v1" + path, data=json.dumps(data).encode() if data is not None else None, headers=headers, method=method)
    try:
        with opener.open(request, timeout=30) as response:
            raw = response.read()
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as error:
        body = error.read().decode()
        raise RuntimeError(f"{error.code} {path} {body}") from None


admin = client()
call(admin, "/auth/login", {"username": env["ADMIN_USERNAME"], "password": env["ADMIN_PASSWORD"], "browser_ui_locale": "en-US"})
models = {}
for mode in ["pass", "q02"]:
    records = call(admin, "/admin/models")["data"]
    body = {
        "expected_revision": records["revision"], "display_name": f"QA103 local {mode}",
        "description": "Synthetic local QA provider; never contacts a real model", "provider_model_id": f"synthetic/{mode}",
        "output_mode": "json_schema", "max_output_tokens": None, "custom_parameters": {}, "enabled": True,
        "connection_id": None, "connection": {"name": f"QA103 disposable {mode}", "protocol": "openai_chat", "base_url": f"http://127.0.0.1:{public['provider_port']}", "api_key": "qa103-local-only"},
    }
    created = call(admin, "/admin/models", body)["data"]
    models[mode] = created["model"]["id"]
    if not created["model"]["enabled"]:
        call(admin, f"/admin/models/{models[mode]}/enable", {"expected_revision": created["revision"]})

for code in ["visitor", "basic", "pro", "plus"]:
    groups = call(admin, "/admin/groups")["data"]
    group = next(item for item in groups["items"] if item["code"] == code)
    repair_limit = 1 if code == "pro" else 2 if code == "plus" else 0
    call(admin, f"/admin/groups/{code}", {
        "expected_revision": groups["revision"], "priority": group["priority"], "max_entries": 8,
        "rolling_24h_limit": 100, "model_ids": list(models.values()), "allowed_lengths": ["short"],
        "content_review_enabled": repair_limit > 0, "content_repair_limit": repair_limit,
    }, "PUT")

accounts = {}
for code in ["basic", "pro"]:
    username = f"qa103_{code}"
    password = secrets.token_urlsafe(20)
    learner = client()
    call(learner, "/auth/register", {"username": username, "password": password, "password_confirmation": password, "ui_locale": "en-US"})
    accounts[code] = {"username": username, "password": password}
    if code == "pro":
        subprocess.run(["/opt/homebrew/opt/postgresql@18/bin/psql", env["APP_DATABASE_URL"], "-X", "-v", "ON_ERROR_STOP=1", "-c", "UPDATE wordweave.accounts SET group_code='pro' WHERE username='qa103_pro'"], check=True, stdout=subprocess.DEVNULL)

env["QA_ACCOUNTS"] = accounts
(work / "env.json").write_text(json.dumps(env))
os.chmod(work / "env.json", 0o600)
public["models"] = models
(work / "public.json").write_text(json.dumps(public, indent=2))
(HERE / "local-stack-public.json").write_text(json.dumps(public, indent=2) + "\n")
(HERE / "local-stack-seed.json").write_text(json.dumps({"result": "PASS", "models": models, "groups": ["visitor:0", "basic:0", "pro:1", "plus:2"], "accounts": list(accounts), "synthetic_only": True}, indent=2) + "\n")
print(json.dumps({"result": "PASS", "models": models, "credentials_file": str(work / "env.json")}))
