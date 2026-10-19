---
milestone: M003
stage: technical-design
role: backend-architect/base
agent_name: backend-alex
version: M003-BE-08
status: awaiting_user_review
date: 2026-10-13
---

# M003 后端可实施增量

当前BE08仅处理PRODUCT10 / CR-311/312，入口为[BE8](#be8-cr311-312)与[当前交接](../handoffs/backend-architecture.md)。TRANSITION-M003-098激活backend-alex；业务确认USER-M003-PRODUCT10-NEXT-20261013。CR306及TECH03已完成的历史接收保留096，不再作为当前待办；BE7接口/约束仍有效。BE08尚未实现，完整旧稿/逐段更新取代下面旧版首片删尾；所有精确wire只在API302维护。Profile1.0/model-routing-v1保持，requested gpt-6-astra/high，actual_model/usage unknown。

## BE3-01 选择与范围

继承BE05-R1依 [TRANSITION-M003-037](../reviews/planning-retention-backend-036.md)与USER-M003-PLAN-RETAIN仅调整显示生命周期：初始场景/本篇义项/搭配在初稿、固定编辑、条件返修、retained恢复及pending/EOF期间持续与正文同时显示；标明“初始构思，文章和实际用法可能调整”。只有权威validated或status valid的**完整Result**到达才移除临时规划并建立正式学习资源（含Q02）；失败/取消清全部临时内容，新请求清旧状态。后端无需延长Plan缓冲或新增调用/事件；客户端保留已收到的投影即可。DB设计已由 [DB03交接](../handoffs/database.md)接收；显示保留本身无DB差异，CR306配置持久化接点另见BE7-DB。

**内容链路先遵已确认研究选择，再投影真实进展。** 普通/N0/后台basic：Plan→把完整实际Plan输入Writer→原生校验/必要基础恢复→结算。增强N>0：Plan→Writer→无调用原生校验取证→固定实际编辑一次→原生校验/基础恢复→同目标模型Review→条件完整返修/再校验/再审稿→结算。初稿完整有效可保留lastValid；无效但安全完整的稿可交编辑救稿，编辑前不花基础恢复。具体边界见AI3-01。

规划与固定编辑是实际内容任务，非展示调用；新增调用已由Q3-02-A确认，不再把一句prompt规划当独立规划。普通正常2次、增强正常4次，增强4+2k+t，基础t≤2与条件返修k≤N独立。N0不关闭规划，只关闭固定编辑/审稿/返修。保留N0–99/初始1/同模型/限时/上限定稿/Q02/一业务次数、管理配置及统计。真实方案按N执行；合成或流程测试最多2轮。

规划中的完整场景字符串和完整逐词用法可提前投影，选定zh/en/ja摘要与英语搭配来自同一Plan调用；暂定义项不同于最终通用释义。完整计划验证后才送writer，临时规划与正文同时保留，直到权威valid完整终稿到达才移除规划预览，此后不从正文反推“新计划”或另调用模型。固定编辑可以重构场景而无需更新规划；用户仍看到真实正文splice。规划不足/无正文时诚实等待，不承诺首字或总时延已改善。

| 方式 | 收益 | 代价/风险 | 本版选择 |
|---|---|---|---|
| 每帧累计全文snapshot | 易整体覆盖，继承旧snapshot结构 | 长正文/多轮重复发送O(n²)字节，仍须稿件身份隔离，UI容易整块重绘 | 可行但不作为主路径 |
| 带身份/revision的版本化splice | 小片段直接到达；明确新稿/续写/故障恢复；复用安全delta来源 | reducer须严格校验身份、base_rev与区间 | 采用单一edit事件，不新增回放平台 |
| 等完整包再切片/前端打字 | 客户端容易演示 | 没有真实首稿/修订稿增量，仍等待整包 | 用户已明确排除 |

当前正文投影采用[API302 v6](api/generation.md#cr312-wire)：原splice加显式稿件边界，首稿实时增量，固定编辑/内容返修完整段落覆盖，续写同V新身份，Q02恢复完整lastValid。段落与正文结束分别处理，元数据/原生校验完成前无学习资源；模型任务、预算及私有内容保持。首次安全词边界/50ms合并只适用于initial，不用于强制公开换稿半段。

用户真实增量/换稿方向为CONFIRMED；事件形状与有界合并为本角色授权范围内的具体设计，该wire设计已进入TECH03基线，当前CR311/312投影增量仍待接收。已确认增加独立规划/增强固定编辑的模型调用；本版无新业务待决；新增进程准入与部署参数，不新增基础设施服务。DB03已接收原枚举/版本设计，TECH03已有实施/合成QA；CR306已由096历史接受；其证据不覆盖新CR311/312。

## BE3-02 追踪与模块入口

以下相对backend/；无变化领域继承M002契约，不重写完整历史。

| CAP / DATA / API | 修改入口 | 责任 |
|---|---|---|
| CAP-301；DATA-301/302；API-301 | `internal/entitlement/service.go` Resolve/Options；`generation/service.go` start；`httpapi/catalog_handlers.go` | 唯一胜出计划读N，内容与模型卡/次数卡分离；同锁revision、origin、全请求快照；输出NativePolicy |
| CAP-302；DATA-302/303；API-302 | 新 `generation/pipeline.go`；`ai/{contract,continuation,gateway,openrouter,protocol_stream,validator}.go` | 请求级两个预算、lastValid整包/候选身份、公开投影、严格Review及七类停止原因、同连接、早停和deadline |
| CAP-303；DATA-301；API-303 | `admin/groups.go`；`httpapi/{admin_handlers,group_handlers}.go` | 0–99/开关配对严格读写、只读系统策略、impact/优先级/revision冲突；四行保留 |
| CAP-304；DATA-304；API-304 | `generation/{presets,preset_preview,preset_catalog,preset_cleanup}.go`；`httpapi/{preset_handlers,preset_preview_handlers}.go` | mode版本绑定与固定0/1；共用pipeline/Q02，preview恢复notice与手动发布 |
| CAP-305；DATA-302/304；全部 | `generation/{usage,preset_usage,settlement,charge}.go`、`ai/usage.go`、`generationtrace/*` | 每调用发送/费用事实、终态CAS、文章/调用统计，禁止审稿私有意见入库 |
| CAP-302/304；DATA-303/304；API-302/304 | `httpapi/server.go`新增两个GET路由；`generation/service.go`、`preset_preview.go` | owner/token/TTL限定状态核对，DB派生最终版本/outcome/notice，不再次调用 |

完整HTTP字段以 [API索引](api/index.md)为唯一真源。系统基础策略来自 `ai.NativeCorrectionLimit=2`/策略版本常量（拟名），读取投影和pipeline消费同源；数据库不新增可写基础预算，客户端写入字段拒绝。

## BE3-03 DB3-03–06 具体落点

| 操作 / 拟函数 | 同事务职责 |
|---|---|
| Start/StartPreset→acceptContentPolicy | 配置共享锁→主体锁→锁后Now→Resolve唯一计划→模型/词表/额度→run完整v1快照/entries/Reserve charge/开始事实。N来自计划，不从charge推断；origin=Plan.Origin；extra不改内容N；模型连接BindSpec锁内一次；commit确认后started，无事务等待模型 |
| StartPreview | 配置共享锁→管理员存在→当前draft/version/已保存mode匹配→绑定连接→完整preview快照；basic0/enhanced1，不读管理员计划，不写user charge |
| usageRecorder Reserve/MarkInvoked/RecordReview/FinishUsage | owner+call_no唯一串行；预留失败不发；审稿事实持久后才下一返修；true/false/NULL证据及错误回传详AI3-05；不允许仅log关键事实错误继续成功 |
| CompleteValid(run,PipelineResult) | 配置共享锁→主体锁→active CAS→validateContentOutcome→原charge consumed/学习成长分析→最终draft和outcome/final_content_version/content_stop_reason一次提交。`PipelineResult={Package,Outcome,StopReason}`只由服务端生成，HTTP不传它 |
| CompletePreview | 配置共享锁→preset行锁→active CAS及同一内容事实验证→完整preset_previews→仅匹配version/hash/configuration/mode且空preview_id时关联。写同一包的final_content_version/outcome/stop_reason；旧mode晚完成可独立valid但不能覆盖当前draft/公开样文 |
| SettleTerminal/ReconcileFailure/SettlePreview | 取消/真正失败写outcome及原状态/扣退次同事务，version/reason=NULL。service_incomplete直接走CompleteValid/Preview，不能先退款再转成功；pending review转indeterminate，不捏造pass/issues |
| SavePreset/PublishPreset | mode和生成条件一起版本化；仅紧邻旧草稿纯标题且mode相同继承预览及notice；发布排他配置锁+预设锁+revision/current draft，检查完整valid payload/关联/模式/终态事实，含未完成有效预览人工发布 |
| 0017候选迁移/启动 | 按DB3-02/08一次加字段、精确初始Pro/Plus1、revision一次；实施先核最大号。启动验证完整schema/配置，缺字段或非法配对失败关闭受理，不重seed、不覆盖模型/用量/期限 |

`validateContentOutcome`须按pipeline版本核对：basic=N0、planning+generation链路成功、无fixed_edit/review/content_repair，final1；review_passed=N>0、fixed_edit完整原生有效且该稿审稿pass、没有实际条件repair，final2；repaired_passed=至少1次实际content_repair且末稿原生有效/末审pass；limit_finalized=实际N槽已耗尽、最终原生有效稿末审issues；service_incomplete=有本请求lastValid和AI3-02七类原因、关键事实可持久化。incomplete可final1（编辑故障）、2或之后有效版本，不强制等于最新attempt。只有incomplete原因非NULL，原failure_code/category为NULL。

### BE5-DBA 明确不兼容项与owner接收合同

原BE05审查时DB02/候选0017的四类白名单与N+1上限不兼容；该历史缺口已进入TECH03整改，以下保留目标语义供回归。下表保留BE05给DBA的精确语义，现已由DB03接收；不越权改DB文档/SQL；仍沿现有两run表/ai_call_usage，无新计划表或逐token持久化。

| 位置 | DBA必须同步的语义 |
|---|---|
| ai_call_usage.call_stage CHECK | 新值 `planning,generation,fixed_edit,technical_repair,content_review,content_repair`；legacy历史保留。planning/fixed_edit的review_result=not_applicable、repair_requested=false、reason_codes空；发送true/false/NULL与prompt版本规则不变 |
| 两run表final_content_version CHECK | 对v5 pipeline：N0恰好1；N>0在1..N+2，用户最大101，preview enhanced最大3；failed/cancelled/active和历史NULL仍原规则。业务V不是k+1或call_no；outcome细则由后端完成事务校验实际stage事实 |
| content_stop_reason CHECK | 原六值保留，新增 `fixed_edit_native_invalid`；只在service_incomplete非NULL。planning失败无lastValid不使用此列，沿失败code和planning usage stage定位；完整编辑输出无效不同于上游EOF/协议失败 |
| pipeline_version_snapshot与历史 | v5绑定新链路/版本语义；存储policy v1保持。若实际DB已有旧v4数据，须保留旧pipeline的N+1校验/历史事实，不改写旧版本或补假规划/编辑usage；迁移实现按实际schema/版本表达条件约束，不扩大运行期旧API兼容 |
| 原final/preview/用量统计 | review_passed不再假定final1；固定编辑实际调用另计，不进条件返修率W/F/C；普通含planning但仍basic。所有计次保持一run一charge，编辑Q02交付是valid，不先退再转成功 |
| 初始化与启动核验 | 当前USER-M003-NO-DATA-MIGRATION优先：仅未发布schema/可丢弃空库验证、同步启动schema检查；不迁移/回填/重置现UAT，不重seed管理员配置。历史升级分支留冻结原件，不作为CR306执行任务 |

候选、完整plan、机器诊断、Review和draft/rev只留请求内；最终包一次提交。既有prompt_version/pipeline_version和usage stage足够追踪，无默认新列。所有统计不得由finalV−1推断修稿次数。保存/claim仍一run→一batch，引用最终不可变包，不因模型阶段增加业务次数。

## BE3-04 停止、context与唯一终态

accepted ctx关联用户连接，execution ctx在其下设整体600秒，每调用再设180秒；单次/执行deadline与显式cancel/client disconnect独立识别。内容deadline触发关闭上游并选lastValid后，使用独立有界10秒completion ctx完成Q02，不能复用已到期execution ctx让有效交付必然失败。执行截止不允许发新模型调用；DB完成/确认窗口不是模型加时。

调用预留前/发送前、接收后、validator循环、review事实提交后和成功CAS前均检查取消/终态。显式取消先确认user_cancelled提交再cancel registry；取消写/读不明不能假定已取消，返回pending核对。连接断开/write失败停止模型并按原stream_failed结算；不能将其归为content_transport_error。已进入网络发送的极短竞态可产生费用，停止后不编排下一阶段，迟到usage不复活run。

客户端断连与completion ctx独立取消保护配合：开始完成前若已断连就不尝试Q02；完成过程中监测下行ctx并争取原失败CAS。最终以数据库已提交终态为准，无法保证远端收到结果与DB提交原子一致。valid先赢（含incomplete）则取消/传输失败不退款；取消/失败先赢则不得写draft。一个请求至多一个业务终态，流丢失不改变已提交结果。

关键事实或最终提交异常，先用新鲜5秒context核对run+原charge+最终payload；valid返回库中包/版本/outcome/notice，不能用内存候选假定成功；cancelled/failed投影原值；不能确认则settlement_pending且不开保存。确认仍active才按既有server_failed退款，extra退原item且不延长期限；绝不先退款再宣service_incomplete。preview helper改明确confirmed/error，错误不伪报failed；沿现有registry/maintenance补结算，无新持久任务平台。重启读已提交终态不改写，未完成且内存包丢失沿原失败退款，不重放AI。

receiver关闭body解阻塞、context取消、事件channel可中断；单goroutine writer确保started/edit/恢复/终态顺序，seq只计公开帧；切稿前冻结旧attempt，迟到旧token不得进入新draft。status读取用VerifyRunToken+DB主体，不只依赖进程registry；待保存draft验证digest/expiry/disposition。终态能力沿1小时、草稿默认30分钟；本人已保存batch可沿原关联读取同一最终结果，不给访客token读取claim后的账号batch；删除/过期不重建。状态恢复的notice从run.outcome派生，不新增布尔列/文案副本/token持久化。

## BE3-05 调用、文章与质量统计

DB3-04/07是存储真源。provider_invoked=true才是确认调用，false明确未发，NULL未知；stage进入、repair_requested、usage行存在/收费已知都不是发送证据。`usageAggregate count(*)`不能继续冒充provider_calls，未知发送与未知费用分开展示；legacy/policy NULL单列历史未采集，不补零或basic。

按started_at半开窗口和entry_kind normal/preset、后台preview分别统计，先按run聚合再JOIN，避免多调用放大文章分母。全部受理Nall、增强E、实际审稿R、实际返修W（均按run去重）；返修率W/Nall、W/E、W/R，分母0=N/A。另报规划/首稿/固定编辑/基础修正/审稿/内容返修实际调用数；两轮返修仍1篇、2个repair调用。planning/fixed_edit不是缺陷触发的条件返修；固定编辑不进入W/F/C，另列实际调用与受理覆盖率。预检拒绝不造run；取消/失败仍属受理分母。

牵强F和矛盾C按实际content_repair行的reason_codes标记文章，分别F、C、F∩C、F∪C；两轮分别触发F和C的同篇属于文章交集，调用交集只数同一调用同时有两类，二者不得混算。word_sense/缺前提/因果无据等映射other_content，基础错误不混入内容原因。Review发现、repair_requested与实际发送分别统计；末次issues未执行返修不增W。未知下界=true，上界加无true但有对应NULL的去重run；调用上界加对应NULL行，false不加，不从final版本差推算调用。

交付率=valid/全部受理用户run，包含service_incomplete；审校完成率=(review_passed+repaired_passed+limit_finalized)/增强受理，incomplete不算完成；审稿pass与上限定稿分开，incomplete按stop_reason报告，后台另列。独立质量通过必须由QA评阅，不能用valid或模型自报pass替代。费用/token保留known/partial/unknown及原精度，未报告不是0。只补现有诊断查询/测试SQL，不建统计平台或永久汇总副本。

意见/原句/推理/中间稿不入新列；review任务和包含issues的rewrite请求禁诊断正文捕获。原专用诊断授权/24小时、正文TTL、账号/批次/claim删除规则沿DB3-07/M002，不能为统计留下内容墓碑。

## BE3-06 实施与运维顺序

BE06新增C01–07设计不改变下列业务步骤。实施需接 [容量准入/停机/有限验收](capacity-and-deployment.md)：config＋一个共享CapacityGate、三个生成入口preflight/原子TryAcquire、once释放及pending健康栅栏、main排空顺序、Nginx三路SSE、生产overlay。部署只一个Go副本，DEC-027禁止直接扩replicas；关键控制API不占生成槽。新增503 generation_busy仅用于受理前明确未写run/charge/provider的拒绝，HTTP真源见API-302。

迁移/仓储→权益/管理→task-aware三协议Gateway与pipeline→普通及preview共用流/唯一终态→mode/状态查询→配套前端→隔离测试。新增字段必填；USER-COMPAT-001配套切换，不做旧passage.delta兼容层。TECH03已有schema实现；CR306存储已由DB04与096历史接收；当前BE08无新增schema，保留真实UAT数据及管理员模型配置。

沿原Docker/数据库部署，停写/在途结算/备份和隔离恢复依DB3-08，不新增基础设施。新事实写入后优先前滚，不能drop字段或恢复旧备份丢失数据。关闭增强仍用原计划revision，N=0仅影响新请求，不降级已受理增强。真实上线/在线配置修改需原发布授权，本轮未执行。

## BE3-07 实现与验证矩阵

以下为继承业务回归矩阵；TECH03既有证据可定向复用，但不能替代CR306相关改动验证，使用Go1.26.7、现有三协议HTTP替身及隔离PostgreSQL；不用生产/共享开发数据跑破坏用例，无真实收费调用。**CQ-14：所有流程测试实际内容返修最多2轮；0/99/100等仅配置/字段/静态循环与公式验证，不模拟3–99轮，不声称99轮已验证。** 与DB3-V01–06合并实施。

| AC / 验证ID | 修改与必要验证入口 | UI/DB追踪 |
|---|---|---|
| AC-301 / BE3-V01 | ai protocol_matrix/corrections及pipeline_test；所有模式规划→writer，同一完整plan输入；三个协议同连接；普通2/4次，增强N1≤8、N2≤10 | DB3-V02 |
| AC-302 / BE3-V02 | review/pipeline tests；首审pass早停、明确牵强/矛盾触发、两轮后pass/limit；平淡/开放结尾负例，模板组装真实独立规划与必经固定编辑 | UIA-M003-302；DB3-V03 |
| AC-303 / BE3-V03 | validator/continuation/schema tests；全局基础2不重置，C1/C2/C3跨稿资源隔离；失败新稿显式撤回半稿且不影响最终包、已有v3且v4无效恢复v3 | UIA-M003-303；DB3-V03 |
| AC-304 / BE3-V04 | admin groups HTTP/DB：四计划、独立0/99往返、-1/100/小数/null/缺失/开关错配、非管理员；NativePolicy只读同源且不能写 | UIA-M003-304/305；DB3-V01 |
| AC-305 / BE3-V05 | impact完整before/after N/人数/系统策略/关闭警告，0模型调用；同revision双写仅1成功，ACK丢失重读、重新预览 | UIA-M003-306；DB3-V01 |
| AC-306 / BE3-V06 | entitlement/generation集成：trial到期、优先级/开关/N变更与受理锁两种先后，快照不混合，用量期限不重置 | UIA-M003-301；DB3-V02 |
| AC-307 / BE3-V07 | generation_reservation集成：basic+模型卡+extra仍0，pro+extra保留N，没模型/次数预检拒绝0调用 | DB3-V02 |
| AC-308 / BE3-V08 | generation_matrix/races/trace与preview集成：started写失败/Open失败、安全首词/Unicode、每稿真实增量、续写新identity、换稿及原子最终包、deadline与独立completion ctx、EOF/pending、唯一终态 | UIA-M003-301/302/308；DB3-V03 |
| AC-309 / BE3-V09 | presets集成：basic0/enhanced1独立于计划99（不执行高轮）、模式切回/标题复用/旧调用晚完、incomplete恢复提示/人工发布、浏览零调用 | UIA-M003-307；DB3-V04 |
| AC-310 / BE3-V10 | usage及SQL夹具：文章/调用不同，跨两轮F/C交并、意图未发送、true/false/NULL、0分母、legacy、incomplete交付但非完成 | DB3-V05 |
| AC-311 / BE3-V11 | charge/settlement/claim集成：valid/incomplete/取消/断连竞争、最后SQL/ACK失败、extra跨过期退款；多call仍一charge、保存claim不重扣 | DB3-V03/06 |
| AC-312 / BE3-V12 | 替身记录首可读正文/每稿首片/最长无新内容与换稿空档/总耗时；QA冻结输入/模型连接/prompt/pipeline逐句评阅自然用词/前提因果/文体，分别交付/审校完成/质量及误漏报 | UIA-M003-309相关体验；真实质量待授权 |
| AC-313 / BE3-V13 | 七类stop_reason各替身，已有包/无包/关键DB错误三分；审稿失败最终当前包、返修失败最终旧包，status/流/preview notice一致，原failure_code=NULL | UIA-M003-303/308；DB3-V03 |
| AC-314 / BE3-V14 | 混合基础/内容计数与2轮早停/上限；静态确认循环读取N不是2，配置99/版本101仅存取边界；不执行3–99轮；系统基础预算独立不可写 | UIA-M003-304/305；DB3-V01/03/05 |

权限/隐私/TTL定向覆盖status跨账号/跨管理员/visitor claim后归属、expired/discarded/deleted、notice不抹掉；DB3-V06核对旧完整数据/删除/迁移恢复。前端fixture覆盖N0/1/2内部流程的增量/切稿与管理N99配置；final4及无效v4最终v3、pending、incomplete、模式冲突；用户页面显示只读草稿但不显示N或尝试次数。实现后按仓库现有隔离测试约定运行相关go test，不把本表写成PASS。

保留CR039-L1、CR042-L1、AI-QUALITY-90、W01、QA26-MINIMAX及真实质量/费用/流式延迟未验证状态。本轮无新业务待决；DB枚举/版本CHECK设计已由DB03接收，实施仍待授权；后端接收不等于技术总门禁完成，仍需前端架构交接。

## BE3-08 继承的实现接点与回归约束

以下表为原BE05形成、已由TECH03实施接续的任务契约，当前不再把规划/固定编辑描述为源码缺失。CR306复用现pipeline/BindSpec与三协议任务schema，新增改动以BE7表为准；本次只读代码，无Go执行。

| 入口/owner backend-ethan | BE05必要改动及后续验证 |
|---|---|
| generation/pipeline.go、pipeline_test | 增Plan完整校验/同对象writer输入；增强NativeValidateOnly不消耗基础预算；独立固定编辑/输入分类；版本分配器；编辑与重写共享两次基础预算、lastValid/Q02；用替身断言普通2、增强4、两轮10数学界 |
| ai/contract/gateway/openrouter/protocol_stream | Plan schema、完整条目增量parser、Candidate可编辑完整对象与严格最终Candidate分离；复用三协议正文通道，保持所有任务同BindSpec；fixed_edit也接正文callback；规划失败不跳过/不自动重发 |
| ai/openrouter.go passageExtractor、annotations.go | 原跨字节JSON escape/surrogate/括号安全能力复用；原累计document重新decode有O(n²)风险，按BE3-09局部游标化；原16MiB候选/200万码点界保持；不输出raw JSON/XML/标注或Review |
| ai/continuation.go | 原字段纠错clean不变继续静默；原生续写真正delta、同V新draft_id明确继承前缀；新增fixed_edit不用该字段纠错入口冒充必经编辑 |
| generation usage/settlement/preset_usage | 六stage与prompt版本、原始发送证据、V1/V2/后续版本、七类Q02校验；禁止从版本推调用；DBA契约同步后实现，不能按现0017直接声称兼容 |
| httpapi generation_handlers/preset_preview_handlers、preset status | 复用串行writer/ack/cancel，新增plan_item/真实planning状态、v5 edit；两个命名空间basic/enhanced均跑规划；status只持久终态、preview关联和发布核对不变 |

新增AC315/316定向验证：动态E不固定10、语言zh/en/ja、规划最后缺词/重复撤去预览、writer完整plan相等；有效/无效首稿必经编辑、schema救稿边界、编辑能整体换场景、编辑失败有/无lastValid；取消/DB未知例外不误Q02；规划/编辑不计F/C条件返修。原AC301–314表保留并按新公式/版本适配，不能以本轮fixture PASS宣称代码已实现。

## BE3-09 编辑流的服务器成本与边界（PROPOSED）

USER-M003-EDIT-OPS询问的是前进/回退/替换与服务器负担，没有多人并发写同稿需求。完整CRDT要解决多副本并发合并、乱序传播；本服务只有一个权威作者和一条有序SSE，选base_rev/rev校验的splice即可，既不需要墓碑/向量时钟，也不写每token数据库。终态status提供完整结果snapshot；不提供active稿件恢复/编辑日志/重放。本自定义字符串操作不是RFC6902实现。接交时用户可评审操作结构与预算，当前不是已批准或已压测容量。

### 复杂度与当前源码的实际缺口

正常append只处理新片段O(Δ)，增量维护code point计数和revision；**不得每帧`[]rune(fullText)`/重算全文码点或`string += delta`**。投影可用有界`[]rune`增量append（只转换Δ，cap不超过200万）或分段buffer；writer只序列化edit.insert，不重序列化累计全文。BE05历史首片换稿/retained恢复最多各做一次O(当前稿+目标前缀)的LCP；当前v6段落投影与分片提交以BE8为准，不采用首片删尾。不逐token做diff，也不保留历轮稿副本。客户端同理，正常尾插只处理片段；DOM绘制可合帧，但每条edit先按序reduce且不跳rev。

原BE05源码审查曾发现累计document解析/追加的O(n²)风险；该历史观察不代表当前代码复验。继承的实现约束为在原passageExtractor内增加已消费游标/字符串状态/至多12字节未完成escape-tail，仅解码新输入，把每个安全增量交给既有annotationParser；原完整raw builder保留到结束做一次strict decode/clean一致性校验。只做本文件局部增量解析与既有跨边界测试，不建设另一套协议平台；未完成前不得宣称大正文吞吐达标。

### 有界队列、频率与取消

- 单连接仅1个串行writer；正常coalescer最多50ms、128码点目标批量，单provider edit.insert最多2048码点，待flush缓冲≤16KiB。仅initial正常结束可即时排出有限尾部帧，replacement错误Close不得冲刷半段，不用播放定时器拉长已经完整到达的数据。
- 发送队列同时受8条事件/64KiB普通增量上界约束；达到任一上界暂停provider接收hook形成背压，不丢edit、不跳seq/rev。合并只在分配seq/rev之前进行，不能丢已编号操作。现有同步ack实现相当于队列0/1，继续使用也满足此上界，无需为此增加8格队列。
- retained恢复和最终Result沿现有候选16MiB/干净正文200万码点界，最多各一个在途不可变大对象引用，不能塞入多个全文拷贝绕开普通队列界；先排空增量再写大包。json序列化额外缓冲算入内存观测。
- write/flush 10秒deadline、每调用180秒/整体执行600秒保护保持。慢客户端阻塞包含在原时间保护内；超时写失败/断连立即cancel上游、释放待发缓冲并按原stream_failed结算；不是Q02内容故障。不能为流畅而另起无限发送goroutine或后台继续生成。

### 量级示例与单请求内存

100并发×10帧/秒×300字节/帧≈300KB/秒；若正常20帧/秒约600KB/秒。这里只是**假设平均序列化帧大小**的消息带宽，未含HTTP/TLS、提供方入站和终态整包，不是已测容量。最大2048码点可达8192 UTF-8字节，再加协议字段；100连接×20此类满帧约16.4MB/秒＋封套，不能用300B均值当最坏上界。结束尾部/恢复/最终包的突发另算，限流/背压以实际字节度量。

不能只按短fixture估算内存。现有raw Candidate上限16MiB、annotationParser干净文本上限200万rune（底层rune数组约8MB、UTF-8正文最多约8MB），再有lastValid原始candidate/validated包、正在形成的新candidate、JSON解码和validator索引。新增公共投影最多一个当前稿约8MB＋16KiB coalescer＋64KiB普通队列；避免把lastValid/当前稿/发送快照多份复制。包含原pipeline对象与短时JSON/校验分配的**病理上限输入量级可能达每请求约80–160MiB甚至更高（依实现分配峰值）**，此为工程估算而非硬RSS上限；100个同时顶上限请求不能承诺只耗几百MB。普通几百字请求通常远低于此，但必须测真实分配后给容量结论。不改变产品最大长度或已受理权益；BE06-R1全局受理前拒绝策略、拟测目标与未定生产槽数统一见BE6-C02。

### 后续限定性能验证

获实施授权后以提供方替身（零真实模型费）按BE6-C04限定的10/20目标与逐档验证、代表长度及一次安全界输入测量（历史10/100并发构想不再作为本轮验收矩阵）：首个safe片段→公开edit的p50/p95、每稿首片等待、正常flush间隔、帧数/字节、CPU/allocs与峰值RSS、背压队列高水位、慢客户端取消后goroutine/缓冲回收、terminal整包延迟。比较输入长度翻倍的解析CPU/分配增长，专查累计解析残留；不把合成播放器时钟当线上延迟。验收先验证上界/无无界增长、edit一致性和取消及时，再由实测决定是否需额外优化；本轮未执行这些压测，也未承诺100并发容量。

### 最小后续观测（用户成本关注，不阻塞本轮原型）

用户提出尽量减少服务长期占用并希望后续能统计。复用既有run时间、ai_call_usage、generationtrace及进程metrics，不新增表/成本平台，不逐帧落DB、不记录正文；在请求结束聚合一次无正文数值即可。普通splice应用、视觉平滑/滚动留前端，后端仍承担鉴权、同模型编排、安全清洗、取消与结算；等I/O时阻塞等待，不忙轮询。

| 需要区分的量 | 最小来源/口径 | 不能据此声称 |
|---|---|---|
| 模型等待、调用次数/token/提供方费用 | 既有usage与各调用开始/结束；可得时记录首上游text时间，未知费用保持unknown | 调用wall time不等于模型CPU，也不等于自有服务器CPU |
| 后端实际处理与活跃流时长 | 既有trace区间增加safe-decode/edit-encode累计wall time；请求受理到流关闭单独记 | 连接秒不是CPU秒，处理区间wall time也不是逐请求CPU账单 |
| 排队/写阻塞 | hook等待writer的累计/最长等待、writer耗时、队列字节高水位、写超时/取消原因 | 慢浏览器阻塞不应混成模型慢或Q02内容故障 |
| 下行消息/网络 | 内存累加事件数、序列化JSON字节、最终包字节、替换/恢复数；请求结束汇总 | 应用字节不含所有TLS/TCP开销，也不直接等于部署账单 |
| 并发与进程资源 | 活跃SSE gauge、进程CPU/RSS/heap/GC指标，沿现有采集入口 | Go共享runtime/GC让单请求CPU/内存精确归因困难，不能按连接秒平均成真实成本 |

若尚无对应metrics项，在后续实施计划中补有限计数/直方图，不在本轮实现。固定并发替身压测比较空闲基线与1/10/100并发时的进程CPU、峰值RSS/heap、GC与吞吐，报告基线差异/每完成请求均值及样本窗口；它们是负载下的均值估算，不是逐请求精确账单。实际人民币/美元费用依部署的CPU/内存/时长/带宽计费规则与实测量后算，现不承诺“很轻”。

规划额外内存受AI3-PLAN总256KiB上界及每项界限制，仅保留当前完整Plan/解析缓冲及一个writer编码视图；writer发出后释放。固定编辑属于串行调用，不新增并行provider任务，但延长模型等待/增加真实usage；沿上述600秒和大Candidate内存边界，不能因此宣称成本不变。后续观测按planning/generation/fixed_edit/technical_repair/content_review/content_repair分组并分别记录plan首项与正文首片；本轮无新压测或费用承诺。

BE06速度/硬件/并发初值与测量分母、同机分档验证阈值、备份与多副本限制统一见 [BE6-CAPACITY](capacity-and-deployment.md)，BE3-09仅保留解析/缓冲成本依据；不能把此前100连接算式解释成已支持100并发。

<a id="be7-cr306"></a>
## BE7-01 CR-306 最小技术选择与源码接点

BE07历史设计输入PRODUCT09、[独立069门禁](../reviews/cr306-custom-product-gate-069.md)、原故障/研究、TECH03冻结基线与实际源码。CONFIRMED为USER-M003-CUSTOM-PARAMETERS的每模型自定义JSON方向；具体16KiB/深度8/受保护名单/浅合入是授权内专业设计，已由096历史接收，不称用户逐字段批准。此前未提交typed+目录候选已撤销，仅保留[068旧稿包](../reviews/evidence/cr306-control-068/unsubmitted-backend-typed-draft.tar.gz)，不继续实施。该轮视觉已历史接收；本轮CR312新视觉仍需正式设计与用户评审。

最小方案是扩展现有模型DTO/存储和BindSpec，Gateway一次共用合并。管理员直接写平台原生扩展，不建设每平台专用控件/目录/动态能力系统。选择顶层不相交合入：相比深合并，受控消息/schema/token不存在嵌套覆写次序歧义；代价是某些平台与受控键同名的扩展不可直接配置，需删除冲突或未来独立评估，不靠透传绕过业务边界。空{}保持无扩展，OpenRouter json_schema单独补必要参数支持路由，详AI7-01；不改变供应商选择策略。

| CAP / DATA / API / AC | 最小实施入口（相对backend/） |
|---|---|
| CAP-306 / DATA-306 / API-306 / AC-317/318 | admin/model_connections.go、model_providers.go、models.go及batch输入；httpapi/admin_handlers.go/model_provider_handlers.go：custom_parameters严格对象、重复键/边界、读取与原子保存；所有写路径共用校验 |
| CAP-301/302/304/306 / DATA-302/304/306 / AC-319 | ai/connections.go BindSpec及generation/service.go/preset_preview.go：配置共享锁内绑定不可变对象与连接，受理run/charge前校验；新增run安全快照接DBA |
| CAP-302/306 / AC-318–320 | ai/gateway.go protocolRequest/Probe统一浅合入；三协议位置保持；仅OpenRouter业务json_schema参数支持约束；400/422拒绝证据、安全错误投影 |
| CAP-302/305/306 / AC-320/321 | protocol_stream.go、pipeline.go与generationtrace：推理通道隔离、原180/600截止、首完整规划/正文计时、usage未知与终态保持；不重写既有流程 |

TECH03基础链路已有实施与合成QA；本轮新增custom_parameters仍未实现。早期BE3/BE5中的“候选0017/尚待实施”是历史设计依据，不能覆盖现实施证据；本轮代码入口/缺项以上表为准。容量BE06-R1/DB03既有业务规则保持，CR302保留事项不关闭。

<a id="be7-db"></a>
## BE7-DB 最小持久化接点（交dba-diana）

本表给数据语义与事务要求，不写SQL/改DB03真源；最终列名/CHECK与未发布schema由DBA定稿。按USER-M003-NO-DATA-MIGRATION使用可丢弃空库初始化验证，**不迁移、回填、重置或重启当前3013数据/服务**。

| 原资产 | 最小新增语义（列名为建议） |
|---|---|
| ai_models | 一列custom_parameters JSONB NOT NULL，默认{}；根object、单对象紧凑JSON≤16KiB、深度≤8、受保护/数值规则与API同义。JSONB本身会丢重复键，必须HTTP/服务层在入库前拒绝。DBA明确哪些形状/组合CHECK由库强制，动态业务保护由统一校验器再验证；不建能力表/模式/effort列 |
| generation_runs、preset_preview_runs | 各一列model_request_parameters_snapshot JSONB（版本化安全对象）：`{version:"custom-parameters-v1",custom_parameters:{...},output_mode:"prompt"或"json_schema",max_output_tokens:整数或null,structured_route:"openrouter_require_parameters"或"unchanged"}`。新受理非null、完整且不可变；旧现存行若没有此事实不能伪造{}。模型/协议/配置revision沿现有受理字段和私有spec，不重复存key/baseURL/prompt/推理 |
| ai_call_usage | 不加逐stage参数副本/新枚举；从owner run关联同一快照。最小首内容/推理数值先复用安全trace，无新监控表 |

一模型JSON值保存后读回等价，不承诺缩进/key顺序；序列化与DB数字规范化不应改变可表达值。建议DB大小验证采用JSONB规范输出的紧凑序列化口径或更保守同等限制，不能直接pg_column_size替代API UTF-8字节。由DBA选择可执行CHECK/服务验证组合，并给同义边界证据；不是要求引入通用JSON Schema数据库扩展。

配置保存保留原全局排他锁/CAS/一次revision，单项、batch、聚合全覆盖；受理配置共享锁同时读取参数+连接+原权益，校验后将run快照/entries/原charge同事务提交，不能先扣再校验。模型删除、账号/访客/预览清理沿原级联/TTL，snapshot不是新永久内容资产；不写key/消息/私有推理，不给公共status返回对象。

请求内深复制可复用原BindSpec连接生命周期，阶段不得修改对象或回查模型。重启沿原失败结算，不从DB快照重放模型，不需把凭据落run。以后配套切换须先DBA接收/实施门禁、启动schema Verify检查；本设计不授权处理当前UAT库不兼容。回退参数由管理员显式改{}，仅新请求生效；不drop快照/回滚数据、不自动撤字段重试模型。

## BE7-V 定向验证与接续

| 验收 | 必需后续验证 |
|---|---|
| AC-317 | 单项/聚合/batch对象往返与模型隔离、{}、取消/失败不写、保存0网络模型调用；一个非法模型整组连凭据/revision回滚，非管理员拒绝，CAS冲突/响应丢失重读 |
| AC-318 | JSON语法/全部层级重复键/非对象/UTF-8、数值、16KiB/深度8边界；受保护键/大小写与别名/嵌套secret/顶层冲突；合法reasoning、thinking及其他扩展原样透传；三协议{}黄金比对（单列OR schema路由修复）；400/422/401/429/EOF及接受但效果未知，无静默删字段 |
| AC-319 | Plan后改JSON/连接，原run所有阶段/两次跨阶段native恢复仍原快照，新run用新值；完整Plan实际输入writer；N0/1/2流程与99静态，基础2共享、一run一charge，用户预设/后台basic/enhanced一致 |
| AC-320 | reasoning-only/心跳虚拟时钟180/600截止、取消可达；围栏/畸形Plan不发writer；退款/Q02/下行断连/DB未知唯一终态；schema/support路由不回退；无首业务内容时间为null |
| AC-321 | 后续独立QA用现入口有界真实复验machine/preclude/interim/juvenile/retroactive、游客zh/story/short与增强/预设相关路径，记录完整结果/配置/版本/首规划/首正文/总耗时/用量unknown、原生校验和独立用词逻辑评阅。不把短OK或仅Plan当成功，不扩大收费批次 |
| AC-322 | designer-tony消费[完整fixture入口](fixtures/cr306/index.json)完成模型页高级JSON/保存/冲突/测试与造文/预设等待失败；M002正式视觉、新视觉用户评审后再FE架构/实施，不新建测试页 |

本轮只有静态合同/fixture自检，[证据](evidence/cr306/check.json)明确未执行应用、DB、浏览器、真实模型；BE07交付不是修复成功或下游批准。新的JSON设置不能替代JSON Schema输出保护，先完成参数/路由修复再评价速度，原180/600不会延长。


<a id="be8-cr311-312"></a>
## BE8 / CR-311/312 有界后端技术设计

CONFIRMED产品范围见[PRODUCT10](../handoffs/product.md)、[AC323–328](../product/abilities.md#uat097-acceptance)。技术字段/算法是授权内具体设计，提交接收，非新视觉批准。两个CR仍open/unimplemented。真实两次UAT均后端valid仅是[只读时序](../reviews/evidence/uat-feedback-097/real-run-timing.json)证据；没有录像，客户端停滞原因仍未知，不承诺模型时长下降。

### BE8-01 取舍与数据边界

CR311：固定Go目录一次传入两个SQL，WHERE先排除。只在返回后筛选会被LIMIT及随机抽中禁词饿死；删除词表会破坏原目标/历史，均不采用。目录唯一产品源DATA307；实现以41项不可变slice集中维护，并用完整等价测试禁止两端漂移。SQL/search/random新候选过滤，原成员验证/resolve保持。API004现形状、鉴权与hash不变，见[候选真源](api/generation.md#cr311-candidates)。

CR312：沿现模块化单体、SSE writer、rune splice和安全extractor，加请求内段落投影及活动hook。整包后统一显示会失去已确认首稿体验；每token全文diff浪费CPU且无法证明段落结束；采用initial词边界增量、replacement完整段落按序对应。body_complete是正文字符串闭合信号，不是模型EOF/整包有效。Review整包私有JSON照旧，无旁白调用。不引入CRDT、队列服务、background job、持久草稿或事件回放。

### BE8-DB 无schema影响核对（不是DBA新批准）

已只读核对[DB04/DB3-03版本约束](database.md)、`backend/db/migrations/0017_m003_content_review.sql`两run CHECK和`internal/entitlement/service.go:PipelineVersion`，只精确m003-content-v5采用N+2/七故障分支。**保留pipeline_version_snapshot=m003-content-v5、content_policy_version=1、model_request_parameters_snapshot及所有任务/prompt/budget原值**。公开contract_version改m003-stream-v6，只写HTTP started/status，不写run；新activity/draft/rev仅请求内，无新的字段、索引、写事务、逐token/段DB写入或迁移。词库hash/导入数据不改。因无持久化差异不启动新的DBA交接，也不声称dba-diana已批准BE08；如实施发现必须改候选最终字串规则、schema/快照或预算，先停受影响部分交DBA/产品，不自行换pipeline字符串。

### BE8-02 最小源码责任表（后续实施）

| 文件/入口（相对backend） | 有界改动及必须保留 |
|---|---|
| `internal/vocabulary/service.go`、`db/queries/vocabulary.sql`、对应`internal/dbgen/vocabulary.sql.go` | 单目录参数、相同精确谓词在Search/Random LIMIT之前；随机迁入现sqlc可选机械收敛；成员验证/Resolve不屏蔽 |
| `internal/ai/openrouter.go:passageExtractor.Push/Stream.Receive`、`protocol_stream.go` | 干净passage首次闭合信号，先安全delta再body-close；三协议同来源；JSON其他字段/EOF不当正文；安全清理不变 |
| `internal/ai/contract.go`、`continuation.go:ReceiveWithRepairBudget` | 最小内部body-close hook（如context observer，避免扩大Provider接口）；每次有正文调用单独attempt epoch；续写合并及同V；字段纠错无正文信号。保留clean一致检查与全请求基础预算 |
| `internal/ai/content_tasks.go:Review`、`usage.go:WithInvocationObserver` | 复用发送事实后hook投影improving；Review不公开文本；fixed/rewrite/native correction同映射；不能在调用前虚报活动 |
| `internal/generation/pipeline.go:publicEditor/publicAttempt/ExecutePipeline/finishContentFault` | 增begin/complete/discard语义、段扫描/索引与有限缓冲，Close不等于Complete；固定编辑/内容修复/续写都覆盖；内部lastValid仍只完整Validate后提升 |
| `internal/httpapi/generation_handlers.go`、`preset_preview_handlers.go`及相关SSE helper | 串行seq与union序列化、v6 started/status、分片与原子段/正文提交边界、10秒write deadline/断连传播、payload上限协调；普通/预设/预览共用 |
| 前端schema/stream parser/reducer/mapper（交frontend-bob，不由本轮修改） | v6严格union、code point patch、段落呈现键/滚动锚点、旧epoch隔离，正式UI确认后实现；不得从V/活动次数造进度 |

内部body-close仅在extractor.closed首次false→true且annotationParser final成功、UTF8/JSON转义/surrogate全闭合后调用。当前Push可在同chunk遇引号后返回clean且后面还有tags/targets；hook必须在消费本chunk delta之后调用一次。未来任何错误Close/cancel/timer drain不得代替成功闭合；若正文未闭合就中断，只能discard。现无该hook，实施不能依靠最终Receive返回才猜完整段尾。原生纠错即使新response带passage也保持静默；比对clean后接受，非法改文不发任何事件。续写额外正文闭合仅表示追加段闭合，public body_length是原前缀＋既有双换行＋extra clean的总长度，随后整包合并/校验仍可能失败。

### BE8-03 成本与发送边界

新增内存至多一份完整旧正文/段索引、当前新稿索引及未封闭段（沿16MiB raw/200万clean码点既有候选界）；复用不可变Candidate/lastValid引用，不每事件复制旧稿。分段扫描为新增字符线性，段比较合计O(新旧正文)；不要每token扫全文。平坦rune splice若每段搬旧尾可能O(段数×文长)，实施可保留段切片、发送时累加码点offset、终态一次join，仍不需要通用文本引擎。初稿coalescer维持50ms/128码点；超长单段必须等闭合，不能为性能破坏完整段落。

所有edit保留每片2048码点上限，长段在既有candidate/clean上限内缓冲，闭合后分片并以paragraph_complete一次发布；最后段/删尾和retained恢复以body_complete发布。避免单帧全文/新增长段拒绝。初稿16KiB coalescer不作为完整段缓冲限制；普通队列仍有界64KiB，背压串行消费分片，最多一个待提交段，客户端复用片段列表/索引，不每帧克隆全文。关闭网络/超时打断阻塞写，discard/EOF丢未提交分片。CPU/内存是复杂度说明，非实测RSS/吞吐/延迟；BE3-09旧估算不是本轮性能验收。没有每token/段新增DB写，usage仍每实际调用及原结算；新增边界帧随完整段/真实活动转换增长，无计时假帧。

### BE8-V AC323–328 有限实施/QA计划

| 验收 | 后续必要检查（本轮未执行应用测试） |
|---|---|
| AC323 | 同一合成词库全41项及大小写遍历，断言搜索与随机资格集合相同；SQL语义在LIMIT前过滤；前limit全禁词而后有合规条目仍取满；随机集合逐项断言而非若干抽样 |
| AC324 | art/go/theater/another与q=the；旧selected含the可生成、锁定预设不新增拒绝；词库行/hash及既有文章保存复习不变；复用原权限/错误/上限回归 |
| AC325 | 半新段保留三旧段、相同段无edit、逐段覆盖、短稿complete才去旧尾、长稿追加、重构、CRLF/空白分隔及无尾空行；initial首词即见；fixed/native correction/content rewrite/续写同V |
| AC326 | observer未确认发送/只有心跳不造活动；Review真实等待保留全文；无私有报告；正式UI中英文/窄屏/键盘/reduced motion/阅读锚点，浏览器真实消费，不用静态词句代替 |
| AC327 | passage闭合后tags延迟/畸形；complete只截尾不学习，plan全程保留；最终结果同版本offset准确，保存/claim/preview publish仍DB资格 |
| AC328 | body前/后中断、字段修正clean变化拒绝、Q02降V恢复、cancel/DB pending/断连/CAS、旧seq/rev/epoch、终态后迟到事件；同模型/基础2/N≤2功能序列且N99静态边界；调用数不增加 |

先在隔离替身与已有局部集成套件验证协议/SQL，不重跑无关领域；再FE严格reducer/浏览器消费同fixture，独立QA按功能验证，文章质量不评级。无需本轮新模型调用。新技术通过不等于视觉或UAT通过。

### BE8-04 配套切换、回退与接收

当前未上线，USER-COMPAT-001：后续将BE/FE的started/status union、parser、fixtures、测试及后台preview一起切v6，无v5/v6双写/运行时兼容平台；旧v5样例冻结仅历史。后来获准刷新3015时，先完成新包/功能QA，再按原UAT门禁有序排空在途生成和更换配套构建，禁止仅更前端、schema重建、迁移、seed/reset或替换真实模型。浏览器刷新新client后再受理；旧流断开走原核对逻辑，不自动重发。本轮不停止/重启3015。回退是BE/FE配套回原构建，原数据库/模型配置保留；在途run先结算或确认终态。身份/CSRF/token、私有日志保护及用量未知口径均保持。

下一专业接收为designer-tony：消费API唯一语义和fixtures，按M002/UI11/UI12原完整页面给正式设计，含规划/旧稿/混合稿/等待/终态、变化标示和阅读连续；然后frontend-bob做技术接收，最后实施/独立QA/UAT刷新分别经门禁。没有激活任何下游，没有DBA新审批声明。
