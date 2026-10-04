---
milestone: M002
stage: product-planning
role: product/to-c
agent_name: product-maya
status: draft_pending_scope
version: M002-PRODUCT-05
change_request: M002-CR-026
updated_on: 2026-10-01
---

# M002 产品版本与修订证据

## 原批准基线（历史）

TRANSITION-M002-002 的[产品批准记录](../reviews/product-planning.md)、[摘要证据](../reviews/evidence/product-gate-002.json)及[原件快照](../reviews/evidence/product-gate-002/approved-product-and-before-state.tar.gz)保持不变。旧稿为 19 项增量、16 项页面职责、76 项决定；未完整承接一期，不能将其批准解释为删掉旧需求。

## 正式回溯

用户确认后，TRANSITION-M002-003 正式返回 product-planning / product-maya，开放 M002-CR-001。见[回溯记录](../reviews/product-rollback.md)及[回溯证据](../reviews/evidence/product-rollback-003.json)。设计角色越界产品草稿已撤回，只保留过程档案，未作为本版内容输入。

## M002-PRODUCT-02（已批准历史）

product-maya 从一期有效正文、原二期批准原件及用户后续明确要求独立重建五份正式产品文档，补齐 29 项原能力及其验收，保留 19 项二期能力；32 项数据索引（含 DATA-015 被替代索引）、25 项当前页面职责及 5 个旧页去向；新增 D2-77–80，保留原决定历史。

| 证据 | 用途与限制 |
|---|---|
| [输入快照](./evidence/M002-PRODUCT-02-inputs.tar.gz) | 修订前原件，包含 M001/M002 正式来源及产品交接/CR；不使用撤回草稿 |
| [输入与保护摘要](./evidence/M002-PRODUCT-02-sources.json) | 原件摘要、设计/历史批准/控制面保护摘要；不可冒充业务验收 |
| [可重复静态检查](./evidence/verify-product-02.py) | ID/相对链接/追踪/原二期详细规则保持及保护文件核对 |
| [检查报告](./evidence/M002-PRODUCT-02-check.json) | 机器可查范围及人工核对清单；独立新会话接续未执行，应用与 AI 未执行 |
| [审阅版本快照](./evidence/M002-PRODUCT-02-review.tar.gz) | 本次可审阅产品正文、决定、交接与检查证据的冻结副本 |
| [审阅快照摘要](./evidence/M002-PRODUCT-02-review.json) | 文件摘要及快照 SHA-256；不是批准记录 |

PRODUCT-02 提交时的保护范围包含 M001、当时的设计原件/UI 交接、历史批准及控制面；其检查仅证明当时状态。之后 TRANSITION-M002-004 已登记产品批准，见[批准记录](../reviews/product-revision.md)与[批准原件](../reviews/evidence/product-gate-004/approved-product-and-before-state.tar.gz)。PRODUCT-02 冻结原件/报告不再写入本次变化，不能用旧脚本核验当前 PRODUCT-03。

## M002-PRODUCT-03（已批准历史）

用户要求全部本人学习批次标题可编辑、默认标题保留，热门预设改为单标题并移除说明字段。[TRANSITION-M002-005](../reviews/title-fields-rollback.md) 正式回溯后，由 product-maya 基于已批准 PRODUCT-02 修订五份当前产品正文、决定与交接；新增 CAP-220 / AC-220 和 D2-81/82。现共 49 个能力/验收、25 个当前页面、32 个资产索引，原完整继承与其他规则保持。

| 证据 | 用途与限制 |
|---|---|
| [修订前输入快照](./evidence/M002-PRODUCT-03-inputs.tar.gz) | 修改前 PRODUCT-02 正文、决定、产品交接的完整原件 |
| [来源及保护摘要](./evidence/M002-PRODUCT-03-sources.json) | 输入、只读实现依据及非本次产物/控制面摘要 |
| [静态检查](./evidence/verify-product-03.py)、[检查报告](./evidence/M002-PRODUCT-03-check.json) | 当前文档关联和范围核对，不代表应用或独立交接验收 |
| [审阅原件](./evidence/M002-PRODUCT-03-review.tar.gz)、[快照摘要](./evidence/M002-PRODUCT-03-review.json) | 本次待审稿的冻结副本，不是批准记录 |

PRODUCT-03 当时新增 [CR-002](../changes/M002-CR-002.md)，提交时为待审；后已由 TRANSITION-M002-006 批准，CR002 沿044限定关闭。设计 UI-05 原件和证据保留为变更前版本，后续须按新规则重新接收相关范围；产品不修改原型、应用、历史批准、原 CR-001 或回溯后的控制面。此段其余说明保留提交时点语义；当前阶段以 workflow 为准。

## M002-PRODUCT-04（历史设计输入）

2026-10-01 用户新增五项展示/设计要求；已验 M002 交付保持为历史基线，TRANSITION-M002-061 限定重开 CR025。扩展 CAP-206/207/210/218 及关联页面/数据，没有新增实体或能力 ID。D2-83–87 记录原始明确需求，主题调研作为设计建议。

[修订前 PRODUCT-03 完整快照](evidence/M002-PRODUCT-04-inputs.tar.gz)、[输入/实现定位及调研](evidence/M002-PRODUCT-04-sources.json)、[检查结果](evidence/M002-PRODUCT-04-check.json)、[当前交接](../handoffs/product.md)。原 PRODUCT-03/UI22/QA27 的批准和证据原地保留；新增设计未验收，不以旧 UAT 证明新改动完成。

## M002-PRODUCT-05（当前草稿）

2026-10-01 用户要求后台消息增加只提醒一次且次数缓存浏览器本地；063 激活 product-maya，登记 CR026。仅修订 CAP-210 与 DATA-205、PAGE-207/209，保留其他 48 个能力正文。账号隔离范围尚待用户选择，故状态为 draft_pending_scope；不是可直接实现的批准稿。

[PRODUCT04 修订前原件](../reviews/evidence/notice-once-063/product04-before.tar.gz)、[CR026](../changes/CR-026.md)、[当前交接](../handoffs/product.md)。UI24 原件及所有旧批准保持，不以本轮产品定义声明原型或代码完成。
