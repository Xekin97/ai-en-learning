---
milestone: M001
stage: verification
role: quality/base
agent_name: qa-quinn
date: 2026-09-08
status: open
change_request: CR-039
finding: QA096-01
severity: P1
owner_stage: implementation
---

# QA096-01：访客承接保存的批次无法删除

## 结论与影响

**FAIL / 阻塞当前候选交付。** 访客生成、认证后承接保存成功的批次，通过本人正常 DELETE 接口删除会返回 500；随后详情仍为 200、数据仍存在。普通登录用户直接生成保存的批次删除通过。不是跨版本兼容问题，也不是 AI 映射错误。

追踪：CAP-011/016、PAGE-005/006、API-006/007、DATA-012/013/015/017；[096 授权的当前版本认领/删除边界](../reviews/implementation-cr039-096-verification-approval.md)、[API 契约](../technical/api/index.md)、[产品能力](../product/abilities.md)。

## 独立复现

候选 `wordweave-backend:cr039-095` / `sha256:2f263a80f844c3489eeca8fdbc0a3091ac95816551319c74da9ae2f3d793b396`；固定 PostgreSQL 18.6、合成提供方、全新一次性数据库。

1. 访客通过正常 SSE 生成，取得 validated 结果和内存中的 generation token。
2. 请求 visitor-claim，已登录学习者使用 claim token 承接；返回 200 和 batch_id。
3. 本人 GET 批次为 200，确认当前账号拥有该资源。
4. 本人携带合法会话/CSRF 发起 DELETE `/api/v1/me/batches/{batch_id}`，期望 204，实际 **500 / internal_error**。
5. 再次 GET 仍为 **200**；重启同镜像后再次 DELETE 仍为 **500**。

第二个全新批次独立复现没有修改任何时间字段、没有锁竞争屏障、没有代码/schema 变更。首次补测与第二次最小复现共观察到三个 DELETE 500：

- [补测结果](./evidence/cr039-096/supplement-results.json)：L10/deleted-claim-does-not-resurrect。
- [最小复现脚本](./evidence/cr039-096/delete-claim-repro.mjs)、[HTTP/DB 观测](./evidence/cr039-096/delete-claim-observation.json)、[复现断言](./evidence/cr039-096/delete-claim-results.json)。
- 后两次 request_id：`req_P_W7ktbVIK2Gl4aI6ylJ8w`、`req_4azR8xjOACOfwMrrYmYYOw`。

生成、认领、读取均成功，失败期间没有第二次模型调用；删除事务回滚，未观察到部分删除或跨账号访问。

## 有界原因核对

[数据库 stderr 证据](./evidence/cr039-096/delete-constraint-evidence.json)明确显示三次 `visitor_claims_state_consistent` CHECK 失败，触发语句为将 `consumed_batch_id` 置为 NULL。

[源码与实际约束摘要](./evidence/cr039-096/bounded-source-evidence.json)：

- `backend/internal/learning/service.go:533` 的 DeleteBatch 直接删除 learning_batches，没有先处理该批次的已消费 claim。
- `backend/db/migrations/0002_core_tables.sql:300` 的引用为 `ON DELETE SET NULL`。
- 同文件的 `visitor_claims_state_consistent` 又要求 consumed 状态下 consumed_batch_id 非 NULL；删除触发外键动作与 CHECK 冲突，最终 API 返回 500。

这是实际现行实现与永久删除能力之间的缺口。本轮未比较旧镜像，不判断该缺陷最早由哪次提交引入，不能称其为 095 新增回归。

## 建议路由与复验边界

PROPOSED：先交 implementation / backend-ethan 处理该删除路径，保留 API、本人鉴权、统计事实、删除后不可恢复与正常网络重试语义。若修复必须改变已批准 claim 保留策略或 DB 约束，由其明确提出并按门禁请求 backend-alex/DBA 的有限确认；质量角色不预先授权 schema 改动。

复验只需覆盖访客承接批次删除、删除后详情/搜索/复习不可取得、旧 claim 重试不能恢复资源、普通批次删除、跨账号拒绝、累计生成不回退及相关并发原子性。不能通过等待 claim 清理、隐藏删除按钮或清空用户数据规避问题。

当前不需要重开产品范围或 UI 设计；本轮未修实现、未改 state/registry、未部署 UAT。QA096-01 保持 open，等待用户审阅及门禁接收。

## 原 QA094-01 处置

同版本重启保存部分在 QA096 独立通过，可由后续门禁接收为修复验证通过；[QA094 原件](./cr039-094-findings.md)保持不变。旧版兼容部分依据 USER-COMPAT-001 退出范围，不是测试通过。新的 QA096-01 仍阻塞本候选。
