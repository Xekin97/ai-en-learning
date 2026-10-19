"""Independent CR306 snapshot, stage, failure, cancellation and settlement checks."""

import http.cookiejar
import json
import os
from pathlib import Path
import subprocess
import threading
import time
import urllib.error
import urllib.request


HERE = Path(__file__).resolve().parent
STACK = Path(os.environ.get("CR306_QA_STACK", "/tmp/wordweave-cr306-qa080-backend"))
PUBLIC = json.loads((STACK / "public.json").read_text())
ENV = json.loads((STACK / "env.json").read_text())
assert PUBLIC["database_name"] == "wordweave_cr306_qa080"
API = PUBLIC["api_origin"] + "/api/v1"
ORIGIN = PUBLIC["frontend_origin"]
CALL_LOG = STACK / "provider-calls.jsonl"
PG = "/opt/homebrew/opt/postgresql@18/bin/psql"


class Client:
    def __init__(self):
        self.opener = urllib.request.build_opener(
            urllib.request.ProxyHandler({}),
            urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()),
        )

    def request(self, path, data=None, method=None, headers=None, timeout=30):
        request_headers = {"origin": ORIGIN, "sec-fetch-site": "same-origin", **(headers or {})}
        if data is not None:
            request_headers["content-type"] = "application/json"
            request_headers.setdefault("x-csrf-token", self.request("/bootstrap")["json"]["data"]["csrf_token"])
        request = urllib.request.Request(
            API + path,
            data=json.dumps(data, ensure_ascii=False).encode() if data is not None else None,
            headers=request_headers,
            method=method,
        )
        try:
            response = self.opener.open(request, timeout=timeout)
            raw = response.read()
            return {
                "status": response.status,
                "headers": dict(response.headers),
                "json": json.loads(raw) if raw else None,
            }
        except urllib.error.HTTPError as error:
            raw = error.read()
            return {
                "status": error.code,
                "headers": dict(error.headers),
                "json": json.loads(raw) if raw else None,
            }

    def login(self, username, password):
        response = self.request(
            "/auth/login",
            {"username": username, "password": password, "browser_ui_locale": "zh-CN"},
        )
        assert response["status"] == 200, response["status"]

    def stream(self, payload, started_signal=None, timeout=80):
        csrf = self.request("/bootstrap")["json"]["data"]["csrf_token"]
        request = urllib.request.Request(
            API + "/generations/stream",
            data=json.dumps(payload, ensure_ascii=False).encode(),
            headers={
                "origin": ORIGIN,
                "sec-fetch-site": "same-origin",
                "x-csrf-token": csrf,
                "content-type": "application/json",
                "accept": "text/event-stream",
            },
            method="POST",
        )
        started_at = time.monotonic()
        try:
            response = self.opener.open(request, timeout=timeout)
        except urllib.error.HTTPError as error:
            raw = error.read()
            return {"status": error.code, "problem": json.loads(raw), "events": []}
        events = []
        current = None
        for raw_line in response:
            line = raw_line.decode().rstrip("\r\n")
            if line.startswith("event:"):
                current = line[6:].strip()
            elif line.startswith("data:"):
                elapsed_ms = round((time.monotonic() - started_at) * 1000)
                event = {"event": current, "data": json.loads(line[5:].strip()), "elapsed_ms": elapsed_ms}
                events.append(event)
                if current == "generation.started" and started_signal is not None:
                    started_signal["payload"] = event["data"]
                    started_signal["event"].set()
            elif not line:
                current = None
        return {"status": response.status, "headers": dict(response.headers), "events": events}


def provider_lines():
    if not CALL_LOG.exists():
        return []
    return [json.loads(line) for line in CALL_LOG.read_text().splitlines() if line.strip()]


def admin_revision(client):
    return client.request("/admin/model-providers")["json"]["data"]["revision"]


def update_model_parameters(client, model_id, custom_parameters):
    response = client.request("/admin/models/" + model_id)
    assert response["status"] == 200
    model = response["json"]["data"]["model"]
    body = {
        "display_name": model["display_name"],
        "description": model["description"],
        "provider_model_id": model["provider_model_id"],
        "connection_id": model["connection"]["id"],
        "connection": None,
        "max_output_tokens": model["max_output_tokens"],
        "output_mode": model["output_mode"],
        "custom_parameters": custom_parameters,
        "enabled": model["enabled"],
        "expected_revision": admin_revision(client),
    }
    result = client.request("/admin/models/" + model_id, body, "PATCH")
    assert result["status"] == 200, result
    return result["json"]["data"]["model"]


