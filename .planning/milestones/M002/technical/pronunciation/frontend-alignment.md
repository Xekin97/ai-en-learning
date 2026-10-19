---
milestone: M002
stage: technical-design
role: frontend-architect/base
agent_name: frontend-bob
version: M002-FE-PRON-01-TA1
status: awaiting_user_review
readiness: architecture_review_only
date: 2026-10-16
---

# 发音前端设计接收补充

本稿将已批准的 UI32-R3-TA1 接入现有 [FE-PRON-01](frontend.md)，补齐 CR-315 的技术接收。使用同一 WordPronunciation 控件和协调器，明确失效口音快照、单替代菜单、选择时的可用性复核及准确文案编译。没有新增框架、后端接口、播放器或存储。

## 1. 当前版本与接收范围

- CONFIRMED：[门禁137](../../reviews/pronunciation-frontend-resume-137.md)及[用户批准绑定](../../reviews/evidence/pronunciation-frontend-resume-137/acceptance.json)接受 UI32-R3-TA1，恢复 frontend-bob 完成接收。设计原件的“待审”字段是冻结的提交历史，以137批准为准。
- 当前工程方案由本补充及 FE-PRON-01 的未受影响章节组成。后者§1/6/8/9/10中“CR-315待设计补齐”、固定旧文案和缺少单替代规则的表述退出当前接收标准；由本稿§2～5替代。FE401-S1的 `accent → preparing` 仍要求用户明确选择，具体判断在本稿细化。
- [已批准规格](../../design/pronunciation/technical-alignment/design-addendum.md)、[交互规则](../../design/pronunciation/technical-alignment/interactions.md)、[文案补丁](../../design/pronunciation/technical-alignment/copy.json)、[可运行正式稿](../../design/pronunciation/technical-alignment/formal/index.html)为唯一受影响设计源。沿用R3样式和SVG；不复制原型计时、URL场景参数、示例口音列表到产品代码。
- 产品能力、API-401/402、页面权限、免费权益、页面生命周期、SSR边界、媒体清理、有限等待值和OPEN事项仍按[原方案](frontend.md)及[API合同](api/index.md)。本轮不重提已确认的裸图标、无可见状态文字及单源无常驻标签偏好。

CR-315 的设计和前端接收已闭环；该结论不代表下面的技术补充已获用户批准，也不代表发音功能已实现。OPEN-401～403继续保留。

## 2. 应用状态与渲染映射

沿用原方案§4模块边界，应用层保存事实，展示层映射译文，Vue只承载局部菜单和焦点。以下均为客户端内存状态，不是API字段或持久化DTO。

| 落点 | 本次具体补充 |
|---|---|
| `application/pronunciation/models.ts` | 现有已选项之外保存 `failedSelection: { optionId: string; locale: string \| null } \| null`。仅在当前已选口音被判定不可用时保存最后选择快照；当前词仍取owner.entry。选项为规范化的本地ID/已核实locale，不保存DOM或翻译文本 |
| `application/pronunciation/coordinator.ts` | 负责可用替代集合、选择复核与状态转移；失效项从本次可选集合去除。失败快照与替代集合分开，列表变化不能把错误提示里的失效口音改成另一口音 |
| `presentation/pronunciation/use-pronunciation.ts` | 从失败快照映射 `pron.uk/us/english`，按设计模板填入word/accent。派生是否需要明确选择、来源按钮是否出现及菜单选项；不读取候选URL、license或原生voice |
| `presentation/components/WordPronunciation.vue` | 单个播放按钮、必要时的来源按钮、原菜单、隐藏live节点。维护menuOpen及实际打开者ref；发出播放/重试/选择意图，不直接fetch或speak |
| `runtime/pronunciation/scope.ts` | 复用lease/surface/control/attempt校验与清理，计划退场和上下文失效同时关闭菜单、撤销资格；保留原方案的计划→结果焦点处理 |

不是每次音频错误都进入口音替代：默认词典失败仍按API-401走一次浏览器路径。只有明确选择的口音无法继续且存在其他实际英语选项时才进入 `accent`。同一口音的匹配、未知地区及代表项选择继续由原方案§6规范化，不因字典/浏览器是两条路径就虚构两个选项。

### FE401-S4：已选项失效后的收敛

