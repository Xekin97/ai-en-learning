---
milestone: M003
stage: technical-design
review_status: PASS
decision_id: TRANSITION-M003-068
date: 2026-10-12
scope: CR-306 定向回溯；仅建议 technical-design → product-planning / product-maya，不改变状态
---

# CR-306 自定义请求参数产品回溯门禁

## 当前状态

- 当前：M003 / `technical-design` / `backend-architect/base` / `backend-alex` / `active`。
- 当前技术恢复由 `TRANSITION-M003-067` 激活，CR306-BE 尚未完成；本次不要求其提交未完成技术产物。
- 控制检查实例：`gatekeeper-owen`；锁定路由为 requested `gpt-5.6-terra` / `medium`，运行时 serving metadata 未证实，`actual_model: unknown`。
- 锁定 Profile：[consumer-ai-web@1.0.0](evidence/start/locked-profile.yaml)，不迁移 Profile 或 v1 路由。
- 本次是 CR-306 候选设计的定向产品回溯，不代表技术阶段完成、修复有效、新视觉获批、实现获批、QA 通过或用户 UAT 通过。

## 原始专业产物

- [最新用户方向：CR-306 自定义请求参数简化](requirements-feedback.md#cr-306-自定义请求参数简化user-m003-custom-parameters)
- [当前 PRODUCT08 交接](../handoffs/product.md)
- [PRODUCT08 D3-10](../product/overview.md#d3-10)
- [PRODUCT08 CAP-306 与 AC-317–322](../product/abilities.md#cap-306)
- [CR-306 原故障、责任表与未验证边界](../changes/CR-306.md#cr306-product-repair)
- [067 后端先行门禁](cr306-product-gate-067.md)
- [模型推理配置调研与真实 UAT 证据边界](../verification/model-reasoning-research.md)

## 条件检查

| 条件 | 结果 | 证据或结论 |
|---|---|---|
| 当前状态与回溯目标合法 | PASS | 当前为 `technical-design`；锁定 Profile 允许返回 `product-planning`。 |
| 目标语义角色可恢复 | PASS | `product-maya` 已注册且唯一；其激活及状态写入留给 root 机械同步。 |
| 用户方向与确认闭环 | PASS | 用户已明确要求模型级自定义请求参数 JSON，取代 PRODUCT08 中平台专用推理模式/强度、能力目录刷新与动态能力选项的候选方向；无需重复索取同一委派。 |
| 回溯责任阶段准确 | PASS | 此变更影响模型管理交互、可观察业务边界与 AC-317–322 的产品候选定义，应先由 `product-maya` 定向同步，再独立回交后端。 |
| 未完成后端工作不构成缺项 | PASS | CR306-BE 仅在进行中；用户已要求回溯，且旧 typed+目录候选已暂停固化。不得以未完成技术产物阻止本次产品回溯。 |
| 既有约束保留 | PASS | 自定义参数不得覆盖模型 ID、`messages`、流式开关、业务输出结构或凭据；不得成为任意 URL、headers、密钥、新供应商或模型购买的配置入口。共同规划、返修预算、Q02、配额、无历史数据迁移与原故障证据继续有效。 |
| 原件与历史可恢复 | PASS | PRODUCT08 修订前源包、原 180 秒超时与三次有限诊断均保留；CR-302、CR-306 继续 open。 |
| 新视觉和后续门禁 | PASS | 自定义 JSON 方向不批准新页面或控件视觉；完整页面、M002 基准正式设计及用户视觉评审仍是后续前置条件。 |
| 阻塞决策 | PASS（无当前阻塞） | JSON 允许范围、体积/深度限制、合并冲突、存储、错误映射及后端适配属于后续专业收敛；仅新增业务权益、费用上限、供应商策略或超出既有安全边界的能力才须回用户确认。 |

## 精确单步目标

建议 root 仅机械同步以下单步，不在本记录中执行：

```yaml
operation: transition-stage
decision_id: TRANSITION-M003-068
from: technical-design
to: product-planning
active_role: product/to-c
active_agent: product-maya
status: active
current_handoff: .planning/milestones/M002-legacy-M003/handoffs/product.md
authorized_by:
  - USER-M003-CUSTOM-PARAMETERS
  - USER-M003-CR306-REPAIR
scope: >
  Bounded CR-306 product update only: replace PRODUCT08's typed per-platform
  reasoning/capability-directory candidate with a model-level custom request-parameters
  JSON candidate and its observable boundaries. Preserve CR-306 evidence and all
  subsequent independent gates.
```

`product-maya` 仅同步受影响的 PRODUCT08 候选设计、页面责任、验收追踪与交接边界；不得代写后端 JSON 合并、安全校验、存储或适配细则，也不得宣称自定义参数已经保存、生效或修复真实超时。

## 受依赖约束的后续交接

1. PRODUCT08 定向同步完成后，独立门禁才将更新后的产品输入回交 `backend-alex`。
2. 后端先定义受限参数合同、冲突规则、请求快照、失败与格式边界，并提供 DB/UI 所需接收合同；不得借参数绕过既有业务 schema、密钥、模型、消息或流式约束。
3. 后端合同完成后，按依赖决定 DB 接收与完整页面原型/正式设计；新视觉必须经用户评审。
4. 仅在用户接受新视觉且各自实施门禁通过后，才可进入前后端定向实现；随后独立 QA 与有界真实复验，最后由用户执行 UAT。

以上后续均未在本次门禁获批。