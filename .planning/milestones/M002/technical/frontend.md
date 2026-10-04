## CR029-F05 / UI31 当前前端方案

PAGE208 .generic-provider-list 读取 AdminProviderModel(connection,models) 聚合数组；单组 .generic-provider-card 展示一份连接元数据及全部模型。DTO严格schema→mapper→repository→store；加载服务商时同步扁平models供原引用功能，但不修改其他页面分页接口。

新增/编辑均providerDraft+ModelEntryDraft[]，已有entry携带稳定modelId、新项null；服务商ID单独保留，不用第一模型作身份。创建去掉连接复用下拉，编辑全组加载；已有模型不删除草稿行，新模型可增删。保存POST/PATCH整组单请求；流式test用共用连接草稿+当前entry。APIKey只留组件并在关闭/切换清除。409先加载最新聚合，按ID三方合并已有字段、本地新增保留、远端新增加入、下架剔除，保证下一次提交包含当前全部模型。新增未知结果禁止重试。

接收UI31 prototype/admin.js、copy/theme精确转换。测试中英×1440/390：两服务商分组、创建+整组编辑新增+刷新，超过20模型完整展示，测试只当前模型，CAS/重复输入保存，密钥留空和路由生命周期。视觉检查卡片层级、固定头尾、间距与无横溢；原流式解析证据复用。预计4张代表图，确定异常才扩增。

# UI30 / CR029-F03/F04 当前前端方案

modelDraft保留连接字段，新增独立ModelEntryDraft[]（本地稳定key）；新增先provider区后models卡片区，每卡片独立高级设置与测试消息。Key只在页面草稿，未进Store/SSR/storage；测试和请求结果继续session epoch/草稿版本隔离。删除定位邻项焦点；新增末项聚焦ID。编辑仍单模型PATCH，新增批量调用POST models/batch，Store一次更新模型集合和revision；DTO严格schema→map→应用模型。每项显示名可空，映射采用ID前200字符。

整体提交HTML字段校验加精确ID重复检测；单项测试只校验连接字段及被点击模型，不要求未完成的其他模型。一次一项显式流式测试，其他项不显示加载或成功；修改草稿使旧测试结果失效。添加/删除后输入key稳定。409刷新只更新revision且保留新增整批；编辑继续mergeEdited。unknownCreate保留旧防重机制。

样式和文案从UI30 source直接sync；provider/model区域采用字段/帮助容器，details内容单独grid解决挤团。中英1440/390检查先后顺序、增删保留、每项高级间距、底部固定、逐项测试、保存原子失败/成功；后端API真实集成和前端mock/browser分开陈述。

# CR029 · UI29 模型配置当前实施方案

PAGE208按 design/prototype/admin.js 的 models/modelForm、theme.css 的UI29、copy.json的gm.*转换。替代旧全局key面板和表格。列表行显示名称、provider/modelID、URL/协议/脱敏key状态、说明、测试/编辑/移除；弹窗字段顺序与原型一致，滚动主体、固定标题/底部。使用现有AppSelect/AppDialog/Icon资源。

数据链：technical/api/model-connections.md DTO严格schema → admin mapper → AdminModelModel/ModelConnectionModel → store → 页面。store维护连接列表/模型草稿/测试状态/版本冲突；API Key仅存在本次弹窗内存，关闭/路由离开清空，不进SSR持久化、storage、toast、日志。新增key密码输入；编辑空白保持，换URL/协议须重填。连接复用后可切到新连接，不能把更换密钥静默写回所有引用者。

新建默认停用，测试按钮只在主动点击时请求，保存不调用AI。模型编辑可修改启用位；测试状态随配置变化失效。取消未保存确认保留草稿或丢弃；异常保留输入并定位字段。冲突保留输入、提示刷新；不自动重放创建。三协议选择只改变帮助/参数适用提示，不清除用户数据。可选结构化输出仅OpenAI协议生效，Anthropic使用提示JSON；其余普通用户界面与选择规则不变，无默认模型。

测试范围：mapper/schema、store连接与保存0隐式测试、密钥清理、键盘选择/错误/草稿、1440/390中英列表/表单/底部可见。集成隔离后端按三协议HTTP测试，复用未受影响QA32证据；新增范围不宣称旧UAT覆盖。

---

---
milestone: M002
stage: technical-design
role: frontend-architect/base
agent_name: frontend-bob
version: M002-FE-04
status: ready_for_implementation
date: 2026-10-01
---


## CR028 / UI27 搜词修订接收

本轮用户直接要求修正搜索预览与加载UI，按076接收UI27增量；FE04业务/DTO/分层保持，不新增后端API或库表。固定两词定位tests/e2e/mock-backend.mjs，修复为读取backend/assets/vocabulary/english-words.json真实固定词表、按q匹配和API004排序/limit返回。该文件仅测试运行，不把词表或fixture打进前端生产包。正式后端不变。

WordPicker只增加可取消250ms视觉等待定时器，监听query+status；现有180ms网络防抖不动，ready/empty/failed立即反馈。加载时aria-busy，提示区域恢复data-picker-search-state样式钩子并复用UI27主题spinner。普通台和后台自动共用，无应用状态/DTO变更。清空/换词/卸载/禁用取消旧视觉等待，不允许旧候选误选。

接收范围覆盖FE3-V06/09、UIA-WORD-LOADING27及PAGE204/212。验收用非固定查询实际HTTP（含空结果/短语/排序/上限），两处快/慢/失败重试/改词/清空/减少动效的浏览器状态；核对原型与生产行高/字号、窄屏不溢出。沿现有前端/QA持续授权实施；新视觉仍由本轮用户查看，不把设计版本增长视为用户已验收。

## CR026 / FE05 本地一次提醒

Notice/AdminNotice映射remind_once→remindOnce；新响应必带boolean，旧测试夹具/先后部署可省略并默认false。后台draft/冲突合并/保存与预览都保留字段，copy直接同步UI28。客户端Nuxt实例拥有本地记录适配器，key按encodeURIComponent(accountId):encodeURIComponent(noticeId)，不含revision/正文/凭据，不随退出清除。仅明确登录事件筛选once消息；刷新不触发。AppDialog实际showModal及bodyKey变更完成DOM后发shown(id)，NoticeHost只对当前自动提醒中的once条目记入。队列在本次登录固定，语言刷新保留仍在队列的项，已显示不从当前队列消失；下次登录重筛。持久存储不可用时同页面内存回退，SSR无window访问。账户切换沿session.epoch隔离在途结果；手动阅读及后台预览不记。新增本地历史/队列生命周期测试，现有欢迎和Markdown检查按影响复用。

# M002 前端技术方案

<a id="inputs"></a>
## 1. 当前范围、输入与接收结论

本版 **M002-FE-04** 接收 [065](../reviews/design-acceptance-065.md) 已批准 **UI26** 的累计 UI23–26 改稿。当前角色 frontend-bob，阶段 technical-design；本轮为方案接收，不修改应用代码或自批迁移。前端 FE02 已由 [016](../reviews/technical-design.md) 批准，既有交付/UAT 状态以 [060](../reviews/verification-acceptance-060.md) 及 workflow 为准，旧文档的待审/CR004 OPEN 不构成重新打开历史工作。

产品输入为已接收 PRODUCT04、D2-89 和用户选词改进要求；当前 PRODUCT05 中 **CR026 / D2-88-LOCAL-SCOPE 未确认部分明确排除**，不能因产品文件在原路径更新就接入一次提醒缓存。49 CAP、25 PAGE/28 视图和 M001 完整继承保留。DB03及BE03未变范围保留；BE04 / 067已补齐管理员搜索契约，不重建数据或部署方案。

- 当前设计真源：[规格](../design/design-spec.md)、[差异](../design/frontend-delta.md)、[文案](../design/copy.json)、[主题](../design/theme.css)、[交互](../design/interactions.md)、[响应式](../design/responsive-accessibility.md)、[追踪](frontend-traceability.json)。UI26 归档 SHA `9927eca3d90c760dc455c83aa673c5545c6e2e33710c944ce392de2f65fae0d8`，送审时 pending 标记已由 065 批准覆盖，不改其冻结字节。
- API 真源：[索引](api/index.md)、[生成/预设](api/generation-presets.md)、[管理](api/administration.md)、[消息](api/growth-benefits.md)。DTO→schema/mapper→应用状态→渲染单向边界保持。
- 当前工程 package.json 为 Nuxt 4.5.2、Vue 3.5.42、Zod 4.5.4、eventsource-parser 4.1.0、pnpm 10.33.0、Node 24；这是仓库事实，不是最新版本推荐，本次无需升级或新依赖。
- UI26 接收和改前3份前端方案原件见 [reception](evidence/frontend-ui26/reception.json)、[before-sources](evidence/frontend-ui26/before-sources.tar.gz)。应用 HEAD 未变；本轮保护 575 份正式源文件及产品/设计/API/控制面，未改后端、数据库、业务数据或工作流。

