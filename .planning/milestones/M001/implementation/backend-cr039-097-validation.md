---
milestone: M001
stage: implementation
role: backend-implementer/base
agent_name: backend-ethan
status: awaiting_user_review
verdict: developer_pass_pending_independent_verification
date: 2026-09-08
change_request: CR-039
finding: QA096-01
authorization: TRANSITION-M001-097
implementation_started: true
---

# QA096-01 删除路径调查与保留策略确认请求

## 当前交付：删除例外实现与开发验证

已按 [USER-CLAIM-DELETE-001](../reviews/claimed-batch-delete-retention-exception.md)完成当前版本删除修复，**开发期 PASS，待独立 QA**。不再存在“是否批准该删除例外”的待决；QA096 原始 FAIL 保留，QA096-01 与 CR-039 尚不由开发角色关闭。下方调查原文是专项批准前的历史快照，不再代表当前实施状态。

### 改动与追踪

- `backend/internal/learning/service.go` 的 DeleteBatch 新增 12 行：使用 batch.id、batch.owner_id、claim.consumed_account_id 与 consumed 状态限定关联 claim 删除，在原事务内先删 claim，再删批次。无其他业务代码变更。
- 删除条件自身校验所有权，不依赖客户端；先取得 claim 行锁，与 ConsumeClaim 的首个锁对象一致。普通批次或已清理 claim 的批次不受影响。后续删除失败时整笔事务回滚，重复删除保持 404。
- 无表/列/约束/迁移、公开 DTO、模型映射、前端或旧版兼容改动。其他 consumed claim 的 24 小时清理 SQL 未改。旧技术原件与本次显式例外共同作为实施依据。
- 新增 `backend/internal/httpapi/claimed_batch_delete_integration_test.go`，通过真实 PostgreSQL 和 HTTP/服务组合覆盖 CAP-011/016、API-006/007、DATA-012/013/015/017、PAGE-005/006。新增行为是 SQL 事务逻辑，使用真实数据库回归验证，不以 SQL mock 替代约束、锁和回滚测试；已有单测全部执行。

### 定向行为与原始结果

| 范围 | 开发结果与证据 |
| --- | --- |
| RED 复现 | 同一新增 HTTP 测试在修改业务代码前得到 DELETE 500 / internal_error，期望 204，退出 1；[原始 RED](./evidence/cr039-097/red.log)保留，不记为通过 |
| 访客承接批次删除 | 删除 204、空体、no-store；详情、原 claim 重试、重复删除和新建该批次复习均为 404；[首轮结果](./evidence/cr039-097/targeted.log) |
| 权限与关联资源 | 缺 CSRF 403、他人 404、访客 401，拒绝后原批次/claim 可正常读取和重试；删除后搜索移除该批次，目标/位置/复习结果级联删除；单批次 session 消失，非空 range 保留另一批，删最后一批才移除空 range |
| 不恢复与计量 | 原 claim 不能给本人或其他账号重建资源，原运行不能重新创建 claim；原 generation run、credited_account_id、累计计数、quota_charged 保留，当前内容/复习统计下降 |
| 回滚与并发 | 持有批次锁使删除停在 claim 已移除但尚未提交的阶段，取消请求后确认 claim 与批次完整恢复；删除先行时阻塞的消费重试得到 404；8 轮双删除与双消费交错，每轮只有一次删除成功 |
| 24 小时与清理 | 未删除的新 consumed claim 保留且可重试；清理跳过删除中锁定的过期 claim；正常 24 小时清理仅删回执、不删批次，随后批次仍可删除 |
| 重复稳定性 | 回滚、并发、保留三项顶层测试各额外运行 5 次全部通过；[重复结果](./evidence/cr039-097/repeat.log)；并发交错合计 48 轮，不是生产压测 |
| 相关回归 | 草稿空 registry 生命周期、同版本真实进程重启保存/重试、普通批次删除及既有 204 消费者通过；[相关结果](./evidence/cr039-097/related.log)。TestDraftProcessHelper 在父测试进程按设计 SKIP，实际子进程重启测试 PASS |

### 命令、环境与候选

[checks.mjs](./evidence/cr039-097/checks.mjs)记录完整 Docker 参数；每项 `.json` 记录命令、退出码和耗时，`.log` 保存输出。固定现有 Go 镜像及 PostgreSQL 18.6；[环境](./evidence/cr039-097/environment.json)为独立 internal 网络、无宿主端口、tmpfs 合成数据库，不访问 UAT 数据。

