---
milestone: M002
version: M002-UI-32-R3
agent_name: designer-tony
status: awaiting_user_review
date: 2026-10-16
input_version: M002-PRODUCT-08 plus CR-314
---

# 单词发音设计

## 当前目标与有效范围

用户确认每词一个紧凑图标控件、取消选词发音，并明确不显示任何操作/状态文本；单个音源也不显示来源文本。[CR-314](../../changes/CR-314.md) 是对已接受产品 S402/PAGE-401/AC-401、408 的明确范围修订，未再次批准整套设计。M002 继续进行；当前仅设计，未进入技术/实现。

仍有效：[产品基线](../../product/pronunciation/overview.md) DATA-401～404、CAP-401～404、AC-401～410，所有用户免费、不扣额度、不调用大模型。保留完整工具台、已保存文章、词义与用法、现有绿色/暖白/阅读字体层次。正文高亮词、后台、复习与 explore 不增播放入口。

旧 M002-UI-32（原 M003-UI-14）的 PAGE-401 发音、独立状态卡、移动贴底菜单已失效；R1 的可见操作/状态文字、单音源来源文字也已失效。R2 的带框底色、固定按钮块与内边距退出当前标准；R2 源快照和证据保留。R1 源快照保存在 evidence/M002-UI-32-R1-source.tar.gz，旧验证证据仍在 evidence 目录。旧 [源清单](../../../M002-legacy-M003/design/pronunciation/evidence/M003-UI-14-source-manifest.json) 保留；新源写入本目录，继承旧共享视觉主题与书店 fixture。修订前控制文件/交接保存在 [快照](../../reviews/evidence/pronunciation-revision-132-r3/before-revision.tar.gz)。本版源及 SHA 见 [当前清单](evidence/M002-UI-32-R3-source-manifest.json)。

## 页面、能力与内容定位

| 页面/区域 | 元素顺序与当前规则 | 追踪 | 稳定定位 |
|---|---|---|---|
| PAGE-401 选词 | 已选词为单词、删除；搜索候选为单词、添加。没有播放或播放状态 | CR-314 覆盖 S402/AC-401/408 的选词部分 | `#pron-page-401-picker` |
| PAGE-402 计划/结果 | 单词标题 + 紧凑控件；下方继续显示释义、用法 | CAP-401～404 / DATA-401～404 / AC-401～409 | `#pron-page-402-plan`、`#pron-page-402-result` 内 `[data-entry]` |
| PAGE-403 已保存文章 | 单词标题 + 同款控件；原上下文释义、用法保持 | 同上 | `#pron-page-403-library .resource-grid [data-entry]` |
| 每词播放组 | 单音源仅图标；多个实际可选音源才有当前音源/口音名称 + 菜单段 | CAP-402/403/404 | `[data-pron-control]` |
| 加载、失败和恢复 | 原按钮原位切换图标；失败/手势原位重试；口音不可用由原图标打开菜单明确选替代 | AC-403～406 / CR-314 | `[data-pron-play]`、`[data-pron-source]`（仅多音源） |
| 口音菜单 | 紧贴所属控件右下方，不改为手机底部面板 | CAP-403 / AC-404 | `.pron-menu` |

不在释义下增状态行，不显示跨词播放器或通知。读屏播报节点也在对应控件内。播放图标不独立成为第二个操作目标。

## 设计表达与真源

单音源仅 18×18px 的裸播放图标；无操作、状态、来源、英语或口音文字，也不通过悬浮 tooltip 再显示这些内容。加载用转圈图标、播放用声波、失败/再次手势用重试箭头，完成恢复扬声器。图标区别在减少动效模式也成立。

多个真实可选音源才在图标右侧显示当前音源/口音标签与箭头；本样例为英音/美音。标签只表明选择项，不附加“播放”“词典”“播放中”等动作/状态。词典请求与浏览器兜底不自动作为两个用户选择项；数量以实际可选资源为准。单音源失败/回退后仍不新增来源文字。无障碍名称保留实际来源信息。

- 布局、颜色和 Motion 真源：[theme.css](theme.css)。移除边框、底色、阴影和内外边距；主按钮按 18px 图标排版，多音源标签按内容宽度排版，以 8px 间隔分开独立操作；不会随状态改变尺寸。
- 文案真源：[copy.json](copy.json)。可见部分仅多音源名称 `pron.uk/us/english`；`pron.status*`、`pron.playWord/replayWord/chooseAccent` 等用于非可见可访问名称与 polite 播报。已移除 R1 的 `pron.compact.*` 文案。
- `{word}` 对应 DATA-401 当前原词，缺失则不渲染；`{source}` 使用实际路径，只用于无障碍描述。未知口音不伪造英美标签。动态变量文本转义，fixture 不是生产资源清单。
- 图标在 [controller.js](controller.js)，前端映射现有 AppIcon 的 volume、loader、audio-lines、rotate-ccw、circle-alert、chevron/check。无新图片、远程字体。
- 状态和选择：[interactions.md](interactions.md)；响应式/键盘：[responsive-accessibility.md](responsive-accessibility.md)。

## 打开与复现

产品仓库根目录运行 `python3 -m http.server 4175 --bind 127.0.0.1 --directory .planning/milestones`。目前服务已运行。正式设计入口为 <http://127.0.0.1:4175/M002/design/pronunciation/formal/?page=result&lang=zh>；交互原型为 <http://127.0.0.1:4175/M002/design/pronunciation/prototype/>。两者用途不同，前端布局以正式稿为准。

