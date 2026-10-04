---
milestone: M002
stage: uiux-design
role: uiux/base
agent_name: designer-tony
status: awaiting_user_review
version: M002-UI-27
design_version: M002-UI-27
approval: pending_new_visual_review
date: 2026-10-01
---

## UI27 本轮搜词加载态修订

本轮用户要求优化Searching状态，其他UI26内容沿065批准和后续已验实现继承。仅PAGE204/PAGE212 WORDS26加载/空/错提示样式，UIA-WORD-LOADING27：一行50px最小高度，16px主题色环形加载标识和准确picker.loading文案，紧凑内边距；样式来源theme.css末尾UI27段、原型word-picker.js状态区域。原型state=word-loading表示已等待的慢请求。

正式应用保留180ms搜索防抖；从最近一次查询变化开始250ms后仍加载才展示等待行，及时结果直接显示候选，避免闪烁。只延迟视觉提示，不延迟网络请求，不保留可误选旧结果；输入aria-busy反映实际加载，Escape/清空/离开清理提示。spinner仅慢加载存在，800ms旋转；prefers-reduced-motion时静止，文字语义保留。错误/空态不额外等待，可重试。窄屏跟随原候选宽度，不增加页面常驻高度。

文案未修改，API/业务/词库范围不变。frontend-claire按当前用户请求和持续前端授权实现，新增视觉供本轮交付核对，不伪称用户已逐图验收。CR028另含预览搜索fixture修复；CR026不变。旧UI26原件见evidence/search-loading27/before.tar.gz及原UI26冻结包。



## UI28 / CR026 消息一次提醒

PAGE209/CAP210/DATA205：在现有“显示”“提醒”之后增加`remind.once`复选开关，默认未选，始终可编辑；下方`remind.once.help`仅后台展示。复用`.actions .check`自动换行、现有字号/焦点/保存反馈，不新增动画、消息标签或布局。PAGE207自动提醒按账号与消息本地记录筛选，实际进入正文弹窗后记录；手动阅读和后台预览不记，队列前后切换保留已显示项。原型`?page=messages&lang=zh`；同会话保存后登录情景可演示，`account`查询参数仅作为原型的模拟账号。正式认证/跨会话持久化由实现验收。

UIA-PAGE-209-ONCE28：1440/390中英开关顺序/准确文案、键盘可用/不横溢、保存保留；UIA-PAGE-207-ONCE28：A/B分别计数、首次/再登录、未展示项、手动阅读和关闭后的状态。产品确认来源D2-88，用户原要求及本轮明确回答授权局部修订；不冒用UI26整份视觉批准。

# M001 → M002 与 UI22 → UI26 前端设计差异明细

## UI25 → UI26 选词交互

本次用户明确要求优化普通工作台及后台预设选词。当前 UI26 待审，继承 UI25 及旧版仍有效的业务；旧原生候选框/独立添加按钮和后台逗号字符串输入不再作为新设计依据。

| 区域 / 验收 | 正式实现定位 | 新设计与接入要求 |
|---|---|---|
| 普通工作台 / UIA-PAGE-204-WORDS26 | [GenerationWorkspace.vue](../../../../frontend/app/presentation/components/GenerationWorkspace.vue) | 共享词签与搜索候选；点选/Enter 加入、移除、清空查询、上下键/Escape/Tab、重复标记、上限及剩余量、随机入口。有效计划、生成过程禁用及随机排除当前库的原逻辑保持。 |
| 后台预设 / UIA-PAGE-212-WORDS26 | [presets.vue](../../../../frontend/app/pages/admin/presets.vue) | 替换逗号输入与 split 处理，采用完整已选词集合和同一候选组件。没有普通计划词数限制；改词先保留其他表单值，并使预览签名过期，旧线上样本不变。 |
| 只读试用 | 同上 GenerationWorkspace 的 trial 模式 | 保留只读词签与实际数量，不显示搜索、随机、移除和普通上限。 |

设计源 [word-picker.js](./prototype/word-picker.js)、app.js/presets.js 接线、copy.json 的 picker.* 及 theme.css 的 `.word-picker* / .word-token`。前端按既有 Vue 状态/组件体系转换，不复制 prototype DOM 重绘或内存数据。搜索复用已有词库接口/数据访问层、保留服务端前缀优先和稳定词条标识，按完整条目去重；多词和标点不拆分、不制造任意词条。原型 fixture 小词表不等于正式词库，也不能据此新增前端全量下载要求。异步搜索的取消/过期响应、错误/重试和请求节流延续既有技术方案。

本次不增加选词时词义接口；预设释义仍来自成功预览并与正文同快照。沿用当前数据合同与服务端权限/上限校验，组件 UI 禁用不取代最终校验。需同步 [交互](./interactions.md)、[响应式](./responsive-accessibility.md)、[准确文案](./copy.json) 和 [验证](./validation.md)。未改正式应用，不能将原型验收写为生产 QA。

## UI24 → UI25 文案清理 / D2-89