def event_summary(response):
    names = [event["event"] for event in response["events"]]
    started = next((event["data"] for event in response["events"] if event["event"] == "generation.started"), None)
    terminal = next(
        (
            event["data"]
            for event in response["events"]
            if event["event"] in {"generation.validated", "generation.failed", "generation.cancelled"}
        ),
        None,
    )
    first_plan = next((event["elapsed_ms"] for event in response["events"] if event["event"] == "generation.plan_item"), None)
    first_body = next((event["elapsed_ms"] for event in response["events"] if event["event"] == "generation.edit"), None)
    return {
        "status": response["status"],
        "event_names": names,
        "started": started,
        "terminal": terminal,
        "first_plan_item_ms": first_plan,
        "first_body_edit_ms": first_body,
    }


def psql_json(sql):
    completed = subprocess.run(
        [PG, ENV["APP_DATABASE_URL"], "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-c", sql],
        capture_output=True,
        text=True,
        check=True,
    )
    return json.loads(completed.stdout.strip())


RESULT = {
    "scope": "Formal backend + new PostgreSQL 18 current-schema database + deterministic synthetic provider; no real-provider quality or production-capacity claim.",
    "checks": {},
    "flows": {},
    "provider_calls": {},
    "failures": [],
}


def check(name, value, detail=None):
    RESULT["checks"][name] = {"pass": bool(value), "detail": detail}
    if not value:
        RESULT["failures"].append(name)


admin = Client()
admin.login(ENV["ADMIN_USERNAME"], ENV["ADMIN_PASSWORD"])
basic = Client()
basic.login(ENV["BASIC_USERNAME"], ENV["BASIC_PASSWORD"])
pro = Client()
pro.login(ENV["PRO_USERNAME"], ENV["PRO_PASSWORD"])
payload = {
    "meaning_language": "zh",
    "scenario": "story",
    "length": "short",
    # This existing deterministic provider vector has valid surface/position
    # annotations for these two entries. The original five-word sample is
    # reserved for the authorized real-model AC-321 run.
    "entries": ["grape", "young"],
}

# The first run binds A before planning. Configuration is changed to B while planning is in flight.
snapshot_id = PUBLIC["models"]["snapshot-slow"]
update_model_parameters(admin, snapshot_id, {"temperature": 0.15, "reasoning": {"enabled": True}})
snapshot_offset = len(provider_lines())
snapshot_holder = {}
snapshot_thread = threading.Thread(
    target=lambda: snapshot_holder.update(response=pro.stream({**payload, "model_id": snapshot_id})),
    daemon=True,
)
snapshot_thread.start()
deadline = time.monotonic() + 15
while time.monotonic() < deadline:
    observed = provider_lines()[snapshot_offset:]
    if any(item["model"] == "synthetic/snapshot-slow" and item["stage"] == "planning" for item in observed):
        break
    time.sleep(0.05)
else:
    raise RuntimeError("snapshot planning call was not observed")
update_model_parameters(admin, snapshot_id, {"temperature": 0.85, "reasoning": {"enabled": False}})
snapshot_thread.join(80)
if snapshot_thread.is_alive():
    raise RuntimeError("snapshot first run did not finish")
snapshot_first = event_summary(snapshot_holder["response"])
RESULT["flows"]["snapshot_first"] = snapshot_first
first_calls = [item for item in provider_lines()[snapshot_offset:] if item["model"] == "synthetic/snapshot-slow"]
RESULT["provider_calls"]["snapshot_first"] = first_calls
check(
    "inflight_run_keeps_original_parameters",
    [item["stage"] for item in first_calls] == ["planning", "generation", "fixed_edit", "content_review"]
    and all(item["temperature"] == 0.15 and item["reasoning_enabled"] is True for item in first_calls),
    first_calls,
)
check(
    "enhanced_pipeline_survives_parameter_binding",
    snapshot_first["terminal"] is not None
    and snapshot_first["terminal"].get("content_outcome") == "review_passed"
    and snapshot_first["first_plan_item_ms"] is not None
    and snapshot_first["first_body_edit_ms"] is not None,
)

