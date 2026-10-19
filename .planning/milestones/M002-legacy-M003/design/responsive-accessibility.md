# M003 当前响应式与无障碍入口

> `CURRENT / pronunciation`：单词发音 M003-UI-14 的 1440/390、触控、键盘、状态播报与减少动效规则见 [pronunciation/responsive-accessibility.md](pronunciation/responsive-accessibility.md)。下方 UI13-R4 保留为生成/返修基线。

## 保留基线：M003-UI-13-R4 响应式与无障碍

## 布局

- `>760px`：沿 M002 完整页面与工作台宽度；生成纸内部 `.m003-result-body` 居中且 `max-width:760px`。Plan、published passage 和 Result 共用同一阅读列；UI11 词义列表为两列。
- `≤760px`：生成纸横向 padding 16px，阅读列铺满；词义列表单列。状态槽可换行但不改变标题区顺序；390px 横向溢出必须为 0。
- 段落 cue 的 2px 左线仍在生成纸 padding 内。height transition 只包当前 paragraph 或 Plan exit slot，不给整页设置固定高度；长段不会被截断。
- PAGE-212 preview 复用同一断点和 motion token，不新增后台专属宽度。

## 阅读位置与节点身份

- Plan item、`[data-paragraph-index]`、`.live-draft-text` 和状态 pill 使用稳定 key/节点。首稿 edit 和未变段不运行 enter animation；段发布不得重建页面头、设置区、选词器或生成纸。
- 段变化前记录可见 retained paragraph 的 viewport top；变化后只补偿其 top delta。若锚点已由 authoritative body complete 删除，则退回 passage 容器，不猜测目标段。
- `validated` 复用 passage node，Plan 在流内收拢；Result 动作在状态到达时已可用。视觉 settle 不调用 `scrollIntoView`、focus 或 smooth scroll。
- 当前焦点和 selection 不因视觉 callback 改变。终态时 Cancel 在同一 button node 更新为 Generate，避免 activeElement 被移除；普通配置/WordPicker 的 disabled 属性与终态同步。新 epoch/取消清理 callback 后不得恢复已断开的节点。
- 首稿 displayed prefix 增长时继续使用同一 paragraph node；换行新增段落只来自已收到文本中的真实分段。每帧变化不得触发 smooth scroll 或把读者拉到底部；可视锚点规则与 R2 相同。

## 语义、语言与减少动态

- Plan 使用 section/header、场景和 `dl`；published/final passage 保持 `lang=en`。中文/英文固定文案跟随页面语言，目标词和英文用法保持 `lang=en`。
- old paragraph 和 removed tail 只存在于 CSS pseudo/`aria-hidden` 视觉层，不进入 accessible text；新 authoritative paragraph 是唯一可读文本。变化颜色不是唯一提示，2px 左线同步出现。
- 状态槽为 `role=status aria-live=polite`；只报告阶段/真实 activity。正文 edit、Plan item 和 motion 完成事件不逐项朗读。
- typing 正文不是 live region；`aria-busy` 只覆盖真实 backlog，caught-up/flush/cancel 当下移除。caret 为纯装饰 pseudo-element，不进入可访问树。
- `prefers-reduced-motion:reduce` 时 received text 直接显示且不出现 caret，duration token 为 1ms，JS 不建立 paragraph/Plan exit ghost；保留同一 passage node、即时内容和静态淡绿 cue。现有 dialog motion 继续关闭。

## 验证视口与捕获预算

- Desktop 1440×1050：短段 before/during/after 三帧，body→valid 交接一帧；检查节点 identity、220/240ms、scrollY/焦点。
- Narrow 390×844：英文 paragraph during 一帧；检查状态换行、正文清晰和横溢 0。
- Reduced motion 1440×1050：computed animation none、无 exit slot、retained passage identity；无需重复截图。
- PAGE-212 和长段用浏览器状态/identity 检查，不增加重复图。R2 捕获预算为 5 张；原 UI13/R1 图和 10/10 报告冻结复用。
- R3 丰富样例只捕获 4 张：desktop 返修/最终、390px 中文最终/英文返修。检查六词选择、六条 Plan/最终释义、四段换行、三改一不变、单列可读和横溢 0；R2 motion/reduced-motion/中断证据冻结复用，不重复拍摄。
- R4 只捕获 2 张：desktop 中文首稿铺开中、390px 英文 PAGE-212 铺开中。真实时间报告另记录两个增长采样、650ms 呈现预算加一个浏览器渲染帧容差、完成/取消/重播、reduced motion；静态截图只证明版面和 caret，不单独作为 typing 证据。