继承的 UI25 是待审视觉修订，来源 [064](../reviews/copy-design-064.md)；CR026 一次提醒未决范围不进入本轮实现。前端后续接收应同步 copy.json 的逐键替换和少量节点移除，详见 [完整中英文清单](./evidence/ui25/copy-audit.json)。

| 场景 | 旧表达 / 呈现 | 新表达 / 呈现 |
|---|---|---|
| 用户消息列表 | 登录提醒标签 | 删除；日期、标题、箭头和原排序保留，后台开关保留 |
| 精选及试用 | 预设配置、上一个预设、配置失效、锁定徽标/已选上限 | 生成设置、上一篇短文、暂时无法生成并返回精选；删除锁定徽标，仅显示当前单词数量 |
| 书架与复习 | 命中数量、批次、日期范围会话、全空提交 | 可复习短文、篇、日期复习进度、全部跳过次数；统计值不变 |
| 复习页说明 | 计数旁的排除规则、完成后重复副标题 | 删除这两个冗余区域；日期包含范围、答案恢复/丢失后果保留 |
| 道具与账号 | 下架积分、模型授权、登录会话失效 | 明确退积分数和体验结束、其他设备需重新登录；必要权益后果保留 |
| 原型工具 | 默认显示 PAGE/版本/场景 | 仅 `inspect=1` 开启；不属于正式产品组件 |

正式定位：[消息](../../../../frontend/app/pages/notices.vue)、[复习](../../../../frontend/app/pages/review/index.vue)、[精选](../../../../frontend/app/pages/explore.vue) 及已有文案转换来源。以当前设计入口与实际组件映射为准，不复制审阅工具，也不把管理员配置文案一起删除。无 API/数据/业务条件变更。

## UI23 → UI24 消息列表增量

仅 PAGE-207 列表重构：旧标题大版心 + 靠左限宽列表 → 标题和列表一起居中限宽880px。列表为单一纸面与分隔行，日期/标题/箭头有稳定对齐，手机切为日期上置。沿用 UI23 消息正文弹窗、Markdown、下拉框、预设释义与首页介绍。新增定位 UIA-PAGE-207-LIST24，源为 notices() / `.notices-page`；不增加API、字段、摘要或未读语义。改稿已应用到可运行原型，浏览器验证见 [验证记录](./validation.md)。正式前端已有定位为 [notices.vue](../../../../frontend/app/pages/notices.vue)：迁移布局时保留现有取数、可见性、排序、消息弹窗与焦点返回。


## 使用范围与来源

交付给 frontend-bob（前端方案）与 frontend-claire（前端实现）。用户此前已验收 **M002-UI-22**，见 [正式验收记录](../reviews/uiux-design.md)。当前 UI26 继承 [CR025](../changes/CR-025.md) 五项追加设计并优化消息列表，尚待视觉验收；下方保留跨期映射，并以本节的增量规则替换受影响旧约定。

