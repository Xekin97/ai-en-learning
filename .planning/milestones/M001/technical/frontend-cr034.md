---
milestone: M001
stage: technical-design
role: frontend-architect/base
agent_name: frontend-bob
status: awaiting_user_review
date: 2026-09-06
scope_authorization: TRANSITION-M001-067
change_requests: [CR-034, CR-032, CR-031]
---

# CR-034 前端日期范围状态与 CR-032 颜色基线同步

## 1. 结论与批准边界

CONFIRMED：[067 设计批准](../reviews/uiux-design-cr034-approval.md)授权最小前端技术同步；[准确设计合同](../design/cr034-interaction-contract.md)、[日期原型模块](../design/prototype/review-range.js)、[主题](../design/theme.css)、[UI 交接](../handoffs/uiux.md)为本轮真源。原始交付中的待审文字已由 067 批准，不重新选择空态方案。

PROPOSED：把 PAGE-007 的 setup 从现有 review 会话/答题 store 中分离为小型应用状态模块、Nuxt store 和 controller/presenter；保留日期表单 DOM，预览结果只更新旁侧计数与下方反馈。沿用 Nuxt SSR、TypeScript、Vite、useState、已有 schema/mapper/repository，不升级依赖、不加状态库或日期库。

API v1.4 不变：[API-008](./api/index.md)已有预览、独立日期会话发现和创建/复用接口。后端/数据库/部署批准沿用；不新增全库统计、日期快捷项、URL 筛选、新持久化或自动创建。CR-029–034 均继续 open，本方案待审，未实施或独立测试。

产品依据：[PAGE-007](../product/pages/index.md)、[CAP-017/020/021](../product/abilities.md)、[DATA-012/014/015/018](../product/data-assets.md)、[DEC-014](../decisions/DEC-014.md)、[DEC-024](../decisions/DEC-024.md)、[DEC-030](../decisions/DEC-030.md)、[DEC-031](../decisions/DEC-031.md)、[DEC-033](../decisions/DEC-033.md)、[DEC-034](../decisions/DEC-034.md)。

## 2. 静态现状与取舍

以下是源码核对，不是运行复现：

| 现有落点（相对 frontend/） | 缺口 / 本轮处理 |
| --- | --- |
| app/pages/review/index.vue | preview.empty 切换整个日期 section；独立 ref 复制草稿、页面定时器和创建跳转散落。改为 controller VM/intent，学习者分支内表单常驻 |
| app/runtime/stores/review.ts | preview 只有 AbortController + session epoch，无范围/请求代次；setRange 不立即废弃旧结果。提取 setup，保留原答题引擎 |
| 同一 store 的 loadSetup | Promise.all 把 active-range 与 preview 错误耦合；mounted 又预览一次。拆开两种请求状态与初始化入口 |
| 同一 store 的初始化 | SSR 以服务端 Date 生成日期，浏览器只改 timezone。改为浏览器首次初始化本地草稿；服务端不猜本地日界 |
| 同一 store 的 createRangeSession | 缺少 action 级当前预览校验和同步提交锁，安全上下文刷新后不复核范围。新 setup command 承担此保护 |
| i18n/locales/en-US.json | PAGE-007 start 为 Start review，恢复标题为 Continue your last review；空态借用通用 Library/Create 操作。按批准原型使用范围专用消息 |
| app/presentation/admin/admin-user-detail-presenter.ts | reader.retry 引用 common.retry，中文为“再试一次”。只换 reader 专用键 |
| app/assets/css/theme.css | faint 已为 #596c6b；不再改色或整份覆盖主题，按批准覆盖做回归 |

可行方向：A 在原 review store 继续增加并列字段，文件少，但 setup 错误/加载容易污染题目进度；B 提取 setup 小模块，增加少量文件，却能单独测试请求顺序、SSR 和页面 VM。推荐 B，因当前静态引用检索表明 loadSetup/setRange/preview/initializeTimezone/createRangeSession 的业务调用方仅 PAGE-007。不是重写 review 引擎或整个状态体系。

## 3. 追踪、数据转换与视图

