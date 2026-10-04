## UI31 / PAGE208 服务商聚合（当前有效）

来源 CR029-F05，用户已明确方向。列表改为 `.generic-provider-list > .generic-provider-card`：头部服务商名称、模型数量、协议/地址/脱敏Key和“编辑服务商”；下方 `.generic-provider-models` 展示全部活跃配置模型，保留名称、ID、状态、说明、独立流式测试及引用影响移除。模型不再重复服务商信息，也不提供单独编辑入口。

“添加服务商”新建连接与多个模型；“编辑服务商”打开同一弹窗并填充全部模型，连接修改影响该组，已有模型不可通过删除草稿行隐式下架，新条目可增删。列表以稳定服务商ID分组而非名称或URL；零模型服务商仍展示可编辑。沿用UI30分区/字段/帮助间距、单项测试与固定头尾滚动；编辑入口关闭原连接选择器，两种路径完全明确。

验收 UIA-PAGE208-PROVIDER：中英、1440/390；两服务商同名/同ID也不串组；超过原模型分页20条全部可见/可编辑；修改服务商及多个模型并新增后刷新保持；失败/CAS保留草稿；密钥不显示/不存本地；单项测试独立；模型下架继续走影响确认。原型入口 `?page=models&lang=zh`。原UI30列表/单模型编辑条目已失效，历史快照 reviews/evidence/provider-workspace/before.tar.gz。浏览器检查随UI31交付记录，不能用UI30截图证明本版。

# UI30 / CR029-F03 当前服务商与批量模型表单

用户明确要求服务商优先、一次多个模型ID、高级选项统一间距。PAGE208/CAP101/102。取代UI29新增表单字段顺序；列表、逐项测试、编辑/移除语义保留。

原型 `?page=models&lang=zh`，新增弹窗`.generic-model-form`：provider分组→models分组→固定底部取消/保存全部。每个模型`.generic-model-item`包含ID/选填显示名、折叠高级设置（输出上限、结构化输出、说明）、启用/显式测试。现有连接仅填写一次；新增条目不丢已有输入；移除至少保留1项，焦点回邻项/添加入口；仅被测试的模型展示状态。批量失败保留全部输入，重复ID明确提示，服务端原子保存。

样式真源theme.css UI30段：分组24px、字段16px、帮助文字6px、标签8px；高级内容容器18px分隔，details本身不依赖grid排列。720px弹窗，桌面成对字段两列，520px以下单列。头尾固定、中间滚动；按Tab视觉顺序，折叠使用原生details/summary，新增删除即时，沿原焦点与减少动效规则。

文案copy.json gm.connection.section / gm.models.section / gm.model.add / gm.models.save / gm.name.optional等。UIA-PAGE208-BATCH30：服务商先于模型、可增删2项且不丢输入；高级选项展开间距一致；1440/390中英无溢出、底部始终可见；只测指定行；成功全部显示、失败无半批残留。浏览器核对在本轮原型/实现阶段记录，不以文件生成宣称已验收。

以下保留未影响的既有规格；遇新增表单顺序以UI30为准。

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

# 二期设计规格 · M002-UI-26

## 当前目标与有效范围

当前 **M002-UI-26** 执行用户“优化造文工作台里的选词以及管理台预设配置里的选词功能交互”的请求，继承 [UI25 快照](./evidence/M002-UI-25.tar.gz) 的文案清理及 PRODUCT04 已接收能力。当前角色仍为 064 接收后的 designer-tony。本轮是现有 CAP-006/208/218 的交互重设计，无新增业务字段或接口要求。PRODUCT05 的一次提醒计数范围 **D2-88-LOCAL-SCOPE / CR026 仍 OPEN**，不据此实现缓存行为。

普通工作台的原生候选框加独立添加按钮、后台逗号分隔词语输入已由下述共享选词区取代，不再作为前端接收依据。UI22/H01 的旧批准及原 UAT 保持；UI23–26 新视觉待用户审阅。25 个 PAGE、28 个视图、49 个 CAP 与 M001 继承完整，详见 [前端差异](./frontend-delta.md)。

## UI26 共享选词

| 验收 ID / 来源 | 区域与定位 | 结果约束 |
|---|---|---|
| UIA-PAGE-204-WORDS26 / PAGE-204 / CAP-006/208 / DATA-001/002/006/211 | app.js generation → word-picker.js；#create-words | 标题和已选/剩余数量、随机选词、已选标签、搜索候选依次显示。按当前计划限制数量；随机排除已选及当前复习库中的词语。 |
| UIA-PAGE-212-WORDS26 / PAGE-212 / CAP-218 / DATA-212/214 | presets.js → word-picker.js；#preset-words | 标题之后、生成配置之前显示同一选词区，只显示已选数量，不受普通用户计划上限限制。修改词语保留其他输入并使预览过期，重新预览后才能发布。 |

