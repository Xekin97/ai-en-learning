---
milestone: M001
stage: technical-design
role: frontend-architect/base
agent_name: frontend-bob
status: awaiting_user_review
date: 2026-09-05
change_requests: [CR-029, CR-030, CR-031, CR-032]
contract_gap: CR-033
---

# CR-029–032 前端增量技术方案

## 1. 基线、结论与范围

本方案落实 [TRANSITION-M001-060 的设计批准](../reviews/uiux-design-cr031-cr032-revision.md)与[准确交互交付](../design/cr031-cr032-interaction-contract.md)。它优先于 `frontend.md` 中冲突的旧路由/引导说明；其余既有技术合同不变。本文件是待审技术方案，不代表实现或独立测试通过。

- 保留 DEC-030/031 的 Nuxt SSR、DTO → 转换 → 应用状态 → presenter → 视图；保留现有 Nuxt 4.5.2、Vue 3.5.42、pnpm 10.33.0、Node 24 和锁文件，不升级依赖。
- 推荐使用用户详情页的 query 表达只读弹窗；打开弹窗不卸载搜索和详情。认证引导改为语义目标映射与类型化返回意图。
- 不新增业务页面、内容写权限、AI 调用、持久缓存、UI 套件或部署组件。数据库、Go API、Nginx 和独立镜像方案沿用已批准基线。
- 新发现的额度缺口独立登记为 [CR-033](../changes/CR-033.md)：本轮无权补写后端契约，不能把样例“无限”当成真实用户数据。它不阻塞以下独立方案编写，但阻塞该字段的真实功能验收与无条件整体验收。

## 2. 追踪与现状差距

| 追踪 | 路由/视图 | API 与状态责任 | 修订 |
| --- | --- | --- | --- |
| CR-029；PAGE-001/007/009；CAP-001/003/005/017/021 | 首页、复习范围、账号 | API-001/003/008；原状态保留 | 首页 Review 文案、等高日期控件、注销辅助文字与 token |
| CR-030；PAGE-103；CAP-104/105/106/107/021 | 用户搜索与详情 | API-103 用户/批次；API-102 方案；独立搜索/详情状态 | 搜索保留、返回恢复、角色/方案、ISO 日期及精确文案 |
| CR-031；PAGE-103；CAP-107/021 | 详情上的只读阅读弹窗 | API-103 当前 userId + batchId；独立 reader 状态 | 布局、长文、并发隔离、关闭与键盘 |
| CR-032；PAGE-002/003/005–009；CAP-002/003/011/012/014/017/020/021 | 登录/注册与受限目标 | API-001/002；身份允许后才使用 API-003/007/008；claim 沿 API-006 | 统一目标、完整 i18n、角色优先、返回意图 |

数据追踪为 DATA-003/004/006/009/012/013/014/015/017/018；CR-033 只建议提供必要额度汇总，不提供 DATA-009 事件明细。

现状证据：

- `pages/admin/users/[userId]/index.vue` 无搜索表单；使用本地化日期、写死的学习者角色/不限额度；资料链接进入独立 `batches/[batchId].vue`。
- `runtime/stores/admin.ts` 的详情与只读请求使用全局 `status`；`userBatchDetails` 只按 batchId 索引，不能表达当前授权主体、用户和请求代次。
- `presentation/controllers/admin-user-search.ts` 已有查询、追加与位置恢复。其初始化会取数/聚焦，不能直接在详情页再调用一份以“复用搜索”，否则会覆盖既有上下文。
- `AuthGate.vue` 接收任意字符串 target；`application/auth/return-intent.ts` 接受过宽的路径前缀；`middleware/learner.ts` 会把详情/会话/账号访客直接送往登录。
- 登录当前让 redirect 优先于管理员默认地址；必须调整为角色优先。PAGE-008 的 loader 和 `ensureAttempt` 也必须移入已确认学习者分支。

## 3. 技术取舍

| 方向 | 收益与代价 | 结论 |
| --- | --- | --- |
| 仅本地 boolean 弹窗 | 改动少，但无法深链接、刷新或浏览器历史恢复 | 不选 |
| 详情 query 弹窗 | 父页面稳定、可寻址；需要显式历史与焦点规则 | 推荐；适合唯一只读覆盖层 |
| 重构嵌套路由/并行视图 | 可寻址，但需改造现有文件路由和父壳层 | 本轮收益不足 |
| 整站 CSR 或静态生成 | 改变既有 SSR/私有数据边界 | 不选；本轮没有推翻 DEC-030 的依据 |
| SSR 父详情 + 客户端 reader | 保留安全首屏与父上下文，长文不重复放入首访 payload | 推荐；深链接 reader 先呈现批准的加载态 |

