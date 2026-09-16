---
milestone: M001
stage: technical-design
role: dba/base
agent_name: dba-diana
status: awaiting_user_review
date: 2026-09-09
revision: CR-040
confirmed_scope: [CR040-NAMING, CR040-DATA-CUTOVER]
open_change_requests: [CR-039, CR-040]
open_questions: []
pending_role_sync: [backend-alex, frontend-bob]
---

# 数据库设计角色交接单

## 使用的输入与确认闭环

- [102 有限 DBA 授权](../reviews/backend-cr040-database-sync-approval.md)、已接收的[后端交付](./backend-architecture.md)、[产品原词释义](../product/ai-behavior.md#original-entry-meaning)与 DATA/CAP；consumer-ai-web@1.0.0、technical-design / dba-diana 身份匹配。
- **2026-09-09 用户回复“确定”**，确认已展示的完整保留／重置／清空范围；权威记录为 [CR040-DATA-CUTOVER](../technical/database.md#cr040-data-cutover)。管理员、密钥、词库的保留和组模型分配清空不再是未决选择，不重复索取相同确认。
- 旧草稿转换与全量历史保留建议已撤回。此次为本地一次性切换，不改变正常产品删除/计量规则；浏览器缓存由用户清理。
- 命名和数据范围已确认；新的事务/恢复技术交付仍待审阅，实际数据操作与阶段切换没有因此自动授权。

## 本次产物与整理

- 唯一数据库真源：[database.md 当前修订](../technical/database.md#cr040-data-cutover)，含白名单、目标列/迁移边界、[同事务切换](../technical/database.md#cr040-cleanup-procedure)、[恢复限制](../technical/database.md#cr040-recovery)及 [DB40 定向验证](../technical/database.md#cr040-database-validation)。
- 结构迁移不夹带清库；本地离线操作把清理、组重置、字段改名、迁移账本与对账组合为一笔事务。不增加旧 reader、双写或数据转换分支，不创建通用重置 API。
- 覆盖现有当前正文和交接，更新既有目标列注记；[pre-cr040-database.json](../technical/archive/pre-cr040-database.json) 原批准两份文档继续冻结。没有新增报告；下方未重开历史和其他角色原件保持不变。

## 追踪与自检

- 数据范围覆盖 DATA-003–018，固定词表 DATA-001/002 保留；核心释义链仍是 DATA-011/013/017 与 API-005/006/007/008/103，CAP/PAGE 不新增。
- 只读核对迁移器、账本、角色权限、列/约束/触发器、默认组、凭据引用与管理员入口；核实当前 Migrate 各自开事务、Verify 不含新列检查，因此同事务执行需后端显式接入，不能直接复用 pool 验证。
- PostgreSQL 官方文档核对改名锁、事务回滚、延迟约束提前检查；后续 DB40 场景仍需实际实现与隔离测试。
- 本轮文档静态自检 PASS：两份 YAML 元数据、25 个当前本地引用/锚点、23 个 schema 表的范围覆盖通过；历史正文除目标列注记外不变，旧快照摘要不变。四份 102 后端原件及 Profile 摘要匹配；其余 3,834 份 planning 文件清单/摘要保持不变（`51d719b5d1b1e1cd41005c9757d9df3c202366adea70f866286b5d51ea19c3e4`）。这些是文档检查，不是数据库执行或应用测试结果。
- 未连接数据库、读取密钥、备份/清理/迁移、改源码或 SQL、开发/独立测试、调用模型或部署。actual_model/usage 为 not_observed；沿既定 frontier 路由，无子代理，不宣称换模。

## 未决、风险与下一步

- 需求理解未决：无。执行前置条件：确切本地实例、实际数据量/锁/WAL、权限与恢复保障尚未实测；未满足不得操作。不把这些未知写成已通过。
- 提交前失败应整笔撤销；COMMIT 结果不明须对账，不能盲重跑。已提交的业务删除不承诺恢复；新数据产生后原清理授权不可复用。备份/WAL/既有测试证据未纳入擦除，不能宣称安全擦除。
- **跨角色待同步**：102 冻结后端的跨角色事项、发布/数据安全仍使用“保留全部历史、不得删草稿或改组权限”的旧前提。建议审阅本交付后，经 gate 先交 backend-alex 仅对齐这次本地例外及事务执行边界，然后继续 frontend-bob 已批准范围的字段消费设计；不返回产品/UI，也不重做整个技术方案。
- CR-039/040 保持 open；当前建议状态为 awaiting_user_review，不修改正式 workflow、注册表、历史、UAT 或发布状态，不启动实现。

请审阅本次有限数据库交付及上述后端同步目标；不再重复确认清理白名单。本交接不能代替阶段迁移或数据库执行许可。
