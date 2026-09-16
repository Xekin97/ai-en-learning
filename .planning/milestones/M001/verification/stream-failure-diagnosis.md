---
milestone: M001
stage: verification
role: quality/base
agent_name: qa-quinn
date: 2026-09-10
status: single_hint_capture_enabled_awaiting_user_reproduction
verification_round: TRANSITION-M001-122
---

# UAT 流式生成末尾失败：当前诊断

## 当前确认：统一最小取证（USER-UNIFIED-CAPTURE-123）

CONFIRMED（USER-UNIFIED-CAPTURE-123）：用户对共享窗口方案回复“允许”，并要求全面处理、不再逐项推进。两个已出现的错误共用一个样本名额：annotation_source_unknown仅错误source及紧邻词；hint_annotation_missing仅失败目标原始hint。原测试账号/MiniMax、总计一份、最长一小时、读后/到期删除；不保存全文、其他hint、释义、密钥/令牌，不记录内容到普通日志。定向实现、验证和6001后端部署沿本次批准及连续交接执行，无重复审批；不含真实AI代理调用、prompt/validator业务变更、SQL/数据清理或放宽校验。

本轮统一检查原因分派、身份/模型/探针排除、两种先后顺序、混合并发和跨实例竞争、只读后删除再重启不得重采、期限/私有权限/写盘失败，以及消费者SSE/退款/草稿。诊断以当前章节为准，以下旧窗口为历史；原入口冻结于[evidence](./evidence/unified-capture-123/pre-current.json)。未知原始标注仍需采样确认，本轮不是已修复模型生成根因。CAP-008/009、API-005、DATA-010/011；CR039/040继续open。

## 最新两次反馈：正文来源标注错误再次出现（01a08928）

[两次脱敏运行证据](./evidence/hint-capture-122/real-runs-01a08928.json)确认同一测试账号、MiniMax/minimax-m3、zh/discussion/short、输入melancholy/handicap/foray/casino/upswing，122后端ee5d52d2与16份来源未变：

| run末段 | 耗时 | 内部原因 | 结算 |
| --- | --- | --- | --- |
| ef21c2d06c1d | 2.351610秒 | annotation_source_unknown，target_index=-1 | validation_failed，产品额度未扣，累计false，草稿0 |
| 5ffa542ed86d | 3.129190秒 | annotation_source_unknown，target_index=-1 | validation_failed，产品额度未扣，累计false，草稿0 |

CONFIRMED：两次都在正文解析后的groupAnnotations中找不到与输入完全一致的source，不是hint_annotation_missing，也不是超时。该分支早于提示处理/词法检查；不能把未执行的后续检查视为通过，-1不指向第一个词。

OPEN：具体括号标签未保留，仍不能区分模型大小写/拼写/额外标注、普通括注被识别或解析偏差。没有原件，不推测真实内容。

取证检查：02:33:59Z当前目录只有ticket.json，无hint.json或hint.claimed，没有内容可读取/删除，也未消费单份名额。原因是121–122方案把窗口改为仅hint错误，排除了本次再次出现的正文错误；这是诊断覆盖不足，不能把已有定向PASS说成所有失败都能捕获。旧标注窗口已停，不偷偷重开；本轮无AI调用、代码/数据库/运行配置变更，用户附带令牌未使用或保存。

PROPOSED：下一步把两种先前说明的最小投影合在一个共享单份窗口，按首个匹配错误择一记录：正文source_unknown只留错误标签及紧邻词，hint_missing只留失败目标一条hint。仍同一账号/MiniMax、总计一份而非各一份、最多一小时、读后/到期删除；不保存全文/其他hint/释义，不改业务校验或代理调用。当前仅建议，尚未合并或开启新窗口；先不要求用户继续盲目重试。原三份当前报告/诊断/交接冻结于本次证据。

## 当前有效窗口：单条失败hint（121–122）

