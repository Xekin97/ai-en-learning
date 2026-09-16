---
milestone: M001
stage: implementation
role: backend-implementer/base
agent_name: backend-ethan
status: in_progress
date: 2026-09-12
revision: R10-LUNA-LIVE-5 / CR-042
---

# Luna 同提示词对比：5/5 首轮成功，无纠正

## 结果与可比范围

用户指定 `~openai/gpt-luna-latest`，5 次首次生成，每 run 沿用最多 2 次额外纠正。已完成 **5 次首次生成，0 次纠正，共 5 次模型调用**；无隐藏启用探测、手动重发、换名替代或中途调参。

沿用 wordweave_uat 专用账号、同一 r10 镜像、相同五组配置与严格校验。通过供应商生成记录的只读查询确认，五次实际模型均为 `openai/gpt-5.6-luna-20260709`，provider 为 OpenAI；请求仍使用用户指定的完整别名。

| 模型 | 首轮通过 | 最终通过 | 纠正调用 | 平均总耗时 |
| --- | --- | --- | --- | --- |
| Luna，本轮 | **5/5** | **5/5** | **0** | **9.4 秒** |
| GLM 5.3 Flash，上轮同 r10 五组 | 5/5 | 5/5 | 0 | 30.1 秒 |
| MiniMax M3，上轮同 r10 五组 | 4/5 | 4/5 | 2 | 20.4 秒 |

上轮不是本轮新增调用，也不与新样本混算分母。MiniMax 平均耗时包含失败批次的两次纠正；各模型输出长度、默认推理与供应商不同，不把耗时差异写成纯模型速度排名。

[逐次结果、阶段、用量、供应商实际模型及数据库结算](./evidence/luna-r10-5-20260912/results.json)；[前置快照与上一版报告/交接原文](./evidence/luna-r10-5-20260912/pre-test.json)；[上轮 r10 原始对照](./evidence/corrections-r10-10-20260912/results.json)。

## 五组内容检查

| 配置 | 原词组 | 正文字数 / 下限 | 结果 |
| --- | --- | --- | --- |
| 中文 / 讨论 / 中 | young, grape, weekend, danger, enforce | 152 / 100 | 首轮通过 |
| 英文 / 故事 / 特长 | sustainable, prevalent, vulnerable, ambiguous, coherent | 554 / 400 | 首轮通过 |
| 中文 / 故事 / 短 | melancholy, handicap, foray, casino, upswing | 57 / 50 | 首轮通过 |
| 日语 / 新闻 / 长 | sustainable, prevalent, vulnerable, ambiguous, coherent | 266 / 200 | 首轮通过 |
| 英文 / 商务 / 短 | alleviate, undermine, facilitate, deteriorate, perceive | 81 / 50 | 首轮通过 |

已完整审阅五份模型原文、25 个原词释义和 25 个 hint：

- 第一组的 grapes(grape)、younger(young)，第五组的 perceived(perceive)、undermining(undermine) 均正确归属；正文重复位置和 hint 中的变形可正常处理。
- 第二组正文出现未选的 young plants，没有附加 young 标签；未重现上轮 MiniMax 的未知标注问题。554 词分七段，不是上轮的 1,327 词长单段。
- 释义未发现“在文章中的作用”尾注；handicap 没有误译成“残疾人”。hint 均为短语，本轮没有完整主谓句提示。
- 第三组虽满足 57 词和基本连贯性，但更像简短情境铺陈，故事发展较弱。这是人工内容体验观察，不虚构为确定性校验失败。
- 本轮没有发现明确的既有内容契约违规，但并非词典级语义认证。变形 hint 只观察到一处，不据此宣称所有派生情况均被覆盖。

五次均完整 JSON、stop 结束、单一 validated 终态。SSE 拼接与最终正文一致、原词顺序/挖空位置正确、前端内容未泄露括号。数据库五次 valid、五份草稿正常计次，未加入复习库，进行中请求 0，测试登录已退出。

## 对“模型能力还是提示词”的判断

**现有 r10 提示词能够被正确执行，并非任务约束根本无法同时满足。** Luna 和 GLM 都在同五组首轮通过；这一观察支持模型对当前提示词的遵循/适配差异可能参与了之前的失败，不支持继续无依据地增加限制。

但五个样本不能把原因归结为“智能高低”，也不能证明 Luna 优于 GLM、提示词完全无问题或生产成功率稳定达到 90%。MiniMax/GLM 路由固定 Together，Luna 沿用代码的通用 OpenRouter 路由（require_parameters=true、data_collection=deny）；推理、采样参数均未显式统一。它是同应用提示词的实用对比，不是完全隔离变量的模型能力实验。

本轮没有触发纠正，所以**没有验证纠正救回率**。上轮 MiniMax 未知 young 标签、纠正提示没有精确错误片段的缺口仍存在；本轮不实施先前 PROPOSED 的提示修复。

## 用量、留存与变更

每次耗时 6.976–12.706 秒，总计 46.817 秒。上游原生用量为 prompt 8,973 / completion 4,001 / total **12,974 tokens**。只读生成记录报告 reasoning 1,544、cached 0；reasoning 是 completion 的细分，不再次相加。五条 total_cost 合计 0.0070437（供应商记录，未做账单核对）；返回的负 cache_discount 原样保留，不推断为缓存命中。

为满足这次局部测试，临时新增一个模型配置并关联 registered 组；没有重置账号组/额度、变更既有模型或密钥。测后已撤下这一个临时组模型关联并停用新增模型，保留模型记录供五个 run 外键追溯；原组三项授权完全恢复。启用不另发付费兼容探针，五次真实请求自身是本轮调用证据。

后端镜像仍为 `sha256:c9bccc60c9674a5bbde37ba4f027f70582a1292782bc8226c52b1903ddfb2ce3`，启动时间未变、healthy、重启 0；15 份源码哈希未变。未部署、改功能/提示词/校验/前端、改契约、全站回归、提交或生产发布。

原文仍为专用账号私有 tmpfs：每份 1 MiB、50 份、24 小时。本轮 5 份加旧 33 份共 38 份，旧 manifest/TTL 完全不变；新增预计北京时间 9 月 13 日 16:19 到期。未把完整生成原文、密钥或登录凭据导出到仓库/宿主磁盘。

## 交接与开放项

按 agt-backend-implement 只执行当前授权的后端开发验证；OpenAI 文档技能用于标识核查，测试事实以实际 OpenRouter 调用记录为准。当前仍是 implementation/backend-ethan，不把本轮自测认作独立 QA/UAT。

继续追踪 CAP-008/009、API-005、DATA-009/011、CR-039/040/041/042：稳定 90%、语义质量、定向纠正精准反馈、safe 派生覆盖、独立 QA/UAT、有限纠正与批准架构正文的同步仍 OPEN。下一步如继续优化，应只围绕已有失败证据作单项改动，不自动扩展设计或付费采样。

本轮五次预算已用完；潜在纠正余额不能折算首次生成。当前报告与[交接](../handoffs/backend-implementation.md)就地合并，旧正文已留完整 pre-test 快照，其他冻结原件不改。
