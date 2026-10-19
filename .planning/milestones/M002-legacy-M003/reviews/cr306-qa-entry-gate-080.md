---
milestone: M003
reviewer: gatekeeper-owen
decision_id: TRANSITION-M003-080
operation: transition-stage
result: PASS
profile: consumer-ai-web@1.0.0
routing: v1
requested_model: gpt-5.6-terra
requested_reasoning: medium
actual_model: unknown
---

# CR-306 Implementation → 独立 QA 入场门禁

## 决定

**PASS。** [USER-M003-CR306-QA-NEXT](requirements-feedback.md#cr-306-接收实施提交并进入独立-qauser-m003-cr306-qa-next) 已接受当前开发提交并授权进入独立 QA。关闭 `CR306-IMPLEMENTATION-REVIEW`，单步迁移至 `verification / quality/base / qa-quinn / active`。

本决定只激活 QA；不表示 QA 已通过、CR-306 已关闭、用户 UAT 已完成或生产已就绪。

## 核对结果

| 条件 | 结果 | 原件 |
|---|---|---|
| 当前状态与目标迁移合法 | PASS | [工作流状态](../../../workflow/state.yaml) 为 `implementation / frontend-claire / awaiting_user_review`，允许迁移至 verification。 |
| 目标 QA 角色合法且唯一 | PASS | [角色注册表](../../../agt/agents.yaml) 中 `quality/base / qa-quinn` 注册唯一；锁定请求为 `gpt-5.6-sol/high`，实际服务模型未知。 |
| 后端与前端当前提交齐备 | PASS | [后端交接](../handoffs/backend-implementation.md)、[前端交接](../handoffs/frontend-implementation.md)、[后端验证摘要](../implementation/evidence/cr306-backend/verification-summary.json)、[前端验证摘要](../implementation/evidence/cr306-frontend/verification-summary.json)。 |
| 当前技术、设计与 API 输入可追溯 | PASS | TECH04、BE07、DB04、FE03、API306、UI10-R1.1 与其 compact-byte 澄清均由 078/079 当前原件引用；旧 QA02 仅保留为 TECH03/CR304/305 基线。 |
| 开发提交已被独立接收 | PASS | [078](cr306-backend-handoff-gate-078.md)、[079](cr306-implementation-submission-gate-079.md) 及 079 的源码/视觉接收回执。 |
| 真实复测权限有明确且有限来源 | PASS | `USER-M003-CR306-REPAIR` 已覆盖旧 mock 阶段限制；新 QA 授权仅允许有界真实排障与验证，不扩展为质量批次、换模型、部署或产品变更。 |
| 数据、现有 UAT 与安全边界明确 | PASS | 仅隔离空库、正式隔离 backend/frontend 与临时安全载入的选定连接配置；不得修改现有 3013/54673/54672 服务、库或真实配置，不归档凭据。 |
| 当前阻塞 | PASS | 无 QA 入场阻塞；QA 发现的合同或实现缺陷应由控制流程回交对应 owner，不自动改生产代码或跨阶段。 |

## QA 授权边界

QA 应先验证确定性 API/UI/原子性/快照/生成失败边界，再进行少量有界完整链路复测：

- 首先按原游客场景进行一次指定 OpenRouter 模型完整链路；
- 仅在必要时补充增强与预览受影响路径；
- 使用隔离空库、正式隔离 backend/frontend、临时凭据载入与安全清理；
- 保持流程 `N≤2`，`N99` 仅配置/静态边界；
- 保留 180/600、Q02、取消、pending、结算未知及实际失败记录；
- 不以 probe 成功替代完整生成，不开展质量批次、模型替换、部署、历史迁移或用户 UAT。

## 机械同步字段

```yaml
operation: transition-stage
decision_id: TRANSITION-M003-080
result: PASS
from:
  stage: implementation
  active_role: frontend-implementer/base
  active_agent: frontend-claire
  status: awaiting_user_review
to:
  stage: verification
  active_role: quality/base
  active_agent: qa-quinn
  runtime_id: /root/qa_quinn_cr306
  requested_model: gpt-5.6-sol
  requested_reasoning: high
  actual_model: unknown
  status: active
current_handoff: .planning/milestones/M002-legacy-M003/handoffs/verification.md
close_pending_user_decision:
  id: CR306-IMPLEMENTATION-REVIEW
  resolution: accepted_by_USER-M003-CR306-QA-NEXT
authorized_by:
  - USER-M003-CR306-REPAIR
  - USER-M003-CR306-IMPLEMENT-NEXT
  - USER-M003-CR306-QA-NEXT
qa_scope:
  inputs:
    - M003-TECH-04
    - M003-BE-07
    - M003-DB-04
    - M003-FE-03
    - M003-UI-10-R1.1
    - M003-CR306-BACKEND-IMPL
    - M003-CR306-FRONTEND-IMPL
  may_file_defects: true
  may_modify_production_code: false
  may_advance_stage: false
  real_validation: bounded_selected_openrouter_only
  prohibited:
    - quality_batch
    - alternate_model_selection
    - deployment
    - historical_migration
    - existing_uat_service_database_or_configuration_mutation
    - credential_logging_or_archival
cr306_status: open
```