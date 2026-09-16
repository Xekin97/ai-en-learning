---
milestone: M001
role: quality/base
agent_name: qa-quinn
status: milestone_complete_with_retained_limitations
maintenance: M001-AGENT-CONTEXT-001
---

# M001：后续开发 agent 的当前入口

## 状态与下一动作

[workflow](../../../workflow/state.yaml)是正式流程真源：M001 已完成（TRANSITION-M001-138），没有活动角色；本地 UAT 已接受，M002 尚未启动。下一步在用户提出 M002 目标后，沿现有 Profile 确认增量范围并办理启动；无需重做 M001 审批、QA 接收或收尾。完成条件是 M002 的范围、验收与角色明确，不是重新执行历史待办。

应用基线 `387c775534844ff0b8ca9857523dc39c1d8ee87a`；整理前完整资料 `521de847183088dc8f3d69112d94f4977a90d06b`。[项目清单](../../../agt/project.yaml)保留原 Profile/agt 锁与显式模型路由采用记录；基座后续提交不表示自动迁移锁。

## 必须继承的约束

- CR-040：释义只针对输入原词，独立于文章/派生词；[产品真源](../product/ai-behavior.md#original-entry-meaning)。
- r10：同 run/模型，首轮后纠正与续写合计最多两次，单次业务计量；不是通用网络重试。[准确边界](../technical/ai-integration.md#r10-corrections)。
- [USER-COMPAT-001](../reviews/first-release-compatibility-policy.md)：M001 无旧版兼容义务；后续兼容方案须突出说明并由用户决定。
- [USER-CLAIM-DELETE-001](../reviews/claimed-batch-delete-retention-exception.md)：主动删除批次时同事务删除对应已消费 claim，重试 404；其他已消费记录仍保留 24 小时。
- 模型调优已由用户停止；历史预算/部署/一次性清理授权不能成为新任务的无限授权。生产发布未批准；私有诊断原文不得因归档延长留存。

## 按任务读取

| 任务 | 入口；仅展开适用约束和依赖 |
| --- | --- |
| M002 范围、业务规则 | [产品交接](./product.md) |
| 页面/响应式/复习交互 | [设计交接](./uiux.md) |
| Schema、事务、迁移 | [数据库交接](./database.md) |
| API、生成、计量、诊断 | [后端架构](./backend-architecture.md)、[后端执行与回归](./backend-implementation.md) |
| DTO、SSR、状态与界面 | [前端架构](./frontend-architecture.md)、[前端执行与回归](./frontend-implementation.md) |
| 测试适用范围/完成判定 | [报告与开放项](../verification/report.md)、[覆盖和回归入口](../verification/coverage-matrix.md) |
| 冲突、旧决定、失败过程 | [历史索引及替代关系](./archive.md)；按 ID 查原件 |

## 未验证事项与整理边界

CR039-L1、CR042-L1、AI-QUALITY-90 保持开放/未验证；原因、下一动作与完成条件集中在[报告](../verification/report.md#收尾核对与保留事项)。不将其自动变成 M002 已选范围。

本次按用户“嗯，先这样整理吧”维护文档，没有新增业务验证。CTX-M001-01（新会话接续效果）仍未验证；[整理证据](../reviews/evidence/m001-agent-context-001.json)记录静态检查、原文恢复与相同读取集合的前后大小。静态检查不等于独立 agent 接手通过，实际 tokens/运行时读取量未知。
