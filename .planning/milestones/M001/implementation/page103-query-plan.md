---
milestone: M001
change_request: CR-021
stage: implementation
role: backend-implementer/base
agent_name: backend-ethan
date: 2026-09-04
status: pass
---

# PAGE-103 用户搜索查询计划证据

## 结论

CR-021 的固定三元排序查询已在 PostgreSQL 18.6、50,002 个账号的隔离数据库中执行 `EXPLAIN (ANALYZE, BUFFERS)`。当前样本下精确查询、较宽包含查询首批和带 keyset 的后续批次均在 16 ms 内完成，top-N 排序仅使用 25–27 kB 内存。M001 不新增 `pg_trgm`、表达式排序索引或 schema 迁移。

该结论只表示当前规模的开发期基线可接受，不把前导通配符的顺序扫描误判为可无限扩展。上线后应按 API-103 路由聚合查询耗时和账号量；若代表性生产数据的 p95 违反后续性能预算，再提出独立索引变更并重新记录读写成本与计划。

## 隔离样本

- 引擎：PostgreSQL `18.6 (Debian 18.6-1.pgdg12+2)`。
- 数据库：按全量 M001 migration 创建的一次性隔离数据库；验证后已删除。
- 账号数：50,002；50,000 个规则用户名，加精确查询的两个前后缀包含账号。
- 现有索引：保留 migration 中的 `accounts_username_lower_unique_idx`，未临时添加扩展或索引。
- 查询：与 `admin.Service.ListUsers` 相同的参数化 CTE、`CASE` tier、三元严格大于 keyset 和 `LIMIT 21`。
- 缓存状态：本地隔离验证，shared buffers 均为 hit；数字用于实现回归基线，不声明为生产容量承诺。

## 结果摘要

| 场景 | 匹配行 | 扫描 | 排序 | Execution Time | Buffers |
| --- | ---: | --- | --- | ---: | ---: |
| 精确查询 `acct_0025000`，同时存在两个包含项 | 3 | Seq Scan；移除 49,999 行 | quicksort，25 kB | 15.328 ms | shared hit 829 |
| 较宽包含查询 `250`，第一页 | 202 | Seq Scan；移除 49,800 行 | top-N heapsort，27 kB | 12.816 ms | shared hit 829 |
| 同一包含查询，带 `(tier,name,id)` keyset | 202 | Seq Scan；移除 49,800 行 | top-N heapsort，27 kB | 13.808 ms | shared hit 829 |

## 计划判读

1. `lower(username) LIKE '%query%'` 的前导通配符不能利用现有 B-tree 做包含过滤，因此优化器选择顺序扫描；这与设计预期一致。
2. `CASE` 派生 tier、`lower(username)` 与 `id` 的 top-N 排序开销在本样本中很小，没有落盘排序。
3. keyset 条件使用与排序完全相同的三元组；后续页没有 offset 扫描，也没有改变确定性结果顺序。
4. 当前测量不足以证明新增扩展的部署、写放大和索引维护成本合理，因此遵循已批准技术合同，保持无迁移实现。

## 后续触发条件

- 在真实账号分布与预期峰值规模上重放 API-103；至少记录空查询、短包含查询和完整用户名查询的 p50/p95。
- 若 API-103 的数据库耗时成为页面瓶颈，再比较 `pg_trgm` GIN/GiST 候选与现有方案，并覆盖新增账号、用户名唯一性和迁移回滚成本。
- 任何索引方案都不得改变 `(match_tier ASC, lower(username) ASC, id ASC)`、cursor v2 scope 或公开成功 DTO。
