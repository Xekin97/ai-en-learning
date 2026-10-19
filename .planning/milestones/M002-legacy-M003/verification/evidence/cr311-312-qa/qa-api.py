"""Independent real API/SSE/DB checks for CR311/312 on the owned QA stack."""
import http.cookiejar
import json
from pathlib import Path
import subprocess
import time
import urllib.error
import urllib.parse
import urllib.request

HERE = Path(__file__).resolve().parent
work = Path((HERE / "local-stack-location.txt").read_text())
assert work.name.startswith("ww-cr311-312-qa103-")
public = json.loads((work / "public.json").read_text())
env = json.loads((work / "env.json").read_text())
API = public["api_origin"] + "/api/v1"
ORIGIN = public["frontend_origin"]
BLOCKED = ["i", "me", "you", "he", "him", "she", "her", "it", "we", "us", "they", "them", "my", "mine", "your", "yours", "his", "hers", "its", "our", "ours", "their", "theirs", "a", "an", "the", "be", "am", "is", "are", "was", "were", "been", "being", "and", "or", "but", "so", "yes", "no", "yeah"]


class Client:
    def __init__(self):
        self.opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))

    def request(self, path, data=None, method=None, headers=None, timeout=30):
        request_headers = {"origin": ORIGIN, "sec-fetch-site": "same-origin", **(headers or {})}
        if data is not None:
            request_headers["content-type"] = "application/json"
            request_headers.setdefault("x-csrf-token", self.request("/bootstrap")["data"]["csrf_token"])
        request = urllib.request.Request(API + path, data=json.dumps(data, ensure_ascii=False).encode() if data is not None else None, headers=request_headers, method=method)
        try:
            with self.opener.open(request, timeout=timeout) as response:
                raw = response.read()
                return json.loads(raw) if raw else None
        except urllib.error.HTTPError as error:
            return {"http_error": error.code, "body": json.loads(error.read())}

    def login(self, username, password):
        response = self.request("/auth/login", {"username": username, "password": password, "browser_ui_locale": "en-US"})
        assert "http_error" not in response, response

    def stream(self, payload):
        csrf = self.request("/bootstrap")["data"]["csrf_token"]
        request = urllib.request.Request(API + "/generations/stream", data=json.dumps(payload, ensure_ascii=False).encode(), headers={"origin": ORIGIN, "sec-fetch-site": "same-origin", "content-type": "application/json", "x-csrf-token": csrf}, method="POST")
        started_at = time.monotonic()
        events = []
        current_event = None
        token = None
        body_complete_status = []
        with self.opener.open(request, timeout=90) as response:
            for raw_line in response:
                line = raw_line.decode().rstrip("\r\n")
                if line.startswith("event:"):
                    current_event = line[6:].strip()
                elif line.startswith("data:") and current_event:
                    data = json.loads(line[5:].strip())
                    item = {"event": current_event, "data": data, "elapsed_ms": round((time.monotonic() - started_at) * 1000, 1)}
                    events.append(item)
                    if current_event == "generation.started":
                        token = data["generation_token"]
                    if current_event == "generation.draft" and data["action"] == "body_complete" and token:
                        body_complete_status.append(self.request(f"/generations/{events[0]['data']['run_id']}/status", headers={"x-generation-token": token}))
                    current_event = None
        return {"events": events, "body_complete_status": body_complete_status}


result = {"scope": "fresh PG18 + current Go backend + deterministic local provider; no live provider, old UAT, article-quality or migration claim", "checks": {}, "failures": [], "observations": {}, "flows": {}}


def check(name, passed, detail=None):
    result["checks"][name] = {"pass": bool(passed), "detail": detail}
    if not passed:
        result["failures"].append(name)


visitor = Client()
search_rows = {}
for entry in BLOCKED:
    for query in [entry, entry.upper()]:
        response = visitor.request("/vocabulary/search?q=" + urllib.parse.quote(query) + "&limit=20")
        items = [item["entry"] for item in response["data"]["items"]]
        search_rows[query] = items
        check("search_excludes_exact_" + query, entry not in [item.lower() for item in items], items)

allowed = {}
for entry in ["art", "go", "theater", "another"]:
    response = visitor.request("/vocabulary/search?q=" + entry + "&limit=20")
    items = [item["entry"] for item in response["data"]["items"]]
    allowed[entry] = items
    check("allowed_exact_" + entry, entry in items, items)

the_items = [item["entry"] for item in visitor.request("/vocabulary/search?q=the&limit=20")["data"]["items"]]
check("query_the_keeps_substrings", "the" not in the_items and "theater" in the_items, {"q=the": the_items, "another_exact_checked_separately": allowed["another"]})

random_samples = []
for _ in range(40):
    random_response = visitor.request("/vocabulary/random", {"selected_entries": []})["data"]
    random_samples.append(random_response)
check("random_samples_exclude_catalogue", all(not item.get("entry") or item["entry"].lower() not in BLOCKED for item in random_samples), random_samples)
old_selected_random = visitor.request("/vocabulary/random", {"selected_entries": ["the"]})
check("old_selected_the_not_rejected", "http_error" not in old_selected_random and old_selected_random["data"].get("entry") not in BLOCKED, old_selected_random)
result["observations"]["search_rows"] = search_rows
result["observations"]["allowed_rows"] = allowed
result["observations"]["the_query"] = the_items
result["observations"]["random_samples"] = random_samples