# A later N0 run sees B and still executes common Plan -> Writer with no enhanced stages.
second_offset = len(provider_lines())
snapshot_second_response = basic.stream({**payload, "model_id": snapshot_id})
snapshot_second = event_summary(snapshot_second_response)
RESULT["flows"]["snapshot_second"] = snapshot_second
second_calls = [item for item in provider_lines()[second_offset:] if item["model"] == "synthetic/snapshot-slow"]
RESULT["provider_calls"]["snapshot_second"] = second_calls
check(
    "new_run_uses_updated_parameters",
    [item["stage"] for item in second_calls] == ["planning", "generation"]
    and all(item["temperature"] == 0.85 and item["reasoning_enabled"] is False for item in second_calls),
    second_calls,
)
check(
    "n0_keeps_common_plan_writer",
    snapshot_second["first_plan_item_ms"] is not None
    and snapshot_second["first_body_edit_ms"] is not None
    and snapshot_second["terminal"].get("content_outcome") == "basic",
)

# N=2 remains a real two-repair flow and the parameter object is stable across every task.
repair_id = PUBLIC["models"]["repair-mixed"]
repair_offset = len(provider_lines())
repair_response = pro.stream({**payload, "model_id": repair_id})
repair = event_summary(repair_response)
RESULT["flows"]["enhanced_n2"] = repair
repair_calls = [item for item in provider_lines()[repair_offset:] if item["model"] == "synthetic/repair-mixed"]
RESULT["provider_calls"]["enhanced_n2"] = repair_calls
expected_n2 = [
    "planning",
    "generation",
    "fixed_edit",
    "content_review",
    "content_repair",
    "content_review",
    "content_repair",
    "content_review",
]
check(
    "n2_executes_two_conditional_repairs",
    [item["stage"] for item in repair_calls] == expected_n2
    and all(item["temperature"] == 0.4 and item["reasoning_enabled"] is False for item in repair_calls)
    and repair["terminal"].get("content_outcome") == "limit_finalized",
    [item["stage"] for item in repair_calls],
)

# Q02 remains distinct: a last valid draft is deliverable and saveable after review failure.
q02_id = PUBLIC["models"]["q02"]
q02_offset = len(provider_lines())
q02_response = pro.stream({**payload, "model_id": q02_id})
q02 = event_summary(q02_response)
RESULT["flows"]["q02"] = q02
q02_calls = [item for item in provider_lines()[q02_offset:] if item["model"] == "synthetic/q02"]
RESULT["provider_calls"]["q02"] = q02_calls
q02_started = q02["started"]
q02_save = pro.request(
    "/generations/" + q02_started["run_id"] + "/save",
    {},
    "POST",
    {"X-Generation-Token": q02_started["generation_token"]},
)
check(
    "q02_keeps_last_valid_and_save",
    q02["terminal"].get("content_outcome") == "service_incomplete"
    and q02["terminal"].get("completion_notice") == "content_review_incomplete"
    and q02_save["status"] == 201,
    {"terminal": q02["terminal"], "save_status": q02_save["status"]},
)

# Fenced plan is never published as a real plan and writer is never invoked.
fenced_id = PUBLIC["models"]["fenced-plan"]
fenced_offset = len(provider_lines())
fenced_response = basic.stream({**payload, "model_id": fenced_id})
fenced = event_summary(fenced_response)
RESULT["flows"]["fenced_plan"] = fenced
fenced_calls = [item for item in provider_lines()[fenced_offset:] if item["model"] == "synthetic/fenced-plan"]
RESULT["provider_calls"]["fenced_plan"] = fenced_calls
fenced_started = fenced["started"]
fenced_status = basic.request(
    "/generations/" + fenced_started["run_id"] + "/status",
    headers={"X-Generation-Token": fenced_started["generation_token"]},
)
check(
    "fenced_plan_never_reaches_writer_or_save",
    [item["stage"] for item in fenced_calls] == ["planning"]
    and "generation.edit" not in fenced["event_names"]
    and fenced["terminal"].get("quota_refunded") is True
    and fenced_status["status"] == 200
    and fenced_status["json"]["data"]["status"] == "failed"
    and fenced_status["json"]["data"]["can_save"] is False
    and fenced_status["json"]["data"]["quota_refunded"] is True,
    {"calls": fenced_calls, "terminal": fenced["terminal"], "status": fenced_status.get("json")},
)

# A heartbeat-only accepted request exposes no false business progress and stays cancellable.
blocked_id = PUBLIC["models"]["blocked"]
blocked_signal = {"event": threading.Event(), "payload": None}
blocked_holder = {}
blocked_offset = len(provider_lines())
blocked_thread = threading.Thread(
    target=lambda: blocked_holder.update(
        response=basic.stream({**payload, "model_id": blocked_id}, blocked_signal, timeout=40)
    ),
    daemon=True,
)
blocked_thread.start()
if not blocked_signal["event"].wait(10):
    raise RuntimeError("blocked run did not reach started")
