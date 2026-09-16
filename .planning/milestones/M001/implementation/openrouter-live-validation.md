---
milestone: M001
stage: implementation
role: backend-implementer/base
agent_name: backend-ethan
status: awaiting_user_review
date: 2026-08-31
provider: OpenRouter
model: deepseek/deepseek-v4-flash-0731
---

# OpenRouter 真实模型验证

## 结论

- **OpenRouter 适配器与后台保护链路：PASS。** 真实凭证验证、模型目录检查、严格 JSON Schema、完整 SSE 解析、正文增量、终态 DTO、确定性校验、失败退款和敏感字段隔离均按设计工作。
- **该模型在当前 `m001-v1` prompt 下的内容稳定性：不通过生产启用建议。** 每个配置至少成功过一次，但 12 次真实生成只有 7 次产生有效终态；失败均被安全拒绝，没有进入学习库。
- **内容质量：需要产品审阅。** 机器有效样本仍存在目标词过度重复、连贯性不足和释义过短等问题。完整内容见 [`openrouter-live-samples.md`](./openrouter-live-samples.md)。

## 测试边界

- 使用用户提供的临时 OpenRouter key 与指定模型。
- 所有调用使用隔离 PostgreSQL 18 临时数据库；每轮结束执行 `DROP DATABASE ... WITH (FORCE)`。
- key 只通过关闭终端回显的进程环境注入，经真实管理员 API 验证并加密写入临时库；没有写入仓库、测试日志、报告或常驻 Compose 数据库。
- 没有应用级自动重试。报告中的“重试”是新的独立生成运行，符合用户重新生成语义。

## 兼容性检查

管理员启用模型真实执行 4 次：

| 结果 | 次数 | 观察 |
| --- | ---: | --- |
| 通过 | 3 | 成功耗时约 15.7–66.2 秒 |
| `model_incompatible` | 1 | 约 115.6 秒后安全失败并保持禁用 |

同一模型存在明显时延与候选稳定性波动。真实验证还发现正式 HTTP 服务的普通 30 秒写超时会截断慢速启用结果；实现已让“启用模型”与生成流一样由请求上下文和供应商终态控制，不再受普通 JSON 写超时限制。

## 生成结果汇总

共发起 12 次真实生成；7 次通过，5 次内容校验失败。小样本不能用于估算长期成功率，但足以证明当前模型/prompt 组合不稳定。

| 配置 | 成功 / 尝试 | 成功样本词数 | 已知失败原因 |
| --- | ---: | ---: | --- |
| 中文 / 故事 / 短 / `learn,weave` | 1 / 3 | 82 | 两次均为第一个目标的 `hint_surface` 在提示短语中不是恰好一次 |
| 英文 / 讨论 / 中 / `build,change` | 2 / 2 | 148、203 | 无 |
| 日语 / 商务 / 长 / `market,plan` | 2 / 3 | 394、224 | 一次早期运行只记录到归一化 `content_validation_failed` |
| 中文 / 新闻 / 特长 / `policy,future` | 2 / 4 | 589、505 | 一次目标释义语言错误；一次早期运行只记录到归一化失败 |

成功运行中，首个 `passage.delta` 延迟约 46.7–187.3 秒，总耗时约 53.6–196.5 秒。SSE 每 15 秒心跳保持连接，但严格结构化模型可能在很晚才开始输出 `passage`，前端必须提供独立于正文增量的持续生成反馈与取消入口。

## 结构与安全断言

所有成功样本均证明：

- 浏览器收到 `generation.started` 后只看到正文 `passage.delta`；增量拼接与最终 passage 逐字一致。
- `generation.validated` 同时返回 1–3 个短文 tag、与输入等长同序的 targets、目标语言释义、英文提示短语、服务端计算的提示挖空与 Unicode code point 正文位置。
- 普通生成终态不包含 OpenRouter key、provider model ID、`hint_surface`、原始候选、prompt、Cookie、CSRF 或内部能力 token。
- 词数、语言、词形覆盖、提示唯一性或结构失败时只返回稳定 `content_validation_failed`，运行进入失败终态且额度返还。

## 本次新增验证与诊断能力

- `internal/httpapi/openrouter_live_integration_test.go`：显式 opt-in 的真实供应商测试，普通测试环境无 key 时自动跳过。
- 内容校验失败日志只记录 run ID、内部 model ID、prompt/validator 版本、归一化分类和不含学习内容的安全原因。
- 模型兼容性失败日志记录相同安全诊断，不输出 provider model ID、key、prompt 或候选正文。
- 管理员启用模型解除普通响应写超时；客户端断开仍通过 request context 取消上游。

## 后续建议

1. 用户先审阅暂存内容，确认自然度、连贯性、重复度和释义详细度的目标。
2. 在不放宽确定性校验的前提下发布 `m001-v2` prompt，明确要求提示词形在提示短语中恰好出现一次、所有 tag/释义严格使用目标语言，并减少目标词机械重复。
3. 用同一小矩阵复测；内容与稳定性满足后，再执行已批准的三语言 × 四场景 × 四长度发布矩阵。
4. 本次 key 已出现在聊天记录中，验证结束后应在 OpenRouter 控制台撤销或轮换。

> 本报告不批准模型上线，也不切换阶段。
