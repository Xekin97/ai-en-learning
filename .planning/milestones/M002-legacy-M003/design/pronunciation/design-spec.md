---
milestone: M003
version: M003-UI-14
agent_name: designer-tony
status: awaiting_user_review
date: 2026-10-15
input_version: M003-PRODUCT-11 / TRANSITION-M003-107
visual_baseline: M002 plus accepted M003-UI-11 / M003-UI-12 / M003-UI-13-R4
---

# M003-UI-14 单词发音设计

## 当前目标与有效范围

- `CONFIRMED / USER-M003-PRONUNCIATION-DESIGN-NEXT-20261015`：在仍进行中的 M003 内，为 PAGE-401～403 交付独立交互原型与基于现有完整页面的正式设计；M003 整体未批准收尾。
- 产品真源为 [M003-PRODUCT-11](../../product/pronunciation/overview.md)：DATA-401～404、CAP-401～404、PAGE-401～403、AC-401～410。游客、普通及付费用户均免费；播放不扣造文额度，不触发模型请求。
- 本设计只在 `/create` 搜索候选/已选词、GenerationVocabularyList 的计划和完成词义、`/library/[batchId]` 单词学习卡标题旁增加播放入口。正文高亮词不新增弹窗；explore、后台、复习不新增入口。
- 现有造文工具台、居中 760px 阅读列、窄屏铺满、UI11 词义列表、UI12 完成后编辑/再次生成及 UI13-R4 内容/Motion 均保持。发音是词条标题旁的局部动作，不重排生成主任务。
- 交互原型与正式设计是两套不同入口。原型只验证播放状态与中断；正式稿包含实际完整页面、现有设置/导航/文章/学习卡层次及新增控件的准确位置。
- 设计入口前的主体与交接快照为 `reviews/evidence/pronunciation-design-entry-107/before-design-entry.tar.gz`。本版当前源快照及 SHA 见 `evidence/M003-UI-14-source-manifest.json`；旧 `design/theme.css`、`copy.json`、`prototype/**` 未改。
- `OPEN-401～403` 仍由技术阶段处理。静态演示不选择真实词典提供方，不证明网络、音频许可、声学质量或设备语音可用。

## 页面、能力、数据追踪

| 页面 | 新增设计区域 | 能力 / 数据 | 产品验收 |
|---|---|---|---|
| PAGE-401 `/create` 选词 | 已选词 token 的播放键；搜索候选行内独立的播放键与添加键 | CAP-401～404；DATA-401～404 | AC-401/402/405/407/408 |
| PAGE-402 计划/完成词义 | GenerationVocabularyList 的每个现有词标题右侧播放组；状态只占当前词条内局部空间 | CAP-401～404；DATA-401～404 | AC-401～409 |
| PAGE-403 已收藏文章 | `study-resources` 学习卡标题右侧播放组；正文和上下文释义不变 | CAP-401～404；DATA-401～404 | AC-401～407/409 |

## 设计目标与表达

播放键使用现有绿色、暖白纸面、圆角与 Lucide 线性图标关系。默认只显示 40px 圆形扬声器按钮；390px 及以下为 44px。存在两种真实口音时，右侧增加独立菜单触发键；单口音和未知口音不出现虚假选择。状态文本只在发生准备、播放、回退或失败的当前词旁显示，阅读主线仍是英文词、释义和用法。

PAGE-401 的候选行不再把整行同时承担“选择”和“播放”。词文本、播放、添加是三个可辨识区域；组合框的既有 Enter 选择语义仍由实现映射到添加。已选词 token 保留删除动作，新增播放在删除前。移动端已选词统一占满可用行宽，词文本区域可收缩并在必要时换行；规则不按具体单词写死，词文本不得因新增控件被省略。

来源只在发生动作后显示：“词典录音”或“浏览器朗读”。所选口音不可用且只有其他英语声音时，显示原因和“使用可用英语声音”，必须由用户再次选择。完全失败显示局部重试，不覆盖词义、文章或设置。

## 打开与复现场景

仓库根目录运行：

```sh
python3 -m http.server 4175 --bind 127.0.0.1 --directory .planning/milestones
```

- 交互原型：`http://127.0.0.1:4175/M003/design/pronunciation/prototype/`
- 正式设计：`http://127.0.0.1:4175/M003/design/pronunciation/formal/`
- 当前预览进程：PID `1513`，只绑定 `127.0.0.1:4175`，静态根为 `.planning/milestones`。
- 文案：`copy.json`；局部样式：`theme.css`，其唯一继承源为现有 `../theme.css`；共用状态控制：`controller.js`。
- 正式设计读取 `../fixtures/ui13-r3-bookshop.json` 的 `generation.validated` 六词/四段结果，不调用 provider。等待条件为 `#app:not([aria-busy])`。

