---
milestone: M001
role: uiux/base
agent_name: designer-tony
status: delivered_baseline
maintenance: M001-AGENT-CONTEXT-001
---

# M001 UI 与交互基线

M001 已由 TRANSITION-M001-138 关闭；正式状态见[当前交接](./verification.md)和 workflow。以下是已交付知识入口，不是重新激活该角色或待批准的交接。

## 有效设计入口

- [页面映射](../product/pages/index.md)、[交互](../design/interactions.md)、[响应式与可访问性](../design/responsive-accessibility.md)、[追踪](../design/traceability.md)。原型：[HTML](../design/prototype/index.html)、[主题](../design/theme.css)；原型是设计工具，不能作为真实 API/权限/事务通过的证据。
- PAGE-103 只读弹窗、注销视觉及访客引导见 [CR031/032 交互](../design/cr031-cr032-interaction-contract.md)。
- PAGE-007 日期编辑、零命中与恢复见 [CR034 交互](../design/cr034-interaction-contract.md)：日期表单在无命中/加载/失败状态保持可操作，未知数与 0 区分；≤1080px 纵排，≥1081px 320px 侧卡。不能将 900px 的旧断点误用为最终基线。
- PAGE-008：同词匿名组、颜色与纹理双线索；隐藏答案不得进入 DOM、可访问名称或输入宽度提示。日期复习与本篇复习分别保存上下文。

## 修改与验证

生产实现入口为 frontend/app/presentation 和 app/pages；以受影响页面、状态、语言、断点做定向验证。[覆盖索引](../verification/coverage-matrix.md)区分原型自检、生产实现与独立 QA，不能把 069 原型 560 组结果当作全站生产回归。

历史旧断点/固定几何基准造成的误判，应与同平台已批准原型对照，保留差异原因；来源见 [QA085](../verification/cr037-cr038-085-report.md)。真机 Safari、人工读屏等未覆盖范围沿原件，不因本次整理改为已验证。

旧交接原文与审批关系见[历史索引](./archive.md)。