USER-HINT-CAPTURE-121“允许”已完成[定向实现](../implementation/evidence/hint-capture-121/developer.json)、[消费者QA](./evidence/hint-capture-122/qa.json)及[实际部署](./evidence/hint-capture-122/deployment.json)。6001后端ee5d52d2，2026-09-10T02:01:22Z启用，截止03:01:21.076Z（北京时间今天11:01:21）；原账号/MiniMax、hint_annotation_missing，只取失败目标一条原始hint与有限元数据，不采正文/其他hint/释义。私有tmpfs单份/读后或到期删除，hint.claimed防重采；当前仅ticket.json。原正文标注窗口已关闭，不并行增加采样。16源/环境/15表/4路由PASS，前端未改，测试PG/初始化容器/宿主票据已清理，无真实AI调用、规则/SQL改动。旧六份入口冻结在122部署原件。

以下01a08902诊断结论继续有效，原hint尚未取得；此前02:48:48/13:02:39窗口及待批准措辞均为历史。现等用户复现并提供run_id后按新范围读取并立即删除，不声称业务问题已修复。

## 最新反馈：首项提示未解析到标注（01a08902）

[脱敏运行证据](./evidence/annotation-capture-120/real-run-01a08902.json)：MiniMax/minimax-m3，zh/discussion/short，输入melancholy、handicap、foray、casino、upswing；2026-09-10T01:50:27Z终结，耗时3.306156秒，validation_failed/content_validation_failed，quota_charged=false、累计false、草稿0。同一授权账号和模型、同一120续开镜像。

CONFIRMED：内部错误hint_annotation_missing、target_index=0，即melancholy的hint_phrase解析后没有任何原词标注。不是此前的正文annotation_source_unknown，也不是超时。此分支出现在完整结构解码之后、首项提示的实际词形扫描之前；不能把“没解析出标注”等同“短语没含该词”，也不能把尚未执行的后续校验判为通过。原116 parser/validator/provider三份摘要均匹配，提示及schema描述已经要求正文和每个hint使用紧邻ASCII括号标注，不能声称从未规定。

OPEN：没有原始hint，无法区分完全漏标、空格/括号格式不符或具体解析偏差。只确认失败位置和条件，不推定实际短语，更不声称正文与所有词已完全合格。

取证边界：当前票据只接受annotation_source_unknown，本run不匹配。01:52:28Z只读确认目录只有ticket.json，没有annotation.json或claimed；没有内容可读或删除，样本名额未消费，原窗口仍至02:48:48.862Z。未使用或保存用户附带令牌，没有新AI调用、部署、代码、校验或数据修改。

CONFIRMED（USER-HINT-CAPTURE-121）：用户对“临时采集失败词对应的这一条提示短语，仍不保存文章，最多一份、一小时、读取后删除”明确回复“允许”。仅原账号/MiniMax下一次hint_annotation_missing的失败目标hint；不采正文、其他hint、释义、标签、凭据或令牌，不写普通日志，不改变prompt/validator/SQL/API或付费调用。沿既有诊断设施定向实现/验证并临时更新6001后端，开始时换为提示专用窗口，不并开两个采集模式；新窗口部署起最多一小时。普通交接沿已有连续授权，范围冲突才再确认；CR039同一问题追踪，CR040不变。旧八份当前文档冻结于[修订前原件](./evidence/hint-capture-121/pre-current.json)。

## 当前窗口续开（2026-09-10）

CONFIRMED（USER-ANNOTATION-WINDOW-20260910）：用户“再给我一次测试窗口吧”明确续开上次同范围的一小时窗口。只绑定原run测试身份与MiniMax、只采下一次annotation_source_unknown的一份错误标签及紧邻词，读取/到期删除、不保存全文、不代调用模型、不改变业务规则。qa-quinn沿已验证120镜像更换私有tmpfs票据并定向检查；无阶段切换或实现返工，不重跑既有开发/全站测试。新窗口时间以本节执行回执为准，旧119/120审批及证据保持原件。

[续开执行回执](./evidence/annotation-capture-120/renew-20260910.json)：2026-09-10T01:48:50Z启用，截止2026-09-10T02:48:48.862Z（北京时间今天10:48:48）。使用同一7d16e902镜像及同一账号/模型绑定，切换新私有tmpfs票据；旧窗口已过期且没有残留样本，新目录只有ticket.json。12份来源、权限、配置、15表与4路由PASS；前端/Nginx/PG容器未替换，Nginx只reload；初始化容器/宿主票据已清理。没有真实模型调用或业务修改，无阶段迁移，仍待用户复现后提供run_id。下文9月9日窗口为历史，不再使用旧截止时间。

