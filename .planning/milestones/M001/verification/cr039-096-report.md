---
milestone: M001
stage: verification
role: quality/base
agent_name: qa-quinn
date: 2026-09-08
status: awaiting_user_review
verification_round: TRANSITION-M001-096
verdict: fail_QA096_01
real_model_calls: 0
functional_uat: user_accepted_UAT086_unchanged
release_readiness: blocked
---

# QA096 当前版本独立定向复测报告

## 结论

**FAIL，1 项当前版本阻塞：QA096-01 访客承接批次删除返回 500。** 原 QA094-01 的同版本重启保存问题已独立通过；鉴权、幂等、过期、保存/放弃/认领并发、清理及关联两阶段复习的本轮覆盖均通过。新缺陷存在于当前候选，不是旧版兼容要求，不应恢复任何历史兼容门槛。

[问题完整复现与原因](./cr039-096-findings.md)、[覆盖矩阵](./cr039-096-coverage.md)、[后续人工清单](./cr039-096-uat.md)、[证据摘要](./evidence/cr039-096/manifest.json)。建议先有限返回 backend-ethan 处理删除路径，独立复验后再考虑真实模型质量测试；本角色没有自行修复或切阶段。

## 输入、身份与环境

- 当前状态 M001 / verification / quality/base / qa-quinn，注册表一致，语义名校验通过；[项目锁](../../../agt/project.yaml)引用 consumer-ai-web@1.0.0。
- [096 授权](../reviews/implementation-cr039-096-verification-approval.md)、[095 开发交付](../implementation/backend-cr039-095-validation.md)、[后端交接](../handoffs/backend-implementation.md)、[USER-COMPAT-001](../reviews/first-release-compatibility-policy.md)、API v1.4、当前产品能力和 DBA T3–T5。原 QA094 报告与失败证据保留。
- 后端候选 `sha256:2f263a80f844c3489eeca8fdbc0a3091ac95816551319c74da9ae2f3d793b396`，prompt m001-v3、validator m001-v3-wn31-r1；未构建或运行旧版本候选。
- [环境](./evidence/cr039-096/environment.json)：内部 Docker 网络、PostgreSQL 18.6 tmpfs、app/ai 最小角色、只返回固定响应的合成提供方；6197/6198 仅绑定环回地址。复用已存在前端镜像中的 Node 运行测试网关/提供方，**没有启动前端应用或浏览器矩阵**。
- 原 UAT086 四个容器身份/镜像/启动时间始终不变；未读现有密钥、未改模型配置、未接触现有数据库。28 次 chat 请求均到隔离合成替身（含失败探针及修正后的探针），**真实模型调用 0**。

## 关键独立证据

1. HTTP SSE 取得合法资源和内存 token，实际重启候选，草稿 payload/令牌摘要/期限不变；首次保存 201，再次重启重试 200、batch_id 相同、草稿删除、批次和计量不重复、没有额外提供方调用。
2. 错误主体、缺失/畸形/篡改/跨运行 token 在首次保存和草稿删除后的重试均被拒绝；过期返回 410，放弃后不可恢复。普通批次删除后重试不能重建资源。
3. 8 个并发保存只产生一条批次；保存/放弃四轮竞争，六次同 claim 消费和双账号争抢、两轮可控锁竞争及真实启动清理均符合当前原子性要求。
4. 同版本重启后的访客认领、重复消费、计量、错误账号拒绝和过期边界通过；保存资源精确可读，派生词在词条拼写阶段要求原词，短文阶段以实际词形作答，全部目标空位和短语提示空位保持。
5. 两个新访客承接批次不能删除，累计三个 DELETE 500；第二个最小复现没有时间/锁注入。数据库明确报 `visitor_claims_state_consistent`：删除 batch 触发 FK SET NULL，与 consumed claim 必须具有非空 batch_id 的 CHECK 冲突。详见 [定位摘要](./evidence/cr039-096/bounded-source-evidence.json)、[stderr 证据](./evidence/cr039-096/delete-constraint-evidence.json)。

## 执行记录与方法偏差

