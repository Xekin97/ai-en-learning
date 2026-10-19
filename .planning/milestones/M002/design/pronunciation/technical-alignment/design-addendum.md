---
milestone: M002
stage: uiux-design
role: uiux/base
agent_name: designer-tony
version: M002-UI-32-R3-TA1
status: awaiting_user_review
date: 2026-10-16
---

# 发音异常状态设计补充

## 有效范围与依据

本稿承接[门禁136](../../../reviews/pronunciation-design-alignment-entry-136.md)的 CR-315，仅补齐已选口音失效时的准确无障碍文案，以及只剩一个替代项时的显式选择。基线为已批准的 [M002-UI-32-R3](../design-spec.md)，批准绑定见[接受记录](../../../reviews/pronunciation-design-acceptance.md)。本稿待审，文件生成不代表批准。

| 页面 | 能力、数据与验收依据 | 本轮设计作用 |
|---|---|---|
| PAGE-402 规划词义、结果词义 | CAP-403/404；DATA-401～404；AC-404/406 | 当前单词失效反馈、替代菜单、焦点回收 |
| PAGE-403 已保存文章词卡 | 同上 | 同一套局部控件行为 |
| PAGE-401 选词 | CR-314 已批准修订 | 保持无播放控件；产品原件的早期全入口表述以该修订为准 |

源依据：[CR-315](../../../changes/CR-315.md)、[前端接收缺口](../../../technical/pronunciation/frontend.md)、[产品能力](../../../product/pronunciation/abilities.md)。用户已确认每词裸图标、无可见操作/状态文字、单音源不显示来源文字。本稿在该范围内落实，不增加来源服务或页面区域。实施批准后，本稿仅替代 R3 固定英音失效文案和单替代项未定义分支；其他 R3 规则继续有效，旧源与原审批保留。

## 视觉与交互方向

保留 M002 已批准页面的暖白底、绿色文字、阅读字体、卡片结构和词义排列。发音仍是词旁18px裸图标，不加边框、背景、内外边距、悬浮文案或独立状态条。失效时使用 R3 警示图形，点击后打开词旁原有菜单；用户通过其中的实际选项决定下一次播放。菜单是瞬时选择层，不是常驻单音源来源标签。

控件样式直接引用 [R3 theme.css](../theme.css)，图形沿用 R3 controller 的原 SVG。此次没有新的字体、图片、样式资产或全局布局。状态、菜单及焦点详见[交互规则](interactions.md)，响应式基础沿用[原规范](../responsive-accessibility.md)。

## 打开与复现

在产品根目录运行 `python3 -m http.server 4175 --bind 127.0.0.1 --directory .planning/milestones`。已有该服务时复用，不重启3016真实UAT。设计只依赖浏览器，不会请求真实音频。正式稿是完整页面还原，原型是独立控件实验；两者消费同一 controller 和文案补丁。

