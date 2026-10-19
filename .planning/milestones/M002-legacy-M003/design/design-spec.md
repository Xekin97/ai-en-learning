---
milestone: M003
version: M003-UI-14
agent_name: designer-tony
status: awaiting_user_review
date: 2026-10-15
input_version: M003-PRODUCT-11 / TRANSITION-M003-107
visual_baseline: M002 plus accepted M003-UI-11 and M003-UI-12
---

# M003 当前设计入口

> `CURRENT / pronunciation`：单词发音 M003-UI-14 的唯一当前规格为 [pronunciation/design-spec.md](pronunciation/design-spec.md)，交互、响应式、局部文案/样式、独立原型和完整正式稿均从该入口定位。本文件下方 M003-UI-13-R4 正文是仍有效的生成/返修视觉基线，不表示发音 UI-14 尚未设计，也不替代其待审状态。M003 整体尚未批准收尾。

## 保留基线：M003-UI-13-R4 / CR-311、CR-312 正式设计

## 当前目标与有效范围

- `CONFIRMED / USER-M003-UAT-FOLLOWUP-20261013`：搜索与随机选词排除 DATA-307 的 41 个常见功能词；返修期间保留完整上一稿，只在新段完整后原位替换，并以轻量真实状态反馈等待。
- `CONFIRMED / USER-M003-BE08-UI-NEXT-20261013`：用户接受 BE08 并授权 designer-tony 基于 M002、UI11、UI12 完成有界正式设计。API 唯一语义来源为 `technical/api/generation.md#cr312-wire` 与 `#cr311-candidates`。
- `CONFIRMED / USER-M003-UI13-COPY-20261013`：生成阶段文案改为自然、有用且简洁的写作语言，撤销“请求已受理”等机械 API 表达；不改变状态、布局、权限或动作。
- `CONFIRMED / USER-M003-UI13-MOTION-20261013`：造文过程的内容切换需要连续、可跟随，避免整区瞬间出现/消失；只修订现有完整页面的局部生命周期和 motion，不扩展业务状态。
- `CONFIRMED / USER-M003-UI13-RICH-SAMPLE-20261013`：默认演示采用前端现有书店 sample 的六个词和完整最终短文，补齐可回放的 Plan、初稿、返修和词义用法，使真实页面中的过程和最终结果都有足够内容可读。
- `CONFIRMED / USER-M003-UI13-TYPING-20261013`：首稿合法追加内容像打字一样逐步出现；返修仍保留旧稿到完整段提交。呈现层不得阻塞权威状态、保存、取消或最终结果。
- 页面追踪：`PAGE-204` 登录造文、`PAGE-216` 游客/预设试用、`PAGE-212` 后台预设共享预览；能力为 `CAP-302`、`CAP-307`，数据为 `DATA-307`，验收为 `AC-323–328`。
- M002 现有完整页面、居中 760px 阅读列、窄屏铺满、UI11 统一词义列表、UI12 完成结果可编辑及再次生成确认均继续有效。普通/付费权益、预设只读、保存/claim、AppDialog、离页保护不变。
- 本版不新增页面、仪表盘、stopword 管理、审稿详情、轮次、上限、百分比、ETA 或推理展示；不新增 AI 请求。文章内容质量不属于产品 QA 评分。
- 当前稿为待用户评审的新设计，不继承旧设计批准。UI13、R1、R2、R3 原件和证据分别冻结在 `evidence/cr312/`、`evidence/cr312-r1/`、`evidence/cr312-r2/`、`evidence/cr312-r3/`；R4 修订前原件为 `evidence/cr312-r4/before.tar.gz` 与 `before-manifest.json`。UI11/UI12 已接受基线分别保存在 `evidence/cr309/`、`evidence/cr310/`。

## 设计目标与表达

主任务仍是阅读正在生成的短文。页面不切换容器、不跳回顶部：初稿正文在原阅读列真实增量出现；返修从完整上一稿开始，半段只保存在内部 working draft，完整段才在原位置替换。未更新段落继续显示上一稿，`body_complete` 才允许删除多余旧尾，但仍不代表完成或可保存。

