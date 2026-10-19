---
milestone: M003
stage: technical-design
role: frontend-architect/base
agent_name: frontend-bob
status: awaiting_user_review
version: M003-FE-04
date: 2026-10-13
input_version: M003-PRODUCT-10 / M003-BE-08 / M003-UI-13-R4 / retained DB04
---

# M003 前端技术方案

<a id="fe4-cr311-312"></a>
## FE4-01 当前范围与接收决定

frontend-bob 依 [100入口](../reviews/cr312-frontend-entry-100.md)完成 CR-311/312 有界前端技术接收。**FE04 待用户审阅，尚未实施或经独立QA；本交付不切实施阶段。** CONFIRMED 来源为 [USER-M003-UI13R4-FE-NEXT-20261013](../reviews/requirements-feedback.md#user-m003-ui13r4-fe-next-20261013)：完整 UI13-R4 已接受、BE08 已接受，DB04无新增持久化影响。设计交接/manifest的“待评审”是提交时状态，当前接受以100为准。不存在需要重复确认的新业务解释。

本次唯一执行入口为 FE4-02–09。FE3-01–16/V01–21 为下方有效基线索引和保留合同；CR302/306/307/309/310 已完成事实以 [096接受](../reviews/verification-acceptance-096.md)及原独立复验为准，不重新变成待办。FE4取代FE3旧v5首片删尾、同稿只尾插和“不设首稿文字计时”的受影响部分；UI11词义、UI12完成可编辑/再次Generate才弃稿确认、M002布局与R1文案保持。

**专业实施选择，随FE04待审**：沿 Nuxt4/Vue3、SSR页壳/身份/选项＋客户端POST SSE、现store/Zod/parser。静态生成不适合私人动态任务，全CSR或新状态/动画框架均无此需求收益。只抽一个共享纯正文归约和一个共享展示组件，解决普通/后台真实重复路径；业务终态、权限和API仍各自负责。不引入MQ、CRDT、重放平台、持久临时稿或自动续流。实际serving model、tokens/usage未知；Profile锁定consumer-ai-web@1.0.0、model-routing-v1，请求gpt-6-astra/high，不更新锁。

## FE4-02 真实源码接点与数据边界

路径相对 `frontend/`。源码接收发现：两套schema仍声明v5；generation.reducer及admin-presets store各自实现旧尾插/首片替换；两个页面以条件分支移除草稿再建Result；sync-design全量复制harness键且manifest还写UI10-R1.1。以下改动均由这些实际接点和UIA427–438驱动，不把原型DOM脚本搬入Vue。

| 文件/层 | 有界实施责任 |
|---|---|
| `app/infrastructure/http/schemas/generation.ts`、`schemas/admin-presets.ts` | started/status一起升 `m003-stream-v6`；按API302严格增加activity和draft action union；共享activity/draft/edit schema，preview保留自己started/terminal/status。所有edit.insert包括retained均≤2048 codepoint，删除可整段；拒绝unknown/null/缺字段/非法整数/无意义空edit，不把合法长段总长限为2048或16KiB |
| `app/infrastructure/http/repositories/api-repository.ts`、`admin-presets-repository.ts` | 现 `mapStreamMessage`/preview switch增分支，先schema后将snake_case映为应用camelCase union；namespace、当前HTTP响应、streamId/runId和TokenVault绑定照旧。可将三种公共正文事件映射抽到就近 `mappers/generation-stream-mapper.ts`，两repository调用；不新建传输平台 |
| `app/application/shared/models.ts`、`application/admin/presets.ts` | 两事件union复用同一个纯应用 `ContentDraftEventModel`/activity model；generation状态和PreviewStreamState拥有FE4-03的正文状态。PreviewStreamState从runtime内联类型移到现admin/presets应用文件；token、rAF、DOM不得进入可序列化应用状态 |
| `app/application/generation/draft-reducer.ts`（新增小纯模块）、现 `reducer.ts` | 共享draft/edit的范围、版本、段索引、working/published归约；generation reducer负责seq、Plan、用户终态并调用它。API wire不在该层解析 |
| `app/runtime/stores/generation.ts`、`admin-presets.ts` | 两套回调接公共归约；同时修status恢复、pending/EOF/异常/cancel/dispose清理，不能只改SSE成功支路。仍各自拥有session/request epoch、取消、有限核对、用户保存或preview关联；不将管理员包装成普通生成 |
| `app/presentation/generation/content-presenter.ts`（新增） | 纯selector把应用正文/Plan/terminal投影为只读view model，输出稳定段key、真实活动copy key、typed初稿/段提交/flush/reset显示意图；无DTO、网络或Zod。保持现用户canSubmit及后台ready的权限来源 |
| `app/presentation/generation/use-content-presentation.ts`（新增） | 客户端显示生命周期：typing、段交接、Plan退场、锚点和清理；只接view model/宿主身份，调用浏览器API限mount后。DOM和显示进度只在本组件内 |
| `app/presentation/components/GenerationContent.vue`（新增）、`GenerationWorkspace.vue`、`pages/admin/presets.vue` | 共用状态槽/Plan/passage稳定子树及presenter；用户配置/WordPicker/动作/确认留Workspace；后台草稿、lastPreview/stale、发布留原page/store。GenerationVocabularyList复用原props/样式/entry key，不改Explore/Library词义结构 |
| `scripts/sync-design.mjs`、`i18n/locales/zh-CN.json`/`en-US.json`、`app/assets/css/theme.css`、`design/source-manifest.json` | 沿现转换修R4来源并同步批准产品copy/token/局部样式；显式排除仅 `zh./en.m003.harness.*` 键及设计控制样式/数据，保留m003产品状态键。不要启动第二套同步系统或把app.js、timingProbe、query/fixtures带入运行产物 |

不改变 `application/shared/ports.ts` 两种流方法的请求和业务返回语义；如果类型签名引用新增union，仅机械更新关联类型。完整Result仍走 `mappers/index.ts`/`span-mapper.ts`，codepoint occurrence/hint校验后映射渲染segments，绝不由working/published/Plan猜最终资源。页面和组件不导DTO/schema、不fetch，不读取wire字段；SSR只注入已映射模型，rAF和临时客户端正文不进SSR payload或storage。

## FE4-03 working / published / displayed 的唯一归属

| 数据 | owner / 更新边界 | 禁止用途 |
|---|---|---|
| working与workingCodePointLength | 纯正文归约；立即顺序应用每个合法edit。保留活动draft id/mode/V、全流revision、begin时旧段快照/索引、下个允许提交index和未提交范围 | 不直接提供给组件；不作为可保存/lastValid |
| published及稳定段记录 | 同一应用正文状态；initial合法append立即发布；其他mode仅paragraph_complete/body_complete发布；段记录保留原分隔符、码点边界和index，未变段复用对象 | 不把半段或body_complete当完整Result |
| displayed及typing cache | 组件presentation session；只插值initial append的已收到published，快照称received。缓存grapheme边界/段定位、显示cursor、deadline/余数、一个rAF handle及motion epoch | 不回写reducer/rev，不影响busy/canSave/ready，不当HTTP输入 |
| Result / canSave 或 preview qualification | 原用户/管理业务状态；仅权威validated/status完整result；各自保留原保存/claim或GET关联后ready | 不从显示长度、动画完成或body_complete推断资格 |

旧 `streamedText`/preview `text` 若为兼容现读点临时保留，只能由published投影，不能维护第二份可独立修改的正文。selector只暴露published，working仅归约内部使用。无需存事件列表/每版全文；begin旧段与当前published用不可变段引用，未变段共享；本轮最多一个未提交段/尾部事务。保存字符原样，不trim或统一换行。

**归约实现合同**（wire唯一真源：[API302](api/generation.md#cr312-wire)，不复制出第二份DTO）：

- seq在外围对所有事件统一严格递增，紧邻同seq同规范event/data为NOOP；其他重复/跳号/未知事件/错namespace/当前流身份不符→停止消费、丢未提交分片、有限status核对。旧request/session/响应回调直接隔离。draft/activity都参与seq但不增加rev，正文edit严格baseRev/currentRev及rev+1。
- begin显式建立draft，不能再由第一次edit猜新稿。initial仅空正文V1；replace要求前稿complete且新的provider V增加；append新ID同V并保护已完成前缀；restore新ID允许降V且只允许retained。记录退役draft ID防复用；所有V仍由受理ContentService限定，普通N0=1/增强≤N+2/preview增强≤3。discard后的restore/终态边界及complete后可discard按API，不自行增加“candidate valid”事件。
- splice严格按 **Unicode codepoint** 的at/deleteCount，不按JS UTF16或显示grapheme；验证区间/insert上限后更新working。initial只有合法尾插，立即published；replace中允许同draft在中部多片替换，旧实现的“同draft只能全文尾插”须移除。所有source/mode组合按API，纯删除可合法，无意义空操作拒绝。
- 段落扫描按API空行定义：LF/CR/CRLF逻辑换行、之间仅空格/tab、最大连续分隔符归左段、前导空白归首段；最后一段以body_complete闭合。不得用 `split('\n\n')` 或trim重写文本。新增纯helper就近放draft-reducer或小paragraphs.ts，两消费者共用；完整空白正文count0可complete，不前端提前判内容不合格。
- replace begin保留旧全稿；一次只修改下一个段的working范围。paragraph_complete前验证连续index、当前段变更范围及未更新后缀完整，才发布该段；相同段仍推进index但不触发cue。append从旧段数开始，允许API指定的双换行归属调整但旧前缀codepoints绝不可改；完整新增段才发布。半段分片、长段多片不驱动视图。
- body_complete严格核对baseRev、bodyLength、paragraphCount与working精确一致，原子发布最后段/全部正文并删旧尾；initial/restore不接受paragraph_complete，restore仅在body_complete替换全稿且不假装provider打字。complete后拒绝edit/段提交。正文完整不清Plan、不授予保存/发布。
- discard把working恢复最近published，rev不回滚；不撤销已经发布的完整段。Q02只有服务端显式restore→body_complete→finalizing→validated路径能恢复有效全稿；前端不维护内部lastValid、拼mixed Result或自行回滚到某V。
- activity仅writing/improving，当前流composing期间接收；improving来源仅真实事件，心跳/计时不会触发。writing/finalizing/终态/EOF/pending/取消意图清improving。Plan仍保留到权威完整Result，场景与词义/用法稳定，只有planning显示Plan三点。

内存/性能选择：保留codepoint长度及段索引，append增量更新，替换只处理当前段/受影响尾部；合法大段允许一次局部codepoint切分，不每帧全篇Array.from/splice。最终完整body或Result需要时一次join/核对。网络parser维持现32MiB有界buffer与完整Result上界，不误改成2048帧长；本轮不声称实测吞吐/容量。

## FE4-04 首稿 typing 的最小实现

UI13-R4设计行为已CONFIRMED。生产采用独立显示session：只有归约器明确报告 `mode=initial && deleteCount=0 && at=旧workingCodePointLength` 的合法append进入typing。只从已收到、通过契约的published取文本；禁止用fixture after_ms、本地假字符或额外provider请求。

1. 首个grapheme同步出现；只用 `Intl.Segmenter(undefined,{granularity:'grapheme'})`。缺失或reduced-motion直接显示完整received，不用Array.from冒充grapheme。每次received变更时分段并缓存UTF16边界/真实段索引；rAF只推进cursor及当前受影响段的文本片段，已完成段不重分段、不join全篇、不重建所有节点。先采用每个新chunk一次保守分段（允许全文以确保Unicode正确），无需自写Unicode增量算法；若后续有实际瓶颈再按确认分隔边界收窄，不能每动画帧重新segment全篇。
2. 跨chunk combining mark/ZWJ可能改变已显示尾grapheme，即使grapheme数量不增也比较新前缀并原子重组。显示的是当前received的合法grapheme前缀；不能把网络分片、UTF16单元当显示单元。缓存新索引时同步修尾；每个浏览器帧合并成至多一次显示提交，首字与必要重组可同步入同一Vue patch。
3. 单一rAF loop按真实单调elapsed累积非负fractional carry；`rate=max(36, backlog / remainingSeconds)`。不足一个grapheme时本帧可0，不用 `max(1,take)`、每字timer/DOM或按刷新次数计速；caught-up立刻停loop与caret，下一个新增backlog才重新建650ms deadline。仍有backlog时新chunk沿用原deadline，不能不断延后；超过deadline立即追平，允许一个实际渲染帧paint容差。取消/已完成后的帧不得创建第二个loop。
4. 650ms是前台呈现追赶预算，不承诺模型首字/总耗时，不人为延长wire间隔。tab隐藏暂停rAF并保留absolute deadline，不开后台timer；visibility恢复首帧过期就追平。reduced-motion动态开启时立即flush并销毁loop，关闭仅影响之后合法append。
5. body_complete、replace/append/restore begin、finalizing、validated/status完整valid：同一响应处理内先将显示目标同步至权威received/Result并取消typing，不等下一帧。终态立即更新业务状态和按钮；同一批wire事件即使Vue合并render也不能漏掉flush/reset控制信号（以同步watch监听明确递增的应用显示变更序号或等价同步订阅，不依赖默认异步watch看每帧事件）。新run/epoch、取消意图、失败、协议异常、离页/卸载直接失效并丢弃旧backlog。
6. pending/EOF停loop与活动，保留最近published/Plan的静态可读投影，禁保存；可以直接显示这些已合法published字符，但不续演旧动画、不露working半段。恢复仅原status完整包直出，不重播typing。每回调核session epoch、request/preview binding、motion epoch、host identity及isConnected；失效回调只退出/清自己资源，不能改业务状态或恢复内容。

两路由互斥，只挂一个活动 `GenerationContent`，后台lastPreview静态区不开第二个typing session；每页最多一个rAF loop。这一具体复用足够，不建立全局动画服务。caret纯装饰只在真实backlog存在，`.live-draft-text`可aria-busy，不能live region，不逐字播报。

## FE4-05 完整段交接、终态与节点连续

`GenerationContent`固定status/Plan/passage位置，外层不以phase、draftId、rev、全文作key。Plan项key为kind+entry（scene独立常量）；正文key为本request的paragraph index；streaming→valid复用同一passage及未变段节点。最终highlights以Result的已校验passageSegments按段切片投影，保留段容器和原UTF16/码点转换边界，不在草稿显示旧高亮，不因进入Result把整段正文挂载第二次。

paragraph_complete立即更改权威及accessible新文本；只有真实变化段做220ms交接：旧文以aria-hidden非交互视觉层保留前45%，随后新文显示，高度局部缓动。相同段不动，body_complete才移除旧尾（必要的旧尾180ms视觉ghost不在accessible text）；restore直出不冒充新写。任何新权威更新都立即替代当前视觉目标，旧动画取消/清理，不排队、不设最短演出时间。纯CSS/局部WAAPI均可，沿现token；清理timer只负责移除ghost/class/style，不延迟文本或资格。

完整validated/status result当下原子建立Result，普通配置/Search/Random/移除和原保存/claim动作按原权限立即解禁。Plan从应用状态已清除；组件仅保留最多240ms的aria-hidden、inert退场快照，不参与selector/业务/朗读，最后删除；无长期场景折叠区。标题、tags、UI11释义和notice当下入位，正文持续保留。status pill同一节点更新copy，160ms从opacity .55→1，快速状态重启当前动画不排队。

Workspace当前Cancel在streaming分支、Generate在选词操作区，是实现与新稳定节点合同的真实差距。实施将原生成操作节点在streaming时承接Cancel意图、终态原位变Generate；对齐R4原型的 #generation-actions 选词操作槽，保留批准位置/顺序及AppDialog取消确认、UI12 regenerateBinding/requestSnapshot/actionOwner，不新增另一个可聚焦Generate副本。若布局需显示额外提示只用非交互文本。streaming下该按钮触发现有取消确认，disabled按取消/互斥提交锁判断，不能套Generate的generationBusy禁用而使取消不可用；pending仍保留独立重新核对反馈。终态按钮若本来持焦必须保持同一node/activeElement；不主动把焦点抢到正文或新按钮。

每次段/Plan高度变化记录第一个可见retained paragraph的top；Vue patch/布局稳定后只补偿该节点top delta，无scrollIntoView/滚顶/滚底/smooth scroll。动画期间局部高度变化继续沿同一锚点补偿，复用本页唯一rAF调度必要测量，结束即停；锚点被权威删除退回passage容器。不叠加浏览器自动scroll anchoring造成双重补偿（仅受控阅读区禁用对应自动锚定）。更改焦点或selection不属于动画callback权限。

reduced motion直接内容、无caret/dots/exit ghost/height动画，保留静态淡绿cue与同一节点；220/240/180/160及easing逐值沿设计theme。新epoch/取消/失败/离页清typing、段ghost/animation/timer、Plan快照与inline style。pending保留草稿静态阅读；failed/cancelled按原语义清临时稿。既有pending/Q02/结果不可用、save/claim/离页保护与动作互斥仍执行FE3-04/16，body_complete从不解除generationBusy。

## FE4-06 PAGE-212 与 CR-311 候选

后台共享纯正文归约、content selector、GenerationContent与同一typing规则；`PreviewStreamState`持有自己的draft state而非调用普通用户store。basic/enhanced、preview命名/令牌、draftVersion/mode/run绑定、GET关联→ready、Q02手动确认→publish、usage以及旧published保持FE3-06。valid展示结束不等于ready；body_complete不开放发布；无用户保存/claim或扣次字段。

`draft.lastPreview`继续是独立旧预览快照，可能在新live Plan期间保留旧释义及stale提示；不能把它的词义当新Plan，不能将旧Result注入新working。组件通过明确 `liveContent` 与静态旧预览slots/外层区分，沿UI11原信息层级；新live→该run validated时保留同一passage，页面后续GET关联接管结果不能重挂正文。编辑/切preset/mode/卸载使旧session无效，迟到事件不能解锁当前ready。

CR311只接 [API004后端候选资格](api/generation.md#cr311-candidates)：Search和Random共用精确41项筛选由BE实施，前端 `createVocabularySearch → store candidates → WordPicker` 直接显示服务器集合。现schema/mapper形状与entry/hash不变；不复制目录、不限制短词、不stemming、不子串封禁。q=the可以返回theater/another；空/no_candidates、loading/error/retry保持原copy和反馈。已有selected the、锁定预设和历史Result仍合法，Generate/预设保存/历史学习不得追溯拒绝。管理选词仍不套普通maxEntries；PAGE212没有Random就不新增该入口。全41资格集合证明归BE/QA，前端不靠若干随机抽样宣称目录正确。

## FE4-07 来源转译与版本配套

来源： [R4规格](../design/design-spec.md)、[交互](../design/interactions.md)、[响应式](../design/responsive-accessibility.md)、[copy](../design/copy.json)、[theme](../design/theme.css)、[原型JS](../design/prototype/app.js)，冻结版本在 [R4 manifest](../design/evidence/cr312-r4/M003-UI-13-R4-source-manifest.json)。当前原型中文create与390px英文preview入口见规格；本轮不重跑设计浏览器。

`useDesignCopy`/m002命名空间、zh/en前缀去除、点转双下划线、@/|/{}转义和现模板规则保持；R1状态文案含m003.activity.improving必须精确复用，不自行恢复成旧概括文字。sync脚本只定向排除harness键及`.m003-harness-controls`等设计控制样式，不排除整个m003前缀；来源manifest改为R4并保存实际copy/theme/prototype哈希和转换说明。M002 icons/许可证/公开sample仍原来源，UI13 R3 fixture只作为设计/测试输入，书店六词不硬编码到用户生成。UIA437的sample来源完整性复用设计证据，产品测试可加载其wire作为合成数据，禁止挂演示控件/timingProbe全局。

保留1440阅读列≤760px、390横向无溢出/16px padding、UI11两列→单列、44px目标及既有页壳/selector适配；英文正文lang=en，状态role=status/polite，旧ghost不可重复朗读。新样式局限生成/preview，不重设计模型管理、R1步骤或M002布局。

公开wire v6与持久pipeline v5分开，遵 [BE8配套切换](backend.md#be8-cr311-312)：未来实施BE/FE两端started/status/preview/mocks一起切v6，不建v5兼容层；旧v5 fixtures冻结，当前应用mock从BE08复制/读真实wire。保留32MiB解析上界及后端现有候选上限，不迁移DB、不改模型/额度/预算/付费审稿。构建后续以原方式部署，真实UAT3015刷新需独立授权，当前无运行操作。

## FE4-08 有限实施验收与证据分工

总追踪范围：CAP302/307、PAGE204/216/212、AC323–328、UIA427–438及API004/302/304/006。以下是**新实现后必需、当前未执行**；复用现Vitest/Playwright/合同替身，合并同路径，不新建测试平台。用 [BE08 fixture index](fixtures/cr311-312/index.json) 真实wire作为输入，expected/internal evidence只作断言，不当事件；旧v5 fixture/旧QA PASS不能证明v6。模拟时钟测调度算法，真实浏览器时间/节点状态测可见过程，两者不互相代证。

| 稳定ID / 追踪 | 最小合并场景与完成条件 | 接点及证据 |
|---|---|---|
| FE4-V01 / UIA427、434 / CAP307、AC323–324 / API004 | the→theater/another、Random合规/no_candidates、旧selected the仍可生成、锁定预设不变；后台picker相同集合，未新增入口/警告 | generation-selection/WordPicker既有单测＋浏览器选词一组；BE提供全41集合和LIMIT前筛选证据。前端只证明消费/不追溯 |
| FE4-V02 / UIA428–432 / AC325、327–328 / API302、304 | 双namespace schema/mapper activity及draft四分支exact；短稿/半段/长段多片/同段不变/增段/短稿尾删/同V append/CRLF及Unicode；半段不可见，body_complete不清Plan不开保存 | generation-stream、m003-generation-contract、generation-reducer、admin-preview-lifecycle消费BE08 boundaries/shorter/longer-unchanged/large-paragraph/continuation/unicode-crlf/preview；新增draft-reducer测试或就近扩展 |
| FE4-V03 / UIA431、436 / AC328 / API302、304 | 无begin/complete后edit、错source/index/baseRev、seq跳号/邻重复/同seq异内容、旧ID/epoch；pending/EOF保published不露working；Q02 mid/after-body恢复、取消/失败；status完整valid与result=null不同 | reducer和两个store现lifecycle测试；cancelled/failed/pending/q02两fixture合并；有限核对/terminal竞态沿FE3-V05/06，真实退款/调用预算由BE而非浏览器代证 |
| FE4-V04 / UIA428、438 / AC326–327 | 首字即时且两个实际时刻增长；36 grapheme/s在60/120Hz短块一致；持续chunk不重置650ms，±一渲染帧；combining/ZWJ跨chunk、无Segmenter/reduced-motion直接显示；wire codepoint splice不按grapheme | 新content-presentation纯调度测试注入clock/rAF；现e2e合成流新增cr312局部spec，实际时间采样和DOM文本；不用生产timingProbe。证明每帧不全文分段/一loop/0字符帧可发生 |
| FE4-V05 / UIA429–430、433、435–436、438 / AC325–327 | 三改一不变、220ms前中后/旧尾body才退、Plan至full valid再240ms收拢；passage/未变段/状态/button身份；valid当下配置和动作解禁；焦点/scroll/selection稳定 | 1440中文create与390英文PAGE212各一共享流程；正文与controls、accessible ghost、computed timing、top delta实测，before/during/after必要帧。body/valid同批到达也直接终态 |
| FE4-V06 / UIA432、434、436、438 / AC327–328 / API304、006 | typing中body/revision/finalizing/valid立即flush；cancel/failure/protocol/new epoch/卸载后迟到rAF无复活；tab隐藏恢复过期追平；下一请求（设计重播对应产品新epoch）不串旧稿；preview同组件并保持旧lastPreview/stale/ready边界 | 纯scheduler/stores定向测试＋浏览器取消一条/后台恢复一条；admin-preview-lifecycle与m002-admin-presets相关用例，无新自动重播产品能力 |
| FE4-V07 / UIA434–435 / UI11/12、FE3-V20/V21 | full valid后编辑不改旧Result；下次Generate才真实AppDialog、取消保留两份内容、默认焦点；discard成功凭据→冻结请求一次，失败零新POST，save/claim/leave互斥；preset只读/pending禁生成 | 现m003-cr310-regenerate、generation-lifecycle及cr309代表UI11检查按受影响子集运行，不能只引用096代替被改组件回归 |
| FE4-V08 / UIA430、433、437–438 / AC326 | 精确双语状态/词义结构、无审稿详情/轮数/上限/百分比/ETA；reduced motion无ghost/caret；运行包不含harness数据/控制键；M002 sample完整性出处可追踪 | sync产物检查＋代表DOM/几何/视觉；UIA437源hash/六词四段完整性复用R3/R4设计证据，样例不成为产品输入固定值 |

浏览器预算：一条丰富create全流程、一条390英文后台共享流程，取消/背景恢复和UI12使用现用例定向补；初始保存截图软上限6、送图3（typing/段过渡/终态与窄屏代表），时间与节点用结构化输出，失败/不确定才按受影响ID增加。不重拍每错误或重跑全站；不能关闭全部动画来声明motion通过。QA独立验证功能/契约，不评级文章质量或模型漏判；AI-QUALITY-90不是本轮QA阻塞。

实施在Node24运行相应Vitest、typecheck、lint:boundaries、受影响lint/format及生产build，浏览器只跑本表受影响spec；报现有frontend-validation，列版本与实际通过/失败/未执行。不运行真实provider，不刷新/停止UAT，不读private-env/uat-accounts秘密。后端SQL/真实活动发送/预算和结算由backend-ethan提供确定性替身证据；无新真实模型评测。

## FE4-09 实施顺序、未决与收口

| 任务 | 下一责任 / 顺序和完成条件 |
|---|---|
| FE4-T01 v6类型与映射 | frontend-claire获实施激活后；BE08 API/fixtures为输入，普通/preview一起改schema→DTO mapper→应用union，完成V02契约部分；不等待真实模型，BE实现与FE合同Mock可协调并行 |
| FE4-T02 公共正文与生命周期 | T01后，实现共享draft归约并接两个store、status/pending/cancel；完成V02/V03，先证明半段不露和终态边界再做动画 |
| FE4-T03 共享展示与打字 | T02后，实现selector→GenerationContent/presentation session；先create代表区域核内容/节点/220/240及typing，再接后台；完成V04–06，不复制原型harness |
| FE4-T04 设计同步和既有边界 | T03联动sync/copy/CSS/manifest、WordPicker服务器候选检查、UI11/UI12定向回归；完成V01/V07/V08；业务按钮不由motion完成控制 |
| FE4-T05 配套验证与提交 | 接backend-ethan v6配套构建/替身证据，完成上表＋必要构建/边界检查，记录frontend-validation/handoff后交qa-quinn。QA后另经门禁安排3015真实配置保留的刷新；本交付未授权此操作 |

当前无业务/上游合同BLOCKED、无新增需用户选择的范围；FE04技术实施细化待用户审阅。OPEN：CR311/312及FE4-T01–05/V01–08均未实施验证，旧两次真实后端成功不能证明客户端无停滞，本轮不承诺模型等待变短。保留CR039-L1、CR042-L1、AI-QUALITY-90、W01、QA26-MINIMAX与096历史接受；不再列已解决CR302/306/307/309/310为open。

静态接收与恢复证据见 [source-manifest](evidence/cr311-312-fe/source-manifest.json)、[check](evidence/cr311-312-fe/check.json)、[修订前快照](evidence/cr311-312-fe/before.tar.gz)。仅核上游冻结hash、当前链接/稳定ID/源码接点和允许写入，不是Vue、浏览器或独立QA PASS。R4 lifecycle 6/6与scheduler 5/5沿用其设计边界，不重跑。新会话交接测试未执行，实际输入/tokens/usage未知；读取因两套消费链和旧有效合同超软预算，仅定向核对，未全读history。当前交接仅一份，不堆多轮“当前”；以下基线按稳定ID保留，旧完整原件可由before包恢复。

## 保留基线与稳定编号

以下是未改变的约束或已完成条目的定向索引，不是本轮新任务。当前原始完整FE03/CR309/310正文与交接均保存在 [before.tar.gz](evidence/cr311-312-fe/before.tar.gz)，归档路径仍是原 `.planning/milestones/M002-legacy-M003/technical/frontend.md` / `handoffs/frontend-architecture.md`；旧冻结检查/审批原位不改。受影响正文以FE4为准，原有效权限/保存/模型管理规则继续约束实现。

## FE3-01 输入、决定与技术边界

原业务：同目标模型Plan→writer；增强N>0固定编辑→原生校验→Review/条件返修，N0保留规划关闭增强。内容N0–99/初始1；基础恢复全请求2独立于N、后台只读；preview basic0/enhanced1。流程验证最多N2、99仅配置/静态，前端不编排模型或混淆一次业务次数与模型调用。渲染/技术栈沿FE4-01；USER-COMPAT-001配套切换、主动删除claim例外保持。产品来源与QA边界见当前product/requirements-feedback及096，不以历史AI质量待验重开功能QA。

## FE3-02 数据层、类型与状态归属

`DTO→strict schema→mapper→应用状态→selector→view`不变量保持。每请求SSR transport/vault、Nuxt app WeakMap及private-state注销保持；token仅内存、namespace分键，不进入SSR payload/URL/storage/analytics/log。当前正文状态与文件接点已更新到FE4-02/03。Result全部targets顺序/entryMeaning/hint/occurrences仍由原mapper及codepoint半开区间校验；不得从Plan填最终词义。outcome/notice、service N和preview mode仍以API严格联合校验；usage null及发送未知不填0。

## FE3-03 流读取、版本与reducer

旧v5无begin/首片删尾/同稿仅尾插已被BE08和UI13-R4明确替代，当前唯一规则见FE4-03/04及API302#cr312-wire；旧原文仅恢复历史。POST fetch/eventsource-parser、fatal UTF8跨chunk、现有有界32MiB parser、seq身份隔离/不重排不autoPOST及Plan至完整Result保留继续。最终Result仍一次完整映射，界面不暴露V/rev/轮次。

## FE3-04 终态核对、取消、保存与忙碌

沿API-302/304：用户status用X-Generation-Token，preview用X-Preview-Token；status不带临时phase/draft或seq、不续流。立即一次、串行间隔至少2秒、总窗口最多10秒（到期中止未完请求）；其后 `m003.recheck` 每次显式操作读一次，active/503仍pending，不重启无限自动窗口。404/410停止并关保存；token默认终态1小时/待保存draft30分钟沿后端。刷新丢token不新增恢复能力，合法既有资源读取可恢复notice。

核对绑定sessionEpoch＋requestEpoch＋namespace＋runId＋reconciliationEpoch。晚active/503/取消ACK不能覆盖valid；相同DB终态幂等，保存/claim已完成不能被旧status重开。实质终态冲突关闭新保存动作并再核对，不按到达顺序换包。取消返回valid只是种类确认，继续status取得最终Result/notice；不能拿本地草稿当final。

取消前started未到先记意图，拿token后发cancel；不把abort当已取消。重复点击合并一个取消动作；未知503保留pending，完成先赢显示真实完整包，取消先赢清稿且不退款。离开、popstate/pagehide、卸载沿现有离开确认/被动abort，所有controller、绘制/核对任务失效；被动断线不是主动cancel成功或Q02。服务端CAS与费用是权威，取消不表示提供方免费停机。

保存/访客claim只接受当前run的权威完整Result与资格；validated依API授予有效草稿资格，status时尊重can_save，已保存/丢弃/TTL/归属变化后不恢复。原API-006保存/放弃/claim的幂等、归属与删除规则保持。Q02通过SSE、status、当前保存结果、管理preview/published读取持续显示notice；普通完成四outcome统一完成表达，不暴露审稿轮次或宣称独立质量达标。无lastValid失败与取消由服务端处理，前端不由超时/EOF自行推断退款或incomplete。

### 受理前 busy 与受理未知分开

三个POST统一按API-302识别 **HTTP503 + code=generation_busy + context.accepted=false**，严格context仅accepted/retry_after_seconds，秒数1..600且与十进制Retry-After一致。完整验证后映射安全应用失败及retryAt，停止本次等待，保留输入/已保存草稿/既有有效结果或preview ready（仍核原binding）。没有run/token，不query status，不改变本地额度或制造退款，不显示队列位置。

使用既有AppError/再试区域与已批准通用暂不可用文案；本版不自写“未扣次”新文案，也不原样渲染Problem.detail。明确busy才具备未开始/未扣次事实。Retry-After期间禁新提交，结束只解禁；**永不autoPOST**，不会排队。普通泛503/502、解析失败、网络EOF、temporarily_unavailable的COMMIT未知不套busy。若未收到started/token，无法调能力status；保留受理未知说明并重读options可用性，options不是结算证明，新意图仍受服务器同主体active限制。

BE06-R1的20及10/20/50/100均未测，不出现在用户容量承诺或新配置页。浏览器只可记录点击到首Plan/正文/换稿/完整渲染时间，和Go T0/flush指标分开；50ms服务端合并、180s/600s保护截止不是首内容体验目标。

## FE3-05 PAGE-208 配置表单与冲突

保留原四计划、页头全档位优先级入口、模型/长度/词数/滚动24h额度/不限字段、单panel双栏与M002自定义控件。服务区按UI09-R3接入真实NativePolicy只读2、派生开关与N，不硬编码fixture值。visitor/basic始终false/0且控件禁用；Pro/Plus各自0–99，关闭置0、开启恢复最近合法正N（无历史1）；N0徽标基础，合法1–99增强，非法值不作为已保存服务事实。

raw string与合法数值分开；空、负数、小数、100、非整数不截断/四舍五入、不将空转0。非法保留输入/错误/aria-invalid，禁impact/PUT。类型属性只提示，API独立拒绝非法配对/权限。完整body包括原字段和content_review_enabled/content_repair_limit，绝不传native策略字段；quota null不限与0禁止严格区分。

local/baseline/remote分开；保存前impact snapshot包含规范化完整body和revision。任何字段编辑（含原字段、N、开关、切tab）使旧预览与确认失效；迟到impact检查editRevision/plan，不重新解锁。PUT必须等于被确认body。impact按响应显示before/after、warnings、生效边界与真实基础/体验人数；UI09-R3 `m003.impact` 的basic/trial分别映射，可能重叠不求和，不称净失去增强人数。

409 revision_conflict保留local→GET四计划remote→并排比较→用户保留本地编辑后以最新revision重新impact→再次确认。不能把current_revision自动塞进旧PUT；duplicate_priority保留专用含义。PUT丢响应先GET，当前值相同只说明当前配置已保存，不冒充原回执/重复推进revision。取消不PUT，失败不抹输入。

批量priority沿原四行body，无内容字段；显示响应content_service_by_plan/may_change_content_service及新请求/在途/不重置用量/不改试用时间。false不等于有效计划没变。保存后刷新后续options/公开预设与权益摘要，已受理snapshot保持。PAGE-215/217任何权益摘要均从真实ContentService投影，不按计划名推断。

## FE3-06 PAGE-212 预设模式、预览与发布

保留master-detail、title、无限制管理选词（不套用户max_entries）、四配置及保存草稿/预览/取消/发布/下架。options提供preview modes/basic默认/enhanced固定N1；无计划模拟或N选择器。用户 `/trial/:presetId`继续共用GenerationWorkspace，实际增强来自本人权益，公开样文不是权益授予。

1. 本地编辑title/词/配置/mode立即失效ready及Q02确认，递增编辑/请求代次；先保存草稿再按响应draft_version/mode预览。只改title在服务端允许继承preview时，保存后重读绑定可重新判定，不直接沿用本地旧ready。切回旧mode不自动复用历史preview。
2. preview独立namespace/token/epoch，事件用preview.*，Result归约共用FE3-03；无用户refund/charge。valid完整包后清Plan，进入qualifying；GET当前AdminPreset核对当前draft_version＋mode＋preview_run_id及完整payload且valid才ready。valid但未关联/旧run、payload TTL失效、dirty local、切preset均不可发布。
3. 晚mode/旧草稿/旧GET不会覆盖dirty表单或解锁新稿。busy受理前拒绝保留原ready且只在原binding仍匹配时可用；新preview开始与旧正式预览资格分开，不能将旧正文当新run成功。
4. service_incomplete完整有效预览可手动发布，notice在stream/status/GET/ready/确认/发布响应与管理published读取保持。按 `m003.q02.confirm` 明确勾选；变更资格后清确认，绝不自动发布。
5. publish body只含expected_revision/draft_version；UI确认不新增confirmed wire字段。冲突/preview_required/403按实际响应，旧published保持至成功；丢响应先GET，不盲重试。basic final1、enhanced最大3不是质量结论。

## FE3-07 设计转译、组件与页面定位

当前生成/preview区域接点、copy/token/资源及a11y按FE4-02/05/07。未受影响PAGE208管理/模型模态与M002页壳保持；UI07/08及旧UI10非模态不恢复。UI11两列到单列、760px阅读列和WordPicker/AppSelect/AppDialog继续复用。Explore/Library/账户页不在本CR重设计范围。

## FE3-08 Mock、验证与验收追踪

FE3-V01–19仍是有效历史验收ID及下表回归约束；原完整步骤/版本/证据在before快照、[原前端验证](../implementation/frontend-validation.md)、[QA报告](../verification/report.md)与096。新v6按FE4-V01–08补测，仅复用未受本改动影响的结论，不拿旧v5输入直接宣称v6通过。

| 稳定ID | 保持的验收边界 / 本轮去向 |
|---|---|
| FE3-V01 | 普通/N0/用户预设/后台basic规划、首稿与完整valid；FE4-V02 |
| FE3-V02 | 固定编辑/条件返修/上限定稿及隐藏轮数；新段语义FE4-V02/05 |
| FE3-V03 | Q02降V完整恢复、同V续写、rev不重置；FE4-V02/03 |
| FE3-V04 | Unicode/UTF8/seq/rev/range/identity与合法大终态；FE4-V02/03/04 |
| FE3-V05 | EOF/pending、status result=null、有限核对、旧身份、无autoPOST；FE4-V03/06 |
| FE3-V06 | Q02 notice、cancel/failed/pending、取消早于started/valid先赢、晚status不重开保存；FE4-V03/07 |
| FE3-V07 | 计划N/NativePolicy只读/非法raw/权限；无改动，复用096 |
| FE3-V08 | impact、409三方/重预览、priority与丢响应先GET；无改动，复用096 |
| FE3-V09 | preview basic/enhanced、版本mode/run/dirty/TTL、Q02手动发布；FE4-V06 |
| FE3-V10 | usage未知/后台无用户扣额/active冲突；不变，终态改动处FE4-V03/06 |
| FE3-V11 | 完整页面/居中/响应式/节点焦点与滚动/减少动态；受影响区域FE4-V05/08 |
| FE3-V12 | 合成时序与真实模型时延/质量/费用/容量严格区分；本轮不新增真实评测 |
| FE3-V13 | busy严格未受理、Retry-After只解禁，generic503不伪称未扣次；store变动按FE4-V03/07必要回归 |
| FE3-V14 | custom JSON严格解析、compact字节与深度/数字/Unicode边界；无改动，复用CR306/096 |
| FE3-V15 | 多模型raw、modelId合并、409/丢响应、原子保存；无改动，复用CR306/096 |
| FE3-V16 | probe快照与stale/晚响应、保存0调用、无需probe；无改动，复用CR306/096 |
| FE3-V17 | JSON Pointer/整单413/迟到错误不串行、raw保留；无改动，复用CR306/096 |
| FE3-V18 | 原生AppDialog/top-layer/滚动/dirty/精确焦点；无改动，复用CR306/096 |
| FE3-V19 | API306确定未受理与故障分支、无参数泄漏/假进度；stream变动处FE4-V03 |

## FE3-09 实施任务、依赖与后端接点

FE3-T01（契约传输）、FE3-T02（流终态）、FE3-T03（计划/模型）、FE3-T04（预设闭环）、FE3-T05（页面资源）、FE3-T06（联调交接）均是已完成基线任务索引，完成依据096及对应实施/QA报告。此次新增待实施任务仅FE4-T01–05，不把旧任务重新排队。

## FE3-10 当前自检、维护与未决

旧FE03静态检查冻结于[evidence/cr306-fe/check.json](evidence/cr306-fe/check.json)，不覆盖、不重跑冒充新证据。当前检查/未决见FE4-09；CR302/306已解决。CR039-L1、CR042-L1、AI-QUALITY-90、W01、QA26-MINIMAX仍保留原状态和责任。

## FE3-11 CR306 模型配置的类型与严格解析

以下路径相对 `frontend/`，API-306 是字段/限额/保护名单唯一真源。选用现有 textarea 加纯应用解析模块；无需 Monaco/CodeMirror、JSON5、平台SDK或新状态框架。此处严格解析是防止管理员原文重复键被覆盖所必需，不扩成全站解析平台。

| 接点 | 增量与完成条件 |
|---|---|
| `app/application/shared/models.ts`、`ports.ts` | 在既有AdminModelModel/ModelConfigurationInput及NewModelConfiguration的Pick加入必填`customParameters: JsonObject`；ProviderConfigurationInput/ModelBatchConfigurationInput逐项继承，EditableModel也加入。JSON递归类型只含null/bool/finite number/string/array/object，无any；纯类型就近放拟增`application/admin/custom-parameters.ts`，供models引用；公共ModelOption/GenerationRequest/RunSnapshot不加此字段。AdminPort既有list/save/provider/probe签名复用，无新端点 |
| `app/infrastructure/http/schemas/admin.ts` | `adminModelSchema.custom_parameters`必填对象；子值为合法JSON递归值，数字/深度/字符串/体积同API。封套仍strictObject，只有custom对象内部允许未知非保护扩展键，不能对整份DTO改为passthrough；不能 `.default({})` 或null补空。列表、聚合、单项、保存、enable/disable及removal的共享AdminModelDTO都随之更新 |
| `app/infrastructure/http/mappers/index.ts::mapAdminModelDto`、`admin-provider-mapper.ts` | 验证后深复制为应用customParameters；聚合每个模型各自映射。DTO字段止于mapper，页面不读custom_parameters，不污染公开mapper。SSR仅admin私有结果且保持每请求隔离；raw草稿只在编辑会话内 |
| `app/infrastructure/http/repositories/api-repository.ts` | 实际模型写仓储在此，不是admin-configuration-repository。`modelBody`同时覆盖单项create/update/probe；`saveModelProvider`逐models行、`createModels` batch逐行都加入custom_parameters对象，不传raw字符串。batch共用connection临时input所需{}仅为本地构造，不是漏HTTP字段的默认兼容。setModelEnabled仍仅expected_revision；disable不因本地重验对象而被挡，服务端负责enable库对象校验 |
| `app/application/admin/model-draft.ts`、`provider-draft.ts` | `modelDraft/modelEntryDraft`初始化独立raw（建议`customParametersText`），现有modelConfiguration/modelBatchConfiguration/providerConfiguration只从已严格解析的当前raw得到对象；不得解析失败回退旧对象/{}。mergeProviderEntries按稳定modelId与本地key合并，见FE3-12 |
| `app/infrastructure/http/schemas/common.ts`、`mappers/problem-mapper.ts`、`application/shared/models.ts` | Problem.field_errors.field须允许API约定空字符串（当前nonEmptyStringSchema过窄）；错误code仍非空。按code/status严格校验409 current_revision:string、probe 422 upstream_status=400或422，以及确定未受理503 accepted:false；只映射具名应用事实，无任意context/detail透传。既有busy要求Retry-After/context一致不放宽 |
| `app/runtime/stores/admin.ts`、拟增 `app/presentation/admin/custom-parameter-presenter.ts` | 原AdminPort与会话epoch保持；局部presenter将安全field code→批准copy key/字段定位，不把Problem/DTO传模板。可用小函数就近放置，不建设通用表单引擎 |

### raw → 有效对象 → 请求快照

输入时保留raw并更新辅助计数/dirty/test stale，不在每次按键重格式化、不网络校验。`cr306.custom.size`的count仅在可严格解析时显示规范紧凑UTF8字节，否则为“—”；limit为16 KiB，不把无效raw字节称为紧凑大小。局部解析提示不得改raw或替代提交前整体验证。保存前校验全部模型，probe前只校验连接+目标模型；解析结果为带判别的成功对象或本地issue（code、JSON Pointer、可确证的源区间）。失败无HTTP，不构造半份provider配置。读取已保存值时可统一缩进2空格初始化；关闭后重开承诺值等价，不承诺原排版。表单raw、已保存对象、提交时深复制对象分别持有，禁止相互写穿。

解析模块采用有限递归下降/token扫描：读取完整RFC8259语法、字符串转义与合法代理配对；每个object保存**解码后的键**集合，构建对象前检测所有层级重复键，`enabled`与`\u0065nabled`必须冲突。只接受末尾JSON空白，根必须object；空文本、array、null失败。不要用正则扫描键，更不能先JSON.parse整文后检查。对象构造用安全字典/自有属性，不发生原型setter赋值；保护名单仍按API逐层执行。

数字先保留词法token，再检查有限双精度及数学整数安全界±(2^53−1)，指数/小数写法的整数也不能绕过；不可先Number舍入再判断原值。非整数按API转有限binary64；若归一结果变成整数仍须在安全界内，因此`9007199254740991.5`不能被舍入并提交为越界整数。NaN/Infinity/无效JSON数词拒绝。根深度1，object/array容器各+1，扫描超过8即时报告too_deep；解码后每层键和值禁止U+0000，字面`\\u0000`不误判。合法配对emoji/其他Unicode保留，不trim字符串内容。

通过重复键/数字词法及其余语义校验后，按 [API306唯一计量算法](api/administration.md#api306-compact-bytes) 使用`TextEncoder().encode(JSON.stringify(value)).byteLength`统计≤16384字节。采用ECMAScript最短binary64往返表示，`-0→0`、`1e-6→0.000001`、`1e-7→1e-7`；`<>&/`、U+2028/U+2029为原Unicode UTF8，不另HTML转义或做NFC/NFD；字面反斜线字符串不得被全局替换。键顺序不影响长度，无需排序或新增JCS框架。raw长度不能当规范大小；空白/缩进很长不能仅凭raw长度判too_large；保存限额用紧凑UTF8，不用字符串.length。HTTP整包大小仍由仓储/服务端原32KiB/256KiB/2MiB处理，不能将每模型16KiB乘1000当允许总量。禁止自动截断、四舍五入、删字段或缩小对象后重试。

客户端按API归一键名（小写、去_/-）检查顶层保留及全树敏感/原型键；未知允许扩展保持原大小写和值，不把reasoning.max_tokens误判为顶层总输出冲突。API名单只在该模块一处实现并用合同fixture覆盖。具体受控body相交与平台能力/实际效果属于后端/上游最终校验，前端不复制各阶段body或推测支持矩阵。现有maxOutputTokens/outputMode控件仍唯一权威；不从JSON推导、同步或覆盖它们。

### 错误定位与保留

本地源区间只来自本次解析，可聚焦/选中确证位置；server只承诺JSON Pointer，不虚构行列。`/models/i/custom_parameters/...`按**发出请求时的有序entry key/modelId快照**定位，`/custom_parameters/...`绑定单项/probe目标；按RFC6901解码~1/~0，验证整数索引及前缀，不eval路径。输入已改、模型已移除、session/编辑代次已换的迟到结果不贴到其他模型；保留安全整单提示或忽略已失效probe。

定位到模型后展开其`.generic-model-advanced`，仅滚动父框`.dialog-body`并聚焦对应textarea；aria-invalid/aria-describedby连接错误且原因在帮助前。本地错误与server字段错误分开，修改本项清本项旧错误不清其他行。空field/父级/不可解析路径以及413是整单错误，不假定第一个模型错误，不显示提交值/未经转义路径/上游detail。U+0000键错误仅定位安全父路径，不回显非法键。

field code `invalid_json/duplicate_key/object_required/protected_field/controlled_field_conflict/too_deep/too_large/number_out_of_range/unsupported_character/required`对应批准copy；controlled_field_conflict复用protected说明，空raw用invalid_json，required缺字段属契约错误不能补{}。401/403交原认证/权限流；409保留本地并重读；413保留全表单；probe model_request_rejected绑定当前测试模型，不猜某个JSON字段；原auth/protocol/rate/unavailable分类保持。未识别错误用现有安全通用提示，不显示原Problem.detail。

## FE3-12 CR306 原生模态与草稿生命周期

映射 `PAGE-208/CAP-306/DATA-306/AC-317/318/322 → /admin/models → pages/admin/models.vue → model/provider-draft → AdminPort → API-306`。完整provider列表、原连接/凭据、模型基本字段、删除影响确认与计划引用保持。

| R1区域/行为 | 现有精确接点与本次处理 |
|---|---|
| UIA-M003-412.r1/413.r1 | `AppDialog.vue`保留id/open/title/closeLabel/notice/bodyKey、close/shown、header/default/footer slots、Teleport、showModal、feedback.modal和opener恢复；`#admin-model`用现title/default `.dialog-body`/`#footer`，不得绑定原生open属性替代showModal，也不新增全站modal实现 |
| 初始/关闭 | `openProvider(provider?)`复制**被点中的**provider和全部models；新建空连接+一个原默认模型，新增raw=`{}`，不沿demo enabled=true改现默认false。主框header关闭/footer取消/Escape/backdrop都进`closeModel()`；busy原门禁保留，框内点击不关闭 |
| UIA-M003-414.r1/415.r1 | 每个`.generic-model-item`仍`:key=entry.key`；高级区顺序maxOutputTokens→outputMode→JSON→description。新增`.custom-json-field/.custom-parameters/.custom-json-guide/.custom-json-error`；label/help/error按稳定entry.key唯一关联，不随删除索引错绑 |
| 增删模型 | `addEntry()`加独立{}并沿原模型ID焦点；`removeEntry()`只移除可移除的未保存条目，保持原至少一新行/1000行规则、邻行焦点。已保存模型删除仍走原removal-impact确认，不复制demo任意splice删除已保存模型 |
| UIA-M003-416.r1 | dirty快照包含每项raw，格式空白编辑也dirty；不以语义对象相等忽略用户文本。`model-discard`继续第二AppDialog，“继续编辑”不重建父草稿；放弃清文本/凭据/测试代次，最终返回精确provider触发点。依现组件先结束确认层再结束父层或验证同tick顺序，不能让确认层opener重抢到已关闭父框 |
| UIA-M003-417.r1 | `testConnection()`/`testEpoch`/sessionEpoch现能力扩展；每次测试冻结目标key+解析对象+全部连接/专用字段；编辑任一配置、增删、refresh、关闭、换账号让旧结果stale/迟到回调失效。显示明确stale文案，不能仅watch后静默消失。保存不要求probe成功、不自动probe |
| UIA-M003-418.r1 | 保留现`assets/css/theme.css`的`#admin-model[open]`flex、标题、dialog-body auto scroll、footer与backdrop；R1 720px上限/390实测354px为对照，沿现viewport安全边距，不写死370px。长JSON在控件内处理换行/滚动，页与框不横溢，textarea最小高桌面168/手机156，label/help/error/44px/reduced-motion按源 |

精确原型源为 `design/prototype/app.js::beginModelSession/jsonField/modelEntryView/paintModelDialog/requestModelClose`，样式/copy见FE3-07。旧R1的`raw||'{}'`已由R1.1纠正；当前fixture查找、JSON.parse、state=probe-ok、refresh仅清conflict与保存直接close仍是**合成演示适配**，不移植到Vue；空值、重复键、异步、实际保存读回按API及本方案。R1额外`.m003-model-dialog`样式只能定向转换到既有#admin-model，不全局改所有AppDialog。若共享组件确需修复焦点，仅以本模态真实失败证据驱动，并检查其现有使用处，不能顺带重构。

### 合并、保存及响应竞争

`baseline/local/remote`按当前modelId合并、DOM用原key。同一项raw未改才取remote规范化文本；本地改过（含非法/空白）原文保留，双方同时改同项仍显示冲突提示供管理员核对，不递归合并JSON对象制造第三种参数。远端新增模型并入，local新行保持各自raw；远端删除本地正在编辑的模型不能静默丢文本或重建同ID：保留未提交草稿/冲突提示，禁提交已删除ID，让管理员显式移除或按原新增路径处理。现mergeProviderEntries会直接漏掉无remote的旧行，T03必须补此受影响失败保留边界，无需扩建通用合并系统。

`refreshDraft()`必须GET真实当前provider，再按modelId三方合并并更新baseline/revision，令probe失效；保留本地key/raw/error，不能只把409 current_revision塞旧请求或自动再PATCH。保存点击时冻结全量合法body/ordered keys/编辑代次，busy锁表单且只发一次聚合POST/PATCH；任一模型错误全部保留，不认为其他行已保存。成功以响应映射/重读值更新列表并显示cr306.saved.*，然后关闭/清草稿，保存本身0模型调用；失败不清raw。响应丢失沿unknownCreate和GET核对，不盲重试创建/版本；只有真实当前读回支持“已保存当前配置”，不冒充原请求回执。

probe从列表取已保存model含customParameters，从编辑器取目标raw解析对象；固定256额度是服务端测试合同，不回写模型maxOutputTokens，不自动提高输出/去参数重试。合法但平台拒绝的JSON仍可保存；30秒短测试失败/成功均不替代完整预览和AC-321。多模型切换、旧请求晚结束、save成功后晚probe必须不能复活当前成功提示。

## FE3-13 CR306 流接收与增量验收

custom parameters仅后台模型对象，不进入公开选项/GenerationRequest/RunSnapshot/URL/storage。API306明确未受理只认HTTP503 generation_unavailable和严格context.accepted=false；无Retry-After/cooldown/run/token/退款推断或autoPOST；泛503/未知COMMIT仍pending核对。原参数快照只影响新run，不追溯废弃合法preview；草稿编辑仍令ready失效。流v5已由FE4的v6替代，CR306的五类故障语义按FE3-04和FE4-V03保留。

## FE3-14 当前接续与未完成事项

CR306模型参数/模态已由096接受，compact字节源和[共享向量](fixtures/cr306/compact-byte-vectors.json)继续约束：13值/5边界配方/3拒绝数向量、不另JCS/HTML转义，原快照/失败证据不覆盖。无新增模型管理任务。当前下一角色与任务仅FE4-09；真实质量/容量等未知不冒充已验证。

<a id="fe3-cr309"></a>
## FE3-15 / CR-309：UI11 局部展示接收（2026-10-13）

已接受完成基线。GenerationVocabularyList保留Plan与Result两类独立应用投影：Plan entry/sense/form·phrase，Result entry/entryMeaning/hintPhrase，语言、完整文本和UI11布局保持。后台lastPreview词义可与新live Plan共存，不因新流隐藏或混合两来源；旧stale/ready保持。当前正文/selector改动按FE4接入，不把旧“本轮不改store”范围说明套到CR312。

### FE3-V20 / 定向验证与完成条件

原UIA419–422与PAGE204/216/212结构/字段/760px阅读列、Plan至valid及后台旧预览来源保持；现CR309证据支持未变词义结构，改动共享区域按FE4-V05/06/08回归。原16/17hash差异仅CR309控制owner_stage已解释，旧冻结证据保持。

<a id="fe3-cr310"></a>
## FE3-16 / CR-310：UI12 再次生成接收（2026-10-13）

已接受完成基线。generationBusy仅streaming/pending；valid后可编辑下次输入，旧标题/正文/tags/词义只读Result snapshot。保护离页覆盖in-flight/pending/未收录valid；完成编辑不丢稿，仅同一Generate触发regenerate AppDialog，默认取消/精确还焦，各关闭方式零请求。save/claim/regenerate/leave动作互斥，确认开始冻结完整GenerationRequest；await discard只认旧run成功凭据与清空后状态身份、session/组件/动作ownership全匹配后generate一次，不以void/stale resolve当成功。失败保留两份内容、零新POST；成功discard后的新生成失败不宣称旧结果尚存。pending在UI/store两层禁新生成；preset只读/publishedVersion快照保持。AppDialog全局不改，保留当前regenerateBinding/actionOwner实现。

### FE3-V21 / UIA423–426 定向交付

原Q1–Q10及generation-lifecycle/regenerate e2e为既有验收入口；本轮受影响按钮/挂载边界必须按FE4-V07复验成功/失败/重复确认/账号变化或卸载晚回调、save/claim与leave互斥，不能用旧PASS代替。原copy四键、局部dialog CSS及冻结证据保留。