| 业务与页面 | 远端契约 | 应用状态 | 渲染 / 动作 |
| --- | --- | --- | --- |
| PAGE-007 / CAP-017 / DATA-012 | GET review-range/preview | 绑定范围的 PreviewState | 日期、计数、空/错反馈、start intent |
| PAGE-007/008 / CAP-020 / DATA-014/015 | GET review-sessions/active-range | 独立 ResumeState | 已有进度、resume intent；不创建会话 |
| PAGE-007 → PAGE-008 / CAP-017/020 | POST review-sessions | CreateState + 已转换创建 outcome | 仅成功后按服务器 sessionId 跳转 |
| 五类访客页 / CAP-021 / DATA-018 | 既有 bootstrap 安全投影 | 既有 learner access / auth intent | AuthGate 不变；不请求私有预览 |
| PAGE-103 / CR-031 | API-103 reader 模型不变 | 既有 reader failure | 专用 retry 文案；其他弹窗不变 |

API 路径均以 /api/v1/me 为前缀，schema/mapper 不改版：

- 预览严格输入仍只有 batch_count、entry_count、empty，经 mapReviewRangePreviewDto 转为 batchCount、entryCount、empty；envelope.meta 不进入页面。
- active-range 的 session=null 明确映射“无会话”，非失败；非空通过 mapActiveRangeDto 得到 sessionId/dateRange/progress，不读取题目或答案。
- 创建请求仍为 mode=range + start_date/end_date/timezone；createReviewSession adapter 负责 snake_case。结果仍用现有 ReviewSessionCreatedModel，reused=true 时采用服务器旧会话，不用新范围覆盖其 dateRange/进度。
- 本地 rangeKey、requestRevision、visit lease 是前端并发元数据，不是 API 字段，不写到请求体、不要求服务器回显。
- 新 presenter 只接应用状态与 t/数字格式化函数，输出文字、可见状态、字段错误、countText、canStart、resumeTarget 等 VM；组件不接 DTO、Problem 或自行判断 count/日期是否允许创建。
- 无“预览批次列表”接口；不为渲染计数调用 library 拉取全库、按页累加或在前端洗牌。
- Problem → AppFailure 继续经过 adapter。通用 mapper 目前保留 fields 的服务器字段键；如消费日期字段错误，须在 review 应用适配边界映射为 startDate/endDate/timezone 语义，页面不得读 start_date 或 error.code。

## 4. 状态归属

新增 application/review/range-setup.ts 的纯类型/校验/selector/action factory；runtime/stores/review-setup.ts 持有 request-scoped usePrivateState("review-setup")，不存 Date/Promise/DOM/AbortController。

| 状态 | 形状与不变量 |
| --- | --- |
| draft | startDate/endDate 是 YYYY-MM-DD 或编辑中的空串；timezone 为 IANA 字符串或未初始化 null；initialized 区分尚未读浏览器环境与用户清空 |
| preview | tagged union：idle / invalid / loading / ready / empty / failed。仅 ready/empty 分支有 result 与对应 query；其他分支计数为未知，不存可用旧结果 |
| validation | missing-or-invalid 与 reversed；invalidFields 指出哪一端关联错误。严格日历校验，不能只有正则或字符串比较 |
| resume | idle/loading/ready/failed 与 ActiveRangeModel 或 null；独立 AppFailure，不被预览失败或改日期清空 |
| create | idle/submitting/failed，独立 failure；不复用答题 store.status；提交期间 canStart=false |

请求 query 为不可变的 startDate/endDate/timezone 副本；rangeKey 从这三项规范化编码。ready/empty 中 accepted query 必须等于当前 draft；同时还要验证请求代次，不能仅用 key，否则 A→B→A 会接纳首个 A 的迟到结果。

同一客户端会话内离开再回 PAGE-007 保留草稿，重新读恢复投影并预览，不沿用旧 ready 的可点击状态。刷新/新会话重新按本地最近 7 天初始化；不新增 cookie、localStorage、sessionStorage 或 URL 日期。普通语言切换只重算 presenter，不改草稿、不重新请求、不改变 AI 内容语言。

现有 review.ts 的 session、attempt、singleBatchSources、拓扑校验、重开已完成会话等继续保留。移走 setup 独有字段/方法前用引用检索核验调用方；PAGE-008 仍自行 GET 安全会话并在客户端请求 attempt，setup 不把预览计数伪装成会话进度。

## 5. 请求顺序与生命周期

PROPOSED：AbortController 负责节省请求，单调代次 + query + 会话 epoch + 当前访问 lease 负责正确性。