[普通工作台](http://127.0.0.1:4186/prototype/?page=create&lang=zh&v=M002-UI-26)、[后台预设](http://127.0.0.1:4186/prototype/?page=presets&lang=zh&v=M002-UI-26)。两页均支持 `lang=en`、`state=word-loading`、`state=word-error`；加载/错误在输入查询后显示，错误提供重试。正常空结果可输入 `not-a-catalog-word` 复现；移除全部词语展示空态。普通台 `role=guest` 演示访客上限，默认 learner 演示当前用户计划。原型词表是 fixtures.candidates 的小样本，正式词库仍为既有 13,860 条及既有搜索接口。

空查询收起候选；搜索不区分大小写，前缀匹配排在包含匹配之前，匹配字符加粗。点击候选或 Enter 加入后清空查询并保持搜索焦点，方便继续选词；已选词保留完整字符串，带独立移除按钮。搜索中已选候选显示勾选与 picker.chosen，不允许重复添加。`according to`、`coup d'etat`、`ought to`、`owing to` 作为单一词条保留，不按空格或标点拆分。任意文本不变成新词条。

达到普通台当前计划上限时随机及候选添加不可用，仍可搜索/清除/移除；就地显示 picker.full，移除后恢复可选。后台没有随机入口和用户上限。选词时不新增词典释义请求；后台的正文与词义继续来自同一有效预览，旧预览不能与新选词拼接为结果。试用工作台保留只读词语与实际数量，不使用编辑组件。

准确文案在 copy.json（zh./en. 前缀）。区域标题复用 words，搜索 label 复用 wordsearch，随机复用 random，移除按钮名称复用 remove + 原词；新增 picker.placeholder/selected/empty/options/chosen/clear/none/loading/error/full。picker.count、picker.remaining、picker.matches 的 count 是非负整数；picker.added、picker.removed 的 word 是词库返回的完整词条文本。普通数量复用 wordcount 的 count/limit。适用条件不渲染时不生成虚构变量值；词条和查询作为转义文本。模板、标签及状态的顺序以 word-picker.js 为真源。

选词区使用 theme.css 的 `.word-picker* / .word-token`，现有暖白、浅绿、细边框及 search/plus/check/x/shuffle 图标。即时增减与候选更新，不增加漂浮或延迟动效。焦点、键盘、输入法和中断规则见 [交互](./interactions.md)，尺寸与窄屏见 [响应式](./responsive-accessibility.md)。同版证据见 [validation](./validation.md) 和 [UI26 清单](./evidence/M002-UI-26-manifest.json)。

## UI25 用户文案

**UIA-GLOBAL-COPY25 / UIA-PAGE-207-COPY25**：用户消息列表只保留日期、标题、箭头；提醒类别仅留在后台消息配置。原型 app.js `notices()` 移除对应 badge 与 copy.json 的 notice.reminder 文案，theme.css 去掉其专用规则；桌面行高随单行标题收紧。880px 居中栏、全行按钮、移动日期上置、消息弹窗及关闭回焦保持。

审查范围为全部 18 个用户/公开视图的固定文案、错误/确认反馈及可访问名称。移除日期复习计数旁的后台排除说明和完成页重复副标题；试用页将内部“预设”改为用户可理解的精选短文/生成设置；复习使用篇、短文、进度和结果描述，替代批次、会话、命中和提交状态术语。卡片及账号的必要反馈采用直接的操作结果。完整逐键中英文变更见 [文案审查](./evidence/ui25/copy-audit.json)，准确文本只维护于 copy.json。

保留扣次/退次、卡片有效期与覆盖后果、删除不可恢复、答案丢失/恢复、签到时间、后台操作所需的显示/提醒配置与指标定义。这些影响用户决定，不能因清理内部文案而隐藏。不改管理员发布的消息正文、学习短文或运营名称。后台的领域术语不作为普通用户页面的通用说明。

试用台移除重复的“配置锁定”徽标，选词区显示“学习单词”和实际单词数量，不再显示并不存在的可编辑上限；只读设置的可访问说明保留。

原型默认隐藏版本、PAGE 编号和状态切换审阅工具；显式 `inspect=1` 才显示，场景 URL 仍可直接复现。这是原型审阅入口，不是新产品设置；不得复制到正式界面。

预览：[消息](http://127.0.0.1:4186/prototype/?page=notices&lang=zh&v=M002-UI-26)、[精选](http://127.0.0.1:4186/prototype/?page=explore&lang=zh&v=M002-UI-26)、[试用](http://127.0.0.1:4186/prototype/?page=trial&lang=zh&v=M002-UI-26)、[复习范围](http://127.0.0.1:4186/prototype/?page=range&lang=zh&v=M002-UI-26)、[审阅工具](http://127.0.0.1:4186/prototype/?page=notices&lang=zh&inspect=1&v=M002-UI-26)。服务命令 `python3 -m http.server 4186 --bind 127.0.0.1 --directory .planning/milestones/M002/design`，工作目录为产品仓库。

本版来源、检查和当前冻结指针分别见 [validation](./validation.md)、[design-manifest](./evidence/design-manifest.json)。不使用已撤回的 product-baseline-draft；不修改正式应用或批准设计。

## UI-23 五项追加设计

| 验收 ID / 来源 | 界面与源文件 | 交付约束 |
|---|---|---|
| UIA-PAGE-207-NOTICE23 / CAP-210 / DATA-205 / D2-83 | app.js dialog/noticeDialog；theme.css `.notice-dialog/.notice-heading/.notice-reading/.dialog-actions` | 消息本身的标题成为弹窗主标题；日期和当前位置留在标题区。正文占主要高度并独立滚动，翻页和关闭固定底部。短消息不塌为一条窄框，长消息不把按钮推离视口。 |
| UIA-PAGE-209-MARKDOWN23 / CAP-210 / DATA-205 / D2-84 | app.js message-preview；markdown.js；theme.css `.markdown` | 后台预览与用户消息共用阅读壳和排版。暖白底、深绿标题与链接、浅绿引用、细分隔、温和条纹表格；代码与宽表格在自身区域横滚。 |
| UIA-PAGE-212-MEANINGS23、UIA-PAGE-217-MEANINGS23 / CAP-218 / DATA-212 / D2-85 | presets.js、gallery.js、word-meanings.js；`.preset-meanings` | 精选配置区在配置事实之后展示全部原始选词及对应释义；后台在预览正文之后展示同批结果的释义。每个词一行，后台宽屏双列、手机单列。释义语言是预设生成配置，独立于界面语言。 |
| UIA-GLOBAL-SELECT23 / CAP-206 / DATA-018 / D2-86 | select.js；所有普通/后台选择场景；`.ww-select*` | 同一圆角触发器、选中勾选、浅绿高亮、焦点圈与浮层；长值换行、长列表滚动、边缘自动翻转，禁用/空选项/必填/错误语义继承。既有值、默认值和业务事件保持。 |
| UIA-PAGE-205-WHY23 / CAP-207 / DATA-018 / D2-87 | app.js home；copy.json `why.*`；`.home-why/.why-feature` | 原叠卡和学习路径之后增加紧凑三项优势：词语由你组合、AI 让词语进入语境、用熟悉的语言理解。双语正文与实际能力一致。 |

### 阅读壳与主题选择

桌面消息宽度最多 760px，高度最多 740px；相对视口预留边距与欢迎 Toast 空间。≤760px 贴近屏幕宽度并保留边距；≤600px 短屏将标题字号降为 18px、收紧标题内边距，让正文仍是主体。固定区与正文用 flex/min-height:0 分离，不对整个 dialog 设置滚动。标题完整换行，正常桌面 26px、手机 21px；正文 16px/1.9。正文滚到末尾、消息翻页、短消息和欢迎并行都有浏览器检查。

研究比较了 [github-markdown-css 的 light 方案](https://github.com/sindresorhus/github-markdown-css) 和 [Tailwind Typography](https://github.com/tailwindlabs/tailwindcss-typography)。选择 GitHub Light 风格的内容层级作为排版参考，用本项目已有暖白/深绿/浅绿 Token 自行实现 CSS；没有引入整套 Tailwind 或复制其样式包。此决定是 UI23 的待审设计建议，不新增 Markdown 能力。

原型使用本地 Marked 15.0.12 做可运行预览，HTML 作为文本显示、图片只保留替代文字、链接仅允许 http/https。正式应用继续消费后端 Goldmark + Bluemonday 的受控 HTML，不能将 prototype parser 当作生产安全边界或借本轮引入新渲染链路。支持范围沿用标题、段落、列表、引用、强调、删除线、代码、链接、表格和分隔线；无数学、流程图或附件。素材许可见 [资源说明](./prototype/assets/README.md)。

### 数据和组件边界

预设释义与正文来自同一个成功预览/发布样本；参数改变时继续显示旧样本，立即标明需要重新预览并禁用发布，不把新选词与旧释义拼在一起。无预览时显示“生成预览后查看释义”。原型以 fixture 与 previewSnapshot 演示该边界，正式应用应复用已有 GenerationResult 学习资源，不新增词典或模型请求。

原型的 select.js 保留隐藏的 native select 作为状态适配，实际可见控件统一为 combobox + listbox；演示工具条的调试选项除外。正式组件由前端按框架实现，不能把全页 DOM 扫描器照搬入 Vue。需覆盖现有 9 文件 / 19 处 selector，详见差异表；复选框组、日期控件、账号动作菜单和只读试用/详情配置保持原语义。空选项沿用字段自己的文案。

首页文案对应现有词库选词、平台模型、场景/篇幅与中英日释义；不承诺自由 Prompt、任意外部词语、其他输出语言或固定学习效果。未改变试用生成和注册流程，也不增加首页成长入口。

## 设计表达与内容优先级

保留原有阅读主题：暖白纸面、深绿文字、浅绿/杏色词签，字母与纸张传达学习主题。系统无衬线承担界面，衬线承担短文；1440px 版心容纳工作台与后台，但阅读栏保留适合连续阅读的宽度。复习的输入、释义、短语依次左对齐。首页保留概括、两篇叠放示例和学习路径，并在后方增加 Why Wordweave 三项优势；多篇预设仍放在“精选”。

个人中心头像依次进入个人信息、账号成长、道具卡、兑换中心，四视图共享左侧资料。成长默认每类展示当前档，其余档位可展开；等级奖励单列为逐级可领条目。后台八模块为概览、数据分析、模型管理、计划管理、用户管理、成长运营、消息管理、首页预设；模型和计划各有完整编辑页，消息是独立模块。

视觉资产使用现有品牌标识、CSS 纸面/词签及本地 Iconify Lucide SVG。图标资源、许可与映射见下节；没有外部图片、外部字体、Figma 或待替换占位图；界面只显示当前语言品牌“词涟”或“WordWeave”。首页叠卡增加克制漂浮与前后交换，阅读时停止自动动效；减少动效时保留静态构图。

## UI-22 短文详情生成设置

**UIA-PAGE-006-SETTINGS22 / PAGE-006 / CAP-014/015/016/021/220 / DATA-012/013/202/018**：learning.js `detail` 的 `.batch-settings` 依次为带 sparkles 图标的 l.snapshot 标题、浅绿 `.trial-model` 模型卡、场景/篇幅/释义语言三行 `.trial-config-row`、分隔后的 `.batch-review-count`。正文、词语资源与右侧复习操作位置保持。

复用 app.js `trialConfiguration`，通过 configurationSnapshot 注入 learning.js，与独立试用工作台共用只读结构。沿用普通工具台的模型重点区、图标、圆角与信息行层级；不显示可编辑 select 或折叠箭头。模型和配置读取批次保存时快照，不用当前计划或在线模型列表替换。已知枚举消费既有 a.preset.style/length/language.* 文案，兼容已保存大小写/内部枚举；未知历史值原样转义显示，不自行回退为当前默认值。

标题复用 l.snapshot，四项字段复用 model/style/length/explain，统计复用 l.stat.successes；无新增固定文案或业务字段。配置使用 dl/dt/dd，图标仅装饰，不产生新的焦点。theme.css 将原试用配置的颜色、间距与断点同时应用到 .batch-settings；普通工具台的编辑行为不变。

验收包含中英文桌面/手机、平板、只读及四项真实配置/复习统计、历史长模型与未知枚举完整显示；共享试用工作台不出现可编辑字段。标题编辑、参与日期复习、单篇复习及删除入口保留，不重新定义其业务。

## 欢迎提示与反馈层级 · UI-21

**UIA-PAGE-003-TOAST19 / PAGE-003 / CAP-003/209/210**、**UIA-PAGE-207-TOAST19 / PAGE-207 / CAP-210**：index.html 的唯一 `#toast` 保留 role=status / aria-live=polite，增加 aria-atomic=true 与 popover=manual；app.js `toast / syncToastLayer / positionToast / dialog` 和 dialog close/resize 处理共同控制其生命周期。

登录后的欢迎与提醒消息同时可读：Toast 在消息及其模糊遮罩之上；消息仍按原触发时机弹出。手动 popover 使用浏览器顶层，存在 modal 时挂在该 dialog 的可访问子树内，避免提示进入被屏蔽的背景。页面重绘、消息翻页、关闭和重开 dialog 保留同一个提示节点、当前内容与原截止时间（欢迎十秒、其他五秒可读停留，两端各加 300ms 过渡）。实现依据为 [WHATWG Popover](https://html.spec.whatwg.org/multipage/popover.html) 和 [模态与 inert 规则](https://html.spec.whatwg.org/multipage/interaction.html#inert-subtrees)。

普通页面提示保持原底部 80px；modal 中提示靠视口底部安全区，正文与按钮不足空间时给 dialog 留出下方提示区。提示不抢焦点、不拦截点击、不加确认按钮；消息的关闭、Escape、翻页及背景不可操作语义保留。减少动效时即时展示；常规动效只改变透明度，保持水平居中与位置固定。共享保存/失败提示也按此规则，不增文案或新业务。

欢迎正文中的间隔使用 strong.toast-days，24px / 700 / 1.2，天数与单位不拆行。copy.json 的 welcome 以 name / elapsed 为变量，elapsed 来自 welcome.elapsed 的 days 模板；仅拆分文案结构，实际中英文整句不变。昵称和天数均通过文本节点填入，不拼接用户 HTML。无学习记录的欢迎同为十秒，不生成虚构天数。

app.js 使用同一条 Web Animations 时间线完成 opacity 0→1→1→0，参数 --toast-fade 来自 theme.css。以动画 finished 完成信号调用 hideToast 隐藏 popover 并释放短屏避让，避免墙钟定时器在动画首帧较晚时截断淡出；新反馈取消旧动画/定时器，避免旧计时移除新内容。设计采用 [Element.animate](https://developer.mozilla.org/en-US/docs/Web/API/Element/animate) 与 [Animation.cancel](https://developer.mozilla.org/en-US/docs/Web/API/Animation/cancel) 控制生命周期。

本轮验收检查实际帧的透明度变化、完整停留、消息翻页/关闭/重开不重播、替换反馈取消旧动画、短屏及减少动效。UI20 字号和原图层/焦点/模态反馈规则保留；旧证据不能代替新版动效验收。完整规则在交互/响应式文档；生产浏览器兼容和实际读屏仍须后续验证。

## UI-18 书架列表

**UIA-PAGE-005-LIBRARY18 / PAGE-005 / CAP-012/013/015/016/020/021/022/220 / DATA-002/009/012/013/014/016/017/018/201/202/203/208**：learning.js `library / libraryRow`，theme.css `.library-page` 内呈现。标题/导语与按日期复习在顶部；六项全库统计用语义 dl 并列，累计生成浅绿强调；搜索输入/搜索/有条件清除→结果数与旧到新提示→短文列表→加载更多。

短文行依次为装饰书页图标、收录时间/模型/场景长度、当前标题、需要时的原词列表、短文标签；右侧是复习本篇/继续本篇、短文详情，随后参与日期复习 checkbox 与永久删除。保留完整标题和词条，自定义标题不挤掉目标词；不增加正文摘要或搜索范围。书页外形由 CSS 与本地 book-open-text SVG 绘制，浅绿/浅杏交替是装饰，不表示掌握或复习状态。

配置枚举复用 a.preset.style/length.* 显示当前语言标签，未知历史配置原样回退；模型和生成时内容保持。新增 l.search.placeholder；l.count 用篇短文表达批次数；l.stat.participating / paused 明确为日期复习，六项口径不变。词条输入有真实 label，placeholder 不代替可访问名称。全量统计隐藏于原首次空库态的行为保持。

验收包含中英文 320/390/768/1440px、六项数值、旧到新顺序、搜索/无结果/清除、参与切换及单篇复习、草稿恢复、详情改名返回、加载更多、删除取消/确认/失败及空/加载/错误态。原详情只改标题、日期范围、复习流程和生产权限定义不变。详情返回需保留搜索/加载范围/原行位置，控件重绘不丢失焦点；详细交互与断点以对应规范为准。

## UI-17 个人中心四视图

| 验收 ID / 来源 | 区域、内容顺序及文案 | 保持与检查 |
|---|---|---|
| UIA-PAGE-206-ACCOUNT17 / PAGE-206 / CAP-003/004/005/021/209 | app.js `accountShell`：身份→基础/生效计划→上次登录/学习→四入口；`profile`：标题/短导语→基本资料（昵称/性别、回退提示、保存）→账号安全（密码/退出/注销三行） | 共用左栏不展示称号；只读用户名、基础计划和实际生效计划。昵称空回退用户名；保留密码确认、注销二次确认、失败输入、语言草稿及退出当前会话。 |
| UIA-PAGE-214-ACCOUNT17 / PAGE-214 / CAP-211/212/213/214 | growth.js `view / achievement / reward`：等级/经验与三统计→签到→四类成就当前档/其余档→升级奖励列表 | 成就保留运营名称/描述、进度、已解锁称号及最新奖励。达成不自动领取；升级奖励逐档、初始等级无奖；不可用原因不省略。领取后已展开档位保持，焦点落回该组 summary 或对应等级标题。 |
| UIA-PAGE-215-ACCOUNT17 / PAGE-215 / CAP-215/216 | app.js `bag(shop)` / benefits.js `details`：标题/余额→卡面（类型图标/名称/库存状态→效果/期限/规则→价格或退积分额/动作） | 库存状态保留；商城已上架标记不重复显示，只有在架商品。补签说明只显示一次；模型不含次数/计划续期不重置/启用期限及逐模型结束时间仍清楚。兑换前展示获得后可启用天数，来自既有 days；无新权益。 |

样式定位为 `.account-layout / .account-sidebar / .profile-sections / .account-growth / .account-items`，图标复用本地 Lucide；无新位图或网络资源。账号栏浅绿、资料暖白，等级使用深绿重点区；道具按补签浅绿、次数浅杏、模型浅青、计划浅紫区分，同时保留文字与图标，不依赖颜色判断。动作与内容对齐，升级奖励用列表减少高度，不将四页都堆成同一种大卡。

新增固定文案仅在 copy.json：account.effective / balance / details / security / nickname.hint / password.hint / logout.hint / useby；account.redeem.days 为 days 模板。其他标题、动作、状态、权益说明和运营数据沿用原来源。没有头像上传、称号佩戴、任务、卡筛选或新交易能力。页面详细行为与响应式以对应规范为准，四页的全部现有状态继续可复现。

## UI-16 普通造文配置

**UIA-PAGE-204-SETTINGS16 / PAGE-204 / CAP-006/007/008/009/010/011/021/216 / DATA-005/010/203/211**：正常造文台 `.settings.creation-settings` 保留原生 details，四项选择器呈现由 UI23 的统一组件替代。`creationConfiguration(availableModels, lengths)` 渲染浅绿 `.creation-model` 及 `.creation-options`；模型图标和选择框为重点，场景、长度、释义语言使用带图标标签/选择器的对齐信息行。与试用台共享视觉语言，但所有允许的普通配置仍可编辑，统一下拉框交互按 UI23 执行，不增加配置步骤。

固定标题继续使用 config，标签使用 model/style/length/explain；选项显示复用 a.preset.style/length/language.*，底层值保持 story/brief/chinese 等既有值。模型/释义语言初始为空，Story/Brief 合法时默认；禁用、无合法长度、计量和生成期间冻结配置保留。图片资源仍使用本地 Lucide。

>1100px 左栏默认展开，≤1100px 默认收起；用户展开后选项变化、语言切换、随机选词及生成重绘保持其展开状态，选择完成后焦点留在对应新控件。当前配置由状态 S 驱动，语言缓存不覆盖模型/场景/长度/语言这四项。键盘、长模型名和对应只读试用台回归见验证文档。

## UI-15 试用配置展示

**UIA-PAGE-216-SETTINGS15 / PAGE-216 / CAP-218 / DATA-212**：独立预设造文台左栏使用 `.settings.trial-settings` 原生 details，默认展开；标题为 `trial.config.title`，配锁图标、可访问的锁定状态和折叠箭头。内部 `trialConfiguration(pre)` 先显示 `.trial-model` 的模型图标、标签与名称，再以 `.trial-config-facts / .trial-config-row` 显示场景、长度、释义语言，标签/值统一对齐，分隔线建立层级。

模型名保持发布值；场景、长度和释义语言显示使用既有 `a.preset.style/length/language.*` 文案键，不修改预设存储值和生成配置。全文标题、已选词和开始生成位置保持。所有配置是语义定义列表，无输入、选择框、虚假禁用控件或新增说明墙。右侧沿用现有词条和生成状态。

宽屏保留 310px 左列；761–1100px 配置在内容上方，模型与三项摘要横向布局；≤760px 模型在上、三行配置在下。长模型名/值自然换行，不能靠截断或隐藏适配。保持 details 键盘展开/收起、预设来源身份、显式生成、额度不足/失效禁用及生成后收录认证承接。验证中英文、320/390/768/1440px，及普通造文配置仍可编辑。

## UI-13 两篇交叉叠卡

**UIA-PAGE-205-STACK13 / PAGE-205 / CAP-001/003/021/207 / DATA-018/212**：首页使用两篇各自完整的单段英文故事，标题分别为 A story around the corner. 与 A garden worth growing.，正文分别 49 / 46 词。每篇各有 6 个目标词签及正文高亮，两篇合计 8 个不同目标词。每卡保留示例标识、场景/长度、独立标题、词签、一个正文段落及一个双语释义；源为 `fixtures.hero.stories`、app.js `home()`、`.home-card-stack / .home-paper-back / .home-paper-front`。中英文 UI 共用英文短文。

以相对定位、负边距、层级和相反旋转角构成前后交叉叠放：后卡浅杏纸面、前卡暖白纸面，移除旧绿色大底板。两篇均为真实正文，默认允许后卡下部被遮挡；悬停、点按或 Tab 聚焦对应卡时将其置顶完整阅读，不截断、不复制正文；自动动效与切换按 MOTION14 执行。键盘按后卡、前卡顺序访问，焦点圈可见。样文不生成、不扣次。

>1100px 介绍/叠卡两列；≤1100px 单列；手机保留叠卡但收小角度与水平偏移，防止横溢。正文桌面 18px、手机 17px，与卡片密度配合；不设固定正文高度和内部纵向滚动。详细数值以 theme.css 为准。STACK13 替代 SAMPLE12；旧 SAMPLE12 只在 UI-12 冻结包解释其历史验收。当前验证覆盖中英文、320/390/768/1440px、真实重叠、完整阅读及焦点/点按置顶。

## UI-14 叠卡漂浮与切换

**UIA-PAGE-205-MOTION14 / PAGE-205 / CAP-001/003/021/207 / DATA-018/212**：沿用 STACK13 的两篇全文、词签、字号、角度与布局。新增 [home-motion.js](./prototype/home-motion.js)，由 app.js `HM.afterRender()` 装配/销毁；theme.css `.home-paper` 漂浮动画与 `data-motion / data-top / data-switching` 驱动呈现。详情仅在交互文档维护。

两卡 6 秒缓动漂浮、最多上移 6px，前后错开 3 秒；空闲且在视口中时等待 8 秒交换前后层级，过渡约 640ms，卡片先轻微分开再回到原错位。不会改变正文、DOM 顺序或键盘焦点。用户鼠标进入、点按、滚轮或聚焦阅读后，本次首页访问停止漂浮和自动换层；手动选择仍有过渡。语言重绘保持阅读状态；离开首页再入重新开始。减少动效关闭漂浮、自动换层及切换动画，手动直接置顶；离屏/后台暂停，卸载清理动画和定时器。

验收用真实等待/连续帧验证移动与换层，不用静态截图替代；检查阅读后稳定、快速连续选择、运行时减少动效、窄屏整个过渡不横溢、页面重绘/离开后的清理。动效不触发播报、生成或计量，不提供暂停/继续按钮。静态 STACK13 验收仍保留内容和构图部分。

## UI-11 导航与阅读中断

主导航中文均为两字，顺序与路由固定如下；英文使用自然的单词，不为字数一致强行缩写。

| 中文 / 英文 | 路由 | 页面与用途 |
|---|---|---|
| 首页 / Home | home | PAGE-205 · 产品概括与示例 |
| 精选 / Picks | explore | PAGE-217 · 浏览预设、进入试用 |
| 学习 / Learn | create | PAGE-204 · 自选词与生成短文 |
| 复习 / Review | range | PAGE-007 · 日期范围与复习入口 |
| 书架 / Library | library | PAGE-005 · 用户收录的短文 |

导航、页标题、收录、返回和登录承接文案统一使用“书架”，页面标题为“我的书架”。功能仍对应原私人复习库，保留统计、搜索、参与开关、删除和复习入口。后台模块及头像四项菜单保持。trial 高亮精选；batch 高亮书架；review/overview/summary/sessiondone 高亮复习。

下列 NAV11 共用验收：中英文顺序/标签正确；访客和学习者均保持五项；点击进入对应现有路由，私有页保留认证与返回意图；当前分区高亮；320/390/1440px 无页面横溢。

| 验收 ID | 页面 |
|---|---|
| UIA-PAGE-002-NAV11 | PAGE-002 · register |
| UIA-PAGE-003-NAV11 | PAGE-003 · login |
| UIA-PAGE-005-NAV11 | PAGE-005 · library |
| UIA-PAGE-006-NAV11 | PAGE-006 · batch |
| UIA-PAGE-007-NAV11 | PAGE-007 · range |
| UIA-PAGE-008-NAV11 | PAGE-008 · sessiondone |
| UIA-PAGE-201-NAV11 | PAGE-201 · review |
| UIA-PAGE-202-NAV11 | PAGE-202 · overview |
| UIA-PAGE-203-NAV11 | PAGE-203 · summary |
| UIA-PAGE-204-NAV11 | PAGE-204 · create |
| UIA-PAGE-205-NAV11 | PAGE-205 · home |
| UIA-PAGE-206-NAV11 | PAGE-206 · profile |
| UIA-PAGE-207-NAV11 | PAGE-207 · notices |
| UIA-PAGE-214-NAV11 | PAGE-214 · growth |
| UIA-PAGE-215-NAV11 | PAGE-215 · bag / shop |
| UIA-PAGE-216-NAV11 | PAGE-216 · trial |
| UIA-PAGE-217-NAV11 | PAGE-217 · explore |

**UIA-PAGE-217-CAR11**：轮播控制区只有上一条、位置计数、下一条，不渲染播放/暂停控件或“手动浏览”等状态文案。多条内容初始每 8 秒自动切换，用户鼠标进入阅读区域、控件获焦、触摸、滚轮、筛选或手动切换后，本次访问停止自动；移开鼠标或切换界面语言也不恢复。离开目录再进入可重新自动，筛选和位置保留。页面隐藏/区域不在视口时停止计时；减少动效仅手动瞬间定位。完整配置、全文、语言 Tab、空/单条状态、键盘/触控及对应预设跳转保持。完整规则见交互文档。

## 首页骨架与统一图标

首页左侧为 AI 学习定位、价值标题、简短说明和学习/精选双入口，右侧按 STACK13 展示两篇交叉叠卡，分别呈现词签、正文与释义。底部保留三个紧凑步骤，首页不新增成长入口或运营内容。公开固定样文无模型请求、额度消耗或私人学习信息。

| 区域 / 验收 | 来源与文案 | 可观察结果 |
|---|---|---|
| UIA-PAGE-205-HOME10 · `.home-hero` | app.js `home()`；`hero.eyebrow/title/desc/cta/secondary` | 左侧两行标题和两个真实导航；>1100px 双列，≤1100px 单列。点击图标部分也能导航。 |
| 首页示例 · `.home-example` | `hero.sample`、fixtures.hero.stories / dictionary；`.home-card-stack / .home-word-row / .home-paper / .home-word-meaning` | 两篇单段示例，每篇 6 词、高亮和释义；交叉叠放并可置顶阅读，标明示例且不生成。词签为静态文本。 |
| 简洁步骤 · `.home-path` | `hero.steps / path.*` | 选词、阅读、拼写复习；图标、标题、简短说明成组，手机纵排。 |
| 图标原始资产 | [lucide.json](./prototype/assets/lucide.json)、[icons.js](./prototype/icons.js)、[来源说明](./prototype/assets/README.md)、[许可](./prototype/assets/lucide-LICENSE.txt) | 来自 [Iconify Lucide](https://icon-sets.iconify.design/lucide/)，本地 SVG，不用字符或字体兜底，不依赖在线图标请求。 |

图标映射：身份/空态为 book-open / inbox / file-pen-line；道具按补签/次数/模型/计划使用 calendar-check / ticket / bot / gem；成就按签到/掌握/复习/短文使用 calendar-check / brain / clipboard-check / notebook-pen。头像四菜单与后台八模块用 `icons.js` 的 routeIcons；随机/添加/保存等按钮使用 actionIcons。图库箭头、删除词、展开箭头和答案编辑使用 SVG；保留文字和已有 aria-label。品牌标识继续使用原始专用 SVG，不把品牌当通用图标替换。

短文复习的匿名分组使用圆/菱/三角/方/星/六边形 SVG，仍按会话稳定随机映射，颜色/边线继续辅助区分。输入可访问名称使用 `groupname.*`，不将 SVG 标签拼进读屏名称。数字、数量乘号和正常标点不属于图标替换。

### 共享图标验收追踪

每条 ICON10 共用：图标映射语义正确；有文字或可访问名称；SVG 不单独获焦；点击 SVG 本身与按钮同效；新图标不撑破小屏布局。原页面的业务验收与 COPY09 继续有效。

| 验收 ID | 页面 / 视图 |
|---|---|
| UIA-PAGE-002-ICON10 | PAGE-002 · register |
| UIA-PAGE-003-ICON10 | PAGE-003 · login |
| UIA-PAGE-005-ICON10 | PAGE-005 · library |
| UIA-PAGE-006-ICON10 | PAGE-006 · batch |
| UIA-PAGE-007-ICON10 | PAGE-007 · range |
| UIA-PAGE-008-ICON10 | PAGE-008 · sessiondone |
| UIA-PAGE-103-ICON10 | PAGE-103 · users / userdetail |
| UIA-PAGE-201-ICON10 | PAGE-201 · review |
| UIA-PAGE-202-ICON10 | PAGE-202 · overview |
| UIA-PAGE-203-ICON10 | PAGE-203 · summary |
| UIA-PAGE-204-ICON10 | PAGE-204 · create |
| UIA-PAGE-205-ICON10 | PAGE-205 · home |
| UIA-PAGE-206-ICON10 | PAGE-206 · profile |
| UIA-PAGE-207-ICON10 | PAGE-207 · notices |
| UIA-PAGE-208-ICON10 | PAGE-208 · models / plans |
| UIA-PAGE-209-ICON10 | PAGE-209 · messages |
| UIA-PAGE-210-ICON10 | PAGE-210 · operations |
| UIA-PAGE-211-ICON10 | PAGE-211 · credits |
| UIA-PAGE-212-ICON10 | PAGE-212 · presets |
| UIA-PAGE-213-ICON10 | PAGE-213 · metrics |
| UIA-PAGE-214-ICON10 | PAGE-214 · growth |
| UIA-PAGE-215-ICON10 | PAGE-215 · bag / shop |
| UIA-PAGE-216-ICON10 | PAGE-216 · trial |
| UIA-PAGE-217-ICON10 | PAGE-217 · explore |
| UIA-PAGE-218-ICON10 | PAGE-218 · adminhome |

## UI-09 文案与布局收敛

普通页面只保留任务标题、必要上下文和操作反馈；移除重复的“词涟 / 开始学习”面包屑、无帮助的规则复述、重复额度总数和试用操作说明。中英文精简记录见 [文案差异](./evidence/UI09-copy-changes.json)。复杂后台规则使用原生“规则说明”折叠区；保存影响、删除后果和覆盖/扣次等确认仍明确显示。删减的是表达冗余，不删页面能力、字段、失败状态或确认后果。

认证使用一个最大 920px 的完整纸面区域：左侧阅读介绍，右侧标题、表单和账号切换；右侧所有控件同宽同起点。手机普通登录/注册仅保留表单，待收录短文/来源返回/承接丢失的必要上下文仍保留。用户名和密码规则只在注册显示并用 aria-describedby 关联；登录保留原校验、错误提示和 Enter 提交。

后台字段使用一致标签、输入高度和行距；搜索按钮与输入底边对齐，计划/消息/预设等编辑页使用清晰的保存区。双列在手机变单列，表格仅在自身容器内横滚。计划规则页可展开查看，提交时再次明确影响；不把所有风险提醒全局折叠。

用户主内容随内容决定高度，删除 75vh 强制撑高、过大的空态和重复上下边距。页标题与内容之间 20–24px，纸面内边距桌面 24px/手机 18px；正文字号、行高与可点击区域保持可读。复习仅在步骤导航保留概览入口，任意题仍可进入概览；保留字母槽→释义→短语顺序。试用全文不截断，生成工作台以预设标题作为唯一主标题，避免重复标题区。

### 全站新增视觉验收

所有条目共用：中英文文案可理解；无重复标题/无决策价值的规则墙；字段与按钮有一致对齐；390/768/1440px 不产生页面横溢。内容型长页不要求压成一屏。此表是本角色验收目标，用户视觉批准仍待审。

| 验收 ID | 当前页面 | 本轮重点 |
|---|---|---|
| UIA-PAGE-002-COPY09 | PAGE-002 · register | 统一认证表面、同宽对齐、注册提示及必要承接上下文 |
| UIA-PAGE-003-COPY09 | PAGE-003 · login | 统一认证表面、同宽对齐、注册提示及必要承接上下文 |
| UIA-PAGE-005-COPY09 | PAGE-005 · library | 共享标题、文案层级、内容驱动高度与响应式间距 |
| UIA-PAGE-006-COPY09 | PAGE-006 · batch | 共享标题、文案层级、内容驱动高度与响应式间距 |
| UIA-PAGE-007-COPY09 | PAGE-007 · range | 共享标题、文案层级、内容驱动高度与响应式间距 |
| UIA-PAGE-008-COPY09 | PAGE-008 · sessiondone | 共享标题、文案层级、内容驱动高度与响应式间距 |
| UIA-PAGE-103-COPY09 | PAGE-103 · users / userdetail | 字段、搜索和保存区对齐，说明按需展开，操作后果保留 |
| UIA-PAGE-201-COPY09 | PAGE-201 · review | 复习核心操作优先，概览可达，结果提示不重复 |
| UIA-PAGE-202-COPY09 | PAGE-202 · overview | 复习核心操作优先，概览可达，结果提示不重复 |
| UIA-PAGE-203-COPY09 | PAGE-203 · summary | 复习核心操作优先，概览可达，结果提示不重复 |
| UIA-PAGE-204-COPY09 | PAGE-204 · create | 共享标题、文案层级、内容驱动高度与响应式间距 |
| UIA-PAGE-205-COPY09 | PAGE-205 · home | 共享标题、文案层级、内容驱动高度与响应式间距 |
| UIA-PAGE-206-COPY09 | PAGE-206 · profile | 共享标题、文案层级、内容驱动高度与响应式间距 |
| UIA-PAGE-207-COPY09 | PAGE-207 · notices | 共享标题、文案层级、内容驱动高度与响应式间距 |
| UIA-PAGE-208-COPY09 | PAGE-208 · models / plans | 字段、搜索和保存区对齐，说明按需展开，操作后果保留 |
| UIA-PAGE-209-COPY09 | PAGE-209 · messages | 字段、搜索和保存区对齐，说明按需展开，操作后果保留 |
| UIA-PAGE-210-COPY09 | PAGE-210 · operations | 字段、搜索和保存区对齐，说明按需展开，操作后果保留 |
| UIA-PAGE-211-COPY09 | PAGE-211 · credits | 共享标题、文案层级、内容驱动高度与响应式间距 |
| UIA-PAGE-212-COPY09 | PAGE-212 · presets | 字段、搜索和保存区对齐，说明按需展开，操作后果保留 |
| UIA-PAGE-213-COPY09 | PAGE-213 · metrics | 共享标题、文案层级、内容驱动高度与响应式间距 |
| UIA-PAGE-214-COPY09 | PAGE-214 · growth | 共享标题、文案层级、内容驱动高度与响应式间距 |
| UIA-PAGE-215-COPY09 | PAGE-215 · bag / shop | 共享标题、文案层级、内容驱动高度与响应式间距 |
| UIA-PAGE-216-COPY09 | PAGE-216 · trial | 配置和完整短文保留，消除重复标题与操作介绍 |
| UIA-PAGE-217-COPY09 | PAGE-217 · explore | 配置和完整短文保留，消除重复标题与操作介绍 |
| UIA-PAGE-218-COPY09 | PAGE-218 · adminhome | 共享标题、文案层级、内容驱动高度与响应式间距 |

## 启动、来源与演示边界

工作目录为本文件所在 `design/`，运行 `python -m http.server 4174 --bind 127.0.0.1`，访问 [首页](http://127.0.0.1:4174/prototype/?page=home&lang=zh&v=M002-UI-16)。不能双击 HTML：模块与文案使用同源 fetch。

原型入口 `prototype/index.html`、横向预设阅读与轮播 `gallery.js`、布局及导航 `prototype/app.js`；`identity.js` 为认证，`learning.js` 为学习，`admin.js` 为模型/计划/用户，`operations.js` 为成长配置，`presets.js` 为预设，`word-picker.js` 为两处共享选词，`growth.js` 为账号成长，`benefits.js` 为卡片确认和组合权益示例。统一文案为 [copy.json](./copy.json)，Token/实际样式为 [theme.css](./theme.css)，业务示例在 `prototype/fixtures.json`。

URL 使用 `page`、`lang=zh|en`、`role=guest|learner`、`state`；页脚“二期交互原型”控制条可切页和状态，不属于生产界面。这里的角色参数仅用于设计审阅，不是生产权限方案。控制条放在内容后，避免遮挡操作。

夹具时刻固定为 2026-09-17 12:00 北京时间。本人批次（含修改后标题）、学习草稿和最小事实用隔离的 `ww-m002-learning-ui06` sessionStorage 模拟；认证、成长、卡片、配置、额度为本页内存演示，刷新不证明服务端持久化。模型是示例名称，预览是确定样文，无真实 AI、账号、监控请求。后台无限预览的次数与前台生成分别示意。

## 页面、区域与验收

表中 PAGE 全部属于当前 M002 基线，包括被继承保留的编号。每一行是可观察验收，固定文案键引用共享源；详细状态在交互文件。前端可调整组件与 DOM 组织，但不能改变内容顺序、作用、文案或业务分支。

| 当前页面 / 验收 ID | 原型入口与状态 | 实际源与区域 | 文案键 | 必须保持的结果 |
|---|---|---|---|---|
| PAGE-002 注册<br>UIA-PAGE-002-01 | `?page=register`<br>username-taken / auth-error；承接与登录互跳 | identity.js · #identity-form / .auth-intent | `i.*` | 用户名、密码、确认密码、规则、提交、登录入口；不增加邮箱/手机；成功先承接当前短文，再提醒正文。 |
| PAGE-003 登录<br>UIA-PAGE-003-01 | `?page=login`<br>auth-error / admin；来源页返回 | identity.js · #identity-form / .auth-intent | `login / i.* / welcome` | 通用认证错误；管理员进入后台，学习者返回原意图；Enter 可提交，密码不落浏览器存储。 |
| PAGE-005 学习记录<br>UIA-PAGE-005-01 | `?page=library`<br>empty / save-error；搜索/续载/删除 | learning.js · .library-stats / #library-query / .library-row | `l.library* / l.stat.* / l.search*` | 六项全库统计→目标词搜索→旧到新批次；显示当前标题，自定义标题下保留目标词条；直接复习、详情、参与开关、删除均保留。返回保留查询与续载；累计成长不因删批次回退。 |
| PAGE-006 批次详情<br>UIA-PAGE-006-01 | `?page=batch`<br>?batch=b1；unavailable / save-error / title-denied | learning.js · .batch-detail / .batch-title-header / #batch-title-form / .resource-grid | `l.detail / l.title.* / l.snapshot / l.resources` | 标题在文章顶部显示并可由本人编辑/保存/取消；整篇原文、标签、原词释义/短语和配置快照仍只读；参与开关、直接复习与删除保持。 |
| PAGE-007 复习范围<br>UIA-PAGE-007-01 | `?page=range`<br>preview-error / preview-loading；非法日期/零命中 | learning.js · .range-editor / #range-from / #range-to | `l.range* / l.dates* / l.matches*` | 最近七天且首尾包含；只筛参与批次；未知数量用横线；编辑不丢焦点。存在未完成范围时可以恢复或确认另开。 |
| PAGE-008 复习会话容器与结束<br>UIA-PAGE-008-01 | `?page=sessiondone`<br>最后一批提交后完成→sessiondone | learning.js · .session-totals | `l.sessiondone* / l.total.*` | 保留本轮完成/成功/失败最小概况，能回库或日期选择；不给历史逐题答案入口。 |
| PAGE-103 用户管理<br>UIA-PAGE-103-01 | `?page=users` / `?page=userdetail`<br>search-error / save-error / unavailable | admin.js · #admin-user-query / .admin-facts | `a.users.* / a.user.* / a.password.* / a.library.*` | 用户名定位、续载、返回保留；详情四分区：资料计划、等级成长、积分、只读学习记录。管理员身份不出现学习者动作。 |
| PAGE-201 复习填写<br>UIA-PAGE-201-01 | `?page=review`<br>?batch=b3；resume / denied / multibatch | learning.js · .review-context / .slots / .hint / [data-region=passage] | `review.* / slot / gap / previous / next / skip` | 拼写标题→字母槽→解释→短语开关；非空前进、不即时判对；短文固定宽空与稳定匿名分组；前退和概览保留输入。 |
| PAGE-202 当前批次概览<br>UIA-PAGE-202-01 | `?page=overview`<br>submit-error / response-lost | learning.js · .answer-row / .answer-link / #submit | `overview.* / wordanswers / passageanswers / submit` | 当前批次词答列表＋填入用户答案的短文；点击回对应位置编辑；全空也可提交；失败可重试，响应丢失先确认状态且不重复结算。 |
| PAGE-203 提交后总结<br>UIA-PAGE-203-01 | `?page=summary`<br>必须由提交进入；直接地址不给历史答案 | learning.js · .result-word / .review-footer | `summary.* / newmastery / restart / nextbatch / finish` | 正确文字标色，错误/未答划线并邻接正确词；重来清本批草稿，下一批前进。离开后的逐题总结不保留。 |
| PAGE-204 造文工具台<br>UIA-PAGE-204-01 | `?page=create`<br>noquota / nomodel / nolength / failure / save-error | app.js generation / creationConfiguration · .creation-settings / #generate / [data-region=generation-result]；benefits.js | `create.* / random / b.* / quota` | 配置可折叠；模型和释义语言显式选，Story/Brief 合法时默认；固定词库、去重、上限及随机避开当前库；完整结果再收录。取消扣次，系统失败返还原来源。 |
| PAGE-205 简洁首页<br>UIA-PAGE-205-01 | `?page=home`<br>normal；中英文/减少动效 | app.js home · [data-region=hero] / .home-path | `hero.* / path.* / sample` | 简洁价值介绍＋造文/试用入口＋两篇带示例标识的 AI 短文；主导航首页、精选、学习、复习、书架，无成长主导航。 |
| PAGE-206 个人资料<br>UIA-PAGE-206-01 | `?page=profile`<br>save-error；改密/注销两次确认 | app.js profile/accountShell · .account-sidebar / #profile-form；identity.js | `profile.* / nickname / gender / i.*` | 头像四项分区共用左资料右内容；昵称空回退用户名；用户名/基础计划只读。改密需当前/新/确认，注销需密码及最终确认。 |
| PAGE-207 消息列表与正文弹窗<br>UIA-PAGE-207-01 | `?page=notices`<br>empty；明确登录后提醒正文 | app.js notices/noticeDialog · .notice-entry / #dialog | `notices.* / notice.* / position` | 列表提醒优先再按时间倒序；登录直接打开对应提醒正文，多条上一条/下一条；隐藏优先，无已读红点。 |
| PAGE-208 模型管理、计划管理（两个独立模块）<br>UIA-PAGE-208-01 | `?page=models` / `?page=plans`<br>missing-key / save-error；引用移除/优先级冲突 | admin.js models/plans · .admin-credential / #plan-limit / #plan-unlimited | `a.model.* / a.key.* / a.plan.* / priority` | 模型、计划两个独立导航。全局密钥脱敏/替换，模型名称说明原始ID启停移除；四个固定计划的模型、长度、词上限、零/不限次数及唯一优先级全量编辑。 |
| PAGE-209 平台消息管理<br>UIA-PAGE-209-01 | `?page=messages`<br>save-error；显示/提醒独立 | app.js messages · #body-zh / #body-en / #dialog | `a.messages* / markdown / visible / remind` | 独立一级消息管理；列表→双语 Markdown→预览→显示/提醒开关→保存；失败保留输入。 |
| PAGE-210 成长运营配置<br>UIA-PAGE-210-01 | `?page=operations`<br>save-error；四页签/多档/奖励引用 | operations.js；app.js itemForm · .tier-table / #item-type | `operations / item.* / reward* / a.tier.*` | 签到与经验、等级、四类成就、四类道具；动态多档含名称说明称号/奖励/启停；道具类型固定、默认未上架，有历史或引用不能删。 |
| PAGE-211 用户管理内的积分操作<br>UIA-PAGE-211-01 | `?page=credits`<br>save-error；非正数/对象确认 | admin.js points · #credit-amount / #found-user | `a.ledger / a.source.* / credit.rule / positive` | 用户详情积分区域及兼容独立视图：余额、来源流水、正数补发确认；不提供扣分、撤回或改经验。 |
| PAGE-212 热门预设管理<br>UIA-PAGE-212-01 | `?page=presets`<br>failure / save-error；预览失效/发布前后 | presets.js · #preset-title / #preset-words / [data-action=preset-publish] | `presets / preset.* / preview.* / publish.*` | 每条仅一个标题，无说明字段；草稿、有效预览、线上快照独立；全部受支持配置、不受访客词上限；无限预览但独立计量；改参数需新预览再手动发布。 |
| PAGE-213 数据分析<br>UIA-PAGE-213-01 | `?page=metrics`<br>empty / delayed；观察中/无来源 | app.js metrics/metricDetails · .metrics-grid / .chart | `metrics.* / uv / pv / wau / retention` | 流量、漏斗、失败、留存、WAU、频次、生成收录、管理员预览指标；分母/排除项可见，D30 未成熟不报零；Clarity 不采私有内容。 |
| PAGE-214 账号成长<br>UIA-PAGE-214-01 | `?page=growth`<br>blocked / disabled / demoted / maxlevel / claim-error | growth.js · .growth-banner / .calendar / .achievement-group / [data-level] | `growth.* / signin.* / reward.* / g.*` | 经验/等级与积分分开；签到自动、补签选择确认；四类成就默认展示当前档，可展开全档；成就/逐级奖励手动整份领取，称号仅个人中心。 |
| PAGE-215 道具卡、兑换中心（两个视图）<br>UIA-PAGE-215-01 | `?page=bag` / `?page=shop`<br>covered / retired / expired / active / lower / insufficient | app.js bag；benefits.js · .items-grid / .benefit-end / #dialog | `bag.* / shop.* / card.* / b.* / covered` | 道具与兑换两视图；兑换确认扣分、使用确认结果；模型逐个累时、计划同档续期/高覆低/低拒绝、次数沿用原期限；下架退积分用实时配置且一次。 |
| PAGE-216 独立预设造文工作台<br>UIA-PAGE-216-01 | `?page=trial`<br>role=guest；invalid / noquota / failure | app.js generation(true) / trialConfiguration · .trial-settings / #generate | `preset.* / create.* / quota / guestcollect` | 展示已发布的单一标题（不随 UI 语言变），无预设说明；试用选择后独立锁定工作台；全部参数只读且需手动生成；配置优先但仍扣身份所属次数；完整生成后沿原收录/注册复习链。 |
| PAGE-217 独立试用目录<br>UIA-PAGE-217-01 | `?page=explore`<br>empty / single；role=guest | gallery.js · .preset-gallery / .gallery-track / .gallery-config / .gallery-passage | `explore.* / gallery.* / model / style / length / explain / words / try` | 先按释义语言 Tab 筛选，再横向自动滚动多篇预设；完整词条/模型/场景/长度/释义语言和已发布完整样文；阅读时停止自动/手动/触控。单标题无说明；我也试试进入对应锁定台，无结果给普通台入口。 |
| PAGE-218 后台概览<br>UIA-PAGE-218-01 | `?page=adminhome`<br>empty | admin.js home · .admin-launch-grid / .metrics-grid | `a.adminhome / a.overview.* / updated` | 后台八模块概览及指标摘要，详细指标进入数据分析；管理员壳不混学习者菜单。 |

## 继承的标题交互验收与来源

| 验收 ID | 页面、区域及操作 | 必须保持 | 允许差异与检查 |
|---|---|---|---|
| UIA-PAGE-005-02 | library / `.library-row`，从详情改名后返回 | 当前标题、原目标词条、六项统计、旧到新顺序；仍只搜目标词，保留查询与已加载范围 | 组件结构可变；浏览器操作及文本/顺序断言 |
| UIA-PAGE-006-02 | batch / `.batch-title-header`、`#batch-title-form`；点击编辑 | 标题→编辑按钮；编辑时标签/输入→辅助提示→就地错误（如有）→保存/取消；空白拒绝、保存持久、取消不改；文案 `l.title.*` 与 `cancel` | 不增加标题字符数产品限制；长标题换行，输入可水平编辑；桌面/手机与键盘检查 |
| UIA-PAGE-006-03 | `state=save-error` / `title-denied`；编辑后保存 | 失败保留输入和已存值，焦点回输入；恢复 normal 可重试。无权/已删除不重建；输入中的标记按文本显示 | 原型只模拟失败，无真实权限验证；生产使用服务端校验 |
| UIA-PAGE-006-04 | 新旧、参与/暂停批次；360/390/768/1440px | 短标题与很长标题均可读；保存/取消可触达；UI 语言切换和刷新保持已存标题；正文资源不变 | 字形随系统可变，布局与功能不得丢失；axe 与实际截图分别记录 |
| UIA-PAGE-103-02 | userdetail → 学习记录 → 只读阅读弹窗 | 当前用户夹具读取与本人库相同标题；列表和阅读一致，管理员无标题编辑入口；其他账号夹具独立 | 不将角色演示当权限方案；真实跨账号请求待实现验证 |
| UIA-PAGE-212-02 | presets / `#preset-title`、`.article`；改标题/保存/发布 | 单输入 `preset.name`，提示 `preset.namehint`；无语言分栏或预设说明。仅标题变化复用有效样文，线上直到手动发布才变 | 可以拆组件；准确文案、单值及发布状态不可变 |
| UIA-PAGE-212-03 | 标题留空、新建、更改生成参数 | 空白拒绝；新建与参数变更需新有效预览；标题文字不改变预览参数签名 | 预览为模拟样文，不代表 AI 品质通过 |
| UIA-PAGE-217-02 / UIA-PAGE-216-02 | explore / `.preset-card h2` → trial / `main h1` | 展示同一已发布标题和样文，无预设说明；切语言标题不变，进入台不生成，配置仍锁定 | 保留必要配置和样文提示；重复操作指引按 COPY09 删除，不恢复预设说明字段 |
| UIA-PAGE-216-03 | trial → 生成 → 收录 → 本人改名 → 复习 | 新批次标题默认仍为目标词连接；私人改名不回写预设。提交前复习不显示可能含答案的标题；复习草稿规则保持 | 浏览器模拟链；真实 AI、持久化、并发/服务端权限另验 |

标题编辑继续沿用 UI-06：未新增页面或改主导航。文章顶部使用与正文一致的阅读字号，编辑表单就地展开以保留上下文；手机编辑按钮移至标题下方，保存/取消并排。过渡为即时状态切换，保存等待态与服务器反馈对应，原型 450ms 仅用于演示。主题、固定文案与详细状态分别由各单一来源维护。

## 试用目录呈现验收 · UI-07

用户本轮三点原话由 `evidence/UI07-reception.json` 保存，属于当前设计呈现指令。PAGE-217 / CAP-218 / DATA-212 的完整样文和配置来自同一已发布对象，不从编辑草稿拼装；新增 `gallery.js` 管理轮播生命周期。样例 `sampleText` 明确表示完整正文，不再用 excerpt 摘要冒充全文；样例文本仅为原型夹具，没有真实 AI 调用。

| 验收 ID | 区域与顺序 | 必须保持 / 检查方法 |
|---|---|---|
| UIA-PAGE-217-03 | 标题与导语→轮播控制→横向卡片；卡内 `.gallery-config` 为序号/预设标题→模型/场景/长度/释义语言→完整词条→我也试试；`.gallery-paper` 为全文标记→完整分段正文→样文说明 | 不折叠、截断或用摘要替代正文；模型是展示名称，场景/长度/语言标签本地化；标题和英文正文不随 UI 语言改变。依据夹具逐字段/逐段断言并查看真实截图。 |
| UIA-PAGE-217-04 | PAGE-217 横向阅读与 UI-11 中断规则 | 每 8 秒自动；控件仅前后与计数，任意阅读/交互停止本次自动，离开再入可重启。减少动效/隐藏/离屏关闭或暂停；单条禁用切换，空态无定时器；触控和方向键/Home/End 保留。当前验收以 CAR11 为准。 |
| UIA-PAGE-217-05 | PAGE-212 保存草稿/发布→目录→我也试试→PAGE-216 | 草稿不影响展示，发布同步更新完整正文与配置；点击对应卡跳对应预设，进入不生成、不扣次，配置不可编辑。以浏览器实际操作和对象/内容对照验证。 |

这是横向分页式自动滚动，保留下一卡边缘提示。宽屏配置与正文并列，手机配置在前、全文在后，不固定正文高度。详细中断规则、时序与键盘约束分别在交互、响应式文档；组件拆分可变，正文完整性及操作结果不可变。前端/QA 接收时替换 UI-06 双列摘要卡预期，其余批次标题及页面行为保持。

## 释义语言筛选验收 · UI-08

**UIA-PAGE-217-06 / PAGE-217 / CAP-218 / DATA-212**：在页面标题/导语之后、轮播控制之前增加 `.gallery-language-tabs`。顺序为全部、中文、英语、日语，显示每类已发布预设数量，默认全部；语言来自预设的释义语言，不从正文或 UI 语言推断。当前支持的语言与预设配置一致，后续平台语言变化由实现共用配置来源。

选择 Tab 后只显示匹配的完整预设，将位置重置为第一项并暂停自动；多条转为手动浏览，单条禁用前后/自动。零匹配保留 Tab，显示 `gallery.filter.empty / emptydesc` 和 `gallery.filter.reset`，可一键回全部；全目录无内容沿用普通造文入口。切换中英文 UI 保持筛选条件，仅翻译标签；标题/正文/配置不改。筛选后“我也试试”按原发布对象索引跳转，不能使用筛选后位置选错预设。

Tab 使用 tablist/tab/tabpanel、选中态与单一 Tab 停靠点；左右方向键循环、Home/End 首尾，激活后焦点留在对应 Tab，窄屏自动让当前 Tab 可见。保留横向滚动，页面不溢出。浏览器检查筛选数量、全文、空态、语言切换、焦点、正确预设/额度、单条和离开再入后的自动行为；在 320/390/1440px 核对布局及 axe。原型第二条夹具改为英语释义以演示筛选，日语演示空态；没有生产内容修改或新增预设。

## 动态内容与格式

| 文案键 / 变量 | 含义、缺值和格式 | 检查条件 |
|---|---|---|
| `welcome` / name、elapsed；`welcome.elapsed` / days | 昵称空时用户名；距上次有效学习的学习日差，不取上次登录。无学习用 `g.welcome.new`，不显示 NaN。 | 明确登录、首次注册、有/无学习、04:00 边界。 |
| `progress` / current、target | 累计经验与下级门槛；满级用 `maxlevel` 并保留累计经验。 | 260/300 为夹具，奖励/配置变化后重算，不写死 Lv.3。 |
| `b.quota` / plan、extra | 当前有效计划剩余与已启用额外次数；无限明确文字，不能把 0 当无限。 | 模型卡不增加次数；体验续期不清已用量；预设仍按当前身份扣次。 |
| `useby`、`ends` / date；`b.extension` / days、date | 获得后的启用期限与逐模型/计划体验结束分开；原型用北京时间 YYYY-MM-DD HH:mm。 | 部分重叠逐模型累时，期限内启用给足时长。 |
| `reward` / points、xp；`pricevalue` / count | 领取时配置的奖励/价格；模型退换读取当前下架积分。业务数字为变量。 | 整份奖励不可用时积分/经验也不提前发；已完成退换金额不追改。 |
| `slot`、`gap` | 字母或空位序号，无答案；短文空固定宽、同原词不同词形共享匿名组。 | 多词条空格/标点分组；辅助名称不能泄露答案。 |
| 批次标题、预设标题 | 各对象一个普通文本值；默认批次标题为原目标词顺序以 ` · ` 连接。UI 切换不翻译、不取另一语言标题。 | 自定义长标题、标记字符、刷新；私人标题与公开预设独立。 |
| 消息、成就、道具等其他运营内容；AI 学习内容 | 既有双语运营内容缺一种时回退原文；AI 内容保持生成时语言。未知指标用暂无样本/观察中/未知。 | 空列表/隐藏通知/未成熟留存。 |

## 详细规则与实现自由

状态、动作和异常的完整规范见 [interactions.md](./interactions.md)；断点、输入、键盘、对话框、动效和字号规则见 [responsive-accessibility.md](./responsive-accessibility.md)。分组表格允许内部横滚，页面不得整体溢出；日期编辑器沿用 1080/1081px 边界，工作台折叠用 1100px，不混为一个断点。

本稿的组件拆分和状态变量不是后端设计。前端接收后需将共享文案、Token 与模块区域映射进正式框架；数据层使用批准 API/DTO，不复制 fixtures 或设计内存逻辑作为生产权益算法。模型卡按稳定模型身份关联，原型用名称只是可读夹具。服务端对额度、奖励、掌握去重、下架资格、密码/权限及删除执行最终校验与幂等。

## 设计自检与接续

实际浏览器方法、当前结果、逐图人工检查和未覆盖范围见 [validation.md](./validation.md)。UI22 修改前记录见 [UI22-reception.json](./evidence/UI22-reception.json)，本次文档补充记录见 [UI22-H01-reception.json](./evidence/UI22-H01-reception.json)，最终摘要见版本清单。此前 UI-04 旧规格引用旧批准、试用目录/后台概览合用旧 PAGE、固定奖励样例的问题由此版替代。

CR 的产品补正已有独立批准；本角色仅提交设计接收和覆盖证据，不自行关闭 CR 或推进阶段。需经本稿设计审阅后由守门器登记；不把未执行的技术/独立 QA/新会话交接称为完成。M001 遗留 CR039-L1、CR042-L1、AI-QUALITY-90 保持原状态。


## UI29 / PAGE208 通用模型配置

参考092输入重建模型区域，删除OpenRouter专用配置面板与旧表格；列表使用generic-model-list/row，显示名→连接/模型ID→URL/协议/密钥状态→操作。添加/编辑按显示名称、模型ID、连接、服务商名称、协议、URL、Key、高级选项顺序。没有默认模型按钮。文案gm.*，样式theme.css末尾UI29；原型?page=models&lang=zh，empty/save-error场景沿原入口。UIA-MODEL29：1440/390中英列表与表单、协议切换保留输入、密码不回显、必填错误保留、删除影响、测试反馈。旧UI28此区域失效，其他区域继承。设计是用户指定方向的实现依据，新视觉尚未由用户逐图验收。

UI29实现接收补充：高级选项增加“结构化输出（OpenAI 协议）”开关与gm.structured.help，用于显式声明JSON Schema支持；Anthropic不发送该参数。取消未保存确认、CAS刷新保留修改按gm.*来源。已配置连接列表以名称/协议展示，密钥只脱敏。上述并非默认模型选择。