| 目的 | 稳定入口 | 可观察内容 |
|---|---|---|
| 独立交互原型 | `prototype/?lang=zh&scenario=dictionary` | 三个词的点击、跨词取消和来源；无产品导航/完整页冒充 |
| 回退/手势/完全失败 | `prototype/?scenario=fallback|gesture|unavailable&lang=en` | 浏览器来源、第二次手势、明确失败与重试 |
| 口音选择失败 | `prototype/?scenario=accent&menu=1&lang=zh` | 英/美菜单；选定口音失败后显式改用可用英语声音 |
| PAGE-401 正式稿 | `formal/?page=picker&lang=zh&scenario=dictionary` | 完整工具台、搜索候选/已选词、空白造文纸；演示面板默认收起 |
| PAGE-401 长词定向复验 | `formal/?page=picker&lang=en&scenario=dictionary&longwords=1` | 390px 下普通 `communication` 与带口音菜单 `pronunciation`；只用于设计布局检查 |
| PAGE-402 计划 | `formal/?page=plan&lang=zh&scenario=dictionary` | 完整工具台与六条计划词义，当前词播放状态 |
| PAGE-402 完成 | `formal/?page=result&lang=en&scenario=fallback` | 四段文章、六条词义、浏览器回退；390px 验证入口 |
| PAGE-403 已收藏 | `formal/?page=library&lang=zh&scenario=accent&menu=1` | 已收藏短文、学习卡、侧栏及口音菜单 |

正式稿底部“切换页面与发音状态”是默认收起的设计 harness，不进入产品。原型/正式稿的 420ms/1350ms 只用于确定性演示，不能作为生产网络超时或音频长度。

## 页面与内容定位

| 页面/区域 | 元素顺序 | 文案键 | 正式稿定位 | 显示规则 |
|---|---|---|---|---|
| PAGE-401 已选词 | 英文词 → 播放 → 可用时口音菜单 → 删除 | `pron.playWord`、`pron.chooseAccent`、`pron.removeWord` | `#pron-page-401-picker .pron-selected-list` | 播放与删除互不触发；token 内状态汇入选词区单一 live slot |
| PAGE-401 候选 | 英文词 → 播放 → 添加 | `pron.playWord`、`pron.addWord` | `#pron-results .pron-search-row` | 播放不添加；添加不播放；active option 背景沿用 WordPicker |
| PAGE-402 词义 | 词标题 + 播放组 → 释义 → 用法 → 当前状态 | `pron.*` | `#pron-page-402-plan|result [data-entry]` | 计划/完成共用；无目标词不渲染播放 |
| PAGE-403 学习卡 | 词标题 + 播放组 → 上下文释义 → 短语 → 当前状态 | `pron.*` | `#pron-page-403-library .resource-grid [data-entry]` | 正文 mark 保持只读；不新增正文弹窗 |
| 口音菜单 | 真实可用口音列表 | `pron.uk`、`pron.us`、`pron.neutral` | `.pron-menu[role=menu]` | 仅至少两种可用口音时显示触发键；移动端菜单贴底但不遮当前按钮焦点恢复 |
| 来源/失败 | 状态文本 → 必要时单一后续动作 | `pron.preparing`、`pron.playing.*`、`pron.fallback`、`pron.gesture`、`pron.unavailable`、`pron.accentUnavailable` | `.pron-status-slot[role=status]` | 只写真实来源；失败不替换词义或页面内容 |

动态模板：`pron.playWord/replayWord/chooseAccent/addWord/removeWord` 的 `{word}` 为当前 DATA-401 原文；`pron.statusPreparing/statusPlaying/statusUnavailable` 同理。变量按文本渲染，不拼接 HTML。若 word 缺失，不渲染播放控件。

## 精确样式与资源

- 基座 Token、字体、卡片、按钮、导航、WordPicker、`m003-vocabulary-list`、`study-resources` 均来自现有 `design/theme.css` → M002 主题。本地 `theme.css` 只维护 `--pron-*` 与发音区域覆盖。
- 图标使用设计内联的 Lucide 关系：volume、chevron、info；前端应映射到现有 `AppIcon`，不另找风格不同的图标。无位图与远程字体。
- 控件尺寸：桌面 40px 圆形播放键；移动/触控 44px。状态文字 12px/1.55；菜单最小 164px、移动端左右各 12px 贴底。
- 正常、准备、播放、失败的颜色和动画只引用 `theme.css`。播放键不能以颜色作为唯一状态；同时有 icon pulse、`aria-pressed` 和文字状态。

## 实现约束与验收