- `go test -race ./... -count=1`：[单测](./evidence/cr039-097/unit.json)退出 0。
- `go test -race -tags=integration ./internal/httpapi -run '^TestClaimedBatchDeletion' -count=1 -v`：[定向](./evidence/cr039-097/targeted.json)退出 0，4 个顶层测试通过。
- 同目录 `-run '^TestClaimedBatchDeletion(Concurrency|Rollback|Retention)$' -count=5`：[重复](./evidence/cr039-097/repeat.json)退出 0。
- 同目录 `-run '^TestDraft|^TestNoContentConsumers' -count=1`：[相关](./evidence/cr039-097/related.json)退出 0。没有运行旧版兼容测试或全站 UI。
- `go vet -tags=integration ./...`、`go mod verify`、两份改动 Go 文件的 `gofmt -l` 均通过；格式检查输出为空。
- `docker build --network=none -t wordweave-backend:cr039-097 backend`：[构建](./evidence/cr039-097/build.json)退出 0。成功构建进度写在 Docker stderr，本脚本没有保留其成功进度文本；退出码与镜像身份已记录，不伪造构建日志。
- [候选](./evidence/cr039-097/candidate.json)：`wordweave-backend:cr039-097` / `sha256:ab12e7dec0a6a8beb55df2ec6a8174d01d288681215c1108cec997e6f99f8eee`，未覆盖 095 基线、未部署 UAT。
- [离线启动](./evidence/cr039-097/candidate-smoke.json)：现有迁移初始化全新合成库，以受限应用/AI 角色启动，readiness=ok，生成/模型行数均为 0，应用角色具备 claim DELETE 权限。该检查不是独立 QA 或候选完整业务验收。

### 自检、边界与交接

去除新增 12 行后 service.go 的 SHA-256 与本轮 baseline 完全一致；未触碰其他业务模块。[源码摘要](./evidence/cr039-097/source-manifest.json)、[收尾](./evidence/cr039-097/closure.json)、[证据 manifest](./evidence/cr039-097/manifest.json)保留修改范围和原件校验。临时环境清理仅针对本轮标签匹配的合成容器/网络；UAT、凭据和已有学习数据不变。

本轮新定向测试以已验证合成快照代替提供方输出，生成与承接调用生产服务；HTTP 覆盖删除及其权限/后续读取。没有把此测试称为真实模型造文质量测试。生产数据规模性能、UI、独立代理层验收不在本轮范围；真实模型调用 0，既有质量预算不恢复。

暂无需要新增用户决定的实施问题。下一步建议 qa-quinn 独立定向复验此删除修复及必要相邻链路。按 agt-backend-implement 止于开发报告和交接：未改 workflow/agents/history、未自判独立 QA PASS、未部署或发布。正式控制面仍保留启动前 current_code_started=false/implementation_completed=false 索引，后续门禁应按本交付接收，不据此重复实施。

风险等级 high；路由请求 strong / gpt-5.6-sol / high，actual_model/usage 未观测。无子代理、分支或 worktree；源码未提交。

---

## 以下为专项批准前的调查原文

## 结论

当前只完成只读调查，**尚未修复、测试或构建新候选**。QA096-01 / CR-039 保持未解决；QA096 对 QA094-01 当前版本重启路径已验证修复的结论保留，不重开旧版兼容。

[097 授权](../reviews/verification-cr039-097-rework-approval.md)同时保护 DB schema/约束与已批准 claim 保留策略，并要求两者的改变先取得明确确认。当前删除故障不能在这两项均原样保留的情况下修复，因此按 `agt-backend-implement` 的上游冲突规则暂停代码实施，提交以下一个窄范围决定；不自行返回产品/UI 或激活架构角色。

## 证据与因果关系

- [QA096-01 原件](../verification/cr039-096-findings.md)：当前版本新生成的访客资源承接到账号后，所有者删除返回 500，随后读取仍为 200；独立最小复现与重启后复现均保留。普通登录生成批次删除通过。这是既有 QA 证据，本轮没有重新执行。
- `backend/internal/learning/service.go` 的 `DeleteBatch` 在事务中直接删除所有者批次，没有处理关联的已消费 claim。
- `backend/db/migrations/0002_core_tables.sql`：`visitor_claims.consumed_batch_id` 外键为 `ON DELETE SET NULL`；但 `visitor_claims_state_consistent` 又要求 consumed 状态的该字段非空。删除被引用批次触发置空时违反 CHECK，事务失败，批次仍存在。
- [后端方案 §4.4](../technical/backend.md)及 [API §14](../technical/api/index.md)要求已消费 claim 保留 24 小时，用于同账号网络重试，没有规定主动删除批次时的例外。`backend/internal/maintenance/maintenance.go` 当前也按 consumed_at 超过 24 小时清理。
- [数据库 T9](../technical/database.md)与 CAP-016 / API-007 要求所有者永久删除批次及关联复习资源，不回退调用额度；现有删除事务未明确处理这项保留规则的冲突。

