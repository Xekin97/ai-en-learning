---
milestone: M003
stage: verification
review_status: PASS
decision_id: TRANSITION-M003-104
date: 2026-10-14
---

# CR311/312 真实 UAT3015 准备角色再激活门禁

## 当前状态

`M003 / verification / quality/base / qa-quinn / awaiting_user_review`。

本次仅同阶段重新激活 `quality/base / qa-quinn / active`，以准备受保护的真实 UAT3015；不迁移里程碑或授予用户验收。

## 原始产物

- [QA07 交接](../handoffs/verification.md)
- [QA07 报告](../verification/report.md)
- [QA07 覆盖矩阵](../verification/coverage-matrix.md)
- [当前 UAT 清单](../verification/uat.md)
- [QA07 证据清单](../verification/evidence/cr311-312-qa/evidence-manifest.json)
- [QA07 提交回执](evidence/cr311-312-qa-entry-103/qa-submission-receipt.json)
- [104 用户授权](evidence/cr311-312-uat-entry-104/user-next.json)
- [104 控制面与 QA 原件前快照](evidence/cr311-312-uat-entry-104/before.tar.gz)

## 条件检查

| 条件 | 结果 | 依据 |
|---|---|---|
| QA07 原件与证据可接收 | PASS | QA07 为 PASS；回执核验 49 项 evidence manifest、990 项保护文件、所需 verification 原件哈希及 QA-owned 端口清理，无 manifest mismatch。 |
| 当前版本 UAT 状态准确 | PASS | QA07 明确 CR-311/312 当前 UAT3015 仍为旧版本、`not_run_for_current_version`；历史 096 接受未被扩大为本增量接受。 |
| 用户授权与范围 | PASS | `USER-M003-CR311312-UAT-NEXT-20261014` 精确授权以已保存真实模型、无 mock 刷新现有 3015 并作非生成 readiness，随后交用户验收。 |
| 真实运行时保护 | PASS | 授权限定保留现有 PG/schema/data/accounts/model config/custom parameters/user-added models，禁止迁移、reset、seed、provider 配置改动及其他 3013/3014/4174 服务操作。 |
| 凭据与调用边界 | PASS | 必要私密环境仅可在 QA 后续进程内消费且不得输出/归档；默认不自动生成、probe 或产生 provider 费用，保留用户手动 Generate。 |
| UAT 准备前置动作 | PASS | 104 的 public access/control/QA docs 已冻结；QA 在任何停止/重启前仍必须创建自有运行时 before snapshot、确认无活动用户生成，并仅重启必要 frontend/backend。 |
| 角色与模型锁 | PASS | `qa-quinn` 名称有效且唯一；104 catalog 支持 `gpt-5.6-sol/high`，实际 serving model unknown；Profile1.0 和 routing-v1 未迁移。 |
| 阻塞项 | 无 | 当前没有阻止限定 UAT 准备角色再激活的缺项。 |

## 控制结论

允许同阶段 `activate-role`：qa-quinn 仅可准备并刷新当前本地真实 UAT3015 的已测试 CR-311/312 backend/frontend，再执行非生成 readiness 并交用户验收。QA07 功能 PASS 不等于用户 UAT、CR 关闭或里程碑完成。

## 机械同步字段

```yaml
operation: activate-role
decision_id: TRANSITION-M003-104
result: PASS
from:
  stage: verification
  active_role: quality/base
  active_agent: qa-quinn
  status: awaiting_user_review
to:
  stage: verification
  active_role: quality/base
  active_agent: qa-quinn
  status: active
  current_handoff: .planning/milestones/M002-legacy-M003/handoffs/verification.md
state:
  required_artifacts: unchanged
  allowed_transitions: unchanged
project:
  milestone: M003
  status: active
registry:
  qa-quinn:
    status: active
    requested_model: gpt-5.6-sol
    requested_effort: high
    actual_model: unknown
verification_context:
  CR-311_CR-312: qa07_pass_uat3015_preparation_active
  user_uat: not_run_for_current_version
  pre_restart_required:
    - owned_runtime_before_snapshot
    - verify_no_active_user_generation
  allowed_work:
    - refresh_tested_backend_and_frontend_only
    - non_generating_real_service_readiness
    - leave_3015_running_for_user
  runtime_preservation:
    - database_schema_data_accounts
    - saved_models_custom_parameters_and_user_added_models
    - 3013_3014_4174_services
open_change_requests:
  - CR-311
  - CR-312
authorization_refs:
  - USER-M003-CR311312-QA-NEXT-20261014
  - USER-M003-CR311312-UAT-NEXT-20261014
preserve:
  - TRANSITION-M003-096 historical acceptance
  - QA07 original evidence and historical fault records
  - resolved CR-302/306/307/309/310
  - retained limitations and QA article-quality/model-miss boundary
  - consumer-ai-web@1.0.0
  - codex-balanced@1.0.0 model-routing-v1
not_approved:
  - user_UAT_acceptance
  - CR-311_or_CR-312_closure
  - milestone_completion
  - automatic_generation_or_provider_probe
  - provider_configuration_change
  - database_migration_reset_or_seed
  - commit_push_or_remote_deployment
```
