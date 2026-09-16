---
milestone: M001
role: frontend-architect/base
agent_name: frontend-bob
status: delivered_baseline
maintenance: M001-AGENT-CONTEXT-001
---

# M001 前端契约与状态基线

M001 已由 TRANSITION-M001-138 关闭；正式状态见[当前交接](./verification.md)和 workflow。以下是已交付知识入口，不是重新激活该角色或待批准的交接。

## 当前真源

[前端方案](../technical/frontend.md)、[API v1.5](../technical/api/index.md)、[原词释义链路](../technical/frontend.md#cr040-frontend)。严格 DTO/schema → mapper → 应用模型 → store/presenter → 渲染；页面/组件不直接使用 DTO。`entry_meaning` 映射为 `entryMeaning`，旧键/双键不作兼容。

SSR 私网上游地址不进入浏览器；浏览器只访问同源 `/api/v1`。身份/会话变化清除私有状态；按 run/request epoch 拒绝旧异步回调，控制器不跨 Nuxt 实例共享。SSE 终态来源、退款真实性和可保存状态遵守 API，不由 reader 关闭或晚到错误覆盖已经确定的结果。

生成实现见 frontend/app/application/generation、app/runtime/stores/generation.ts 和 app/infrastructure/http；布局/响应式见[设计交接](./uiux.md)。CR-033 v1.4 fixture 是仍有效的管理员子契约，不意味着整个公开契约退回 v1.4。

## 后续验证

[前端执行与验证](./frontend-implementation.md)、[定向覆盖](../verification/coverage-matrix.md)。公开 DTO、SSR/客户端、Unicode code point 区间、首题/下一题与答案保护按改动范围检查。FRONTEND-SYNC-133 已获 134 接收和用户 UAT，Q132-01 已解决；无需重复旧接收步骤。

旧交接原文与审批关系见[历史索引](./archive.md)。
