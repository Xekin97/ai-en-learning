---
milestone: M001
stage: product-planning
role: product/to-c
agent_name: product-maya
status: awaiting_user_review
date: 2026-09-08
revision: CR-040
direction_status: confirmed_by_user
implementation_status: not_started
---

# 产品规划角色交接单

## 输入与确认闭环

- 锁定项目与 Profile：[project.yaml](../../../agt/project.yaml)，consumer-ai-web@1.0.0；活动角色为 product-maya，有限写入授权见 [TRANSITION-M001-100](../reviews/verification-cr040-product-revision-review.md)。
- 用户 2026-09-08 的明确澄清及撤销的旧理解见 [CR-040 原件](../verification/cr040-meaning-only-request.md)；本轮“继续”启动已授权产品工作，不表示批准未产出的技术方案。
- 释义对象及依赖的唯一产品定义见 [AI 行为 §3.3](../product/ai-behavior.md#original-entry-meaning)。用户已明确原词独立释义，无须重复确认；不再沿用“按文章选义但隐藏作用说明”的解释。
- 历史差异及保留边界统一记在[产品概览当前修订入口](../product/overview.md#cr040-revision)。DEC-009 第 3 项和 DEC-032 前提的旧释义口径被本次明确纠正，其余规则不重开。
- 原功能 UAT 接受、QA098 和 UAT099 的有限通过结论保留；[当前质量交接](./verification.md)仍未接受新释义质量，本轮不改变其结论。

## 本次产物

| 当前主文档 | 本轮修改 |
| --- | --- |
| [AI 行为契约](../product/ai-behavior.md) | §3.3 统一原词释义边界；更正示例、结构与语义校验的区分；§9.1 汇总 C40-01 至 C40-06 定向验收 |
| [产品概览](../product/overview.md) | 当前修订入口、历史优先级、价值描述与复习/验收引用 |
| [数据资产](../product/data-assets.md) | DATA-011/012/013 的释义语义与保存后沿用关系；不设计表或字段 |
| [能力清单](../product/abilities.md) | CAP-008/009、CAP-014/018 的内容定义，关联保存与管理员只读查看一致性 |
| [页面映射](../product/pages/index.md) | PAGE-004/006/008 的内容语义与 PAGE-103 只读一致性；不改布局或交互 |

## 文档整理与自检

- 沿用五份 Profile 主文档；详细释义规则只在 AI 行为 §3.3 维护，其他位置引用。沿用本交接单，不追加整篇旧交接、不新建 CR-040 计划/总结/整理报告。
- 仓库尚无可恢复 Git 提交，因此先保留一份[修订前合并快照](../product/archive/pre-cr040.json)：六份原始文档按 original_path、sha256、完整 UTF-8 content 保存。旧审批/测试摘要对应这些原文，不回写历史 manifest；冻结决策、QA/技术原件保持不动。
- 追踪：DATA-002/010/011/012/013；CAP-008/009/010/011/014/018/107；PAGE-004/006/008/103。API-005/007/008 仅列为后续技术核对关联，不在产品阶段修改协议。
- 自检 PASS：Ruby YAML 解析六份文档元数据；Node 只读检查全部相对链接/显式锚点、DATA/CAP/PAGE 稳定编号、六份快照 UTF-8 内容与 SHA-256、原 UAT099 基线摘要及 C40-01 至 C40-06 唯一编号；逐项比较修订前后正文，差异均限于本次范围。
- 范围外保护 PASS：除五份主文档、本交接和新增合并快照外，3,825 份 .planning 文件清单/摘要不变（聚合 SHA-256：7bc098a6666f8333ce058991a45c94cfc81ba90538cbeab1c1a34f4dc4e95fd4），包括 workflow、注册表、历史、QA 原件和技术文档。没有以整理为名删除文件。
- 本轮不执行开发测试、真实模型调用、部署或全站 UI 回归；人工语义示例不是模型样本，不声称 C40 验收已通过。
- 按已采用路由锁请求 product/to-c → frontier / gpt-6-astra / high；actual_model 与 usage 未观测，无实际换模宣称或额外代理。

## 未决事项与风险

- 产品需求理解无阻塞项；本轮文档待用户审阅。CR-040 产品正文已修订但未获批准、未实施或验收，不关闭 CR-040 或 CR-039。
- OPEN（后续技术）：实际 contextual_meaning 命名、提示词及关联契约影响须由 backend-alex 有限评估。产品示例中的 entry_meaning 只是语义示意，不等于已批准 API 改名，也不等于批准保留旧命名。
- 不擅自规定完整多义词列表或义项数量，不增加词典服务、缓存或第二次模型调用。任何新的关键解释、成本或兼容方案需先展示并让用户决定；适用 [USER-COMPAT-001](../reviews/first-release-compatibility-policy.md)。
- 结构和词形校验无法证明全部释义质量。实际技术指令及实现仍含语境释义，必须后续修订并按 [C40-01 至 C40-06](../product/ai-behavior.md#cr040-acceptance)验证；旧 UAT 不能替代本次真实内容质量结论。
- 本轮不改写既有批次、不承诺旧样本自动变成新释义；后续真实模型测试须先确认模型和样本预算，不延伸此前已用尽授权。

## 下一步建议

请用户审阅本次有限产品修订。批准后建议由守门器办理受影响技术文字的有限同步，责任角色为 backend-alex；既有 UI 设计不重做，字段影响不得跳过技术评估直接实现。本交接不修改 Profile、workflow 或角色注册表，也不自行跨阶段。

按 agt-product-planning，本轮停在 awaiting_user_review。
