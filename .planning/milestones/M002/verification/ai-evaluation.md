---
milestone: M002
stage: verification
role: quality/base
agent_name: qa-quinn
status: user_uat_accepted_with_retained_limitations
result: user_uat_passed
version: M002-QA-27
date: 2026-10-01
---

# AI 验证范围

用户已确认 M002 UAT 通过，原文见[验收记录](uat.md)。**AI-QUALITY-90 仍为 UNVERIFIED**；用户体验验收不等于对长期生成成功率的统计评估。本轮无新模型调用，未启动质量评测或调优。

QA26 按用户“切换为正式模型配置我测测看吧”复用一期正式配置，执行必要启用检查：DeepSeek V4 Flash 0731 与 GLM 通过，MiniMax 首次及一次复验均返回 422 model_incompatible，保持禁用。共 4 次启用操作，不能等同准确付费推理次数或账单金额；QA26 未代用户进行普通生成。[操作](evidence/qa2-026/configuration-result.json)、[复验](evidence/qa2-026/minimax-retry.json)、[方法边界](evidence/qa2-026/method-notes.json)。

QA26 的真实浏览器及 API 核对确认访客和普通账号可选两款模型；既有热门预设仍绑定禁用 MiniMax，当前记录为 model_unavailable。本轮未重测模型状态，原因仍未知，不能断言永久不支持或绕过启用校验。模型目录与启用兼容检查不代表整篇生成质量。

QA24 的 6 项证明请求匹配的本地替身结构与流程；QA22–25 的集成、界面证据仅在原范围复用。AI 输出结构、语言、目标词覆盖、严格校验、流式与计量的确定性证据沿[覆盖矩阵](coverage-matrix.md)；本轮用户 UAT 不增补未提供的模型样本。

[一期评估](../../M001/verification/ai-evaluation.md)、[CR039-L1](../../M001/changes/CR-039.md#retained-limitations)、[CR042-L1](../../M001/verification/CR-042-generation-evidence.md#retained-limitations)保持。用户此前停止调优的边界有效；未来评测需明确范围、样本、模型与费用授权。生产环境验证未由本次登记执行。QA26 原文已保存在 [修订前快照](evidence/qa2-027/before-current-documents.tar.gz)，冻结证据不改写。


## CR029 三协议验证边界

当前生产Gateway支持Chat Completions、Responses、Anthropic Messages；受控HTTP验证请求头/路径/精确模型ID、流输出、明确成功终止、错误/不完整终止和token用量。PromptVersion=m002-v1-r1，ValidatorVersion仍为m001-v5-wn31-r2；指纹由实际三协议请求生成。未运行真实付费模型，不能用协议通过更新AI-QUALITY-90结论。原内容校验和已知词形/回放限制保留。
