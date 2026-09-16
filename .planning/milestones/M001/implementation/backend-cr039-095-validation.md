---
milestone: M001
stage: implementation
role: backend-implementer/base
agent_name: backend-ethan
date: 2026-09-08
status: awaiting_user_review
change_request: CR-039
finding: QA094-01
authorization: TRANSITION-M001-095
contract_version: v1.4
implementation_started: true
real_model_calls: 0
---

# QA094-01 当前版本修复与开发验证

## 当前交付：USER-COMPAT-001 后的有限修复

**开发期结论 PASS，待独立定向验证。** 用户已明确取消首版旧版本兼容，本次只修当前版本有效草稿跨进程重启后的保存、放弃、访客承接及关联鉴权/幂等问题。未构建旧 v2 回滚候选，也不把旧格式/旧镜像兼容作为验收门槛。

依据：[095 原授权](../reviews/verification-cr039-095-rework-approval.md)、[USER-COMPAT-001](../reviews/first-release-compatibility-policy.md)、用户随后请求“继续”；追踪 QA094-01、API-005/006、CAP-010/011、DATA-009/011/012/017。原 T3/T4/T5 的持久化形状及原子性保留；不改公开 API v1.4、DB schema、前端、输入词库或 AI 映射算法。

### 实现及安全边界

- 生成令牌使用 32 字节随机 nonce，加 HMAC-SHA256 签名绑定主体类型、主体 ID 和 run_id。仍由原 generation_token 字符串返回，客户端保持内存中的不透明令牌；不新增字段、依赖或原文令牌持久化。不存在旧令牌格式回退。
- Save/Discard/CreateClaim 先验证签名，随后锁定本人运行并读取持久化终态。pending 草稿仍需匹配原 access_token_hash 并验证 expires_at；不是单靠签名就授权保存。
- Save 在同一运行行锁下检查已有批次，串行化并发请求；只有首次创建返回 201，合法重试返回同一批次 200。保存仍原子写全批次并删除临时草稿，不增加数据保留。已删除批次不能通过重试恢复。
- 草稿删除后的重复请求仍需签名和持久化主体/终态检查。终态重试按 completed_at 加原 registry 一小时保留窗口检查；pending 草稿以自身 expires_at 为准。没有新增生成超时，也不延长草稿 TTL。
- 访客创建 claim 同样验证原草稿 token 摘要；消费 claim 时增加草稿到期检查，防止“claim 未过期但原草稿已过期”绕过保存期限。同一 claim 不允许绑定另一账号。
- 保存、放弃、承接与清理统一先锁 run 再锁 draft；清理以 SKIP LOCKED 跳过正在操作的运行，避免相反锁顺序。活动生成仍由原运行进程控制，重启不恢复活动 AI 流；本次处理的是已完成且仍有效的草稿。

### 开发验证与原始证据

可复现命令由 [checks.mjs](./evidence/cr039-095/checks.mjs) 固化；每项 JSON 包含完整参数、退出码和耗时，对应同名 log。固定 Go 1.26.7、PostgreSQL 18.6；Go 检查禁用外部模块网络，集成测试仅连接新建内部 Docker 网络和一次性合成数据库。

| 检查 | 结果与证据 |
| --- | --- |
| 全后端 `go test -race ./... -count=1` | PASS；[unit.json](./evidence/cr039-095/unit.json) / [log](./evidence/cr039-095/unit.log) |
| 最后一次令牌单测（含合法编码但签名错配） | PASS；[token.json](./evidence/cr039-095/token.json) |
| 新增生命周期与实际进程重启集成 | PASS；[targeted.log](./evidence/cr039-095/targeted.log) |
| 相关 HTTP/DB 回归 | 7 个顶层测试 PASS，12 个生命周期子项 PASS；[related.log](./evidence/cr039-095/related.log)。独立运行时跳过的 TestDraftProcessHelper 是三个子进程实际调用的服务入口，不是漏测用例 |
| HMAC 验证器 fuzz，5 秒 | PASS，220,969 次输入；[fuzz.log](./evidence/cr039-095/fuzz.log) |
| `go vet -tags=integration ./...`、`go mod verify`、gofmt 检查 | PASS；[vet.json](./evidence/cr039-095/vet.json)、[modules.log](./evidence/cr039-095/modules.log)、[format.json](./evidence/cr039-095/format.json) |
| 当前候选构建 | PASS；[build.json](./evidence/cr039-095/build.json)、[candidate.json](./evidence/cr039-095/candidate.json) |
| 候选镜像离线就绪 | `/health/ready` → 200 / `ok`，使用 app/ai DB 角色，无模型/生成记录；[candidate-smoke.json](./evidence/cr039-095/candidate-smoke.json) |
| 保护范围及环境收尾 | 339 项基线中仅 5 个获准既有源码文件变化，另有 4 个新源码/测试文件；27 项 QA094 证据未变，UAT 四个容器身份/镜像/启动时间不变；[closure.json](./evidence/cr039-095/closure.json) |

