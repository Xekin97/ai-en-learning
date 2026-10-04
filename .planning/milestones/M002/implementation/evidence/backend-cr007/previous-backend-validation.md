---
milestone: M002
stage: implementation
role: backend-implementer/base
agent_name: backend-ethan
status: awaiting_user_review
date: 2026-09-21
---

# M002 后端实施与自检

当前交付为 **CR-006 修复及开发自检通过，待 QA 独立复验**。TRANSITION-M002-019 已回溯 implementation / backend-ethan；本轮不修改控制面或质量结论。前端 CR-005 仍待其责任角色修复，完整 M002 验收仍为 FAIL。

<a id="cr006"></a>

## CR-006：下架积分配置修复

输入为 [QA2-F02 / CR-006](../changes/CR-006.md)、D2-51 / CAP-215/217、API-204/206、DATA-207/210/211 与 DB2-V09 / BE2-V10。无需修改产品、API 或数据库方案。之前的完整后端交付及报告保留于既有源码清单和[本轮修改前快照](evidence/backend-cr006/before-owned.tar.gz)。

生产改动仅 [item_definitions.go](../../../../backend/internal/growth/item_definitions.go)：在既有排他配置锁事务中，校验目标模型现存，并允许当前定义已持有的下架引用继续保存；新定义、新增下架模型和已删除后重新加入的旧引用仍拒绝。未更改退款逻辑、权限、配置版本、卡类型、发放快照或数据库迁移。允许保留旧引用并加入未下架模型；显式移除旧引用后不能借历史库存恢复该下架引用。

[正式 HTTP 回归](../../../../backend/internal/httpapi/m002_item_retirement_integration_test.go)覆盖创建/兑换/启用/正式移除/配置保存/预览/退换完整路径。原[过期后退款测试](../../../../backend/internal/growth/activation_integration_test.go)把直接 SQL 改价改成真实 SaveDefinition，避免绕开管理保存逻辑。

| 检查 | 结果与证据 |
|---|---|
| 修复前复现 | [red-confirmed](evidence/backend-cr006/red-confirmed.log)：服务层保存失败；HTTP PUT 下架积分 20→35 返回 422 `/effect/model_ids invalid_reference`。初次 harness 误写兑换字段导致 400，已按契约改为 definition_id，原 [red.log](evidence/backend-cr006/red.log) 保留，不把 400 计作应用缺陷 |
| 修复后定向回归 | [green](evidence/backend-cr006/green.log)通过；随后补充模型集合快照与混合引用断言，以最终 HTTP 日志为最终源码的证据 |
| 最终 HTTP / 事务回归 | [integration-http](evidence/backend-cr006/integration-http.log)：2 个顶层测试通过（另含 5 个负向子用例），含原子配置丢失提交回执；0 skip；race 启用 |
| 成长/管理相关回归 | [integration-growth-admin](evidence/backend-cr006/integration-growth-admin.log)：33 个顶层测试通过、0 skip；race 启用，覆盖相关发奖/快照、退款、并发兑换、类型与配置等既有行为 |
| 全后端单元检查 | [unit](evidence/backend-cr006/unit.log)：`go test -race ./... -count=1 -timeout=120s` 通过；未把无 integration 标签的检查称为全量 SQL 集成 |
| 静态/编译 | [vet](evidence/backend-cr006/vet.log)、[build](evidence/backend-cr006/build.log)、[format](evidence/backend-cr006/format.log)通过；依赖和迁移未改，不重跑不相关漏洞扫描或恢复演练 |

实际通过的关键断言：已用和未用卡在正式下架后均有资格；后台 20→35 保存并更新 revision；旧保存 revision 冲突，旧退款预览返回 preview_stale；新退款只发 35；同键重试返回同一收据；后台再改 50 后，已退卡换新键也仍返回原 35，不补差，尚未退卡收到 50。最终余额 85，恰好两条退款结算。失败保存不改变配置或 revision；新增下架/未知模型、重复引用和负下架积分拒绝。定义加入新模型、移除旧模型后，原库存模型集合、作用参数与启用期限摘要均不变。

环境为 Go 1.26.7、新建 PostgreSQL 18 隔离临时实例；HTTP 使用实际服务和数据库、仅合成账号，提供方地址不可达，真实 AI 调用为 0。用例自动清理所属测试库；本轮专用实例已[停止](evidence/backend-cr006/environment-stop.json)，既有预览/UAT 服务未修改。测试日志是开发证据，不替代 QA 浏览器复验或用户验收。

本轮准确代码为 [284 文件源码快照](evidence/backend-cr006/backend-source.tar.gz)、[源码清单](evidence/backend-cr006/source.json)和[增量](evidence/backend-cr006/source-diff.patch)：相对此前交付仅改两个已有 Go 文件，新增一个 HTTP 测试。开发检查命令、退出码、保护/链接核对见[当前清单](evidence/backend-cr006/manifest.json)。没有创建提交。

QA 的报告、原始失败日志与 CR 提出版本保持不动；CR-006 保持 OPEN，本角色修复状态由本报告及交接记录为 implemented_pending_qa。不得因后端自检通过关闭 QA2-F02 或将首轮验收改成 PASS。

