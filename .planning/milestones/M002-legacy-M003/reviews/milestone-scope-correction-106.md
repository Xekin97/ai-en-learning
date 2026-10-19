---
milestone: M003
stage: product-planning
agent_name: gatekeeper-owen
review_status: scope_corrected
decision_id: TRANSITION-M003-106
date: 2026-10-15
---

# M003 归属与结项授权纠正

用户明确纠正：“这个不计在 M004 吧？003 我都没批准收尾”。[答复原件](evidence/milestone-correction-106/user-correction.json)为当前依据。

## 控制结论

1. **M003 整体尚未批准收尾**。此前把“UAT 验收通过，还有下一步吗？”解释为整个里程碑结项，超出了用户确认范围。TRANSITION-M003-105 的整体终态结论撤回；096 的历史结项结论也不作为当前整体完成批准。
2. CR-311/312 的功能 QA、当前版本用户 UAT 通过及问题解决保持有效。本纠正不否定测试、已交付功能或用户实际接受，也不要求重做这些验收。
3. **单词发音属于 M003 的后续需求**。TRANSITION-M004-001 的新里程碑启动与归属撤回。误建 M004 文件仅为冻结的历史来源，不是活动里程碑；其中的需求内容、两项用户答复保持有效。
4. 当前恢复 **M003 / product-planning / product-maya**，完成产品文档归位。产品主入口保持 Profile 规定的 M003 路径；新增发音内容归入 `product/pronunciation/`，已有 M003 业务正文与验收基线保留。
5. 用户此前“下一步”记录保留，本次纠正不将其解释为撤回发音范围/权益；本控制动作只纠正归属，不借此批准尚未产生的设计或最终收尾。此前尚未真正切换到设计或修改应用代码。

## 当前与历史依据

- [全部纠正前快照](evidence/milestone-correction-106/before-correction.tar.gz)：控制面、既有 M003 产品与验证入口、误建 M004 全部原件。
- [保留的 CR311/312 用户接受原件](evidence/uat-acceptance-105/user-acceptance.json)。
- [原发音启动授权](../../M002-legacy-M004/reviews/evidence/start/authorization.json)与[入口/权益答复](../../M002-legacy-M004/reviews/evidence/start/scope-confirmations.json)：历史 ID 中的 M004 不再表示当前归属。
- [历史 M003-105 检查](verification-acceptance-105.md)及[误建 M004 启动记录](../../M002-legacy-M004/reviews/start.md)原样保留；当前有效性以本记录和 workflow/state 为准。

## 保持的边界

沿用锁定 consumer-ai-web@1.0.0 与 model-routing-v1，不改框架或工作流类型。原有 retained_open_items 与 QA 范围政策保留。真实 UAT3015、源码、数据、账户和模型配置保持。本次不运行新业务测试、不调用收费模型、不提交或部署。

## 后续接续

product-maya 负责将已经完成的发音产品稿归入 M003 并修复路径、版本/归属说明；语义不变，不重复询问已回答的范围和权益。守门器仅机械同步状态及追加历史，不代写专业结论。是否收尾 M003 必须单独取得用户明确批准，局部 UAT 通过不自动触发整体结项。
