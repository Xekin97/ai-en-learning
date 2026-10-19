"""Independent CR306 management API checks against the QA080 disposable stack."""

import http.cookiejar
import json
import os
from pathlib import Path
import time
import urllib.error
import urllib.request


HERE = Path(__file__).resolve().parent
STACK = Path(os.environ.get("CR306_QA_STACK", "/tmp/wordweave-cr306-qa080-backend"))
PUBLIC = json.loads((STACK / "public.json").read_text())
ENV = json.loads((STACK / "env.json").read_text())
assert PUBLIC["database_name"] == "wordweave_cr306_qa080"
assert PUBLIC["frontend_origin"] == "http://127.0.0.1:54713"
API = PUBLIC["api_origin"] + "/api/v1"
ORIGIN = PUBLIC["frontend_origin"]
CALL_LOG = STACK / "provider-calls.jsonl"


class Client:
    def __init__(self):
        self.opener = urllib.request.build_opener(
            urllib.request.ProxyHandler({}),
            urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()),
        )

    def request(self, path, data=None, method=None, raw=None, timeout=30):
        headers = {"origin": ORIGIN, "sec-fetch-site": "same-origin"}
        body = raw
        if data is not None or raw is not None:
            headers["content-type"] = "application/json"
            headers["x-csrf-token"] = self.request("/bootstrap")["json"]["data"]["csrf_token"]
            if body is None:
                body = json.dumps(data, ensure_ascii=False, separators=(",", ":")).encode()
        request = urllib.request.Request(API + path, data=body, headers=headers, method=method)
        try:
            response = self.opener.open(request, timeout=timeout)
            raw_body = response.read()
            parsed = json.loads(raw_body) if raw_body else None
            return {"status": response.status, "headers": dict(response.headers), "json": parsed}
        except urllib.error.HTTPError as error:
            raw_body = error.read()
            return {
                "status": error.code,
                "headers": dict(error.headers),
                "json": json.loads(raw_body) if raw_body else None,
            }

    def login(self, username, password):
        result = self.request(
            "/auth/login",
            {"username": username, "password": password, "browser_ui_locale": "en-US"},
        )
        assert result["status"] == 200, result["status"]


def provider_call_count():
    if not CALL_LOG.exists():
        return 0
    return sum(1 for line in CALL_LOG.read_text().splitlines() if line.strip())


def compact_problem(result):
    body = result.get("json") or {}
    return {
        "status": result["status"],
        "code": body.get("code"),
        "field_errors": body.get("field_errors"),
        "context": body.get("context"),
    }