实际重启测试通过正常 HTTP 注册、SSE 合成造文取得令牌，结束原 OS 进程后新建空 registry 进程：原草稿摘要和期限不变，首次保存 201；再结束保存进程并重启，原 token 重试 200 且 batch_id 不变。错误 token 在首次保存和草稿已删除后均返回 404，数据库仅一条批次，计量不重复。

其他定向断言覆盖 8 个并发保存、6 轮保存/放弃竞争、错主体、绑定错主体的签名、未签发给该草稿的 nonce、过期 pending/terminal、active/取消/各类失败不保存、访客承接和重复承接、错误消费账号、删除后不恢复、清理跳过运行锁。派生词批次保存后两阶段复习断言继续通过。相关回归复用了现有 HTTP E2E（其中含必要账号/配置步骤），未重跑全站 UI/用户管理设计矩阵。

旧 `TestCR039StoredSnapshotCompatibility` 没有作为本轮门禁执行；当前模型结构化协议的合成探针仍属于当前模型接入检查，并非旧版本兼容。

### 候选、范围及交接

- 当前修复候选：`wordweave-backend:cr039-095` / `sha256:2f263a80f844c3489eeca8fdbc0a3091ac95816551319c74da9ae2f3d793b396`，未部署 UAT。
- [9 项源码摘要](./evidence/cr039-095/source-manifest.json)、[证据 manifest](./evidence/cr039-095/manifest.json)、[工作区计划](./backend-cr039-095-worktree-plan.md)、[后端交接](../handoffs/backend-implementation.md)。
- 已清理本轮两个带 cr039-095 标签的临时容器、一个内部网络及其 tmpfs 合成数据，可由测试重建；候选镜像和证据保留。现有数据、凭据、模型配置、UAT 与历史镜像未修改；真实模型调用 0。
- 本轮没有产品失败测试结果；开发过程中修正过 helper 配置字段名，首次裸 shell 的数据库 URL 被 zsh 通配解析拒绝，改为参数数组执行。仅为开发/命令问题，不视为通过证据。未删除或降低当前版本测试断言。
- CR-039 / QA094-01 的当前版本部分仍待 qa-quinn 独立验收；原 QA094 FAIL 原件不改。旧版本部分按 USER-COMPAT-001 退出范围，不再要求架构返工。现阶段无需新的产品/UI/DBA 决定。
- 按 agt-backend-implement 止于本角色交付；不切阶段、不改 workflow/registry、不自动进入 QA、真实模型质量测试或部署。下一守门轮可接收本轮实际交付更新 current_code_started 等索引，再交独立定向复测。
- 路由请求 strong / gpt-5.6-sol / high，actual_model/usage 未观测；未启动额外模型会话或子代理。

---

## 历史调查（USER-COMPAT-001 已否决下述旧版兼容建议）

以下为取消兼容前的原始调查快照，不代表当前阻塞或待决。

## 结论

**BLOCKED / 待技术确认，不是修复完成或开发验证 PASS。** 本轮完成只读原因核对，未修改业务代码、未运行开发测试、未构建候选。QA094-01 与 CR-039 仍 open；原 QA094 FAIL 未被替代。

阻塞不在 AI 映射算法，而在批准的草稿跨进程兼容承诺与现有鉴权生命周期之间。095 允许单项返工，但明确不允许更换指定历史回滚候选或自行改变技术/DB 方案；本轮在该停止条件处交付。

## 输入与追踪

- [095 单项返工授权](../reviews/verification-cr039-095-rework-approval.md)、[QA094-01 原件](../verification/cr039-094-findings.md)、[QA094 报告](../verification/cr039-094-report.md)。
- [CR-039 后端方案 §6、§8、C39-15](../technical/backend-cr039.md)、[API v1.4 / API-006](../technical/api/index.md)、[后端 §4.4](../technical/backend.md)、[DBA T4/T5](../technical/database.md)。
- CAP-010/011，DATA-011/012/017：有效草稿原子保存、放弃、认证承接与重试；不修改正文映射、输入词库、复习答案或 UI。
- 当前开发基线：`sha256:557782d0cfb1d551d3897abbbe22f74c369e4f309e58c202b54c7137f9e03a5e`。
- QA 指定旧 v2：`sha256:642ed57ad0ed6c8a13e4bba1101d8b50188e8ea636791583a6ffb5eaa6917aac`。两项取自已接收证据；本轮没有操作镜像。

## 原因核对