- [正式稿：美音失效，仅英音可选](http://127.0.0.1:4175/M002/design/pronunciation/technical-alignment/formal/?page=result&lang=zh&scenario=accent&lost=en-US&alternatives=en-GB#pron-page-402-result)
- [正式稿：英音失效，仅美音可选](http://127.0.0.1:4175/M002/design/pronunciation/technical-alignment/formal/?page=plan&lang=zh&scenario=accent&lost=en-GB&alternatives=en-US#pron-page-402-plan)
- [可操作原型](http://127.0.0.1:4175/M002/design/pronunciation/technical-alignment/prototype/?lang=zh&scenario=accent&lost=en-US&alternatives=en-GB)

打开后点击任一词旁图标，演示准备结束后显示警示；再次点击打开替代选项，选择后进入播放图标。示例从既有 `M003/design/fixtures/ui13-r3-bookshop.json` 读取同一书店短文与6词，不另造稀疏页面。长词模式仅测试排版，不作为真实释义示例。`#app` 移除 `aria-busy` 表示资源就绪；截图等待有限动效结束，交互检查保留正常动效。

| 入口参数 | 可复现场景 | 定位 |
|---|---|---|
| `page=plan/result/library` | 规划、结果、文章详情 | `#pron-page-402-plan` / `#pron-page-402-result` / `#pron-page-403-library` |
| `scenario=accent&lost=en-US&alternatives=en-GB` | 反向失败，仅一项 | `[data-pron-control][data-word]` 中的警示按钮和菜单 |
| `scenario=accent&lost=en-GB&alternatives=en-US` | 正向失败，仅一项 | 同上 |
| `scenario=accent&lost=neutral&alternatives=en-GB,en-US` | 未知地区英语失效，另有两项 | 菜单仅显示两项真实替代 |
| `scenario=accent&alternatives=none` | 无替代 | 重试图标，无空菜单 |
| `lang=zh/en`、`longwords=1` | 双语、长词 | 1440、390、320px 视口 |

这些参数仅为设计演示的确定性数据。正式前端从真实可用资源和设备语音生成候选，不从单词、文件名、URL 参数或演示样例推断英美双音源。

## 文案及内容定位

本目录 [copy.json](copy.json) 是两条模板的局部补丁；其他键取[冻结R3文案](../copy.json)。controller 按 `baseline.static → baseline.templates → patch.static → patch.templates` 合并成唯一字典。前端生成工程副本时，应按键替换旧 `pron.accentUnavailable`，移除旧静态版本，禁止同时保留两套优先级不同的译文。

| 元素 | 文案/资源真源 | 显示规则 |
|---|---|---|
| 失效警示的 aria-label 与 `.pron-live` | `zh/en.pron.accentUnavailable` 模板；后接既有 `pron.chooseAccent` | 仅无障碍名称/播报，不成为可见文案 |
| `{word}` | DATA-401 当前点击词条 | 不读整篇文章；空词不渲染控件 |
| `{accent}` | 失效选择的真实展示名，已核实地区才用 `pron.uk/us`，未知地区用 `pron.english` | 不猜测地区，不把替代项说成失效项；保留失效快照直到用户明确选择 |
| 替代菜单 | 既有 `pron.uk/us/english` | 仅列当前真实可选项；选择后再播放 |
| 正常/失败/播放图形 | [controller.js](controller.js) 的 `speaker` / `stateIcon` | 无新增可见操作和状态字样 |

示例：美音失效时传入 `{word: wander, accent: 美音}`；英语界面同一事实传入 `US`。没有替代项时使用 R3 `pron.statusUnavailable`，不宣称还可选择其他声音。

## 验收与证据

| 验收ID | 观察条件及必须结果 | 证据及容差 |
|---|---|---|
| UIA-M002-452 | PAGE-402/403，GB→US 和 US→GB；隐藏提示准确包含当前词和失效口音，不写死英音 | 六组页面/语言/方向操作；文案按模板精确匹配，实际状态无自动换口音 |
| UIA-M002-453 | 警示按钮能打开仅有一项的菜单；选择前不播放，选择后才开始；Esc 返回警示按钮；单音源始终无常驻标签 | 键盘、鼠标操作与 actualSource 状态；18px图标与44px透明点击区；词卡位置/尺寸变化≤0.01 CSS px，仅容浏览器舍入 |
| UIA-M002-454 | 零项仅重试；多项不包含失效项，方向键循环、Home/End、Tab/外点关闭正常；点第二项不提前关闭菜单 | 零/多/未知地区案例及复测；无空菜单、无失效项恢复、无焦点抢夺 |
| 继承 UIA-M003-442/447、UIA-M002-451 | 正常外观、低动效、窄屏、无边框边距与选词无音频入口 | 4组R3/TA1正常画面对照，3组像素完全相同，桌面5个边缘像素差异；无卡片几何变化。仅允许最多10个截图像素的边缘栅格差异，不放宽布局/文案要求 |

[浏览器报告](evidence/browser-report.json)共16项通过；[复现脚本](evidence/check-browser.mjs)。首次检查记录[保留](evidence/browser-first-run.json)：多选项点击触发原生焦点切换时 `activeElement` 短暂为body，过早关闭菜单；已改为基于 `relatedTarget` 判断，未知目标延至下一任务再判断，第二项点击已通过。另一个初次差异是5个边缘像素，几何一致；对照阈值及原始差异均公开记录。

设计负责人已检查桌面反向单替代、320px长词单替代和正常完整页面。菜单保持贴近词条，窄屏内完整显示，无卡片推挤。截图见 [桌面](evidence/TA1-reverse-single-desktop.png)、[窄屏](evidence/TA1-library-single-mobile.png)、[原型](evidence/TA1-prototype-single.png)。

本次是设计自检，不是产品实现或真实发声验收。OPEN-401～403仍按[技术交接](../../../handoffs/pronunciation-frontend-architecture.md)开放，尚未验证真实声音、设备/浏览器覆盖和资源使用条件。本稿补齐 CR-315 的设计提案；待用户审阅后由 frontend-bob 接收 FE401-V5 映射，再判断技术阶段出口。恢复快照及版本校验见[交付清单](evidence/delivery-manifest.json)。