## 最近真实反馈与9月9日窗口记录：MiniMax正文标注归属失败（01a085f3）

[本轮脱敏证据](./evidence/inline-mapping-118/real-run-01a085f3.json)：2026-09-09T11:35:16Z，MiniMax / minimax/minimax-m3，zh/discussion/short，输入melancholy、handicap、foray、casino、upswing。8.012148秒后content_validation_failed；quota_charged=false、累计计数false、草稿0。当前后端90f23b57及日志均为m001-v5 / m001-v5-wn31-r1，118运行实例未更换。

CONFIRMED：内部原因annotation_source_unknown、target_index=-1。validator先解析正文，再由groupAnnotations按本次输入精确查找括号内source；至少一项解析出的source不是这五个输入之一。这个位置早于hint与词法关系验证，-1不代表第一个单词。不是超时、旧协议未部署，亦不能沿用旧seed/read提示数组多报的根因。

OPEN：具体错误标签和紧邻实际词没有保留，无法确认是大小写/拼写变化、给额外词加了标注、普通括注被识别，还是解析实现偏差；这些只是候选解释，不是本run的观察。当前提示已要求exact selected original entry；不能说完全没写该限制，亦不能没有原始标记就断言应放宽。原句其余部分、提示与释义是否合格也尚未证明。

CONFIRMED（USER-ANNOTATION-CAPTURE-119）：在明确提出“当前测试身份和MiniMax、下一次失败的错误标注及紧邻词、不存全文、最多一小时、读取后删除、临时后端更新、不代调用模型”后，用户先询问浏览器看不到括号是否正常，得到后端先去标注的解释后回复“那你查一下吧”。本次承接该已展示方案，仅针对本run对应测试身份和模型的下一次annotation_source_unknown，私有临时记录错误source与紧邻词，不记整篇/提示/释义/标签、密钥或令牌，不进入普通日志，最多一小时一份、读取/到期删除。

本次确认范围为隔离诊断能力及定向验证后更新6001后端，不改变提示词、校验、API、SQL、模型/组配置或退款，不新增收费调用。旧请求全文无法恢复，启用后由用户生成；其他模型/身份、成功、其他错误不消费样本。单份上限覆盖并发和同票据重启，取证文件使用私有tmpfs与0700/0600。原118诊断不覆盖当前授权；完整旧样本采集模式保持关闭，不增加旧协议兼容。CAP-008/009、API-005、DATA-010/011的失败无草稿/退款规则不变。

119–120已顺序完成backend-ethan有限取证实现及qa-quinn消费者验证/部署；普通门禁沿USER-HANDOFF-CONTINUOUS-001，实际临时部署由本次已展示范围授权。不再询问同一方案批准，遇到范围冲突才暂停。原当前六份文件在[evidence快照](./evidence/annotation-capture-119/pre-current.json)，已有真实失败原件不改。

最初诊断只读日志/账本与16份来源，未使用或记录generation_token。随后119有限实现与120[消费者验证](./evidence/annotation-capture-120/qa.json)、[实际部署](./evidence/annotation-capture-120/deployment.json)完成：6001临时后端7d16e902启用最小投影，最多一份，截止2026-09-09T13:02:39.438Z（北京时间21:02:39）；部署时目录只有ticket.json，尚无标注样本。私有0700/0600 tmpfs，不采全文，空claimed文件防止读后重启再采。代理真实调用0、无迁移/清库，配置及15表摘要保持，前端未变。

当前待用户同一测试身份选择MiniMax复现；成功/其他身份模型/其他错误不消费样本。诊断改善不代表根因已完整确定或业务修复，本次仍不改变prompt/validator或放宽规则。旧诊断/开发/测试及更新前文档完整冻结于120原件，首次QA夹具错误保留，普通接收已完成而真实质量仍未验收。


<a id="inline-source-annotation"></a>

## 当前确认：原词就地标注，后端提取（USER-INLINE-MAPPING-115）

CONFIRMED，2026-09-09：用户提出“那就这样改吧，调整提示词限制，无论是短文还是 hint，生成时都应显示为 xxxxx grapes(grape) xxx. 其中 grape 是原词，grapes 是符合句子或者短语语义的词，后端再进行提取”；随后对“标注仅供后端解析，流式预览和最终展示均不显示括号标注”的澄清回复“是”。