生成纸和 760px 阅读列保持稳定，内部按 Plan、published passage、learning resources 三个 keyed 子区更新。Plan 条目在原位显现；首稿合法 append 到达后立即进入独立显示层，以 grapheme 安全的打字节奏逐步铺开。基础速度 36 grapheme/s，积压时在 650ms 呈现追赶预算内自适应加速，并允许一个浏览器渲染帧容差；每帧最多一次 DOM patch，不为每个字符创建 timer 或节点。返修只让已完成的变化段在 220ms 内从旧文交接到新文，同时轻调高度和保留浅绿左线。未变化段、外层纸张、焦点与滚动位置不重建。

权威 received text 与 displayed text 分离：reducer 立即消费事件，typing 只插值首稿 append 的可见前缀。`body_complete`、返修开始、`validated` 和 finalizing 立即 flush 到权威文本；取消、失败、新 epoch、重播和非 append edit 立即停止并丢弃旧 callback。减少动态效果直接显示完整已收文本。光标只在真实 received 大于 displayed 时出现，正文不是 live region，不按字符朗读。

真实 `activity=improving` 在唯一状态槽显示“让表达更自然 / Making the wording more natural”；状态文本以 160ms 轻淡换且从不降到不可读。Plan 的场景、词义、form/phrase 保持到权威 `validated`：届时最终 passage 复用同一正文节点，Plan 在 240ms 内退场并收拢高度，tags、最终词义和保存动作同时进入。视觉过渡不延迟 authoritative state、错误、取消或保存资格，也不长期保留初始场景。

CR-311 不增加说明条或告警。现有 Search/Random 直接展示已过滤候选；查询 `the` 可返回 `theater`、`another`，不会返回精确 `the`。旧已选 `the`、锁定预设和历史内容仍按原样显示并可继续作为生成目标。

## 打开原型与复现场景

仓库根目录运行：

```sh
python3 -m http.server 4174 --bind 127.0.0.1 --directory .planning/milestones
```

当前入口：`http://127.0.0.1:4174/M003/design/prototype/`。默认丰富样例消费 design-owned `fixtures/ui13-r3-bookshop.json`；既有技术边界场景继续消费 BE08 `technical/fixtures/cr311-312/*.json`。原型还消费 `copy.json`、`theme.css`，不调用 provider。折叠的“原型场景”是设计 harness，不进入产品界面；可播放或逐事件检查。

| 页面/能力 | 稳定状态入口 | 定位与预期 |
|---|---|---|
| PAGE-204/216 丰富完整流程 | `?page=create&lang=zh&scenario=ui13-r3-bookshop&event=11&demo=open&rev=ui13-r4` | 默认入口；点“播放完整过程”先看首稿四块真实到达后的打字铺开，再看三段返修及最终六条释义 |
| PAGE-212 丰富共享预览 | `?page=presets&lang=zh&mode=enhanced&event=11&rev=ui13-r4` | 点“生成预览”；复用相同 typing presenter、最终短文和目标词，且无普通用户保存动作 |
| PAGE-204/216 初稿完成、开始完善 | `?page=create&lang=zh&scenario=cr312-shorter&event=11&demo=open&rev=ui13-r2` | `#planning-preview`、`#live-draft`；点“播放完整过程”查看局部连续更新 |
| 半段仍不可见 | 同上 `event=13` 或 `event=14` | `.live-draft-text` 仍为完整旧稿，无改变提示 |
| 完整第一段提交 | 同上 `event=15` | 仅第一段更新；`[data-paragraph-index="0"].is-changed` |
| body 完成但非 valid | 同上 `event=17` | 旧尾按完整正文边界删除；Result/保存均不存在 |
| 权威最终整包 | 同上 `event=19` | `#final-result` 出现完整正文、tags、词义与保存动作 |
| 长段分片 | `?page=create&lang=en&scenario=cr312-large-paragraph&event=24&demo=open` | 多个 edit 后仍显示完整旧稿；不显示长半段 |
| Q02 恢复 | `?page=create&lang=zh&scenario=cr312-q02-mid-draft&event=19&demo=open` | mixed draft 不保存；保留稿在 `body_complete` 前不覆盖 published |
| pending/失败/取消 | `scenario=cr312-pending|cr312-failed|cr312-cancelled`，终态 event | 恢复现有必要反馈；不可保存；无审稿细节 |
| PAGE-212 共享预览 | `?page=presets&lang=zh&mode=enhanced&event=15` | `#preview-result` 内同一 Plan、旧稿和逐段提交规则 |
| CR-311 旧目标保留 | `?page=create&lang=zh&scenario=cr312-shorter&event=0&words=the,art&demo=open` | 已选 `the` 保留；新搜索/随机只使用合规候选 |
| 英文窄屏 | 任一 create 入口加 `lang=en`，390×844 | “Making the wording more natural”；单列词义列表，无横向溢出 |