追踪：CAP-011/016、API-006/007、DATA-012/013/015/017、PAGE-005/006。依据只涉及当前版本正常数据，和旧版本兼容无关；没有证据将其断言为 095 新引入的问题。

## 待用户决定：主动删除时的窄范围例外

**建议 A，尚未批准：** 用户主动永久删除自己已保存的批次时，在同一事务中删除指向该批次的已消费 claim，然后删除批次及现有级联资源。删除完成后的原 claim 重试返回 404，不重新生成、不恢复批次、不允许其他账号承接。其他已消费 claim 仍保留 24 小时并沿用现有清理任务。

这只改变“明确删除批次”这一情形的 claim 保留，不变更 DB schema/约束、公开 DTO/路径、生成计数或额度，不增加旧版兼容。实现必须校验所有权、保证原子性，并与 ConsumeClaim 的行锁顺序协调，不能先删别人的 claim 或在删除失败时遗留部分提交。其对已批准保留策略的例外需要明确确认，不能把一般返工许可当作该确认。

另一条路线是 B：删除后仍保留 consumed claim 24 小时，但允许无批次引用的墓碑状态。这需要变更 DB 约束与重试处理，授权和验证范围更大，不建议作为本次最小修复。当前两种方案都没有实施。

不采用更改 consumed 为 active、伪造批次、软删除替代永久删除、暂时关闭约束、等待清理后才能删除，或删除现有用户数据来绕开问题。

## A 获批后的定向验证计划（未执行）

1. 访客生成、承接、删除得到 204；该批次随后不可读、不可搜、不可复习。普通登录生成批次删除仍正确。
2. 原 claim 重试得到 404，无资源复活、无第二次模型调用、无重复计数；重复删除沿用 404。
3. 非所有者、错误凭证、缺失 CSRF 不删除批次或 claim；失败事务回滚恢复原状态。
4. 承接重试与删除、两次删除、清理与删除的并发正确，无死锁或部分提交；请求交错结果按明确事务顺序验证，删除提交后的重试不能返回可用批次。
5. 其他批次的 claim 及正常 24 小时重试/清理不受影响；历史生成记录、累计调用与滚动额度不回退。
6. 仅使用隔离合成环境开展开发验证；交付新标识候选及证据后等待独立 QA 门禁，不部署 UAT、不恢复真实模型调用预算、不重跑全站 UI。

## 本轮操作与边界

- 单工作区、无子代理，见 [工作区计划](./backend-cr039-097-worktree-plan.md)。只读核对代码、批准文档、QA 证据与工作树状态；只写本报告、工作区计划和两个后端索引。
- QA096 manifest 的 27 项 SHA-256 均匹配。编辑前保护集合共 2655 个文件：backend/internal、backend/db、workflow、agt、当前技术/产品/QA 目录，以及 097 授权和质量交接。按排序路径与内容摘要聚合的 SHA-256 为 `ad0f22569d0b5226b9a26f5797ba65b21bdb2f38580205686cdbfc2da859a8e8`；此集合不含本轮四份允许编辑的文档。
- 编辑后同一保护集合数量与摘要完全一致，27 项 QA 证据仍全部匹配；四份文档本轮新增内容的相对链接均可解析。首次摘要输出过长导致 JSON 解析失败，改为在检查进程内汇总摘要后成功；没有据失败的检查宣称验证完成。
- 未修改业务代码、约束、技术/产品真源、前端或流程控制文件；未运行测试、数据库命令、容器操作、模型请求或部署。未读取凭据。真实模型调用 0；无临时运行资源可清理。
- 无新候选，返工基线仍是 097 指定的 `wordweave-backend:cr039-095` / `sha256:2f263a80f844c3489eeca8fdbc0a3091ac95816551319c74da9ae2f3d793b396`；不将它标记为可交 UAT。
- 路由请求 strong / gpt-5.6-sol / high，actual_model 与 usage 均为 not_observed；未宣称切换当前会话模型。

下一步仅请求用户批准 A 的主动删除保留例外。批准前不实施；后续需将该明确决定与受影响技术规则同步，不能静默留下相互矛盾的有效方案。正式状态、历史与角色注册表由守门器处理，本实现角色不自行改写。
