---
milestone: M001
role: backend-implementer/base
agent_name: backend-ethan
status: delivered_verified_with_retained_limitations
maintenance: M001-AGENT-CONTEXT-001
---

# 后端：当前验证基线与回归入口

应用提交 `387c775534844ff0b8ca9857523dc39c1d8ee87a`；prompt `m001-v5-r10`，validator `m001-v5-wn31-r2`，源码版本见 [contract.go](../../../../backend/internal/ai/contract.go)。开发结果已由 QA132、134 和最终 138 接收；当前不再等待独立 QA 或架构同步。

## 最新适用证据

| 范围 | 既有结果与原件 | 不证明什么 |
| --- | --- | --- |
| AI/HTTP/诊断、纠正与续写 | [r10 开发验证](./evidence/corrections-r10-20260912/verification.json)：相关包 race 通过；两轮 HTTP 共 49 个不同场景；go vet/build 通过 | 不把重叠场景相加为 53，不证明真实模型质量 |
| 原词释义/结构迁移/本地切换 | [CR040 后端](./evidence/cr040/backend-developer.json)、[QA107](../verification/evidence/cr040/manifest.json) | 已完成的一次性切换不是可以重复清库的授权 |
| 受控证据通道 | [CR042 当前契约](../technical/backend.md#generation-evidence-042)、[QA132](../verification/evidence/closeout-132/qa.json)及其开发证据引用 | 单回复 replay 不覆盖整包多回复、真实退款或浏览器 |
| r10 真实样本 | [两模型 10 次](./evidence/corrections-r10-10-20260912/results.json)、[Luna 5 次](./evidence/luna-r10-5-20260912/results.json) | MiniMax 4/5、GLM 5/5、Luna 5/5 分开统计；不能证明长期 ≥90% 或纠正有效救回 |
| 独立业务闭环 | [QA132](../verification/evidence/closeout-132/qa.json)：8 个合成场景，包括保存、取消、离开、退款恢复 | 首轮观察方法调整后重跑，总 16 次合成生成不等于 16 个不同验收场景 |

本次整理只做静态来源/摘要核对；旧证据不改写。本表不把历史基线检查当作本次重新执行。

<a id="执行与回归入口"></a>
## 执行与回归入口

从项目根目录开始；Go 工具链以 [Makefile](../../../../backend/Makefile) 的固定镜像为准（Go 1.26.7）。普通包测试可用 `make -C backend test`，静态检查 `make -C backend lint`。需缩小范围时，在 backend 目录使用同一工具链：

```sh
go test -race ./internal/ai ./internal/generation ./internal/generationtrace ./internal/generationevidence ./internal/httpapi ./internal/diagnostics
go test ./internal/ai -run 'TestCorrection|TestContinuation' -count=1
go vet ./...
```

涉及 SQL/事务时，用独立可丢弃 PostgreSQL 18 环境设置 TEST_DATABASE_URL，再运行原证据对应的 `-tags=integration` 场景。账号必须有创建隔离临时库的权限；先阅读目标测试的环境要求。Makefile 的 `test-integration` 使用固定 wordweave Compose 名和网络，**不是隔离环境保证**，不得直接套在当前 UAT 上。

- 词形/标注/释义：internal/ai 的 cr039、cr040、annotations、validator 测试。
- 纠正/续写/取消/结算：corrections、continuation 测试及 internal/httpapi 的 HTTP 矩阵，命令和环境见 r10 原件。
- 证据身份/TTL/容量/竞态：internal/generationevidence、generationtrace、diagnostics；普通包通过不代替诊断构建专属验证。
- 数据迁移/幂等/所有权/claim 删除：internal/platform/postgres、learning、review、httpapi 的对应集成测试；先对照 DB40 与 USER-CLAIM-DELETE-001。

预期结果是相关断言通过且保护边界不变；最终完成条件取决于实际任务的验收，不能只看 exit 0。没有代码变化时可复用匹配版本的证据，不机械执行全部命令。

## 保留限制与实验恢复

CR039-L1、CR042-L1、AI-QUALITY-90 见[当前报告](../verification/report.md#收尾核对与保留事项)。用户已停止调优，历史调用预算已用完，不自动恢复模型探测/采样。

Luna 5 次临时模型关联已撤下；原文最长 24 小时且留在私有 tmpfs。本次不能重新读取这些已过留存窗口的原文，也不从 /tmp 路径承诺恢复。脱敏结果、代码、配置摘要与历史判断可追溯；新实测须重新明确范围和预算。详细比较、耗时与用量保留在[整理前 Git 原文](../handoffs/archive.md)，不占默认交接。
