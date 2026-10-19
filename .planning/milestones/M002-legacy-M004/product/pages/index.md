---
milestone: M004
agent_name: product-maya
status: awaiting_user_review
date: 2026-10-15
---

# 学习入口与设计交接

这些编号表示既有页面内的职责区域，不新增路由。范围依据 [S402](../overview.md)；具体按钮、状态文案和视觉规格由 designer-tony 交付。所有区域共用 [CAP-401～404](../abilities.md) 和 [DATA-401～404](../data-assets.md)，不得由各页另立播放规则。

| ID | 既有页面职责 / 当前代码事实 | 本轮建议的发音位置 | 验收 |
| --- | --- | --- | --- |
| PAGE-401 | 造文工具台选词：`/create` → GenerationWorkspace → WordPicker；现有搜索候选、已选词、加删词及随机选择 | 候选词与已选词旁可独立播放。不扩建新选词流程，不因组件共享自动扩展到预设试用页 | AC-401/402/405/407/408 |
| PAGE-402 | 工作台词义卡：GenerationContent 的计划与完成结果均用 GenerationVocabularyList，含单词、当前释义、用法 | 当前已经可见的词旁播放；流式出现不自动发声，计划切换结果时按 CAP-404 结束消失入口的播放 | AC-401～409 |
| PAGE-403 | 已保存文章 `/library/[batchId]`：既有 study-resources 卡片展示 `target.entry`、`entryMeaning`、`hintPhrase`；正文仅高亮词，不存在另一个单词弹窗 | 在现有单词学习卡标题旁播放；保留文章权限、上下文释义及短语。无需为“详情”另建弹窗或让正文全部变成新交互 | AC-401～407/409 |

代码只读核对入口：[create.vue](../../../../../frontend/app/pages/create.vue)、[GenerationWorkspace.vue](../../../../../frontend/app/presentation/components/GenerationWorkspace.vue)、[WordPicker.vue](../../../../../frontend/app/presentation/components/WordPicker.vue)、[GenerationContent.vue](../../../../../frontend/app/presentation/components/GenerationContent.vue)、[GenerationVocabularyList.vue](../../../../../frontend/app/presentation/components/GenerationVocabularyList.vue)、[已保存文章](../../../../../frontend/app/pages/library/%5BbatchId%5D.vue)、[explore.vue](../../../../../frontend/app/pages/explore.vue)、[PresetWordMeanings.vue](../../../../../frontend/app/presentation/components/PresetWordMeanings.vue)。PresetWordMeanings 实际用于 explore 与后台，本轮均不新增入口；其代码仅用于核对复用边界。当前目标位置未见发音操作，不能把本稿写成已实现状态。

## 统一可见状态（PROPOSED）

可点击 → 准备中 → 词典播放或浏览器朗读 → 可重播。失败可转浏览器；需要再次手势时显示可操作说明；完全不可用时给局部提示与重试。切换目标/离开可取消。口音、来源及回退规则只在 [CAP-402/403](../abilities.md) 维护。

状态需让用户看清“正在准备哪个词、当前用什么来源、是否还能重试”，不显示堆栈、接口路径或内部技术错误。提示不覆盖主要词义，不用全页错误替换学习内容；沿用现有界面语言，单词仍为英语。

## 下一设计角色的具体任务

PROPOSED：先以可交互原型覆盖默认播放、英美资源差异、浏览器兜底、无声音、切换取消与键盘/移动端操作；再完成以现有 M002/M003 样式和组件为基准、可供前端还原的正式设计。两类产物分别到位，不能用粗略原型替代正式设计。

正式设计明确三处布局、图标与文本、状态反馈、焦点和触控行为、中文/英文文案及资源署名位置；特别检查 WordPicker 候选行已承担选择操作，播放与选词必须可区分且各自可达。是否以及如何显示来源详情由设计在不增加学习负担的前提下落实。OPEN-401/403 的技术结果若影响文案/可用状态，设计接收修订，不先承诺未验证的双口音或设备能力。
