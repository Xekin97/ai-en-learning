---
milestone: M003
reviewer: gatekeeper-owen
decision_id: TRANSITION-M003-081
operation: transition-stage
result: PASS
profile: consumer-ai-web@1.0.0
routing: v1
requested_model: gpt-5.6-terra
requested_reasoning: medium
actual_model: unknown
---

# CR-307 焦点缺陷 → 前端定向返修入场门禁

## 决定

**PASS。** CR-307 具备独立 QA 的可复现失败事实、明确责任归属和最小返修范围。按 `USER-M003-CR306-QA-NEXT` 已授权的缺陷修复/定向复验范围，单步回交 `frontend-claire`。

本次不请求重复修复许可，不改产品、视觉、后端 API 或部署/UAT 边界；CR-306 与 CR-307 均保持 `open`，不表示缺陷已修复或 QA 已通过。

## 核对结果

| 条件 | 结果 | 原件 |
|---|---|---|
| 当前 QA 状态与回交迁移合法 | PASS | [工作流状态](../../../workflow/state.yaml) 为 `verification / quality/base / qa-quinn / active`，允许返回 implementation。 |
| 返修 owner 合法且唯一 | PASS | [角色注册表](../../../agt/agents.yaml) 中 `frontend-implementer/base / frontend-claire` 唯一且已注册。 |
| 失败可在真实页面环境复现 | PASS | [CR-307](../changes/CR-307.md)、[QA 浏览器原始结果](../verification/evidence/cr306-qa/browser.json)：1440×900 与 390×844 均在第 14 次 Tab 后焦点逃逸至 `BODY`。 |
| 保存后的焦点恢复失败明确 | PASS | 同一原始结果中两视口的 `focusStateAfterSave.tag` 均为 `BODY`，未回到精确“编辑服务商” opener。 |
| 预期合同、责任和位置明确 | PASS | [UIA-M003-416.r1](../design/design-spec.md)、[交互合同](../design/interactions.md)：Tab/Shift+Tab 必须留在最上层，关闭后回精确 opener；责任归属现有 `AppDialog`/模型页前端实现。 |
| 未受影响事实已分离 | PASS | top layer/遮罩、内部滚动、固定头尾、错误聚焦与原文保留、late probe、四入口 dirty confirm、移动布局、保存读回与零 provider 调用均通过；不需重画布局或全面重构。 |
| 授权边界与后续复验路径明确 | PASS | `USER-M003-CR306-QA-NEXT` 已允许已批准合同的缺陷修复与定向复验；QA 暂候，修复提交后须独立单步回 verification。 |

## 定向返修范围

仅允许：

- 为最上层 `AppDialog` 实现 Tab/Shift+Tab 焦点循环；
- 嵌套 dirty-confirm 打开时只约束当前最上层，关闭确认后恢复父框正确触发点；
- 保存导致 DOM 重取或重渲染后，以稳定身份恢复原“编辑服务商” opener；
- 补充必要的隔离源码/build 定向验证。

不得修改 JSON 业务规则、保存/probe/API/BE 合同、UI10-R1.1 结构或视觉、真实 UAT、数据库、凭据、模型调用范围或部署。原 QA 失败原件、冻结包与共享 dirty 工作区均须保留。

## 机械同步字段

```yaml
operation: transition-stage
decision_id: TRANSITION-M003-081
result: PASS
from:
  stage: verification
  active_role: quality/base
  active_agent: qa-quinn
  status: active
to:
  stage: implementation
  active_role: frontend-implementer/base
  active_agent: frontend-claire
  requested_model: gpt-5.6-sol
  requested_reasoning: high
  actual_model: unknown
  status: active
current_handoff: .planning/milestones/M002-legacy-M003/handoffs/frontend-implementation.md
authorized_by:
  - USER-M003-CR306-QA-NEXT
  - TRANSITION-M003-080
scope: >
  CR307 only: repair top-layer Tab/Shift+Tab focus containment and exact opener
  restoration after save/close in the existing AppDialog/model-editor lifecycle;
  preserve nested dirty confirmation and all approved UI10-R1.1 behavior.
qa_status: awaiting_targeted_reverification
preserve_evidence:
  - .planning/milestones/M002-legacy-M003/verification/evidence/cr306-qa/browser.json
  - .planning/milestones/M002-legacy-M003/changes/CR-307.md
prohibited:
  - product_or_visual_redesign
  - backend_or_api_contract_change
  - real_model_or_paid_call
  - uat_database_or_configuration_change
  - historical_migration
  - deployment
cr306_status: open
cr307_status: open
next_controlled_step: frontend CR307 submission, then qa-quinn targeted re-verification
```