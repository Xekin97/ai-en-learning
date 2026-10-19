---
id: API-301-302
version: M003-BE-08
status: awaiting_user_review
milestone: M003
---

# 权益、动态生成流与唯一终态

CAP-301/302/305/307，DATA-301–303，PAGE-204/215/216，AC-301–303/306–308/310–314、AC-315/316及UIA-M003-301–303/308。V=访客、L=本人学习者；管理员走独立预览。以下路径省略 `/api/v1`；公共封套/错误继承[index](index.md)。新增字段均必填；只有显式null可空，整数必须JSON整数，拒绝未知/重复字段及尾随JSON。

## API-301 选项和系统基础策略

```text
ContentService = {native_validation:true,content_review_enabled:false,content_repair_limit:0}
               | {native_validation:true,content_review_enabled:true,content_repair_limit:int[1,99]}
NativePolicy = {version:"m003-native-policy-v1",scope:"logical_request",max_calls:2,editable:false}
Plan = visitor|basic|pro|plus
ValidContentOutcome = basic|review_passed|repaired_passed|limit_finalized|service_incomplete
CompletionNotice = "content_review_incomplete"|null
```

ContentService严格关联配对；所有模式都独立规划后writer，content_review_enabled=true还包含一次必经固定编辑及审稿/限次返修，false仅关闭这整个增强段，不关闭规划；visitor/basic固定关闭0。NativePolicy由后端系统常量映射，pipeline版本定位，不来自计划表可编辑值；基础预算覆盖普通初稿或增强固定编辑后及所有后续稿，不能重置；增强编辑前只原生校验取证不花基础预算。用户/管理写接口不得接受native_policy/max_calls等系统字段。

`GET /generation-options` V/L：保留M002完整data，新增 `configuration_revision:string,content_service:ContentService,native_correction_policy:NativePolicy`。原effective_plan仍 `{code:Plan,origin:visitor|base|trial,trial_ends_at:Time|null}`。revision及内容权益同配置共享锁读取；可用性仍检查模型/长度/次数，增强不免预检。页面依实际开关/N，不凭计划名、模型/次数卡推断；试用只取唯一胜出计划。

`POST /generations/stream` 请求仍严格 `{model_id:string,meaning_language:zh|en|ja,scenario:story|discussion|business|news,length:short|medium|long|xlong,entries:string[]}`，64KiB及原词表/配置授权限制不变；不接受content_service/mode/prompt/provider/技术预算。受理事务重新解析当前权益：旧options下输入仍合法则接受，以started覆盖预估并刷新options供下次使用；本次快照之后不变。输入失效422，权限403，active冲突409 generation_in_progress，次数不足429 quota_exhausted，配置/凭据不可用503 generation_unavailable；预检拒绝不调用。

受理事务配置共享锁→主体锁→锁后业务时间→完整快照/模型连接/run/entries/原charge/开始事实同事务。COMMIT确定未成功返回Problem；ACK不明用已分配run ID限时读回，完整run/charge确认才继续，否则503 temporarily_unavailable并交原恢复，不宣称未扣次。POST不自动幂等重放；新生成必须用户新意图，普通/用户预设共享每主体一个active槽。

## API-302 受理前忙碌拒绝（BE06）

