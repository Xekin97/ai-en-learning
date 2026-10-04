from pathlib import Path
D=Path(__file__).resolve().parents[2];M=D.parent;p=D/'frontend.md';s=p.read_text();s=s.replace('version: M002-FE-02','version: M002-FE-03').replace('status: awaiting_user_review','status: scoped_contract_gap').replace('date: 2026-09-20','date: 2026-10-01')
a=s.index('输入为 PRODUCT-03');b=s.index('<a id="choices">',a)
s=s[:a]+'''本版 **M002-FE-03** 接收 [065](../reviews/design-acceptance-065.md) 已批准 **UI26** 的累计 UI23–26 改稿。当前角色 frontend-bob，阶段 technical-design；本轮为方案接收，不修改应用代码或自批迁移。前端 FE02 已由 [016](../reviews/technical-design.md) 批准，既有交付/UAT 状态以 [060](../reviews/verification-acceptance-060.md) 及 workflow 为准，旧文档的待审/CR004 OPEN 不构成重新打开历史工作。

产品输入为已接收 PRODUCT04、D2-89 和用户选词改进要求；当前 PRODUCT05 中 **CR026 / D2-88-LOCAL-SCOPE 未确认部分明确排除**，不能因产品文件在原路径更新就接入一次提醒缓存。49 CAP、25 PAGE/28 视图和 M001 完整继承保留。DB03、BE03 原批准用于未变范围，不重建数据或部署方案。

- 当前设计真源：[规格](../design/design-spec.md)、[差异](../design/frontend-delta.md)、[文案](../design/copy.json)、[主题](../design/theme.css)、[交互](../design/interactions.md)、[响应式](../design/responsive-accessibility.md)、[追踪](frontend-traceability.json)。UI26 归档 SHA `9927eca3d90c760dc455c83aa673c5545c6e2e33710c944ce392de2f65fae0d8`，送审时 pending 标记已由 065 批准覆盖，不改其冻结字节。
- API 真源：[索引](api/index.md)、[生成/预设](api/generation-presets.md)、[管理](api/administration.md)、[消息](api/growth-benefits.md)。DTO→schema/mapper→应用状态→渲染单向边界保持。
- 当前工程 package.json 为 Nuxt 4.5.2、Vue 3.5.42、Zod 4.5.4、eventsource-parser 4.1.0、pnpm 10.33.0、Node 24；这是仓库事实，不是最新版本推荐，本次无需升级或新依赖。
- UI26 接收和改前3份前端方案原件见 [reception](evidence/frontend-ui26/reception.json)、[before-sources](evidence/frontend-ui26/before-sources.tar.gz)。应用 HEAD 未变；本轮保护 575 份正式源文件及产品/设计/API/控制面，未改后端、数据库、业务数据或工作流。

**接收结论：SCOPED_CONTRACT_GAP**。新发现 **FE3-G01 / [CR027](../changes/CR-027.md)**：管理员预设需搜索候选，但 API004 只声明 V/L，现有处理器又没有管理员排除。需 backend-alex 补齐既有只读搜索的权限契约；只阻塞后台词库真实接入，不能宣称全量接口已对齐。其他映射已完成。本条不要求用户重新选择后台选词能力，也不擅自增加网络字段。

本轮实现/验证入口为 [§12](#delivery)、[§13](#ui26)。原 FE2-G01–03/CR004 由016关闭设计接收，原实施/QA问题状态以各正式审批为准；FE2-V01–20 保留为继承规则及回归定位，不把既有交付全部重测。CR039-L1、CR042-L1、AI-QUALITY-90、W01、QA26-MINIMAX 保持原状态。

'''+s[b:]
s=s.replace('UI22 原生控件、局部业务组件、现有 CSS；本地 Lucide 48 个 SVG 与原许可。','UI26 的 Vue 单选组件和搜索选词组件、局部业务组件、现有 CSS；复用本地 Lucide SVG 与原许可。')
s=s.replace('一次受控转换 UI22 Token/文案/SVG','一次受控转换 UI26 Token/文案/SVG')
s=s.replace('EditableConfiguration 负责四个原生 select','EditableConfiguration 负责四项 UI26 AppSelect')
s=s.replace('SafeNoticeBody；NoticeCollection','NoticeReadingDialog、SafeNoticeBody；NoticeCollection')
s=s.replace('PreviewWorkspace、PublishConfirmation；PresetDraft','PreviewWorkspace、PublishConfirmation、WordPicker、PresetWordMeanings；PresetDraft')
s=s.replace('将theme.css变量逐项迁入生产theme.css','从批准UI26将theme.css变量及本轮区域样式受控迁入生产theme.css')
s=s.replace('已被UI22替换文案不作为回退复活','已被UI26替换/删除文案不作为回退复活')
s=s.replace('UI22新版专节与最终CSS优先','UI26当前专节与最终CSS优先')
s=s.replace('内容还原输入固定同UI22数据','内容还原输入固定同当前获批UI26数据')
a=s.index('## 12. 实施分解、依赖和交接');s=s[:a]+'''## 12. 当前增量实施顺序、依赖与交接

以下 FE3-I01–06 为 UI26 对现有交付的增量，不重做已完成的 FE2-I00–06。原任务与旧方案从 [FE02 快照](evidence/M002-FE-02.tar.gz) 可恢复；本文此前章节保留仍有效的继承约束。开发角色为 frontend-claire，QA 为 qa-quinn，现有常设授权适用于已确认范围，不能把未修契约和未跑测试记录为通过。

| 任务 | 修改落点 | 完成条件 / 验证 |
|---|---|---|
| FE3-I01 同步设计源 | scripts/sync-design.mjs、use-design-copy、locales、theme/application CSS、design/source-manifest | 版本固定 UI26，逐键准确转换；清理被删键调用与覆盖新版的旧样式，不覆盖 UAT 修复；FE3-V01 |
| FE3-I02 统一下拉 | AppSelect、19处/9文件消费点；先普通台+后台预设代表表单，再推广其他7文件 | 值/默认/必填/禁用/错误/焦点保持，桌面/手机/模态上下文可用；FE3-V02/03 |
| FE3-I03 消息与首页/文案 | AppDialog扩展、NoticeReadingDialog、NoticeHost、SafeNoticeBody、notices/index与admin/notices | 独立正文滚动、固定标题动作、Markdown主题、880px列表无提醒标签、Why区域、内部文案清理；FE3-V04/05/08 |
| FE3-I04 共享选词 | WordPicker、词库搜索状态、GenerationWorkspace、admin/presets Fields/输入转换 | 普通词数与随机保留，后台数组草稿与无限制；后台真实搜索需 CR027 先对齐，其他部分不阻塞；FE3-V06/09 |
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
| UIA-PAGE-212-WORDS26 / 212 | word-picker.js #preset-words → WordPicker+admin/presets | PresetInputModel.configuration.entries；API004权限待CR027、API202/208 | 独立草稿、无用户上限、发布失效/失败恢复；V06/07/09 |

### 13.2 AppSelect 单选控件

建议复用原型的原生 Popover 定位能力与现有 Vue 响应式/样式完成一个 AppSelect；不引入 headless/UI 套件，不在页面运行 prototype/select.js。这是现有栈内的组件边界调整，不是新增技术栈决定。props 提供稳定 fieldId、当前 value、带原始 value/label/disabled 的 options、disabled/required/invalid/describedby/name 及可访问字段名；只 emit update:modelValue/change，不取数据或决定权限。

原始字符串/枚举/null或空选项保持调用页语义，不能一律转成标签文字或自动首选。可见 combobox 负责标签/aria-expanded/controls/activedescendant、当前勾选与键盘；弹层仍处于所属 modal 的可访问子树，不能 Teleport 到 inert 的 body 兄弟节点。Popover 进入顶层、按上下空间翻转；窗口/祖先滚动与 visualViewport 变化重新测量，unmount关闭并清理监听。不能复制 prototype 的模块级 opened 状态到SSR共享对象；客户端同时打开管理限制只覆盖本 Nuxt 实例。

保留现有表单原生有效性：如使用原生 select 作为值/required代理，采用不可见但有效的表单控件，移出 Tab/读屏，invalid 阻止默认隐藏节点聚焦并将焦点移到可见触发器；禁止 hidden required + 无 invalid 处理造成无法聚焦错误。代理不是第二套应用状态，触发器与提交值由同一 modelValue 驱动。可见 label/id 与错误描述指向可操作控件。关闭/重绘后回焦原字段；Escape仅关选单，Tab正常前进、禁用项跳过；Home/End/前缀查找按UI23。选择确认才发change，导航高亮不提交。

生产替换清单：GenerationWorkspace 4、admin/presets 4、admin/ItemDefinitions 5、admin/TierEditor 1、admin/growth 1、admin/analytics 1、admin/users/[userId]/index 1、account/index 1、LocaleSwitch 1，共9文件19处。保留 item/plan/model稳定值、全选项与权限提示；readonly trial/detail不渲染伪禁用下拉。完整原始盘点在 inputs.json。

### 13.3 WordPicker 搜索、选择与请求归属

WordPicker 是展示/交互组件：接收 selectedEntries、candidates、query、searchStatus、disabled、可选 maxEntries、randomPending 和是否显示随机；emit query/add/remove/clear/retry/random 意图。控制 popup/highlight/组合输入/焦点，store 控制请求与选中数据。输入仍为 combobox，词签和候选使用完整规范 entry；**API004 只返回 entry 文本和 vocabulary_version，没有词条 ID**。稳定 key 使用规范 entry，绝不能据原型注释虚构 entry_id。

沿现有180ms搜索去抖；把取消/序号/会话epoch统一置于运行时词库搜索实例，普通和每个后台编辑器分别使用，不共用学习者的整套 generation state。保持 ports.searchVocabulary → strict schema → mapper → VocabularyResultModel；页面不调用$api。服务端返回顺序保留，不对10条结果重新排序或伪装全库；q为空立即清候选，失败保留已选。输入一变化就撤销旧请求/使旧结果不可选择，不能等180ms才让旧响应失效；卸载、换预设、退出/换账号同样失效。搜索是读操作，无本地/跨设备持久化、无自动生成/扣次。

普通 state 当前过滤 selectedEntries 的逻辑需去掉：已选候选仍显示勾选与picker.chosen并不可添加。add动作二次检查来自当前查询候选或成功随机结果、未重复、当前cap及非生成冻结；键盘Enter不允许任意输入、IME合成不提交。清空搜索取消请求但保留已选；添加成功清查询并回焦，移除聚焦邻近按钮/搜索。词条大小写去重用规范匹配，但保留服务端原始条目显示，不按空格/撇号/逗号拆分。随机仍使用现有接口、selectionRevision及会话校验，服务端排除当前库，UI满额禁用，不在客户端从夹具抽签。

后台 Fields.words 从 string 改为 string[]，blank为空数组、fields复制configuration.entries、input直接复制数组并校验非空/规范去重，移除join/split旧链路；无普通计划max_entries，也不调用ordinary options或随机API。字段保持按presetId的baseline/value/revision/record/remote，本地dirty比较和请求快照针对数组副本；词增减不清空title/model等字段。保存失败、409 reconcile、未知提交重读和手动发布原逻辑保持。后台词库请求只在CR027契约完成后接入，不改为使用匿名身份绕过权限。

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

实施测试使用既有Vitest/Playwright/mock-backend，不新建测试平台。预设fixture从API202/208的完整ValidatedResult取targets，返回与输入独立的字面响应；无假词义或专用UI字段。API004 mock当前按已有契约，管理员案例标待CR027，不能用mock成功掩盖权限文档未对齐。具体目录与现有架构边界按前文。

本轮架构验证：复核批准UI26源、prototype/select.js/word-picker.js/word-meanings.js及相关app模块，逐处映射现有代码；复用UI26同字节的167+18项和4图、UI23–25原版本证据，不重跑未修改原型或应用单测。当前只做可恢复性/映射/文案/链接/源保护静态自检，结果见 [FE03检查](evidence/M002-FE-03-check.json)。这些证据不证明生产还原或实际API权限通过。

生产验收计划先结构/实际文本与状态，再对代表区域截图人工对照。预计最多6张代表构图用于新消息两端、两处选词、精选词义和首页；共享选择器几何/键盘优先结构信号，实际失败才追加。浏览器组合沿FE2-V14，已有充分同版本证据可复用；浏览器/真机/人工读屏未执行须明确记录，不用预算自动略过已批准必要验证。

未决与接续：CR027由backend-alex补契约并返回frontend-bob接收，CR026由product-maya等待原问题答复，两者独立。FE03尚未获技术批准，不改state或启动正式实现；下一阶段沿已存在前端/QA授权，不能把本方案自检当技术或生产验收。无实际模型调用、依赖下载、提交、部署、代理委派；token/费用unknown。
'''
p.write_text(s)
