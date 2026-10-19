---
milestone: M003
stage: technical-design
role: dba/base
agent_name: dba-diana
status: awaiting_user_review
version: M003-DB-04
date: 2026-10-12
---

# M003 数据库最小增量

当前为 **M003-DB-04 / CR306-DB 定向设计已交付、待独立接收**。输入为 [PRODUCT09](../handoffs/product.md)、[BE07 / BE7-DB](backend.md#be7-db)、[API-306](api/administration.md#api-306)、[DATA-306](../product/data-assets.md#data-306)和[070门禁](../reviews/cr306-backend-gate-070.md)。本轮持久化规则从 [DB4-01](#db4-cr306)进入，DB3业务规则继续有效；整版不是实施或阶段批准。Profile仍consumer-ai-web@1.0.0，路由v1；requested gpt-6-astra/high，actual_model与usage unknown。

CONFIRMED来源为 USER-M003-CUSTOM-PARAMETERS、USER-M003-CR306-REPAIR及[USER-M003-NO-DATA-MIGRATION](../reviews/requirements-feedback.md#未上线项目无需数据迁移user-m003-no-data-migration)。每模型JSON方向已确认；列、CHECK、服务/DB分工是授权内专业定稿，待接收而非用户逐字段批准。保留同模型共同Plan→Writer、付费固定编辑/审稿、基础2与内容N0–99、Q02、一次扣次、180/600秒及m003-content-v5/m003-stream-v5。

DB03两份原件已与[冻结清单](../reviews/evidence/cr306-design-baselines/database-before-manifest.json)和[源包](../reviews/evidence/cr306-design-baselines/database-before-cr306.tar.gz)逐字核对，旧审批/证据只证明原版。DB3-01/08/09清理过期实施/迁移描述，DB3-V01–06保留有效验收且撤销旧库升级任务；CR-302和其他保留事项不关闭。仅本DB正文、交接、定向证据及CR的DB处理段由dba-diana维护。

## DB3-01 现状、选项与范围

**源码事实（非目标库事实）**：TECH03已有实现和合成QA；本轮只读确认 `entitlement.PipelineVersion="m003-content-v5"`，现有 `0017_m003_content_review.sql`、两类受理和配置写入代码均存在。CR306的custom_parameters和安全快照尚未实现；不能沿用DB03早期“v2/100/2/0017未适配”作为现状。未连接数据库、未查现UAT配置。USER-M003-NO-DATA-MIGRATION明确覆盖旧版因部署状态未知提出的升级分支，当前只设计未发布schema和可丢弃空库初始化。单 PostgreSQL，四计划库内代码为 `visitor/registered/pro/plus`，API 的 `basic` 映射 `registered`，不能新增第五行。`growth_settings.revision` 是现有全局配置版本；`business.LockConfiguration` 先拿配置共享/排他锁，之后读取业务时间。`entitlement.Resolve` 只选基础/试用中优先级胜出的一份计划；模型卡、额外次数另行合并。

`generation_runs` 已承载逻辑请求、模型快照和终态，`generation_charges` 一请求一扣额来源；`ai_call_usage` 一提供方尝试一行（现实现先写 unknown 再调用）。预设已有不可变版本、预览 run、有效 payload 及手动发布指针。依据：`internal/admin/groups.go`、`internal/entitlement/service.go`、`internal/generation/{service,charge,usage,presets,preset_preview,preset_cleanup}.go`（均相对 `backend/`）。

选择直接扩展上述表，保留现有主键/FK/隔离/结算，不建独立权益、审稿任务、正文副本或统计平台。单列比 JSON 权益 blob 更易约束四行合法组合；调用事实放在既有 usage 行，比新增计数表更少双写。没有真实容量/慢查询证据，不新增索引、队列、分区、物化报表或通用审计表。

## DB3-02 计划配置（DATA-301；CAP-303）

`wordweave.entitlement_groups` 增加：

| 字段 | 类型 / 可空 / 默认 | 约束与用途 |
|---|---|---|
| `content_review_enabled` | boolean NOT NULL DEFAULT false | 增强固定编辑＋审稿＋条件返修服务开关；N0仍共同规划 |
| `content_repair_limit` | smallint NOT NULL DEFAULT 0 | 整数0–99；不是技术恢复预算 |

命名 CHECK `entitlement_groups_content_service_valid`：`(NOT content_review_enabled AND content_repair_limit=0) OR (code IN ('pro','plus') AND content_review_enabled AND content_repair_limit BETWEEN 1 AND 99)`。基础原生校验恒有，不设可关闭字段；基础全请求2次为后端系统策略、全部计划只读，不新增可编辑列，当前数值由m003-content-v5 / m003-native-policy-v1定位。无只审不修、普通增强或独立审稿模型配置。API须先验证输入为整数再绑定smallint，不截断/四舍五入小数；DB约束兜底存储值范围。

仅首次引入这些配置列时，初始化分两步但同一受控迁移事务完成：加列默认关/0；仅现有 pro/plus 行设开/1，visitor/registered 保持关/0，核验恰有四行；沿既有 `AdvanceConfiguration` 语义使全局 revision 仅前进一次（含现有重算标记），原配置时间戳仅按现有更新触发器推进。不得重跑旧 seed、不覆盖模型/长度/额度/优先级/期限/用量/activated_at。迁移账本保证只执行一次；应用每次启动不得重置管理员后来设置的开关或N。空库依顺序迁移也得到同一结果。此初始化只描述目标版本，本轮不执行，生产启用仍需发布授权。

管理读取、差异预览与保存复用全局 revision：预览持配置共享锁读完整旧配置和基础/有效体验人数，不写库、不调模型；保存配置排他锁→校验 expected revision→校验全字段→同事务更新计划/模型/长度及开关配对→revision 一次前进。非法/缺失新字段拒绝；不能把请求缺字段默认为增强。冲突整笔回滚，返回最新 revision 供前端重新预览；响应丢失先重读，不以旧预览盲重试。优先级批量保存原规则保留，无新逐用户模拟。

## DB3-03 受理快照和终态（DATA-302/304；CAP-301/302）

在 `generation_runs` 与 `preset_preview_runs` 同名增加以下列；保留原 `call_status/status` 作为唯一运行终态，不引入第二状态机：

| 字段 | 类型 / 初值 | 精确规则 |
|---|---|---|
| `content_policy_version` | smallint NULL；迁移前行 NULL，之后 DEFAULT 1 | NULL 仅表示历史未采集；非空仅允许 1 |
| `configuration_revision_snapshot` | bigint NULL，无默认 | v1 必填且 >0，存受理配置数字 revision，不存外部签名 token |
| `content_review_enabled_snapshot` | boolean NULL，无默认 | v1 必填，受理后不可随计划变更 |
| `content_repair_limit_snapshot` | smallint NULL，无默认 | v1 必填；用户关/0或开/1–99；后台预览单独限制关/0或开/1 |
| `pipeline_version_snapshot` | text NULL，无默认 | v1 必填且 btrim 非空；定位本次编排/提示集合与技术预算版本，具体版本字符串归后端 |
| `content_outcome` | text NULL，无默认 | active 时 NULL；v1 终态必填，枚举见下 |
| `final_content_version` | smallint NULL，无默认 | v1 valid 必填，v5用户N0=1、N>0为1至N+2（最多101）；预览basic=1、enhanced为1至3；非valid与历史行NULL；旧pipeline见下 |
| `content_stop_reason` | text NULL，无默认 | 仅service_incomplete必填，其余包括active/历史为NULL；枚举见下，不存原始错误正文 |

仅 `generation_runs` 增 `plan_origin_snapshot text NULL`，v1 必填，允许 `visitor/base/trial`；visitor 行只能 visitor，账号行只能 base/trial。有效计划复用 `group_code_snapshot`，不可从 `generation_charges.plan_code` 推断（额外次数没有该列）；trial 不新增一套权益表或到期任务。v1 账号增强只允许 group snapshot 为 pro/plus；visitor/registered 固定关/0。配置 revision 是事实，不 FK 到持续变化的配置行。分别命名两表快照CHECK：用户关闭/0或付费开启/1–99；预览关闭/0或开启/1，不读取Pro/Plus的N。`final_content_version`不参与受理必填，只有最终valid提交时才赋值。

所有新 CHECK 用命名约束，整条组合谓词写作 `CHECK ((历史分支 OR v1分支) IS TRUE)`，且v1显式 `content_policy_version IS NOT NULL AND content_policy_version=1`，valid/failed/cancelled显式outcome非NULL，service_incomplete显式reason非NULL，避免SQL UNKNOWN通过CHECK：旧行 policy=NULL 时全部上述新事实和 origin/outcome 维持 NULL；policy=1 时完整快照、合法配对、来源及下表终态必须同时满足。先加无默认可空列保留旧行，再给 policy 设置 DEFAULT 1；新应用所有 INSERT 必须显式提供 v1 全字段，不允许借 NULL 绕过受理。库检查与仓储测试共同落实，不为兼容旧调用方填造假历史值。

| `content_outcome` | 与原终态/权益一致性 |
|---|---|
| `basic` | valid 且关闭服务 |
| `review_passed` | valid 且增强；v5固定编辑整包原生有效并审稿pass，未实际条件返修，final=2 |
| `repaired_passed` | valid 且增强，至少一次且不超过N的实际content_repair，最终整包原生有效/末审pass；v5 final至少3 |
| `limit_finalized` | valid 且增强，已用尽内容返修预算且最后稿原生有效；最终内容结论仍有问题，不冒充通过 |
| `service_incomplete` | valid 且增强；固定编辑/审稿/条件返修技术故障或新稿基础恢复失败，交付最近基础有效整稿；仍消耗一次业务额度 |
| `cancelled` | generation 的 user_cancelled / preview 的 cancelled；即使曾有有效稿也不转故障交付 |
| `failed` | generation 的既有四类失败 / preview 的 failed；详细原因沿 failure_code/failure_category |

行级 CHECK 兜底终态/权益组合；跨调用的“已返修/最终版本实际通过/次数上限”在终态仓储事务核验。达到内容上限不能写 validation_failed；无效新稿不能写limit_finalized，有最近有效稿时按service_incomplete交付，否则失败。service_incomplete的原failure_code/failure_category仍为NULL（run已valid），不改变原扣次/累计约束。历史结果保持原值，NULL不是“曾审稿通过”。

`content_stop_reason`原六值 `content_timeout/content_rate_limited/content_transport_error/content_protocol_error/content_review_invalid/repair_native_invalid` 保留，v5增加 `fixed_edit_native_invalid`。仅service_incomplete非NULL；其余必须NULL。精确映射沿 [AI3-02](ai-integration.md#ai3-02-七类内容故障与保留稿)：固定编辑正常完整响应但Candidate JSON/schema/原生内容/学习字段无效、不可安全纠正或共享恢复耗尽用新增值；编辑及其基础恢复的网络/协议/限流/超时用原技术原因。条件返修完整输出无效仍为repair_native_invalid。规划失败没有lastValid，写failed及原failure_code/category和planning usage，不写Q02原因。主动取消、客户端写流/断连、DB不确定、账号删除、进程崩溃仍不适用Q02。

### pipeline识别与行级约束

存储格式 `content_policy_version=1` 不变；仅**精确等于** `pipeline_version_snapshot='m003-content-v5'` 进入新链路分支，不做字符串大小/前缀推断。历史policy=NULL且全部新增事实NULL单列；其他非空旧pipeline保留原N+1约束及原六reason，不补Plan/editor usage、不改旧版本。已知源码旧值是m003-content-v2；若目标库有m003-content-v4按旧分支保存，不能声称已测其存在。未知非空旧值不能自动按v5解释；本轮不清点或迁移旧库，若后续读取遇到则按未知事实交责任owner核对。新受理仓储只写明确v5，SQL保留旧行分支不授予旧API混跑权限。

两run表命名约束 `generation_runs_m003_content_facts_valid` / `preset_preview_runs_m003_content_facts_valid` 均落实：

- v1完整非空快照及开关/N/owner配对沿上文，pipeline非空；active的outcome/V/reason均NULL；failed/cancelled的outcome精确匹配原状态且V/reason均NULL。
- valid要求outcome非NULL且在五值内、V非NULL。若v5且N0，则outcome=basic、V=1；若v5且N>0，则outcome≠basic、`1≤V≤N+2`（用户N≤99、预览N=1）。若旧pipeline则原`1≤V≤N+1`及原增强/basic配对；不把旧review_passed强制改为V2。
- service_incomplete要求增强及reason非NULL、v5七值/旧pipeline六值；其他outcome要求reason=NULL。原valid的failure_code/category=NULL与扣次约束保持。

行级版本范围允许编辑故障时V1；“review_passed必须V2、repaired_passed至少V3、limit_finalized已耗N且末稿issues、实际Plan/编辑/Review顺序”等跨usage/内存事实由BE3-03的 `validateContentOutcome` 在最终事务内校验，不把行级宽界当充分成功证明。新受理不得用policy=NULL或未知pipeline绕过规则；历史NULL只在保留/读取路径，仓储与隔离测试守卫，不为此新建历史表或触发器平台。

首稿V1，固定编辑V2，每次条件整稿返修再递增；Plan/Review不分配V，同候选基础修正/续写沿原V。只有全套原生校验成功才用该版本及正文/标签/释义/全部位置**整包**替换lastValid；固定编辑前不消耗基础恢复。最终将选中包写入既有generation_drafts/preset_previews，并同事务写其V，不能按call_no、latest attempt或最终V−1倒算返修数。例：编辑V2失败、首稿有效→final1/service_incomplete；编辑救活无效首稿→final2；一次条件返修→V3、两次→V4；V4无效回到完整V3。正常增强无条件返修审稿pass为final2，上限定稿仍需末稿原生有效。用户最大101、后台增强最大3只是字段边界。

候选稿和意见只在请求内存，不为多轮建立持久中间稿库。已提交终态的状态查询/最终响应从run读取outcome、version并导出notice，再读取同一最终draft或已保存批次；后台从preview run/validated_payload读取。不得刷新后丢提示、重新造文或把较新无效片段当最终稿；原token、主体隔离、状态窗口/draft TTL保持，不新增无限恢复承诺。单次进程崩溃不承诺找回尚未提交的内存稿。

## DB3-04 最小逐调用事实（DATA-302/304/305；CAP-302/304/305）

扩展 `ai_call_usage`；保留现有 owner XOR、`UNIQUE(user_run_id,call_no)` / `UNIQUE(preview_run_id,call_no)`、模型/费用/token 和级联：

| 字段 | 类型 / 默认 | 规则 |
|---|---|---|
| `call_stage` | text NOT NULL；旧行填 `legacy`，随后移除默认 | 新值仅 `planning/generation/fixed_edit/technical_repair/content_review/content_repair`；新写必须传入，不猜旧行阶段 |
| `prompt_version` | text NULL，无默认 | 非 legacy 必填且非空，实际该次 prompt 版本；不保存 prompt 正文 |
| `provider_invoked` | boolean NULL，无默认 | NULL 未确认、false 明确未发出、true 已调用提供方适配器发送边界；不是费用已知标志 |
| `review_result` | text NOT NULL DEFAULT 'not_applicable' | 枚举 `not_applicable/pending/pass/issues/indeterminate`；仅 content_review 可用后三种及 pending |
| `reason_codes` | text[] NOT NULL DEFAULT '{}' | 去重、无 NULL；只含 `forced_wording/contradiction/other_content`；具体自然用词、逻辑、主题/文体细类由后端映射，不含句子 |
| `repair_requested` | boolean NOT NULL DEFAULT false | 仅 review_result=issues 可为 true；表示决定返修，不表示执行 |

命名 `ai_call_usage_m003_stage_valid` 的七值含legacy，后端新写只允许上述六值；`ai_call_usage_m003_prompt_valid` / `ai_call_usage_m003_review_valid`沿用并确保整个谓词 `IS TRUE`。CHECK：content_review 的 review_result 只能为 pending/pass/issues/indeterminate；非 content_review 的 review_result 必为 not_applicable 且 repair_requested=false；review_result=issues 必有非空 reason_codes，pass/pending/indeterminate 原因数组为空；除 content_review/content_repair 外数组为空；content_repair 必有非空原因（从触发审稿复制，保留同篇双类），legacy 新字段为 NULL/空/不适用。reason_codes限制为三元素白名单、无NULL、数量≤3；非空数组必须一维且下标从1开始，再检查两两不等，空数组只允许不需原因的分支。仓储规范排序去重，DB与仓储共同拒绝重复；新增stage不可绕过数组规则；DB03所记早期0017数组缺口不代表当前源码仍有该缺口。planning/fixed_edit和technical_repair/generation均严格not_applicable、false、空数组，不因固定编辑修了牵强/矛盾记原因。无需新自引用 FK 或审稿意见表。

每次提供方尝试在调用前短事务预留唯一 call_no、阶段/提示/原因，usage 仍 unknown；若预留失败不发送。审稿响应解析后，在一个短事务写 review_result/原因/返修意图，再允许后续返修。实际调用确认和用量由 adapter 回调同一行更新；发出后限流/超时仍可为 provider_invoked=true，发送前拒绝为 false。不能用存在 usage 行、阶段进入、repair_requested、收到费用与否替代实际调用。

DB 与远端发送无法原子提交：进程在发送边界崩溃或回调写入失败时保留 NULL（未知），不猜 true/false、不自动重发；重启既有失败结算路径可把 pending 审稿标 indeterminate，不能伪造“未发生”。统计单列未知调用/请求数；已确认频率与未知上下界并列，不能宣称崩溃窗口精确计数。backend-alex 负责为各 adapter 明确“已调用”证据和回调时机，测试必须覆盖这一窗口。`completed_at` 现有预留占位语义不作为真实调用完成证据。

所有模式先预留planning，完整有效Plan实际输入writer才预留generation；Plan只在请求内，无独立计划表/存储字段。普通/N0请求不得预留fixed_edit/content_review/content_repair；增强每请求固定编辑一次，在Review之前，实际发送证据和普通调用一致。增强按受理快照N（用户1–99、后台1）分配内容返修位置，最多N个；未确认尝试暂占位置，不在不确定后自动重发突破预算。实际次数只数provider_invoked=true，false和NULL不伪装实际调用；发送前已失败、未知发送或时限保护若终止内容服务，按DB3-03/05选择有有效稿交付或失败，不保证用满N。

一个逻辑请求内串行分配call_no。基础纠错按整个请求共享BE05系统策略2次；内容返修另计N；planning/fixed_edit各一次且不扣这两类预算，审稿/复审及本地校验也不扣，换稿不重置。technical_repair行保持reason_codes为空，不能混入内容缺陷原因计数；具体基础错误沿原诊断分类，无需新统计列。m003-content-v5定位技术预算/复审与保护时限；每调用180秒、整体600秒沿BE05，N大不加时。实现按N控制循环，流程测试到2不是运行上限；无新增高轮次队列/后台续跑。`model_snapshot` 必须等于该 run 的目标模型快照，连接绑定沿原受理 spec；后续调用不重读可能已修改的模型连接。

## DB3-05 事务与竞态

| 边界 | 增量与原子性 |
|---|---|
| 受理普通/用户预设 | 配置共享锁→账号/访客锁→锁后业务时间解析唯一有效计划和模型→检查额度→一次 INSERT run（含完整内容快照）、entries、原来源 charge 与既有开始事实→COMMIT；全部成功才调模型；预设配置例外不复制后台模式 |
| 受理后台预览 | 配置共享锁→管理员存在校验/预设版本匹配→插入 preview run 快照；明确模式生成关/0或开/1，不解析管理员计划、不写用户 charge |
| 每次调用/审稿事实 | 短事务、幂等按 owner+call_no；不得持配置锁、账号锁或 DB 事务等待网络/流；后续阶段发起前检查取消/终态，已在途调用可稍后补记真实用量但不能恢复 run 状态 |
| 有效完成 | 沿 `CompleteValid`：配置共享锁→主体锁→active CAS→质量终态/跨调用事实校验→原 charge consumed/原成长与分析→选中最终有效整包的draft INSERT及outcome/version/stop_reason，单次提交；service_incomplete走同一有效完成事务，不先失败退款再转成功；预览对应active CAS+三项终态事实+完整preset_preview+匹配关联同事务 |
| 取消/失败/恢复 | 沿 `SettleTerminal/ReconcileFailure`：CAS、outcome、原来源 charge/refund、分析同事务；取消消耗一次；内容服务故障且有最近有效包优先走上行valid，只有无有效稿或不适用Q02的既有失败退原来源；额外次数返还原 item 即使已过期也不延长 expires_at、不新造永久额度；重启核对已提交终态不改写；仅未完成且无法恢复内存稿的run按原恢复路径写outcome=failed |
| 保存/承接/放弃 | 原唯一 run→batch / claim 事务不变，不因返修建第二个业务 run、不再次扣额；完成 ACK 不明读库终态+原 charge+最终 draft，禁止再调模型“重建成功” |

用量更新不与用户扣次绑定：失败/取消后真实提供方用量仍可能非零；未知用量保持 NULL，不补零。若关键审稿/返修事实无法持久化，或最终提交/结算不确定，不发送后续调用、不开保存、不伪装service_incomplete；先保持pending核对已提交终态，确认仍active后才能按既有server_failed原子退款，无法确认继续待核对。费用回调晚到可更新原 usage，不能改权益或终态。账号已删除时 FK/影响行数阻止重新创建事实。完成、取消、断连、账号删除、维护退款竞争只允许一个已提交终态；前端片段与内存状态不授予保存资格。

## DB3-06 预览模式与发布关联（DATA-304；CAP-304；UIA-M003-306/307）

`preset_versions` 增 `preview_content_mode text NOT NULL DEFAULT 'basic' CHECK (... IN ('basic','enhanced'))`。旧版本、已有成功预览按原行为归 basic；preview run 的两列权益快照表示其模式，不再重复加模式列。旧 run 的 policy NULL 可用于证明旧 basic 预览，绝不视为增强。

选中模式保存为草稿版本的后台元数据；不加入公开 `configuration`，不修改原 config_hash 算法或用户输入参数。版本“生成条件”是 `(config_hash, preview_content_mode)`，所有读取/复用/发布校验同时比较两项及原 configuration 等值条件。UI 本地模式变化立即使 ready 失效；服务端在启动预览/发布前必须已保存对应模式版本，如何承载该更新由后端 API 决定。

修改模式创建新版本、清空 preview_id 并推进既有配置/preset revision；只有与**紧邻旧草稿**生成参数和模式均相同的纯标题变化可以继承旧 preview_id。basic→enhanced→basic 不能自动恢复先前预览；当前新模式须有新的成功预览。新预览完成仅可填入其匹配版本的空 preview_id；不得回写新草稿模式，不覆盖公开版本或已有公开样文。并发旧模式晚完成可记录成功事实和独立用量，但不能解锁当前新模式的发布。

发布事务沿现有配置排他锁+预设锁+expected revision+当前 draft version，增加 mode 匹配与完整 payload/valid/outcome 检查。上限定稿及service_incomplete的有效增强预览均可手动发布；后者的预览/状态/发布确认必须保留“内容审校未完成”，不得标通过；片段/失败/取消/结算未知不可。增强始终固定N=1，不模拟付费计划N。发布只更新 published_version_id/listed 等原字段；旧线上版本保持到人工发布成功。用户点击已发布预设时只读公开生成参数，再按本人计划受理；后台 enhanced 不能赠送读者权益。

## DB3-07 统计、保留与权限

以 run 为分母，usage 为调用事实；按受理 started_at 时间窗、entry_kind 和后台预览分组，先逐 run 聚合再计数，避免多调用 JOIN 放大分母。M003 正式统计限定 policy_version=1；历史 policy NULL 单列覆盖量，不伪装基础新请求。全部受理=run 数，增强=快照 true，实际审稿=存在 content_review 且 provider_invoked=true；失败/取消仍属于已受理，不因退款从分母消失。预检拒绝沿现有 `generation_precheck_rejected` 事实单列，不造 run。

规划、首稿、固定编辑、基础修正、审稿、内容返修按六stage分别聚合实际调用/token/费用；固定编辑不进入W/F/C，即使文本有所修正。统计按pipeline_version_snapshot分层，不把旧链路当新链路覆盖，legacy及未知发送另列。实际返修请求=存在 content_repair 且 provider_invoked=true 的去重 run；实际返修调用=对应行数；同run执行多轮仍只算一篇，基础纠错调用单列不混计。牵强/矛盾分别按**实际返修行** reason_codes 计请求/调用，交集与并集用 run 去重；审稿发现原因及 repair_requested 另计，复审拒绝但没再调用不增返修。分母为0给 N/A；未知调用单列，NULL 不当 false。费用/token 沿既有 known/partial/unknown 汇总，不能凭审稿通过宣称独立质量通过。查询/诊断输出即可，不新增 UI 报表或永久计数副本。

交付率=valid用户run/全部受理用户run（包含service_incomplete）；审校完成率=(review_passed+repaired_passed+limit_finalized)/增强受理用户run，普通basic不进入该分母。审稿通过与上限定稿分开，service_incomplete计入交付但不计审校完成/通过，按stop_reason单列；取消、pending及后台预览单列。独立质量仍来自QA评阅，不能用交付或自报pass替代。未确认发送采用原未知区间，不以最终稿版本差推算实际调用；不新建报表或永久汇总副本。

新事实与父记录同寿命、同 owner 删除：账号删除级联 run→usage，沿既有 credited visitor/claim 显式删除规则；本人主动删批次同事务删除 consumed claim（USER-CLAIM-DELETE-001），不为统计留正文墓碑，原无正文计量事实按既有规则保留。draft 沿配置 TTL，consumed claim 其余情况24小时，闲置访客30天且无阻塞资源时清理；不把 analytics 明细90天误套成所有 run 的 TTL。后台预览清理沿 `CleanupPresets`：当前草稿/发布/在途引用保留，非引用内容经过原1小时窗口清理，preview run/usage事实保留，不因模式切换提前删公开内容。

不在新列写原句、审稿正文、候选稿、内部推理、秘密或学习资源副本；处理期候选/意见仅请求内使用，最终正文/标签/释义/全部 occurrence 通过现有有效 payload 原子保存。既有专用账号诊断24小时及其授权范围保持，不顺势扩为普通账号正文留存。新增列沿原表权限，不新增跨用户可读入口；后台模式/配置仍由服务层管理员鉴权，数据库连接身份不能代替登录者权限。

<a id="db3-08-保留数据的迁移恢复与验证"></a>
## DB3-08 未发布schema、恢复与验证

依据USER-M003-NO-DATA-MIGRATION，实施owner获得门禁后直接调整未发布 `backend/db/migrations/0017_m003_content_review.sql` 和启动schema Verify，新增CR306三列与命名约束/快照不变性守卫；不另建历史升级/回填迁移、不扫描修复旧库、不重seed管理员配置。仅新建可丢弃空库按当前schema初始化验证；现3013 UAT数据库、配置、服务及冻结证据保持。旧DB03“是否已应用0017→0018/旧库升级”的建议已被用户约束替代，仅从冻结原件追溯，不作为执行任务。

本轮不修改DDL或应用代码，也不启动数据库。缺少新列/约束时，新版本启动Verify必须拒绝准入，不能从应用启动自动补旧库、假造run快照或自动重试初始化。实施检查列类型/可空/默认、命名CHECK及convalidated、快照更新守卫；账本存在不等于schema正确。初始化失败在隔离库回滚并修源码，不能转向现UAT。将来部署/已有库切换必须另有明确操作范围，本设计不授权它。

DB3所有组合CHECK的显式非空和外层IS TRUE继续有效；历史policy NULL/旧pipeline读取分支不授权新受理伪装历史。旧行没有CR306参数事实即unknown，不补{}。备份权限、加密、恢复删除与charge核对沿[M002数据库§12](../../M002/technical/database.md)，不新增保留期或RPO/RTO承诺；运行快照不得用于重放模型或重复扣退次。管理员明确保存{}只影响新受理，不删除既存快照。

| 验证 ID | 对照验收 / 必须给出的隔离证据 |
|---|---|
| DB3-V01 | AC-304 / AC-305 / AC-314；可丢弃空库当前schema初始化；付费独立0/1/2/99存取、负数/100/小数/空值及开关联动非法输入拒绝（小数在API类型层，DB检查整数域），普通增强拒绝；只改允许字段，不重seed；二管理员同revision至多一笔成功，失败/响应丢失无半配置 |
| DB3-V02 | AC-301 / AC-306 / AC-307；配置更改/试用到期/优先级变更与受理的两种先后，快照一致；basic+模型/次数卡不赠服务；增强用extra仍增强；在途不受新配置影响 |
| DB3-V03 | AC-302 / AC-303 / AC-308 / AC-311 / AC-313 / AC-314；仅执行最多2轮内容返修与共享基础纠错混合示例；有效包及final_content_version对齐，修前/修后校验；通过/上限定稿/service_incomplete/无有效稿失败/取消唯一终态；有效稿+审稿超时/限流/协议/解析/返修无效恢复耗尽、无有效稿和DB未知各自分支，最终响应与查询均保留提示；事务末步失败全回滚；CAS竞争、COMMIT不明、重启、extra过期退款、保存和claim不重扣 |
| DB3-V04 | AC-309；默认basic、enhanced固定1、service_incomplete有效预览提示与手动发布、双向切模式与切回、纯标题复用、旧调用晚完成、并发发布；失败不改公开pointer，用户权益不取后台模式；旧完整样文和学习资源保留 |
| DB3-V05 | AC-310 / AC-314；交付/审校完成/独立质量分离、两轮内容与基础调用分开、同run去重、0分母、正常/预设/后台分离、牵强与矛盾交集/并集、意图后未调用、调用失败/未知、复审拒绝、多usage行无分母放大、未知费用不为0 |
| DB3-V06 | 隐私/运维；跨账号读写拒绝；批次/claim、账号/credited visitor删除清理新事实；预览清理不删公开内容；空库初始化失败回滚及既有删除/恢复合同核验，旧运行行不伪造审稿事实 |

CQ-14验证边界：配置0/99及非法值不调用模型；内容返修流程仅测至2轮，实施静态检查循环消费N，不硬编码2；v5 final_content_version边界101/预览3只做字段/约束样例，不执行3–99轮链路、不声称高轮次通过。AC-312仍归独立质量验证。

以上DB3-V01–06是保留的既有验收计划，实际已完成项由TECH03实施/独立QA证据判定，不从旧DB文档推断未实现，也不扩大既有PASS。DB03当时的定向静态核对仅涵盖六stage/七reason、v5与旧版/NULL分支、101/3边界及两类预算/统计隔离，AC-315/316依BE3-07与AI3-06追踪。证据见 [db03-check.json](evidence/db03-check.json) 及其 [可复跑静态脚本](evidence/db03-check.py)：检查文档、源契约和显式三值真值样例，**没有执行PostgreSQL谓词、真实迁移、Go/API/模型或完整测试矩阵**；不能证明DB3-V01–06或AC验收PASS。既有 CR039-L1、CR042-L1、AI-QUALITY-90、W01、QA26-MINIMAX 保持原状态；AC-312 精简链路真实质量、时延/费用未验证，须由后续QA按授权评价，不能从存储设计推出质量达标。

## DB3-09 下游责任与接续条件

当前CR306接续以DB4-01–04与[DB04交接](../handoffs/database.md)为准。backend-ethan获得实施门禁后按DB3原业务和DB4新增接点落地，不修改180/600、两预算、v5、Q02、退款/取消/DB未知或公开wire。既有CR-302及DB3-V01–06未验证范围保留，不因DB04设计交付关闭。designer-tony可在独立接收后使用BE07完整fixtures制作完整页面/M002正式视觉并提交用户评审；之后才由frontend-bob接收新视觉和数据合同。本文件不激活角色、不自批技术阶段。

<a id="db4-cr306"></a>
## DB4-01 最小持久化与约束（DATA-306；CAP-306；AC-317–319）

选现有三表各增一列JSONB：模型是配置，两个run是一次受理事实。无需新表、usage列/阶段枚举、索引、目录、MQ或逐阶段副本；不存在JSON检索需求，不建GIN。相较typed推理列，这与管理员原生扩展和API-306一致；JSONB不保留排版/重复键，严格解析必须先于入库。

| 表 / 列 | 未发布空库定义与命名约束 |
|---|---|
| `wordweave.ai_models.custom_parameters` | `jsonb NOT NULL DEFAULT '{}'::jsonb`；`ai_models_custom_parameters_object`：`CHECK ((jsonb_typeof(custom_parameters)='object') IS TRUE)` |
| `wordweave.generation_runs.model_request_parameters_snapshot` | `jsonb NOT NULL`，**无默认**；`generation_runs_request_parameters_valid`按下方完整包谓词检查 |
| `wordweave.preset_preview_runs.model_request_parameters_snapshot` | 同上；`preset_preview_runs_request_parameters_valid`同义；管理员预览仍无用户charge |

run包精确五个键：`version="custom-parameters-v1"`、`custom_parameters`对象、`output_mode`为prompt/json_schema、`max_output_tokens`为JSON null或1..1048576整数（沿原模型列范围）、`structured_route`为openrouter_require_parameters/unchanged。根必须对象；使用`?& ARRAY[...]`要求五键都存在，减去五键后须为`'{}'::jsonb`，拒绝多键；类型检查不能仅靠`->>`把数字误当字符串。数值分支用CASE先确认jsonb_typeof='number'再转numeric，要求`v=trunc(v)`和原范围；JSON null分支与缺键严格区分。全部组合包裹`IS TRUE`，SQL NULL或缺键不能通过；SQL列NOT NULL拒绝未提供包。structured_route=openrouter_require_parameters须output_mode=json_schema；是否官方OpenRouter/protocol匹配由BindSpec用同份连接事实决定，DB不复制baseURL或凭据判断。

快照`max_output_tokens`存受理配置值（null代表该字段未配置），不把Anthropic运行时默认4096伪装成管理员配置；实际body沿AI7。策略版本独立于content_policy_version=1和pipeline v5，不修改旧分支。完整包非{}、无自动默认，空自定义对象也必须明确写入其他四项。此NOT NULL定义仅用于新空库；旧库/冻结数据无此事实只能视为未采集，绝不回填或升级它来满足新约束。

在两表增加**仅此列**的BEFORE UPDATE守卫：`NEW.model_request_parameters_snapshot IS DISTINCT FROM OLD.model_request_parameters_snapshot`时拒绝（命名`generation_runs_request_parameters_immutable`、`preset_preview_runs_request_parameters_immutable`，可共享单一触发函数）。允许原status/usage/结算更新及owner DELETE，不锁死整行；JSONB等值重新赋值不改变事实。受理INSERT写一次，后续仓储UPDATE显式不含此列。无需通用审计表、历史快照版本表或额外hash列。

## DB4-02 API/服务与DB的校验分工

[API-306严格JSON及保护表](api/administration.md#api-306)是唯一字段规则源，不在SQL复制动态受保护名单。所有单项/batch/聚合/enable/Probe及BindSpec共用服务校验；disable仍可停用坏配置。DB只兜底对象、完整版本包/标量组合及不变性；**16,384 UTF-8紧凑字节、容器深度8、全层重复键、合法Unicode/有限数值、全树敏感字段/归一别名、顶层受控字段冲突由服务强制**。受保护键拒绝，不作删键脱敏后悄悄保存；合法对象再用于快照。

选择服务计算紧凑序列化字节而非SQL文本大小CHECK：`pg_column_size`含物理格式，`jsonb::text`含空白且数字表示可能改变，不能冒充API紧凑JSON边界或拒绝本来合法的16KiB对象。使用API同一规范化函数（去无意义空白、保留字符串、按有限IEEE754往返数值）在原始HTTP解析后及DB读取后重验；不得用简单空白正则破坏字符串，也不得用DB输出原始文本计算边界。depth从custom对象根=1开始计，snapshot外包不计入8层。规范化一次得到私有只读bytes/深复制值，用于入库值、请求透传和安全trace SHA256；JSONB读回要求JSON值等价而非序列化字节相同，哈希只表示已冻结bytes，不是跨DB等价标识。

重复键必须在JSONB/map解码**之前**检查（包括解码后同名键）；数据库无法恢复被覆盖的重复项。已接收backend-alex的API-306无损存储澄清：全树解码后键/字符串值含U+0000在入库前422 validation_failed / unsupported_character拒绝；非法键指安全父对象，不回显值，不替换/删除/截断，字面反斜线加u0000不等于NUL。见[owner定向证据](evidence/cr306/u0000-check.json)。其他JSONB不可表示值若在实施发现则交backend-alex明确合同，不擅自改文本或静默替换。受信任运维直接SQL绕过服务不能被称为通过API安全校验；应用角色沿原最小权限，所有外部写入走管理员服务，库中读回不合法则受理前拒绝、无run/charge/调用。

## DB4-03 保存、受理、读取与删除

1. 配置保存沿原配置排他锁→expected_revision CAS→完整集合及连接校验→模型参数/其他配置/凭据同事务保存→AdvanceConfiguration一次→读回→commit；单模型非法整组回滚，二管理员同revision至多一笔成功。默认{}仅用于schema初始值，API漏字段仍拒绝；保存0模型/目录调用。响应不明先GET核对，不盲目重新推进revision。
2. 普通/用户预设受理沿DB3-05锁序：配置共享锁内读取model/连接/原权益/全局revision与custom对象，完整本地校验并生成私有不可变spec及安全包；同事务INSERT run包、entries、原charge，提交成功才网络调用。后台预览同样锁定版本/配置并写preview run包，原无charge语义保留。配置更新与受理以同一锁序线性化，不出现新JSON配旧连接或旧权益。失败整笔回滚；COMMIT未知沿原查终态/结算路径，不再次受理/调用。
3. 各阶段只用已绑定spec，不回读模型、不修改对象；中途改JSON/协议/停用只影响新请求。run包是安全追踪事实，不能替代请求内凭据、重启重放凭证或新增恢复服务。Plan/Writer/固定编辑/基础恢复/审稿/返修同份参数；180/600截止、两预算、有效整包/Q02及唯一扣退次保持。
4. 管理GET/list/聚合/保存回包读模型对象；用户模型列表、started/status、公开预设/配置hash不增加对象。安全run包仅现后台/DB权限内可读，业务错误不回值/凭据，trace只按AI7记录版本/revision/已冻结bytes哈希。custom无独立公开读端点；不存key/baseURL/prompt/messages/推理正文，不记录键名列表或完整值日志。
5. 模型沿原引用/删除规则（不改变FK动作），已受理包不再依赖可变模型行；owner删除/访客清理/run→usage级联及预览保留沿DB3-07。快照随父run同寿命，不新设永久保留；用户删批次/consumed claim原事务不变，原计量事实按既有规则处理，不因快照扩大保留范围。

## DB4-04 精确实施与有限验证接点

| owner入口（相对backend/） | 获实施门禁后的最小动作 |
|---|---|
| `db/migrations/0017_m003_content_review.sql`；`internal/platform/postgres/migrate.go`、`m002_verify.go` | 修改未发布schema三列/命名CHECK/两触发器与启动核验；不新增历史迁移文件；只初始化可丢弃空库 |
| `internal/admin/models.go`、`model_connections.go`、`model_providers.go`及现batch路径 | DTO/统一validator由BE07定义；所有SELECT/scan、INSERT/UPDATE、聚合事务覆盖custom对象，读回等价；保留revision/锁序与原权限 |
| `internal/ai/connections.go:BindSpec` | SELECT同份参数并校验，保留请求内深复制安全对象；不序列化私有connection/key；三协议body合入归AI7 |
| `internal/generation/service.go:start`、`preset_preview.go:startPreview` | INSERT显式传安全包；原run/entries/charge同事务；完成/取消/失败/清理路径不改包；usage只关联run |

后续定向验证并入BE7-V，不扩大现矩阵：AC-317/318验证{}读写、两模型隔离、一个非法项整组回滚、CAS、16KiB与深度8两侧、重复键/敏感键在入库前拒绝；DB直接验证非对象/缺包/多键/非法类型/NULL拒绝和snapshot修改拒绝。AC-319验证两类run受理与配置编辑两种先后、在途包不变及事务末步失败无run/charge，usage关系/删除仍有效。数字/Unicode边界要求API→JSONB→服务回读语义等价，若不一致交BE owner修合同，不能放行失真值。AC-320的无内容/期限/退款/Q02/DB未知沿原测试；不为DB设计调用真实模型。AC-321/322仍归完整真实QA/页面设计及用户评审。

本轮只做文档/链接/冻结hash与源码接点静态检查，见[check.json](evidence/cr306-db/check.json)及[check.py](evidence/cr306-db/check.py)。没有执行DDL、SQL、Go/API/浏览器/模型或新会话交接测试；DB CHECK与触发器、16KiB往返及并发效果均**未验证**，不能将静态通过记为AC-317–322通过。DB04完成条件是当前合同与实施接点可审阅；独立接收/实施门禁、真实效果和用户UAT仍需后续完成。