以下三个POST在任何run/charge/provider调用之前共用进程准入：[BE6-C02](../capacity-and-deployment.md#be6-c02-并发口径配置与原子准入)。本文是错误结构唯一真源，后台API-304复用。

- `/generations/stream`
- `/presets/{id}/generations/stream`
- `/admin/presets/{id}/previews/stream`

鉴权/CSRF/严格body之后，预检护栏、global/preview/connection容量、维护排空或已知上游冷却不允许受理时返回 **HTTP503 `generation_busy`**，`Content-Type:application/problem+json`、`Cache-Control:no-store`，尚未启动SSE。准入检查与原受理事务顺序由BE6-C02定义：组合容量原子TryAcquire、零等待；不先写run再退款冒充拒绝。

完整例（所有列出字段必填；无其他context字段）：

```http
HTTP/1.1 503 Service Unavailable
Content-Type: application/problem+json; charset=utf-8
Cache-Control: no-store
Retry-After: 5

{"type":"https://wordweave.example/problems/generation-busy","title":"Generation temporarily busy","status":503,"code":"generation_busy","detail":"Generation is temporarily unavailable. Try again later.","request_id":"request-example","field_errors":[],"context":{"accepted":false,"retry_after_seconds":5}}
```

`context={accepted:false,retry_after_seconds:int[1,600]}`。Retry-After使用十进制整数秒并与body完全一致：普通容量满默认5秒；排空/结算健康栅栏默认30秒；已知连接冷却用剩余秒向上取整并限制1..600。它只是建议最早再尝试间隔，不是排队、完成预测或预约承诺。HTTP允许503携Retry-After提示服务暂不可用的重试等待。[RFC9110 Retry-After](https://www.rfc-editor.org/rfc/rfc9110.html#name-retry-after)

FE保留用户输入、停止本次等待，映射安全code到已批准页面的错误/再试区域；可以在该间隔内禁再次提交或显示稍后可试，倒计时结束也**不自动重POST**。没有run_id/token，不查询虚构status，不减少/补退次数，不显示排队位置。已收到明确generation_busy可以说明“本次未开始，未使用生成次数”；只收到网络失败、代理502/503或无法解析body时不能套用此结论，按原受理结果未知边界处理。

登录/读取/保存/取消/status不经过生成槽；仍受各自身份、幂等与正常故障规则。409 generation_in_progress、429 quota_exhausted/既有限流、503 generation_unavailable或temporarily_unavailable与新busy不同：COMMIT/终态未知不得写accepted:false。受理后不发generation_busy SSE事件；容量不会撤回已受理额度或跳过增强阶段。真实上游故障沿原failed/Q02，无有效稿失败退款，有有效稿且满足Q02才带notice完成，不能把本地忙碌变成成功。

## API-302 SSE 精确字段（m003-stream-v6）

PRODUCT10 / CR-312保留首稿真实增量，替换稿按完整段落更新并保留未更新旧段；本节v6取代v5首片删尾和同稿仅尾插限制。原v5冻结样例仅为历史。新增事件不改变模型任务、完整资源或结算；wire v6与持久pipeline m003-content-v5是不同维度。当前是BE08设计，尚未实现或批准新视觉。

受理COMMIT确认后200 SSE并flush started成功才Open；started写失败不调用提供方。headers/no-store、15秒注释心跳、每次write/flush的10秒截止、POST fetch/无Last-Event-ID或续流保持。seq只为实际公开命名事件编号，从1严格连续；心跳无seq。串行writer同流只写一种确认业务终态。

### 身份与完整事件类型

`run_id`是业务生成身份，一次扣次；`stream_id`是该HTTP响应的随机不透明身份，仅保留在本次会话，不新增库字段/恢复功能。客户端以本地request epoch＋namespace＋stream_id绑定回调；started后的帧从其响应流继承身份，不与别的响应混序。`draft_id`是不透明的可见正文身份；begin显式声明首次增量、整稿替换、同V续写或retained恢复。调用attempt epoch只在服务端，用于封闭迟到callback；字段/标注纠错没有新可见draft。同V续写以新draft继承完整前稿，永不继承混合半稿。ID只在本HTTP流有效，不新增持久化。

`content_version`是业务候选版本V：首稿1、固定编辑2、之后每个内容返修任务依序分配新V（当前链路2+k）；基础恢复不加V，因此同V可有多个draft_id。N0时V=1；增强V在1..N+2（最多101），预览增强最多3，不能作为百分比/当前第几次。终态final_content_version来自lastValid，允许低于先前可见的部分草稿V。

| event | 完整data |
|---|---|
| generation.started | `{seq:int,contract_version:"m003-stream-v6",stream_id:string,run_id:string,generation_token:string,snapshot:RunSnapshot}` |
| generation.progress | `{seq:int,phase:planning|composing|finalizing}` |
| generation.plan_item | `{seq:int,plan_id:string,meaning_language:zh|en|ja,item:PlanPreviewItem}` |
| generation.activity | `{seq:int,activity:writing|improving}` |
| generation.draft | `DraftEvent`（下节精确union） |
| generation.edit | `{seq:int,draft_id:string,content_version:V,base_rev:int,rev:int,at:int,delete_count:int,insert:string,source:provider|retained}` |
| generation.validated | `{seq:int,run_id:string,final_content_version:V,result:Result,content_outcome:ValidContentOutcome,completion_notice:CompletionNotice}` |
| generation.failed | `{seq:int,code:FailureCode,quota_refunded:true,retryable:bool,request_id:string}` |
| generation.cancelled | `{seq:int,quota_refunded:false}` |
| generation.settlement_pending | `{seq:int,code:"settlement_unconfirmed",request_id:string}` |

`RunSnapshot={configuration_revision:string,effective_plan:{code:Plan,origin:visitor|base|trial},content_service:ContentService,native_correction_policy:NativePolicy}`。`Result={passage:string,tags:string[],targets:Target[]}`；`Target={entry:string,entry_meaning:string,hint_phrase:string,hint_blanks:[{start:int,end:int}],occurrences:[{surface:string,start:int,end:int}]}`。所有必填、数组非null，只有显式null可空；原词全部各一次/输入顺序；offset是Unicode code point半开区间，不是UTF-8字节或JS UTF-16索引。完整资源规则继承 [M002书架](../../../M002/technical/api/identity-library.md)。待完成草稿只展示edit累计的正文，不携带旧版词义、高亮、标签或hint；validated/status valid才一次建立完整Result及资源。

### 实际规划条目的临时预览

`PlanPreviewItem={kind:"scene",text:string}|{kind:"word_use",entry:string,form:string,sense:string,phrase:string}`；两个分支exact keys、非null。scene.text来自完整闭合的Plan.scene；word_use来自一个完整闭合且局部校验成功的Plan.word_uses项：sense=meaning，entry/form/phrase原值，不发role/参与者/facts/beats或推理。长度界同AI3-PLAN。meaning_language为受理语言；scene/sense所选zh/en/ja、form/phrase英文，无额外翻译调用。文本纯文本渲染，禁止当HTML。

每run一个不透明plan_id，所有plan_item同ID/语言；scene最多1条、每selected entry最多1条，在模型真实完成项的顺序中发。局部成功只是暂定内容，后续完整plan失败仍撤去；完整校验前不调用writer。seq与全部正文/状态同一递增序列，plan_item不改变正文rev/V；只能在planning期间消费；writer发送前须排空计划项，composing之后不得再有计划项。预览不能保存/学习/高亮，不把sense放入最终entry_meaning。没有完成项时只保留真实受理/规划状态，不造占位义项。

BE05-R1依据USER-M003-PLAN-RETAIN：第一条及后续正文edit都保留已有规划卡片，场景/本篇义项/搭配与正文同时显示，贯穿初稿、固定编辑、条件返修和retained恢复。固定标明“初始构思，文章和实际用法可能调整”；编辑换场景也不把初始计划伪称实时更新，不从正文反推或额外调用模型刷新计划。

只有权威`validated.result`或`status=valid`携带完整`Result`时，才原子移除全部临时规划并建立最终正文/正式学习字段，包含Q02的service_incomplete及持续notice。retained、finalizing、EOF、pending或仅有valid状态但result=null均不满足此清理条件；未决继续保留已收到规划与草稿、禁保存，结果不可用时按既有状态说明，不拼partial重建。已经完成并清除的规划不因后来查询结果不可用而复现。failed/cancelled清全部临时内容；启动新请求先清旧plan/正文并隔离旧request epoch。不能把计划预览当编辑者必须遵守的承诺。本次仅改变客户端显示生命周期，无新事件、字段、plan_ready、服务端缓冲/存储或保存API。

<a id="cr312-wire"></a>
### CR-312 / v6：显式稿件边界与原子正文编辑

以下union各分支exact keys、必填非null；seq仍全流连续；body_length/paragraph_count/paragraph_index/base_rev均非负整数。`generation.edit`形状保持，无新增字段。码点offset、rev全流递增不重置；draft边界/活动本身不增加rev。服务端与客户端均区分**working正文**（已应用所有edit）与**published正文**（用户看到的最近完整提交）；initial两者同步，其他mode先暂存working，再在明确边界发布。revision约束working，不由DOM文本长度猜测。

```text
DraftEvent =
 {seq,action:"begin",draft_id:string,content_version:V,mode:"initial"|"replace"|"append"|"restore",base_rev:int}
 | {seq,action:"paragraph_complete",draft_id:string,content_version:V,base_rev:int,paragraph_index:int}
 | {seq,action:"body_complete",draft_id:string,content_version:V,base_rev:int,body_length:int,paragraph_count:int}
 | {seq,action:"discard",draft_id:string,content_version:V,base_rev:int}
```

`begin`不改任何已发布字符，working从published引用起步：initial仅空正文且V1；replace需前稿正文已complete，V大于前provider V（固定编辑2，内容修复递增）；append需前稿正文complete、同V且保存其真实完整前缀；restore仅Q02内部lastValid，可降低V。discard后只能restore、失败、取消或pending，不续接该ID。之前的draft在下一begin后不可复用。body_complete与discard各最多一次；body_complete之后仍可discard（正文虽完整而其余JSON/整包失败）。没有公开“候选已valid”事件，内部lastValid与可见完整正文严格分开。

**完整段落定义与对应（不做语义对齐）**：在annotationParser输出的干净码点流上识别空行分隔：两个逻辑换行之间仅含空格/tab；CRLF算一个逻辑换行，LF/CR也各算一个，保留全部原字符、不统一换行、不trim正文。最大连续空行分隔符暂存到下一个非分隔字符才封口；分隔符归左段。前导空白归首段；空白不产生独立内容段。最后一段直到安全的passage字符串闭合才完整，包括无尾换行；空/纯空白正文若字符串安全闭合也可body_complete（paragraph_count=0，body_length为实际码点数），但不因此通过原生内容校验；后续既有编辑救稿/失败规则保持，不能新增提前拒绝。按从0开始的段序号一对一覆盖，不按词义/句子diff。新段更多时追加；更少时只在body_complete删旧尾；重构按段序号自然替换，最终精确等于新干净正文。

- initial：generation.edit继续安全词边界增量尾插，不等待完整段落，working立即发布。body_complete前flush正常安全尾片，声明长度/段数；initial不发paragraph_complete。
- replace：保存begin时完整旧正文及其段索引。新半段留服务端，浏览器全部旧段可读。每一个封闭新段与对应旧段精确比较；不同才以一个或多个有界generation.edit替换该完整段（含归属分隔符），**暂存working且不更新用户显示**，随后paragraph_complete一次发布该段。相同不发edit但仍发一次该段paragraph_complete，以明确下一段序号；前端比较字串，未变段不提示。新段超出旧段数则尾部追加，未更新旧尾保留。每次只允许一个未提交段，paragraph_index必须从0连续递增。
- append：新ID/同V，复用现续写合并的双换行及真实新文本。paragraph_index从前稿段数开始；首个追加段将双换行一起纳入insert。只提交完整新段，永不更改前稿码点。即使普通首稿后的续写也用该模式，初次writer仍原生增量。
- restore：begin后以source=retained的有界edit片段在working恢复完整lastValid（文本相同可零edit），仅body_complete一次发布，无paragraph_complete。不伪装provider token、不授予保存资格。
- body_complete：最后未封闭段和多余旧尾先通过有界edit暂存working，**事件到达才原子发布整个working**。body_length及paragraph_count必须与working精确一致，base_rev=current_rev。没有“先删尾后声明完成”的窗口；之后禁止该draft的edit/paragraph_complete。正文此时完整但可能还在接收tags/targets/usage；不得提前学习/保存/发布或标整包完成。
- discard：停止draft、丢掉未完成段/计时器；working回到最近published（不回滚rev，边界事件明确重置缓冲），base_rev必须current_rev，无用户文字变化。后续Q02立即restore→body_complete→finalizing；否则走failed/cancelled/pending。pending仅可保留最近published草稿、禁保存；不得发布缓冲半段，不把混合稿提升lastValid。failed/cancelled清临时内容。本地EOF/协议异常/取消请求即丢未提交working分片并停止消费，等待status；即使缺discard也不露半段。

每个edit使用原splice算式`working[:at]+insert+working[at+delete_count:]`，仅当前ID/V合法。替换完整段时首片删除对应旧段并插入首块，后片在该插入块末尾继续插入（可能位于working中部，不是全文尾插）；都在段提交前隐藏。每块insert最多2048码点，删除范围可包含整段/旧尾，纯删除合法；禁止无意义空edit。同一段的完整目标已被服务器安全解析才开始发分片；未到段边界不发replacement分片。客户端在paragraph_complete前检查分片只改变当前段范围/新增段且不损坏未更新后缀；完整段边界和顺序符合上述定义，失败则停止并查status。body_complete允许处理最后段与删尾，最终验证精确长度/段数；source必须provider（initial/replace/append）或retained（restore）。不把网络分片当成视觉变化。

前端根据begin旧段快照及提交后段文本判定真实变化，只有变化段短暂标示；删尾/最终段也仅在body_complete处理。相同段无高亮，restore不伪装新写作。无逐词语义diff，无新模型请求。像素、持续时间、滚动锚点、reduced motion由designer-tony定稿，frontend-bob实现稳定段键/阅读位置；技术协议不指定最终UI。

### 实际活动及严格顺序

`generation.progress`仍只planning/composing/finalizing；增加activity有且只有writing/improving。writer或实际续写已确认发送并成功记录原usage发送事实后发writing；fixed_edit、content_review、content_repair、字段/标注基础修正已确认发送后发improving。真实同状态连续阶段去重，不通过重复事件显示轮次。调用结束到下一阶段的短本地验证仍属于当前工作；finalizing、任何终态、EOF转pending/取消请求发起立即停止活动显示。没有已确认发送就不发新活动；心跳和时间经过绝不触发activity。Review维持完整JSON私有读取，仅加现InvocationObserver，不增加一次模型请求、心跳次数或持久事实。

顺序：started → planning/plan_item → composing → activity(writing) → draft.begin(initial) → edit* → draft.body_complete → [真实下一任务activity；draft.begin(replace/append) → [完整段edit* → draft.paragraph_complete]* → 尾段edit* → draft.body_complete]* → 实际审稿activity(improving，去重) → finalizing → DB确认validated。活动和begin必须在对应正文callback前串行发出；同帧JSON闭合和正文字符必须先交安全字符，再发一次body_complete。Review不发draft或edit，tags/targets位于passage之后时持续improving/当前活动，不能因body_complete伪造已完成。字段纠错只有activity，无draft/重复正文；验证clean不变后才使用修正Candidate。仅API终态完整Result清除规划。

无seq缺口、禁止base_rev跳跃/重复draft/未begin编辑/complete后编辑/非法区间/非法mode或V；一旦异常停止消费并查status，不重排、不猜、不重POST。连续相同seq与相同规范event/data仍仅幂等忽略；其他旧seq/同seq异内容为错误。旧HTTP流/request epoch的任何回调先隔离。finalizing后禁止activity/draft/edit，终态后旧回调不能改变正文或资格。

### 首次输出与合并节奏

initial公开正文来源链为 `protocolDecoder(text only) → passageExtractor(JSON passage) → annotationParser → bounded public coalescer`。首个已确认词边界（空格/标点分隔）且非空的干净片段立即可发，不再等32字、完整句/段、全部targets或基础校验。正常合并窗口最多50ms（目标最多20次flush/s），达到128码点优先准备flush；initial的单个provider edit.insert最多2048码点，持有待发安全片段不超过16KiB。大上游帧按已收到的片段拆成有界编辑，不人为按字符延迟。initial正常结束冲刷安全尾部，可有有限突发；replace/append不得在错误/取消/普通Close时冲刷半段，最终尾段由body_complete原子发布，已闭合非末段由paragraph_complete发布；50ms不是严格网络每秒帧数承诺，也不凭时钟新增字/状态。

底层没有新安全文本就不发edit。尾部flush不能受“首次32字”阈值而丢短稿。队列/背压与量级见BE3-09；单稿上限沿原16MiB候选/200万干净码点，不另扩长度。所有mode的edit.insert最多2048码点；完整长段先在服务端缓冲，闭合后按同一edit形状分片，paragraph_complete/body_complete提交前不显示。单帧JSON仍有界，客户端按现SSE拼帧读取，不新增长段拒绝或扩大候选界；段缓冲上限来自已有16MiB candidate/200万clean码点，不能误用初稿coalescer的16KiB拒绝合法长段。source=retained同样分片后一次发布；复用不可变lastValid对象，不让每个队列元素复制全文。

UTF-8必须完整；外层SSE合法JSON先解码，再仅选正文text类型，不投影reasoning/tool等非文本通道（忽略或拒绝沿adapter原规则）；Review任务不接正文callback。内层JSON转义、跨帧反斜杠、UTF-16高低surrogate配对未完成时缓冲，不发U+FFFD替代。`grapes(grape)`只出grapes，未闭合标签不泄露；自然括号短语等平衡后才能释放。不以正则删半个JSON或XML包裹猜正文。位于JSON之前的XML/围栏不被extractor识别，按原完整输出校验失败；正文内疑似XML标签从`<`开始保留，识别为标签开头（字母、`/`、`!`或`?`）即停止该候选并报协议污染，不能先泄露再擦除；普通比较符不作HTML解释。这个有限前缀门需补到公共extractor安全边界，现代码尚未有XML门。所有已发安全字符必须等于该尝试解析后的干净前缀；闭合后校验不一致就失败，禁止修改已发前缀伪装append。

最长等待受真实提供方、结构化位置和安全缓冲影响；只承诺上述消费规则，不承诺线上首字秒数。原型的 `playback[].after_ms` 仅调度对应wire帧，模拟真实增量节奏，不能用于声称性能；正式客户端不再给完整终稿加打字动画。

### 可见状态与终态状态机

1. started后真实活动和draft事件按上节；所有规划卡片一直保留。首稿实时可读，完整段替换时暂时的新旧混合文本只是草稿。
2. 选择有效最终包前封闭所有attempt callback；失败活动draft先discard，Q02发restore begin/body_complete，再finalizing。正常路径visible必须等于所选完整候选clean正文，DB确认valid才validated并建立全部资源；不允许从mixed view合成Candidate。
3. 增强先V1→固定编辑V2，再两轮条件返修V3→V4，每稿有多条真实edit；公开不显示版本、尝试、k/N。新半稿V4失败可以retained V3→validated final3，固定编辑V2失败可retained V1→validated final1；其余所有业务outcome/notice关联保持：basic仅N0；review_passed增强未返修；repaired_passed末审通过；limit_finalized末审issues且耗尽N；service_incomplete七类内容技术故障有lastValid。前四种notice=null且只说生成完成，第五种持续“内容审校未完成”、可保存且计一次。
4. 非幂等重复/倒退/跳号、未知事件或字段、base_rev/rev不符、区间越界、复用旧draft_id、provider降版或非法段操作、非法V、未开始就edit、finalizing后正文/活动事件、outcome/notice冲突：停止消费并查询status，不猜缺片、不buffer重排、不重新POST。当前stream的紧邻重复帧仅在seq与上条完全相同且规范化event/data一致时作无操作（保留上条指纹即可），不能重复执行splice；更旧seq或同seq不同内容均协议异常。重复DB终态status/取消确认则幂等，不二次扣退或保存。旧request epoch/旧HTTP流回调直接隔离；同当前流错误identity不能默默拼接。
5. 无lastValid失败清除可见半稿与临时字段、不可保存，退款沿原来源；主动取消同样清除但不退款。取消/浏览器断连/DB事实错误不是Q02。pending/EOF未知可以保留已看到的草稿并明确待核对、禁保存；不得从retained恢复帧推断成功/已扣退。503/active不覆盖已确认终态；终态冲突锁住新保存并核对。
6. status只读持久最终包（终态snapshot），active不返回逐token/draft/phase；本版不新增active snapshot接口或可续接的编辑日志。缺口后停止当前流并核对，active/503继续待核对，不自动恢复增量或调用模型。EOF漏帧后status valid可直接用完整Result恢复，不要求本地草稿匹配；status valid无结果不能拿partial重建。SSE validated如果正常路径与可见稿不同可用权威完整包替换，但仍需记录契约差异；Q02允许显式回退，保存资格只来自DB。

### 正式设计直接接收

当前有限合成输入见[CR311/312 fixtures](../fixtures/cr311-312/index.json)；wire是完整SSE event/data，不需要推断缺字段。expected与source_chunks仅供检查，不进入产品状态。旧[stream-v5](../fixtures/stream-v5/index.json)保持历史，不得继续当v6当前夹具。合成调度不能证明真实等待已改善。

展示白名单仍只有安全正文、规划、真实活动映射、权威Result及安全终态。activity(improving)对应已确认“正在完善内容”，英文/窄屏/减少动态由正式UI设计接收；不展示seq/rev/V、mode、源码阶段、审稿意见、轮次/预算/百分比/ETA或模型私有推理。开始新请求清旧规划/草稿并更新request epoch。设计不得借换稿强制滚到底，不能逐token朗读。

### 故障、核对与权限

FailureCode仍 `authentication|authorization|rate_limited|provider_unavailable|protocol_error|schema_error|content_validation_failed|generation_timeout|generation_failed`。仅真正失败终态使用generation.failed；七类内容故障且有完整有效包按 [AI3-02](../ai-integration.md#ai3-02-七类内容故障与保留稿) 发validated/service_incomplete，不先failed再成功。retryable仅表示用户可新意图重试，不自动重发本请求。认证/授权错误false，其他尊重真实ProviderError；不泄露上游正文。DB关键事实失败先核对，不能套内容故障成功。

`GET /generations/{run_id}/status` V/L，X-Generation-Token，无query/body，200：

```text
{contract_version:"m003-stream-v6",run_id:string,status:active|valid|failed|cancelled,snapshot:RunSnapshot,
 final_content_version:V|null,result:Result|null,can_save:bool,quota_refunded:bool,
 content_outcome:ValidContentOutcome|failed|cancelled|null,completion_notice:CompletionNotice}
```

同一一致读取run、charge和结果。status只返回持久终态事实，不新增临时phase、draft_id、stream_id或逐token重放；active的outcome/version/result为null，can_save=false，refund=false；failed/cancelled的outcome同status、version/result=null、can_save=false，只有failed refund=true。valid读取run.final_content_version/outcome并导出notice，不按调用次数猜；有效draft仍可用时result完整/can_save=true（V表示可claim）。已保存的本人学习者可沿既有generation_run_id读取其本人batch组装同一结果，can_save=false；已丢弃/过TTL无结果、已删除batch或visitor已经claim给账号时result=null/can_save=false，仍在允许状态窗口内返回outcome/notice；不可用访客token读归属他人账号的batch。result不可用不抹掉故障提示、不重新生成。

使用VerifyRunToken+DB主体/owner检查，待保存draft还需token digest及原expiry/disposition；终态沿1小时能力窗口，草稿默认30分钟。404不匹配/资源已删除，410能力过期，503 DB暂不能确认；前端404/410停止核对并关闭保存，保留安全说明、重新生成是新意图；503/active短核对后仍未知保持pending。立即查一次，最多每2秒、总10秒，未收敛提供显式“重新核对”，不无限轮询。此GET不调模型、不续流，不把token写本机/URL；刷新丢token不新增恢复能力。已有合法恢复途径重读结果时notice必须稳定，不能把UI“刷新仍有提示”解释为新续传平台。

`POST /generations/{run_id}/cancel` 原权限/header/{}→200 `{status:cancelled|valid|failed,quota_refunded:bool}`，仅确认DB终态才200；未知503 settlement_unconfirmed。先CAS确认取消，再cancel context；完成先赢则valid（可能service_incomplete），用status读取最终包/notice；失败先赢failed/true。重复cancel不二次结算，不把已有内部有效稿或可见草稿当拒绝取消理由。取消本身不触发内容故障交付。

客户端断连/write失败沿原技术失败退款；valid先提交后断连仍valid不退款。execution deadline在有lastValid的内容阶段可带提示完成，其独立完成/核对ctx不继承到期；客户端取消/断连另行检测并参与CAS。保存/放弃/claim沿M002 API-006与原TTL/幂等；服务器要求valid+完整最终资源，无论内部几次调用始终一run一charge，service_incomplete不额外扣次或退款。

<a id="api-306-generation"></a>
## CR-306 受理参数与无业务内容失败

CAP-306 / AC-319–321。公开POST不接受custom_parameters/任意provider参数；公开RunSnapshot/SSE仍m003-stream-v6。服务端在原配置共享锁内按[API-306](administration.md#api-306)验证已保存对象与三协议受控字段，绑定私有快照后才写run/charge。库中对象损坏/非法保护字段/合并冲突在**确定未受理**时503 generation_unavailable、标准Problem context={accepted:false}；没有run/token，不扣或退款、不自动POST。公开错误不回参数或provider详情；管理员从模型配置修正。COMMIT不明继续原temporarily_unavailable，不能声称accepted:false。

不查询目录，不根据参数名字判平台支持或改写；上游在受理后拒绝400/422沿protocol_error，安全子类/HTTP status只在后台诊断，不能回带上游消息。没有自动删参数/改模型/重发。无有效稿失败且DB确认退款才generation.failed/quota_refunded:true；有lastValid的增强故障仍Q02；主动cancel=false退款、断连、DB未知按原唯一终态规则，不把pending写成已退。

reasoning-only、响应头、心跳不产生plan_item/edit，不能记首业务内容。每调用180秒/总600秒的独立deadline保持，不随任何事件重置；[AI7-02](../ai-integration.md#ai7-02-无业务内容失败与最小观测)为计时规则。无完整有效Plan超时用原generation_timeout，完整围栏/畸形为schema_error，writer未发送，无新公开错误枚举。UI只显示真实等待/可取消/失败/已确认退款或待核对，不显示参数、内部推理或假进度。


<a id="cr311-candidates"></a>
## API-004 / CR-311 新候选资格（既有端点，无DTO变化）

CAP-307/DATA-307/AC-323–324，继承[M002原API-004](../../../M002/technical/api/generation-presets.md#api-004-search)。GET /vocabulary/search?q=&limit=：V/L/A，原参数、前缀优先/包含/长度/词条排序、1–20 limit、标准封套与错误保持；POST /vocabulary/random：V/L+原CSRF，body selected_entries，原权益上限、去重、本人库lexeme排除、limit_reached/no_candidates和无扣次保持。

同一不可变41项DATA-307目录作为SQL参数，`lower(v.entry) <> ALL(blocked_entries::text[])`放到候选WHERE，**先过滤再排序/LIMIT/random()**。搜索不把查询q本身封禁：q=the可返theater/another等匹配合规条目，绝不返精确the。SearchVocabulary与Random使用同一Go目录和同一资格SQL helper/CTE模板；优先将随机查询迁入现有vocabulary.sql并由sqlc生成，两个查询显式同一谓词且共享参数源，不建视图/表/后台页。若sqlc不支持抽出谓词，保留两处短谓词并用同一资格集合测试约束，禁止复制目录。存储原词/hash/entry_count不变，vocabulary_version仍原源快照hash，不能把筛选目录混入该hash。

只限制新建议：ResolveVocabularyEntries、Random验证selected_entries成员、生成受理/预设保存发布/已有锁定预设/历史保存复习均不得套blocked谓词。旧选中the合法，随机只排除它并寻找新合规词。无剩余合规词返原no_candidates，不回填禁词；合规足够时搜索最多取满limit（原query匹配不足除外）。不增缓存、管理配置、模型/词典调用或数据迁移。

示例（data外层仍原meta.request_id）：搜索q=the,limit=2且有the/theater/another，`{items:[{entry:"theater"},{entry:"another"}],vocabulary_version:"sha256:<unchanged-source-hash>"}`；随机selected_entries=["the"]且只剩go时`{entry:"go",reason:null}`；全部不合格`{entry:null,reason:"no_candidates"}`。全41项/大小写/饥饿反例见同一fixture。
