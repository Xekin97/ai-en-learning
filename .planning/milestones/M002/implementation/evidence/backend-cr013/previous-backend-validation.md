---
milestone: M002
stage: implementation
role: backend-implementer/base
agent_name: backend-ethan
status: awaiting_user_review
date: 2026-09-22
---

# M002 后端实施与自检

当前交付为 **CR-011 搜索规范化修复，开发检查通过，待 QA 独立复验**。授权 [TRANSITION-M002-029](../reviews/verification-rework-029.md)，活动角色 backend-ethan；只处理 QA2-F07。QA05 的 13 PASS / 1 FAIL、质量原件与控制面保持原样，本报告不宣布二期验收通过。

<a id="cr011"></a>

## CR-011：书架完整词条搜索与分页

依据 [CR-011 / QA2-F07](../changes/CR-011.md)、CAP-013 / AC-013、API-007、PAGE-005、DATA-002/012/013，以及 BE2-V02 的一期能力继承要求。既有契约已要求大小写规范化精确匹配及规范化筛选绑定游标，没有新增产品解释、数据或迁移。

[learning/service.go](../../../../backend/internal/learning/service.go) 提供统一的 `NormalizeEntryQuery`：去首尾空白、转小写，保留内部空白和标点。服务查词与 [HTTP handler](../../../../backend/internal/httpapi/learning_handlers.go) 构造游标 scope 共用此函数，消除查词与分页使用不同输入的风险。scope 继续绑定账号和完整目标词；原小写游标仍兼容。缺省或显式空 entry 沿原行为返回整个书架，纯空白、非法词和前缀仍 422，不扩展为标题、标签、正文或模糊搜索。SQL 索引查询与排序不变。

本轮只改两个生产文件，新增 [规范化边界单测](../../../../backend/internal/learning/query_test.go)和 [真实 HTTP / PostgreSQL 回归](../../../../backend/internal/httpapi/m002_library_search_integration_test.go)。相对 backend-cr007 的准确增量见 [source-diff](evidence/backend-cr011/source-diff.patch)。

| 检查 | 结果与原件 |
|---|---|
| 修复前复现 | [red](evidence/backend-cr011/red.log)：小写成功，LEARN / Learn / 首尾空白与跨大小写续页 422；直接服务调用也失败。退出 1，实际产品缺陷，无夹具修订 |
| 新定向 SQL 回归 | [green](evidence/backend-cr011/green.log)：1 个顶层测试、6 组行为通过，0 skip，race 开启。合法大小写/空白同结果；双向跨大小写分页无重复；改词、跨账号及无效游标拒绝 |
| 相关 HTTP 回归 | [integration-http](evidence/backend-cr011/integration-http.log)：5 项通过、0 skip，race 开启；M001 端到端、资料及私有标题、已领取批次删除、204 消费、管理员搜索游标 |
| 全后端单元 | [unit](evidence/backend-cr011/unit.log)：`go test -race ./... -count=1 -timeout=120s` 通过，包括 10 项规范化边界；不把无 integration 标签的执行称为全量 SQL 集成 |
| 静态与编译 | [vet](evidence/backend-cr011/vet.log)、[build](evidence/backend-cr011/build.log)、[format](evidence/backend-cr011/format.log)、[diff-check](evidence/backend-cr011/diff-check.log)通过；格式输出为空 |

定向回归使用实际登录、签名游标、wordweave_app 受限数据库角色和真实词库；建立同一时间的两批本人内容（一批暂停）、第三批实际删除及他人批次，再核对返回 ID 和分页顺序。仅标题 book、仅标签 study 均不命中；未登录 401、管理员访问学习者入口 403，后台只读列表仍可用；所有搜索前后的六项统计完全一致。没有用空数据断言代替用户隔离检查。

环境为 Go 1.26.7、新建 PostgreSQL 18 隔离实例；定向用例供应商不可达，原 E2E 只用本地确定性 provider，真实 AI 调用 0。每个 SQL 测试独立建库并清理，专用实例已[停止](evidence/backend-cr011/environment-stop.json)，原预览服务未改动。

当前准确版本见 [287 文件源码清单](evidence/backend-cr011/source.json)、[可恢复归档](evidence/backend-cr011/backend-source.tar.gz)及[命令/结果/保护清单](evidence/backend-cr011/manifest.json)。依赖、13 份迁移、API 和 frontend-cr010 不变；没有提交或部署。6,377 个已有受保护文件保持不变，包括 QA05 证据、CR 原稿和控制面。

CR-011 原稿保持 OPEN；实现进度在本报告与交接标为 implemented_pending_qa。独立 QA 仍须以当前后端和 frontend-cr010 复验原 CR 场景，尤其浏览器真实大写搜索、筛选清空及续页；此处 HTTP 开发检查不替代页面或整期验收。

<a id="cr007"></a>

## CR-007：已验证的已领取游客短文注销修复

QA03 复验后 TRANSITION-M002-025 已限定关闭 CR-007/008。账号锁内先删除本人 consumed claim、再执行原分析清理和账号级联删除；回滚、并发、他人隔离等证据见 [backend-cr007 manifest](evidence/backend-cr007/manifest.json)。完整原报告保存在[本轮修改前报告](evidence/backend-cr011/previous-backend-validation.md)，原代码和日志不变，不再列为待前端实施事项。

<a id="cr006"></a>

## CR-006：已验证的下架积分 API 修复

QA02 / TRANSITION-M002-022 已限定关闭后端缺陷，后续前端 CR-008 已于 025 关闭。下架引用保留、新增引用拒绝、即时退款与幂等原证据见 [backend-cr006 manifest](evidence/backend-cr006/manifest.json)及[原报告](evidence/backend-cr007/previous-backend-validation.md)，本轮未改其代码。

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

前端当前交付为 frontend-cr010；QA05 为 13 PASS / 1 FAIL，CR-011 修复尚待独立复验。剩余浏览器/本机草稿、完整覆盖及部署环境范围以[QA 报告](../verification/report.md)为准。CR-005/006 已按 022、CR-007/008 按 025、CR-009 按 027、CR-010 按 029 在限定缺陷范围关闭。本轮不扩大为 Nginx、真实容量或部署验收。

CR-001/002 继续开放到完整应用验收；CR-003/004 的设计关闭保持，后端结构及原子保存已有上述运行证据，仍不替代前端接收验收。CR039-L1、CR042-L1、AI-QUALITY-90 原状态不变；没有进行新的真实模型调用或宣称 90% 质量目标已达成。
