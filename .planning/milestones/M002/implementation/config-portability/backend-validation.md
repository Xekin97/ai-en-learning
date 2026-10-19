---
milestone: M002
stage: implementation
role: backend-implementer/base
agent_name: backend-ethan
version: M002-BI-CR313-01
status: awaiting_user_review
date: 2026-10-16
---

# CR313 后端验证

## 结论与环境边界

CAP-501～504 / API-501～505 / DATA-501～506 的四类别后端实现已完成开发验证。所有数据库行为只在本轮 Docker `ww-cr313-impl-129` 暴露的 `127.0.0.1:51223` 上，由 `testdb.Open` 为每个 fixture 创建随机数据库并从空库执行迁移；只用 synthetic 账号、Key 和不可达 provider URL，0 次真实 provider 调用。没有迁移历史数据，没有连接或修改 UAT/生产数据库及服务。

最终检查通过：全 Go 单元测试、vet、cmd build、diff check；完整 platform/postgres、portability、admin、generation、growth、entitlement、HTTP 集成均通过。命令和首次失败/修复见 [test-log.md](evidence/backend/test-log.md)。

## BE-V / DB501-V 实际映射

| 验证项 | 实际测试名与证据 | 结果 |
|---|---|---|
| BE-V1 / DB501-V1 | `TestCurrentAndPlainExportsPreserveRequiredEmptyCollections`；`TestConfigPortabilityHTTPAdminCSRFAndSecretBoundary`；`TestCR313SensitivePortabilityPanicLogIsRedacted`；普通导出返回无 `api_key`，未进入 CredentialStore 读取分支；管理员/CSRF/安全头与日志脱敏 | PASS |
| BE-V2 / DB501-V2 | `TestEncryptedModelFileRoundTripAndTamper`、`TestPlainModelFileNeverAcceptsCredentialOrTargetReuse`、`TestPlanPresenceDistinguishesNullZeroFalseAndEmpty`、`TestStrictJSONAppliesToAliasesDepthNULAndEncryptedPlaintext`、`TestPortabilityRequestDecoderRequiresExactCaseAndNonNullPassphrases`、`TestApprovedNoticeVocabularyUsesNormalizedPresence`；含孤立 surrogate plain/encrypted inner | PASS |
| BE-V3 / DB501-V3 | `TestCrossCategoryAndHistoryProtectionBlockers`（被计划引用模型整批拒绝、item ever_issued/kind）；`TestModelCommitLateFailureRollsBackCredentialAndConfiguration`（末步 trigger 错误含 Key/配置/revision/receipt 全回滚）；`TestGenericModelConnectionsAtomicAndIsolated` | PASS |
| BE-V4 / DB501-V4 | `TestPlansCommitIsAtomicIdempotentAndResolveBlocksLateCommit`（四计划、priority 交换、显式 null/0/空集合、同ID幂等）；`TestPlanCommitRejectsChangedHistoricalImpactSnapshot`（account 状态投影和计数同一流） | PASS |
| BE-V5 / DB501-V5 | `TestCrossCategoryAndHistoryProtectionBlockers` 的已发放道具删除/kind 保护；`TestModelsItemsAndGrowthPreviewCommitRoundTrips/items` 使用 makeup/extra_credit/model_trial/plan_trial 四kind，验证含模型附属表的 export/current→parse→preview→commit；既有 `TestModelRetirementRefundUsesCurrentPointsAndSurvivesExpiry` 保留下架结算快照 | PASS；发卡与导入双时序没有单独并发 barrier 测试 |
| BE-V6 / DB501-V6 | `TestGrowthThresholdSwapRetirementAndSameIdentityRestorePreserveAward`；`TestGrowthRetirementPreservesHistoryAndRestoresIdentity`（当前计算过滤、未领退役禁止、已领 settlement 快照、恢复不重发）；成长 roundtrip 验证 pending/current 意图与四成就空集合 | PASS；04:00 实时时钟跨界未做 wall-clock 等待测试，票据学习日比较由相同提交路径覆盖 |
| BE-V7 / DB501-V7 | `TestPlansCommitIsAtomicIdempotentAndResolveBlocksLateCommit`（同ID重试、同CursorKey重建Service后resolve、resolve先到封死迟到提交）；`TestResolveUnavailableDatabaseRemainsUnknown`（关闭本fixture pool后仍为ErrUnknown，不写not_applied）；`TestPortabilityUnknownResponseUsesRecoverySemantics`（503 outcome_unknown + Retry-After:2）；原字节冲突/期限与末步失败回滚测试 | PASS；真实 TCP COMMIT ACK 丢失和进程kill未注入，不能由确定性pool关闭替代 |
| BE-V8 / DB501-V8 | KDF固定参数/随机salt+nonce/错口令/tag篡改；`TestPortabilityKDFGateCapacityRateAndRelease` 验证并发2、第三个拒绝、release恢复、每管理员10/min及窗口恢复；8/5/12MiB、16KiB token、10000/1000/50000与响应全量限额；receipt/权限/空库 migration/Verify | PASS；未做KDF RSS/延时压力基准 |