## 此前完整实施基线与证据

授权 TRANSITION-M002-016；输入 PRODUCT-03、UI22/H01、DB-03、BE-03、FE-02，批准记录见[技术阶段审阅](../reviews/technical-design.md)。基线 HEAD `5da571b226635113c41cd9cb8c4f33433946fbad`；本次为未提交工作区，准确代码在[源码快照](evidence/backend-source.tar.gz)，文件及快照摘要在[最终清单](evidence/backend-final-manifest.json)。

- [完整 race / SQL 集成原始记录](evidence/backend-validation-20260920T080845Z.json)：Go 1.26.7，PostgreSQL 18.6 独立临时实例；`go test -race -tags=integration ./... -count=1 -timeout=360s` 通过，292.79 秒。运行配置显式清空真实模型测试密钥和模型选项。
- 同记录的 `go test -race -tags=uatdiagnostics ./... -count=1 -timeout=90s` 通过，23.08 秒。普通构建与诊断构建均通过；这不是实际 Linux tmpfs 部署验收。
- [最终格式、vet、build、安全检查](evidence/backend-final-checks.json)全部通过；gofmt 输出为空，`git diff --check` 通过。sqlc v1.31.1 已生成当前模型和查询。[生成记录](evidence/backend-sqlc.log)
- govulncheck 未发现本程序可达或已导入包的漏洞；另报告依赖模块中的三个未导入问题 GO-2026-6355、GO-2026-6354、GO-2026-5932，涉及 ssh/openpgp，不能表述为整个依赖模块没有通告。[原始报告](evidence/backend-final-vulnerability.log)
- 完整测试之后增加的提交响应丢失、事务末尾失败、取时顺序和资料/标题检查，以及权限收紧、预设查询常量提取，均有[补充命令与结果](evidence/backend-final-manifest.json)。该清单列出与完整测试版本的逐文件差异；生成服务另有一处 SQL 尾随空格清理。

## 实施覆盖

| 验收与能力 | 已实现、实测的后端范围 | 代码和测试入口 |
|---|---|---|
| BE2-V01/02；CAP-002–020、101–103、209、220 | 原登录注册/密码/语言/注销、模型计划用户与复习库流程继承；欢迎事实、昵称/性别、私有标题及版本冲突。访客/其他用户/管理员不能改本人标题，编辑不改正文和时间 | [HTTP 回归](../../../../backend/internal/httpapi/e2e_integration_test.go)、[资料/标题与未知提交](../../../../backend/internal/httpapi/m002_identity_configuration_integration_test.go)、[后台](../../../../backend/internal/admin/m002_integration_test.go) |
| BE2-V02/17；DB2-V01–16 | 0008–0013 增量迁移，13,860 个稳定词汇身份；旧内容/复习布尔事实/累计与当前额度保留；不初始化奖励或自动激活。app 不能读密钥、改删账本、硬删模型或增删固定计划；AI 不读个人成长 | [迁移与约束](../../../../backend/internal/platform/postgres/m002_integration_test.go)、[结构验证](../../../../backend/internal/platform/postgres/m002_verify.go)、[恢复记录](evidence/backend-restore.log) |
| BE2-V03–05；CAP-201–204；DB2-V17/18 | 固定题序/稳定匿名 ID、半截/错/空答案整批提交、一次性对照、最小回执、不留答案历史；重来与范围替换。四批概况 3/1/2/1 → 重来保持 → 新提交 3/2/1/0；同时间按 attempt_no 取最新；中途创建失败回滚，旧页面拒写 | [复习集成](../../../../backend/internal/review/m002_integration_test.go)；本机 IndexedDB 和页面前后切换由前端验收 |
| BE2-V06/07/16；CAP-211/216/218 | base/trial 分账、同计划基础重置不清体验、次数卡原来源一次退款、启动恢复；普通/预设共用主体额度和 active 限制。预设允许平台配置超过访客计划限制，执行仍扣真实主体次数；预览独立、不签到、不收录、不占用户额度 | [额度](../../../../backend/internal/entitlement/quota_integration_test.go)、[预设 SQL](../../../../backend/internal/generation/presets_integration_test.go)、[HTTP 预设](../../../../backend/internal/httpapi/m002_presets_integration_test.go)、[原 SSE 故障](../../../../backend/internal/httpapi/generation_races_integration_test.go) |
| BE2-V08–11；CAP-211–216 | 有效生成自动签到、首次词汇掌握去重、保存/复习事实；历史补签规则和正向积分补差；签到自动、其余手动领奖且整档原子；逐模型双向叠加、计划优先级覆盖/续期、动态下架积分、过期前已取得资格保留；兑换/补签并发防重复 | [成长与道具测试](../../../../backend/internal/growth)、[复习掌握测试](../../../../backend/internal/review/m002_integration_test.go) |
| BE2-V12/13/18–21；CAP-205/210/214/217 | 双语消息完整语言对回退、安全 Markdown、隐藏/提醒排序、稳定分页；模型探针事务外、计划优先级交换、类型卡引用和已发行保护；签到五值/等级/成就整组原子保存、说明往返、隐藏行参与校验、最多一次版本推进、确认绑定 | [通知](../../../../backend/internal/notices/service_integration_test.go)、[成长配置](../../../../backend/internal/growth/configuration_integration_test.go)、[真实丢失 COMMIT 回执](evidence/backend-profile-config.log)、[延迟约束及取时](evidence/backend-atomic-clock.log) |
| BE2-V14/15；CAP-219 | 固定访问事件及独立浏览器身份、跨登录 UV 去重、30 分钟跳出；注册/7 日激活与 D1/D7/D30 指定日留存、WAU 去重、空复习不算活跃、生成失败率 3/1/1/1=25%、迟交复习归原队列；90 天读取过滤/物理清理、注销浏览器关联清除、未知与观察中不伪造零 | [分析 SQL](../../../../backend/internal/analytics/analytics_integration_test.go)、[应用角色 HTTP](../../../../backend/internal/httpapi/m002_analytics_integration_test.go)、[运维指标](../../../../backend/internal/observability/operations_integration_test.go) |
| BE2-V07/15–17；运维 | 预设草稿/发布指针与不可变预览；标题改动重用预览、配置改动必须重生成；清理保留当前/在途及复用预览依赖，过期正文版本清除后保留用量元数据。未知成本保留 null，已报告零及十进制精度保留。维护统一主体锁序、遇忙跳过、成长后台仅判定资格 | [预设清理/用量](../../../../backend/internal/generation/presets_integration_test.go)、[供应商 usage](../../../../backend/internal/ai/usage_test.go)、[维护角色](../../../../backend/internal/maintenance/m002_integration_test.go)、[成长后台](../../../../backend/internal/growth/operations_integration_test.go) |
| CAP-208；BE2-V17 | 随机选词排除已选与当前本人复习库，删除对应库内容后可再次成为候选，不误用累计掌握集合 | [随机词测试及查询计划](evidence/backend-random-plan.log) |

