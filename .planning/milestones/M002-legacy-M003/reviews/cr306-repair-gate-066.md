---
milestone: M003
stage: verification
review_status: PASS
decision_id: TRANSITION-M003-066
date: 2026-10-12
scope: CR-306 缺陷回溯；仅建议 verification → product-planning / product-maya，不改变状态
---

# CR-306 修复回溯门禁

## 当前状态

- 当前：M003 / `verification` / `quality/base` / `qa-quinn` / `awaiting_user_review`。
- 控制检查实例：`gatekeeper-owen`；语义名已由 `validate-agent-name.sh gatekeeper-owen` 验证。
- 锁定 Profile：[consumer-ai-web@1.0.0](evidence/start/locked-profile.yaml)，不采纳基座后续 Profile。
- 本控制任务的锁定路由为 requested `gpt-5.6-terra` / `medium`；运行时 serving metadata 未证实，`actual_model: unknown`。这不替代后续 `product-maya` 自身已登记的路由记录。
- 这是缺陷回溯，不是宣称 verification 已通过、用户 UAT 已通过或里程碑可升级。

## 原始专业产物

- [CR-306：真实模型规划超时与缺失推理参数](../changes/CR-306.md)
- [模型推理配置调研和真实 UAT 证据边界](../verification/model-reasoning-research.md)
- [CR-306 用户授权记录](requirements-feedback.md#cr-306-修复编排user-m003-cr306-repair)
- [当前 verification 交接](../handoffs/verification.md)
- [独立 QA 报告](../verification/report.md) 与 [待执行 UAT](../verification/uat.md)
- [CR-302 保留的下游待办](../changes/CR-302.md)

## 条件检查

| 条件 | 结果 | 证据或结论 |
|---|---|---|
| 锁定 Profile 与目标迁移合法 | PASS | Profile 1.0.0 允许 `verification → product-planning`；目标角色仅可为 `product/to-c`。 |
| 目标语义角色可恢复 | PASS | `product-maya` 已注册且唯一；其激活与状态写入留给 root 的机械同步。 |
| 当前 verification 原件齐全且保留 | PASS | 覆盖矩阵、报告、AI 验证、UAT、verification 交接均存在；不改写其 QA/UAT 边界。 |
| 用户授权及需求闭环 | PASS | `USER-M003-CR306-REPAIR` 明确以 CR-306 组织产品、技术、设计、实现和验收；无需重复索取同一回溯授权。 |
| 回溯责任阶段准确 | PASS | 缺陷涉及模型级配置、能力未知时交互、超时可见结果和验收定义，先回 `product-planning`；不由 gatekeeper 代写方案。 |
| 原件与既有范围保留 | PASS | CR-306 保持 open；CR-302 保持 `product_resolved_downstream_pending`，不被本回溯关闭或覆盖。规划、两类返修预算、低成本路径和无历史数据迁移约束继续有效。 |
| 真实调用授权边界 | PASS | 旧 mock 阶段限制已被本缺陷所必需的有界真实排障/定向验证授权覆盖；不扩展为质量批次、购买、部署或无限制调用。 |
| 阻塞决策 | PASS（无当前阻塞） | 供应商能力适配、未知能力处理和超时实现是后续专业设计事项。仅当提出未展示的业务扩展、费用上限、新供应商/模型策略或新的视觉结果时，才需向用户询问；例行实现细节不另设审批。 |

## 精确单步目标

建议 root 仅机械同步以下单步，不在本记录中执行：

```yaml
operation: transition-stage
decision_id: TRANSITION-M003-066
from: verification
to: product-planning
active_role: product/to-c
active_agent: product-maya
status: active
current_handoff: .planning/milestones/M002-legacy-M003/handoffs/product.md
authorized_by: USER-M003-CR306-REPAIR
```

`product-maya` 只接收 CR-306 的产品范围、管理台交互和验收边界收敛；不得把调研建议、真实诊断样本或本门禁当作产品、技术、视觉或实现完成。

## 受依赖约束的后续顺序

1. 产品回溯完成后，独立门禁再交技术设计；后端架构先行，处理模型配置、能力适配、请求快照、超时与验证边界。
2. 以后端输入为准制作完整页面原型与正式设计，并保持 M002 视觉基准；新视觉结果必须先给用户评审。
3. 用户接受该视觉结果后，分别经过实施门禁进入实现；随后独立 QA 验证修复，再由用户执行相应真实 UAT。

以上均为后续受依赖门禁，未在本次通过，也不改变当前已保留的 QA 结论或 UAT 状态。