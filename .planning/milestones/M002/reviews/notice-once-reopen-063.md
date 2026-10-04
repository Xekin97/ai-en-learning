---
milestone: M002
stage: product-planning
agent_name: gatekeeper-owen
decision_id: TRANSITION-M002-063
review_status: authorized_scoped_reopen
date: 2026-10-01
---

# 消息只提醒一次：限定返回产品

用户明确要求：“后台消息配置增加一个只提醒一次的配置吧，次数缓存到用户浏览器本地”。该指令授权补充消息规则并同步设计；本记录只激活 product-maya 处理 CAP-210 / DATA-205 / PAGE-207/209，不将其解释为批准未展示的新视觉或正式实现。

原状态为 uiux-design / designer-tony / active，当前 [UI24](../design/evidence/M002-UI-24-manifest.json) 已冻结，新增视觉待审。新需求改变此前“下次明确登录仍可提醒”的条件，因此登记 CR026，由产品角色先澄清和修订。每账号或整个浏览器的记录范围已提问，未收到答案前保留 OPEN；该问题不阻止产品接收明确的新需求。

检查：锁定 Profile 原件摘要一致，product-maya 语义名/注册有效，当前产物存在。控制面与 PRODUCT04 原件见 [快照目录](./evidence/notice-once-063/)。CR025 与全部旧批准/UAT/保留事项保持。仅回溯本项，不重开其他能力，不迁移 Profile、不发布。

当前角色为 product-maya，阶段 product-planning。具体规则和待确认项由 [产品交接](../handoffs/product.md) 与 [CR026](../changes/CR-026.md) 维护。
