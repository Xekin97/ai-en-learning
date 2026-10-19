# CR-309 修复前只读视觉基线

- 状态：`baseline_only`，不是正式 QA 结论或阶段迁移。
- 页面：当前运行中的 <http://127.0.0.1:3014/create>。
- 视口：桌面 `1440×1000`，手机 `390×844`。
- 范围：GenerationWorkspace 的生成前、生成中 Plan/正文和最终正文/词义；不评价文章内容。

## 方法

浏览器使用当前 3014 隔离前端副本和真实组件/CSS。选项与词库仅做 GET；`/api/v1/generations/stream` 由页面内存中的确定性 SSE 替身接管，提供两个词的 Plan、正文增量和最终结构。最终采集同时拦截 analytics，因此业务后端 mutation 为 0，额度在两个视口均保持 `100→100`，provider 日志无新增，真实模型调用为 0。

第一次成功采集曾允许页面正常发送 8 条 analytics；此前两个不完整调试轮也可能发送同类遥测。该事实保留在 [`method-correction.json`](method-correction.json) 与 [`attempt1-unexpected-analytics.json`](attempt1-unexpected-analytics.json)，未回滚或删除数据库记录。它不涉及 generation、额度、模型配置或 provider 调用。

## 实际差异

桌面生成中词义区是固定双列，实际 `346px + 346px`，间距 `12px`；最终词义区由 auto-fit 形成两列，实际每列 `369px`，间距 `22px`。手机均为单列，但间距仍分别是 `12px` 与 `22px`。

同一个词义项在生成中和最终态的表面与排版明显不同：

| 属性 | 生成中 `.m003-plan-use` | 最终 `.resource-card` |
|---|---|---|
| 卡片表面 | 白底、1px 边框、10px 圆角 | 透明、无边框、无圆角 |
| 内边距 | `13px 15px` | `0` |
| 词头 | 17px/600 衬线、深绿色 | 18px/700 无衬线、正文色 |
| 释义 | 15px/24px，顶部 4px | 15px/24px，上下各 8px |
| 搭配 | 12.5px/20px，顶部 5px | 15px/24px，上下各 8px |
| 项间距 | 12px | 22px |

手机截图更直接显示连续性断裂：生成中词义是两个独立有框卡片，终态变成同一阅读区里的两组裸文本。

正文自身较一致：桌面生成中与最终均为 22px 衬线、约 40.7px 行高；手机均为 21px、约 37.38px 行高。CR-309 的主要 before 差异因此落在词义/用法元素，不需要把正文排版视为同等级问题。

## 预设页源码观察

本轮没有扩展到需要登录和草稿数据的 Admin 浏览器场景。源码显示预设生成中仍使用普通 `<p><strong>` 行，而最终使用 `PresetWordMeanings` 的 `dl/dt/dd` 两列结构；设计若把 PAGE-212 纳入最小范围，应给出同一元素的共享视觉接点。该观察是设计输入，不是正式 QA 失败。

## 截图与计算证据

- 桌面：[生成前](pre-desktop-1440.png)、[生成中](during-desktop-1440.png)、[最终](final-desktop-1440.png)
- 手机：[生成前](pre-mobile-390.png)、[生成中](during-mobile-390.png)、[最终](final-mobile-390.png)
- 完整计算样式与尺寸：[`computed-differences.json`](computed-differences.json)

正式复验须等待设计、实现和 QA 门禁。复验时应保持相同 fixture、视口和选择器，确认同类词义元素的表面、字体、间距与响应式行为收敛，同时保留 Plan 的“暂定”语义和最终资源的正式语义。
