---
milestone: M003
stage: product-planning
review_status: PASS
decision_id: TRANSITION-M003-067
date: 2026-10-12
scope: CR-306 定向回溯；仅建议 product-planning → technical-design / backend-alex，不改变状态
---

# CR-306 产品修订→后端架构门禁

## 当前状态

- 当前：M003 / `product-planning` / `product/to-c` / `product-maya` / `active`。
- 控制检查实例：`gatekeeper-owen`；`gatekeeper-owen` 与目标实例 `backend-alex` 均已通过语义名验证。
- 锁定 Profile：[consumer-ai-web@1.0.0](evidence/start/locked-profile.yaml)。其常规下一阶段为 UI/UX；本次仅依据用户已确认的 CR-306 后台先行顺序作定向恢复，不迁移或修改 Profile。
- 本控制任务路由为 requested `gpt-5.6-terra` / `medium`；运行时 serving metadata 未证实，`actual_model: unknown`。
- 本次是 CR-306 缺陷回溯中的单步技术设计接收，不代表产品、技术、视觉、实现、QA、真实复验或用户 UAT 已通过。

## 原始专业产物

- [PRODUCT08 交接](../handoffs/product.md)
- [D3-10 产品范围与未决去向](../product/overview.md#d3-10)
- [DATA-306](../product/data-assets.md#data-306)
- [CAP-306 与 AC-317–322](../product/abilities.md#cap-306)
- [CR-306 推理与业务规划边界](../product/ai-behavior.md#cr306-reasoning)
- [受影响完整页面范围](../product/pages/index.md#cr306-pages)
- [CR-306 责任、顺序与完成条件](../changes/CR-306.md#顺序责任与完成条件交接任务不自行激活角色)
- [产品静态检查证据](../product/evidence/cr306/check.json)
- [用户授权记录](requirements-feedback.md#cr-306-修复编排user-m003-cr306-repair)
- [066 回溯门禁](cr306-repair-gate-066.md)

## 条件检查

| 条件 | 结果 | 证据或结论 |
|---|---|---|
| PRODUCT08 原件齐全 | PASS | 六份产品阶段原件及交接均为 `M003-PRODUCT-08`；静态证据记录版本、哈希、92 条本地链接及原锚点核对。 |
| 需求确认与授权 | PASS | `USER-M003-CR306-REPAIR` 已明确授权组织模型推理配置与真实生成超时修复；无需重复询问同一修复委派或例行后端细节。 |
| 回溯目标与责任匹配 | PASS | CR306-BE 明确先由 `backend-alex` 定义模型配置、能力状态、适配、快照、超时/失败/结算及验证合同。 |
| 常规 Profile 顺序例外 | PASS（受限） | Profile 的常规 `product-planning` 后续为 UI/UX；但用户已明确后台先行，且 066 已记录本次受依赖顺序。该例外只允许本次 CR306-BE 定向恢复，不改变 Profile、也不构成对后续阶段的预批准。 |
| 技术阶段目标角色可用 | PASS | `backend-alex` 已注册且唯一，为 `backend-architect/base`；激活和状态写入留给 root 机械同步。 |
| 产品范围与既有事项保留 | PASS | CR-306 保持 open；CR-302 保持 `product_resolved_downstream_pending`。共同规划、增强固定编辑/审稿、两类返修预算、Q02、低成本约束与无历史数据迁移均未被覆盖。 |
| 原故障与验证边界保留 | PASS | 原 180 秒规划超时、三次有限诊断及费用 unknown 均保留；PRODUCT08 静态检查不冒充真实调用、浏览器、数据库或业务验证。 |
| 新视觉及实现门槛 | PASS | 后端合同完成后才交完整页面原型及 M002 基准正式设计；新视觉仍须用户评审，随后才可进入对应前端架构与实施门禁。 |
| 阻塞决策 | PASS（无当前阻塞） | 供应商能力识别、未知能力处理、参数映射、缓存、时限与错误码属于 `backend-alex` 的授权内专业收敛。仅新的业务权益、费用上限或供应商策略取舍须回产品并向用户确认。 |

## 精确单步目标

建议 root 仅机械同步以下单步，不在本记录中执行：

```yaml
operation: transition-stage
decision_id: TRANSITION-M003-067
from: product-planning
to: technical-design
active_role: backend-architect/base
active_agent: backend-alex
status: active
current_handoff: .planning/milestones/M002-legacy-M003/handoffs/backend-architecture.md
authorized_by:
  - USER-M003-CR306-REPAIR
  - USER-M003-STREAM-FIRST
scope: >
  Bounded CR306-BE backend-first technical recovery only. Define model configuration,
  capability/unknown handling, supported provider adaptation, request snapshot,
  structured-output constraints, no-business-content timeout/failure/settlement,
  minimal diagnostics and receiving fixtures for AC-317–321.
```

技术阶段的既有原件仅作为历史基线和接收输入；本同步不将其宣布为 CR-306 已更新、技术阶段整体验收通过或可进入实现。

## 受依赖约束的后续交接

1. `backend-alex` 完成 CR306-BE 并交出受影响后端/API/AI 原件、失败 fixture 与 DB/UI 接收合同。
2. 如后端确认存在持久化差异，由 `dba-diana` 定向处理未发布 schema；无差异则提交可追踪接收结论。不得迁移、回填、重置现有 UAT 数据。
3. `designer-tony` 依后端字段、状态与 fixture 更新完整页面原型及 M002 基准正式设计，并将新视觉结果提交用户评审。
4. 用户接受新视觉后，`frontend-bob` 才接收前端架构工作；随后各实施角色经独立实施门禁进入定向实现。
5. `qa-quinn` 在实施交接后独立执行确定性回归与有界真实完整链路复验；仅其证据可提出 CR-306 关闭建议，之后仍须用户 UAT。

以上后续均未在本次门禁获批。