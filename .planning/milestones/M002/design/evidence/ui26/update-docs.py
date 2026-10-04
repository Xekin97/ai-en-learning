from pathlib import Path
D=Path(__file__).resolve().parents[2]
names=['design-spec.md','interactions.md','responsive-accessibility.md','frontend-delta.md']
for n in names:
 p=D/n;s=p.read_text().replace('version: M002-UI-25','version: M002-UI-26').replace('v=M002-UI-25','v=M002-UI-26');p.write_text(s)
p=D/'design-spec.md';s=p.read_text().replace('# 二期设计规格 · M002-UI-25','# 二期设计规格 · M002-UI-26')
a=s.index('当前 **M002-UI-25**');b=s.index('## UI25 用户文案',a)
s=s[:a]+'''当前 **M002-UI-26** 执行用户“优化造文工作台里的选词以及管理台预设配置里的选词功能交互”的请求，继承 [UI25 快照](./evidence/M002-UI-25.tar.gz) 的文案清理及 PRODUCT04 已接收能力。当前角色仍为 064 接收后的 designer-tony。本轮是现有 CAP-006/208/218 的交互重设计，无新增业务字段或接口要求。PRODUCT05 的一次提醒计数范围 **D2-88-LOCAL-SCOPE / CR026 仍 OPEN**，不据此实现缓存行为。

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

'''+s[b:]
s=s.replace('`presets.js` 为预设，','`presets.js` 为预设，`word-picker.js` 为两处共享选词，')
p.write_text(s)
p=D/'interactions.md';s=p.read_text();a=s.index('当前 UI25');b=s.index('## UI25',a)
s=s[:a]+'''当前 UI26 执行用户的两处选词交互优化，继承 UI25/PRODUCT04；CR026 计数范围仍待确认，不改变登录提醒次数。文案真源 copy.json，样式 theme.css。

## UI26 搜索和连续选词

两处共用 word-picker.js。点击输入框并输入时显示候选；前缀优先于包含，大小写不敏感，选中项显示“已添加”并不可重复操作。输入发生变化时高亮首个可添加候选；上下键在可用项间移动，Enter 只加入当前高亮候选。鼠标点击与键盘结果相同，加入后清空查询、收起列表并回焦搜索框。没有候选时 Enter 不创建新词。

Escape 收起候选且保留查询，不触发外层关闭；Tab 收起并按页面顺序前进，点击组件外部也收起，均不提交未确认的候选。重新聚焦可打开已有查询。清除按钮仅清空查询并回焦输入，不清空已选词；每个词签的移除按钮只删除该词，之后聚焦相邻移除按钮，全部移除后聚焦搜索。空态不占用多个屏高。语言重绘保持已选词和查询；预设切换加载对应草稿并清空搜索。

中文输入法合成期间的 Enter 不添加单词；合成结束后再计算候选。加载时展示 picker.loading，不列出旧查询候选；错误展示 picker.error 和重试，已有选择不丢失。原型重试在本地恢复；生产对请求取消和过期响应的处理沿批准技术方案，不允许旧响应覆盖当前查询。

普通台达到计划上限：候选添加、随机按钮禁用，搜索/清除/移除保留并显示 picker.full；移除后立即恢复。随机一次加入一个未选且不在当前复习库的候选，无可用词时保留原选择并沿用 random.none。生成中及成功待收录期间选词不可编辑，取消/失败/结束后的原状态规则保持。

后台没有普通计划词数上限；每次增减先保存其他当前输入，修改对应草稿的完整 words 集合，立即令旧预览过期并禁用发布。旧正文与释义仍组成一个快照，重新预览成功才共同更新；保存失败保留当前草稿。预览中选词禁用。标题单独编辑、发布/下架与线上样本隔离均沿原流程。只读试用没有此搜索或移除入口。

全部选词状态即时切换，保留现有 focus 样式，不新增业务 Toast 或装饰动画；简短成功/移除/搜索结果数通过局部 live region 反馈。

'''+s[b:];p.write_text(s)
p=D/'responsive-accessibility.md';s=p.read_text();anchor='## UI25 文案清理与消息列表'
s=s.replace(anchor,'''## UI26 选词布局与键盘

选词位于普通工作台右侧卡片、后台标题与模型配置之间。头部数量贴近标题，随机操作在右侧；标签区浅绿底，词签自然换行且保持完整词条。搜索为单独有 label 的整行输入，候选宽度跟随输入框；匹配加粗，勾选与文字共同标识已选，避免只用颜色。

搜索输入容器最小 48px，词语移除/清除按钮桌面 36px、≤600px 为 40px，候选最小 46px。头部窄屏可换行；候选列表限高 280px，手机为 min(250px,40dvh)，内部滚动。列表浮在后续内容上方，选择、Escape、Tab 或外点后收起；不为列表预留大块常驻空白。后台七词、多词短语与标点、中英文在 1440/390/320px 无页面横溢。视觉原件和验证范围见 validation.md。

搜索 input 使用 combobox / expanded / controls / activedescendant，候选 listbox 及 option 以 selected/disabled 表示状态。输入保持焦点，方向键切换高亮，候选不新增 Tab 停靠点；标签移除有包含词语的准确可访问名称。局部 role=status / aria-live=polite 宣读添加、移除和搜索结果；满额说明由 aria-describedby 关联。禁用时保留原词可读，搜索、移除、随机不可操作。

选词无新增持续动效，reduced-motion 不影响结果。当前浏览器为 Chromium；真实移动键盘、Safari/Firefox、辅助读屏仍须正式实现阶段验证，DOM 语义检查不能替代实际读屏验收。

'''+anchor);p.write_text(s)
p=D/'frontend-delta.md';s=p.read_text().replace('UI22 → UI25 前端设计差异明细','UI22 → UI26 前端设计差异明细').replace('当前 UI25 是待审视觉修订','继承的 UI25 是待审视觉修订').replace('当前 UI25 继承','当前 UI26 继承')
anchor='## UI24 → UI25 文案清理 / D2-89'
s=s.replace(anchor,'''## UI25 → UI26 选词交互

本次用户明确要求优化普通工作台及后台预设选词。当前 UI26 待审，继承 UI25 及旧版仍有效的业务；旧原生候选框/独立添加按钮和后台逗号字符串输入不再作为新设计依据。

| 区域 / 验收 | 正式实现定位 | 新设计与接入要求 |
|---|---|---|
| 普通工作台 / UIA-PAGE-204-WORDS26 | [GenerationWorkspace.vue](../../../../frontend/app/presentation/components/GenerationWorkspace.vue) | 共享词签与搜索候选；点选/Enter 加入、移除、清空查询、上下键/Escape/Tab、重复标记、上限及剩余量、随机入口。有效计划、生成过程禁用及随机排除当前库的原逻辑保持。 |
| 后台预设 / UIA-PAGE-212-WORDS26 | [presets.vue](../../../../frontend/app/pages/admin/presets.vue) | 替换逗号输入与 split 处理，采用完整已选词集合和同一候选组件。没有普通计划词数限制；改词先保留其他表单值，并使预览签名过期，旧线上样本不变。 |
| 只读试用 | 同上 GenerationWorkspace 的 trial 模式 | 保留只读词签与实际数量，不显示搜索、随机、移除和普通上限。 |

设计源 [word-picker.js](./prototype/word-picker.js)、app.js/presets.js 接线、copy.json 的 picker.* 及 theme.css 的 `.word-picker* / .word-token`。前端按既有 Vue 状态/组件体系转换，不复制 prototype DOM 重绘或内存数据。搜索复用已有词库接口/数据访问层、保留服务端前缀优先和稳定词条标识，按完整条目去重；多词和标点不拆分、不制造任意词条。原型 fixture 小词表不等于正式词库，也不能据此新增前端全量下载要求。异步搜索的取消/过期响应、错误/重试和请求节流延续既有技术方案。

本次不增加选词时词义接口；预设释义仍来自成功预览并与正文同快照。沿用当前数据合同与服务端权限/上限校验，组件 UI 禁用不取代最终校验。需同步 [交互](./interactions.md)、[响应式](./responsive-accessibility.md)、[准确文案](./copy.json) 和 [验证](./validation.md)。未改正式应用，不能将原型验收写为生产 QA。

'''+anchor)
s=s.replace('从 UI22 批准快照确认视觉版本，从 H01 补充包确认本差异文档','先确认当前 UI26 的待审范围，按用户后续批准对应的快照接收；UI22/H01 仅作为旧批准来源')
p.write_text(s)
