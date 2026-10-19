---
milestone: M002
stage: technical-design
role: dba/base
agent_name: dba-diana
version: M002-DB-CR313-01
status: awaiting_user_review
date: 2026-10-15
requested_model: gpt-6-astra
requested_effort: high
actual_model: unknown
scope: CR-313
---

# 配置导入导出数据设计

本稿只设计 DATA-501～506 / CAP-501～504。产品09-R1、设计33-R3已由[门禁126](../../reviews/cr313-technical-entry-126.md)接收；上游原件中的提交时“待审”不覆盖后续批准。本文技术选择均为 **PROPOSED**，不是用户已批准技术结论。应用、schema、数据库和UAT均未变更。TECH-501的数据侧在此收敛，TECH-502密码格式及完整API仍由backend-alex接收。成长跨环境身份问题已按用户选择A闭环，见 DB313-Q01；技术合同仍须审阅及后端接收，不能当作已实现。

## DB501-01 依据、事实和取舍

- 当前单流程、M002 / technical-design / dba-diana；锁定 consumer-ai-web@1.0.0、原基座revision和模型锁均保持。requested gpt-6-astra/high；actual_model、实际token/费用 unknown。
- 唯一业务字段源：[产品字段表](../../product/config-portability.md#fields)，完整DATA/CAP/AC见同文；[当前UI规格](../../design/config-portability/design-spec.md)、[交互](../../design/config-portability/interactions.md)。四类是模型、固定四计划、道具定义、完整成长；预设/公告/账户/库存/流水不进入文件。
- 继承数据库基线：[M002原文](../database.md)、[较新原件](../../../M002-legacy-M003/technical/database.md)。旧M003编号仅为历史路径，需求归M002。用户未上线、不迁移旧数据约束覆盖早期设计中的升级/回填建议；只提未发布schema初始化与隔离空库验证。
- 代码事实以[evidence/source-manifest.json](evidence/source-manifest.json)列出的工作区文件哈希为准；现有工作区包含其他角色修改，不能只用HEAD表示本次依据。未连接数据库，不能把源码约束当作实际实例已部署事实。

| 实际接点 | 读到的事实 / 本次影响 |
|---|---|
| `backend/internal/platform/business/state.go` | growth_settings单例 FOR SHARE/FOR UPDATE 是事务第一把锁；锁后取业务时间；AdvanceConfiguration同时推进revision和重算游标。沿用，不加Redis/MQ或另一配置版本真源。 |
| `backend/internal/admin/model_providers.go`、`model_removal.go` | 服务商聚合保留UUID，模型已支持retired_at；现RemoveModel会删除group_models关联。本需求禁止该联动，不能循环调用RemoveModel或SaveProvider冒充整类替换。 |
| `backend/db/migrations/0015_generic_model_connections.sql`、`0016_provider_workspace.sql`；`internal/ai/connections.go` | app不能SELECT凭据密文，ai可以；app通过窄SECURITY DEFINER写密文，现ConnectionKey用既有ai pool解密。凭据与配置可以在同一app写事务落库，但导出要显式维持配置锁直至凭据读取完成。 |
| `backend/internal/admin/groups.go`；`internal/generation/service.go`、`preset_preview.go` | API basic映射DB registered，恰四计划；generation已有权益及参数接受快照。整类导入只改变后续受理，不改run、charge、trial或账户基础计划。 |
| `backend/db/migrations/0010_m002_growth_items.sql`；`internal/growth/item_definitions.go`、`receipts.go` | 道具kind不可变、ever_issued不可回退；发卡和ever_issued同事务。奖励引用和发放历史均阻止删除。普通分页读取不能作为导出全集。 |
| `internal/growth/levels.go`、`achievements.go`、`awards.go`、`settlement.go` | 当前多档保存是merge；level_no不可改，成就threshold可改。award以本地level/tier ID去重、FK RESTRICT；现无配置退役标记，重算和领奖读取所有档位。本次必须分离当前规则和历史身份。 |
| `internal/growth/configuration.go` | 当前/待生效签到按学习日选取；保存写目标下一学习日。导入不得复制源effective_day，也不得覆写目标今天或历史rule_id。 |

选择沿用单PostgreSQL关系表和现模块化单体。整类操作在一个短事务完成，文件在请求内解析，不持久化上传包/口令/明文Key。备选“逐项调用既有HTTP保存”会分批提交、merge和多次推进revision；备选“整张表清空重建”破坏身份/FK/历史；均不采用。无需通用迁移中心、文件仓库、自动回滚、全用户同步扫描或新服务。配置规模未测，不设虚假吞吐/RPO承诺；backend给文件大小、条目数和锁等待的有界限制，验证代表配置规模后再调参数。

## DB501-02 身份与依赖的精确映射

文件格式先定义单一显式版本及单类别，未知版本拒绝；最终字段名/编码由backend-alex负责。以下是关系合同，不是完整API schema。

| 对象 | 身份与导入映射建议 |
|---|---|
| 四计划 | 文件业务码visitor/basic/pro/plus，一一映射visitor/registered/pro/plus。名称不参与；恰四项，不建第五计划、不删除/重命名。 |
| 连接、模型、道具 | 复用各自UUID作为可移植对象身份：本地新建时生成；导出保留；另一环境首次导入按源身份创建，后续精确匹配原位更新。同类型同UUID匹配，不按名称、URL或模型标识猜测。源UUID不是授权凭证，只有已鉴权管理员、严格类别和关联校验后才可写入。 |
| 模型归属 | 包内模型必须精确指向包内连接；已存在模型ID与包内连接归属不一致为identity_conflict，不能把历史对象暗换所属连接。相同连接内的上游model_id仍须最终唯一；不同ID在最终活动集合仍同唯一键时应定位冲突，不能悄悄merge。 |
| 等级 | level_no是不可变业务键，精确匹配目标既有等级并保留本地ID/award。文件源UUID仅说明来源，不能替换目标ID。新序号分配目标ID；连续性和门槛最终全集校验。移出后同一等级再次出现仍用原目标ID，不能靠生成新ID重发同等级奖励（恢复活动状态为本稿技术建议）。 |
| 成就 | 已共享同一可移植UUID的档位，更新沿原ID，kind不可漂移，threshold仍是可修改配置。按DB313-Q01：独立环境不同UUID但同kind+threshold，整次拒绝并说明身份冲突，不自动合并、不新增人工对应步骤。检查当前及保留的退役档位，不能通过先移出目标档位绕开身份保护；同UUID与kind准确匹配时保持原领奖身份。 |
| 跨类别引用 | 计划→模型、道具→模型/固定计划、成长→道具用准确UUID/固定码匹配目标。文件携带引用身份及安全定位信息，不携带依赖整类配置；依赖缺失或身份冲突拒绝，先处理依赖类别后重新预览。不自动创建依赖、人工填写目标DB ID或名称模糊匹配。 |

例：先把模型包A导入空目标，目标创建相同模型身份；再导入引用这些身份的计划包B可以准确关联。若目标只有同名但另一UUID的模型，B应提示缺失准确引用；同名不能证明同对象。文件源revision、时间戳、ever_issued、影响数量、credential_configured、掩码均非目标写入事实。包重复ID、一个身份多重归属、错类型、来源对象与目标不可变身份不符，整次拒绝。

同环境仍在当前配置中的模型/连接/道具更新保持UUID和历史FK；省略模型以retired_at退出当前配置，不能复活已有退役模型UUID。新的模型确需同名/同上游标识时使用新身份且遵守活动唯一约束，不借旧库存获得新模型权限。未含但停用的对象也是待移出对象；enabled/listed=false不等于退役。

### DB313-Q01 成就身份冲突（CONFIRMED / CLOSED）

用户所见问题：“跨环境导入成长规则时，如果两边各自创建了‘同类型、同门槛’的成就，但内部身份不同，怎么处理？现有成就允许修改门槛，不能仅凭名称或门槛自动认作同一档，否则可能影响已领奖记录。首版我推荐 A，保持目前已审核的界面和较低实现成本。”用户明确答复：**“A．整次拒绝并说明身份冲突，不自动合并（推荐）”**。原件：[identity-clarification.json](../../reviews/evidence/cr313-technical-entry-126/identity-clarification.json)。只确认此冲突边界，不扩大为所有技术设计批准。

已批准规则加上本次A答复得到：不同身份的同kind+threshold拒绝，错误定位源/目标安全身份及类型/门槛；无名称猜测、自动合并或人工mapping UI。现有CAP-214允许threshold变更，故按UUID更新既有档位时仍可改门槛并保留同一award；最终活动门槛重复亦拒绝。已精确匹配身份的多档更新按最终集合检查（允许现有合法门槛交换，不拿变更前的中间值误报）；未匹配的新身份则与目标保留身份检查Q01冲突，不能靠本次移出绕过。新身份且不与目标当前/保留档位冲突时作为新增，不复制源领奖事实；新档达到现有进度按原规则形成待领，导入本身不发奖。

**PROPOSED / 生命周期技术细节**：成长退役行保留原身份；同UUID+kind（等级为同level_no）重新包含时原位恢复为当前规则，使用本包完整业务字段，并继续使用目标既有award/settlement，不复制源历史或生成新的领奖身份。这是同身份恢复建议，不是将本次A答复解释为对恢复规则的专项批准；它落实CAP-214既有停用/重新启用与已领不重发的边界，随本稿审阅。退役期间不参与达成/领取；新身份不得冒充旧档。模型的明确禁止复活不因此改变。

## DB501-03 全类读写与历史边界

| DATA / 类别 | 完整读集合与一次写集合 | 必须不变的目标事实 |
|---|---|---|
| DATA-501 模型 | 当前ai_providers、未退役ai_models（含disabled）、custom_parameters；Key只在显式加密模式读取。一次写完整连接/模型业务字段和每连接新包Key、模型移出退役、连接退出当前集合。 | 生成/预览run与接受快照、learning_batches、user_item_models、model_time_contributions保持；模型历史ID/FK不硬删。 |
| DATA-502 计划 | entitlement_groups四行、group_models、group_lengths的全量配置，含优先级/额度/审稿返修。先验证全集再替换四计划自己的关联。 | accounts.group_code/quota_reset_at、generation_charges、plan_trials及其时间、卡库存、在途spec不动；空模型/长度集合是明确无选项。 |
| DATA-503 道具 | item_definitions及item_definition_models全部定义，含下架项；同ID更新、缺失项仅在从未发放且无任何奖励引用时删除。 | ever_issued取目标且不可false回退；user_items及parameters_snapshot、user_item_models、余额/结算保留。类型不可改；计划卡仍动态读计划、模型卡保留发放集合/时长，下架积分仍动态。 |
| DATA-504 成长 | mastery_experience、源当前及可选pending签到完整四值、所有当前等级及四种成就的全部档位（含disabled）。更新当期mastery，目标下一学习日签到，按完整集合更新/新增/退出档位。 | activated_at、今天/历史checkin_rules、user_checkins、余额/经验、user_growth、level_awards/achievement_awards及settlement/称号快照不重写、不删、不发奖。 |
| DATA-505 文件 | 请求内规范化的受支持类别数据和准确依赖描述。 | 不建包表/长期上传目录；源环境运行数据永不复制。 |
| DATA-506 操作 | 签名预览票据、基线/影响摘要在请求及客户端持有；只有最终提交/判定回执入库。 | 操作元数据不是配置历史库，不含文件、秘密、个人影响名单。 |

字段严格按产品表：先检查“存在/类型/null”再转换，不能用Go零值struct掩盖缺失；额度必须出现，显式null才不限；自定义参数必须显式对象；数字字符串沿现Amount的int64规则，普通整数按当前合同，禁止float精度截断。可选名称按既有规则推导，省略说明/输出限额/奖励道具清空；语言缺省仅清该语言。奖励无道具时数量缺失或0可，有道具必须正数。JSON重复键/U+0000/受保护参数在入库前拒绝。DB默认值只服务初始化，不构成导入字段默认。完整字段覆盖由backend以产品表逐项给严格decode用例，不能以单项编辑DTO可省略为导入许可。

签到取源pending（若整组存在），否则取完整current，覆盖目标下一学习日的四值；mastery立即按新值用于后续业务。预览显示来源和目标日；确认拿锁后若跨北京时间04:00，旧票据失效重预览。目标今天/历史规则不得更新/删除；若目标发现下一学习日以外的异常未来规则，拒绝并交维护确认，不能静默保留一个会覆写本次意图的远期规则。没有当前完整源规则的文件不合格，不能猜值。

## DB501-04 最小schema和权限增量

以下仅为未发布schema设计，无SQL执行授权。最小列/表都直接追踪DATA，不增加文件副本、身份映射平台或全局历史版本库。

| 改动 | 类型、约束和访问路径 | 追踪 |
|---|---|---|
| ai_providers.retired_at | timestamptz NULL；当前集合条件IS NULL。连接移出时，先确认无当前模型引用，保留其历史行供退役模型FK；普通列表/选择/导出过滤。禁止新增模型引用退役连接；retired_at不得清空复活。 | DATA-501 |
| growth_levels.retired_at、achievement_tiers.retired_at | timestamptz NULL；当前规则/导出过滤；历史award仍关联原行。移出时置时间、停用奖励，不删除award/父身份。恢复按DB313-Q01下明确标注的技术建议，仍保留原领奖身份。 | DATA-504 |
| 等级活动门槛唯一性 | 原level_no唯一继续保留以防同级新ID重复领奖；将全表min_experience唯一改为生成列active_min_experience（retired_at为空时等于min_experience，否则NULL）上的命名DEFERRABLE INITIALLY IMMEDIATE UNIQUE，保留同事务门槛交换能力。CHECK原非负/初始级规则保留。 | DATA-504 |
| 成就活动门槛唯一性 | 生成列active_threshold（当前行等于threshold，退役为NULL）；命名DEFERRABLE UNIQUE(kind,active_threshold)替换全表(kind,threshold)约束。原阈值范围/双语/奖励配对保留；kind和id不允许UPDATE。它只约束活动配置冲突；DB313-Q01还要求服务校验与不同身份的保留档位冲突。 | DATA-504 |
| config_import_receipts | 下表，唯一operation_id，applied/not_applied终态；不存pending任务或文件。 | DATA-506 |

生成列/可空唯一方案可沿用现有SET CONSTRAINTS DEFERRED→最终IMMEDIATE检查；不能把“partial unique index”误当可延迟约束，也不能为换门槛临时写非法负数。关系CHECK中的SQL NULL不应被当真：必须NOT NULL或显式IS TRUE，JSON校验仍在解析层。依据：[PostgreSQL约束文档](https://www.postgresql.org/docs/18/ddl-constraints.html)。原有FK全部保留，禁止TRUNCATE/CASCADE用户历史。

成长退休配置仍保存原描述/门槛，个人历史查询包含“当前档位，或本用户已有award的退役档位”；其他用户不看到无关旧档。领取判定必须额外要求retired_at IS NULL；已领退役档位读取原settlement作为事实，不生成新结算。Recompute、当前等级/next-level/待领奖计数只读当前规则。现后台普通编辑也须拒绝误更新退役档位，历史查询显式区分。

**退出当前配置的奖励引用**：退役成长行保留身份/门槛/双语信息，清空其item_definition_id并令item_count=0、奖励开关关闭；这是本次选中成长类别自身的配置引用变化，必须在成长预览中明确列出，不修改任何道具定义或用户资产。已领奖内容由growth_settlements.config_snapshot读取；未领奖的达成记录保持并因退役阻止领取，不能再按原奖品结算。同身份再次导入时从新包完整赋值，绝不从退役行继承可选奖励。道具导入不得自行清理其他类别引用；它仍遇到当前/停用档位的奖励引用就整次拒绝。这样管理员先明确替换成长配置释放其引用，再重新预览道具替换；不形成保留一条无处管理的永久配置依赖。

连接移出不需要长期保留无用途密文：是否由既有凭据模块提供窄删除函数、如何清理配置状态，由backend在TECH-502明确；不得授予app全表SELECT/DELETE。在途spec已绑定私有Key，不需为运行重放保留旧Key。此项未接收前不能声称秘密清理已实现；即使暂保留加密密文也不得列入活动导出。

### DATA-506 最终回执字段

| 列 | 建议定义 |
|---|---|
| operation_id | uuid PRIMARY KEY，服务端在预览时生成并签名绑定；不是上传文件自带ID。 |
| actor_id | uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE；与当前管理员及原票据一致。注销后不保留可识别操作副本。 |
| category | text NOT NULL CHECK IN(models,plans,items,growth)。 |
| request_fingerprint | bytea NOT NULL，固定长度；服务端带域隔离HMAC绑定规范化完整输入/凭据内容/目标映射/预览票据，非可离线猜Key的裸摘要。不得保存口令或其hash。 |
| status | text NOT NULL CHECK IN(applied,not_applied)，只插入终态，禁止UPDATE改写。 |
| baseline_revision / result_revision | bigint NOT NULL >0；applied为baseline+1，not_applied二者相同；这里not_applied的baseline是判定时目标revision，不伪装原预览。原预览revision已在fingerprint绑定。 |
| effective_day | date NULL，仅growth applied且有新签到意图时写目标生效日。 |
| result_counts | jsonb NOT NULL，仅四个已验证非负计数added/updated/removed/unchanged；严格键/类型，无任意payload。not_applied计数全0。 |
| reason_code | text NULL，not_applied为受控安全原因；applied为空。不保存错误原值。 |
| resolved_at | timestamptz NOT NULL，锁后业务时间。 |
| commit_not_after / retain_until | timestamptz NOT NULL；retain_until晚于commit_not_after；签名票据绑定提交截止，清理不能重新允许旧操作执行。具体窗口由backend合同明确。 |

索引仅PK(operation_id)、actor_id（账号删除及限定查询）、retain_until（现maintenance有界清理）。app SELECT/INSERT，不授UPDATE；maintenance只给过期清理所需DELETE/SELECT；ai无权。SQL层终态不变守卫配合权限，插入与配置替换同事务。回执读取由服务校验管理员和actor，不依靠随机UUID代替权限。建议短预览窗口沿现5分钟；结果保留窗口须由backend明确、UI显示其边界并与维护任务同交付，不自称永久历史查询能力。

## DB501-05 一致导出与无写预览

普通导出：鉴权→开启Read Committed事务→配置FOR SHARE→锁后业务时间→完整所选类别/依赖描述读到内存→释放锁→序列化并完成整包→交下载。所有配置写方必须先配置FOR UPDATE；因此多条SELECT不会混到两个配置版本，不能逐页开事务拼文件。签到current/pending按同一业务时间计算，过滤退役身份。失败不给半份有效包，不更新revision、不发放。

含Key导出：同一app事务持配置共享锁，按这份连接ID集合调用**现有CredentialStore/ai pool**读取密文并在服务端解密；共享锁一直保持到所有Key/连接读完，之后才做口令KDF/文件加密和网络下载，不持锁等待用户或昂贵计算。此跨pool读取正确性依赖所有凭据writer也持同一配置排他锁；backend须证明包括旧OpenRouter路径在内均遵守。无需给app密文SELECT或新增服务。任何连接无可用Key、解密失败、连接集合不一致，含Key导出整次失败并安全定位；普通导出不调用ConnectionKey。不得直接导出目标数据库信封密文充当可跨环境解密文件。

预览：严格解析/解密、本地字段校验先于锁；鉴权后配置FOR SHARE读当前全集、目标映射/依赖和影响。导入整批尚不写配置/回执；预览票据在服务端签名，含actor、operation_id、类别/版本、完整输入fingerprint、目标revision、映射摘要、影响摘要、目标学习日/生效日、提交期限。文件或Key处理改变必须重预览；凭据内容只进HMAC输入，不出现在票据明文。前端不能指定目标revision或伪造映射。

相关运行历史可能在共享配置锁下继续变化，故不能把多条Read Committed历史查询拼成同一时刻：影响投影在**同一SQL语句快照**读取，或以经过验证的Repeatable Read只读预览事务获得一致快照（FOR SHARE的事务不能声明数据库READ ONLY）。首版推荐单条历史投影语句。投影限定相关对象，稳定排序后摘要；不把名单写进文件/回执。配置revision之外必须覆盖：

- 模型移出涉及的group_models、当前预设draft/published版本引用、item_definition_models、相关user_item_models身份及影响状态；历史run不是阻止移出的当前配置依赖。
- 道具移出项的ever_issued、库存引用存在性及全部成长奖励引用（含停用/退役）；相关历史/依赖变动使摘要不同，源“未发放”不可覆盖目标事实。
- 成长变化涉及的目标档位达成/领取事实，以及奖励道具可用性；计划影响涉及基础计划人数与有效体验身份/结束时刻。只散列计数不能发现“删一人又加一人”的变化，须按相关身份及影响字段稳定投影；客户端只收到安全计数和配置定位。
- 时间本身：04:00签到边界、当前有效体验到期会改变影响；提交时以锁后时刻重算，不能只比全局revision。

预览会过期或因相关变化失效是既有AC-508，不设计在旧预览基础上自动应用新差异。不得为简化而给每次学习事件推进全局配置revision。

## DB501-06 提交事务、竞态与响应丢失

锁序沿现基线：**配置FOR UPDATE → 管理员账号/权限行 → 本次回执 → 配置对象按类型及UUID固定序 → 必需引用行**。普通业务保持配置FOR SHARE→账号/访客→领域行，禁止先锁用户再升级配置锁。事务只做DB和已解密数据的本地校验；文件解密、KDF、网络、全用户重算不得持排他锁。锁互斥及等待后的新行读取按[PostgreSQL显式锁](https://www.postgresql.org/docs/18/explicit-locking.html)处理。

1. 接收完整输入和原预览票据，先校验格式/签名/actor绑定、完整Key、本地字段。开启事务、取得配置排他锁，再校验管理员仍有效。先查同operation_id回执：同actor/category/fingerprint的既有终态直接返回，不再次改配置；同ID不同请求拒绝。已成功回执可在结果保留窗口内返回，不因原预览过期假称未成功。
2. 无回执才检查提交期限、目标revision CAS、映射/依赖/历史摘要和锁后学习日。逐项全部重验，按同一算法得到与预览相同的最终集合和影响。相关变化即整次不应用、要求重预览，不静默覆盖。
3. 检查跨类移除：模型只要被计划、预设当前draft/published或任何道具定义引用，整次阻止，显示来源/对象；禁止DELETE group_models、解除preset指针、改道具。道具只要目标ever_issued或任何奖励引用存在即整次阻止；不能保留该缺失旧项同时宣称替换成功。模型库存历史不导致删除历史或级联改卡，原退役退款资格逻辑继续用retired_at。
4. 执行所选类别完整变化（先处理同类移出/唯一键腾挪，再新增/原位更新和自己的关联）；每连接Key由本包重新加密入现信封，通过现窄写函数与配置同事务。不传source复制目标Key，不复用单项编辑的留空保留。最后强制所有延迟约束、校验读回集合与预览规范值一致。
5. AdvanceConfiguration恰一次；保留其现有recompute_target_revision语义，不在事务里重算所有用户。与配置一起INSERT applied回执（计数、revision、生效日），COMMIT成功才返回成功。失败整笔回滚，不能先提交回执再提交配置。

**并发发放**：发卡/领奖/兑换现先拿共享配置锁且issueItems同事务写ever_issued。若发放先完成，导入拿到排他锁后必须看到新历史并失效/阻止；若导入先完成，后来发放只能按新配置检查，不可用已删定义。模型受理与替换同样串行：旧受理先commit则用旧私有spec继续；新受理读新配置。退役规则与领奖竞态同序，只有在退役前已成功领取的结算保留；退役后不能凭旧页面领奖。查询与维护job的路径也必须遵守锁序，backend列出实际调用者，不仅给新方法加锁。

**未知结果**：客户端保留operation_id及票据，查询终态，不重新发起另一个operation。查询在管理员鉴权后拿同一配置排他锁；已有回执直接读。若尚无回执，只有经过该串行屏障，写入同operation_id的not_applied终态并提交，才能确定“本次未应用”：早到的提交先完成会留下applied，晚到的提交会看到not_applied并不得再执行。该判定仅写最小操作元数据，不改配置/revision，不声称回滚已成功事务。没有得到锁/DB不可达时继续unknown，不能把一次查无行等同未提交。查询可以用票据所绑定fingerprint建立终态屏障，不需要再上传秘密。

数据库错误明确rollback后，可通过同一判定流程记录not_applied；COMMIT未知不得尝试写失败覆盖，必须先重新拿锁查结果。回执清理只在retain_until过后且提交票据已不可执行；过保留窗口只说明结果记录到期并提供当前配置读取，不能从缺行断言从未成功。backend须在完整API中明确窗口、过期结果和客户端保留策略；本方案未承诺无限期恢复操作结果。

配置当前读值只能证明现在状态，不能单独证明某次导入成功（另一管理员可能又改过）；成功查询以原回执result_revision为事实，同时指出当前revision已前进。绝不通过重放导入、provider探测、重新发奖或恢复旧库来判定结果。

## DB501-07 接收清单、初始化与有限验证

backend-alex接收事项：

| 接点 / ID | 必须给出的设计结果 |
|---|---|
| TECH-501 / DB313-Q01 | 接收已确认A的精确边界及本稿成长同身份恢复建议，保留目标领奖身份；给导入/导出单版本严格格式与类型/必填校验表，复用本稿的数据边界。 |
| TECH-502 / DB501-B1 | 复用CredentialStore和现ai连接池的管理员受限密钥读取；证明配置锁覆盖读取以及所有凭据写方。若现接口不能满足，提出最小接点，不授app全表密文读取、不新增service/vault。完整包加密/认证/KDF、口令限制/临时材料清理归后端；DB只收当前环境信封密文。 |
| TECH-501 / DB501-B2 | 单事务repository入口支持完整类别，不能循环外层service事务；明确字段presence、CAS、历史影响投影、锁序和最终集合验证，列全相关读写者。 |
| TECH-501 / DB501-B3 | 最终回执+未知结果屏障的API合同、客户端恢复令牌、期限/保留与maintenance清理策略；不建设后台任务队列。 |
| TECH-503接口输入 | 逐项新增/更新/移出/不变、准确依赖及字段错误、安全身份、签到生效日、未知结果/过期/冲突。模型缺任一Key阻止整次，不可显示“成功待补Key”。 |

权限沿现owner/app/ai/maintenance拆分；服务端管理员鉴权、CSRF/会话现策略同时适用。普通导出路径不读密文；加密包的临时明文不落SQL参数日志/trace/错误/文件名，不记包或口令。日志仅operation_id、类别、耗时、计数、结果码、revision；现日志可记录锁超时/冲突率，不新增监控平台。相关FK索引沿已有item_definition_models_model、user_item_models_model、growth_levels_item、achievement_tiers_item；预设当前指针依原PK连接，只有实际计划显示需要时再补索引，不为JSON建GIN。

初始化仅修改获批后的未发布schema及`internal/platform/postgres/migrate.go`/启动Verify，具体文件编号由后端实施按当前schema编排；不重写冻结历史产物、不承诺旧库迁移/回填、不重seed当前配置、不触碰3015/4174/4175/4176。启动核验列、约束、可延迟性、权限和触发器，缺失则拒绝启动，不自动修现库。隔离空库失败回滚后修源码；生产/已有UAT的升级另需明确范围。

配置导出不是备份；恢复旧配置仍是新一次导入，照样受引用/历史保护。运行数据备份恢复沿原基线，凭据主密钥与DB备份分离，不增加保留年限/RPO/RTO或自动回滚承诺。未来若人工恢复整个库，须核对恢复点后的已确认删除/领奖/库存，不能拿配置包恢复个人历史。

### 未执行的定向验证计划

| ID | AC映射 | 隔离环境必须验证的结果 |
|---|---|---|
| DB501-V1 | AC-501/502/512 | 四类全量导出跨分页/筛选；普通导出无凭据读取；非管理员/过期身份无配置写或秘密输出；冻结源配置和Key并发改写仍得同一版本。 |
| DB501-V2 | AC-503/510/513/514 | 对产品每字段覆盖缺失/null/空白/0/false/空集合/条件组合；任何一个连接缺Key含停用/目标已有Key均失败，异常加密包不部分导入；可选省略清空/推导；无provider调用。 |
| DB501-V3 | AC-504/508/511/512 | 同UUID稳定映射，跨环境先依赖后使用、同名不同身份不串接；移出有跨类引用整批拒绝，原类/其他类/历史摘要不变；导入末步故障无半更新、凭据也回滚。 |
| DB501-V4 | AC-505/508 | 四计划恰四行、唯一优先级、显式null额度；同revision两个管理员最多一个成功；与新请求先后受理的权益/参数快照正确，旧charge/trial/基础计划不变。 |
| DB501-V5 | AC-506/508 | 道具历史已过期也不能删除，kind改变拒绝；发卡先/导入先两个时序，ever_issued及库存不产生悬挂；既有模型卡快照/计划动态权益/动态下架积分保持。 |
| DB501-V6 | AC-507/508/514 | 验证A冲突拒绝及目标领奖身份保持、同身份恢复不重发；成长全类完整、四成就空集合不遗漏；移出不再达成/领取，已有记录保留；当前/历史签到不变、源pending优先、目标04:00跨界预览失效；不自动发奖。 |
| DB501-V7 | AC-508/509 | 双击/同ID异请求、COMMIT前失败、COMMIT成功丢响应、请求晚到与查询屏障竞争、进程重启、DB不可达、结果期限/清理均有确定且无重复副作用结果。 |
| DB501-V8 | AC-501/504/507/508 | 空库初始化/启动Verify；retired约束、活动唯一及门槛交换、CHECK三值/列presence、app拒读密文、ai不能读回执/个人历史，最小权限实际核验。 |

上述均**未实现、未执行、未验证**。本轮只做文档链接/编号/现状路径/旧正文保留的静态检查，见[evidence/check.json](evidence/check.json)；不跑Go/前端单测、不调用DB/provider、不刷新任何UAT。旧已验收范围与保留事项CR039-L1/CR042-L1/AI-QUALITY-90/W01/QA26-MINIMAX不被本稿重新评判。

当前下一动作：审阅本数据方案（DB313-Q01已闭环）；通过相应角色接收后，由backend-alex处理B1～B3和完整API/TECH-502。本稿不自行批准、不激活下游、不关闭CR-313。
