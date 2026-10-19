# M003-UI-08 有限正式设计检查

日期：2026-10-10  
范围：正式设计新增缺口；不重复 UI07-R1 的 15-wire 业务矩阵。

## 最终结果

`M003-UI-08-formal-browser.json`：8/8 PASS，0 page/console error。

- 320px：长 scene/sense/phrase 与逐片正文同时可见，无页面横溢；最终长正文与保存入口可读。
- 键盘：首个 Tab 到 skip link，激活后焦点进入 `#main`。
- 命中区：正式页可见的 button/link/input/select 或其关联 label 均达到 44×44px。
- 减弱动效：书写点实际 computed duration 为 `1e-05s`（即 CSS `0.01ms`）。
- 768px：英文计划页与中文预设页完整区域存在，无页面横溢；formal view 无 scenario/prototype 标记或人工“Show remote conflict”动作。
- 文案：`app.js` 字面 `t/tt` key 在 `copy.json` 的 zh/en 中 0 missing。

## 首轮与定向修复

1. `M003-UI-08-formal-browser-first-pass.json` 为 0/1：激活 skip link 触发 hash 导航，现有 popstate reload 使执行上下文重建。它是实际键盘行为缺陷，不是断言问题。UI08 在 `.skip-link` click 中阻止默认导航、保留 URL 并显式聚焦 `#main`；后续通过。
2. `M003-UI-08-formal-browser-reduced-motion-assertion.json` 为 7/8：浏览器将 CSS `0.01ms` 序列化为 `1e-05s`，实际已减弱动效。只修正断言接受同值，没有改产品样式。
3. `M003-UI-08-formal-browser-visual-first-pass.json` 自动 8/8，但目视 `04-presets-768-zh-first-pass.png` 发现 768px 管理导航 + 预设列表 + 编辑器三列导致编辑器过窄。这是实际布局缺陷。UI08 增加 `@media (max-width:900px)`，管理导航改顶部局部滚动、预设列表置顶两列、编辑器全宽；最终 `03/04` 截图复验通过。
4. root 目视后指出影响预览中的 “Show remote conflict” 是人工演示动作。formal view 已移除该按钮；非 formal 折叠演示仍能进入冲突状态，生产只由真实 revision 冲突触发。

## 目视截图

- `01-create-plan-draft-long-320.png`
- `02-create-final-long-320.png`
- `03-plans-preview-768-en.png`
- `04-presets-768-zh.png`
- `03/04-*-first-pass.png` 保留 768 布局缺陷原始证据。

未检查真实 API/DB/模型、生产时延、前端构建、权限、axe、完整读屏、200% 缩放、Safari/Firefox 或 UAT3302。UI07-R1 的正常点击/Plan 保留/正文 splice/终态证据继续有效。