| 已确认范围 | 对实现和验收的约束 |
| --- | --- |
| 正文与提示就地标注 | 模型输出如 `She bought grapes(grape).`、`fresh grapes(grape)`；后端取得实际形式 `grapes` 与输入原词 `grape` 的对应关系，不再要求模型分别维护 passage_forms / hint_forms 数组 |
| 标注不面向用户 | 流式预览与最终正文/提示仅显示 `She bought grapes.`、`fresh grapes`；不能先显示括号再在完成时隐藏 |
| 沿用独立校验 | 标注仍是不可信候选关系，不替代本地词形关系验证；全部目标覆盖、全部合法重复位置扫描、跨目标冲突检查不放宽 |
| 复习与释义不变 | 阶段一仍答原始词条、阶段二仍答实际形式；位置必须对应清理后的正文/提示。entry_meaning只解释输入原词，与文章、场景、实际词形及派生无关 |
| 替换而非兼容 | 不实施下文“剔除多报数组”假设，也不增加旧数组协议双读、自动重试、备用模型或第二次模型调用；沿USER-COMPAT-001 |

## 当前落实与定向复核（116–117）

已由backend-alex完成[技术修订](../technical/backend-cr039.md)，backend-ethan完成[开发交付](../implementation/backend-validation.md)，117接收后qa-quinn完成[消费者侧复核](./evidence/inline-mapping-117/qa.json)。prompt m001-v5 / validator m001-v5-wn31-r1；标注与普通括注区分、跨块缓冲、clean rune位置、版本/schema/探针一致切换均已实施。公开API、SQL、前端和复习格式不变；未增加旧数组兼容。

QA三语言的HTTP生成→保存→详情→两阶段复习通过；正文与hint中未逐次标注的已知重复词形仍全量挖空，同源空位保持匿名分组。两项错误hint标注均只有失败终态、退款且无草稿。结果仅覆盖合成提供方与隔离数据库，不能推出真实模型的语义质量或失败率。开发的逐块/边界/并发等证据单独接收，不与QA数量累计；未重跑全站UI。

开发另在慢下游测试中发现流式尾段竞争：541/546字符，末5字符被完成事件越过；改为同步交付delta后10轮及race通过。此为独立确定性缺陷，不冒充下文真实content_validation_failed的根因。

追踪：CR-039，CAP-008/009/018/019、API-005–008、DATA-010–015；CR-040原词释义保护不变。无新实质需求选择或返工冲突；普通交接已沿USER-HANDOFF-CONTINUOUS-001完成。

用户“允许”批准UAT-INLINE-117-DEPLOY，118于11:04:25Z完成[本地后端更新](./evidence/inline-mapping-118/deployment.json)：6001当前运行普通v5镜像90f23b57，4路由/权限检查、配置与15表摘要保留PASS，前端/nginx/PG容器未替换，Nginx仅reload。首次检查脚本误用了不存在的/me路由并触发恢复；正确/account路由复验通过，[原始方法失败](./evidence/inline-mapping-118/attempt-1.json)保留，不是产品返工。

代理真实模型调用0，无直接数据修改/迁移/清库；正常访问可产生访客等生命周期数据，不能声称全库零写入。114样本已分析删除，采集挂载和环境已移除，不续期。既有功能验收保留，当前真实质量、CR039/040与发布仍未验收；现交用户测试造文质量。

当前入口复用[报告](./report.md)、[覆盖](./coverage-matrix.md)、[AI评估](./ai-evaluation.md)、[UAT](./uat.md)和[交接](../handoffs/verification.md)。115时六份原文保留在[117证据](./evidence/inline-mapping-117/qa.json)的previousCurrentDocuments；更早原件在[修订前快照](./archive/pre-inline-mapping-115.json)。下文24项旧假设检查仍未采用，不算新协议通过证据。

## 已完成诊断：真实失败的离线归因

用户提供run 01a0855e-2c7e-7059-bd88-1460b7ea4d1f，2026-09-09T08:52:29Z已命中114临时采集。GLM / zh / discussion / short，输入minus、deep、land、seed、read、message；原正文62词，下限50。耗时约13.06秒，content_validation_failed、quota_charged=false、累计计数false、草稿0。[脱敏证据与原件回放结果](./evidence/failure-capture/real-run-01a0855e.json)。