| 场景 | 参数或入口 | 观察 |
|---|---|---|
| 选词移除验证 | `formal/?page=picker&lang=zh` | 完整工具台，搜索/已选词无发音 |
| 计划词义 | `formal/?page=plan&lang=zh` | 六个词的就地控件 |
| 生成完成 | `formal/?page=result&lang=zh` | 四段短文、六词释义、紧凑控件 |
| 已保存文章 | `formal/?page=library&lang=en` | 既有文章与学习卡 |
| 降级及异常 | 上述入口加 `scenario=fallback|gesture|unavailable|accent` | 点图标播放；口音失败点 gentle 后再点警示图标，显式选择美音；原位重试无文本 |
| 双口音菜单 | 加 `menu=1` 或点 gentle 右侧菜单 | 菜单贴控件；键盘上下键/Escape |
| 长词布局 | `page=plan|library&lang=en&longwords=1` | communication/pronunciation 压力样例，仅替换设计目标词，不代表文章真实用法 |
| 交互原型 | `prototype/?lang=zh` | wander 词典、gentle 浏览器回退、steady 失败；不冒充完整产品页 |

正式稿读取共享 `M003/design/fixtures/ui13-r3-bookshop.json` 的最后一个 `generation.validated` 结果，文章与释义来自已有样例，切换界面语言不重写样例内容。等待 `#app:not([aria-busy])`；布局取动画稳定帧。底部演示面板默认收起，不进入产品。所有延时仅为状态演示，没有实际音频/API。

## 实现约束与验收

保留既有稳定验收 ID，以下是本版有效规则。

| ID | 必须结果与来源 | 检查与充分证据 |
|---|---|---|
| UIA-M003-439 | PAGE-401 没有播放/口音/语音状态，选词语义保持；CR-314 覆盖旧正向规则 | 搜索与已选区域负断言；产品实现再验添加/删除 |
| UIA-M003-440 | PAGE-402 计划、结果和 PAGE-403 每个词一个紧凑控件，正确绑定目标 | 三处数量/名称/点击目标；同词控件结构复用 |
| UIA-M003-441 | 词典成功不启浏览器；不可用时有限地回退一次；单音源隐藏来源，多音源标签真实，读屏描述实际路径 | 设计状态验证；真实 adapter 序列待技术/实现 |
| UIA-M003-442 | 只有真实可选口音；选定口音失败不能静默改用另一口音 | 单/双/未知 fixture；警示图标打开既有菜单后明确选替代；菜单局部锚定 |
| UIA-M003-443 | 全页只一条活动播放；跨词取消、晚到隔离、同词从头重播、离页/组件移除取消 | 设计跨词和重播序列；真实取消需实现证据 |
| UIA-M003-444 | 无声音/手势/失败有有限终态；原按钮重试或继续，无永久加载 | 五种演示状态；真实时间界限由 OPEN-403 定义 |
| UIA-M003-445 | 游客/普通/付费免费，不扣造文次数，不触发模型 | 后续权益/请求/额度证据；设计不增升级入口 |
| UIA-M003-446 | 发音不阻塞生成、保存、阅读，不改文章/释义/配置，不存永久记录 | 产品实现并发与应用模型检查 |
| UIA-M003-447 | 当前词可访问名称；polite 仅在控件内；菜单键盘与回焦；透明点击区域与相邻控件不重叠 | 键盘操作、DOM 与 bounds；减少动效 |
| UIA-M003-448 | 基线完整页面、词义与学习卡保持；长词可换行；无横溢 | 1440/390 代表截图和 320 长词检查；字体抗锯齿非硬门槛 |
| UIA-M003-449 | 真实许可、网络/音频、设备需独立证据 | OPEN-401～403；设计演示不能充当 |
| UIA-M003-450 | 不扩大正文、explore、后台、复习、全文/短语朗读范围 | 使用处清单/负断言 |
| UIA-M002-451 | 所有播放状态及后续操作都在本词控件内，切换不撑开卡片 | 原位图标、无可见操作/状态文字及外部状态节点；单音源无来源文本；同视口卡片 bounds 前后变化小于 0.01 CSS px，仅容纳浮点舍入，不允许可见位移 |

实现可以复用组件/调整 DOM，不得另造状态面板、改精确文案、删词义用法或用实验台替换正式界面。

## 自检与未决事项

当前浏览器报告：[M002-UI-32-R3-browser.json](evidence/M002-UI-32-R3-browser.json)。本轮定向检查无边框/底色/阴影/内外边距、18px 图标与内容宽度标签、桌面/手机/长词布局、透明点击范围不重叠、播放/失败图标、菜单焦点和既有无文字规则。R2 状态流程代码未改变，旧状态证据仍保留；新版排版以 R3 截图与报告为准。


真实音频/网络/声学质量/许可、设备语音和生产取消仍未验证：OPEN-401 backend-alex，OPEN-402 backend-alex + frontend-bob，OPEN-403 frontend-bob。没有需要重问用户的交互假设。发音产品代码及已验收 CR313/UAT 不在本次设计修改中。新版待审，后续交接从本规格和 CR-314 读取，不拼接旧稿。