1. `backend/internal/learning/service.go:58` 的 Save 在读取 DB 之前执行 registry.Authenticate。`backend/internal/generation/registry.go:52` 只查询当前进程的 runs map，缺项直接拒绝。
2. Save 在 `service.go:71` 之后已有本人 valid/pending 草稿的锁定、持久化 token hash 和到期检查，但跨进程请求尚未到达这里便失败。
3. Save 在 `service.go:66` 先检查已有批次并返回幂等结果，在 `service.go:88` 删掉保存后的草稿。**不能简单去掉 registry 校验**：已有批次分支没有替代的 token 校验，原草稿摘要也已被删除。需要明确首次保存与完成后重试各自的凭证来源、有效期、并发和删除行为。
4. Discard（`service.go:105`）和 CreateClaim（`service.go:139`）同样依赖 registry。ConsumeClaim 已按持久化 claim 摘要锁定与消费，不能把后者的可用性当成前三者已解决。
5. 原 `cr039_snapshot_integration_test.go` 的种子 helper 主动调用 Registry.Register，随后在同一进程保存和重试。它验证存储形状和复习快照，不覆盖空 registry 的进程重启；本轮不重复运行该测试来证明生命周期通过。

QA094 已用实际镜像证明：v2→v3、v3→v2、v3 同镜像重启后的保存均为 404；最后一项草稿内容摘要和过期时间未变。上述结果是引用原 QA 证据，**不是本轮重新测试**。已保存批次跨版本读取/复习原结果为 PASS，不属于此处损坏。

## 需要确认的最小技术调整（建议，尚未批准）

建议只交 backend-alex 做这一处技术修订，不重开产品或 UI：

1. 保留原旧镜像和原始失败证据；新增独立标识、可追踪来源的 **v2 兼容修复回滚候选**。新旧两条候选共用经验证的草稿持久鉴权修复；不把新候选冒称为原 hash，也不覆盖历史 tag。
2. 明确草稿存在时的持久鉴权、保存/放弃后合法重试的凭证与保留期限、访客承接、并发以及删除边界。保持错误主体/token 拒绝、原子性、不重复计数；不能单靠 run_id 和已登录账号跳过必需 token。
3. API v1.4、现有数据、词库和前端继续作为不变边界。若安全方案必须改变 DB schema 或原 T4 删除/保留约定，应在技术产物中明确提出并申请相应批准，当前未授权迁移或延长数据保留。
4. C39-15 保留旧草稿→新候选、v3 草稿→获批 v2 修复候选以及历史已保存批次的语义要求；补充实际重启和完成后重试测试。原未修复镜像的失败继续记录，不降格为 PASS，不以仅静态反序列化替代实际保存。

若坚持回滚目标必须是原不可修改的旧镜像，则仅改新版本不足以完成该承诺。需另行批准部署中的草稿处理策略；不能擅自让草稿失效、要求用户重新生成，或假设单实例就免于重启问题。本轮推荐上述独立修复候选方向。

## 开发期检查与未执行项

| 检查 | 本轮结果 |
| --- | --- |
| 工作区 / 语义身份 / 095 边界 | 已核对；backend-ethan，单工作区，既有未跟踪资产保留 |
| 源码与批准接口/事务静态对照 | 完成；原因与旧镜像边界如上 |
| 093 源码 manifest 的 28 个文件 SHA-256 | 全部匹配 |
| QA094 manifest 的 27 个证据文件 SHA-256 | 全部匹配；不重写 QA 结果 |
| 业务代码修改、单测、集成、lint、构建 | 未执行；等待上述技术决定 |
| 真实 AI / 合成提供方调用 | 均为 0；未创建测试环境 |
| UAT、现有凭据、模型配置、历史镜像 | 未操作 |

只读检查使用 `rg`、`sed`/`nl`、`git status --short` 和 Node crypto SHA-256。初次查询误用了不存在的 api-contracts.md、database-schema.md、backend/migrations 与 .planning/agents.yaml 路径；经文件发现改用 technical/api/index.md、technical/database.md、backend/db/migrations 和 .planning/agt/agents.yaml。路径查询错误不是产品失败，未修改或补建这些误写路径。

涉及原因核对的当前源码摘要：learning/service.go 为 `6993fae55de9e664ccd8b31021d0986d5a202d4d74cedd97cb332acd94591f32`，generation/registry.go 为 `63134adea0a357b4a945aa9920e3d6ee3c901bfb7007bb81f3f846be89b6423a`。

## 交付与下一责任

- 本轮文件：[工作区计划](./backend-cr039-095-worktree-plan.md)、本报告、主 backend-validation 索引及 [后端实现交接](../handoffs/backend-implementation.md)。没有新候选可交独立 QA 或 UAT。
- OPEN：用户是否允许上述有限技术修订。建议由守门器在确认后交 backend-alex 明确回滚候选与安全方案；开发不自行激活角色或修改 state/history/registry。
- 保留 UAT086 已接受、QA094 FAIL、CR-039/QA094-01 open；不恢复耗尽的真实调用预算，不重跑全站。
- 按已启用路由及鉴权风险请求 strong / gpt-5.6-sol / high；本轮未启动模型 CLI 或子代理，actual_model / usage 为 not_observed，不声称当前会话已换模。