1. controller 在 setup 同步注册清理钩子并取得访问 lease，再执行异步初始化。组件只发 changeStart/changeEnd，不自行 setTimeout。
2. 每次实际日期值变化立即写入唯一草稿、递增 preview revision、取消旧计时器/预览并废弃旧 accepted result；此操作不能延迟到 debounce 结束。
3. 未完整或非法时进入 invalid，不请求。开始=结束合法；反向关联结束字段；缺失/无效关联对应字段，保持原值。
4. 合法时立即进入 loading/未知计数，再由运行时 action coordinator 等待现有 250ms debounce 后发送 GET；这是请求合并策略，不是产品 SLA，也不照搬原型 350ms 演示。
5. 请求捕获 {epoch, lease, revision, query}；只有全部仍匹配、未离页且仍是学习者才应用 success/catch/finally。取消与已过期异常静默丢弃，旧 finally 也不能清除新请求 busy。
6. 重试预览只使用当前合法草稿，立即发新 GET，捕获新代次；失败变为 AppFailure + approved error VM，不冒泡未处理 Promise。
7. 改日期不影响 resume；resume 自有请求 revision 和 epoch/lease 检查。active-range API 没有 signal 参数也可用代次阻止迟到写入，无需为此扩展服务端或端口。
8. 离页、退出、换账号或转管理员撤销当前 lease、计时器和预览；resetPrivateStates 清除私有状态。清理只撤销自己持有的 lease，不能由旧页面卸载取消 Nuxt 新页面已开始的任务。
9. 协调器为每个 Nuxt app 的唯一实例，可用 WeakMap<NuxtApp, Coordinator> 存纯运行时资源；不可模块级保存共享用户状态。重复调用 store 不得各自产生互不认识的请求代次。SSR 请求结束的实例不能复用给别的用户。
10. 所有页面 event、mounted/watch 启动的 Promise 都经 action 捕获，controller 处理 typed outcome，不使用 fire-and-forget 漏出错误。

