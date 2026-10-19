---
milestone: M003
stage: technical-design
review_status: PASS
decision_id: TRANSITION-M003-071
date: 2026-10-12
scope: CR-306 定向恢复；仅建议 technical-design → uiux-design / designer-tony，不改变状态
---

# CR-306 DB04→完整页面设计门禁

## 当前状态

- 当前：M003 / `technical-design` / `dba/base` / `dba-diana` / `active`。
- 当前 DBA 原件为 `M003-DB-04`，状态为定向设计已交付、待独立接收；不代表技术阶段整体完成。
- 控制检查实例：`gatekeeper-owen`；锁定路由为 requested `gpt-5.6-terra` / `medium`，运行时 serving metadata 未证实，`actual_model: unknown`。
- 锁定 Profile：[consumer-ai-web@1.0.0](evidence/start/locked-profile.yaml)，本次使用允许的 `technical-design → uiux-design` 单步迁移；不迁移 Profile 或 v1 路由。
- 本次仅激活 `designer-tony` 开展 CR-306 的完整页面原型与 M002 基准正式设计工作，不批准实施、QA、真实复验或用户 UAT。

## 原始专业产物

- [DB04 当前交接](../handoffs/database.md)
- [DB4-01–04 定向数据库正文](../technical/database.md#db4-cr306)
- [DB04 静态检查](../technical/evidence/cr306-db/check.json)
- [DB04 源文件清单](../technical/evidence/cr306-db/source-manifest.json)
- [BE07 当前后端交接](../handoffs/backend-architecture.md)
- [API-306](../technical/api/administration.md#api-306)
- [BE07 合成 fixture 索引](../technical/fixtures/cr306/index.json)
- [PRODUCT09 当前交接](../handoffs/product.md)
- [CR-306 当前责任表](../changes/CR-306.md#cr306-backend-repair)
- [用户自定义参数方向](requirements-feedback.md#cr-306-自定义请求参数简化user-m003-custom-parameters)
- [用户后台先行授权](requirements-feedback.md#m003-stream-first-后端生成流程先行)
- [完整页先评审授权](requirements-feedback.md#user-m003-ui-review-a)
- [M002 正式设计基准授权](requirements-feedback.md#正式设计以-m002-为基准confirmed)
- [070 DBA 接交门禁](cr306-backend-gate-070.md)

## 条件检查

| 条件 | 结果 | 证据或结论 |
|---|---|---|
| 当前阶段及目标迁移合法 | PASS | 当前为 `technical-design`；锁定 Profile 允许迁移到 `uiux-design`，目标角色 `designer-tony` 已注册且唯一。 |
| BE07、DB04 与 PRODUCT09 一致 | PASS | PRODUCT09 的 DATA-306/CAP-306、BE07 的 API-306/AI7 与 DB4 的对象、快照、冲突、保存和失败边界均可追踪。 |
| 实际持久化接点已明确 | PASS | DB04 明确未发布 schema 中模型 JSON 对象及两类 run 不可变安全快照；DB/API 分工、CAS/受理原子性和既有记录关系已交接。 |
| UAT 与历史数据边界保留 | PASS | 仅允许未来未发布 schema 与可丢弃空库验证；不升级、回填、重置或访问现有 UAT 数据、配置或服务。 |
| 既有业务及终态语义保留 | PASS | 同模型、共同 Plan、两类预算、N0–99、180/600 时限、Q02、退款/取消/DB 未知、公开 wire 与手动预设发布规则均未因自定义参数改变。 |
| 旧源及证据可恢复 | PASS | DB03 冻结源包与清单、PRODUCT08/旧 typed 候选历史、原真实故障和诊断证据均保留；CR-306 继续 open。 |
| 静态证据边界准确 | PASS | DB04 静态检查通过 36 条链接及冻结/源位置核对，但明确未证明 PostgreSQL CHECK/触发器、JSONB 往返、并发、应用行为、AC-317–322 或新会话交接。 |
| 设计接收输入充分 | PASS | BE07 fixture 包含 PAGE-208 管理编辑，以及 PAGE-204/216/212 的等待、失败、取消与预览边界；DB04 与 API-306 提供 JSON 编辑、格式、受保护字段、冲突及保存边界。 |
| 新视觉评审与下游门禁保留 | PASS | `designer-tony` 必须在现有完整页面内制作原型和 M002 基准正式设计，并提交用户评审；尚未进行的 FE、用户视觉评审、实施与 QA 是后续依赖，不阻止本步。 |
| 阻塞决策 | PASS（无当前阻塞） | 用户已授权修复及 JSON 方向；具体视觉设计由设计责任角色完成。新增业务权益、费用上限、供应商策略或突破既有安全边界的能力才须另行确认。 |

## 精确单步目标

建议 root 仅机械同步以下单步，不在本记录中执行：

```yaml
operation: transition-stage
decision_id: TRANSITION-M003-071
from: technical-design
to: uiux-design
active_role: uiux/base
active_agent: designer-tony
status: active
current_handoff: .planning/milestones/M002-legacy-M003/handoffs/uiux.md
authorized_by:
  - USER-M003-CR306-REPAIR
  - USER-M003-CUSTOM-PARAMETERS
  - USER-M003-STREAM-FIRST
  - USER-M003-UI-REVIEW-A
  - USER-M003-M002-DESIGN-BASELINE
scope: >
  Bounded CR306-UI design only. Produce the complete PAGE-208 and affected
  PAGE-204/216/212 prototype and M002-baseline formal design from BE07/DB04
  fields, states and fixtures, then submit the new visual result for user review.
```

`designer-tony` 只接收 BE07、DB04、PRODUCT09、API-306 与 fixture 的设计输入。不得把合成 fixture、静态证据或旧视觉批准当作本轮视觉已获用户接受，亦不得开始前端实现。

## 后续依赖

1. `designer-tony` 完成完整页面原型和正式设计后，必须展示新视觉供用户评审。
2. 用户接受新视觉后，`frontend-bob` 才可接收前端架构与数据合同。
3. 后端及前端实施分别仍需实施门禁；随后 `qa-quinn` 独立验证确定性合同和有界真实链路。
4. CR-306 的最终用户确认仍由后续 UAT 完成。

以上后续均未在本次设计阶段入场门禁中获批。