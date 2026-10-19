---
milestone: M002
stage: implementation
role: backend-implementer/base
agent_name: backend-ethan
version: M002-BI-CR313-01
status: awaiting_user_review
date: 2026-10-16
---

# CR313 后端实施计划

## 已确认基础

- 授权：`TRANSITION-M002-129` / `USER-M002-CR313-FE01-APPROVED-20261016`，已接收 M002-DB-CR313-01、M002-BE-CR313-01、M002-FE-CR313-01、FE313-B1 与 M002-UI-33-R3-TA1。
- 实施范围：CAP-501～504、DATA-501～506、API-501～505；后端源码、未发布 schema 初始化、定向测试及仅新建隔离空库验证。
- 固定边界：四类别分别完整替换；模型每个连接必须携带本包可解密非空 Key；不复用目标 Key、不补填、不 probe；跨类别依赖整次拒绝且不联动解绑；成长身份冲突整次拒绝并保留历史；不迁移历史/UAT/生产数据。
- 角色与风险：`backend-ethan` 已激活；密码、权限、数据丢失与并发风险按 strong/high 下限执行，requested `gpt-5.6-sol/high`，actual model/usage 无运行时证据，记 unknown。

## 当前任务与验收

| ID | 输入/依赖 | 实施与验收 | 状态 |
|---|---|---|---|
| BI313-01 | FILE501/502、BE501-03 | 严格 JSON/presence 解码、Argon2id+AES-GCM、8/5/12MiB与KDF限额、普通导出零 Key 读取、秘密不进入响应/日志 | 完成 |
| BI313-02 | DB501-02～06 | 0018 未发布 schema、退役身份/可延迟活动唯一约束、终态回执、配置锁与窄权限/启动 Verify | 完成 |
| BI313-03 | CAP-501～503 | models/plans/items/growth 的完整一致导出、安全 current、预览差异/依赖/影响、单事务整类替换 | 完成 |
| BI313-04 | API-501～505、FE313-B1 | 管理员+CSRF路由、下载/预览/提交/resolve/current、严格 notice、稳定 problem/error 与 Retry-After | 完成 |
| BI313-05 | BE-V1～V8/DB501-V1～V8 | unit、HTTP 与随机隔离 PostgreSQL 行为验证；synthetic Key/provider 0调用；gofmt、go test、vet、build | 完成，范围见 validation |
| BI313-06 | 实施交付 | validation/evidence/handoff，canonical 入口只前置新入口且保留旧正文 | 完成 |

## 委派记录

- 主角色 `backend-ethan` 保留 portability core/API/DB、共享接口、集成和最终验证所有权。
- `backend-grace`，runtime `/root/backend_ethan_cr313/growth_retirement_closure`，requested `gpt-5.6-sol/high`、actual unknown；专属 `internal/growth/{levels,achievements,awards,settlement,operations}.go`、`internal/admin/user_detail.go` 和成长退役集成测试，完成后由主角色审阅并纳入统一验证。
- `backend-nolan`，runtime `/root/backend_ethan_cr313/provider_runtime_closure`，requested `gpt-5.6-sol/high`、actual unknown；专属 admin provider/model、generation/preset 候选、entitlement service/query/dbgen 与敏感 panic 日志测试，完成后由主角色审阅并纳入统一验证。
- 两项只在 schema/DTO 已固定后并行，未创建分支/worktree，未改控制面；共享 `server.go`、迁移、portability core 仍由主角色独占。

## 文件责任边界

- 新建：`backend/internal/portability/**`、`backend/internal/httpapi/config_portability_handlers.go`、`backend/db/migrations/0018_m002_config_portability.sql`、相关定向测试。
- 窄修改：`backend/internal/httpapi/server.go`、`backend/internal/platform/postgres/migrate.go`、`backend/internal/maintenance/**`、仅实现所需既有读写接点。
- 文档：本计划、同目录 `backend-validation.md`、`evidence/backend/**`、handoff；canonical 三文件只前置入口。
- 禁止：frontend、批准产品/设计/技术真源、控制面、M003/M004、现有 UAT 数据库/服务。

## 实施顺序

1. 固定 FILE501/502 类型、严格解码、加密与票据/指纹。
2. 添加 schema/Verify 与 repository，在同一锁/事务下实现四类读、预览和替换。
3. 接入 API-501～505、鉴权/CSRF、KDF准入与安全错误。
4. 补齐四类行为、并发/幂等/unknown 屏障和维护清理测试。
5. 仅在本轮随机隔离空库做迁移与集成验证，汇总原始日志和差异。

## 合并与清理

本轮无并行分支/工作树；helper 直接在共享树按互斥文件所有权增量写入，主角色已统一审阅和验证。任何已有 dirty 文件均按当前内容增量适配；只清理由本轮测试创建且已确认标识的临时数据库/资源。