| 对象 | 模型声明 | 对应提示中实际情况 | 结果 |
| --- | --- | --- | --- |
| seed的hint_forms | seed、seeds | seed两处，seeds零处 | mapping_surface_absent，target_index=3 |
| read的hint_forms | read、reading | read一处，reading零处 | 前项修正后mapping_surface_absent，target_index=4 |

这两个额外词形都出现在正文，而且本地词法验证器均判定关系known；问题是被声明到没有使用它们的提示里，不是派生未收录或超时。完整候选已解码，当前适配器按字段直接解码，没有将正文/提示数组互换的转换层。能确认上游候选违反分段映射契约，但不推测模型内部是否实际复制了正文数组。

### 可重复的因果对照

使用同版本词法资产/校验器、网络禁用的隔离Go运行器；只读原私有文件，摘要匹配；没有新增模型调用/DB访问或生产源码修改。

1. 原候选原样回放：seed的mapping_surface_absent，与运行日志及采集一致。
2. 仅在内存把seed.hint_forms改为单项seed：转为read的mapping_surface_absent。
3. 再仅把read.hint_forms改为单项read：整批确定性校验通过，正文/标签/释义/提示内容完全未改。seed提示2处/正文2处，read提示1处/正文2处，全部位置仍被扫描。

因此本条失败根因为模型多报提示映射，服务端按既有“任何错误声明整批失败”规则拦截；不是已证实的校验实现误判。其他旧run的mapping_relation_unknown仍缺原候选，不能拿本条归因替代。确定性通过不等于整篇语义质量通过。

<a id="mapping-pruning-boundary"></a>

### 历史检查：有限剔除边界（未采用，已由就地标注方案取代）

以下为当时的假设及检查记录，全部建议仅代表历史，不再是待用户决定或待实现的当前方案；原始结果不改。

用户本轮“下一步检查”只授权检查，不代表批准放宽规则。QA在不挂载真实样本、无网络、生产源码只读的隔离环境中，以合成数据验证假设；[24项原始输出与源摘要](./evidence/failure-capture/policy-boundary-check.json)全部符合预期。测试辅助逻辑仅在QA overlay内，不是候选生产实现或新正式验收标准。

| 情况 | 建议处理与检查结果 |
| --- | --- |
| 关系已验证、但在其对应正文/提示中未出现的多报词形；该段还保留有效声明 | 仅从映射剔除，不改文字；正文/提示各自处理，合成正例通过 |
| 已出现的实际词形、大小写变体、重复或模型漏列但服务器可识别的形式 | 全量独立扫描保留，Unicode位置及当前快照往返通过 |
| 未知或无关词形、错误拼写 | 不因“没出现”而静默过滤；无论出现与否都保留拒绝边界 |
| 原始数组缺失/空/null/超限/非法字符串，或者剔除后没有任何有效声明 | 继续失败；即使扫描能找到别的原词，也暂不自动补造空数组 |
| 正文或提示缺目标、只在别的提示出现、仅在别词内部命中 | 继续失败，不跨段借用覆盖 |
| 不同目标争用同一正文位置、取消、目标数量或身份不匹配 | 保留原拒绝/取消边界，不靠数组过滤绕过 |

关键反例：只按“字符串不出现”删除，会把seed的无关banana声明一起藏掉，得到本不该通过的结果。因此建议先验证关系，只处理“关系known但对应段不存在”的冗余项；不是把所有错误映射当噪声。

5个正例保留正文/标签/原词释义/提示字符串，seed正文3处/提示2处、read正文2处/提示1处均被扫描；其中4个在现有规则失败、在假设规则通过。其他17个表内反例拒绝，另有取消和不安全过滤反证，共24项。只证明列出的边界与当前快照形状；没有运行修改后的真实HTTP、保存/复习E2E、并发发布或性能验收。

### 历史假设的影响检查与当时待确认差异（不再待批准）