RESULT = {
    "scope": "Independent formal HTTP API against a new PostgreSQL 18 current-schema database and synthetic upstream; no real-provider or production-capacity claim.",
    "environment": {
        "api_origin": PUBLIC["api_origin"],
        "frontend_origin": ORIGIN,
        "database_policy": PUBLIC["schema_initialization"],
        "source_commit": "45a4ab123c3308fa0a83868b6030c6b84a96f67d",
    },
    "checks": {},
    "problems": {},
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


def providers():
    answer = admin.request("/admin/model-providers")
    assert answer["status"] == 200
    return answer["json"]["data"]


initial = providers()
initial_calls = provider_call_count()
run_tag = os.environ.get("CR306_QA_RUN_TAG", str(int(time.time())))
unique = "qa080-independent-" + run_tag
connection = {
    "name": "QA080 independent provider",
    "protocol": "openai_chat",
    "base_url": f"http://127.0.0.1:{PUBLIC['provider_port']}",
    "api_key": "synthetic-qa080-independent-key",
}
models = [
    {
        "id": None,
        "display_name": "QA isolated A",
        "description": "Independent parameter isolation check",
        "provider_model_id": f"synthetic/{unique}-a",
        "output_mode": "prompt",
        "max_output_tokens": 512,
        "custom_parameters": {"temperature": 0.15, "reasoning": {"enabled": False}},
        "enabled": False,
    },
    {
        "id": None,
        "display_name": "QA isolated B",
        "description": "Independent empty-object check",
        "provider_model_id": f"synthetic/{unique}-b",
        "output_mode": "prompt",
        "max_output_tokens": None,
        "custom_parameters": {},
        "enabled": False,
    },
]
workspace = {"connection": connection, "expected_revision": initial["revision"], "models": models}

# The same direct write is forbidden to a signed-in non-admin before any provider activity.
forbidden = basic.request("/admin/model-providers", workspace, "POST")
check("non_admin_write_rejected", forbidden["status"] == 403, compact_problem(forbidden))

# A missing second object rejects the whole aggregate without changing revision or calling upstream.
missing = json.loads(json.dumps(workspace))
del missing["models"][1]["custom_parameters"]
missing_result = admin.request("/admin/model-providers", missing, "POST")
RESULT["problems"]["missing_aggregate_member"] = compact_problem(missing_result)
after_missing = providers()
missing_fields = (missing_result.get("json") or {}).get("field_errors") or []
check(
    "aggregate_missing_member_atomic",
    missing_result["status"] == 422
    and missing_fields == [{"field": "/models/1/custom_parameters", "code": "required"}]
    and after_missing["revision"] == initial["revision"]
    and len(after_missing["items"]) == len(initial["items"])
    and provider_call_count() == initial_calls,
)

# Successful save/readback proves per-model isolation and the exact empty-object meaning.
created = admin.request("/admin/model-providers", workspace, "POST")
check("provider_create_success", created["status"] == 201, created["status"])
created_data = (created.get("json") or {}).get("data") or {}
provider = created_data.get("provider") or {}
provider_id = (provider.get("connection") or {}).get("id")
saved_models = provider.get("models") or []
custom_by_model = {item.get("provider_model_id"): item.get("custom_parameters") for item in saved_models}
check(
    "model_parameters_isolated_and_empty_exact",
    custom_by_model
    == {
        f"synthetic/{unique}-a": {"temperature": 0.15, "reasoning": {"enabled": False}},
        f"synthetic/{unique}-b": {},
    },
    custom_by_model,
)
readback = providers()
read_provider = next((item for item in readback["items"] if item["connection"]["id"] == provider_id), None)
check(
    "provider_readback_equal",
    read_provider is not None
    and {
        item["provider_model_id"]: item["custom_parameters"] for item in read_provider["models"]
    }
    == custom_by_model,
)
save_calls = provider_call_count()
check("all_saves_zero_provider_calls", save_calls == initial_calls, {"before": initial_calls, "after": save_calls})

# A stale aggregate PATCH cannot partially overwrite either model.
stale_workspace = json.loads(json.dumps(workspace))
stale_workspace["models"] = []
for item in saved_models:
    stale_workspace["models"].append(
        {
            "id": item["id"],
            "display_name": item["display_name"],
            "description": item["description"],
            "provider_model_id": item["provider_model_id"],
            "output_mode": item["output_mode"],
            "max_output_tokens": item["max_output_tokens"],
            "custom_parameters": {"temperature": 0.99},
            "enabled": item["enabled"],
        }
    )
stale_workspace["connection"]["api_key"] = ""
stale = admin.request(f"/admin/model-providers/{provider_id}", stale_workspace, "PATCH")
RESULT["problems"]["stale_revision"] = compact_problem(stale)
after_stale = providers()
stale_provider = next(item for item in after_stale["items"] if item["connection"]["id"] == provider_id)
check(
    "stale_revision_preserves_all_models",
    stale["status"] == 409
    and (stale.get("json") or {}).get("code") == "revision_conflict"
    and {item["provider_model_id"]: item["custom_parameters"] for item in stale_provider["models"]}
    == custom_by_model
    and provider_call_count() == save_calls,
)


def single_model_body(custom_parameters):
    current = providers()
    return {
        "display_name": "QA invalid boundary",
        "description": "Must never persist",
        "provider_model_id": "synthetic/qa080-invalid-" + run_tag,
        "output_mode": "prompt",
        "max_output_tokens": None,
        "custom_parameters": custom_parameters,
        "enabled": False,
        "expected_revision": current["revision"],
        "connection": connection,
    }


# Depth 8 is the approved inclusive boundary and must survive save/readback.
depth8 = {"a": {"b": {"c": {"d": {"e": {"f": {"g": {"h": 1}}}}}}}}
depth8_body = single_model_body(depth8)
depth8_body["provider_model_id"] = "synthetic/qa080-depth8-" + run_tag
depth8_saved = admin.request("/admin/models", depth8_body, "POST")
check(
    "depth8_inclusive_boundary_saved",
    depth8_saved["status"] == 201
    and depth8_saved["json"]["data"]["model"]["custom_parameters"] == depth8
    and provider_call_count() == save_calls,
    depth8_saved["status"],
)

invalid_cases = {
    "array_root": ([], 422, "validation_failed", "object_required"),
    "null_root": (None, 422, "validation_failed", "required"),
    "protected_model": ({"model": "other"}, 422, "custom_parameter_conflict", "protected_field"),
    "controlled_max_tokens": ({"max_tokens": 2}, 422, "custom_parameter_conflict", "protected_field"),
    "nested_headers": ({"vendor": {"headers": {"x": "y"}}}, 422, "custom_parameter_conflict", "protected_field"),
    "nul_value": ({"note": "\u0000"}, 422, "validation_failed", "unsupported_character"),
    "too_deep": ({"a": {"b": {"c": {"d": {"e": {"f": {"g": {"h": {"i": 1}}}}}}}}}, 422, "validation_failed", "too_deep"),
    "too_large": ({"note": "a" * 17000}, 422, "validation_failed", "too_large"),
}
invalid_start = providers()
for name, (value, status, problem_code, field_code) in invalid_cases.items():
    response = admin.request("/admin/models", single_model_body(value), "POST")
    compact = compact_problem(response)
    RESULT["problems"][name] = compact
    fields = compact["field_errors"] or []
    check(
        "reject_" + name,
        compact["status"] == status
        and compact["code"] == problem_code
        and len(fields) == 1
        and fields[0]["code"] == field_code,
        compact,
    )

# Duplicate-key rejection uses the raw request, before ordinary map decoding can erase evidence.
duplicate_body = single_model_body({"placeholder": True})
raw_duplicate = json.dumps(duplicate_body, separators=(",", ":")).replace(
    '"custom_parameters":{"placeholder":true}',
    '"custom_parameters":{"reasoning":{"enabled":false,"enabled":true}}',
).encode()
duplicate = admin.request("/admin/models", method="POST", raw=raw_duplicate)
RESULT["problems"]["duplicate_key"] = compact_problem(duplicate)
duplicate_fields = (duplicate.get("json") or {}).get("field_errors") or []
check(
    "reject_duplicate_key_with_pointer",
    duplicate["status"] == 400
    and (duplicate.get("json") or {}).get("code") == "invalid_json"
    and duplicate_fields
    == [{"field": "/custom_parameters/reasoning/enabled", "code": "duplicate_key"}],
    compact_problem(duplicate),
)

# The aggregate transport ceiling is distinct from a model's 16 KiB semantic ceiling.
oversized = b'{"padding":"' + (b"a" * ((2 << 20) + 256)) + b'"}'
too_large_request = admin.request("/admin/model-providers", method="POST", raw=oversized)
RESULT["problems"]["aggregate_request_too_large"] = compact_problem(too_large_request)
check(
    "aggregate_413_is_form_level",
    too_large_request["status"] == 413
    and (too_large_request.get("json") or {}).get("code") == "request_too_large"
    and not ((too_large_request.get("json") or {}).get("field_errors") or []),
    compact_problem(too_large_request),
)
invalid_end = providers()
check(
    "all_invalid_writes_atomic_and_zero_call",
    invalid_end["revision"] == invalid_start["revision"]
    and len(invalid_end["items"]) == len(invalid_start["items"])
    and provider_call_count() == save_calls,
)

# A deterministic explicit probe is the only upstream call in this script. Its 422 remains visible.
reject_id = PUBLIC["models"]["probe-reject"]
reject_model_answer = admin.request("/admin/models/" + reject_id)
assert reject_model_answer["status"] == 200
reject_model = reject_model_answer["json"]["data"]["model"]
probe_body = {
    "display_name": reject_model["display_name"],
    "description": reject_model["description"],
    "provider_model_id": reject_model["provider_model_id"],
    "output_mode": reject_model["output_mode"],
    "max_output_tokens": reject_model["max_output_tokens"],
    "custom_parameters": reject_model["custom_parameters"],
    "enabled": reject_model["enabled"],
    "connection_id": reject_model["connection"]["id"],
    "connection": None,
    "expected_revision": invalid_end["revision"],
}
probe_before = provider_call_count()
probe = admin.request("/admin/model-connection-test", probe_body, "POST")
probe_after = provider_call_count()
RESULT["problems"]["explicit_probe_rejected"] = compact_problem(probe)
check(
    "upstream_rejection_is_explicit_without_retry",
    probe["status"] == 422
    and (probe.get("json") or {}).get("code") == "model_request_rejected"
    and (probe.get("json") or {}).get("context") == {"upstream_status": 422}
    and probe_after == probe_before + 1,
    compact_problem(probe),
)
post_probe = admin.request("/admin/models/" + reject_id)["json"]["data"]["model"]
check(
    "rejected_probe_does_not_delete_parameters",
    post_probe["custom_parameters"] == {"qa_reject": True},
    post_probe["custom_parameters"],
)

RESULT["reused_developer_evidence"] = {
    "compact_byte_exact_vectors": ".planning/milestones/M003/technical/fixtures/cr306/compact-byte-vectors.json consumed by implementation checks; QA independently sampled semantic too_large and transport 413 rather than rerunning unit tests",
    "three_protocol_empty_object_and_openrouter_route_matrix": ".planning/milestones/M003/implementation/evidence/cr306-backend/05-cr306-integration-final.log",
}
RESULT["result"] = "PASS" if not RESULT["failures"] else "FAIL"
(HERE / "deterministic-api.json").write_text(json.dumps(RESULT, ensure_ascii=False, indent=2) + "\n")
print(json.dumps({"result": RESULT["result"], "checks": len(RESULT["checks"]), "failures": RESULT["failures"]}))
raise SystemExit(0 if RESULT["result"] == "PASS" else 1)