pro = Client()
pro.login(env["QA_ACCOUNTS"]["pro"]["username"], env["QA_ACCOUNTS"]["pro"]["password"])
bookshop_payload = {"model_id": public["models"]["pass"], "meaning_language": "en", "scenario": "story", "length": "short", "entries": ["wander", "gentle", "curious", "steady", "weave", "delight"]}
pass_flow = pro.stream(bookshop_payload)
q02_payload = {"model_id": public["models"]["q02"], "meaning_language": "en", "scenario": "story", "length": "short", "entries": ["the", "art"]}
q02_flow = pro.stream(q02_payload)
result["flows"]["pass"] = pass_flow
result["flows"]["q02_old_target"] = q02_flow


def names(flow):
    return [item["event"] for item in flow["events"]]


def terminal(flow):
    return next((item for item in flow["events"] if item["event"] in {"generation.validated", "generation.failed", "generation.cancelled"}), None)


pass_names = names(pass_flow)
pass_started = pass_flow["events"][0]
pass_terminal = terminal(pass_flow)
check("pass_contract_v6", pass_started["event"] == "generation.started" and pass_started["data"]["contract_version"] == "m003-stream-v6", pass_started)
check("pass_seq_contiguous", [item["data"]["seq"] for item in pass_flow["events"]] == list(range(1, len(pass_flow["events"]) + 1)), [item["data"]["seq"] for item in pass_flow["events"]])
check("pass_real_activity", {item["data"]["activity"] for item in pass_flow["events"] if item["event"] == "generation.activity"} == {"writing", "improving"}, [item for item in pass_flow["events"] if item["event"] == "generation.activity"])
check("pass_draft_lifecycle", all(required in pass_names for required in ["generation.draft", "generation.edit", "generation.validated"]) and any(item["data"].get("mode") == "initial" for item in pass_flow["events"] if item["event"] == "generation.draft") and any(item["data"].get("mode") == "replace" for item in pass_flow["events"] if item["event"] == "generation.draft") and any(item["data"].get("action") == "paragraph_complete" for item in pass_flow["events"] if item["event"] == "generation.draft"), [item for item in pass_flow["events"] if item["event"] in {"generation.draft", "generation.edit"}])
check("body_complete_not_save_ready", all(status["data"]["status"] == "active" and status["data"]["can_save"] is False for status in pass_flow["body_complete_status"][:-1]), pass_flow["body_complete_status"])
check("pass_validated_full_result", pass_terminal and pass_terminal["event"] == "generation.validated" and pass_terminal["data"]["result"] and pass_terminal["data"]["content_outcome"] == "review_passed", pass_terminal)
check("no_public_review_payload", not any("review" in item["event"] for item in pass_flow["events"]), pass_names)

q02_terminal = terminal(q02_flow)
q02_drafts = [item["data"] for item in q02_flow["events"] if item["event"] == "generation.draft"]
check("old_the_generation_accepted", q02_flow["events"][0]["event"] == "generation.started", q02_flow["events"][0])
check("q02_discard_restore", any(item.get("action") == "discard" for item in q02_drafts) and any(item.get("action") == "begin" and item.get("mode") == "restore" for item in q02_drafts) and q02_terminal and q02_terminal["data"].get("content_outcome") == "service_incomplete", {"drafts": q02_drafts, "terminal": q02_terminal})

provider_lines = [json.loads(line) for line in (work / "provider-calls.jsonl").read_text().splitlines() if line.strip()]
result["observations"]["provider_calls"] = provider_lines
check("provider_call_sequence_no_extra", [item["stage"] for item in provider_lines] == ["planning", "generation", "fixed_edit", "content_review", "planning", "generation", "fixed_edit", "content_review"], provider_lines)

sql = "SELECT coalesce(json_agg(json_build_object('status',call_status,'pipeline',pipeline_version_snapshot,'policy',content_policy_version,'outcome',content_outcome,'version',final_content_version) ORDER BY started_at),'[]'::json)::text FROM wordweave.generation_runs;"
db_rows = json.loads(subprocess.run(["/opt/homebrew/opt/postgresql@18/bin/psql", env["APP_DATABASE_URL"], "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-c", sql], capture_output=True, text=True, check=True).stdout.strip())
result["observations"]["db_runs"] = db_rows
check("persistent_pipeline_stays_v5", len(db_rows) == 2 and all(row["status"] == "valid" and row["pipeline"] == "m003-content-v5" and row["policy"] == 1 for row in db_rows), db_rows)

result["result"] = "PASS" if not result["failures"] else "FAIL"
(HERE / "api-results.json").write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
print(json.dumps({"result": result["result"], "checks": len(result["checks"]), "failures": result["failures"], "pass_events": len(pass_flow["events"]), "q02_events": len(q02_flow["events"]), "provider_calls": len(provider_lines)}))
raise SystemExit(0 if not result["failures"] else 1)
