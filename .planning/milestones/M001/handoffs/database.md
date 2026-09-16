---
milestone: M001
role: dba/base
agent_name: dba-diana
status: delivered_baseline
maintenance: M001-AGENT-CONTEXT-001
---

# M001 数据库基线

M001 已由 TRANSITION-M001-138 关闭；正式状态见[当前交接](./verification.md)和 workflow。以下是已交付知识入口，不是重新激活该角色或待批准的交接。

## 任务入口

[数据库设计](../technical/database.md)维护表、约束、事务和清理规则；实现真源是 backend/db/migrations 和 backend/db/queries；sqlc 生成目录 backend/internal/dbgen 不手改。契约由 [API](../technical/api/index.md)按 API ID 定位。

CR-040 的 `entry_meaning` 已贯穿持久化和快照；[一次性切换](../technical/database.md#cr040-data-cutover)是已执行的历史设计，不是下一次启动步骤。普通 migrate 是结构迁移，不自动清账号、草稿、模型分配或学习内容。COMMIT 结果不明先对账，不盲重试清理。

长期例外：[USER-CLAIM-DELETE-001](../reviews/claimed-batch-delete-retention-exception.md)仅覆盖所有者主动删除批次时的已消费 claim，其余保留期不变。此决定优先于早期一律保留 24 小时的描述。

## 执行与验证

[后端回归入口](../implementation/backend-validation.md#执行与回归入口)提供隔离测试要求；TEST_DATABASE_URL 必须指向可创建临时库的可丢弃环境。不能照搬 backend/Makefile 的固定 wordweave Compose 项目去操作正在使用的 UAT。

迁移、并发、额度退款、保存幂等与删除隔离按实际改动选择验证；历史切换和 DB40 证据见[覆盖](../verification/coverage-matrix.md)，不因资料归档再次执行清库。

旧交接原文与审批关系见[历史索引](./archive.md)。
