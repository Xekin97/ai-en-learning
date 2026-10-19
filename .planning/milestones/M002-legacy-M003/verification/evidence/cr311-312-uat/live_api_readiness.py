#!/usr/bin/env python3
"""Non-generating API readiness against the real UAT3015 origin."""
import json
import os
import sys
from datetime import datetime
from pathlib import Path

RUNTIME = Path("/tmp/wordweave-m003-uat-real-003")
sys.path.insert(0, str(RUNTIME))
from api import Client  # noqa: E402

BLOCKED = [
    "i", "me", "you", "he", "him", "she", "her", "it", "we", "us", "they", "them",
    "my", "mine", "your", "yours", "his", "hers", "its", "our", "ours", "their", "theirs",
    "a", "an", "the", "be", "am", "is", "are", "was", "were", "been", "being",
    "and", "or", "but", "so", "yes", "no", "yeah",
]


def entries(client, query):
    return [item["entry"] for item in client.q(f"/vocabulary/search?q={query}&limit=20")["data"]["items"]]


def main():
    private = json.loads((RUNTIME / "private-env.json").read_text())
    checks = []
    visitor = Client()
    bootstrap = visitor.q("/bootstrap")
    assert bootstrap["data"]["actor"]["kind"] == "visitor"
    options = visitor.q("/generation-options")["data"]
    assert options["effective_plan"]["code"] == "visitor" and options["models"]
    checks.append({"case": "visitor_bootstrap_and_generation_options", "result": "PASS", "model_count": len(options["models"])})

    for word in BLOCKED:
        assert word not in [entry.casefold() for entry in entries(visitor, word)], word
    assert "the" not in [entry.casefold() for entry in entries(visitor, "THE")]
    checks.append({"case": "search_exact_41_entry_exclusion_case_insensitive", "result": "PASS", "queries": len(BLOCKED) + 1})

    allowed = {}
    for word in ["art", "go", "theater", "another"]:
        found = entries(visitor, word)
        assert word in [entry.casefold() for entry in found], word
        allowed[word] = True
    assert "theater" in [entry.casefold() for entry in entries(visitor, "the")]
    checks.append({"case": "legitimate_short_and_substring_candidates", "result": "PASS", "entries": allowed})

    samples = []
    for _ in range(30):
        item = visitor.q("/vocabulary/random", {"selected_entries": []})["data"]
        value = item.get("entry") if isinstance(item, dict) else item
        assert value and value.casefold() not in BLOCKED
        samples.append(value)
    checks.append({"case": "random_candidate_exclusion_sample", "result": "PASS", "samples": len(samples), "blocked_seen": 0})

    roles = {}
    for role in ["BASIC", "PRO"]:
        client = Client()
        client.login(private[f"{role}_USERNAME"], private[f"{role}_PASSWORD"])
        role_options = client.q("/generation-options")["data"]
        roles[role.lower()] = {
            "password_login": True,
            "effective_plan": role_options["effective_plan"]["code"],
            "visible_model_count": len(role_options["models"]),
            "content_service": role_options["content_service"],
        }
    assert roles["basic"]["effective_plan"] == "basic"
    assert roles["pro"]["effective_plan"] == "pro"
    checks.append({"case": "real_password_api_login_basic_pro", "result": "PASS", "roles": roles})

    admin = Client()
    admin.login(private["ADMIN_USERNAME"], private["ADMIN_PASSWORD"])
    models = admin.q("/admin/models")["data"]["items"]
    assert len(models) == 3
    safe_models = [{
        "display_name": item["display_name"],
        "provider_model_id": item["provider_model_id"],
        "enabled": item["enabled"],
        "output_mode": item["output_mode"],
        "max_output_tokens": item.get("max_output_tokens"),
        "custom_parameters": item.get("custom_parameters"),
        "provider_name": item["connection"]["name"],
        "protocol": item["connection"]["protocol"],
        "base_url": item["connection"]["base_url"],
        "credential_configured": item["connection"]["credential_configured"],
    } for item in models]
    checks.append({"case": "admin_real_password_login_and_models_read_only_preserved", "result": "PASS", "model_count": len(models)})

    result = {
        "result": "PASS", "checked_at": datetime.now().astimezone().isoformat(),
        "origin": "http://127.0.0.1:3015", "checks": checks, "safe_models": safe_models,
        "mock_services": 0, "api_interception": False, "real_generation_executed": False,
        "provider_probe_executed": False,
    }
    output = Path(__file__).with_name("live-api-readiness.json")
    output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    os.chmod(output, 0o600)
    print(json.dumps({"result": "PASS", "checks": len(checks), "model_count": len(models), "random_samples": len(samples)}))


if __name__ == "__main__":
    main()
