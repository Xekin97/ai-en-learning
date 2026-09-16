---
milestone: M001
stage: implementation
decision_id: USER-CLAIM-DELETE-001
agent_name: gatekeeper-owen
review_status: confirmed_scope_exception_no_stage_transition
confirmed_by: user
date: 2026-09-08
---

# 主动删除批次时的承接记录保留例外

## 用户确认

CONFIRMED：在明确询问“用户主动删除批次时，同步删除对应承接记录；之后重试返回 404，其他记录仍保留 24 小时；无需改表，不涉及旧版兼容，是否批准这个删除例外”后，用户回复“确认”。这是对 097 调查建议 A 的专项批准，不再重复询问同一事项。

本决定仅补充 TRANSITION-M001-097，不切阶段、不切角色。继续由 implementation / backend-implementer/base / backend-ethan 承担原有限返工。

## 原始专业产物

- [097 调查与方案 A](../implementation/backend-cr039-097-validation.md)、[工作区计划](../implementation/backend-cr039-097-worktree-plan.md)、[后端交接](../handoffs/backend-implementation.md)。
- [097 返工授权](./verification-cr039-097-rework-approval.md)、[QA096-01 原件](../verification/cr039-096-findings.md)、[CR-039](../changes/CR-039.md)。
- [后端规则 §4.4](../technical/backend.md)、[API 生命周期 §14](../technical/api/index.md)、[数据库 T9](../technical/database.md)、[USER-COMPAT-001](./first-release-compatibility-policy.md)。

## 已批准的唯一技术边界例外

- 所有者主动永久删除已保存批次时，同一事务删除对应的已消费承接记录和批次；现有级联删除规则保留。
- 删除完成后，原承接凭证重试返回 404；不得重新生成、恢复批次或允许第二个账号承接。
- 其他已消费承接记录仍保留 24 小时；active claim 和其他资源的期限不变。
- 不改变数据库 schema/约束、公开 DTO/路径、生成计数或额度，不引入旧版本兼容。不授权方案 B 的墓碑状态或约束修改。
- 权限校验、事务回滚、锁顺序与并发安全的实现和开发验证仍由 backend-ethan 负责；本门禁不替其设计或判断代码正确性。

本决定优先于既有后端/API/DB 文档与 097 授权中“所有已消费 claim 均保留 24 小时”在**所有者主动删除对应批次**这一情形下的冲突部分。技术原件保留，后续实施与 QA 必须同时引用本决定；除此之外的保留策略或技术边界变更仍需明确确认。这是显式批准的窄范围补充，不是静默改写上游或增加兼容方案。

## 条件检查

| 条件 | 结果 | 依据 |
| --- | --- | --- |
| Profile 与活动角色 | PASS | 锁定 Profile 摘要一致；backend-ethan 为唯一活动专业角色，允许留在 implementation |
| 必需产物与交接 | PASS FOR RESUMPTION | state 六项文件存在；097 报告明确是待决定调查，不是完成的修复 |
| 保留策略待决 | RESOLVED | 用户专项确认 A，仅解除该决定阻塞 |
| 缺陷和变更 | OPEN RETAINED | QA096-01 / CR-039 未修复、未关闭；QA096 FAIL 不改写 |
| 追踪 | PASS | 原件关联 CAP-011/016、API-006/007、DATA-012/013/015/017、PAGE-005/006 |
| 原始证据 | PASS | QA096 的 27 项摘要匹配；不重跑测试或替代质量结论 |

## 当前授权与下一步

当前状态保持 M001 / implementation / backend-implementer/base / backend-ethan / active，沿用 097 的代码和开发产物写入范围、隔离合成开发验证及新标识候选构建权限。下一步为按原报告及本决定实施删除修复并定向验证；不需要再批准同一删除例外，不需要重开产品/UI 或整体技术设计。

本次不是修复完成或独立 QA 通过，不恢复连续运行、真实模型调用、模型配置修改、UAT 部署或发布权限。也不授权直接清理现有数据、重置环境、运行数据迁移或改写历史 QA 证据。其他 097 边界原样有效。

只新增本控制面决定、更新 state 的决定索引与授权例外、向 history.scope_decisions 追加记录；97 次迁移及原范围决定、角色注册表、专业产物与源码保留。本轮无代码、测试、构建、模型调用、凭据读取或 UAT 操作。模型路由锁不变，actual_model/usage 未观测。

按 agt-stage-gate，本轮止于登记已确认决定；下一活动角色仍为 backend-ethan，不在门禁轮次执行其专业工作。
