"""Read-only design verification; writes one unfrozen report before delivery freeze.

Run from product root. Does not connect to PostgreSQL or execute application tests.
Refuses to replace a frozen report. Source assertions verify documentation claims,
not the future correctness of SQL, concurrency, or application implementation.
"""
from pathlib import Path
from datetime import datetime, timezone
import hashlib
import json
import re
import subprocess
import yaml

root = Path.cwd()
base = root / ".planning/milestones/M002"
ev = base / "technical/evidence"
assert not (ev / "M002-DB-01-manifest.json").exists(), "frozen evidence is immutable"
plan_path = base / "technical/database.md"
handoff_path = base / "handoffs/database.md"
plan = plan_path.read_text()
handoff = handoff_path.read_text()
inputs = json.loads((ev / "M002-DB-01-inputs.json").read_text())


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def metadata(text):
    return yaml.safe_load(text.split("---", 2)[1])


def expand_ids(text, prefix):
    result = set()
    for match in re.finditer(prefix + r"-(\d{3})((?:[–/\-]\d{3})*)", text):
        current = int(match[1])
        result.add(f"{prefix}-{current:03}")
        for op, number in re.findall(r"([–/\-])(\d{3})", match[2]):
            end = int(number)
            values = range(current, end + 1) if op in "–-" else [end]
            result.update(f"{prefix}-{value:03}" for value in values)
            current = end
    return result


checks = []


def check(name, condition, detail):
    checks.append({"check": name, "status": "PASS" if condition else "FAIL", "detail": detail})


state = yaml.safe_load((root / ".planning/workflow/state.yaml").read_text())
agents = yaml.safe_load((root / ".planning/agt/agents.yaml").read_text())["agents"]
check("role_and_stage", state["stage"] == "technical-design" and
      state["active_role"] == "dba/base" and state["active_agent"] == "dba-diana" and
      any(a["display_name"] == "dba-diana" and a["status"] == "active" for a in agents),
      "Uses TRANSITION-M002-008; no role switch")
check("draft_review_state", all(metadata(t)["status"] == "awaiting_user_review" for t in [plan, handoff]) and
      metadata(plan)["open_questions"] == [], "Design proposed; recorded requirement clarifications closed")

changed = [path for path, sha in inputs["protected_sha256"].items()
           if not (root / path).is_file() or digest(root / path) != sha]
check("protected_inputs_unchanged", not changed,
      {"protected_files": len(inputs["protected_sha256"]), "changed": changed})

assets = set(re.findall(r"DATA-\d{3}", (base / "product/data-assets.md").read_text()))
mapped_assets = set(re.findall(r"^\| (DATA-\d{3}) \|", plan, re.M))
expected_caps = {value.upper() for value in re.findall(r'<a id="(cap-\d{3})"',
                                                     (base / "product/abilities.md").read_text())}
mapped_caps = expand_ids(plan, "CAP")
check("data_asset_mapping", mapped_assets == assets and len(assets) == 32,
      {"expected": sorted(assets), "mapped": sorted(mapped_assets), "replacement_index": "DATA-015"})
check("capability_references", mapped_caps == expected_caps and len(expected_caps) == 49,
      {"missing": sorted(expected_caps - mapped_caps), "unknown": sorted(mapped_caps - expected_caps),
       "count": len(mapped_caps), "scope": "ID coverage, not functional acceptance"})

deferred = {ev / name for name in ["M002-DB-01-check.json", "M002-DB-01-manifest.json", "M002-DB-01.tar.gz"]}
bad_links = []
link_count = 0
for path, content in [(plan_path, plan), (handoff_path, handoff)]:
    for link in re.findall(r"\]\(([^)]+)\)", content):
        if link.startswith(("https://", "http://")):
            continue
        location, _, anchor = link.partition("#")
        target = (path.parent / location).resolve()
        link_count += 1
        if not target.exists():
            if target not in deferred:
                bad_links.append({"from": str(path), "link": link})
        elif anchor and target.is_file():
            original = target.read_text()
            if f'id="{anchor}"' not in original:
                bad_links.append({"from": str(path), "link": link, "reason": "explicit anchor missing"})