blocked_started = blocked_signal["payload"]
time.sleep(0.4)
cancel = basic.request(
    "/generations/" + blocked_started["run_id"] + "/cancel",
    {},
    "POST",
    {"X-Generation-Token": blocked_started["generation_token"]},
    timeout=20,
)
blocked_thread.join(30)
if blocked_thread.is_alive():
    raise RuntimeError("blocked stream did not close after cancellation")
blocked = event_summary(blocked_holder["response"])
RESULT["flows"]["heartbeat_cancel"] = blocked
blocked_calls = [item for item in provider_lines()[blocked_offset:] if item["model"] == "synthetic/blocked"]
RESULT["provider_calls"]["heartbeat_cancel"] = blocked_calls
check(
    "heartbeat_only_has_no_fake_plan_and_is_cancellable",
    [item["stage"] for item in blocked_calls] == ["planning"]
    and "generation.plan_item" not in blocked["event_names"]
    and "generation.edit" not in blocked["event_names"]
    and cancel["status"] == 200
    and cancel["json"]["data"]["status"] == "cancelled"
    and cancel["json"]["data"]["quota_refunded"] is False,
    {"events": blocked["event_names"], "cancel": cancel.get("json")},
)

run_ids = [
    snapshot_first["started"]["run_id"],
    snapshot_second["started"]["run_id"],
    repair["started"]["run_id"],
    q02["started"]["run_id"],
    fenced["started"]["run_id"],
    blocked_started["run_id"],
]
quoted = ",".join("'" + run_id + "'::uuid" for run_id in run_ids)
db = {
    "runs": psql_json(
        "SELECT coalesce(json_agg(row_to_json(x) ORDER BY x.started_at),'[]'::json) FROM ("
        "SELECT id::text,started_at,group_code_snapshot,content_repair_limit_snapshot,call_status,disposition,content_outcome,final_content_version,quota_charged,model_request_parameters_snapshot "
        "FROM wordweave.generation_runs WHERE id IN (" + quoted + ")) x"
    ),
    "calls": psql_json(
        "SELECT coalesce(json_agg(row_to_json(x) ORDER BY x.user_run_id,x.call_no),'[]'::json) FROM ("
        "SELECT user_run_id::text,call_no,call_stage,prompt_version,usage_status,provider_invoked,review_result,reason_codes,repair_requested "
        "FROM wordweave.ai_call_usage WHERE user_run_id IN (" + quoted + ")) x"
    ),
    "charges": psql_json(
        "SELECT coalesce(json_agg(row_to_json(x) ORDER BY x.run_id),'[]'::json) FROM ("
        "SELECT run_id::text,source_kind,plan_code,origin,units,state FROM wordweave.generation_charges WHERE run_id IN (" + quoted + ")) x"
    ),
}
(HERE / "deterministic-db-facts.json").write_text(json.dumps(db, ensure_ascii=False, indent=2) + "\n")

runs = {row["id"]: row for row in db["runs"]}
first_id = snapshot_first["started"]["run_id"]
second_id = snapshot_second["started"]["run_id"]
check(
    "db_snapshots_match_old_and_new_runs",
    runs[first_id]["model_request_parameters_snapshot"]["custom_parameters"]
    == {"temperature": 0.15, "reasoning": {"enabled": True}}
    and runs[second_id]["model_request_parameters_snapshot"]["custom_parameters"]
    == {"temperature": 0.85, "reasoning": {"enabled": False}},
    {"first": runs[first_id]["model_request_parameters_snapshot"], "second": runs[second_id]["model_request_parameters_snapshot"]},
)
charge_ids = {row["run_id"] for row in db["charges"]}
check(
    "one_charge_record_per_accepted_run",
    charge_ids == set(run_ids)
    and len(db["charges"]) == len(run_ids)
    and all(row["units"] == 1 for row in db["charges"]),
    db["charges"],
)

RESULT["result"] = "PASS" if not RESULT["failures"] else "FAIL"
def public_evidence(value):
    if isinstance(value, dict):
        clean = {key: public_evidence(item) for key, item in value.items() if key != "generation_token"}
        if "generation_token" in value:
            clean["generation_token_present"] = bool(value["generation_token"])
        return clean
    if isinstance(value, list):
        return [public_evidence(item) for item in value]
    return value

(HERE / "deterministic-pipeline.json").write_text(json.dumps(public_evidence(RESULT), ensure_ascii=False, indent=2) + "\n")
print(json.dumps({"result": RESULT["result"], "checks": len(RESULT["checks"]), "failures": RESULT["failures"]}))
raise SystemExit(0 if RESULT["result"] == "PASS" else 1)
