---
milestone: M003
stage: product-planning
review_status: PASS
decision_id: TRANSITION-M003-069
date: 2026-10-12
scope: CR-306 定向恢复；仅建议 product-planning → technical-design / backend-alex，不改变状态
---

# CR-306 自定义参数产品→后端架构门禁

## 当前状态

- 当前：M003 / `product-planning` / `product/to-c` / `product-maya` / `active`。
- 当前产品原件为 `M003-PRODUCT-09`；`TRANSITION-M003-068` 的定向回溯已完成。
- 控制检查实例：`gatekeeper-owen`；锁定路由为 requested `gpt-5.6-terra` / `medium`，运行时 serving metadata 未证实，`actual_model: unknown`。
- 锁定 Profile：[consumer-ai-web@1.0.0](evidence/start/locked-profile.yaml)，不迁移 Profile 或 v1 路由。
- 本次仅恢复 CR306-BE 技术设计工作，不代表整个技术阶段、视觉、DB、FE、实现、QA、真实复验或用户 UAT 已通过。

## 原始专业产物

- [PRODUCT09 当前交接](../handoffs/product.md)
- [D3-10：模型自定义请求参数](../product/overview.md#d3-10)
- [DATA-306](../product/data-assets.md#data-306)
- [CAP-306 与 AC-317–322](../product/abilities.md#cap-306)
- [受影响完整页面责任](../product/pages/index.md#cr306-pages)
- [AI 行为与不可绕过边界](../product/ai-behavior.md#cr306-reasoning)
- [PRODUCT09 静态检查](../product/evidence/cr306/custom-parameters-check.json)
- [CR-306 当前责任表与保留证据](../changes/CR-306.md#cr306-product-repair)
- [用户自定义请求参数方向](requirements-feedback.md#cr-306-自定义请求参数简化user-m003-custom-parameters)
- [068 产品回溯门禁](cr306-custom-parameters-gate-068.md)

## 条件检查

| 条件 | 结果 | 证据或结论 |
|---|---|---|
| PRODUCT09 当前入口齐全 | PASS | 六份产品阶段原件与交接均为 `M003-PRODUCT-09`；当前静态检查记录七份受影响原件、93 条本地链接及锚点核对通过。 |
| 用户方向与需求确认闭环 | PASS | `USER-M003-CUSTOM-PARAMETERS` 已确认每模型高级自定义请求参数 JSON，替代 PRODUCT08 的 typed 推理模式/强度与自动能力目录候选；不重复索取同一修复或简化方向授权。 |
| 安全及业务边界保留 | PASS | 参数不得覆盖凭据、模型 ID、`messages`、流式开关、业务输出 schema、既有 token/结构化受控字段、URL 或 headers；不改变共同规划、返修预算、Q02、配额或结算语义。 |
| 回交责任阶段准确 | PASS | 受保护名单、对象/空对象语义、合并冲突、大小/深度、存储、协议参数位置、快照、上游拒绝和失败映射均为 CR306-BE 的后端技术设计责任。 |
| 后端语义角色可恢复 | PASS | `backend-alex` 已注册且唯一；激活与状态写入留给 root 机械同步。 |
| 后台先行例外 | PASS（受限） | 常规 Profile 路径不因此修改；用户既有后台先行授权及 067 的 CR-306 定向顺序支持本次只恢复 `backend-alex`。 |
| 历史与未提交草稿可恢复 | PASS | PRODUCT08 冻结包及原故障/研究证据保留；`068/unsubmitted-backend-typed-draft.tar.gz` 存在，仅为未提交旧候选草稿，不得视为当前或已批准技术基线。 |
| 下游追踪完整 | PASS | CR306-BE 后依赖 DB 接收、完整页面与 M002 基准正式设计、用户视觉评审、FE、实施、独立 QA 与用户 UAT 均在 CR-306 责任表中保留。 |
| 阻塞决策 | PASS（无当前阻塞） | 未完成 DB、UI、FE、实现、QA 或 UAT 是后续依赖，不阻止本次产品回交。新增业务权益、费用上限、供应商策略或突破既有安全边界的能力才需回用户确认。 |

## 精确单步目标

建议 root 仅机械同步以下单步，不在本记录中执行：

```yaml
operation: transition-stage
decision_id: TRANSITION-M003-069
from: product-planning
to: technical-design
active_role: backend-architect/base
active_agent: backend-alex
status: active
current_handoff: .planning/milestones/M002-legacy-M003/handoffs/backend-architecture.md
authorized_by:
  - USER-M003-CR306-REPAIR
  - USER-M003-CUSTOM-PARAMETERS
  - USER-M003-STREAM-FIRST
scope: >
  Bounded CR306-BE recovery only. Replace the unsubmitted typed reasoning and
  capability-directory draft with the PRODUCT09 model-level custom request-parameters
  JSON contract, preserving protected fields, business schema, request snapshots,
  failure/settlement boundaries and AC-317–321 traceability.
```

`backend-alex` 只接收 PRODUCT09、原故障/研究、现行 BE06-R1/API-AI BE06 与既有实施证据，定向修订后端/API/AI 原件及接收 fixture。不得把自定义参数解释为可绕过模型、消息、流式、业务 schema 或密钥约束，不得宣称参数已生效或真实超时已修复。

## 受依赖约束的后续交接

1. CR306-BE 完成后，按后端定稿语义决定是否需要 `dba-diana` 处理未发布 schema；不迁移、回填或重置现有 UAT 数据。
2. 后端字段、冲突状态、失败映射与 fixture 定稿后，`designer-tony` 才能制作完整页面原型及 M002 基准正式设计。
3. 新视觉必须由用户评审接受，之后 `frontend-bob` 才能接收前端架构；再分别经过实施门禁。
4. 实现后由 `qa-quinn` 独立验证 AC-317–322 和有界真实完整链路，最后由用户执行 UAT。

以上后续均未在本次门禁获批。