- 一期以 [M001 交接](../../M001/handoffs/uiux.md)、[交互](../../M001/design/interactions.md)、[响应式](../../M001/design/responsive-accessibility.md)、[页面追踪](../../M001/design/traceability.md) 和 [主题](../../M001/design/theme.css) 为来源。PAGE-007 还须读 [CR034 最终交互](../../M001/design/cr034-interaction-contract.md)，用户只读详情与注销须读 [CR031/032](../../M001/design/cr031-cr032-interaction-contract.md)。这些文件内历史的“待审”不表示重新打开 M001。
- 二期以 [当前完整产品](../product/overview.md#inheritance)、[设计规格](./design-spec.md)、[交互](./interactions.md)、[响应式](./responsive-accessibility.md)、[文案](./copy.json)、[主题](./theme.css)、[追踪](./traceability.json) 为准；已批准原件见 [UI22 清单](./evidence/M002-UI-22-manifest.json)。本表是差异索引，不能覆盖这些详细规则。
- 下列工程文件是**已有实现定位**，不是要求沿用旧 DOM/CSS 或预先决定新路由。`?page=…` 是可运行设计原型入口；新增生产 URL、组件拆分、状态与 API 适配由 frontend-bob 在技术方案落定。
- 12 个 M001 PAGE 均有去向；M002 为 **25 个 PAGE、28 个原型视图**。PAGE-208 包含 models/plans，PAGE-215 包含 bag/shop，PAGE-103 包含 users/userdetail，不能按 PAGE 数量误删其中一个视图。

## UI22 → UI23 追加变更 / CR025

| 变更 | 正式应用已有定位 | 按本版设计修改 / 必须保留 |
|---|---|---|
| 消息阅读固定区与滚动 | [NoticeHost](../../../../frontend/app/presentation/components/NoticeHost.vue)、[AppDialog](../../../../frontend/app/presentation/components/AppDialog.vue) | 为消息增加专用阅读布局：标题/日期/当前位置 + 正文滚动 + 固定动作；不能将所有业务弹窗强制固定 740px。保持登录提醒池、前后消息、关闭、焦点、欢迎十秒/淡入淡出/顶层避让。UIA-PAGE-207-NOTICE23。 |
| Markdown 主题 | [SafeNoticeBody](../../../../frontend/app/presentation/components/SafeNoticeBody.vue)、[后台消息](../../../../frontend/app/pages/admin/notices.vue) | 用户内容和管理预览共用受作用域限制的 `.markdown` 视觉规则；正式 HTML 继续来自现有服务，不导入原型 Marked 或扩大富文本白名单。UIA-PAGE-209-MARKDOWN23。 |
| 预设词语释义 | [精选](../../../../frontend/app/pages/explore.vue)、[预设管理](../../../../frontend/app/pages/admin/presets.vue)、[映射](../../../../frontend/app/infrastructure/http/mappers/presets-mapper.ts) | 从既有 sample/preview GenerationResult 学习资源映射原始选词与释义；正文和释义快照一致，语言取预设配置。空预览与过期预览分别显示，保留发布闸与试用流程。UIA-PAGE-212-MEANINGS23、UIA-PAGE-217-MEANINGS23。 |
| 统一选择器 | 下表 9 文件 / 19 处 | 用框架组件统一视觉和键盘；保持 value、change、禁用、表单校验、合法选项/默认值及重绘焦点。原型 DOM 适配器只演示交互，不规定生产实现。UIA-GLOBAL-SELECT23。 |
| 首页优势 | [首页](../../../../frontend/app/pages/index.vue) | 叠卡/学习路径后加 why.* 三项介绍；不改既有导航、动效、入口，不许用任意 Prompt/其他文章输出语言替换现有能力表述。UIA-PAGE-205-WHY23。 |

| 全站生产原生 select 盘点（本轮只读） | 数量 |
|---|---:|
| [growth.vue](../../../../frontend/app/pages/admin/growth.vue) | 1 |
| [analytics.vue](../../../../frontend/app/pages/admin/analytics.vue) | 1 |
| [presets.vue](../../../../frontend/app/pages/admin/presets.vue) | 4 |
| [index.vue](../../../../frontend/app/pages/admin/users/[userId]/index.vue) | 1 |
| [index.vue](../../../../frontend/app/pages/account/index.vue) | 1 |
| [GenerationWorkspace.vue](../../../../frontend/app/presentation/components/GenerationWorkspace.vue) | 4 |
| [LocaleSwitch.vue](../../../../frontend/app/presentation/components/LocaleSwitch.vue) | 1 |
| [TierEditor.vue](../../../../frontend/app/presentation/components/admin/TierEditor.vue) | 1 |
| [ItemDefinitions.vue](../../../../frontend/app/presentation/components/admin/ItemDefinitions.vue) | 5 |

触发器、选单、弹窗嵌套、长标签/多选项、空选项、禁用、重绘焦点与键盘规则见 [交互](./interactions.md) 和 [响应式](./responsive-accessibility.md)。这些定位不包括复选框集合、多选权益组、日期选择器、头像动作菜单及只读生成配置，不能因本轮统一选择器而改掉其业务语义。页面语言选择同样采用新组件。

设计新源：prototype/select.js、markdown.js、word-meanings.js；现有 app.js/admin.js/gallery.js/presets.js；copy.json、theme.css。Marked 仅作为本地设计资产附许可证；生产依赖选择由 frontend-bob 接收评估。无新增 API/DB 字段要求。当前尚未做生产实现或新设计验收，前端常设授权不等于这份新增视觉已获用户接受。

## 一期页面如何继承

“重构”表示按当前设计更换呈现/流程，不表示删除该页原有业务。表中所有保留项还受当前产品权限及数据生命周期约束。

| 一期 → 二期 / 处理 | 已有前端入口 | 二期设计与原型入口 | 需要完成的差异及保留项 |
|---|---|---|---|
| PAGE-001 → **PAGE-205** / 首页重构 | [index.vue](../../../../frontend/app/pages/index.vue) | app.js home、home-motion.js；`?page=home`；HOME10 / CARD13 / MOTION14 | 抽象词条编织图改为两篇完整单段叠放短文、每篇多词签；保留简洁价值与学习入口。两卡有轻浮/切换，阅读后停止；运营预设放“精选”，首页不放学习成长入口。 |
| PAGE-002 → **PAGE-002** / 注册保留、排版调整 | [register.vue](../../../../frontend/app/pages/register.vue) | identity.js；`?page=register`；COPY09 | 对齐后的认证双栏与手机单栏，采用当前产品文案。保留原账号字段、校验、当前未收录结果提示与一次性承接，不新增邮箱/社交登录。 |
| PAGE-003 → **PAGE-003** / 登录保留、增加登录后反馈 | [login.vue](../../../../frontend/app/pages/login.vue) | identity.js、app.js toast；`?page=login`；COPY09 / TOAST19 | 保留通用凭据错误、角色分流、返回原意图。成功欢迎 Toast 与开启提醒的消息正文弹窗并行；具体时序见 FDE-07。管理员改入后台概览。 |
| PAGE-004 → **PAGE-204** / 普通造文台重构 | [create.vue](../../../../frontend/app/pages/create.vue) | app.js generation(false) / creationConfiguration；`?page=create`；SETTINGS16 | 选择卡改紧凑选择器（UI23 统一组件）、模型重点区与图标信息行；增加随机添加一个词；Story/Brief 默认选中，模型/释义语言仍需选择；配置栏按断点展开收起。保留候选选择、上限、生成冻结、流式/取消/失败/完整校验及认证收录。 |
| PAGE-005 → **PAGE-005** / “书架”重构 | [library/index.vue](../../../../frontend/app/pages/library/index.vue) | learning.js library/libraryRow；`?page=library`；LIBRARY18 | 六项统计、搜索、条目与操作更紧凑；书页图形只作装饰。保留旧到新、只搜目标词、全库统计不随搜索改变、加载更多、日期复习及单篇入口。自定义标题下保留原词，详情返回恢复查询/已加载范围/位置/焦点。 |
| PAGE-006 → **PAGE-006** / 详情增强 | [library/[batchId].vue](../../../../frontend/app/pages/library/[batchId].vue) | learning.js detail/titleRegion；`?page=batch&batch=b1`；PAGE-006-02/03/04 / SETTINGS22 | 新增本人编辑标题，默认仍按原词顺序连接；右侧配置用工具台同款只读摘要。保留完整正文、标签、词语短语、生成快照、复习次数、参与/复习/删除操作；模型下架不替换历史值。 |
| PAGE-007 → **PAGE-007** / 日期准备保留 | [review/index.vue](../../../../frontend/app/pages/review/index.vue)、[ReviewRangeSetup](../../../../frontend/app/presentation/components/review/ReviewRangeSetup.vue) | learning.js range；`?page=range`；PAGE-007-01 | 保留最近七天、日期可持续修改、零命中/加载/错误及恢复入口。未提交草稿改为恢复确认；另开范围确认替换，但不覆盖单篇会话。按二期断点/版式还原，不能退回一期早期 900px 的错误日期卡断点。 |
| PAGE-008 → **PAGE-008 + PAGE-201/202/203** / 会话保留、答题流程替换 | [review/[sessionId].vue](../../../../frontend/app/pages/review/[sessionId].vue) | learning.js；`?page=review` / `overview` / `summary` / `sessiondone` | PAGE-008 仍负责会话与本轮结束；填写→可随时修改的概览→提交后答案总结拆成不同视图。旧“必须正确才能继续”“全程不显示答案”“离开丢当前批次答案”由二期规则替代。日期/本篇两种来源及各自返回路径保留，详见 FDE-04。 |
| PAGE-009 → **PAGE-206** / 账号页迁入共享个人空间 | [account.vue](../../../../frontend/app/pages/account/index.vue) | app.js accountShell、identity.js profile；`?page=profile`；ACCOUNT17 | 新增昵称/性别/登录及学习信息，账号安全改为紧凑操作行。原改密、退出、注销及危险确认不能漏；原账号页的职责迁入“个人信息”，不是被删除。 |
| PAGE-101 → **PAGE-208 / models** / 模型管理增强 | [admin/models.vue](../../../../frontend/app/pages/admin/models.vue) | admin.js；`?page=models`；PAGE-208-01 | 保留密钥配置/脱敏/替换、模型名称/说明/原始 ID、启停、引用等完整管理，新增移除模型及影响确认。不得用简化展示卡替代编辑表单。 |
| PAGE-102 → **PAGE-208 / plans** / 计划管理增强 | [admin/plans.vue](../../../../frontend/app/pages/admin/plans.vue) | admin.js；`?page=plans`；PAGE-208-01 | 独立菜单，四个固定基础计划的模型/长度/词数/零或不限额度等配置全量保留；新增唯一档位优先级供体验卡比较。任意多档是成长配置能力，不据此增加或删除基础计划。 |
| PAGE-103 → **PAGE-103** / 用户管理扩展 | [users/index.vue](../../../../frontend/app/pages/admin/users/index.vue)、[user detail](../../../../frontend/app/pages/admin/users/[userId]/index.vue)、[AdminBatchReaderDialog](../../../../frontend/app/presentation/components/AdminBatchReaderDialog.vue) | admin.js；`?page=users` / `userdetail`；PAGE-103-01/02 | 保留搜索前/多结果/空/失败/续载、选用户再进详情、返回保留搜索、改计划、重置密码和只读学习库。增加资料、等级/积分及流水等区域；管理员仍不能编辑用户标题或代做学习。 |

## 二期新增页面与前端落点

新增视图共用既有认证、壳层和后端授权规则，不能把原型的 `role` 参数当成权限控制。尚无对应生产页面的区域，在前端技术方案中安排路由和组件。

| 二期 PAGE / 原型视图 | 一期对应 | 设计模块与关键显示 | 前端接收要点 |
|---|---|---|---|
| **PAGE-201** `?page=review` | 原 PAGE-008 作答 | learning.js；分字母单词输入、短文按位置填写 | 替换旧即时判对推进；分字母只用于原词阶段，短文空仍不按答案长度伸缩。 |
| **PAGE-202** `?page=overview` | 无独立概览 | learning.js；所有单词填写结果＋填回短文的答案＋提交 | 任意步骤可进入；提交前不标正误，点选返回准确题目，修改后回概览。 |
| **PAGE-203** `?page=summary` | 原无答案总结 | learning.js；正确/错误/未答及下一批/完成/重来 | 正确仅一次，错答删除线＋正确拼写；结果仅本次临时展示，不建设历史答卷或最近一次结果页。 |
| **PAGE-207** `?page=notices` | 无 | app.js notices / dialog；消息列表与正文 | Header 入口、提醒优先/时间倒序；登录自动弹提醒正文，非自动打开列表；无未读数/读状态。 |
| **PAGE-214** `?page=growth` | 无 | growth.js＋accountShell；等级/经验、积分、签到、成就和升级奖 | 成就与升级奖手动整份领取，签到自动；当前档可展开其他档；称号只在个人中心，不做佩戴。 |
| **PAGE-215** `?page=bag` / `?page=shop` | 无 | app.js bag、benefits.js；道具卡及兑换中心两个视图 | 共用资料左栏；卡按四类呈现效果、期限、可用/被覆盖/下架原因，兑换和使用分别确认。 |
| **PAGE-216** `?page=trial` | 普通造文台不含锁定预设模式 | app.js generation(true) / trialConfiguration | 进入不生成；已发布配置不可编辑，点开始后才生成且扣当前身份次数；结果沿原认证收录流程。 |
| **PAGE-217** `?page=explore` | 无 | gallery.js；“精选”释义语言 Tab、完整预设/配置、横向轮播 | 预设完整正文及全部目标词可读；点“我也试试”进入正确发布对象；自动中断与键盘规则见 FDE-08。 |
| **PAGE-218** `?page=adminhome` | 一期明确没有仪表盘 | admin.js home；八模块入口与指标摘要 | 管理员登录默认页；与用户首页分壳，概览不另造一套指标口径。 |
| **PAGE-209** `?page=messages` | 无 | app.js messages；消息列表、Markdown 编辑/预览、显示/提醒开关 | 消息管理是独立一级模块，两个开关不能合并；正文与学习内容不混用。 |
| **PAGE-210** `?page=operations` | 无 | operations.js；签到、等级、成就、道具配置 | 多档动态表单，新增/编辑/上下架及奖励引用；四类卡不同字段，不能让模型卡配置次数权益。 |
| **PAGE-211** `?page=credits` | 原用户详情无积分运营 | admin.js points；用户详情积分与来源流水 | 归属用户管理，独立 credits 是兼容原型视图，不增第九个后台一级菜单；正数补发与对象确认，无扣分/撤销入口。 |
| **PAGE-212** `?page=presets` | 无 | presets.js；预设编辑、管理员预览、草稿与发布 | 单标题、无说明；支持全部平台配置，不受访客选词上限；参数变更重做有效预览，手动发布才更新前台。 |
| **PAGE-213** `?page=metrics` | 无 | app.js metrics/metricDetails；流量、漏斗、留存、活跃与生成 | 无样本、观察中、未知、延迟与数字 0 分开；管理员预览用量单独计量，Clarity 范围遵循当前产品。 |

## 组件、样式和交互差异

### FDE-01 壳层、导航和页面高度

一期用户主导航为“开始学习 / 复习 / 学习记录”，手机版使用导航对话框；二期为“首页 / 精选 / 学习 / 复习 / 书架”（Home/Picks/Learn/Review/Library），当前 Header 与窄屏横向导航按原型实现。不要把旧导航对话框的截图/固定几何当作二期验收基线。头像菜单固定四项“个人信息 / 账号成长 / 道具卡 / 兑换中心”，平台消息另有入口；学习成长不放一级菜单。

已有定位：[AppHeader](../../../../frontend/app/presentation/components/AppHeader.vue)、[default layout](../../../../frontend/app/layouts/default.vue)、[admin layout](../../../../frontend/app/layouts/admin.vue)、[LocaleSwitch](../../../../frontend/app/presentation/components/LocaleSwitch.vue)。管理员从一期三入口变为**概览、数据分析、模型管理、计划管理、用户管理、成长运营、消息管理、首页预设**八模块。模型/计划虽然同属 PAGE-208，仍为两个独立菜单；消息也保持独立。

版心从 1216px 扩到最多 1440px。压缩无意义的大边距、重复说明和强制占屏高度，保留阅读行长、表单对齐与触控尺寸；不要仅改 max-width 后沿用全部旧页布局。

### FDE-02 Token、图标和双语文案

| 角色 | M001 来源值/实现 | M002 来源值/处理 |
|---|---|---|
| 页面底色 | `--color-canvas: #f4efe5` | `--canvas: #f8f6ef` |
| 纸面 | `--color-surface: #fffdf8` | `--paper: #fffef9` |
| 主文字 / 弱文字 | `#152b2e` / faint `#596c6b` | `--ink: #193d36` / `--muted: #5f6d65`；按新背景复验对比度，旧数值报告不能证明新版组合通过 |
| 品牌/主动作 | `--color-brand: #1e7464` | `--green: #21654e`，深绿 `#154b3b`，词签使用浅绿/浅杏 |
| 版心 | `--container: 76rem`（1216px） | `--container: 1440px` |
| 主断点 | 720 / 1080，造文旧 900px 例外 | 当前 760 / 1100，具体区域以响应式文档和 CSS 为准，不机械全局替换数值 |
| 通用动效 | 140 / 220ms | `--fast: 140ms`、`--motion: 240ms`；Toast 独立 `--toast-fade: 300ms` |
| 阅读相关命名 | `--reading` 是 **68ch 阅读宽度** | `--reading` 是 **衬线字体栈**；同名不同语义，不能直接混入旧样式 |
| 图标资源 | 现有 BrandMark / AppIcon | 本地 Iconify Lucide 资源与映射，复用 48 个 SVG，许可随附；品牌仍用已设计的品牌标识 |
| 固定文案 | 原型 i18n.js、生产 zh-CN/en-US JSON | 设计唯一源为 copy.json 的 static/templates；前端按既有本地化结构转换，保留准确文本和变量语义 |

接收定位：[生产主题](../../../../frontend/app/assets/css/theme.css)、[页面 CSS](../../../../frontend/app/assets/css/application.css)、[AppIcon](../../../../frontend/app/presentation/components/AppIcon.vue)、[中文资源](../../../../frontend/i18n/locales/zh-CN.json)、[英文资源](../../../../frontend/i18n/locales/en-US.json)，对照 [二期图标及许可](./prototype/assets/README.md)、[icons.js](./prototype/icons.js)。不使用 ∿ 等字符代替图标；SVG 装饰不进入 Tab 顺序。字体、主色、图标和卡片语言一起更新，避免两期样式叠加。

界面语言与生成内容语言继续独立；切换语言保留当前任务和草稿，品牌一次只出现一种语言名，私人标题/预设标题不随语言切换。文案要使用产品表达，不把 PAGE/CAP/API、权限实现或原型审阅面板复制进正式界面。

### FDE-03 造文、试用和详情配置共享视觉，区分可编辑性

普通台用 `.creation-settings / .creation-model / .creation-options`，四项统一选择器（UI23）；>1100px 默认展开，≤1100px 默认收起，已展开和当前焦点在重绘中保持。场景默认 Story、长度合法时默认 Brief；这是对一期四项全空的明确替代。随机每次添加一个候选，排除当前已选及当前复习库已收录词，不能拿“累计已掌握”集合静默换判定。

试用台 `.trial-settings` 和详情 `.batch-settings` 共用只读模型卡/定义列表；详情数据取历史快照，试用数据取已发布预设，普通台数据取允许的当前配置。不要把三个来源混成同一份当前计划设置，也不要给只读摘要套假的禁用 select。未被当前枚举识别的历史值原样显示。

工具台额度只保留有效位置，删除重复 Available 文案。完整输出、取消/失败/校验、收录及未保存离开确认仍必须来自当前产品与真实状态，不能复制原型计时器或固定样文作为实现。已有定位：[generation reducer](../../../../frontend/app/application/generation/reducer.ts)、[selection](../../../../frontend/app/application/generation/selection.ts)。

### FDE-04 复习需要更换流程和状态表达

| 环节 | 一期 | 二期必须实现 |
|---|---|---|
| 原词题 | 一个整体输入、释义优先 | 拼写字母槽→释义→可展开短语；自动前进、退格回退、左右键、粘贴分配；多词和标点分组，手机不裁切长词 |
| 下一步 | 错误需继续改，短文全部正确才完成 | 原词任意非空即可继续；短文至少一空非空即可继续；空白走跳过，不在推进时判正确性 |
| 返回修改 | 原逐步流程 | 上一步、概览回题、修改后回概览均保留已填答案；概览任何步骤可达 |
| 提交前 | 不给正确答案 | 延续不泄露答案，概览仅用户填写值，不提前红绿判分；标题可能含答案，答题期间不显示 |
| 提交后 | 总结也禁止显示答案 | 当前批次总结明确对错；错误原值删除线，旁边正确值；短文每处填回并标注，未答单独显示 |
| 中断 | 只保留已完成批次，当前答案不保存 | 保留未提交草稿和固定顺序；再次进入先恢复确认，关闭确认不等于重开或完成 |
| 结果保留 | 一期复习结果模型 | 二期提交后清草稿，临时总结离开不再回看；只保留必要完成/成功事实，不保存最近答案明细 |
| 重来/下一批 | 原会话收尾 | 重来清空当前批次、形成新尝试；多批次下一批，末批完成；不撤销已经获得的累计成长 |

保留本篇与日期范围两种上下文，按词条原形与每处实际词形分别比较，按 occurrence 独立填空；同源关系匿名、颜色加符号/纹理、聚焦联动，短文空宽不按答案长度变化。**字母槽的字数提示是原词题的新要求，不能推广到短文挖空。**

接收定位：[review store](../../../../frontend/app/runtime/stores/review.ts)、[PassageClozeQuestion](../../../../frontend/app/presentation/components/review/PassageClozeQuestion.vue)、[cloze presenter](../../../../frontend/app/presentation/review/passage-cloze-presenter.ts)、[group style registry](../../../../frontend/app/presentation/review/cloze-group-style-registry.ts)、[summary presenter](../../../../frontend/app/presentation/review/review-summary-presenter.ts)。这些是需评估替换的旧行为入口；不要只换 CSS 后继续使用旧正确性拦截和“永不显示答案”的断言。

提交忙碌需防重复，失败保留输入；响应丢失不能重复结算/发奖。原型的 response-lost 演示不能证明服务端幂等。新草稿、最小结算事实和接口适配由技术角色定义，不将 sessionStorage 模拟复制为生产方案。

### FDE-05 书架、标题、日期与原账号安全必须保留

书架六项全库统计不等于成长里的累计掌握词数；查询不改全库统计，排序仍旧到新，目标词搜索不扩展到标题/正文/标签。参与开关只影响新建日期范围，即使暂停也能复习本篇。返回详情后恢复搜索/续载/焦点；删除需确认，保留累计生成及二期成长事实。

私人标题编辑适用于所有本人新旧批次；默认 `词条 · 词条`，本人编辑空白拒绝、失败保留输入、成功列表同步；不改正文/释义/配置，不回写预设，也不允许管理员代编辑。不存在/已删除/无权仍统一安全反馈。

日期编辑在加载/失败/零命中时不能消失；未知数量显示“—”而非 0；既有范围恢复与新范围预览并存，日期与单篇会话互不覆盖。现有 [review setup controller](../../../../frontend/app/presentation/controllers/review-setup.ts) 和 [range-setup](../../../../frontend/app/application/review/range-setup.ts) 的恢复职责不能因新答题页被遗漏。

认证承接、改密保留当前会话/退出其他会话、普通退出和永久注销仍按当前产品工作；管理员重置密码、只读学习内容也必须继承。新增个人页不能使这些功能在导航里失踪。

### FDE-06 个人中心、成长与道具是新增完整流程

四个视图共用 `.account-layout / .account-sidebar`，左侧身份、基础/生效计划、上次登录/学习及四入口；右侧各自为资料表单、成长、道具库存、兑换。手机资料区前置并保留四项导航。成长与称号只在个人中心，无佩戴、头像上传、社交主页或每日/每周任务。

成长页区分经验/等级与可消费积分；生成签到自动到账，成就/升级奖手动领取，达成与领取是两个状态。奖励中卡不可用时整份暂不可领，积分/经验也不先发；已解锁事实仍保留。等级/成就多档可展开，领取后焦点与展开状态保持。

道具、兑换中心分开呈现四类卡：补签、额外次数、模型体验、计划体验。展示启用期限与生效结束时间、不可用原因及确认后结果。模型体验按模型分别累计时长，不提供次数；计划按优先级拒绝低覆盖、确认高覆盖、同档续期。完全被当前计划覆盖的模型卡给明确提示。下架导致全部模型不可用时允许手动按**当前下架积分**退换，不能用购买价/等价积分，也不能默认为自动退回。

涉及金额/积分、授权时长、库存、次数的实际可用性和结算来自服务端；设计数值都是示例。签到/学习日使用北京时间 04:00，不能将这个日界线误用为生成滚动额度或覆盖卡的既定到期规则，见 [产品时间与权益边界](../product/overview.md)。

### FDE-07 欢迎 Toast 与消息弹窗

欢迎内容使用昵称（空则用户名）与距上次**有效学习**的学习日差，不取上次登录。当前批准效果为 **300ms 淡入→完整可读 10 秒→300ms 淡出**，间隔数字与单位 24px/700；普通保存/失败提示中间停留五秒。`welcome` 的 elapsed 来自 `welcome.elapsed`，不可把用户昵称拼成 HTML。

消息提醒立即按既有登录触发打开正文，Toast 显示在 modal/backdrop 之上且不抢焦点。短屏给消息操作留空间；翻页、关闭/重开不重播 Toast，不重置时限；新反馈才替换。退出等实际动画完成，不能用先启动的固定计时器截断淡出。减少动效时即时显示/隐藏。

Header 消息入口打开列表；登录自动打开**开启提醒的正文弹窗**，多条可翻页。隐藏优先于提醒，列表提醒优先再按时间倒序，不做个人消息、已读/未读状态或红点。原型顶层实现可作为视觉参考，正式弹窗框架仍须满足焦点、辅助功能树和浏览器兼容要求。

### FDE-08 预设浏览、管理员发布与试用承接

“精选”每卡展示全部目标词、模型/场景/长度/释义语言，以及完整生成样文；预设只有一个标题，不区分界面语言，**没有预设说明字段**。这不代表移除模型、道具、成就或消息的说明。

释义语言 Tab 默认全部，过滤后回第一条并暂停自动，切 UI 语言保留筛选；按发布对象定位“我也试试”，不能用过滤后的索引取错对象。横向自动切换每八秒；阅读、焦点、触摸、滚轮、手动切换后停止本次自动，只有前后/计数，不展示继续/暂停轮播按钮。减少动效/隐藏/离屏按交互定义停止或暂停。

管理员先编辑/保存草稿，生成有效预览，再手动发布；改生成配置需重做预览，仅改标题可沿用预览。管理员预览不限次数但单独记录用量；前台展示发布快照而不是草稿。用户从预设进入独立只读工具台后手动生成，配置优先但仍扣当前身份次数；完成后继续既有注册/登录收录和复习路径。

### FDE-09 后台不能只重做外壳

八模块除新增页外，必须继承一期全量模型、计划和用户操作。模型移除要展示引用/下架影响；计划零/无模型/无长度是合法但不可生成配置，不应在表单偷偷补默认值。基础计划人工调整的额度/计量重置与体验卡续期分开处理，确认文案不得混用。

用户管理维持先搜索、单结果仍需选择、返回保留结果和焦点；详情扩展等级/积分/学习记录，内容保持只读。积分只允许正数补发，不出现扣分/撤回/改经验操作。成长运营包含任意多档的等级与成就、奖励引用、道具创建/编辑/上下架；被使用/引用的历史配置不能被无提示删除。

数据看板区分暂无样本、观察中、未知和延迟，管理员预览用量不混入学习者生成；只用服务端约定口径，不根据原型百分比推导算法。所有保存/失败给反馈，错误保留输入与现场原因，不只依赖消失的 Toast。

## 前端接收与验收清单

| 核对项 | 接收时必须确认的结果 |
|---|---|
| 覆盖 | 上面 12 个一期 PAGE 的职责均有去向，25 个当前 PAGE / 28 个原型视图进入技术映射；后台八模块及四个个人视图完整。 |
| 原件 | 读取当前原型 HTML/JS、copy.json、theme.css；先确认当前 UI26 的待审范围，按用户后续批准对应的快照接收；UI22/H01 仅作为旧批准来源，不能只照截图重新创作。 |
| 优先替换 | 先统一壳层/Token/文案，再还原普通/只读配置与书架/详情，再接新复习流程；新增个人成长/消息/预设/后台按数据契约落实。此顺序是设计接收建议，不替代技术计划。 |
| 关键旧断言 | 移除旧“全部正确才下一步”“提交后仍不展示答案”“离开不存当前草稿”“普通台四项均为空”“后台只有三项”“标题不可编辑”等被明确替代的预期。保留权限、单篇/日期隔离、生成完整性、危险操作和认证承接验证。 |
| 响应式 | 按当前 320/390/760/1100/1440 等对应断点与页面规则检查，而不是套一期几何；长模型/标题/中英文、键盘/触控/减少动效分别验证。 |
| 数据接入 | 新能力需要技术/API 契约；原型 F/S、sessionStorage、固定时间和生成/奖励夹具只用于演示，不能作为权限、持久化、统计或幂等实现。 |
| 文案 | 固定文案和动态变量与 copy.json 对齐，提交前不泄露答案；不恢复已删预设说明、轮播暂停按钮或需求式文案。 |
| 验证边界 | 原型自检与生产还原、API 集成、独立 QA 分开；无来源的旧截图不自动升级为二期基线。保留首个真实差异及原因，不能只更新预期掩盖问题。 |

## 已知待补与交接限制

- **CAP-209 同日欢迎分支**：设计已定义 `welcome.today` 等专门文案，当前原型登录仍显示 0 天。该差异不能因整体验收通过被视为已实现；frontend-bob 映射状态，frontend-claire 按既有分支文案接入并验证首次/无学习/当天/跨学习日，不由本表新增规则。
- **真实输入和服务链路**：长词、输入法组合、跨刷新/跨设备草稿、并发提交与响应丢失的结算、权限/持久化/计量等仍须工程实现与验证。原型本地存储不能作为这些项目的通过证据。
- **兼容与辅助功能**：真机/Safari、人工读屏、软键盘及 200% 缩放未全量验证；Toast 的 popover/Web Animations 与 modal 语义在正式前端按支持范围处理。
- **既有开放项**：CR-001/002 的产品修订与设计接收已获确认，但实际实现须继续追踪；CR039-L1、CR042-L1、AI-QUALITY-90 沿正式状态保留。本次不宣称真实 AI 达标，不增加实时第三方采集。
- 本文核对了设计和已有工程定位，没有进行前端技术设计、代码实现或独立新会话接收测试。接收角色须把这些定位落入正式技术方案；发现语义冲突交产品/设计责任角色，不静默采用旧行为。
