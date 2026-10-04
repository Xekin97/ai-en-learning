---
milestone: M002
stage: implementation
role: frontend-implementer/base
agent_name: frontend-claire
version: M002-GALLERY-MEANINGS-F02
status: verified_scoped_fix
---

# 精选词义还原

用户2026-10-02反馈精选试用的释义展示与设计不同；按已批准UIA-PAGE-217-MEANINGS23 / CAP-218 / DATA-212 / API-202定向修复，不新增需求或设计。来源 prototype/gallery.js、word-meanings.js、theme.css/copy.json；源摘要及可恢复旧文见[证据](evidence/gallery-meanings-fix/manifest.json)。单工作区串行，保留所有其他改动，无Git提交。

- F01：explore.vue把词义区从正文之后移至左侧配置事实之后、试用按钮之前，删除重复词签。所有词义和完整正文仍来自同一发布快照。
- F02：PresetWordMeanings按原型显示语言原名中文/English/日本語，切UI语言不翻译该标签。共享后台预览也匹配word-meanings.js；配置选择器本地化保持。

缺陷复验：类型、受影响文件lint、生产构建通过；三语言内容及标签在界面语言切换后保持，桌面/手机2项通过；后台同组件预览与语言切换2项通过。1440/390相同公开样本、字体、DPR、界面语言及减少动效下，与原型的尺寸/位置/字号/颜色/标签一致；所有卡片完整词义/原文、无重复和页面横溢通过。实际3302最终包在同条件下两张截图与原型逐字节相同，0页面异常、0真实模型调用。未改轮播或生成逻辑，复用既有证据，不重跑全站。

截图预算原问题2图+匹配4图+实际2图；F02及公开数据由2篇变3篇后新增匹配4图+实际2图。方法修正：原型fixture URL含版本查询串，初次未拦截；实际数据检查初次使用旧2篇快照；后台fixture初次误设zh预期，实际为en。分别修正请求匹配、读取最新公开数据和依据fixture配置后通过，未修改产品预期。初始证据/文档在before-documents.tar.gz和before-language-label.tar.gz，失败结果保留。最终日志/截图见同证据目录。

## 仍有效的 UI31 交付

# CR029-F05 服务商工作区（UI31）

UIA-PAGE208-PROVIDER：列表以稳定provider ID展示 `.generic-provider-card`，头部连接/数量/编辑，内部全部模型名称/ID/状态/测试/移除。新增服务商直接配置新连接+多个模型；编辑已有服务商填充全部模型，可修改并继续添加，不提供复制已有连接的新增下拉和单模型编辑按钮。

严格DTO→mapper→repository→store贯通新聚合API。页面草稿独占Key，关闭清除；原位模型UUID、单项流式反馈及移除影响确认保持。409按模型UUID三方合并：本地编辑/新项保留，远端新增纳入、下架剔除；POST/PATCH保存结果不明确均阻止重复提交并保留草稿。

39文件372单测、类型/lint/边界257模块283依赖通过。16项中英×1440/390浏览器验收通过：新服务商+多模型保存、整组编辑追加并刷新保持、超过20条全量显示编辑、单项测试隔离、空新项不阻碍其他项测试、取消确认、冲突恢复、最后模型移除仍可编辑空服务商；4项补充未知保存结果保护通过。4项原型交互通过。布局/截图已查看，固定头尾和高级字段间距、服务商层级、无横溢符合UI31。生产构建日志在同目录，QA切换前确认最新完成。

首轮类型发现聚合readonly数组不匹配，改为只读EditableProvider边界并去掉重复自动导出，保留初始日志。浏览器保存使用契约HTTP fixture，真实原子性及角色隔离见后端DB/HTTP证据，不把fixture冒称真实付费服务。原型后补空服务商零条编辑及影响提示；对应实际页面已被空态用例覆盖。QA复用开发检查，补3302实际包与真实配置的两视口验证，测试拦截避免费用。

[evidence/provider-workspace31](evidence/provider-workspace31)；原UI30列表/单模型编辑证据失效，流式传输及未改学习流程证据仍有效。旧文见before-validation.tar.gz。用户UAT未代签。