静态截图固定到指定 event；真实过渡用 harness“播放完整过程”。正式视图可加 `view=formal` 隐藏 harness。

## R3 丰富样例来源与边界

- 最终标题、六个目标词 `wander / gentle / curious / steady / weave / delight` 和最终英文短文来自 `frontend/app/presentation/home/sample-stories.ts` 第一个公开 M002 sample；源文件 SHA-256 为 `511c6dd7525ccc9339366c432b6142380263172a0f21c61ddbe6ca443a2d9e59`。
- 最终短文仅将源文句间空格改为段落换行，形成四段，没有增删词句；`weave` 中文释义也原样复用。
- 原样例没有完整生成包。六词 Plan 场景/用法、其余五个中文释义、六条 final phrase、四段初稿、三段返修、tags 和 v6 event envelopes 是 design synthetic data，仅用于演示。不得声称它们来自前端 mock、真实模型或真实任务。
- `fixtures/ui13-r3-bookshop.json` 是设计唯一演示源：29 个 create events 与同内容的 PAGE-212 preview events，三段有实质修改、一段保持不变；半段不发布，完整段提交，最终 targets 使用 Unicode/codepoint offset。已有 shorter/longer/boundary 场景继续用于技术边界，不被替换。
- 默认 picker 选择六词，候选池仍遵守 8 词上限和 CR-311 过滤规则。样例内容不进入产品固定 copy，不作为文章质量验收基准。

## 页面与内容定位

| 页面/区域 | 元素顺序与显示条件 | 文案键 | 原型/工程映射 |
|---|---|---|---|
| PAGE-204/216 选词 | 已选词 → Search → 过滤后的候选/现有空态 → Random | 继承 `wordsearch`、`random`、`picker.*` | `#create-words`；`GenerationWorkspace.vue` → `WordPicker` |
| 工作台进行中 | 固定标题/状态槽 → keyed Plan → keyed published 正文；首稿显示前缀追随 received text | `m003.plan.*`、`m003.draft.*`、`m003.activity.improving` | `#generation-status` 外层不换；`#planning-preview`、`.live-draft-text` 保持节点身份；一个 frame scheduler 驱动 displayed prefix |
| 完整段变化 | published 对应段 old→new 220ms、高度轻调、浅绿 cue；不移动焦点/滚动 | 无新增可见文案 | `[data-paragraph-index]` 以稳定 key 局部 patch；CSS token 在 `theme.css` |
| 最终结果 | 同一 passage 节点 → tags → UI11 词义列表 → notice → 保存/claim；Plan 240ms 收拢 | 继承 `m003.complete*`、`m003.resources`、`collect` | `#final-result .m003-retained-passage`；仍读 Result snapshot，不读下一次配置 |
| PAGE-212 预览 | 与进行中同顺序；后台资格/发布反馈在共享预览之外保持 | 同上及既有 `m003.preview.*` | `#preview-result`；`admin/presets.vue` 复用相同 published view-model |
| UI12 再次生成 | 编辑配置/词 → Generate → AppDialog | `m003.regenerate.*` | `#regenerate-confirm`；原行为保持 |

`copy.json` 是固定双语文案唯一来源；原型直接 fetch。`m003.harness.*` 仅用于设计 harness，不同步到产品。AI 正文、Plan、Result、目标词和状态为 API 变量，不硬编码为产品文案。

## 状态与实现约束

详细交互见 `interactions.md`，响应式/无障碍见 `responsive-accessibility.md`。前端接收必须保留以下映射：