脚本位于 [evidence/cr039-096](./evidence/cr039-096/manifest.json)，从产品根目录以 Node 执行，不重跑开发 unit/lint/typecheck/build。

| 命令/证据 | 退出/结果 | 解释 |
| --- | --- | --- |
| `node …/setup.mjs` | 0 | 指定候选、独立迁移和合成配置；UAT 不变 |
| `node …/suite.mjs` | 1；1 PASS / 0 FAIL / 1 ERROR | 首个合成接入探针未包含要求的重复/不同词形 hint；[首次原件](./evidence/cr039-096/api-results-initial-fixture-error.json)保留，未进入学习生命周期测试 |
| `node …/suite.mjs --resume-setup` | 1；109 PASS / 2 FAIL / 1 ERROR | 修正探针后正常进入主链路；两项预期错误和一个时间夹具错误如下 |
| `node …/supplement.mjs` | 1；20 PASS / 1 FAIL / 0 ERROR | 只补测前提/预期错误与未完成项，发现承接批次删除失败 |
| `node …/concurrency.mjs` | 0；19 PASS / 0 FAIL / 0 ERROR | 独立控制竞争与真实清理通过 |
| `node …/delete-claim-repro.mjs` | 1；5 PASS / 3 FAIL / 0 ERROR | 普通用户路径再次确认同一个 QA096-01，重启后仍 500 |
| `node …/diagnostics.mjs` / `cleanup.mjs` | 0 / 0 | 只读定位、摘要保护及定向清理 |

方法偏差未掩盖为产品通过：

- 访客直存第一次误期望 403，公共 API 约定是 401 authentication_required；L08R 重新验证 401 且零批次。
- 上游在流开始前返回 HTTP 503，首次错误地复用只接受 SSE generation.failed 的 helper；L07R 按公共错误约定核对 503 generation_unavailable，并验证已产生运行的退款、零草稿/零批次及仅一次提供方调用。
- 首次仅把 claim.expires_at 移至过去，违反 expiry_after_create，属于测试夹具错误；补测同时移动 created_at 和 expires_at，保留真实约束并验证 410。
- 初始数据库日志读取只捕获 stdout，最小观测中的 constraint_evidence 为空；后续独立收集 stderr 得到三次相同约束失败，保留原件，不伪造原先已记录该证据。

[机器结果索引](./evidence/cr039-096/result-summary.json)保留所有首次失败和补测。多个重复断言对应同一个产品问题，不把 3 个断言 FAIL 报成 3 个缺陷；也不按总通过断言数声称里程碑完成。

## 范围、保护与收尾

- [收尾证据](./evidence/cr039-096/closure.json)：3955 项保护文件摘要全部不变，包括生产代码、批准专业产物、旧证据和 workflow/registry。独立环境四个容器、两个网络及一次性 tmpfs 数据已删除；删除前为 4 个合成账号、26 条运行、10 个批次、9 个 claim，0 活动运行。具体临时数据已移除，场景可由保留脚本重建；候选镜像和所有证据保留。
- QA094 未受影响的映射/UI/浏览器结果引用原件；本轮没有全站回归、全部失败组合/微秒边界穷举、真实模型造文质量、性能测评或 UAT 部署。详见覆盖矩阵。
- USER-COMPAT-001 持续有效：旧版本兼容不在范围，未构建旧版回滚候选；将来任何旧版兼容方案必须显著通知用户并由用户决定。
- 模型路由请求 strong / gpt-5.6-sol / high；实际模型和 usage 未观测，未启动额外模型会话/子代理，未声称切换主会话模型。

## 交接建议

PROPOSED：用户审阅后由 gatekeeper-owen 接收本报告，将 QA094-01 当前版本部分记录为独立复验通过，同时登记 QA096-01 为新的当前阻塞，并仅将其交 backend-ethan。若实施确需改 claim 保留或 DB 约束，再申请有限技术确认；不重开产品/UI，不默认批准任何旧版兼容。

本角色交付状态建议 **awaiting_user_review**；正式 workflow 仍 verification / qa-quinn / active，未自动关闭 CR-039、修改门禁状态、返工、发布或更新 UAT。原功能 UAT086 接受不撤销；真实模型质量尚未获本轮证据。
