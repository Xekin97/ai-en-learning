"""Capture one five-entry v6 flow from the owned real Go stack for client replay."""
import http.cookiejar
import json
from pathlib import Path
import time
import urllib.request

HERE = Path(__file__).resolve().parent
WORK = Path((HERE / "local-stack-location.txt").read_text())
PUBLIC = json.loads((WORK / "public.json").read_text())
ENV = json.loads((WORK / "env.json").read_text())
API = PUBLIC["api_origin"] + "/api/v1"
ORIGIN = PUBLIC["frontend_origin"]
opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))


def request(path, data=None, headers=None):
    supplied = {"origin": ORIGIN, "sec-fetch-site": "same-origin", **(headers or {})}
    if data is not None:
        supplied["content-type"] = "application/json"
        supplied["x-csrf-token"] = request("/bootstrap")["data"]["csrf_token"]
    req = urllib.request.Request(API + path, data=json.dumps(data).encode() if data is not None else None, headers=supplied, method="POST" if data is not None else "GET")
    with opener.open(req, timeout=90) as response:
        raw = response.read()
        return json.loads(raw) if raw else None


account = ENV["QA_ACCOUNTS"]["pro"]
request("/auth/login", {"username": account["username"], "password": account["password"], "browser_ui_locale": "en-US"})
payload = {
    "model_id": PUBLIC["models"]["pass"], "meaning_language": "en",
    "scenario": "story", "length": "short",
    "entries": ["wander", "gentle", "curious", "steady", "weave"],
}
csrf = request("/bootstrap")["data"]["csrf_token"]
req = urllib.request.Request(API + "/generations/stream", data=json.dumps(payload).encode(), headers={"origin": ORIGIN, "sec-fetch-site": "same-origin", "content-type": "application/json", "x-csrf-token": csrf}, method="POST")
events = []
current = None
started = time.monotonic()
with opener.open(req, timeout=90) as response:
    for raw in response:
        line = raw.decode().rstrip("\r\n")
        if line.startswith("event:"):
            current = line[6:].strip()
        elif line.startswith("data:") and current:
            events.append({"event": current, "data": json.loads(line[5:].strip()), "elapsed_ms": round((time.monotonic() - started) * 1000, 1)})
            current = None
terminal = next((item for item in events if item["event"] in {"generation.validated", "generation.failed", "generation.cancelled"}), None)
result = {
    "source": "owned fresh PostgreSQL + current Go backend + deterministic local provider",
    "synthetic_content": True, "payload": payload, "events": events,
    "result": "PASS" if terminal and terminal["event"] == "generation.validated" else "FAIL",
}
(HERE / "actual-replay-wire.json").write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
print(json.dumps({"result": result["result"], "events": len(events), "terminal": terminal and terminal["event"]}))
raise SystemExit(0 if result["result"] == "PASS" else 1)
