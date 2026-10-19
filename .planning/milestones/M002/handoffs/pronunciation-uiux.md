---
milestone: M002
stage: uiux-design
role: uiux/base
agent_name: designer-tony
status: awaiting_user_review
version: M002-UI-32-R3
current_scope: pronunciation
date: 2026-10-16
---

# 单词发音设计交接

当前设计 **M002-UI-32-R3 待用户审阅**。M002 仍未收尾；CR313 已接受范围及真实 UAT/OpenRouter 保持。当前没有发音技术/产品实现授权。

## 输入与需求确认

- 已接受 [M002-PRODUCT-08](../product/pronunciation/overview.md)，最新范围修订 [CR-314](../changes/CR-314.md)。用户已明确取消选词播放，并选择“每个单词一个紧凑控件，状态就地显示”；[原始问答](../reviews/evidence/pronunciation-revision-132-r1/clarification.json)。无需重复确认。最新用户要求为图标交互、无操作/状态文字，单音源不显示来源；[原话](../reviews/evidence/pronunciation-revision-132-r2/clarification.json)。
- 有效视觉来源为 M002 基线及既有生成/词义/已保存文章设计。旧 M003 路径仅为历史源归属，不是新里程碑。
- 原 UI32 的选词播放、独立状态卡、移动贴底菜单，以及 R1 可见操作/状态文案、单音源来源文案均退出标准；历史源与证据保留。R3 另按[用户要求](../reviews/evidence/pronunciation-revision-132-r3/clarification.json)去掉控件边框和边距，改为裸图标/内容宽度标签。无剩余业务假设。

## 当前产物与接收

唯一当前规格：[design/pronunciation/design-spec.md](../design/pronunciation/design-spec.md)。后续角色从本规格及 CR-314 读取，不能以旧交接或旧 UIA-M003-439 的选词播放规则实现。

- [完整正式设计](http://127.0.0.1:4175/M002/design/pronunciation/formal/?page=result&lang=zh) / [已保存文章](http://127.0.0.1:4175/M002/design/pronunciation/formal/?page=library&lang=zh)
- [独立交互原型](http://127.0.0.1:4175/M002/design/pronunciation/prototype/)：仅用于状态演示，不能代替正式产品布局。
- [copy.json](../design/pronunciation/copy.json)、[theme.css](../design/pronunciation/theme.css)、[controller.js](../design/pronunciation/controller.js)
- [交互](../design/pronunciation/interactions.md)、[响应式/无障碍](../design/pronunciation/responsive-accessibility.md)
- [浏览器证据](../design/pronunciation/evidence/M002-UI-32-R3-browser.json)、[源清单/快照](../design/pronunciation/evidence/M002-UI-32-R3-source-manifest.json)

启动方式、页面参数、fixture、稳定定位及 UIA-M003-439～450 / UIA-M002-451 都在规格内。前端需复用当前词义与学习卡，使用每词图标表达状态、完成恢复操作；单音源只显示图标，多音源才保留当前选择名称；所有入口共用单一活动播放控制。

## 自检、文档整理与未决

- 原型/正式稿共用文案、控件、状态代码；保留完整页面基线，覆盖 DATA-401～404 / CAP-401～404 / PAGE-401～403（401 为移除入口）。
- 浏览器检查范围/结果见原报告：桌面/手机、中英文、各状态恢复、键盘/口音菜单、取消/重播、长词、减少动效；只证明设计演示。本版定向验证 R3 无框紧凑布局；R2 控制器未改，状态流程证据可复用，旧版截图不能作为新版排版标准。
- 当前范围采用 M002 新目录，未改冻结 M003 文件和 CR313 设计主文件。修订前交接/控制文件快照在 `reviews/evidence/pronunciation-revision-132-r3/`，工作流与续做索引指向本交接。静态链接/来源检查有证据；未另启新会话做交接测试。
- `OPEN-401` backend-alex：真实音频来源与使用条件；`OPEN-402` backend-alex + frontend-bob：真实目标环境/音频；`OPEN-403` frontend-bob：浏览器/设备、手势、声音等待、取消与有限失败。技术阶段补证，不能用确定性演示声明实际可用。
- CR-314 已落实设计，保持开放待新版审阅。无产品源码、数据库、模型配置更改。

## 下一步

用户审阅本版正式设计；接受后交守门器检查进入发音技术设计，按原 Profile 路由。当前仍是 uiux-design / designer-tony，版本待审不是批准或阶段迁移。

> 本交接单不能切换阶段。阶段迁移必须由用户显式提交给守门器。
