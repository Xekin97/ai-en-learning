# M003 当前交互入口

> `CURRENT / pronunciation`：单词发音 M003-UI-14 的播放、回退、口音、竞态与 Motion 规则见 [pronunciation/interactions.md](pronunciation/interactions.md)。下方 UI13-R4 继续作为生成/返修交互基线；两者同时适用，发音范围以下游局部真源为准。

## 保留基线：M003-UI-13-R4 首稿打字呈现、返修 Motion 与丰富样例

状态语义只来自 M003-BE-08 `m003-stream-v6`。Motion 只插值当前权威 DOM，不修改 wire、不增加等待、不决定保存资格。

## 稳定区域与发布边界

1. `#generation-status`、`.m003-result-body` 和状态槽贯穿一次 request epoch。Plan item 以 `kind + entry`，published paragraph 以服务端 paragraph index 作为稳定 key；不能用 phase、rev 或全文作为整区 `:key`。
2. `plan_item` 追加到现有 Plan，180ms 从 `opacity .2 / translateY(3px)` 进入。已有场景和词条不重挂。Plan 的三点只在 `phase=planning`；进入 composing/improving 后静止。
3. `draft begin(initial)` 后仅合法 append（`delete_count=0` 且 `at` 等于此前 working/received 的 Unicode codepoint 长度）进入 typing presenter。reducer 立即保存完整 received text，displayed text 从当前前缀逐帧追上；非 append/edit range 变化直接 flush received，不逐字删除或重写。
4. `draft begin(replace|continue|restore)` 复制完整 published 到私有 working；edit 只改 working。`paragraph_complete(index)` 才立即把该段权威文本写入同一 DOM node，并运行 220ms old→new 交接：前 45% 保持旧文，随后新文出现；高度同时缓动。未变段和旧尾不动。
5. `body_complete` 立即发布完整 working。变化段使用同一 220ms 交接，已删除旧尾只留 180ms `aria-hidden` 视觉退场层；它不在 accessible text 中，也不开放保存。Plan 仍保留。
6. `validated` 当下建立 Result、资格和原有动作；复用现有 passage node。Plan 只作为 `aria-hidden` 退场槽，在 240ms 内淡出并将高度收至 0；最终标题、tags、词义和 notice 同步进入。普通配置、Search/Random 和词条移除同步解除生成中禁用，Cancel 按钮在原节点变为 Generate，保持已有焦点。不存在长期场景折叠区或第二份正文。

## 状态槽与时间参数

- 状态 pill DOM 保持不变，内部文案立即替换并以 160ms 从 opacity .55 回到 1，永不淡到 0。快速连续状态只重启动当前轻淡换，不排队、不保留最短展示时长。
- `activity=improving` 才显示 R1 文案“让表达更自然 / Making the wording more natural”。收到 writing、进入 finalizing 或终态即移除 improving；不能从 heartbeat、计时或 composing 推断。
- 统一 token：status 160ms；entry/exit 180ms；paragraph 220ms；final handoff 240ms；`cubic-bezier(.2,.72,.2,1)`。正文 cue 与段落交接同一时段，不再另跑长动画。
- 初稿 typing 基础速度 36 grapheme/s；若 received-display backlog 增长，则按“剩余 grapheme / deadline 剩余时间”提高每帧预算，从第一个待显示 grapheme 起使用 650ms 呈现追赶预算，并允许一个浏览器渲染帧容差。新 chunk 到达时若仍有 backlog，沿用原 deadline，不能把追赶预算起点向后推。
- 使用 `Intl.Segmenter({granularity:'grapheme'})`；若环境不支持 Segmenter，直接显示 received text，不用 `Array.from` 冒充 grapheme 安全。跨 chunk 的 combining mark/ZWJ 可能让已显示尾部重新分段，presenter 必须比较重组后的 displayed prefix 并原子重绘，即使 grapheme 数没有增加。
- 全页最多一个 `requestAnimationFrame` loop，每帧预算允许为 0 并累积非负余数，每帧最多一次 text patch；首个 grapheme 可同步显示。不得用 `Math.max(1, …)` 让速度随 60/120Hz 刷新率加倍，不给每个字符创建 DOM、timer 或 transition。短块保持连续感，长块/高频块自动加速；不人为延长 wire 间隔或设置最短演出时间。
- Motion 只使用 typing 前缀、克制 caret、opacity、3px 内位移、height 和 retained-passage FLIP；不做弹簧、整页淡入、自动滚动、假进度、ETA 或固定 dwell。