1. generation reducer 同时维护私有 `working` 与 authoritative `published`。首稿合法 append 立即更新 published；显示层另持 displayed prefix，不回写 reducer。replace/continue/restore 的 edit 只写 working。`paragraph_complete(index)` 才原子发布该段，`body_complete` 才发布完整 working 并处理旧尾。
2. `GenerationWorkspace.vue` 的 `generation.streamedText` 区域改读 published；Plan 和 UI11 `GenerationVocabularyList` 不因 activity、draft 或 `body_complete` 清除。只有权威 `validated` 完整包进入 Result 和保存资格。
3. `activity=improving` 只驱动文案键 `m003.activity.improving`。禁止由本地计时器、heartbeat 或 composing 推断活动；无真实 activity 时不显示此提示。
4. `GenerationWorkspace.vue` 为 Plan item、published paragraph 使用稳定 key。首稿仅在 `delete_count=0 && at=旧 working/received 的 Unicode codepoint 长度` 时进入 typing presenter；用 `Intl.Segmenter(granularity:grapheme)`、一个 `requestAnimationFrame` loop 和每帧至多一次 text patch，从 36 grapheme/s 起步，以 650ms 呈现追赶预算加速，并允许一个浏览器渲染帧容差。若 Segmenter 不可用则直接显示 received text；若跨 chunk 的 combining mark/ZWJ 让尾部 grapheme 重新分段，即使 grapheme 数不变也要原子重绘已显示尾部。完整变化段仍运行 220ms 交接。
5. failed/cancelled 丢弃临时 working；pending/disconnect 保留当前 published、Plan 和必要核对反馈但禁保存；Q02 只接受服务端显式 restore/body_complete/validated，不从 mixed draft 拼 Result。`body_complete` 绝不打开保存。
6. PAGE-212 preview 使用同一 reducer/视图规则，preview 最终仍不可保存；普通/付费、基础/增强和 UI12 再次生成确认语义不变。PAGE-204/216 在 `validated` 当下同步解除配置、Search/Random/移除按钮的生成中禁用态；Cancel 原按钮原位变为 Generate，若其持焦则焦点与 scroll 均保留。
7. Search/Random 从后端候选结果直接渲染，不在浏览器复制 DATA-307。不得对已选/预设/历史词再做前端拒绝；`no_candidates` 继续现有空态，不新增“被过滤词”列表。
8. motion token 统一为 status 160ms、entry/exit 180ms、paragraph 220ms、final handoff 240ms，easing `cubic-bezier(.2,.72,.2,1)`。新 epoch、取消、失败或离页立即清理视觉回调；回调只清 class/style，不能恢复旧内容。reduced motion 直接显示 authoritative 内容但仍复用 passage 节点和静态 cue。
9. typing backlog 不延迟 reducer、`body_complete`、validated、保存资格、错误、取消或配置解禁。正文 completion/revision/finalizing 应先同步 displayed=received，再结束循环；cancel/failure/new epoch/离页直接销毁循环。页面隐藏时不承诺后台帧速率，恢复后的首个 frame 若已过 deadline 必须立即追平。

## 实现验收