1. 当前尝试确认选定口音不可用后，使该attempt失效并释放旧资源，记录 `failedSelection`。清理完成前不能启动替代音源。
2. 归一化实际可用替代，排除失效项。集合为空则 `error`；非空则 `accent`。两种状态都终止准备计时，`actualSource=null`，不会自动产生新播放请求。
3. `accent` 期间，不显示独立来源标签；播放图标承载菜单打开语义，唯一替代也能打开菜单。点击警示只打开选择层，不调用发声方法或重新查词。
4. 用户明确选择后，先校验当前lease/surface/control仍有效，再查选项是否仍属于当前可用集合。过期/伪造ID不进入播放，不静默取第一项；重新收敛为当前真实的 `accent/error`。若新选项已开始准备后消失，则记录此次新选择的失败快照，再走同一分支。
5. 合法选择成为新的显式选择，清除失败快照，关闭菜单并发起一个新attempt，转 `preparing`。一个可用项时只保留播放图标；多项时恢复原来源菜单按钮。实际start/ended及失败继续由端口事件驱动。

关闭菜单、Esc、外部点击都保留 `accent` 和失效选择，不播放。零项时没有空菜单或残留 `aria-haspopup`，按钮按既有有界重试动作执行；失败仍可重试，不触发模型调用。

选项复核使用适配器当前可用性与同卡片有效元数据；浏览器路径在用户选择的同步事件链中读取当前voice并启动。不能先await菜单动画、nextTick、翻译加载或再查词再试图保留手势。焦点回收可在Vue DOM更新后进行，不能延迟用户已经选择的浏览器播放动作。若必须等待声音就绪，仍按原FE401-S2/S3有限等待及gesture终态处理，不承诺保留手势。

无需新增持续轮询或每词常驻voiceschanged监听。原端口发现/就绪逻辑仍负责资源状态，选择前必须重新核对；不能把原型静态alternative数组当实时设备结果。

## 3. 页面与交互接入

| 设计/验收 → 现有工程区域 | 必须保持的接入结果 |
|---|---|
| PAGE-402计划，UIA-M002-452～454 → GenerationContent / GenerationVocabularyList (`variant=plan`) | `word_use.entry`绑定控件；计划退场即时取消，旧菜单不能继续接受选择 |
| PAGE-402结果，同上 → GenerationVocabularyList (`variant=result`) | `targets[].entry`绑定同一控件；词义/用法/SSE更新不改失败快照中的选择事实 |
| PAGE-403，同上 → `pages/library/[batchId].vue` 的 `.study-resources .resource-grid article` | 词标题旁复用同一控件；batch/会话失效时撤销，保持原权限 |
| CR-314 / UIA-M002-451 → WordPicker、trial、后台、explore、review | 沿用原方案显式接入开关，维持无新增播放入口 |

Vue按钮必须使用 `type=button`。菜单条件来自当前phase和候选数，不再简单用 `options.length > 1` 作为所有菜单的显示条件：异常需选择且候选数≥1就可展开；正常多项才显示独立来源按钮。仅一项的菜单内容不等于常驻来源标签。

焦点与菜单行为完全取自TA1：警示打开则Esc回警示，正常来源按钮打开则回来源按钮；成功选择后回当前播放图标；Tab/外点关闭不抢焦点。菜单内第一项到第二项的指针切换，以focusout的 `relatedTarget` 判定目的元素是否仍在控件内；未知目标时延后一个任务再判断，并核对控件仍有效。不能在原生focusout期间以短暂的body焦点提前关闭菜单。所有延后焦点工作都受surface/control存活保护；旧菜单回调不能聚焦新页面。

`aria-haspopup/controls/expanded`只加在当前实际打开者；已失效选择不在菜单中，不伪造checked项。菜单打开后焦点进入当前已选可用项或第一项，方向/Home/End/Esc沿设计执行。局部live只因本词状态或相关口音事实改变更新，不能因其它词/生成token重新播报。

原R3图形、18px外观、透明点击区、菜单位置和动效不改。新增规则只改变是否渲染来源段及选项集合，不加空白占位，也不改变词义卡高度。

## 4. 文案与资源转换

工程事实：`frontend/scripts/sync-design.mjs` 已使用 `static/templates` 展平字典；写入locale的 `m002` 命名空间时把点替换为双下划线。`use-design-copy.ts`按同一方式查键，变量交给现有i18n插值。此次沿用该机制，不加入运行时.planning读取。

实施时仅增加发音源的编译输入：先展开 R3 `static`、`templates`，再以 TA1 `static`、`templates` 按**完整键**覆盖，最后筛选运行用的 `zh/en.pron.*` 并并入当前compiledCopy。排除 `pron.demoLabel/demoHelp` 和formal/prototype演示键，保留现有CR313等编译结果。旧static中的同名 `pron.accentUnavailable` 必须被新template取代，不能按各自分类分别编译而让旧值再次覆盖。

