---
milestone: M002
version: M002-PRODUCT-08-R1
agent_name: product-maya
status: submitted_under_continuation_authorization
date: 2026-10-16
---

# 既有页面接入

| ID | 接入区域 | 数据/能力 |
|---|---|---|
| PAGE-401 | /create选词区：不接入发音，保留原搜索/随机/加删词 | 无发音消费 |
| PAGE-402 | /create的生成计划及完成结果词义卡，GenerationVocabularyList标题旁 | DATA-401/403/404；CAP-401～404 |
| PAGE-403 | /library/[batchId]既有学习卡词标题旁，不新增正文弹窗 | DATA-401/403/404；CAP-401～404 |

三个实际表面（计划、结果、已存文章）共用词控件和单页播放规则。计划旧稿退场不保留音频；新表面即便同entry也不是旧播放的延续。状态始终留在本词；无全局播放状态，无可见操作/状态文字；可访问名称与局部读屏提示沿批准设计。

单一实际选项仅图标，多口音使用已批准本词菜单。无声失败仍可重试；选定口音失效沿TA1显式替代。声音到达不自动播放，不在选词/explore/trial/admin/review复用时自动启用。

设计责任：复用R3+TA1正式布局/图标/触控/焦点，仅同步浏览器单路径的演示与说明；原型和正式稿都要可运行且使用统一copy。不得重新引入词典来源或署名入口。
