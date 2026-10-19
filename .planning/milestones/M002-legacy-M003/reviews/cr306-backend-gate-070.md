---
milestone: M003
stage: technical-design
review_status: PASS
decision_id: TRANSITION-M003-070
date: 2026-10-12
scope: CR-306 同阶段角色接交；仅建议 backend-alex → dba-diana，不完成 technical-design
---

# CR-306 BE07→DBA 定向接交门禁

## 当前状态

- 当前：M003 / `technical-design` / `backend-architect/base` / `backend-alex` / `active`。
- 当前 BE07 为 `M003-BE-07`，状态为设计已交付、待独立接收；不代表技术阶段整体完成。
- 控制检查实例：`gatekeeper-owen`；锁定路由为 requested `gpt-5.6-terra` / `medium`，运行时 serving metadata 未证实，`actual_model: unknown`。
- 锁定 Profile：[consumer-ai-web@1.0.0](evidence/start/locked-profile.yaml)，技术阶段允许 `dba/base`；不迁移 Profile 或 v1 路由。
- 本次仅在 `technical-design` 内切换活动角色到 `dba-diana`，不批准 UI、FE、实施、QA、真实复验或用户 UAT。

## 原始专业产物

- [BE07 当前后端交接](../handoffs/backend-architecture.md)
- [BE7 后端与 DB 接点](../technical/backend.md#be7-cr306)
- [API-306 管理配置合同](../technical/api/administration.md#api-306)
- [AI7 快照、协议与无内容边界](../technical/ai-integration.md#ai7-reasoning)
- [生成受理与无业务内容失败](../technical/api/generation.md#api-306-generation)
- [预设完整预览接续](../technical/api/presets.md#api-306-preview)
- [CR-306 API 索引与 fixture 入口](../technical/api/index.md#api-306-index)
- [BE07 合成 fixture 索引](../technical/fixtures/cr306/index.json)
- [BE07 静态合同检查](../technical/evidence/cr306/check.json)
- [BE07 源文件清单](../technical/evidence/cr306/source-manifest.json)
- [PRODUCT09 当前交接](../handoffs/product.md)
- [CR-306 责任表](../changes/CR-306.md#cr306-backend-repair)
- [用户自定义请求参数方向](requirements-feedback.md#cr-306-自定义请求参数简化user-m003-custom-parameters)
- [069 后端恢复门禁](cr306-custom-product-gate-069.md)

## 条件检查

| 条件 | 结果 | 证据或结论 |
|---|---|---|
| 当前技术阶段及目标角色合法 | PASS | 当前处于 `technical-design`；`dba-diana` 已注册、唯一且属于本阶段允许角色。 |
| 当前 BE07 入口完整 | PASS | 后端交接、BE7/API-306/AI7、生成与预设接点、CR-306 责任表及合成 fixture 均存在并互相追踪。 |
| 旧 typed/目录候选已退出当前合同 | PASS | BE07 明确撤销 typed 推理、能力目录和自动平台映射；068 未提交草稿仅作冻结历史，不能实施或作为当前基线。 |
| 产品、API 与验收追踪一致 | PASS | PRODUCT09 的 DATA-306/CAP-306、BE07 的 API-306 和 AC-317–322 均指向模型级自定义 JSON、空对象语义、受保护字段、冲突、快照、失败和完整验证边界。 |
| 实际 DBA 接收必要性 | PASS | BE7-DB 明确需要评估并同步 `ai_models.custom_parameters` JSONB、两个 run 的版本化安全快照、默认空对象、不变性、CAS/受理原子性及原记录关系；不是虚构的 DB 工作。 |
| 既有业务和失败边界保留 | PASS | 同模型、共同 Plan、格式校验、一次扣次、Q02、每调用 180 秒、全请求 600 秒、退款/取消/结算未知语义继续有效；不因 JSON 配置重置期限或放宽格式。 |
| 证据及未验证边界准确 | PASS | 静态合同与 fixture 检查通过，但未运行 Go/API/SQL/浏览器/真实模型测试；合成 fixture 不构成 AC-317–322 或真实超时修复通过。 |
| 视觉与后续门禁保留 | PASS | 完整页面、M002 基准正式设计和用户新视觉评审仍为后续前置条件；DB、UI、FE、实施、QA、UAT 均未获本次批准。 |
| 阻塞决策 | PASS（无当前阻塞） | DBA 可在 BE7 定义的持久化差异范围内收敛未发布 schema/约束及数据合同；不需要重复确认既有修复或自定义参数方向。 |

## 精确单步目标

建议 root 仅机械同步同阶段角色切换，不在本记录中执行：

```yaml
operation: activate-role
decision_id: TRANSITION-M003-070
stage: technical-design
active_role: dba/base
active_agent: dba-diana
status: active
current_handoff: .planning/milestones/M002-legacy-M003/handoffs/database.md
authorized_by:
  - USER-M003-CR306-REPAIR
  - USER-M003-CUSTOM-PARAMETERS
scope: >
  Bounded CR306-DB reception only. Determine and document the necessary unpublished
  schema, constraints and data contract for custom_parameters and immutable run
  snapshots, using a disposable empty database if validation is required. No data
  migration, backfill, UAT reset, deployment or implementation acceptance.
```

`backend-alex` 的 BE07 原件保持当前技术输入；`dba-diana` 只接收其明示的持久化差异与数据合同。不得借 JSON 参数扩展为任意 URL、headers、凭据、模型、消息、流式开关或业务 schema 覆盖。

## 后续依赖

1. DBA 完成 CR306-DB 的定向设计或无差异接收结论后，保留后端合同作为 DB/UI 的共同输入。
2. `designer-tony` 仅在后端/DB 接收边界明确后，制作完整页面与 M002 基准正式设计，并提交用户视觉评审。
3. 用户接受新视觉后，才可交 `frontend-bob` 接收前端架构，随后分别经过实施门禁。
4. 实现后由 `qa-quinn` 独立验证确定性合同与有界真实完整链路；CR-306 仍由用户 UAT 最终确认。

以上后续均未在本次同阶段角色接交中获批。