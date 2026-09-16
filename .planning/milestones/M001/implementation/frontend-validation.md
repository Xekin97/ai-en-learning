---
milestone: M001
role: frontend-implementer/base
agent_name: frontend-claire
status: delivered_qa_received_user_accepted
maintenance: M001-AGENT-CONTEXT-001
---

# 前端：当前验证基线与回归入口

FRONTEND-SYNC-133 已由 134 独立接收，用户 UAT 接受，138 完成 M001。Q132-01 已解决，不再等待 QA/部署。应用提交 `387c775534844ff0b8ca9857523dc39c1d8ee87a`；当时前端镜像 b7ddbbe99c68…、关键公开 JS 为 CWwqOgzc.js；这些是历史交付标识，不是当前运行环境探测。

## 最新适用证据

| 范围 | 既有结果/原件 | 边界 |
| --- | --- | --- |
| 生产 Dockerfile 质量链 | [133 developer.json](./evidence/frontend-sync-133/developer.json)：typecheck、lint、依赖边界、263 单测、Nuxt build 通过 | 构建通过不表示全站浏览器已重测 |
| 生成异步状态/取消/身份隔离 | [consumer-126](./evidence/ai-consumer-126/developer.json)：71 项定向、9 项浏览器开发检查 | 失败首轮保留在原件；不将其改为通过 |
| 生产镜像消费 | [133 smoke](./evidence/frontend-sync-133/smoke-results.json)：成功保存、退款 true、退款 false，3/3 | 合成 API/SSR 数据源，不是真实模型调用 |
| 实际交付一致性 | [134 独立接收](../verification/evidence/frontend-sync-134.json)：镜像/公开资源与候选匹配 | 未来部署变动后需重新核对，不能仅凭源码推断线上版本 |
| 跨端与用户验收 | [QA132](../verification/evidence/closeout-132/qa.json)、[UAT](../verification/uat.md) | 用户未提供逐项用例，不补造覆盖 |

## 执行与回归入口

从项目根目录运行，Node 24、pnpm 10.33.0，版本以 frontend/package.json 和锁文件为准：

```sh
corepack pnpm --dir frontend install --frozen-lockfile
corepack pnpm --dir frontend typecheck
corepack pnpm --dir frontend lint
corepack pnpm --dir frontend lint:boundaries
corepack pnpm --dir frontend exec vitest run tests/unit/generation-lifecycle.test.ts tests/unit/generation-stream.test.ts tests/unit/generation-refund-contract.test.ts
```

按任务替换定向用例；需要完整单测/构建时使用 `corepack pnpm --dir frontend test` / `build`。环境启动见 [frontend README](../../../../frontend/README.md)，默认开发端口与已交付 UAT 的 6001 分开。

- 原词释义：tests/unit/entry-meaning-contract.test.ts；管理配额：admin-quota-contract.test.ts；API 其余部分按 [API v1.5](../technical/api/index.md)选择。
- 日期/恢复/匿名组：review-*、passage-cloze-presenter；视觉变化按[设计交接](../handoffs/uiux.md)选语言、状态与断点。
- 浏览器：`corepack pnpm --dir frontend test:e2e`。playwright.config.ts 会启动 3300 Nuxt 与 38080 mock backend，测试在准备好的隔离开发环境执行；默认会复用现有端口服务，先核对服务身份。它不连接真实 OpenRouter/SQL。
- tests/integration/cr033-paired-smoke.mjs 会创建账号、修改组策略，只用于按 README 准备的可丢弃 6101 栈，不能对 UAT 运行。

## 有效约束与后续

DTO → mapper → 应用状态 → presenter/渲染；身份变化清私有状态；失败终态的 quota_refunded 是布尔事实，不再要求恒为 true。公开契约整体为 v1.5，保留的 v1.4 fixture 只覆盖管理员配额子契约，不能据其目录名倒退版本。

旧 frontend-only Compose 覆盖和回退镜像保留在原件；回退会重新带回 Q132-01，不能当作当前兼容保证。本次无应用测试/部署，源码和原证据不变；开放项统一见[报告](../verification/report.md#收尾核对与保留事项)。
