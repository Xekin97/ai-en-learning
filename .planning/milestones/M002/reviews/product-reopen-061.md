---
milestone: M002
stage: product-planning
agent_name: gatekeeper-owen
decision_id: TRANSITION-M002-061
review_status: authorized_scoped_reopen
date: 2026-10-01
---

# 二期追加需求：返回产品修订

用户在 M002 收尾后明确提出“二期需求及设计改动”及五项要求：平台消息布局与固定可见的标题/操作、匹配主题的 Markdown 排版、预设配置和精选中展示单词释义、全站统一下拉框、首页 Why Wordweave 功能优势介绍。本请求授权对这五项进行产品与设计变更，不是开启第三期。

按 recover-or-rollback 恢复 `product-planning / product-maya / active`，登记 M002-CR-025。terminal stage 没有正常前进迁移，此处为用户明确要求的限定重开。已完成交付 [060](verification-acceptance-060.md) 和用户 UAT 原件保留，对未改动范围继续有效；新增要求尚未实现或验收。

检查：锁定 consumer-ai-web@1.0.0 原件摘要一致；product-maya 注册角色和语义名有效；原无待决事项或开放 CR；原完成状态及历史已保存于[快照](evidence/product-reopen-061/before-controls.tar.gz)。原 Profile、设计/技术批准、真实 AI 和发布边界保持，history 仅追加。此前前端实施与 QA 持续授权保留，不扩大为产品或设计稿的自动批准。

当前入口为[产品交接](../handoffs/product.md)，责任角色 product-maya 先修订产品主文档；设计再接收获确认的增量。仅新增 CR025，不重开其他已关闭缺陷或删除一期/二期功能。当前活动角色 product-maya，当前状态 active；本记录不宣称新产品稿、原型或实现已经获批。
