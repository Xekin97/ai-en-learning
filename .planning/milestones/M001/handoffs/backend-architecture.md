---
milestone: M001
role: backend-architect/base
agent_name: backend-alex
status: delivered_baseline
maintenance: M001-AGENT-CONTEXT-001
---

# M001 后端与 AI 契约基线

M001 已由 TRANSITION-M001-138 关闭；正式状态见[当前交接](./verification.md)和 workflow。以下是已交付知识入口，不是重新激活该角色或待批准的交接。

## 当前真源

- [后端方案](../technical/backend.md)：模块、事务、计量、安全、观测；[API v1.5](../technical/api/index.md)：公开协议仍在 `/api/v1` 路径。
- [AI 集成 r10](../technical/ai-integration.md#r10-corrections)：初次调用后纠正/续写共享最多两次额度；同 run/模型，最终严格校验，单终态/单业务计量。纠正可改标注但保留已发出的净正文，不再次发送正文；续写只能追加，保留释义/hint，按契约更新标签。
- `entry_meaning` 是唯一释义字段。旧 candidate `passage_forms`/`hint_forms` 及 v4 无二次调用说明属于历史设计；当前候选/标注规则以 AI 集成和代码为准。普通网络错误没有通用重试或模型切换。
- [CR042](../technical/backend.md#generation-evidence-042)：普通日志与私有原文通道隔离；专用账号诊断最多 50 请求、24 小时、每份 1 MiB。普通构建不能开启，replay 不覆盖 DB/退款/浏览器，也不能整包回放多回复。

## 修改入口与判断

backend/internal/ai 负责候选、标注、关系校验、纠正/续写；internal/generation 负责 run/结算；internal/httpapi 负责 HTTP/SSE；internal/generationtrace、generationevidence、diagnostics 负责诊断。执行/测试见[后端交接](./backend-implementation.md)。

R10-ARCHITECTURE-SYNC 已由 136 接收，138 完成关闭，不再等待 gate。CR039-L1、CR042-L1、AI-QUALITY-90 见[报告](../verification/report.md#收尾核对与保留事项)。

旧交接原文与审批关系见[历史索引](./archive.md)。