**接收结论：READY_FOR_IMPLEMENTATION**。frontend-bob 按 [067](../reviews/continuous-067.md) 复收 [BE04 API004](api/generation-presets.md#api-004-search)，**FE3-G01 契约缺口已解除**：现有搜索允许 V/L/A，DTO保持完整entry与词表版本，不新增接口/字段，后台不使用普通计划词数上限。后端 BE4-I01 的 limit 收窄校验仍待实现、BE4-V01–03/FE3-V09 运行验证待执行，CR027仍OPEN，不将文档接收当作修复通过。

本轮实现/验证入口为 [§12](#delivery)、[§13](#ui26)。原 FE2-G01–03/CR004 由016关闭设计接收，原实施/QA问题状态以各正式审批为准；FE2-V01–20 保留为继承规则及回归定位，不把既有交付全部重测。CR039-L1、CR042-L1、AI-QUALITY-90、W01、QA26-MINIMAX 保持原状态。

§2–11 保留继承的技术约束和验证定义；当中测试编号是验收要求，既有完成状态以正式实现/QA及060为准。本轮变化以§12–13为准。

<a id="choices"></a>
## 2. 技术取舍与渲染

| 决策 | 采用方案及原因 | 不采用的备选及代价 |
|---|---|---|
| FE2-D01 渲染 | 保持 Nuxt 混合：首页、认证、精选首屏、书架及详情、个人/后台只读首屏使用请求级 SSR；造文流、复习题面/答案、恢复弹窗、写入和动画在客户端运行。私有 SSR 只序列化已映射的显示模型。 | 全站 CSR 需改造既有直接访问/认证首屏；全量 SSG 无法承接身份/动态发布/私有权限；将复习草稿放 SSR 会增加泄露面。 |
| FE2-D02 状态 | 延续 useState + usePrivateState、纯 application reducer、请求级 ports；按领域拆文件。客户端机密/短暂对照用独立 shallowRef 服务，不进 Nuxt payload。 | 不增加 Pinia、通用事件总线、GraphQL 或另一套查询框架；目前已有状态/隔离机制足以承担实际需求。 |
| FE2-D03 数据 | Zod 严格 DTO 验证→显式 mapper→应用模型→store/action→presenter/view；SSE 同样验证。 | 页面直接 fetch、把 DTO spread 进状态会使 API 变化污染全部页面，并绕过隐私和未知值处理。 |
| FE2-D04 草稿 | 原生 IndexedDB，小范围适配器及事务 CAS；账号/会话/尝试隔离；只存未提交输入和导航，服务端先验证再恢复。 | 不建云端草稿/离线提交队列，不采用 prototype sessionStorage，也不引入 IndexedDB 框架。 |
| FE2-D05 组件/样式 | UI26 的 Vue 单选组件和搜索选词组件、局部业务组件、现有 CSS；复用本地 Lucide SVG 与原许可。 | 不换通用 UI 套件、不加载 Iconify CDN，不把页面还原变成新的设计系统项目。 |
| FE2-D06 图表 | 针对现有少量曲线用 SVG + 同数据可读表格和既有 Token，断点/缺值按 API。 | 无需大图表依赖、客户端指标计算引擎或分析 SDK。 |
| FE2-D07 发布 | 既有同源 Nginx→Go API / Nuxt node-server；新旧 API 不混跑，前后端与 DB 成套部署。 | 不加一期客户端兼容层，不偷偷添加第三方采集或实时 AI 验收。 |

SSR：application-ports.server.ts 仍为每请求创建 transport、TokenVault、repository；只能向配置的内部后端传该请求 Cookie/Accept-Language/request-id，Set-Cookie 回当前响应。无模块级私有缓存。SSR loader 调 application port，端口返回已验证、归一化模型；多个独立读 Promise.allSettled 聚合并保留部分错误，401 统一认证边界。示例书架聚合 summary 与列表互不伪零；个人壳 account 与右侧 growth 可分别失败。严禁 SSR 请求 POST、预览、生成、领卡或创建 review attempt。

Nuxt 页面私有/no-store 沿现状；静态 /_nuxt 哈希资源 immutable；本期公开页亦沿无共享 HTML 缓存，避免身份 Header 被公共缓存。首屏与 hydration 复用映射后的快照，不重复触发登录提醒或 PV；客户端取得 CSRF 后才发写请求，CSRF/token 不入 payload。SSR 日期、语言使用请求确定值，客户端动画/折叠初值在 mount 后基于媒体查询安装，避免服务端猜视口。

<a id="routes"></a>
## 3. 页面、路由与一期继承

下表是生产路由；设计 `?page=` 只是原型视图。全部视图、CAP/DATA/UIA/API、组件/模型、测试入口的精确展开在 [frontend-traceability.json](frontend-traceability.json)。URL 只存页面身份与允许的筛选，不含输入答案、token、密码、昵称或指标自由属性。

| PAGE / 原型 | 生产入口 | 壳/主要组件与模型 | API |
|---|---|---|---|
| 205 home | `/` | AppHeader、HomeStoryStack、HomePath；固定公开样文 | 001 / 209 |
| 002 register；003 login | `/register`；`/login` | AuthForm、ClaimContext；AuthIntent、Session、Welcome | 002 / 006 |
| 204 create | `/create` | CreationWorkspace、EditableConfiguration、WordPicker；GenerationWorkspace | 004 / 005 / 006 |
| 217 explore | `/explore` | PresetGallery、MeaningLanguageTabs；PublishedPresetCollection | 202 / 209 |
| 216 trial | `/trial/:presetId` | PresetWorkspace、ReadOnlyConfiguration；PublishedPreset、GenerationWorkspace | 202 / 005 / 006 |
| 005 library | `/library` | LibraryStats、LibraryRow、LibrarySearch；LibraryPage | 007 / 008 |
| 006 batch | `/library/:batchId` | SavedPassage、TitleEditor、ReadOnlyConfiguration；BatchDetail | 007 / 008 |
| 007 range | `/review` | ReviewRangeSetup；RangeSetup、ActiveRange | 008 |
| 008 sessiondone；201 review；202 overview；203 summary | `/review/:sessionId` 内部阶段，不拆可回看结果 URL | ReviewSessionShell、LetterSlots、PassageCloze、AnswerOverview、AttemptSummary、SessionTotals；ReviewSession、Draft、EphemeralComparison | 008 |
| 206 profile | `/account`（保留原入口） | AccountShell、ProfileForm、AccountSecurity；Account | 003 / 201 |
| 214 growth | `/account/growth` | AccountShell、GrowthSummary、CheckinCalendar、AchievementGroup、LevelAwardList；Growth | 203（说明见 §8.1） |
| 215 bag / shop | `/account/items`；`/account/exchange` | AccountShell、OwnedItemCard / ShopItemCard、EffectPreview；OwnedItem / Catalog | 204 |
| 207 notices | `/notices`，正文使用 AppDialog | NoticeList、NoticeReadingDialog、SafeNoticeBody；NoticeCollection | 205 |
| 218 adminhome | `/admin` | AdminShell、OverviewMetrics、ModuleLinks；AdminOverview | 209 |
| 213 metrics | `/admin/analytics` | AnalyticsFilters、MetricTile、MetricChart；AnalyticsDashboard | 209 |
| 208 models / plans | `/admin/models`；`/admin/plans` | CredentialForm、ModelEditor、RemovalImpact / PlanEditor、PriorityEditor；AdminModels / Plans | 101 / 102 |
| 103 users / userdetail | `/admin/users`；`/admin/users/:userId` | UserSearch、UserDetailSections、AdminBatchReader；UserSearchPage / UserDetail | 103 |
| 211 credits | `/admin/users/:userId` 的积分分区 | PointsLedger、PointGrantForm；UserLedger。不建第九个一级菜单 | 103 |
| 210 operations | `/admin/growth` 四个页签 | CheckinSettings、LevelEditor、AchievementEditor、ItemDefinitionEditor；OperationsDraft | 206（整组保存见 §8.2） |
| 209 messages | `/admin/notices` | NoticeEditor、MarkdownPreview；AdminNotices | 207 |
| 212 presets | `/admin/presets` | PresetEditor、PreviewWorkspace、PublishConfirmation、WordPicker、PresetWordMeanings；PresetDraft | 208 / 202（管理选项见 §8.3） |

保留原 `/admin/users/:userId/batches/:batchId` 直接只读入口，与详情弹窗共用 reader；不加入学习者动作。没有 `/admin/credits` 一级页。后台恰为概览、数据分析、模型、计划、用户、成长运营、消息、首页预设八模块；修改 middleware/learner.ts、controllers/learner-access.ts、登录角色返回中旧 `/admin/models` 默认跳转为 `/admin`，不是删除模型页。

12 个 M001 PAGE 对应 FDE 全部继承：001→205，002/003 保留，004→204，005/006/007 保留，008→008+201–203，009→206，101/102→208 的两个模块，103 保留并扩展。旧标题只读、四选项均空、逐题判对才推进、离开丢草稿、总结永不显答案等断言明确废止；原权限/生成完整性/单批日期隔离/账号安全仍测试。

访问私有页保持现有 LearnerPageBoundary/AuthGate 及 safeReturnIntent：访客见认证入口，选择登录后保留类型化目标，禁止任意 return URL；管理员分流后台。认证失败区分身份未知与真实访客，不把故障假当退出。导航 Header 固定首页/精选/学习/复习/书架；trial 高亮精选、batch 高亮书架，复习四阶段高亮复习。头像四项共用 AccountShell，称号只在成长内容中。

<a id="modules"></a>
## 4. 工程边界与组件职责

| 层与工程位置 | 修改/新增责任 |
|---|---|
| `app/application/{auth,generation,review,library,account,growth,items,notices,admin,analytics}` | 纯模型、意图、reducer、策略；模型从当前巨型 shared/models.ts 按领域迁出，shared 留 IDs、Amount、Failure、Page；不引 Vue/Nuxt/Zod。 |
| `app/application/shared/ports.ts` 与领域 ports | ApiPort 可组合窄领域接口，避免一个组件取得全部管理能力；输入应用命令、输出应用模型。新增 DraftRepositoryPort；参数不是 DTO。 |
| `app/infrastructure/http/{schemas,mappers,repositories,transports}` | 严格 envelope/DTO、请求编码、Zod/分页/枚举/Problem/SSE 处理。将 api-repository.ts 按领域拆分再组合，避免另起 HTTP 客户端。 |
| `app/infrastructure/local/review-draft-repository.ts` | 唯一 IndexedDB 读写/CAS/账号清理；不写 Nuxt state、不接触标准答案。 |
| `app/runtime/{plugins,loaders,stores,session}`（插件实际入口仍 `app/plugins`） | Nuxt ports 组装；请求/账号 epoch；领域 actions；client-only review runtime、token vault、反馈协调器；SSR aggregate 只接应用端口。 |
| `app/presentation/{controllers,review,library,admin,...}` | 焦点、view selector、日期/金额格式化、图表标尺、分组符号；不决定额度、奖励、掌握资格。 |
| `app/presentation/components` / `app/pages` / `app/layouts` | 页面装配、props/intent emit、路由生命周期；无 fetch/useFetch/$fetch/$api、DTO/schemas 导入或原始 snake_case 读取。 |
| `app/assets/css`、`i18n/locales`、`app/presentation/icons`、公开许可目录 | 一次受控转换 UI26 Token/文案/SVG；正式包不读 `.planning`。 |

依赖单向：view→controller/store→application port←infrastructure adapter。只有 composition root 导入 repository/IndexedDB adapter；state 不反向导入 view。现有 dependency-cruiser 已防页面→infrastructure，但尚未防 `$api`/全局 fetch 直连，实施需补 ESLint AST 禁用规则和架构测试，并扩大 runtime 禁止 schema/mapper/transport 依赖。禁止 raw `Response`、Zod 推导 DTO 或任意 JSON 返回给组件。

共享视觉组件仅抽真实重复区域：EditableConfiguration 负责四项 UI26 AppSelect；ReadOnlyConfiguration 接统一展示模型供 trial/detail，详情无折叠、trial 默认展开；两者不共享权限计算。SavedPassage/TargetResources 可用于本人详情和管理 reader，以显式 readonly view 禁用写意图。复习 PassageCloze 不复用含完整答案的 SavedPassage 数据源。AppDialog 与 ToastHost 共用反馈层协调，不能在每页各建一份欢迎节点。

<a id="data"></a>
## 5. 类型、转换、状态归属

DTO 来源只限 [API](api/index.md)。这里命名的是内部应用模型，不是新增网络字段。FE2-G01–03 按 BE-03 定义严格 schema/encoder、显式 mapper 和独立契约样例；当前冻结的是接收设计与设计级验证，不是生产实现。

| DTO 族 | 转换与输出 | 状态/页面消费 |
|---|---|---|
| Actor / IdentityResult / Welcome / Account | discriminated Actor；id 为当前账号隔离键；displayName、nullable profile；Welcome 三分支；剥离 csrf_token 至 TokenVault | session/account store；欢迎事件内存一次消费，不存原登录响应 |
| GenerationOptions / PlanQuota | 联合 limited/unlimited；0 是真实 0，null 仅相应联合；模型ID和名称分开；effective origin、extra、access 分别映射 | workspace selectors；不按 pro/plus 名字或 client priority 拼权益 |
| PublicPreset / AdminPreset | 发布对象与草稿两个模型；title 单值；sample 完整文本+code-point spans；revision/version 不做数值运算 | 目录/锁定台与后台编辑互不污染 |
| BatchSummary / BatchDetail / Target | title/titleRevision/titleMaxLength；保存快照配置；原词数组/标签/正文；span 使用 Array.from code points 转 DOM 片段，沿原 span-mapper | 书架/详情/只读管理；不从正文正则猜目标位置 |
| Session / DraftAttempt | 状态联合，safe currentBatch 无标题；HMAC题号不透明；DraftAttempt token 剥离，slots/segments 变题面模型 | SSR 仅最小会话；client runtime 保存题面与输入，见§6 |
| 新 submit / already_submitted / Receipt | outcome 严格判别；comparison 只新成功分支可用；has_answer bool或null→answered/unanswered/unknown | 临时对照不回填会话 store，不把 M001 null 当 false |
| Growth / Award / Reward / SettlementReceipt | Amount 字符串；资格state/blockReason服务端为准；claimed 用实际奖励；称号达成时值与领奖分开 | 领域 store + presenter；description 为必返的 string/null，null 不渲染说明，不拿 title 顶替 |
| GrowthSettings / LevelConfiguration / AchievementConfiguration | 五值及完整当前集合→GrowthSettingsForm / LevelTableDraft / AchievementTableDraft；revision、稳定行键和提交快照分开；说明保留实际语言槽 | admin growth store；映射与保存见 §8.1–8.2，管理集合无分页 |
| AdminGenerationOptions | 安全模型、完整枚举、vocabularyVersion、revision及预览可用性→AdminPreviewOptions | admin preset store；不混入用户计划、额度和 access，见 §8.3 |
| ShopItem / OwnedItem / Effect / Preview | kind联合；modelTimes 每模型一行；deadline/ends/aggregateEnds区分；确认token仅内存 | 背包/商城分store，预览弹窗绑定对象和本次意图 |
| Notice / AdminNotice | 独立纯文本标题与后端清洗 HTML；运营原始双语仅后台模型；contentLocale 控制正文 lang | SafeNoticeBody 唯一HTML sink；后台 Markdown 只经服务预览 |
| Group / AdminModel / UserDetail | 四计划全字段；admin的quota/growth/baseRevision为空=不适用；模型provider ID仅管理投影 | 八模块、查询/续载/表单；管理reset与普通改配置分开 |
| Metric / UsageSummary | value null保留状态、reason；ratio只格式化；unknown cost/token 不变0；credits明确单位 | SVG断开无数据点，明细表及legend来自同模型 |

Amount/SignedAmount 在模型与可序列化状态仍为规范十进制字符串，编辑用 text+inputmode=numeric，校验十进制字符，不经 Number。确需比较/进度时用 BigInt 的临时计算，结果有界比例转换 Number；BigInt 不入 JSON/SSR。钱/积分不调用 parseFloat 或按 locale 反解析显示值。ID、revision、token、cursor 不透明且不推断内部排序。

API 参数 snake_case/含义在 mapper/encoder 一次消化：UI Brief/Standard/Extended/Deep Dive→API short/medium/long/xlong；释义中文/英语/日语→zh/en/ja；不把 prototype brief/chinese 直接发 API。标准枚举请求严格校验；历史配置的显示 formatter 保留未知纯文本的安全显示路径以符合 SETTINGS22 长值验收，不自造可提交枚举或静默改默认。

状态归属：服务权威=身份/计划/额度/库存/资格/排序/结算/指标；URL=稳定资源ID/允许搜索或后台分区；页面内存=未保存表单、折叠、gallery筛选与位置、选择器、焦点、当前流；IndexedDB=未提交复习输入；token vault=CSRF/claim/生成/预览/复习 capability、确认token；临时总结只client内存。均无localStorage账号快照、答案历史或离线提交队列。

store 的读请求带 request revision 与账号 epoch；查询/语言切换 abort旧请求且拒收迟到响应。配置命令不得因 abort 推断失败，按领域重新查询。session id 改变清前会话暂存；语言切换不换题序、重置草稿、丢表单或重新消费欢迎。

<a id="review"></a>
## 6. 复习、本机草稿与一次性总结

### 6.1 状态及导航

用 `loading → restorePrompt | editing(wordIndex|passage) → overview → submitting → comparison | submittedReceipt → next/editing | sessionDone`，另有 recoverableFailure / unavailable。属于 UI 状态，不覆盖服务端 draft/submitted/restarted 或 session active/completed/abandoned。四个 PAGE 共用 `/review/:sessionId` 容器；浏览器返回不能把已提交总结恢复成可写草稿。

1. 日期页读取浏览器 IANA 的含首尾7天范围预览与 active-range；输入节点稳定，预览失败/加载是未知“—”而非0。旧会话恢复与新范围预览各自存在。替换前 GET session 取得 session_revision，展示已有确认后提交 replace；失败保留原安排，响应丢失查 active-range，不盲目再次替换。
2. 本篇由库条目的 start/resume 创建或接续，不受参与开关限制；范围和各本篇独立。POST attempts 只在明确开始/下一批意图后，刷新 GET 已有 attempt；SSR、恢复检查不得偷偷创建一次开始事件。
3. LetterSlots 从 slots 生字母组/固定标点；释义在下、短语开关再下。键入、退格、左右、粘贴均是本地动作，IME compositionend 后再分发，不在 composition 中清空。保存每题语义输入及槽位置，不用完整填满/正确判定拦截下一步。超槽粘贴不得悄悄截断原值：整体不应用该次超容量输入、保留现有输入并使用已有校验反馈，常规粘贴按可容纳的槽逐个分配；长词窄屏仍所有槽可达。分隔符本身不计“用户已答”，全空不能因空格/连字符变成非空。
4. 短文每个 occurrence 独立值，宽9ch、不返回/推断答案长度。至少一个非空可继续，全空走跳过；任意时刻可进概览，全空也可最终提交。概览修改带 returnToOverview，修改后下一步回概览；上一步保留其他答案。显式跳过清当前原词或整段当前短文输入后导航，避免旧值伪装跳过。
5. 匿名分组由当前 attempt 的稳定 HMAC group_key 驱动：mapper先将不透明组键转换为本地groupRef，稳定散列和排序派生视觉排列；原group_key不进入DOM/aria/class或分析。不以原词/题序/答案为seed，刷新、语言切换一致。保留现有 ClozeGroupStyleRegistry 的形状/纹理空间，替换每次随机初始化；不同词形保持同组，颜色不能唯一表达同源/正误。

### 6.2 IndexedDB 本机协议

库 `wordweave-review-drafts`，schemaVersion=1，store `drafts`：复合键 `[accountId,sessionId,attemptId]`；数据仅 `schemaVersion, serverRevision, localRevision, wordInputs, passageInputs, navigation`。导航含题号/阶段、概览返回点与当前输入焦点等显示状态；不存题面、词义、标准答案、完整短文、正确性、token、昵称、历史提交或答案hash。字母槽空位可作为用户输入数组保存，提交时才编码；服务端 revision 与本地 revision 不混用。

- **恢复**：完成认证，GET session/attempt 验仍 draft且id/revision/题集匹配，然后读取本账号记录并弹已设计恢复确认。选择恢复才将答案注入页面；关闭停留入口保留记录；重来成功才删旧记录并进入新attempt。无本机答案的其他设备只载入空白，不提示已同步。token2小时过期重新GET同attempt，不能以此清草稿。
- **写入**：输入事件合并到下一轮短任务的一个readwrite事务，每次读取当前localRevision再CAS写，不保存每次按键历史；前进/概览/隐藏页面主动flush待写队列，提交前flush并冻结本次输入。退出时最后一笔仍需浏览器完成异步事务，不能宣称强杀浏览器永不丢末次按键。
- **多标签页**：CAS为正确性保障，BroadcastChannel只广播key/revision/失效，不广播答案。每次输入/导航前检查版本；冲突不覆盖另一页，在当前页保留未保存内存值、显示既有失败反馈并重新核对；恢复确认决定加载当前持久记录，当前内存副本在用户决定前不销毁。focus/visibility重读补偿漏通知；不需要分布式锁/云同步。服务端submit/restart/replace的CAS仍是结算最终保障。
- **故障**：IndexedDB拒绝/额度满/写失败不假报保存成功，显示 `failed` 就地及重试动作，当前内存答案继续可编辑/提交；恢复失败不用空草稿覆盖已有记录。格式损坏/版本未知不解释为答案，先服务端核对，保留错误与显式重来路径。没有自动删30天草稿或跨设备保留承诺。
- **清理**：明确提交/重来/批次删除/账号注销成功后删对应记录；同机其他页收到失效，先核对再退出。注销清该账号所有；退出/401清内存题面、机密及对照，持久未提交记录保留在原账号key下，只有重新认证该账号并验证资源才可恢复。其他设备的本机数据只能下次联网核对后清，不能远程擦除。DB读适配器任何时候都不向不同accountId暴露记录。

### 6.3 整批提交与网络未知

`submit` 用 API-008 原始题号编码最新words/passages，仅答案数组和expected_revision；token header来自vault。禁连点，原词不全长或拼错仍允许。新成功只在client shallowRef展示 comparison和本次growth增量；删除本机草稿失败则保留清理重试，下一次GET已submitted必须先清残留，不能再显示恢复确认。

网络结果未知先GET attempt：draft→保留答案，可重试同attempt/revision的原提交；submitted→清草稿，显示最小回执/继续，**没有 comparison/growth 就不重建答案对照或再发成长动画**；restarted/abandoned→清旧草稿、读当前安排；404→安全不可访问、清被确认失效对象。复习幂等键是attempt身份，不擅加成长的Idempotency-Key规则。M001 has_answer=null仍unknown。

新总结正确仅一次绿字；错误原值删除线+正确值；未答用准确文案和正确值；纯文本渲染不插用户HTML。离开总结/下批/换账号/pagehide清comparison；pageshow含BFCache恢复先清对照并GET最小事实，不靠浏览器历史恢复最近结果。不把答案写history.state、Nuxt payload、sessionStorage、请求日志或分析。

“重来”调用原attempt/restart，新draft才清旧输入；最后一批completed允许当前总结显式重来但若已有新active会话尊重409。下一批明确POST attempts，完成仅离开已自动completed的会话。SessionTotals用五项进度，skipped是未成功子集，不能再加到completed；上次完成进度在重来draft期间保留。

<a id="generation"></a>
## 7. 造文、预设、书架与认证承接

普通台默认story和允许时short；model/meaningLanguage空。短篇不在许可集合则长度保持空，不代选。随机每次一个请求，pending期间禁重复点击，回包只应用仍相同selectionRevision；server排除当前库/已选，前端再查重；不按累计掌握集合改筛选。options是读时快照，拒绝时重读但不静默换用户选择。

generation reducer沿现有入口扩展 `kind=ordinary|preset`，配置从不同来源获取但共享validated/save/claim链；管理员preview是独立状态机和token类型。UI状态保持idle/starting/streaming/validated/saving/cancelled/failed，等待首段、部分正文、等待完整验证分别呈现，不用partial作为成功。配置在streaming和未收录validated期间冻结；普通与锁定台都只显示一处额度，模型时长和次数分开。

继续POST fetch + eventsource-parser，TextDecoder streaming模式跨UTF-8片段及SSE多行解析，逐event runtime schema。started放run/token到vault；delta批量按动画帧更新纯文本，限制每帧重绘；validated完整替换最终应用模型，检查span/非空/标签形态再开放收录。heartbeat不渲染；EOF无终态或parse失败不能当validated；用户重试是新明确意图，不自动重发生成。应用不直接调用模型、不存prompt、providerID/成本不落普通用户模型。

取消按钮先调用cancel，取实际终态：valid竞态不改写成cancelled；failed只按实际quota_refunded显示，不能用 `create.failure` 的已退款断言覆盖false。未确认退款使用一期已有中断/错误安全文案，refresh options不手加次数。关闭组件abort监听/流reader；显式离开先已设计确认，已取消与单纯断连不能混为同计量。成功后放弃不退款；preview events无quota字段，不复用用户生成事件schema强行补false。

访客validated→visitor-claim token仅当前Nuxt应用vault→登录/注册互跳→consume一次→批次详情；失败保留当前claim重试，刷新丢失按原copy提示，不再调模型或按登录计划重审。认证成功和claim成功分别追踪，消息失败不回滚它们。claim无效不循环发请求；用户关闭错误后恢复原意图。先完成/明确结束承接，再消费登录welcome和reminders；注册仅welcome.first，不触发登录提醒。

精选 SSR载第一页；后台自动滚动仅在全部目录加载完成后开启，客户端按limit=100顺序读完cursor、以id去重后计算全部/中/英/日Tab数量。契约无总数，不能把第一页当全量、擅造total字段或触发AI。期间用既有loading/error重试呈现，不显示假计数；取齐后本机筛选，稳定presetId导航，排序保持API顺序。分页非快照，刷新从第一页重建集合；没有业务上限截断目录。大量内容需量测，但本期不用假定百万数据引入搜索服务。

gallery换语言保留filter/selectedId/用户已中断标记；读正文完整、横向scroll-snap，不复制可聚焦卡。换filter回第一项且停自动；单条/空条停timer。进入trial重新读发布对象，配置只读；POST仅published_version，409版本变更重新展示后由用户再次开始。后台预设草稿/preview/published分开，参数改动重做预览、标题-only沿用但仍手动发布。管理员选项严格按 BE-03 AdminGenerationOptions 接收，独立 schema/mapper；§8.3 区分缺凭据、无模型和读取失败，不套访客计划词数限制。

书架保留六项全量统计、旧到新、仅完整目标词搜索、加载更多、详情返回查询/范围/滚动/焦点。标题更新patch各缓存应用模型，revision冲突保留输入并重读供再次明确保存，不能无声覆盖；maxlength取详情title_max_length且按codepoint校验。参与失败回滚checkbox到已确认值；删除明确成功后删列表/详情/本机草稿，失败保留，累计成长刷新服务投影不手减。历史模型/设置显示保存快照；API没有标题的review safeBatch不能从library cache补标题。

<a id="growth"></a>
## 8. 个人成长、道具、后台与反馈

AccountShell共享本人基础信息和四入口，各页面加载失败保留侧栏。昵称空回用户名，姓名转义；改密、退出、注销原表单/确认保留，密码关闭即清。SignIn无人工签到按钮；生成或同日claim成功后刷新growth，签到自动到账，等级/成就仍手动。首次掌握、连续复习及等级门槛都来自服务端，日期展示用Asia/Shanghai04学习日事实；日期复习浏览器时区、quota滚动24h、卡绝对期限是四套不同语义。

成就按kind/稳定tierId分组，默认当前未领档、其余可展开；第5档以上从cursor加载，不写死4档。取齐分组前不错误宣称无下一档；等级待领逐级显示，满级仍累积经验。claimable/blocked/claimed各用服务器投影，商城下架不等于奖品失效；整份奖失败不手加积分/经验/卡，成功依receipt更新后重读关联模型。称号解锁在个人成就内容，无佩戴及Header称号。说明按 API-203 的当前本地化投影显示，映射和空值见 §8.1。

每个兑换/领奖/补签/启用/退积分/管理员补分意图产生UUID幂等键，未确定前保留原键与非敏感参数于当前内存；重试同键，改参数新意图须重新确认。响应未知先领域GET对账，原键重试取得receipt；刷新不自动重放命令，不持久化答案或token。余额/用量/卡状态成功后才更新，来源不清不能假报未到账或自动重复发奖。

使用流程 read item→activation/refund/makeup-preview→确认→命令；补签日期由API can_makeup决定，不按浏览器0点算。preview_stale重取并重确认，旧token清理。低档拒绝/高档作废/same续期、逐模型累计时间、模型完全被计划覆盖、下架退实时积分都取projection；不得运行prototype benefits的计算。已用卡被计划覆盖仍计时；extra expires_at保持原启用期限。退换只本卡贡献，前端不重排授权。

后台继承所有原功能：凭据脱敏且替换需确认；模型名称/说明/原ID新增编辑启停移除；移除impact和revision重验；固定四计划全字段及优先级整组交换；零额度/null不限/空模型空长度合法但警示。计划配置变更不重置用户用量；管理员对用户base调整带expected_base_revision，响应丢失GET核对，不能再次“重置”。trial、奖励不受该动作影响。

用户搜索前/空查询/多结果/无结果/失败/续载保留，单结果仍需选中；回列表保持状态及焦点。管理详情四分区含只读完整库、改计划、密码重置和正数补分；不代学不改标题，管理员目标不显示学习者写动作。补分reason为现有管理字段，不把用户名/理由混入分析。成长运营按 §8.2 的三个整组命令接线；表单跨页签/对象保留本次草稿，失败现场反馈和toast都有，不能只弹toast就清空。


<a id="cr004"></a>
### 8.1 FE2-G01：双语说明与个人展示

契约来源：[API-206](api/administration.md#api-206-growth-config)、[API-203](api/growth-benefits.md#2-等级成就手动领取)，存储来源 DB2-R10。`AchievementFields.description` 是必需的 `OptionalBilingual={zh_CN:string|null,en_US:string|null}`，两个键不能漏，整个对象不能 null；显式清空编码成两个 null。名称/称号也各有这两个键，但至少一个非空。三者不能共用“全空合法”的校验。

- infrastructure schema 用 `z.strictObject`，不允许 unknown keys；说明每语言 2000 Unicode code points，名称/称号 200。输入用 `Array.from` 计数，不截断、不把 UTF-16 长度当字数。encoder 对名称/称号 trim，说明仅全空白归 null，其余原文保留；正式服务仍负责最终规范化。
- mapper 创建 `LocalizedEditorText={zh:string|null,en:string|null}` 应用值，逐字段映射 `name→nameText`、`title→honorText`、`description→descriptionText`。textarea 以 null 显示空输入，切语言不把另一槽的值填进空槽；显示用的回退选择器绝不能用于写入编码。内容弹窗保存只更新外层行草稿，关闭/取消丢本弹窗未确认编辑，不发 HTTP。
- 个人 `Achievement.description` 必返但可为 null，mapper 只映射为 `descriptionText`；服务端已按本人 ui_locale 逐字段回退，客户端不翻译、不拼成通知语言对。null 隐藏 `.achievement-description` 区域；非空用 Vue 文本节点，`<b>文字</b>` 也只是文字。语言切换重新读取个人投影且拒收旧语言响应，后台两槽草稿保持。
- 名称、说明是当前配置；已达成称号仍是服务端给出的历史快照。编辑说明不改 claimed、资格、积分或经验；管理端不替用户领奖。对应 PAGE-210 的 TierContentDialog、PAGE-214 的 AchievementCard，保留 UI22 区域顺序和 `a.tier.description.zh/en` 文案。

### 8.2 FE2-G02：一次保存对应一个事务

端口归 `application/admin/growth`，DTO/schema/encoder/mapper 归 `infrastructure/http`，controller 只发送 `editField/openContent/save/confirm/retry` 意图。表单应用模型包含：`baseline`（完整已读配置）、`draft`（未保存值）、`baselineRevision`、`formEpoch`、每行 `clientKey/id`、`submission`（发送时变化集与索引映射）、`fieldIssues`、`phase`。revision 原样保存且不递增。token 仅客户端 vault；SSR 只载完整已映射配置，客户端开始编辑才生成 UUID，避免 hydration 创建两套行键。

| 表单 | HTTP 一次性命令（前缀 /api/v1/admin） | 应用模型和读写映射 |
|---|---|---|
| 签到/首次掌握 | GET /growth/settings；PUT /growth/settings | `learning_day→learningDay`、`mastery_experience→masteryExperience`、`growth_started_at→growthStartedAt`，current/pending 保持 null；`base_points/step_points/cap_points/normal_experience→basePoints/stepPoints/capPoints/normalExperience`。优先 pending→current 初始化四值；两者均 null 则输入空白等待运营填写，不填原型示例。PUT 编码这五值及 expected_revision，不能拆两次。 |
| 等级表 | GET /growth/levels；POST /growth/levels/impact-preview；PUT /growth/levels | `LevelConfiguration.items→LevelTableDraft`；`level_number/min_experience/reward_enabled→levelNumber/minExperience/rewardEnabled`。Reward 的 points 保留 Amount，`item_definition_id/item_count→itemDefinitionId/itemCount`。预览和最终 PUT 使用同一 LevelChanges 快照，PUT 仅另加 confirmation_token、confirmed:true。 |
| 一类成就表 | GET /growth/achievements?kind=…；PUT /growth/achievements | `AchievementConfiguration.kind/items→AchievementTableDraft`；threshold/enabled、§8.1 三组文本及 reward.experience 全部进入每行 draft。请求 kind 仅在顶层，变化行 value 不重复 kind；同一 kind 的新建及修改一次发 AchievementChanges。 |

管理等级与单类成就 GET **不接受 cursor/limit**，用普通 data/meta envelope 而非分页 envelope；个人等级奖/成就列表仍按 cursor 加载。管理过滤只隐藏显示行，baseline 和 draft 不裁剪；编码提交所有 dirty/new 行，不能遗漏被过滤的已修改行，更不能将未显示行解释为删除。已有 id/levelNumber/kind 不允许编辑，无硬删除档位接口；新增行 id=null，clientKey=UUID，当前编辑周期内重排、过滤、语言切换和预览确认均不换 key。新的等级在最高级之后连续编号；空集合第一档固定 Lv.1、经验0、无奖励。无“四档上限”，第五/第六档照常。

Amount 是 0..9223372036854775807 的规范十进制字符串，编辑时允许暂存空/非法文本，只有 encoder 成功后才提交；不经 Number。threshold 是安全 JSON 整数 1..9007199254740991，levelNumber/itemCount 上限2147483647；无卡时 itemCount=0，有卡时>0。单行合法后按全部草稿检查等级严格递增、同类成就门槛不重复，服务端仍验证完整最终集合及引用。允许 `[0,100,200]→[0,200,300]` 一次改多个门槛；禁止为“避重”逐行发请求。有效但未上架商城的卡仍可选，不能用 listed=false 阻止奖励引用。

保存状态：`editing → validating → previewing(level only) → confirming(level only) → saving → editing(clean)`，异常为 `fieldError | reconciling | failed`。提交和预览时冻结此次 draft/changes，禁止重复点击及同表编辑；取消确认回编辑，已有内容完整保留。confirm 只使用本次预览 token；一旦任何相关行变化，token 失效并必须重新预览。expires_at 只用于显示/早期失效提示，最终以服务器为准；token 5分钟，不进入 SSR、URL、storage、日志或分析。预览取消、失败都不调用 PUT，也不显示已保存。

成功须严格校验整个响应及 `saved_rows`：数量/顺序与 submission.changes 一致、client_key 对应、id 唯一且存在于 configuration，已有 id 不改变；然后 mapper 原子替换完整 baseline/draft/revision，用 saved_rows 将新增行绑定正式 id，保留相同行键和合理焦点。签到从返回 learningDay/current/pending 显示真实生效日，不能把未来四值当作今天已生效；首次掌握经验提交后即时用于新行为。只有确认200且完整响应有效才显示 `saved`，不额外派发成长奖励、积分或经验。畸形成功响应按结果未知处理，不能先应用半份数据。

失败处理不清空输入：

| 情形 | 必须执行的编排 |
|---|---|
| 422 validation_failed | JSON Pointer 使用**提交快照**索引→clientKey→当前行定位，例如 `/changes/1/value/threshold`；不可按当前排序/筛选数组定位。隐藏的失败行取消对应过滤并聚焦，内容字段打开原内容弹窗定位；`/changes` 留表级错误。未知路径/字段code落通用错误，不丢其他错误。 |
| 409 revision_conflict | context.current_revision 仅提示过期，不直接写入 baselineRevision。GET 完整当前集合，保留旧 baseline/draft 和已读新快照，进入核对态。已有错误区域显示相关字段的当前服务值（使用原字段标签及动态值），输入保留用户值；不能自动合并后保存。用户核对冲突字段并再次明确点击保存才建立新编辑快照及变化集；未改字段采用新基线，冲突字段必须重新确认输入，等级重新预览。新的保存是新意图，不能由 GET 回调或自动重试触发。 |
| 409 impact_changed/preview_stale | 丢弃旧 token，保留草稿；明确再次保存才重新预览并显示既有等级确认弹窗，不自动跳过确认。 |
| 网络中断、5xx、成功体无法解析 | 进入 reconciling，先 GET 完整配置，读失败仅可重试 GET。当前值与目标一致只说明当前已满足，不发“旧保存成功”toast、不构造 saved_rows 回执；旧提交不得自动重放。新档无法由 clientKey 查询，不能把相同名称猜作同一 id。展示重新读取的真实行供用户核对，保留未决草稿；有冲突沿上项明确核对，新的新增意图须由用户根据当前集合重新建立。 |
| 400/413 | 通用失败和保留输入，修正错误后再显式提交；不自动拆成多次、截断说明或静默删除行。 |
| 401/403 | 权限边界先行，取消令牌和待写动作；退出/身份改变按§5清账号内存，不因“保留输入”向下一账号泄漏。 |

以上三个配置命令仅使用 expected_revision，**不带 Idempotency-Key**；业务领奖/兑换仍按原幂等规则。表单重试不是通用HTTP自动重试中间件。全局 revision 因其他后台模块改变时也可能409；一次成功不能将其他脏表单的 revision 擅自提升，其下次保存仍走核对。同标签切换 kind/tab 只换活动草稿，返回保留字段和错误；响应按资源、提交快照和账号 epoch 归属，不把上一类响应写到当前类。反馈继续消费 `saved/failed/error/retry/a.sign.invalid/a.tier.order/a.title.required/a.level.confirm/level.effect` 等已批准 copy，错误信息只呈安全字段和值，不输出原始服务 detail、token 或技术异常。具体运行还原验证见 FE2-V19，不以设计样例代替浏览器交互通过。

### 8.3 FE2-G03：管理员生成选项

[API-202 §5](api/generation-presets.md#5-管理员预览边界) 的 AdminGenerationOptions 单独严格 schema。mapper 创建 `AdminPreviewOptions={models,meaningLanguages,scenarios,lengths,vocabularyVersion,revision,availability}`：model 逐字段拷贝 id/name/description；数组逐值转既有应用枚举，保持服务顺序；availability 变为 `ready | blocked(credentialMissing|noModels)`。不复用普通 GenerationOptions mapper、不补 access/quota/maxEntries/无限次数假值。完整枚举必须为已支持的三种语言、四种场景和四种长度；未知/缺失/null/额外敏感字段均为契约错误而非静默默认。

`loading | loaded(options) | loadFailed(lastGoodOptions?)` 与业务 blocked 分开；200缺凭据仍显示可用模型供编辑草稿，禁开始预览；模型数组空也不自动替换既有 draft.modelId，失效选择用原错误/空态提示。两者都缺按 credentialMissing 展示，优先级来自服务器，前端不猜凭据存在。503/500保留草稿及最后已知选项供阅读，但禁开始预览直到重新成功读取，不把失败映射成“暂无模型”或次数0。应用状态和DOM没有供应商ID/密钥/遮罩；GET不创建生成、扣额或用量事件。

开始预览仍提交该预设 draftVersion；后端重验返回422 credential_missing/model_unavailable或409 revision_conflict时保留输入，重读选项/预设并要求管理员明确修正和再开始，不自动选另一个模型、重启流或发布。只读 GET 成功不等于供应商可用，预览实际用量按既有独立管理流处理。页面、配置布局、文案和状态入口沿 PAGE-212，不增加计划选项或访客上限。

### 8.4 契约 mock 接收与边界

本次 [FE-02 契约接收脚本](evidence/receive-frontend-cr004.cjs) 使用仓库现有 Zod，输入为获批 [BE-03 合成样例](evidence/M002-BE-03-contract-examples.json)，另以字面错误输入验证严格边界；结果见 [contract-check](evidence/M002-FE-02-contract-check.json)。脚本只存在于技术 evidence，不挂载应用路由、不代替 HTTP server 或数据库。schema、映射、提交索引和 mock 场景是可复核的设计样例；正式实现须按 §11 在生产边界重建并验证，不能直接导入 planning 代码。

| 用例组 | 接收样例与后续实现必须保留的断言 |
|---|---|
| FE2-C01 / G01 | 全空、单语言、双语、空白及尖括号纯文本；对象缺失/null/少键/超长拒绝；缺译写回仍为空槽；个人 null 隐藏说明，非空保持服务端原文。 |
| FE2-C02 / G02 | 五值一请求、未初始化null、四档到六档、旧id保留及新增saved_rows映射、成就同类完整表；过滤/重排后错误仍指向提交行；Amounts上界无精度丢失；空changes/重复clientKey/未知字段拒绝。 |
| FE2-C03 / G02 | 422整组未变、409与旧revision、未知提交先GET、等级预览不写、token变化重预览、413不拆单。模拟只能证明编排预期；DB锁/事务/并发需要 BE2-V19/20 和 DB2-V21–23 实施证据。 |
| FE2-C04 / G03 | ready、缺凭据、无模型、二者皆缺以及503分别建mock；200模型仍可选与实际开始重验；计划/供应商字段注入、缺字段、nullable错误被拒绝。 |


<a id="notices"></a>
## 9. 消息、欢迎与反馈层

Login action发一次内存欢迎事件；kind=no_learning→`g.welcome.new`，same_day→`welcome.today`，returning→`welcome`嵌`welcome.elapsed`，注册→`welcome.first`；首次与无学习不虚构天数。服务端days已按学习日计算，使用登录快照，不被随后claim更新覆盖。补齐UI原型仍显示0天的已知接线差异，不改已批准文案。

明确login后（L/A可查消息，admin无welcome）按reminders_only取齐所有cursor，再开一个提醒正文弹窗；bootstrap/续期不触发。Header点击列表不做个人已读写入。隐藏优先、整套title/body语言回退已由后端选择；locale切换旧cursor失效，从首重新取但不制造新login事件，尽量按noticeId保持当前项。404隐藏项移出当前池；全无则关闭。请求失败可在列表重试，不撤销认证和claim。

SafeNoticeBody是唯一经过后端白名单sanitize的HTML输出组件；运营title、昵称、用户输入和AI正文全部文本节点。Markdown预览调用管理preview使用同净化结果，不额外引浏览器Markdown解析器；拒绝危险link测试归后端+前端sink集成，普通视图不接受任意HTML props。

ToastHost一个status/polite/atomic节点，常规300ms淡入+10s欢迎（普通5s）+300ms淡出；elapsed用strong 24px/700且数字与单位不折行，名字通过文本插值。节点在当前modal可访问子树，用manual popover进入top layer；单靠body大z-index不合格。AppDialog先挂载显示再协调宿主，翻页/重绘/close-open保留同动画对象、内容和剩余时限，不重播。下一条真实feedback取消前一动画，按animation.finished释放，减少动效立即停止过渡但保留可读停留。

Modal焦点/Escape不变，toast无focus、pointer-events:none；短屏按实际rect留出至少12px，resize含visualViewport软键盘变化重新测量；原型位置80px/安全区沿样式。支持范围按现有项目浏览器并在实施时跑Chromium/Firefox/WebKit验证Popover和WAAPI，不能只凭原型Chromium宣称全平台通过；不额外写未经授权的旧浏览器兼容平台。失效数据/存储错误用已有就地error/failed+retry，新文案需求回设计而非实现自由改写。

<a id="design"></a>
## 10. 文案、Token、资源与动效转换

copy.json含static与templates，两者键为`zh.*`/`en.*`，不套未经读取的另一种格式。构建前受控脚本（不在生产运行）分语言映射到既有`i18n/locales/{zh-CN,en-US}.json`的M002命名空间，保存原key→工程key清单和源SHA。保留文本、标点与变量集合；`g.welcome.new`虽列static仍含name占位，按实际占位解析校验，不能漏插值。M001仍使用的安全/错误文案列白名单保留，已被UI26替换/删除文案不作为回退复活。i18n插值的@/花括号等需转义构建语法但运行文本不改；测试最终文本而非只比JSON值。

运营名称/说明/称号、AI正文、私人标题来自应用模型，不能写成固定copy。首页两篇公开样文是明确固定设计内容，可把fixtures.hero.stories及所用词义受控提取到`app/presentation/home/sample-stories.ts`并保留来源摘要；不捆绑fixtures用户/额度/模型/成就。中英文品牌各一个、前台不出现PAGE/CAP/原型演示面板。局部错误映射先匹配field_errors/code，再用已有通用安全文案，后端detail不作为产品copy。

从批准UI26将theme.css变量及本轮区域样式受控迁入生产theme.css，新的`--reading`为字体栈，旧宽度68ch须改名如`--reading-measure`并检查所有引用，不能盲覆盖同名。全页最大1440，canvas#f8f6ef/paper#fffef9/ink#193d36/green#21654e等按源值；application.css按页面区域迁移并删除被替代旧规则，避免两份CSS竞争。UI26当前专节与最终CSS优先于同文件保留的早期泛化段落：书架1100/760与手机三列统计、详情1100单列；日期卡保持1080/1081、560，不能把所有断点统一。

48个Lucide SVG使用本地受信资源转受控组件/图标表，保留24×24和currentColor、许可与README来源；图标name为允许联合，按钮/链接有label、SVG装饰不获焦。品牌沿批准SVG，不用∿等符号替代。系统字体无需网络下载；HTML lang/UI locale与英文正文lang=en、运营notice contentLocale各自正确。

首页HomeStoryStack按原DOM顺序两篇单段、反向旋转和交叠；两卡各6词签、完整49/46词正文。6秒±6px漂浮，错开3秒；8秒空闲切换、640ms、288ms换层；手动阅读本次停止自动，reduce瞬时，离屏/后台暂停，销毁全部observer/timer/animation。用独立translate保持旋转，快速选卡以最后意图为准，不复制正文。

精选自动8秒原生smooth，阅读/触摸/滚轮/聚焦/筛选/手动停本次自动；只有上一条/位置/下一条，无播放按钮。语言切换保留中断状态，离开再入可恢复自动，隐藏/离屏重新可见从完整8秒开始。Tab roving tabindex与方向/Home/End、手动播报、自动不播报按原源；所有动效在mount后启动、unmount清理，不驱动生成、奖励或PV。

<a id="quality"></a>
## 11. 测试、性能、权限与观测

本节是实施验收计划，不能以本次原型接收或文档静态检查代替运行证明。现有Vitest、Testing Library、Playwright、axe、dependency-cruiser继续用，不新增测试框架；测试选择可观察行为及跨层边界，避免只验证实现内部结构。

| ID | 验收范围与必要证据 |
|---|---|
| FE2-V01 | DTO/mappers：所有专题envelope/联合/nullable/Amount大数/Unicode span/游标/错误；M001 has_answer=null、0与无限、admin不适用、未知费用；严禁原对象spread进入app state。 |
| FE2-V02 | SSR与边界：两账号并发request无状态串用，payload无token/复习输入/判分对照，权限失败不假访客；本人书架正文资源属于合法只读SSR投影，不混同于复习题面。depcruise+AST拒page DTO/$api/fetch，loader先校验后归一化，hydration无重复写/PV。 |
| FE2-V03 | 复习输入：空、错、半填皆按规定前进；所有步骤概览/改回；多词/标点/长词、粘贴、组合输入、退格、无长度短文空及稳定匿名形状；题面/DOM/aria不泄标准答案或标题。 |
| FE2-V04 | 本机恢复：重载/同账号恢复确认/关闭/重来；异账号隔离、两标签CAS、IDB拒绝/损坏、token续取、删除/注销、替换/404清理；持久内容无题面/标准答案/历史；BFCache不恢复已提交对照。 |
| FE2-V05 | 提交事务mock+实际API集成：响应丢失draft/submitted/restarted/abandoned；双击/多标签只结算一次；末批重来、下批、五项最小概况与历史unknown；submitted回执不能伪造答案总结。对应BE2-V03–05/DB2-V17–18。 |
| FE2-V06 | SSE契约：任意UTF8/event切块、多行、heartbeat、first delta、validated前禁收录、畸形/EOF/429/取消竞态、退款未确认、断流、组件卸载、不得自动第二次生成；普通/预设/管理员三种身份事件分开。 |
| FE2-V07 | 注册/登录→claim→详情→改题名→复习，原文不重调；语言/return intent/密码撤销/退出/注销；明确登录四种欢迎与消息时序，错误不重复承接。 |
| FE2-V08 | 书架全量六统计、精确词搜、旧到新续载/详情回焦、参与/删除/历史快照和长标题、日期边界/预览错误保留输入、单批范围隔离；CR-001/002在此有完整回归。 |
| FE2-V09 | 成长签到/手动整份领奖、门槛增减/满级/动态第5档、称号无佩戴、补签差额0经验；卡6+3、甲乙3+乙丙6、优先级覆盖/续期、当前计划全部覆盖、下架积分实时和一次到账；base/trial分别记账。 |
| FE2-V10 | 后台八模块：模型全CRUD/影响token、四计划优先级交换、用户搜索/详情/只读库/密码/正数补分和base重置；运营原子保存/双语说明/管理选项使用 BE-03，专项见 V18–20；只有对应实际验证证据才标运行PASS。 |
| FE2-V11 | 预设草稿/完整预览/手动发布/下架/标题-only；公开只取发布版、完整多分页Tab计数、对应ID跳转；超访客配置但照扣身份额度、进入不生成、预览独立用量未知。 |
| FE2-V12 | 消息完整语言对、隐藏优先、翻页/语言切换、无读状态；净化HTML的script/url防护；欢迎10s两侧300ms实际帧、24px天数、modal可访问树/回焦/短屏避让、替换toast取消旧时间线。 |
| FE2-V13 | UI还原：逐PAGE/UIA取源、相同viewport/DPR/语言/数据/状态后看文本→内容顺序/可见性→几何/颜色/留白→交互；保存首个差异和原因，不能更新截图掩盖设计偏差。 |
| FE2-V14 | Chromium/Firefox/WebKit桌面，320×568、390×844、768/900/1080/1081/1100/1101/1440宽相应断点，中英文/长值/200%缩放/软键盘；axe、实际键盘与读屏人工分别报告，不能把axe=0写成人工读屏通过。 |
| FE2-V15 | 首页/Gallery真实计时与连续帧，阅读即停、快速切换、动态reduce、后台/离屏和卸载无活动定时器；不以静态截图证明动效。 |
| FE2-V16 | 看板no_sample/observing/unavailable/0/delayed/90天过期；曲线缺点不画0，范围UV不加总；first-party事件白名单/敏感字段负例、SPA一次PV、重试同eventId、私有页面无Clarity脚本。 |
| FE2-V17 | 同源生产构建/静态资源/CSP及no-store、cookie和locale、直接URL及客户端导航、前后端schema版本成套、部署后旧标签提示重载；无真实provider调用也能完成确定性验证。 |
| FE2-V18 | G01：管理双语原值往返、清空/缺译不污染、200/2000 code points、当前说明与历史称号分离、用户null隐藏及文本安全；BE2-V18、DB2-V20。 |
| FE2-V19 | G02：五值单请求与真实生效日、多行四到六档、隐藏脏行、行错误跨排序/内容弹窗定位、整组预览token过期/修改/取消、422不半清表、409显式核对、网络未知仅GET、新档ID不猜、跨tab/账号响应隔离；配对真实API验证全成全败，BE2-V19/20、DB2-V21–23。 |
| FE2-V20 | G03：admin选项完整严格映射、缺凭据/无模型/两者/503区分、不回退访客额度、旧draft.modelId保留；开始重验失败不自动生成、切模型或发布，GET无AI/扣额；BE2-V21。 |

Mock放`frontend/tests/contracts/m002`与现有mock-backend路由/SSE工具，fixture逐一标API版本和用例ID。schema验证fixture本身只是第一层；测试输入必须另用字面JSON/独立mock server覆盖缺字段、unknown字段、旧响应、新分支和错误，不能用mapper反向生成mock自证。CR004三项已按 BE-03 明确；FE-02设计级fixture检查不能替代正式schema/状态机及路由mock验证。准备真实后端替身集成验证权限/并发，不把路由mock通过当服务端事务通过。

内容还原输入固定同当前获批UI26数据但不放生产用户fixture。对照按运行页面实际内容和区域，截图未覆盖状态列未验证；首批选择home/explore/create/trial/library/detail/review/profile/growth及后台模型/计划/operations。细分UIA精确清单来自trace JSON，所有共享COPY09/ICON10/NAV11和新增UI22条目保留，FDE来源单独映射而不是生成截图即算完成。

实施检查命令沿`frontend/package.json`：`pnpm --dir frontend typecheck`、`lint`、`lint:boundaries`、`test`、`build`；浏览器执行`test:e2e`的相应场景，Firefox/WebKit需补到项目配置后才可宣称覆盖。先运行受改领域的有效测试，再完成项目要求的质量检查；本轮文档工作不空跑应用测试冒充实现验证。

性能先量现有build再对照：公共入口不装载后台编辑/图表代码；页面按Nuxt路由拆包、词搜索取消过时请求；不用每delta重绘整页；长列表key稳定、不将全部个人库取齐；动画仅transform/opacity且不会轮询接口。精选为精确Tab计数需要取齐发布目录，这是现有API的明确成本，记录响应字节/首屏/可交互时间；若真实运营规模出现瓶颈再提带计数的API，不先虚构字段。M001前端§16及产品未定义数值SLA，本期继续以无重复请求/无hydrate警告/可恢复状态及实测体积作为检查，不承诺未批准时限或未测“提升百分比”。

第一方analytics port仅接受固定PAGE和action联合，source剥离路径/query/账号，事件ID在一次真实导航时生成，状态重绘/locale不增加PV；有限同ID重试不阻塞学习。注册/生成/复习业务成功由后端事务记录，前端不再发一份“成功”。不写生产正文、答案、昵称、token或payload到日志/错误上报；客户端只可报安全code/request-id/白名单route类别。Clarity本期不自行启用第三方脚本；看板只读服务配置的安全项目入口；未来明确启用若不能确保SPA离开公开页后彻底停止采集，须先解决生命周期，不能只删除script标签假装卸载。API900运行指标不由浏览器公开调用。

<a id="delivery"></a>
## 12. 当前增量实施顺序、依赖与交接

以下 FE3-I01–06 为 UI26 对现有交付的增量，不重做已完成的 FE2-I00–06。原任务与旧方案从 [FE02 快照](evidence/M002-FE-02.tar.gz) 可恢复；本文此前章节保留仍有效的继承约束。开发角色为 frontend-claire，QA 为 qa-quinn，现有常设授权适用于已确认范围，不能把未修契约和未跑测试记录为通过。

| 任务 | 修改落点 | 完成条件 / 验证 |
|---|---|---|
| FE3-I01 同步设计源 | scripts/sync-design.mjs、use-design-copy、locales、theme/application CSS、design/source-manifest | 版本固定 UI26，逐键准确转换；清理被删键调用与覆盖新版的旧样式，不覆盖 UAT 修复；FE3-V01 |
| FE3-I02 统一下拉 | AppSelect、19处/9文件消费点；先普通台+后台预设代表表单，再推广其他7文件 | 值/默认/必填/禁用/错误/焦点保持，桌面/手机/模态上下文可用；FE3-V02/03 |
| FE3-I03 消息与首页/文案 | AppDialog扩展、NoticeReadingDialog、NoticeHost、SafeNoticeBody、notices/index与admin/notices | 独立正文滚动、固定标题动作、Markdown主题、880px列表无提醒标签、Why区域、内部文案清理；FE3-V04/05/08 |
| FE3-I04 共享选词 | WordPicker、词库搜索状态、GenerationWorkspace、admin/presets Fields/输入转换 | 普通词数与随机保留，后台数组草稿与无限制；后台按 BE04 共享词库搜索，权限契约已对齐；FE3-V06/09 |
| FE3-I05 同版词义 | PresetWordMeanings、explore、admin/presets 的预览快照 | 原词/释义完整，旧预览不随当前配置或 UI 语言变色/换词；FE3-V07 |
| FE3-I06 本轮联调验收 | existing tests/contracts、unit、Playwright、frontend-validation 和 QA 矩阵 | 当前新增9组与受影响继承检查有实际证据；明确API权限缺口解除、失败/未测/人工限制；无真实AI自动调用 |

不创建并行工作树/子代理。本轮作用到同一 CSS、copy 和共享控件，顺序实施便于局部还原后再推广；原正常业务逻辑和服务端权限不能因UI迁移消失。只读配置、日期控件、checkbox、账号动作菜单、复习输入不变成 AppSelect。

部署继续同源 Nuxt/Nginx/Go，后台凭据不进 public runtime config；.planning/设计夹具不进发布产物。无数据库迁移或新依赖部署前提。真实发布仍需其原授权，前端实施/QA授权不等于发布。首次生产构建后的资源版本与旧标签行为按已有方案。

<a id="ui26"></a>
## 13. UI26 详细接收映射

### 13.1 范围与来源

本节替代受影响的 UI22 原生单选、消息整体滚动、缺少预设释义和普通/后台各自选词的旧约定。所有精确文字、视觉数值及交互仍以 UI26 来源为准，不在技术方案改写；应用采用可组合 Vue 组件实现等价结果，不复制原型的全局 DOM 扫描/重绘适配器。

| UIA / 页面 | 原型区域 → 正式落点 | 应用模型 / API | 必要状态 / 验证 |
|---|---|---|---|
| UIA-PAGE-207-NOTICE23、LIST24、COPY25 / 207 | app.js noticeDialog/notices → NoticeReadingDialog、NoticeHost、pages/notices | NoticeModel/NoticeCollection；API205 | 长/短/切换/加载失败、标签删除、焦点返回；V04/05 |
| UIA-PAGE-209-MARKDOWN23 / 209 | markdown.js+theme .markdown → SafeNoticeBody、admin/notices预览 | 后端 safeBody/Preview；API207 | 共用阅读壳，宽表格/代码局部滚动；V04/05 |
| UIA-GLOBAL-SELECT23 / 所有选择页面 | select.js/.ww-select* → AppSelect | 现有字段模型和意图；各原API | 值、必填、disabled、空/长选项、模态；V02/03 |
| UIA-PAGE-212-MEANINGS23、UIA-PAGE-217-MEANINGS23 | word-meanings.js、presets/gallery → PresetWordMeanings | GenerationResultModel.targets，PresetModel.sample / AdminPresetModel.preview/published；API202/208 | 无预览、过期、重新预览、只改标题、UI语言变化；V07 |
| UIA-PAGE-205-WHY23 / 205 | app.js .home-why → pages/index | 固定 copy why.*，无新增API | 叠卡/学习路径之后，手机三项纵排；V08 |
| UIA-GLOBAL-COPY25 / 全部用户页 | UI25逐键清单 → sync-design.mjs、当前调用点 | copy与原动态变量 | 18视图、确认/失败、扣次/恢复/删除后果保留；V01/08 |
| UIA-PAGE-204-WORDS26 / 204 | word-picker.js #create-words → WordPicker+GenerationWorkspace | VocabularyResultModel、selectedEntries、GenerationOptionsModel；API004 | 普通计划cap、随机、生成冻结、连选与重试；V06/09 |
| UIA-PAGE-212-WORDS26 / 212 | word-picker.js #preset-words → WordPicker+admin/presets | PresetInputModel.configuration.entries；API004（BE04 V/L/A）、API202/208 | 独立草稿、无用户上限、发布失效/失败恢复；V06/07/09 |

### 13.2 AppSelect 单选控件

建议复用原型的原生 Popover 定位能力与现有 Vue 响应式/样式完成一个 AppSelect；不引入 headless/UI 套件，不在页面运行 prototype/select.js。这是现有栈内的组件边界调整，不是新增技术栈决定。props 提供稳定 fieldId、当前 value、带原始 value/label/disabled 的 options、disabled/required/invalid/describedby/name 及可访问字段名；只 emit update:modelValue/change，不取数据或决定权限。

原始字符串/枚举/null或空选项保持调用页语义，不能一律转成标签文字或自动首选。可见 combobox 负责标签/aria-expanded/controls/activedescendant、当前勾选与键盘；弹层仍处于所属 modal 的可访问子树，不能 Teleport 到 inert 的 body 兄弟节点。Popover 进入顶层、按上下空间翻转；窗口/祖先滚动与 visualViewport 变化重新测量，unmount关闭并清理监听。不能复制 prototype 的模块级 opened 状态到SSR共享对象；客户端同时打开管理限制只覆盖本 Nuxt 实例。

保留现有表单原生有效性：如使用原生 select 作为值/required代理，采用不可见但有效的表单控件，移出 Tab/读屏，invalid 阻止默认隐藏节点聚焦并将焦点移到可见触发器；禁止 hidden required + 无 invalid 处理造成无法聚焦错误。代理不是第二套应用状态，触发器与提交值由同一 modelValue 驱动。可见 label/id 与错误描述指向可操作控件。关闭/重绘后回焦原字段；Escape仅关选单，Tab正常前进、禁用项跳过；Home/End/前缀查找按UI23。选择确认才发change，导航高亮不提交。

生产替换清单：GenerationWorkspace 4、admin/presets 4、admin/ItemDefinitions 5、admin/TierEditor 1、admin/growth 1、admin/analytics 1、admin/users/[userId]/index 1、account/index 1、LocaleSwitch 1，共9文件19处。保留 item/plan/model稳定值、全选项与权限提示；readonly trial/detail不渲染伪禁用下拉。完整原始盘点在 inputs.json。

### 13.3 WordPicker 搜索、选择与请求归属

WordPicker 是展示/交互组件：接收 selectedEntries、candidates、query、searchStatus、disabled、可选 maxEntries、randomPending 和是否显示随机；emit query/add/remove/clear/retry/random 意图。控制 popup/highlight/组合输入/焦点，store 控制请求与选中数据。输入仍为 combobox，词签和候选使用完整规范 entry；**API004 只返回 entry 文本和 vocabulary_version，没有词条 ID**。稳定 key 使用规范 entry，绝不能据原型注释虚构 entry_id。

沿现有180ms搜索去抖；把取消/序号/会话epoch统一置于运行时词库搜索实例，普通和每个后台编辑器分别使用，不共用学习者的整套 generation state。保持 ports.searchVocabulary → strict schema → mapper → VocabularyResultModel；页面不调用$api。服务端返回顺序保留，不对10条结果重新排序或伪装全库；q为空立即清候选，失败保留已选。输入一变化就撤销旧请求/使旧结果不可选择，不能等180ms才让旧响应失效；卸载、换预设、退出/换账号同样失效。搜索是读操作，无本地/跨设备持久化、无自动生成/扣次。

普通 state 当前过滤 selectedEntries 的逻辑需去掉：已选候选仍显示勾选与picker.chosen并不可添加。add动作二次检查来自当前查询候选或成功随机结果、未重复、当前cap及非生成冻结；键盘Enter不允许任意输入、IME合成不提交。清空搜索取消请求但保留已选；添加成功清查询并回焦，移除聚焦邻近按钮/搜索。词条大小写去重用规范匹配，但保留服务端原始条目显示，不按空格/撇号/逗号拆分。随机仍使用现有接口、selectionRevision及会话校验，服务端排除当前库，UI满额禁用，不在客户端从夹具抽签。

后台 Fields.words 从 string 改为 string[]，blank为空数组、fields复制configuration.entries、input直接复制数组并校验非空/规范去重，移除join/split旧链路；无普通计划max_entries，也不调用ordinary options或随机API。字段保持按presetId的baseline/value/revision/record/remote，本地dirty比较和请求快照针对数组副本；词增减不清空title/model等字段。保存失败、409 reconcile、未知提交重读和手动发布原逻辑保持。后台按BE04接入既有词库请求，保留管理员会话；不得使用匿名身份绕过后台写权限。

### 13.4 预设词义与旧预览快照

复用纯渲染 PresetWordMeanings，接收完整有序 `{entry, entryMeaning}[]` 与该样本 meaningLanguage；dl逐条渲染普通文本。公开精选直接从同一 PresetModel 的 sample.targets 和 configuration.meaningLanguage 构成，无字典/AI请求、不随UI语言翻译。后台只在预览validated或已读取有效preview时构造视图快照 `{result, configuration, draftVersion}`；这都是已有应用值，不增加DTO字段。entries顺序取结果targets，每个entryMeaning来自同一结果。

在后台本地编辑期间保留 lastPreviewView，正文与词义同时从它显示，语言标签取其configuration，不能从正在编辑的Fields取。改变生成参数即显示preview.required、禁用发布；生成中保留旧快照，流式临时正文不能和旧词义组合为新结果；新validated再整体替换。可在单独流式区域展示已有流状态。标题独立编辑按原规则可复用预览，仍须保存及手动发布。

后端 presets.go 保存配置改变时不继承preview_id，读取preview=null符合现有合同。前端保存前捕获已有成功预览并仅保留在当前编辑器内存，保存后仍可展示带过期提示的旧样本；刷新后没有旧内存且无有效preview则显示既有“生成预览后查看释义”，不请求历史预览、不凭空重建或持久化旧稿。已发布配置仍从published独立快照读取。该方案同时满足当前编辑连续性和现有无历史预览API的边界。

### 13.5 消息阅读壳与Markdown

AppDialog保留唯一showModal/close、Escape/backdrop、opener回焦和feedback.modal生命周期，增加可选header插槽及消息布局修饰；默认布局维持其他确认/表单弹窗。NoticeReadingDialog在其内组合带实际消息标题的header、日期/位置、可滚动reading slot、footer操作；NoticeHost和后台消息预览共用它，避免只修登录弹窗。加载/失败用已有AppError，标题fallback使用已批准copy；内容切换后只把正文scrollTop重置，不重挂Toast或重设欢迎倒计时。

仅消息修饰类采用UI23 fixed header/footer + flex:1/min-height:0正文滚动，长标题换行，宽表格/代码自身横滚。保留欢迎10秒/两侧300ms、24px天数、顶部层与短屏避让，复用当前feedback状态；不能对整个dialog滚动，也不能对全部业务弹窗固定消息高度。用户列表按UI24/25居中限宽880px、日期/标题/箭头整行按钮，移除提醒类别标签但不改变排序/自动池/分页/手动入口。

SafeNoticeBody仍为唯一后端白名单HTML sink，用户和管理preview都使用API清洗结果，主题只是 .markdown 样式转换，不把prototype/markdown.js或Marked引入生产，也不扩大URL/图片/HTML语法白名单。该原型解析器不是生产安全边界，既有后端goldmark/bluemonday保持。

### 13.6 设计转换与本轮验收

sync-design.mjs当前硬编码UI22，实施时更新为UI26及准确manifest来源；转换前校验批准清单和输入摘要，仍按m002点号→双下划线映射。读取UI25 copy-audit.json准确替换/删除旧键；移除对应DOM而不是空字符串留白，不影响运营正文和危险操作后果。只提取获批固定样文/类型标签和受信图标，保留既有UAT修复的info等图标扩展；不得将原型用户/配额/模型数据或Marked许可整个复制为生产能力。theme从当前批准源转换，application.css中与新版区域冲突的旧覆盖要显式删除/收窄。

首页Why用why.*三项固定内容，位于叠卡/学习路径后方，保持首页简洁，无成长入口或新增数据请求。UI25移除原型inspect面板不能变成生产设置。已有SSR首屏沿原混合策略，新增互动只在mount绑定；保持locale切换、hydration和私有状态隔离。

| 当前验证ID | 对照与方法 | 完成边界 |
|---|---|---|
| FE3-V01 | UI26 copy static/templates→生产映射；实际运行文案/变量、删除键调用、两语言、样式覆盖检查 | 不只比较JSON；保留name/days/额度等动态值，版本清单一致 |
| FE3-V02 | AppSelect单选、未确认高亮、禁用/空/长选项、必填invalid、pointer/键盘/IME、模型值及异步选项更新 | label/ARIA/焦点正确，提交与原表单值一致，无无法聚焦错误 |
| FE3-V03 | 9文件19处替换盘点；弹窗/窄屏边缘翻转、嵌套滚动、语言切换、卸载/reduced-motion | 可见普通select无遗漏；日期/checkbox/动作菜单无误替换 |
| FE3-V04 | 中英1440×900/390×844/320×568短长消息，正文滚动前后header/footer rect、翻页scrollTop、欢迎并行与回焦 | 正文为主体、标题/按钮留视口，非消息弹窗回归；截图不代替实际滚动 |
| FE3-V05 | 用户消息/后台预览共用主题，标题列表引用/代码/表格/合法链接与净化恶意HTML样例 | SafeNoticeBody不接收原始Markdown；宽内容仅局部横滚，提醒标签不存在 |
| FE3-V06 | 两处大小写/前缀/多词/标点/duplicate/空/错误/连续添加/满额；正常点击及键盘 | 选择必须来自合法候选；普通cap随服务值，后台超过普通cap也可编辑 |
| FE3-V07 | 三种释义语言、切UI语言、配置改后旧预览/保存后/刷新无旧预览、失败/重新成功/标题-only | 原词和正文同快照，不增生成/翻译调用、不泄露未发布内容 |
| FE3-V08 | 首页优势位置、文案清理涉及18用户视图；复用未改页面既有测试，检查实际变更与依赖 | 1440/390/320无横溢和冗余空白，叠卡/精选动效不重做 |
| FE3-V09 | 独立fixture模拟搜索乱序/失败/退出/卸载/换预设；普通随机迟到；后台真实角色HTTP读取 | 旧响应不覆盖/误加；CR027管理员成功且无配额/AI副作用，预览发布原闸保持 |

实施测试使用既有Vitest/Playwright/mock-backend，不新建测试平台。预设fixture从API202/208的完整ValidatedResult取targets，返回与输入独立的字面响应；无假词义或专用UI字段。API004 mock按BE04 V/L/A契约，管理员真实HTTP与无业务副作用另由BE4-V01–03验证，不能用mock替代。具体目录与现有架构边界按前文。

本轮架构验证：复核批准UI26源、prototype/select.js/word-picker.js/word-meanings.js及相关app模块，逐处映射现有代码；复用UI26同字节的167+18项和4图、UI23–25原版本证据，不重跑未修改原型或应用单测。当前只做可恢复性/映射/文案/链接/源保护静态自检，结果见 [FE03检查](evidence/M002-FE-03-check.json)。这些证据不证明生产还原或实际API权限通过。

生产验收计划先结构/实际文本与状态，再对代表区域截图人工对照。预计最多6张代表构图用于新消息两端、两处选词、精选词义和首页；共享选择器几何/键盘优先结构信号，实际失败才追加。浏览器组合沿FE2-V14，已有充分同版本证据可复用；浏览器/真机/人工读屏未执行须明确记录，不用预算自动略过已批准必要验证。

未决与接续：本次FE04只复收BE04接口澄清，UI26映射/实现/验收定义保持；FE3-G01契约接收完成，CR027中的BE4-I01及运行验证继续保留。CR026由product-maya等待原问题答复，不阻塞已批准UI实现。本轮静态对齐证据见 [FE04检查](evidence/M002-FE-04-check.json)，前后源见 [快照清单](evidence/M002-FE-04-manifest.json)。随后按用户“下一步”及既有前端/QA授权办理实施交接，由backend-ethan定向修复limit，再由frontend-claire落实FE3-I01–06；不重复请求同一批准，实际测试结果不得预先判定。