check("local_links", not bad_links, {"links": link_count, "failures": bad_links,
                                    "deferred_delivery_artifacts": [str(p.relative_to(root)) for p in sorted(deferred)]})

vocab = root / "backend/assets/vocabulary/english-words.json"
words = json.loads(vocab.read_text())
check("existing_vocabulary_fact", len(words) == len(set(words)) == 13860 and len(vocab.read_bytes()) == 144527 and
      digest(vocab) == "de75e77fdff529b4e6726730c80c11415abbce215ec7852a6c4a670b061dea75",
      "Read-only file count/bytes/hash; no database measurement")
table_names = []
for sql in sorted((root / "backend/db/migrations").glob("*.sql")):
    table_names.extend(re.findall(r"CREATE TABLE(?: IF NOT EXISTS)? wordweave\.(\w+)", sql.read_text()))
check("existing_schema_fact", len(table_names) == 23, {"declared_tables": table_names, "live_schema": "not_read"})

check("requirement_corrections_recorded", all(value in plan for value in [
    "DB2-Q01 / CORRECTED", "DB2-Q02 / CONFIRMED", "DB2-Q03 / CONFIRMED", "当前浏览器 IndexedDB",
    "不在 PostgreSQL 建逐题答案草稿表", "采用基础与体验分别记账", "90 天（推荐）"]),
    "Local draft scope corrected; separate quota and 90-day analytics explicitly confirmed")
check("no_stale_pending_semantics", not any(value in plan for value in [
    "DB2-Q02 / OPEN", "DB2-Q03 / OPEN", "DB2-Q03 未答复", "CREATE TABLE review_drafts"]),
    "Withdrawn cross-device scope not frozen as an execution requirement")
check("verification_scope_marked", all(value in plan for value in [
    "没有连接运行数据库", "本轮只做文档与源码事实核对", "DB2-V16", "独立新会话接收未执行"]),
    "Migration/concurrency/performance/recovery remain planned, not passed")
check("retained_items", all(value in plan and value in handoff for value in [
    "CR039-L1", "CR042-L1", "AI-QUALITY-90", "CAP-209", "USER-COMPAT-001", "USER-CLAIM-DELETE-001"]),
    "Existing constraints and unresolved product verification remain reachable")

selected = [base / "product/overview.md", base / "product/data-assets.md", base / "product/abilities.md",
            base / "decisions/product-decisions.md", base / "handoffs/uiux.md",
            root / ".planning/milestones/M001/technical/database.md"]
report = {
    "version": "M002-DB-01", "agent_name": "dba-diana",
    "status": "PASS" if all(c["status"] == "PASS" for c in checks) else "FAIL",
    "checked_at": datetime.now(timezone.utc).isoformat(),
    "method": "Read-only structural/source/link/hash verification plus in-document design analysis; no SQL/runtime tests",
    "checks": checks,
    "source_sha256": {str(p.relative_to(root)): digest(p) for p in [plan_path, handoff_path]},
    "planning_footprint": {
        "selected_full_file_characters": {str(p.relative_to(root)): len(p.read_text()) for p in selected},
        "plan_characters": len(plan), "handoff_characters": len(handoff),
        "unit": "Unicode characters, static file size only; selected files sometimes read by section",
        "actual_runtime_input_tokens": "unknown", "actual_usage": "unknown",
        "over_soft_budget_reason": "32 data indices / 49 capabilities and prior schema, ownership, lifecycle and concurrency inheritance"
    },
    "not_executed": ["database_connection", "SQL_migrations", "application_changes", "runtime_tests",
                     "concurrency_tests", "EXPLAIN", "restore_drill", "independent_handoff_session", "live_AI", "deployment"],
    "workflow_controls_modified": False, "profile_modified": False, "approved": False,
    "initial_check_note": "Initial verification marker expected 未连接 rather than the document's 没有连接; corrected literal matcher. Original FAIL retained in M002-DB-01-check-initial.json. No design scope changed for this correction.",
}
(ev / "M002-DB-01-check.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
print(json.dumps({"status": report["status"], "checks": len(checks), "data_indices": len(assets),
                  "capability_references": len(expected_caps), "local_links": link_count,
                  "changed_protected_files": changed}, ensure_ascii=False))
raise SystemExit(0 if report["status"] == "PASS" else 1)