采用显式 intent 在输入事件同步失效；若用 watch，必须保证该失效在可点击旧按钮前发生。组件内 watcher 要在同步 setup 创建并注册清理；Vue 官方说明异步创建 watcher 不会自动绑定组件生命周期，旧请求副作用需清理。[Vue Watchers](https://vuejs.org/guide/essentials/watchers.html#side-effect-cleanup)

## 6. SSR、浏览器日期与认证

- 保留 Nuxt SSR：服务端读取 bootstrap，学习者只取 active-range 的安全映射；表单壳、标签、未知计数及加载状态可 SSR。未知浏览器时区时不请求范围预览、不展示服务器最近 7 天为用户日期。
- 初始化 useState 的 draft 为未初始化；SSR 与首次 hydration 使用同一中性值，不渲染必填错误。mounted 后在同一次浏览器环境读取中取得当前本地日和 Intl IANA timezone，计算包含今天的 7 个日历日并写入，再 GET preview。按日历减 6 天，不减固定 144 小时，覆盖 DST/跨月/跨年。
- 这是 PAGE-007 数据加载时点的最小修订，不全局关 SSR，也不使用 ClientOnly 隐藏整个页面；数据未知阶段复用已批准加载态。没有新增服务端时区猜测或浏览器偏好存储。
- 如客户端时区取不到有效值，保持非可提交错误状态，可重试初始化；不静默当 UTC（浏览器明确报告 UTC 时合法）。服务端 IANA 接受范围仍由既有 422 契约决定，不加前端时区下拉。
- 保留 useLearnerAccess 的访客原地引导、失败边界和管理员分流。guest 不执行 setup 私有 loader、不序列化数量/会话；认证失败清私有状态，迟到结果不得把引导替换为 learner 内容。
- SSR 初始化的 active-range 使用现有 usePageLoader/callOnce 去重；hydration 不重复其 GET，范围首次 GET 单独在浏览器初始化后触发。客户端路由进入、同页从访客变学习者各初始化一次；loader 和 mounted 共享 lease/initialized 标志，不能各自启动一套预览。
- 初始化 / epoch watch / lifecycle 钩子在 controller 同步建立；后续 app.runWithContext 调用 action，不在任意 await 后新建生命周期钩子。callOnce 不包裹用户改日期、重试或创建，只用于对应导航/epoch 的初始只读加载。
- resume 成功与 preview 失败可并存；resume 失败不阻止独立预览，使用既有 AppError/重试反馈且不显示“无会话”。纯 preview 改动不重新获取 resume。
- Nuxt app 级状态按请求隔离，仅应用快照进入 payload，临时令牌仍使用既有内存 vault。useState 的 SSR/hydration 与序列化约束见 [Nuxt State Management](https://nuxt.com/docs/4.x/getting-started/state-management)，初始化去重见 [Nuxt callOnce](https://nuxt.com/docs/4.x/api/utils/call-once)。

## 7. 创建、恢复与失败

- canStart 由 selector 派生：学习者、浏览器日期已初始化且合法、preview=ready、accepted query 等于草稿、无提交锁。组件 disabled 和 command 入口复用同一判断。
- 点击后同步取得单次提交锁并捕获 query/epoch/lease/revision；refreshSecurityContext 完成后重新检查权限、query 和 accepted result。此处验证“仍由本次命令持有锁”，不能直接调用包含“没有提交锁”条件的 canStart 把自己拒绝。期间用户改日期则取消发送 POST，不为旧/新范围擅自开始。日期仍可编辑。
- POST 已发出后允许继续编辑日期，但请求体固定为点击时的 query；若当前页面/账号仍匹配，成功导航到服务器确认的 sessionId，不能用新草稿改写该会话。离页/换账号后的成功不得跳转或写入新主体；服务端可能已经创建的会话下次由 active-range 发现。
- 两次快速点击/Enter 只发一次 POST。收到 reused=true 时接受服务器既有日期会话，不能把它视为错误、重新随机或覆盖范围。不得绕过唯一未完成日期会话规则。
- 预览与创建之间内容可能被删除/取消参与；预览不是事务预留。服务端拒绝时保留草稿、显示既有规范化 command 错误并重新预览；不能单凭 422 推断一定为空，或自行写入 0。无成功响应就不跳 PAGE-008。
- 网络丢失导致 POST 结果未知：不自动重放，GET active-range 对账；可确认存在则显示已有恢复入口，不擅自自动进入复习；查不到/GET 失败不宣称未创建。后续只有用户明确操作才再发命令，依服务器唯一约束复用。
- resume 动作只导航已验证的 activeRange.sessionId，不调用创建接口；当前新范围 invalid/empty/failed/loading 不禁用已有恢复。随后 GET session 若过期/删除，沿既有 PAGE-008 错误处理。
- 创建/恢复不取完整学习批次答案，不改变 PAGE-008 的题目拓扑、随机顺序、保存粒度和模式对应总结。

## 8. 组件、样式、文案与可访问性

ReviewRangeSetup.vue 为纯展示组件，接收 ReviewSetupViewModel，emit 日期修改/预览重试/开始/恢复；controller 持 DOM refs 和导航，presentation/review/review-setup-presenter.ts 负责整条本地化消息。

- LearnerPageBoundary 内保持同一个日期 form 和输入节点；不得以 preview 状态或 locale 给表单设置动态 key。反馈区单独条件渲染，结果卡始终在位；guest 切换才卸载私有内容。
- 控件不使用 v-if ready，日期不以两个本地 ref 再复制 store。输入 value 与 intent 单向绑定同一草稿；空串保留。输入控件的浏览器内部日历外观不要求跨引擎逐像素一致。
- 精确采用原型 range-editor/range-count/range-feedback/range-resume 布局规则：两个日期 44px 同宽，局部 field margin=0；桌面 320px 计数卡、24px gap；≤1080px 紧凑 96px 结果条，数值 40px；≤560px 单列日期/16px gap、全宽操作、空态24px内边距。
- 新响应式选择器需胜过现有 count-card min-height:15rem；不能仅复制早于旧通用规则的低优先级声明。仅迁移范围相关规则，不整份替换 theme.css 或损伤既有 CR-010 修复。
- permanent labels、required、aria-invalid、aria-describedby 由 VM 映射到准确错误字段；未知计数显示 —，不是 0。单独 polite/atomic status 区播报，不把整个表单放 live region。
- 重试按钮发出 intent 前若仍聚焦，controller 把焦点放开始日期再移除重试节点；成功/失败响应不抢走用户已移开的焦点。语言切换保留草稿/preview，并保持焦点在语言选择器。
- 空态键盘顺序 View library → Keep learning；加载/错误/无效时按钮不可提交且有文字解释；视觉与 DOM 顺序一致。

文案以批准合同第 4 节和原型模块 copy 为准，新增范围键建议放 review.range.*，不要复用会影响其他页面的 common 键：

| 用途 | 中文 | English |
| --- | --- | --- |
| 开始 | 开始复习 | Review |
| 恢复标题 | 继续上次日期复习 | Continue your date review |
| 恢复动作 | 继续日期复习 | Continue date review |
| 空态次操作 | 查看学习记录 | View library |
| 空态主操作 | 继续学习 | Keep learning |
| 加载 | 正在查找短文… | Finding stories… |
| 缺失/非法日期 | 请选择开始和结束日期。 | Choose a start and end date. |
| 反向日期 | 结束日期不能早于开始日期。 | The end date can’t be before the start date. |
| 无效结果提示 | 请检查日期 | Check the dates |
| 失败标题 | 暂时无法加载复习内容 | Couldn’t load your review |
| 失败说明 | 日期已保留，请重试。 | Your dates are kept. Please try again. |
| 预览重试 / reader 专用重试 | 重试 | Try again |

空态标题/说明、范围标题/副标题保留合同原文；恢复进度的 current/total 来自 active-range，不抄原型的 2/5。词数按 1 word / N words，ready 播报按 1 story / N stories；使用完整消息，不拼接产品内部术语。

CR-032：生产 faint 已是 #596c6b，所有继承用途与五类 guest h1 对齐，不局部硬编码。访客正文与注销副标题仍 ink-soft #40585a，注销 danger-soft #fae9e7；范围空态 h2 为 ink-soft。对比度在实际背景/状态重测，不用设计静态比值宣称全站 AA。

CR-031：新增 reader.retry 的中文“重试”/英文 Try again 并调整 reader presenter；common.retry 保持原值，不改其他页面错误操作。无需重新设计 reader。

## 9. 实施文件与责任

全部由后续 frontend-claire 承接；以下“新增”尚不存在，本轮不创建生产文件。

| 文件（相对 frontend/） | 责任 |
| --- | --- |
| 新 app/application/review/range-setup.ts | 状态类型/factory、日期校验、query key、canStart 与异步 action 的可测试依赖注入 |
| 新 app/runtime/stores/review-setup.ts | 私有可序列化状态、唯一 coordinator、API/epoch/clock 注入、清理 |
| 新 app/presentation/controllers/review-setup.ts | access/SSR 初始化、浏览器环境、访问 lease、VM、DOM focus 与导航 |
| 新 app/presentation/review/review-setup-presenter.ts | 专用状态文字/错误/计数/恢复 VM；不取数 |
| 新 app/presentation/components/review/ReviewRangeSetup.vue | 稳定日期节点、结果/反馈、键盘和 ARIA |
| app/pages/review/index.vue、app/runtime/stores/review.ts | 页面接 controller；仅移除已迁出的 setup 成员，不改答题逻辑 |
| app/assets/css/application.css、i18n/locales/zh-CN.json、en-US.json | 范围局部样式、准确双语键；主题 token 只核对 |
| app/presentation/admin/admin-user-detail-presenter.ts | reader 专用 retry 键 |
| tests/unit/ 与 tests/e2e/ | 新范围状态/presenter/组件测试、raw preview/active/create fixtures、真实 UI 操作回归 |

现有 infrastructure schemas/mappers/repository/port 可直接复用，无新依赖或 HTTP 字段。如实现时发现契约不能表达已批准交互，应反馈，不用宽松 schema 或 Mock 私加字段绕过。

## 10. 验证矩阵（待实现与独立测试执行）

状态测试可以注入 application port，但不能替代 raw fixture → 真实 schema/mapper → store → presenter 的合同测试。既有 mock-backend 的 preview 是固定数据，不证明日期筛选正确；本轮开发需让受控数据按真实 query 变化，并使用独立真实后端夹具复验。

| 编号 | 场景 / 输入 | 必须证明 |
| --- | --- | --- |
| FR01 | API-008 preview ready/empty；active null/存在；create 201/200 reused | 严格 envelope/字段映射；负数、小数、缺字段、多字段、empty 矛盾被拒；无 DTO/Problem 进入 VM |
| FR02 | 只有旧记录：初始7天为空 → 改日期命中；有→无→有 | 日期 DOM 节点、值和焦点不丢；显示准确数量，始终可以改回 |
| FR03 | 真空库 / 全部暂不参与 / 当前范围不命中 | 三套独立夹具；均不假称全库没学过，不请求全库或创建空会话 |
| FR04 | 缺开始/结束、反向、同日、非法日期、闰年 | 无效无 GET/POST；同日与两边界包含；错误关联正确；未知非0 |
| FR05 | A慢→B快、A→B→A、取消不被底层执行 | 最后 revision/query 生效；旧 success/catch/finally 无写入；输入后 debounce 前按钮已禁用 |
| FR06 | preview 500/网络/契约失败→重试；失败时已有 resume | 草稿保留、准确错误/重试、恢复独立；0 仅来自合法成功；无未处理拒绝 |
| FR07 | pending预览/恢复/安全刷新/创建后离页、退出、换账号、旧页卸载晚于新页 | 无串数据、无迟到跳转；定时器取消；旧 disposer 不取消新 lease；guest 无私有数量 |
| FR08 | 单次开始、双击、刷新安全上下文时改日期、POST发送后改日期 | guard 前后复核；最多一次 POST；发送前变更不提交，发送后以捕获 query 和服务端会话为准 |
| FR09 | 创建前内容删除/取消参与、reused、POST已提交但丢响应 | 不把预览当承诺；不自动重放 POST；GET 对账恢复；不自行判断422为空 |
| FR10 | 本地/服务器跨日、Asia/Shanghai、America/Los_Angeles DST、闰日、UTC | 浏览器最近7个日历日；SSR未知不调用错误时区preview；hydration无不一致，CSR/同页重新登录只预览一次 |
| FR11 | 有日期会话+单篇会话，新范围empty/invalid/loading/failed | 旧进度保持，可恢复；范围创建复用规则不变；PAGE-008 两类总结不退化 |
| FR12 | zh/en × 320/390/720/1280/1440；补1080/1081与560/561边界 | 控件44px等宽、日期/卡片间距、紧凑条非240px、手机按钮全宽、无溢出；真实截图与computed对照 |
| FR13 | 键盘填写/清空、重试、切语言、Tab、实际200%缩放 | 焦点不丢、节点不替换、播报明确、触控尺寸；axe serious/critical；真机/读屏未执行须明确保留 |
| FR14 | Header/首页/手机/直接链接进入5类受限页及认证往返 | 统一guest消息/品牌/目标；失败可恢复；登录成功不自动创建；权限请求和payload隔离 |
| FR15 | 页面开始/恢复/空态/日期错误/1与多词；reader中文500错误 | 逐字与批准原型一致；专用retry不影响common；locale切换不重发preview |
| FR16 | faint所有继承用途、五类guest h1、注销、范围empty h2 | 对照批准token及实际背景；保留ink-soft例外；不得改QA期待绕过差异 |
| FR17 | 真实隔离Go+DB：保存早期/边界/未参与批次，实际preview/start/resume | 选择、计数、会话归属/复用、两类会话与随机顺序由真实后端确认；不使用PAGE-008固定样例假充端到端 |
| FR18 | 首页/Library统计/六类管理状态、详情搜索与只读弹窗、模型/组配置、复习作答 | CR-029–033 已通过分项不退化，尤其用户列表/详情不能只测一页 |

开发验证：状态/mapper/VM 单元、边界lint、类型检查与构建；Playwright 基于 raw HTTP fixtures，不只 VM stub。qa-quinn 独立复验核心 API/浏览器连续操作、文案/几何/实际日期数据和权限；可引用开发单元报告但不得计为自己重跑。QA 使用本轮批准稿快照，保留原FAIL/BASELINE_VARIANCE记录，不倒改旧证据。

## 11. 部署、交接与自检边界

- 无 schema migration、后端合同变化或新依赖；仍是 frontend 独立镜像，入口 nginx / 未来 Ingress 路由不变。API v1.4 配套后端是既有前提，本轮只需前端替换，不回退为旧额度 DTO。
- 单应用按 frontend/ build context 构建，Nuxt node-server/no-store/同源 Cookie 不变；不得从 .planning 复制原型到生产镜像。保留上一前端镜像供回滚，但旧版含已知CR-034缺陷，回滚不等于可交UAT。
- 部署与实际6001更新留待实现、独立测试和相应授权；当前不启动/重启服务、不调用AI、不修改UAT数据。旧标签页刷新策略沿用既有发布方案，不声称自动热升级。
- 本次仅文档/源码静态对照与文件完整性检查，详情见[技术自检](./frontend-cr034-validation.md)。设计自检1163/0与48/0仅引用，不作为本轮开发或QA成绩。
- OPEN：用户审阅本次最小前端同步；没有发现必须新开产品/UI/API/数据库决策的阻塞。若批准，建议守门器交 frontend-claire 有限实施，之后 qa-quinn 独立测试。
- 工作流仍 technical-design / frontend-bob / active；交付建议 awaiting_user_review。本角色不写 state/registry/history，不迁移阶段，不提前关闭CR。