| ID | 必须保持的结果 | 检查方法与充分证据 |
|---|---|---|
| UIA-M003-427 | Search/Random 只显示合规新候选；`the` 查询不返回精确词但可返 theater/another；旧已选 the 可见且可生成；无警告/管理入口 | API fixture + WordPicker 组件/浏览器交互；PAGE-204/216 与 PAGE-212 picker 使用处 |
| UIA-M003-428 | 首稿真实增量；Plan 场景、词义、用法持续可见；无虚假 improving | reducer 序列 + event 9/11 浏览器状态 |
| UIA-M003-429 | replace 半段不可见；完整段才原位替换；旧尾保留至 body_complete；变化 cue 轻量且不滚顶 | event 13→15→17 的 published/working、scrollY/焦点断言与代表截图 |
| UIA-M003-430 | improving 只来自 activity；准确双语；无轮次/比例/ETA/审稿详情；body_complete 无保存，validated 才显示权威 Result 与保存资格 | DOM 文案/禁词断言、event 12/17/19 |
| UIA-M003-431 | Q02、failed、cancelled、pending/disconnect 恢复最近 published 或现有终态反馈；临时 mixed 不保存；late/旧流隔离 | BE08 fixtures + reducer 单元测试 + 代表浏览器路径 |
| UIA-M003-432 | PAGE-212 enhanced preview 与 PAGE-204/216 使用同一 Plan/published/段提交结果；不出现普通保存动作 | desktop preview 浏览器操作及状态断言 |
| UIA-M003-433 | 1440 居中 ≤760px，390 铺满且无横溢；读者位置与焦点稳定；reduced motion 无动画仍有可见 cue | 桌面/窄屏截图、bounding box、scrollY/focus、media emulation |
| UIA-M003-434 | UI11 词义结构和 UI12 完成后编辑/再次生成 AppDialog、预设只读、权限与 basic/paid 语义无回归 | 复用 cr309/cr310 已有证据 + 受影响组件回归；新实现后独立 QA |
| UIA-M003-435 | Plan、状态槽、published paragraph 和最终 passage 保持节点连续；完整变化段 220ms 局部交接、未变段不动；valid 当下解除普通配置/WordPicker 禁用并开放既有动作，Plan 240ms 内收拢；Cancel→Generate 保持按钮节点/焦点 | 实际 Replay 的节点 identity、before/during/after filmstrip、computed timing、body→valid controls/focus 检查 |
| UIA-M003-436 | 中断/新 epoch 无旧回调复活；390px 无横溢；reduced motion 近即时且保留静态 cue；PAGE-212 使用同一连续性 | cancel 后延时断言、390 英文、media emulation、enhanced preview Replay |
| UIA-M003-437 | 默认设计演示使用现有 M002 书店 sample 的六词和完整最终短文；四段回放含三段修改、一段不变、六条 Plan/最终释义，create 与 PAGE-212 一致；synthetic 扩充有清楚来源边界 | fixture integrity（source hash、文本归一化、seq/rev、codepoint offsets）+ desktop replay + 390 中英窄屏 |
| UIA-M003-438 | 首稿 append 在至少两个实际时刻持续增长，grapheme 不拆分；基础 36 grapheme/s 不随刷新率加速，积压以可见页面 650ms 呈现预算追赶，并允许一个渲染帧容差。跨 chunk combining/ZWJ 重分段正确；无 Segmenter 与 reduced motion 均直接显示。完成立即 flush；取消/错误/重播无旧 callback；PAGE-212 共用 | 真实时间采样、120Hz 短块、combining/ZWJ、Segmenter fallback、deadline、取消后延时、media emulation、390px preview |

原型 DOM 与 Vue DOM 可不同，但上述用户结果不可改变。固定 copy、颜色/间距和 motion 分别以 `copy.json`、`theme.css`、`interactions.md` 为准。

## 设计自检与未决项

- 当前设计源为 M003-UI-13-R4 工作区修改；UI13/R1/R2/R3 证据冻结复用。R4 只新增 `evidence/cr312-r4/M003-UI-13-R4-typing.json` 的 typing 生命周期检查和 2 张代表图，不重跑未受影响协议、内容或返修 motion 矩阵。
- R2 有界检查覆盖 UIA-M003-435/436 的短/长段、body→valid、中断清理、390 英文、reduced motion 与 PAGE-212，共 9/9 PASS、console error 0、provider call 0。针对 valid 局部 patch 另验证普通配置/WordPicker 全部解除禁用、Cancel→Generate 同节点持焦；失败 run 原样保留，代表图已实际目视。
- R3 fixture integrity PASS；浏览器 6/6 PASS、console error 0、provider call 0，覆盖完整 desktop replay、PAGE-212、390px 中英、六词/四段/三改一不变/六释义以及最终配置可编辑。失败 run 原样保留，4 张图已实际目视。
- R4 浏览器主检查 6/6 PASS；调度修正后定向检查 5/5 PASS，console error 0、provider call 0。覆盖两个时间点增长、650ms 呈现预算加一个渲染帧容差、120Hz 三字符块约 51ms 完成、Segmenter fallback 直出、combining/ZWJ 跨 chunk 原子重组、body/valid 收尾、取消后 760ms 无复活、重播、reduced motion 与 390px PAGE-212。2 张图已实际目视；时间采样报告而非静态图证明 typing。
- 现有应用仍是旧 reducer/展示，frontend-bob 必须在用户评审后接收 UIA-M003-427–438；本稿不授权实施或刷新 UAT。
- CR-311、CR-312 保持 open。当前无需要用户重新选择的业务问题；唯一待决是用户是否接受本轮正式视觉与交互结果。