继续使用 feature composable + `useState`，不引入 Pinia。继续使用原生 dialog：新增专用 `AdminBatchReaderDialog`，复用/提取现有 dialog 的生命周期能力，不把 reader 尺寸和样式套到所有确认框上。

路由历史采用 Vue Router 的 push/replace/back 语义，不手工覆盖其内部 history state；Nuxt 用户详情页面 key 仅随 userId 改变，不使用 fullPath。依据：[Vue Router 编程式导航](https://router.vuejs.org/guide/essentials/navigation.html)、[NuxtPage 的 pageKey](https://nuxt.com/docs/4.x/api/components/nuxt-page)。这是实施建议，须以当前锁定版本的浏览器测试验证。

## 4. 用户详情、搜索与弹窗寻址

### 4.1 规范地址

- 搜索结果：`/admin/users?q=<submittedQuery>`。
- 用户详情：`/admin/users/:userId?q=<submittedQuery>`。
- 阅读状态：`/admin/users/:userId?q=<submittedQuery>&batch=<batchId>`。
- 已实现的旧地址 `/admin/users/:userId/batches/:batchId` 仅保留受管理员鉴权的 replace 兼容入口，规范化到同一详情弹窗并保留合法 q；不再渲染另一套详情页。
- 旧技术文档中的 `/admin/users/:userId/library[/…]` 不是当前生产路由，本轮不增加这些别名。

query 通过 router 对象编码；q、userId、batchId 必须为单值并经对应输入解析，不接受数组或嵌套路径。q 沿用现有 API-103 搜索规则，ID 是不透明标识，不能假定 UUID 或从中推导所有权。

### 4.2 搜索与详情的归属

抽出纯 `AdminUserSearchForm`（draft、提交状态、语义 submit），由结果 controller 和详情 controller 分别装配。详情初始草稿来自当前安全 q/已提交查询，不触发新搜索或抢焦点。用户在详情提交新查询时导航回结果，调用已有搜索 action；查询变化按已有 epoch 重置结果与 opaque cursor，保留 CR-021/022 的排序、追加及失效恢复。

“Back to results”返回已提交查询，不把尚未提交的输入自动当查询。同一次客户端导航链保存已加载结果、分页位置、滚动与原用户行触发点；无可恢复集合的刷新/直接访问按 q 重取第一页，不伪造历史集合。搜索结果、详情与弹窗状态互不清空。

用户详情使用独立 `AdminUserDetailViewModel`：用户角色/方案由已校验应用模型投影，不能硬编码为学习者；管理员不能出现换组/重置其他管理员密码等未授权操作。创建日期复用 `adminDate` 的 `YYYY-MM-DD`，不改全站通用日期。搜索结果中既有 Guest/plan_code 映射保持不变，不能把 `plan_code=null` 的管理员误映射为 Guest。

### 4.3 历史、关闭与焦点

1. 从资料行打开：记录当前用户/批次触发点及滚动，router.push 增加 batch。父页面 key 不变；监听 batch 变化发起 reader action，不能重跑全部用户/搜索 loader。
2. 后退移除 batch 就关闭，前进重新打开同一个目标并重新校验权限。关闭按钮/Escape/遮罩统一发出 `closeReader`，不能独立维护与 URL 冲突的 open boolean。
3. controller 仅在内存中确定前一项确为本次 push 的同一父详情时使用 back；刷新、直接深链接、跨用户或来源未知时 replace 移除 batch，保留 userId/q。不能依据 `history.length > 1` 盲退到外站。
4. query-only 开关阅读器不触发父页面滚动到顶部；router scrollBehavior 对这些导航返回保留位置。离开页面仍按既有路由滚动策略处理。
5. 关闭后先释放滚动锁，再 nextTick/布局稳定后恢复父滚动并聚焦原 View 按钮，使用 preventScroll。按钮已不存在时回退 Library 标题；父用户已切换则由新页面负责焦点，不回到旧 DOM。
6. 打开时聚焦标题，Tab/Shift+Tab 困在模态内；body 区域可聚焦滚动。点击内容留白不关闭；清理监听和滚动锁涵盖关闭、导航、卸载、认证失效。

DOM、焦点引用、AbortController、滚动记录和 history 来源标记仅在客户端 controller/registry，不能存进 `useState` 或 payload。

## 5. 数据、状态与并发

### 5.1 已有契约到阅读视图

链路：`ApiPort.getUserBatch(userId, batchId)` → API-103 strict envelope → `mapBatchDetailDto` → 当前 reader 应用状态 → `presentAdminBatchReader` → 专用只读组件。

| VM 信息 | 已存在的应用来源 | 约束 |
| --- | --- | --- |
| 用户名 | API-103 用户详情映射结果 | userId 必须与当前请求匹配；详情失败不借用上一用户姓名 |
| 保存日期 | `BatchDetailModel.savedAt` | ISO 日期；未获得数据时省略，不能用“今天”占位 |
| 四项配置 | `configuration.modelName / meaningLanguage / scenario / length` | 枚举在 presenter 本地化；模型名称保留快照，不取后台实时名称或内部 ID |
| 正文/短文标签 | `passage / tags` | 纯文本、完整显示；标签只出现于短文，不移到词条 |
| 原始词条/释义/短语 | `targets[].entry / contextualMeaning / hintPhrase` | 显示完整资源；不在只读 reader 挖空，不增加词条标签 |
| 标题、状态、关闭/重试 | 固定 i18n 键与应用状态 | 不读取 Problem.detail 或拼接页面元数据 |

复用现有 batch schema/mapper，不新增 owner、quota 或供应商字段。API-103 的详情虽含 reviewSummary，reader VM 不额外增加未批准统计。正文允许保留段落换行，转换为稳定段落片段时必须可还原完整原文，不删句、不截断、不解释 HTML/Markdown。生成内容的 `lang` 从已保存释义目标映射；英文正文/词条/短语为 en，释义/标签不随 UI locale 翻译。

### 5.2 独立请求状态

拆分用户详情、其学习库列表、reader 与既有搜索状态；不让 reader.loading 把父详情或搜索结果换成全屏 skeleton。原用户库 API 的 pageInfo 不应在 adapter/store 被丢弃，保留已有读取能力；本轮不自作主张增加未经批准的分页交互。

reader 使用 `closed | loading | ready | failed | unavailable` 判别联合，只有 ready 持有当前 `BatchDetailModel`。一次仅保留当前批次，不建立跨会话持久缓存；旧的仅 batchId 索引 Map 不作为新 reader 数据源。

- 每次读取捕获 `sessionEpoch + userId + batchId + requestEpoch`；打开新目标/重试先进入无旧正文的 loading。
- 成功响应只在四项仍匹配且弹窗仍打开时接受；batch.id 还须与请求一致。客户端匹配不代替服务端用户/批次关联授权。
- 关闭、换用户、离开、退出或身份变化递增代次并取消请求；即使 transport 无法取消，迟到结果也必须被忽略，不能重新打开弹窗。
- 为只读 port 增加可选 AbortSignal 属于前端 transport 能力，不变更 HTTP API；沿 RequestInit 传入 fetch。AbortController 不进入应用状态。
- SSR store 每请求隔离；客户端 sessionEpoch 随认证主体变化重置。退出/重新登录时清除管理员搜索、详情和 reader 的私有快照及恢复上下文，不能只把 session actor 改成 visitor。
- `callOnce` 只用于确定身份后的首屏装配，不能把它当授权缓存。重新进入用户/会话需按当前身份加载；query-only 阅读开关不得重复加载父详情。

网络/服务失败映射 failed，同一目标可重试；不存在/无权映射相同 unavailable，不泄露对象存在或归属且无重试；401 先清理私有快照并进入既有认证失效流程。错误不覆盖父用户。契约校验失败不局部渲染、不向用户输出字段细节。

SSR 先完成 bootstrap 与管理员授权，再读取父用户及其库摘要。直接带 batch 的首访，reader 由客户端挂载后读取：SSR 输出无正文的批准加载提示；ClientOnly/稳定挂载容器保证 hydrate 一致，打开模态后背景 inert。禁止 SSR 先拼入旧正文再在客户端隐藏。API 与 HTML 继续 private/no-store。

## 6. 统一访客引导与认证返回

### 6.1 类型和唯一来源

`AuthTarget = review | library | story | account` 是应用导航语义，不是可翻译标题。纯 resolver 由已匹配路由生成 target 与有效返回路径；presenter 生成完整 `AuthGateViewModel`（标题、说明、eyebrow、双按钮标签/安全链接）。`AuthGate` 只渲染 VM，不再接收任意字符串、解析 query 或构造业务路径。

| 路由 | 目标 | 完整英文标题 |
| --- | --- | --- |
| `/review`、`/review/:sessionId` | review | Sign in to open Review |
| `/library` | library | Sign in to open Library |
| `/library/:batchId` | story | Sign in to view this story |
| `/account` | account | Sign in to manage your account |

中英文全部消息逐字取批准交互交付/i18n 的完整消息；不要复制原型 localize 的字符串替换机制。Header/首页/手机导航只发目标导航，不携带另一份 gate 标题。

页面 controller 用明确的身份状态分流：bootstrap loading/failed 不能等同 visitor；确认 visitor 才显示原地 gate；确认 learner 才运行私有 loader；admin 先进入 `/admin/models`。覆盖 PAGE-005–009，而非只改 Library/Review 首页。访客 HTML、payload 和网络均不能含私有摘要、日期表单、会话、attempt 或词条；切换 actor 时立即丢弃旧 VM。

### 6.2 安全 return intent

纯解析器只接受单值、站内已知 learner 路由：`/library`、`/library/:batchId`、`/review`、`/review/:sessionId`、`/account`。拒绝 scheme/host、协议相对地址、反斜线、控制字符、编码绕过、路径穿越、不支持子路径和多值 redirect。ID 按单个不透明安全路径段处理；不解析业务含义。输出 router 路由对象，不回传原始输入字符串。

本轮保留已实际使用的 `/review/:sessionId?batch=<batchId>` 上下文；该 query 只作来源提示，不能证明会话归属、覆盖服务端 mode 或创建新会话。其他筛选仅在有既有类型化 parser 的情况下保留；无实现依据的任意 query/hash 不继续传递。不要把技术文档“可有日期筛选”的示例变成新产品行为。

- redirect 只在当前认证路由 query 中保存，登录/注册互切和错误原样保留规范化意图；刷新重新解析。没有原目标时不出现继续提示。
- 不写 localStorage/sessionStorage 或通用持久 returnTo。转往首页、造文、另一主任务时不携带旧 redirect；后来普通登录不会复用它。
- locale 切换仅重算完整文案，不改变目标或重发请求。登录与注册均先完成既有账号语言初始化/同步，再作角色与返回决策；同步异常沿现有恢复策略处理。
- 成功优先级：管理员默认区 → 学习者有效 DATA-017 专用承接 → 学习者合法原意图 → 既有默认去向。管理员不得消费学习者 claim 或进入 learner redirect。
- claim token 仅在既有客户端临时 registry；URL 的 claim 标志不能证明资源仍在，刷新不恢复临时结果，也不能假报保存成功。
- 普通认证成功不自动保存或创建复习会话。有效 sessionId 重新鉴权后沿原恢复规则读取进度/建立当前 attempt；失效/无权显示既有安全状态，没有合法会话目标才回范围页。不能因恢复失败偷偷调用 createSession。

## 7. 样式、可访问性和文案边界

所有值来自已批准设计，不按现有错误 UI 生成新基线：

- 日期：范围页局部 grid 内相邻 field 不加顶部 margin；From/To 输入同为 44px，统一 box-sizing、字体与 native appearance。不得清除全站 `.field + .field` 的正常表单间距。
- 首页：只修学习者英文次按钮为 `Review`；保留批准中文和访客文案。
- 账号：`This can’t be undone.` 与 `Your stories, review history, and account will be deleted.`；副标题使用 ink-soft `#40585a`，danger-soft `#fae9e7` 背景，不改删除操作流程。
- 用户详情：`← Back to results`；日期前缀 `Joined `；Library 副标题 `View only`；资料按钮 `View`。中文亦按准确交付；不混用只读 badge/按钮文案。
- reader：桌面 max 896px、水平/垂直视口余量 48px；≤720px 余量 32px。标题/底部固定，body 单滚动；grid/flex 滚动子区必须 min-height:0、min-width:0。
- 标题 padding 桌面 20px 32px / 手机 16px 20px；body 内边距桌面 32px / 手机 24px；分区 32/24px；配置 4/2 列；词条资源 2/1 列；资源行上下 20px，释义/短语 8px。
- 正文 18px/1.9、max 68ch；段间及标签到正文 24px；自然长文不截断。长 token/model name/tags 用局部安全换行防容器溢出。
- 关闭 44×44px，页脚次级 Close 手机满宽；只读 badge、关闭按钮始终可见。加载/失败/不可用逐字复用设计消息及 live-region 语义。
- 保留字体、纸张背景和视觉层级。reader 样式限定专属 class，不污染 Add/Edit model、Replace key、换组、重置密码、注销和复习弹窗。原型状态控制器不进入产品。

## 8. 实现分解与责任文件

以下均交 `frontend-claire` 在技术方案批准后实施；新文件名为建议，遵守现有 alias/边界检测规则。

| 责任 | 落点 |
| --- | --- |
| 类型化意图/路由解析 | `application/auth/return-intent.ts`，对应纯函数测试 |
| 身份分流、auth 完成编排 | `presentation/controllers` 的受限页与认证 controller；`middleware/learner.ts`；PAGE-002/003/005–009 仅装配 |
| gate/去向 VM | `presentation/auth` presenter、`AuthGate.vue`、两个 locale 文件 |
| 详情 VM/搜索表单 | `presentation/controllers/admin-user-search.ts` 的安全共享部分、新详情 controller/presenter/纯表单；`pages/admin/users/[userId]/index.vue` |
| 读取生命周期 | `runtime/stores/admin.ts` 或独立 admin-user-detail store；`application/shared` port/状态；HTTP repository 的可选取消信号 |
| 弹窗 | 专用 reader presenter/component 与 client-only dialog lifecycle；旧 `batches/[batchId].vue` 改兼容导航 |
| 导航/清理 | 页面 key、router scrollBehavior、session 认证变化协调与恢复 registry |
| 局部 UI | `pages/index.vue`、`pages/review/index.vue`、`pages/account.vue`、`assets/css/application.css`；无关组件不重写 |
| 质量约束 | 单测、schema/mapper fixture、Nuxt SSR/路由、Playwright/axe；既有 import-boundary 规则不得放宽 |

顺序：纯状态/解析与 VM → reader 和详情组合 → 受限页与 auth 编排 → 精确 CSS/i18n → 浏览器验证。CR-033 的 DTO/mapper/展示适配必须等待后端正式契约，不在测试 mock 中先加猜测字段。

## 9. 验证交接

开发自检和独立测试必须分开记录。当前设计的 1781 项与 axe 报告只证明原型状态，不能抵扣生产测试。

| 层 | 必测证据 |
| --- | --- |
| 纯函数/VM | 四目标双语言逐字；安全路径正/负例；query.batch 保留；角色优先；管理员 plan=null；ISO 日期；正文转换可还原且不翻译材料 |
| state/并发 | A→B、跨用户同 batch 字符串、关闭后响应、关闭重开同目标、重试、logout/login；旧响应不覆盖新目标；父搜索/详情不因 reader.loading 消失 |
| 契约/边界 | API-103 raw fixtures 走 strict schema/mapper；两用户各两篇不同正文；详情 wrong id 拒绝；无 raw DTO/Problem/原始 model ID/私密令牌进入视图或日志 |
| SSR/权限 | 五种受限路径 visitor 无私有请求/payload；bootstrap 失败不假扮访客；管理员不能落 learner；reader 深链接首屏/hydrate、401 清理、多请求隔离 |
| 用户管理浏览器链路 | 搜索→多页结果→详情→再次搜索/返回；保留 q、集合、滚动、焦点；不同批次打开；close/ESC/backdrop/back/forward；直接/旧链接刷新安全关闭 |
| reader 视觉/键盘 | zh/en × 320/390/720/1280/1440；短/长/特长、多词条、多行标签；200% 缩放；只有 body 滚动；标题/底部不遮挡；Tab 循环与焦点返回；axe |
| 认证浏览器链路 | Header/首页/手机/直链一致；登录↔注册、错误、语言、刷新保留目标；离开认证清旧意图；合法/失效会话；无自动新建；claim 与角色优先 |
| 局部与非回归 | From/To 真实 computed height 均 44px；账号对比度/token/精确文案；首页 Review；既有模型/密钥/换组弹窗、搜索追加、review cloze、summary 无退化 |

视觉比较须以已批准原型同一身份/语言/状态/视口为参照，记录逐字文案、computed style、几何与截图；不能用“截图生成成功”或只比较颜色代替对齐。长文 fixture 是压力材料，不是真实模型效果证据。不得调用用户提供的旧模型密钥。

## 10. 未决项与移交条件

- 本方案推荐的 query-modal、分层状态与 typed auth intent 待用户批准；本轮不变更 stage/active_role。
- CR-029–032 保持 open，完成前端实现后须由 qa-quinn 独立复验再交 UAT。
- CR-033：用户详情“可用次数”没有现行 API 数据。已请求用户确认是否扩大到后端只读额度契约。若批准，由守门器有限激活 backend-alex 补契约，再由 frontend-bob 同步字段映射/fixture 后提交技术审阅；不重开无关数据库或产品设计。
- 如暂缓 CR-033，可以单独审阅/安排上述不依赖额度的修订，但不得关闭额度缺口、继续用“Unlimited”冒充真实值，或宣布用户详情功能完整通过。
- 本轮只做文档与代码的静态核对；没有运行开发测试，没有独立 QA 结果，没有修改生产代码或设计批准快照。