- 输出仍为 `m002.pron__accentUnavailable`；变量名严格为 `word`、`accent`，值从当前词和失效快照映射，不使用当前替代项的标签，也不使用原型query参数。
- GB/US只有在locale已核实匹配时才用对应设计标签；其它/未知地区使用批准的英语标签，不通过音频文件名猜地区。模板文本、标点和后接 `pron.chooseAccent` 的方式直接来自TA1 controller及copy。
- 编译/检查阶段验证该模板每语言只保留一份有效值，包含两个变量；运行中按文本绑定到aria/live，禁止把变量作为HTML插入。SSR空闲态不读取浏览器声音、不填造失败快照。
- 当前源清单记录R3与TA1各自hash和合并顺序；SVG及发音CSS仍取原R3批准来源，TA1 controller只是接收参考，不复制其定时器或整段DOM代码。

## 5. FE401-V5更新与接收证据

以下是后续实现验证的明确期望，不能把设计演示已通过直接算成产品通过。FE401-V1～V4/V6～V8及原端口、生命周期测试继续适用；本表替代旧V5“等待设计补齐”的说明。

| V5子项 / 设计验收 | 输入和操作 | 通过依据 |
|---|---|---|
| V5-a / UIA-M002-452 | GB→US、US→GB，zh/en，两边分别覆盖计划/结果/library | aria/live精确匹配批准模板和实际失效快照；失效时source为空且未调用替代播放 |
| V5-b / UIA-M002-453 | 仅一个替代，打开/取消/再选；共享控件覆盖三入口 | 菜单可达且仅有该项；取消不播放；选择只调用一次，单源无常驻标签，Esc和选择后的焦点正确 |
| V5-c / UIA-M002-454 | 零替代、两个替代、未知地区；鼠标第二项、Home/End/方向/Tab/外点 | 无空菜单或失效项；隐藏checked事实准确；点击第二项不丢失，焦点和关闭符合设计 |
| V5-d / AC-404/405，API-402 | 打开后选项消失、选择后voice消失、旧attempt回调迟到、退场后旧点击 | 每次选择复核有效性；过期项不发声；后续失败使用新选择快照；失效上下文不能重启/抢焦点 |
| V5-e / UIA-M002-452，FE401-V7 | 编译两份设计copy，切换语言、词值含需转义字符 | 同键只有有效新模板，变量不原样漏出或成为HTML；原字典其它功能键不变，无可见状态文字 |

先以现有端口桩/fake clock和组件浏览器操作验证V5逻辑；真实设备项仍按V8记录实际OS/browser/voice及播放事件/人工听音。前端入口只传word/本地动作，不增加后端DTO、生成/保存字段或跨环境持久化。

本轮接收结果：

- [定向接收探测](evidence/frontend-alignment/intake.json)在正式稿计划/结果各核对一个相反口音方向，检查实际aria模板、唯一替代、无自动播放及Esc回焦；2项通过。不是应用测试，不访问音源或3016UAT。
- TA1的[16项设计检查](../../design/pronunciation/technical-alignment/evidence/browser-report.json)及既有截图按冻结hash复用，覆盖零/多项、三入口、窄屏和原型一致性。本轮没有设计源或样式变化，不重复采集截图。新增截图/送模图片均0；未声称完成真实音频或新实现的视觉验收。
- [输入清单](evidence/frontend-alignment/input-manifest.json)绑定设计批准、原技术稿和工程落点；[静态检查](evidence/frontend-alignment/static-check.json)验证入链、文案合并以及输入/冻结源保持。本轮没有修改应用代码、运行sync-design或重跑应用单测/lint。

## 6. 当前开放项与接续

CR-315：已批准设计、双向可操作证据、前端组件/文案/状态映射及V5期望已齐备，接收结论为 RESOLVED；原CR文件与FE-PRON-01冻结记录不改写，当前结论由本稿/交接和状态指向。无需再次返回设计。

OPEN-401仍由backend-alex落实资源使用条件；OPEN-402由backend-alex/frontend-bob完成目标网络及真实播放；OPEN-403保留真实设备、手势/声音变化/取消验证。详细定义继续引用原方案§7/9/10，不以本补充关闭，不把设计demo冒充语音成功。原稿中未获批的技术选项/期限仍待审。

下一步审阅本补充与未受影响的原技术稿，随后由守门器按这些既有OPEN项安排责任角色完成接收，判断完整技术出口。本交付不进入实现，不新建里程碑或修改已有UAT配置。当前唯一前端交接为[本次交接](../../handoffs/pronunciation-frontend-alignment.md)，冻结旧稿仅提供未受影响内容与历史证据。