| 验收 ID | 页面/来源 | 必须保持的结果 | 允许差异 | 充分证据 |
|---|---|---|---|---|
| UIA-M003-439 | PAGE-401 / AC-401/402/408 | 每个已选词和可见候选有独立播放；候选播放不添加、添加不播放；删除不播放 | Vue DOM 可不同 | 键盘/点击操作后选中词数量、状态与请求目标断言 |
| UIA-M003-440 | PAGE-402/403 / AC-401/408 | 播放只在现有词标题；计划/完成/已收藏均对应当前词；正文不新增入口 | 组件可复用 | 三个区域的可见数量、名称和点击目标 |
| UIA-M003-441 | CAP-402 / AC-403 | 词典成功不启动浏览器；缺词/空音频/失败/技术阶段定义的超时只进入一次浏览器路径，显示真实来源 | 等待值由 OPEN-403 定义 | 可控 adapter 序列 + UI 来源文本 |
| UIA-M003-442 | CAP-403 / AC-404 | 双/单/未知口音只展示真实选择；选定口音失败不得静默换成另一口音 | 菜单 DOM 可不同 | 三类 fixture 与显式改用动作 |
| UIA-M003-443 | CAP-404 / AC-405 | 新播放取消旧播放；同页至多一条；迟到结果不抢播；同词重播从头；入口移除/离页取消 | 实现可用 AbortController/序号等 | A→B、late A、unmount/route、同词重播时序断言 |
| UIA-M003-444 | CAP-402 / AC-406 | 无英语声音、API 不支持、voices 延后、手势限制及双路径失败都有有限终态和重试 | 精确阈值待 OPEN-403 | 失败 fixture 与焦点/状态收敛 |
| UIA-M003-445 | S403 / AC-407 | 游客/普通/付费在原有可访问页面免费播放；额度耗尽不禁用；无升级/造文扣次/模型请求 | 既有权限仍有效 | entitlement/请求/额度断言 |
| UIA-M003-446 | CAP-404 / AC-409 | 播放不阻塞生成流、保存和阅读；不修改文章/释义/配置，不产生永久历史 | 无 | 并发操作与应用模型断言 |
| UIA-M003-447 | AC-402 | 键盘名称含当前词；菜单 Escape 关闭并回焦；状态 polite；移动触控≥44px；不只靠颜色 | 焦点环按现有 Token | 1440/390 键盘、a11y snapshot、bounding box |
| UIA-M003-448 | 正式视觉 | 完整页面保持现有导航、设置 select、工具台、760px 阅读列与移动铺满；普通/带菜单长词均完整可识别，无横溢 | 字体抗锯齿不作像素硬门槛 | 代表截图 + 结构/bounds；当前浏览器证据 |
| UIA-M003-449 | OPEN-401～403 / AC-410 | 实现验收必须另补真实来源许可、真实音频/网络及浏览器设备证据；设计替身不得充当 | 无 | 技术/QA 原件，不能引用本设计截图替代 |
| UIA-M003-450 | 范围边界 | explore/后台/复习无入口；无全文/短语播放、偏好设置、下载或新路由 | 无 | 路由/组件使用处清单与负断言 |

## 设计自检与未决项

- 浏览器检查为需求验收模式：1440 与 390、中文与英文、正常/双单口音/回退/手势/完全失败/取消/键盘/reduced motion。最终 `12/12 PASS`，console/page error `0`，provider call `0`；详见 `evidence/M003-UI-14-browser.json`。
- 原完整矩阵保存 5 张截图，实际目视其中 4 张正式设计：选词桌面、计划桌面、完成态 390 英文、已收藏桌面口音菜单。发现并修正移动已选词被控件挤压、背景设置/页头偏离基线与 Skip link 非焦点截图伪影。随后仅对受影响路径增加 1 张 390px 长词截图并目视：普通 `communication` 的文本宽度/滚动宽度为 `110/110px`，带菜单 `pronunciation` 为 `99/99px`；两者 token 均为 `316×52px`，所有播放、菜单和删除目标均为 `44×44px`，页面横向溢出为 `0`。定向报告 `evidence/M003-UI-14-long-word.json` 为 `4/4 PASS`。
- 失败过程分别保存在 `browser-run-00-infra-failed.json`、`browser-run-01-failed.json`、`browser-run-02-failed.json`、`browser-run-03-failed.json`、`browser-run-04-check-failed.json`，没有覆盖为通过。
- `copy.json`、两套入口和浏览器 DOM 均消费同一局部文案/控制器；两套入口目的与外观不同。JSON/JS 语法、ID 唯一性、移动无横溢均通过。
- 未验证：真实词典/API/音频、许可/署名、部署网络、声学质量、设备兼容与生产超时。它们仍是 OPEN-401～403，责任不转移给设计。
- 本版待用户评审，未批准、未授权技术或实现，也不表示 M003 整体收尾。
