---
milestone: M001
stage: verification
role: quality/base
agent_name: qa-quinn
status: awaiting_user_review
date: 2026-09-07
verification_round: TRANSITION-M001-090
model: openai/gpt-oss-safeguard-20b
quality_verdict: limited_mixed
functional_uat: user_accepted
release_readiness: blocked
---

# GPT-oss 090 有限真实造文专项

## 结论

用户添加的精确模型`openai/gpt-oss-safeguard-20b`完成2篇限定真实造文：1篇validated/saved、1篇content_validation_failed。有效S1具备可用结构和连贯场景，但有不够地道的目标词搭配；S2可见正文基本连贯，却未满足第三个目标词的当前允许词形覆盖，完整学习资源不可评。因此有限质量结论 **MIXED**，不支持把该模型宣称为已通过通用造文发布认证。

[完整正文与逐篇评阅](./ai-quality-gpt-oss-090-samples.md)、[机器结果](./evidence/ai-quality-gpt-oss-090/quality-results.json)、[质量评阅](./evidence/ai-quality-gpt-oss-090/quality-assessment.json)、[全部090证据](./evidence/ai-quality-gpt-oss-090)。

## 精确模型与调用

- 产品管理员API和basic用户`generation-options`共同确认：internal ID `01a07ab4-dfe9-7fd6-8022-285d685763d0`、展示名`GPT-oss`、provider ID `openai/gpt-oss-safeguard-20b`、enabled且basic可选；10个冻结词条均存在，`max_entries=5`及medium/long可用。
- 真实造文调用严格2/2；probe 0、自动重试0、fallback 0。S1耗时2.980秒，S2耗时4.077秒；QA客户端上限300000ms，没有更改产品时限。
- 没有读取/更换Key、模型或组，没有部署、迁移、改密码、改prompt/validator或生产源码。请求的provider snapshot是精确ID；OpenRouter实际返回模型字段、usage/cost未暴露，均记`not_observed`/`unknown`。

## 质量结果

| 样本 | 终态 | 独立质量判断 |
| --- | --- | --- |
| S1 zh/discussion/medium | validated + saved，118词 | 场景、五词、中文释义、提示、3标签及长度完整；但`deteriorate team cohesion`是不够地道的及物用法，`perceive`两处搭配生硬，释义/标签部分偏泛。PASS WITH RESERVATIONS。 |
| S2 en/news/long | validation_failed，约233词，未保存 | 受控日志明确zero-based target 2未覆盖；`vulnerable`被写成当前规则不接受的派生名词`vulnerability`。可见正文基本连贯但完整释义/提示/标签不可见。具名机构/事件未核验，仅为学习示例。STRUCTURAL FAIL。 |

与QA088同配置的有限观察呈交叉结果：本模型通过S1而失败S2，DeepSeek此前失败S1而通过S2；本模型S1的搭配问题也更明显。样本仅2篇，不能外推稳定性、整体优劣或长期时延。[OpenAI官方指南](https://developers.openai.com/cookbook/articles/gpt-oss-safeguard-guide)说明`safeguard`型号主要用于自定义政策安全分类；这只是型号用途背景，不是本轮失败的先验或因果证明。

## 数据与边界

仅新增专用账号`uat_ai_quality_090`、2条run和1篇有效batch；S2产品调用额度退回且未保存，不代表供应商费用退款。该账号密码只存在于执行内存、未记录或分发，最终专用会话0。排除该账号后，既有账号/密码/会话、学习资料、run、模型/组/权益、凭据和迁移摘要全部一致；active generation最终0，UAT6001四容器保持healthy。

本轮没有重复全站UI、unit/lint/build、权限/复习/认证矩阵或全模型测试，也未修复实现。OpenAI官方用途与这2篇结果都提示：若要评估普通通用gpt-oss造文，须由用户另行决定是否配置不同的精确模型；本轮不擅自替换。功能UAT接受状态不变，AI质量仍待用户审阅，发布继续BLOCKED。

执行请求模型为`gpt-5.6-sol/high`；运行时未回传qa-quinn实际模型/usage，记为`not_observed`。