- 现有代码已独立计算最终occurrences；保存和复习读这些可信位置，不直接读取passage_forms/hint_forms。从当前依赖看，此有限改动不需要公开API、数据库或UI形状改变；本轮没有改动它们。
- 原词释义仍只解释输入词条；正文内容、目标顺序自由、自然词形、全部已知重复位置、同词分组及两阶段作答规则不变。词法资料未覆盖的unknown不会被此方案放行，也不能保证解决旧young失败或整体失败率。
- 如果之后采用此规则而使一批结果有效，会按正常成功计次，不再退还该次产品额度；本轮没有写账本或新增模型费用。
- 与当前[CR039 §3.1/§5](../technical/backend-cr039.md)、[AI方案§5.3](../technical/ai-integration.md)及C39-09的“错误声明整批失败”存在明确差异，必须由用户确认。推荐仅返回backend-alex作受影响技术修订，随后开发与定向测试；不重开无关产品/UI，不引入旧版兼容、静默重试或在线二次校验。
- 当前源码的提示词已经要求仅列对应段实际形式，不能把问题归为完全漏写这条要求。hint_phrase及两类数组的schema属性没有各自语义描述/例子；可评估补强分段语义和自然搭配示例，但未经真实质量测试不能承诺降低失败率。
- 提示资源偏词典式解释，不是产品所需的英文提示短语，是另一项质量观察；建议按既有短语需求改善生成约束，不改entry_meaning，不用“含冒号/means就拒绝”等未经确认的语义正则充当校验。

### 暂存清理

08:56:23Z已删除私有tmpfs内failure.json，目录只剩ticket.json；原文未存入仓库或普通日志，无法从仓库恢复。保留摘要、有限字段缺陷与回放输出；本次单份名额已消费，不要求继续复现、不续期或重启后端。原114期限仍至09:42:05.964Z。两项诊断方法错误（临时执行目录noexec、最初日志筛选按文本而非JSON）已纠正，未改变产品或污染实际失败结论。

## 历史已确认事实（完整候选缺失的旧run）

用户提供的 run 01a08514-75a4-733f-8350-a24cca79dafd 使用 z-ai/glm-5.3-flash，输入 young / grape / weekend / danger / enforce，zh / story / short。服务端12.45秒后记录 mapping_surface_absent、target_index=1（grape），额度退还，无草稿。

用户贴出的正文包含全部目标，enforce 使用 enforced；这不是缺词或超时的证据。完整候选的提示、释义、候选数组未保留，不能把推测的 grapes 声明写成事实，也不能判断整个批次合格。

浏览器仅接收 passage.delta；完整校验后才返回 generation.validated。失败只返回 generation.failed，因此浏览器缺少提示短语不是用户漏贴，也不代表上游没有生成。

## 用户确认与范围

### 历史批准：测试身份与模型绑定（113，114样本已消费并删除）

2026-09-09用户“允许”明确批准：修改临时诊断，仅绑定当前测试身份和GLM模型；不再以词组、场景、释义语言或篇幅过滤；最多下一份校验失败，启用起不超过一小时，读取后/到期删除，不记录密钥、登录令牌或其他用户内容。先用模拟提供方验证不同配置、其他身份、成功请求及限量清理，再短暂替换6001后端。前端、数据库、模型分配、业务校验不变；代理真实模型调用0。此批准取代前次“不用了”时未采用的扩展建议，原112证据仍属历史。

CAP-008/009、API-005及DATA-010/011的无效结果不入正式资源规则不变。返工目标是采集过滤，不是直接放宽词法规则；现有两个失败类型的归因仍待实际候选。普通交接沿USER-HANDOFF-CONTINUOUS-001，无需重复审批；实际执行已由本次用户单独批准。

### 历史授权（110–112，具体过滤由113取代）

2026-09-09：在解释需要在后端失败位置暂存候选后，用户回复“继续”。采用紧邻建议：仅本地UAT、受控失败暂存、排除凭据/账号信息、排查后删除。不包含更改校验、提示词、业务规则、API、数据库、自动重试或代理收费调用。

