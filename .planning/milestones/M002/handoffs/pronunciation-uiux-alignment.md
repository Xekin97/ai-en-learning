---
milestone: M002
stage: uiux-design
role: uiux/base
agent_name: designer-tony
status: awaiting_user_review
version: M002-UI-32-R3-TA1
date: 2026-10-16
---

# 单词发音局部设计补充交接

当前交付为 CR-315 的 TA1 设计补充，待用户审阅。已批准 R3 仍是基础，新稿不自动代表批准或阶段迁移。root 执行 designer-tony 语义角色，实际模型未知，未声称启动历史runtime或切换模型。

## 输入与确认范围

- [门禁136](../reviews/pronunciation-design-alignment-entry-136.md)授权只补准确口音文案和单替代选择，不重做页面。
- [R3接受记录](../reviews/pronunciation-design-acceptance.md)、[已接受设计交接](pronunciation-uiux-accepted.md)、[CR-315原始缺口](../changes/CR-315.md)、[FE-PRON-01交接](pronunciation-frontend-architecture.md)。这些冻结原件保留不改写。
- 用户确认的裸图标、每词原位状态、无操作/状态文字、单音源无来源文字及选词不播放继续有效；音源范围保持 FreeDictionary 与浏览器 speechSynthesis，不加第三音源或新署名入口。
- 全局 first-release-compatibility-policy、claimed-batch-delete-retention-exception 与 [QA范围](../../../agt/qa-scope-policy.md)不变；本稿没有业务数据操作、迁移或文章质量测试。

## 唯一设计接收入口

- [设计规格及PAGE/CAP/DATA映射](../design/pronunciation/technical-alignment/design-addendum.md)，包含演示入口、参数、定位和 UIA-M002-452～454。
- [交互规则](../design/pronunciation/technical-alignment/interactions.md)、[文案补丁](../design/pronunciation/technical-alignment/copy.json)、[正式稿](../design/pronunciation/technical-alignment/formal/index.html)、[原型](../design/pronunciation/technical-alignment/prototype/index.html)。两者共用[controller](../design/pronunciation/technical-alignment/controller.js)，样式直接复用批准R3。
- [交付清单](../design/pronunciation/technical-alignment/evidence/delivery-manifest.json)绑定当前源、截图和验证脚本；恢复快照位于提交目录。文案合并方法只在规格维护，不另建译文副本。

前端下一次接收只需把本稿覆盖的口音失败与单替代分支映射到 FE401-V5、组件状态和工程文案转换位置；不得从R3旧静态提示与TA1新模板中任选，也不能将原型计时或演示口音列表带入生产。现有前端稿保持未批准，接收补充后再提交技术阶段检查。

## 检查与文档整理

[浏览器16项检查](../design/pronunciation/technical-alignment/evidence/browser-report.json)覆盖双向失败、单/零/多替代、实际选择、焦点、窄屏、双语、正常状态对照和迟到回调。设计负责人已实际查看截图；真实音频、手机读屏及设备声音变化未验证。初次菜单焦点失败及修正保留在设计规格与首轮报告，不将失败证据改写为通过。

当前权威入口改为本交接；R3和FE-PRON-01的历史源与审批不变。新源独立于冻结源，不重复创建完整视觉规范；仅重载受影响文案和交互。静态路径与源保全校验见提交验证。本轮未做新会话交接测试：未授权额外协作agent；以明确入链与可重放脚本供下游接收，不声称独立读者已验证。

## 未决与下一步

- CR-315：设计提案已完成，待审与前端接收，暂不标resolved。
- OPEN-401：backend-alex继续资源使用条件核实；OPEN-402：backend-alex/frontend-bob继续真实环境播放验证；OPEN-403：frontend-bob继续设备、手势、声音就绪和取消验证。定义以[技术交接](pronunciation-frontend-architecture.md)为准，本稿不关闭这些条目。
- 用户接受本稿后，经 agt-stage-gate 返回 technical-design/frontend-bob，接收 TA1 并更新 FE401-V5 及文案/状态映射；之后检查技术出口，不能直接跳实现。
- 3016真实UAT及OpenRouter配置保留；M002未获整体收尾批准。

本交接单不能切换阶段。