接口追踪沿 [BE-03 能力表](../technical/backend.md)和[当前 API 入口](../technical/api/index.md)，覆盖 API-001–008、101–103、201–209、900 的本期后端职责；页面视觉和交互不由上述接口测试替代。

## 数据与运行检查

一期迁移 0001–0007 与 HEAD 原字节一致；4,972 个受保护文件未变化，包括控制面、上游批准稿和前端。新迁移没有执行生产迁移或沿用 CR-040 清库授权。旧破坏性命令在当前迁移集合下拒绝执行，并验证拒绝前后数据摘要一致。

隔离恢复用真实 pg_dump/pg_restore 比较了 60 张表的全部行摘要，随后再次迁移仍相同。临时数据库实例已在检查结束后[停止](evidence/backend-test-environment-cleanup.json)。该演练证明合成数据库的恢复完整性，不证明已有生产备份、PITR 或 RPO/RTO。出处：[恢复原件](evidence/backend-restore.log)。

查询计划实测：随机候选使用完整 13,860 词词表，执行约 3.87ms；公开预设目录和完整样文查询见[原件](evidence/backend-preset-plans.log)。预设样本为单个预设，不能外推大规模内容、用户增长或生产 SLO。北京 04:00 边界由日期单测验证，真实 PostgreSQL 锁等待测试验证业务时间在取得配置锁后采样；未等待真实凌晨进行现场演练。

运行说明、显式成长激活命令、维护与监控参数在 [backend/README](../../../../backend/README.md#m002-operation-and-migration)。运营奖励留待管理员配置，不导入原型奖励值。预设旧版本清理允许已结束预览的 draft_version 变 null，用量与调用事实保留；当前样文和在途版本不受影响。

## 修复记录与范围限制

旧 HTTP 测试曾使用共享 app/AI 连接池，在并发预检时耗尽连接；测试已按实际部署拆成独立连接池并使用 AI 数据库角色。旧测试的 actions、session 外层字段、无 revision 管理写入、按 generation_runs 直接推计额度已按批准的 M002 契约调整，仍保留所有权、删除级联、累计、原源退款和故障断言。旧直接造运行记录的测试补建对应 charge，不在生产读取时猜测缺失费用事实。原始失败记录在[最终清单的 prior_investigations](evidence/backend-final-manifest.json)中保留。

前端实施交付与第一轮 QA 已发生；当前剩余浏览器/本机草稿、完整覆盖及部署环境范围以[QA 报告](../verification/report.md)为准，不沿用旧交接将已完成开发接入写成未开始。CR-005 交前端；CR-006 本轮修复后待 QA 复验；本轮不扩大为 Nginx、真实容量或部署验收。

CR-001/002 继续开放到完整应用验收；CR-003/004 的设计关闭保持，后端结构及原子保存已有上述运行证据，仍不替代前端接收验收。CR039-L1、CR042-L1、AI-QUALITY-90 原状态不变；没有进行新的真实模型调用或宣称 90% 质量目标已达成。
