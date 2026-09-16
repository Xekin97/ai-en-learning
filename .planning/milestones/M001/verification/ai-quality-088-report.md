---
milestone: M001
stage: verification
role: quality/base
agent_name: qa-quinn
status: awaiting_user_review
date: 2026-09-07
verification_round: TRANSITION-M001-088
model: deepseek/deepseek-v4-flash-0731
configuration_result: pass
quality_verdict: limited_mixed
functional_uat: user_accepted
release_readiness: blocked
---

# QA088 真实造文质量专项报告

## 结论

用户指定的 [`deepseek/deepseek-v4-flash-0731`](https://openrouter.ai/deepseek/deepseek-v4-flash-0731) 已通过正常兼容探针并配置到本地 UAT6001 的 basic 组；没有绕过 enable 守卫。三篇代表样本中两篇完整通过并保存，一篇正文良好但中文释义目标在服务端确定性校验失败，产品调用额度已退回且未保存。因此配置结论 **PASS**，有限内容质量结论 **MIXED**，生产发布继续 **BLOCKED**。

[完整可读样本与逐篇评阅](./ai-quality-088-samples.md)、[机器评阅汇总](./evidence/ai-quality-088/quality-assessment.json)、[配置记录](./evidence/ai-quality-088/configuration.json)、[全部原始证据](./evidence/ai-quality-088)。

## 配置与调用

- 后端仍使用固定镜像 `sha256:642ed57ad0ed6c8a13e4bba1101d8b50188e8ea636791583a6ffb5eaa6917aac`；只把实际 runtime 的 `OPENROUTER_BASE_URL` 从本地 mock 改为 `https://openrouter.ai/api/v1`。frontend、Nginx、Postgres及卷未重建，Nginx仅reload；无build/pull/migrate。
- Key 通过主控所属无回显TTY直接送入产品管理员API，qa-quinn没有看到或转述原文；产品加密保存。官方 `/api/v1/key` 只读验证仅记录鉴权成功/未耗尽布尔值，不记录label、余额或其他私密元数据。
- 首次enable使用QA默认30000ms，客户端取消进行中的探针；服务端随后422/context canceled，模型保持disabled。这是QA等待方法错误，不是模型不兼容或产品SLA失败。[脱敏记录](./evidence/ai-quality-088/compatibility-timeout.json)保留，原请求头/Cookie/CSRF未写文件。
- 用户确认真实生成可能需1–2分钟后，088澄清允许唯一一次300000ms恢复探针。恢复探针正常200并启用；没有bypass或再次读取Key。
- 总推理尝试严格为5：首次被客户端取消的probe 1、恢复probe 1、质量样本3；自动重试0。真实样本调用3次。供应商usage/cost没有可观察回执，均为unknown，不能声称零费用。

## 逐篇结果

| 样本 | 配置 | 终态 | 内容判断 |
| --- | --- | --- | --- |
| S1 | zh / discussion / medium / alleviate, undermine, facilitate, deteriorate, perceive | validation_failed，产品调用额度退回，未保存 | 流出正文113词，自然连贯、五词用法贴合工作政策讨论；但target 0 meaning language/content被确定性校验拒绝，原始释义、hint、tags不可见，不能判断是模型中文输出错误还是校验器拒绝，也不能当完整中文样本通过。 |
| S2 | en / news / long / sustainable, prevalent, vulnerable, ambiguous, coherent | validated + saved | 253词；结构、五词用法、英英释义、提示、标签与长度通过。`prevalent`定义略生硬；具名研究、专家和引语未经本次事实核验、真实性未知，只能当AI学习示例，不能当已核实新闻。显式AI示例说明仅为质量建议，尚待产品决策。 |
| S3 | ja / story / short / learn | validated + saved | 94词；失败—练习—改进—分享的故事完整，learn/learned词形自然；日文释义准确，提示短语自然。标签合格但`物語`较泛，`学習`与`パン作り`更有主题信息。 |

三个英文正文的自然度和连贯性总体较好，两篇完整学习资源也具备可用质量。但1/3样本无法形成有效批次，特别是中文五词路径未闭合；如此小的样本不能估计稳定性或错误率。

## 当前UAT状态与数据

- basic 保留原额度、`max_entries=5`、short/medium/long/xlong及原模型ID，并新增已启用的真实模型；basic 用户现在可选择 `DeepSeek V4 Flash 0731`。
- `provider/integration` 已确认是旧mock模型并停用但未删除。visitor/pro/plus的组配置和模型ID集合没有改，但它们只指向这个已停用模型，因此当前没有已启用可选模型；“组配置不变”不等于可用性不变。
- 专用账号 `uat_ai_quality_088` 保留2篇有效批次和3条生成记录（1条校验失败且产品调用额度退回，2条valid/saved）。这不表示OpenRouter费用退款；供应商usage/cost不可观察。不分发账号密码；用户可在管理员Users搜索该账号并查看有效两篇，或直接阅读样本文档。没有把样本写入既有学习者Library。
- 执行前后排除该专用账号的既有账号/密码/会话、学习批次与目标、模型/组、凭据、迁移摘要全部一致；最终active generation为0。6001四服务保持healthy。
- 私有回滚/DB/runtime备份位于 `/var/folders/z9/99ckxr957v901zwwc8jdk8640000gn/T/wordweave-ai-quality-088-ewWiPG`，目录0700、三个敏感文件0600。当前不回滚，以免抹去本轮配置或后续UAT数据。

## 限制与下一步

本轮按用户要求没有运行unit/lint/build、全UI、多角色、复习或48组合矩阵，也没有修改prompt、validator、API、设计或生产源码。business、xlong、敏感词和多词词条未覆盖；真实Safari/辅助技术与公网性能仍沿用既有未验证边界。

建议先由用户审阅三篇原文与S2事实呈现保留意见；若要定位S1，需要新的明确授权决定是增加安全候选诊断、调整校验/模型策略，还是只补一次有控制的中文样本。当前不得自动重试、返工或发布。此前在聊天中使用过的测试Key在任何生产使用前必须轮换。

执行请求模型为 `gpt-5.6-sol/high`；运行时未回传qa-quinn实际模型/usage，记为 `not_observed`。