沿 [CR-039 §7](../technical/backend-cr039.md#7-错误和可观测性)已有临时捕获授权例外实施，不改普通日志禁令。仅下一份匹配同模型与上述完整输入配置的校验失败；一小时捕获/保留上限，最多一份；普通构建不带捕获实现；私有tmpfs目录0700、文件0600，过期或结束删除。期限/容量为本次诊断的保守执行上限，不是新产品保留规则。

## 定向验收与交接

CAP-008/009、API-005；DATA-010/011不得新增无效草稿或正式资源。

- 默认构建禁用；显式调试构建、loopback origin、私有配置和有效期限共同启用。
- 不匹配身份/模型、成功、取消、供应商失败不采集；并发最多一份；过期不采集并删除暂存。
- 完整候选包含 passage/tags/targets及两类forms，以及允许的生成配置，可供离线重放；无请求头、generation_token、账号或凭据。
- 磁盘失败不改变原校验结论、退款和失败事件；不向日志/前端增加内容。
- 用合成候选及隔离HTTP/数据库验证，不调用真实模型，不重跑无关全站覆盖。

110交 backend-ethan 做此有限诊断实现，普通交接沿 USER-HANDOFF-CONTINUOUS-001；111检查完成时实际部署仍待明确授权。112用户回复“行吧，你试试看”后，按已说明的短暂后端替换范围单独授权执行，不复用已耗尽108部署或模型预算。

## 历史结果（110–112，原始失败证据保持）

110开发交付和111接收完成，定向QA复核PASS。112已将6001后端替换为已审查诊断镜像并通过tmpfs/权限/配置保留及3路由检查；2026-09-09T08:13:10Z启用、09:10:51Z截止，最多一份匹配失败，参见[当前报告](./report.md)和[实际证据](./evidence/failure-capture/deployment-112.json)。真实模型调用0，待用户复现；QA合成metadata不等于丢失的真实候选，也不代表问题已修复。

### 用户再次复现：诊断范围未命中

2026-09-09T08:22:58Z只读核查：[证据](./evidence/failure-capture/scope-miss-20260909.json)。run 01a08540-c3d7-772a-8586-e2b78cec9555使用同一GLM模型、zh/story/short，但输入变为weekend/test/switch/learn/grape/number。约8.68秒后mapping_surface_absent，target_index=0对应weekend；quota_charged=false，草稿0。

后端诊断镜像健康且未重启，票据未过期；私有目录只有ticket.json。failure_capture_uat.go的Record使用slices.Equal精确比较输入列表，因此本次在保存前被过滤，而不是读到样本后解析失败。首次docker cp读取返回非零；随后只读挂载列目录、运行配置及账本/日志核对确认文件不存在。没有候选可以离线重放或删除；没有发起新模型调用。

CONFIRMED：本次诊断没有覆盖用户改换词组的复现，捕获条件过窄是当前排查阻碍；原映射故障仍未确定具体surface及正文/提示位置，不能归责模型或匹配器。112部署检查PASS不代表本次真实样本已捕获。

此前建议取消固定词组限制；用户随后明确“不用了，我用上一次的词组，又复现了”，因此本轮不采纳扩展建议，不改过滤条件、票据或期限，不再把该建议记为待批准。

### 原五词再次复现：成功故事与失败讨论

2026-09-09T08:27:04Z只读核查：[原件](./evidence/failure-capture/scenario-miss-20260909.json)。两次输入均为原五词、同模型、zh/short：

- run 01a08544-b5ea-7826-b266-0d592fc38aff，story，08:24:46Z完成，valid，有一份草稿；成功结果不属于失败采集范围，未读取其学习内容。
- run 01a08545-17ee-76ba-a812-9e7086dabb82，discussion，08:24:58Z失败，mapping_relation_unknown、target_index=0（young），约5.62秒；额度退还、草稿0。

本轮词组已匹配，但failure_capture_uat.go还精确比较Scenario，票据仅story，discussion在记录前被过滤。私有目录仍仅ticket.json，后端健康且未重启；没有完整候选、没有可删除的失败样本，也没有代理模型调用。

可以确定失败发生在已解码候选的词法关系校验，而非超时或流传输中断。validator.go先判断候选形式是否属于young的已知关系集，不属于且词法分析为空时返回mapping_relation_unknown；因此不能把本次说成mapping_surface_absent，也不能直接断言英语派生错误。仍缺实际声明形式及其正文/提示归属，模型错报、词法覆盖不足或实现问题的进一步归因尚未完成。

诊断设置对场景也过度绑定是第二个真实覆盖缺口。当时遵循用户不扩展的选择，仅报告事实，未改票据或部署；随后113用户明确“允许”新范围，已由114完成部署。上述原件与当时结论保留，不再作为当前采集条件。
