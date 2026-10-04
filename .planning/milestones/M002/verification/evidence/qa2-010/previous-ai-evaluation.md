---
milestone: M002
stage: verification
role: quality/base
agent_name: qa-quinn
version: M002-QA-09
status: deterministic_integration_only
date: 2026-09-28
---

# AI 验证范围

QA09真实AI调用0，本地确定性provider共29次：两次失败的环境准备各1；API主轮20；P01/P07控制4；浏览器3。见[初次准备](evidence/qa2-009/setup-initial-api-results.json)、[第二次准备](evidence/qa2-009/setup-second-api-results.json)、[API结果](evidence/qa2-009/api-results.json)、[控制](evidence/qa2-009/api-controls.json)、[浏览器](evidence/qa2-009/ui-results.json)。失败、取消、预览、兼容探针均包含，不按调用数计算自然语言质量成功率。

固定样文含learn/weave/book及对应标注；中文目标含中文释义/标签。初次探针遗漏指定hint、初次中文tag错误均被真实校验拒绝，原provider与失败记录保留，修正仅在测试夹具。provider始终loopback38082，真实Go/PG执行额度预占、退款、预览用量、发布、生成和认证收录；真实供应商未配置。

本轮证明所列确定性业务与浏览器状态，不能证明AI自然内容质量、实时成本、缓存命中率或生产代理可靠性。管理员预览未知tokens/cost明确为null，unknown_calls按实际计数。完整范围与限制见[报告](report.md)。QA08原27次独立保存在[前轮原件](evidence/qa2-009/previous-ai-evaluation.md)，不混入本轮计数。

AI-QUALITY-90仍unverified；[一期评估](../../M001/verification/ai-evaluation.md)、CR039-L1、CR042-L1保持。真实模型质量批测仍需相应授权及模型/提示词/样本版本，本轮不扩大授权。