## BE501-06 逐接点闭环

| 接点 | 实施/现状证据 |
|---|---|
| admin provider/model current/edit/export | 修改 `model_providers.go`、`model_connections.go`、`models.go`、`model_batch.go`；活动列表过滤 provider/model retired，退役编辑/probe/batch reuse 返回 not_found；`TestCR313RetiredProviderIsAbsentFromCurrentAdminReadsAndEdits` |
| AI BindSpec / ConnectionKey / probe | 修改 `ai/connections.go`；新绑定和 Key 只读活动 provider/model，已绑定私有 snapshot 不变；admin probe 走活动检查 |
| entitlement / generation / preset | 修改 `entitlement/service.go`、`db/queries/entitlement.sql`、同步 `dbgen`，以及 generation service/preset preview/catalog/presets；当前候选同时检查 enabled、provider/model active；admin/generation/entitlement 三组 retirement integration PASS |
| growth 当前配置/普通编辑 | 修改 levels/achievements 读与 Save 约束；普通编辑不复活 retired；整类 portability repository 才按批准规则恢复稳定身份 |
| growth 达成/重算/个人投影 | 修改 settlement/operations/awards；新达成、next、pending、recompute 只含 active；个人列表保留本人已有历史 |
| growth Claim | Claim tx 内重查 `retired_at IS NULL`；退役未领拒绝，已领按 settlement snapshot 重放；同身份恢复不重复 award |
| admin user detail | 修改 `admin/user_detail.go`，当前等级只基于 active 规则，历史 award 仍从个人历史显示 |
| item/receipt/inventory/retirement/configuration | 原路径已先取共享/排他配置锁并保留 ever_issued、库存、模型卡、计划 trial、下架积分快照；reward model 可用性查询补 provider active；未扩大为全库历史扫描 |
| identity 与业务影响字段写方 | 核对 identity service/profile、generation charge/service、learning settlement/service、review submit/session、growth ledger/inventory/receipts/awards、maintenance cleanup：发布相关写事务已有 `business.LockConfiguration(..., false)`；admin 配置写为 exclusive。没有发现批准表内缺锁写方 |
| credential / startup | 0018 重定义 write/update：函数第一步 configuration `FOR UPDATE`、actor active admin、target/source active；replace 的管理 CAS 验 admin、内部 Put 分支保留且拒 retired legacy；server startup 的 pending URL 置于 exclusive config lock 且实际变化只推进一次 revision |
| 敏感 panic | `middleware.go` 对 portability 敏感路径只记 request_id 和固定 `reason=panic`；`TestCR313SensitivePortabilityPanicLogIsRedacted` 验证不含 panic 值/栈/源码路径 |

## 实施覆盖与保留边界

- 四类别均有 export→strict parse→preview→commit→read roundtrip；模型另含 encrypted credential replacement，所有连接都要求本包 Key，未 probe/provider。
- 预览输出真实逐字段 safe diff，added/removed 使用 null 单侧；连接 diff 排除 Key、嵌套 models，level diff 排除 source_id。10种批准 notice 全部由 presence/规范化元数据产生。
- 影响摘要使用 CursorKey 的 `config-portability/v1/impact` 域 HMAC；每类别单条有序流 SQL 同时产生历史身份/状态摘要和安全计数，没有 `jsonb_agg` 全库装载。
- 响应先完整序列化再写 header；current/preview/result 超限整次413，preview不泄露 token；export不完整422，普通导出不读/输出 Key。
- 未执行真实COMMIT ACK丢失、进程 kill、内存压力或 UAT/browser 测试；这些不能由本开发矩阵宣称PASS。DB不可用只在本fixture关闭pool后验证unknown语义。

## 源差异

相对 `cr313-implementation-entry-129/backend-before.json`：45个本需求 backend 代码/测试文件变化，5408行新增、108行删除；无删除文件。工作区另有被忽略的 `backend/.env`，不在本角色所有权和统计内，未读取或修改。完整清单见 [source-diff.md](evidence/backend/source-diff.md)。