## 阅读位置、焦点与辅助技术

- patch 前记录第一个可见的 retained paragraph；若其上方高度改变，以该节点 top delta 补偿 `scrollY`。不得滚到顶部、底部或变化段。
- 焦点在 Cancel、配置、选词或 AppDialog 时保持原控件；Cancel→Generate 通过同一 button 原位更新，不移除 activeElement。动态正文不接管焦点。token/edit 不进入 live region，状态槽继续 `aria-live=polite`。
- typing caret 只在 `displayed < received` 时显示；`.live-draft-text` 可用 `aria-busy=true` 表示暂在铺开，但不能设为 live region，屏幕阅读器不按字符播报。段落结构随已显示换行建立，不拆 grapheme。
- `prefers-reduced-motion:reduce`：首稿 received text 直接显示，caret 不出现；authoritative text 和动作仍立即生效，取消 dots、entry、paragraph/final animation；同一 passage node 仍保留，变化段显示静态淡绿 cue。

## 中断、终态与竞态

- 新 epoch、取消、失败、离页或重播立即增加 motion epoch、清 timer/ghost/class/inline height；旧 callback 只允许清理且必须检查 epoch/`isConnected`，不得写内容或恢复旧 UI。
- `body_complete`、finalizing、replace/continue/restore begin、validated 到达时先同步 `displayed=received` 再结束 typing loop；这一步不得等待下一帧。取消、失败、协议异常或新 epoch 则停止 loop 并丢弃未显示前缀，不让旧 callback 补写。后台 tab 不运行假 timer；恢复后的第一帧若 deadline 已过即同步追平。
- pending/EOF/disconnect 保留 Plan 与 published，禁保存并走现有核对反馈。failed/cancelled 丢 working，立即显示既有终态，不等待退场动画。
- late event、终态后 event、非法序列和 Q02 继续按 BE08 处理。restore/body_complete/validated 是唯一回退路径；视觉层不得拼 mixed draft。

## PAGE-212 与设计 harness

PAGE-212 enhanced preview 复用上述 keyed Plan/passage、body complete 和 final handoff；preview 最终不出现普通用户保存。basic/paid、资格、发布与预设只读语义不变。

折叠的 `[data-design-harness]` 只用于回放前端公开样例改编场景和 BE08 synthetic technical fixture；“播放完整过程”可以重播。它的 420/680ms 示例节奏只帮助观察约 200ms 过渡，不代表生产等待，也不进入产品 UI。

## R3 默认样例映射

- create 默认选择 `ui13-r3-bookshop`；PAGE-212 enhanced preview 选择同内容的 `ui13-r3-bookshop-preview`。两者由 `fixtures/ui13-r3-bookshop.json` 驱动，不新增后端事件或产品状态。
- 四段初稿真实增量显示。返修中第 0、2、3 段在各自 `paragraph_complete` 后原位交接，第 1 段节点和文本保持不变；第 2 段 half/full edit 在提交前均不可见。
- `body_complete` 后正文已与源 sample 一致，但 Plan 和保存边界继续等待 `validated`；最终六个 targets、六条释义/用法、tags 和动作一起进入。create 与 PAGE-212 使用同一 passage，preview 不出现普通用户保存。
- 该样例只扩充展示内容。R2 的稳定节点、220ms 段落交接、240ms Plan 收拢、Cancel 同节点持焦、配置解禁、reduced motion 和竞态清理规则全部不变。
- R4 用原有四个 initial edit（约 102/38/103/51 codepoints）直接演示自适应 typing，不改写 fixture、不增加人为 dwell；随后 replace events 仍走完整段提交和 220ms 交接。
