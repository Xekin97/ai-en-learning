---
milestone: M002
stage: verification
role: quality/base
agent_name: qa-quinn
version: M002-QA-01
status: deterministic_integration_only
date: 2026-09-21
---

# AI 验证范围

本轮没有真实模型调用，不能得出真实生成质量或 ≥90% 成功率结论。AI-QUALITY-90 保持 unverified；[一期 AI 评估](../../M001/verification/ai-evaluation.md)、CR039-L1 和 CR042-L1 保持原状态，不扩大历史真实调用授权。

确定性参考输入沿已交付 m002-real-smoke 的 loopback provider：provider/integration、目标 learn、Story/Brief、英语释义，样文含 learns / learning / learned 三处映射；启用兼容探针另含 vulnerable。精确文本、targets 及 SSE 片段在 [real-audit-v2.mjs](evidence/qa2-001/real-audit-v2.mjs)，脚本与摘要冻结于本轮 manifest。不是提供方模型版本或真实 LLM 样本。

新独立观察：管理员预览与访客生成均经过真实服务端校验/持久化；注册承接后详情资源可读，原词与三个实际词形全部正确提交成功；GET 已提交 attempt 只返回最小收据，不重建答案。生成前后权限及次数的全矩阵仍不由单个样本证明。

供应商超时、畸形输出、取消和退款的现有开发证据见[后端验证](../implementation/backend-validation.md)，前端 SSE/lifecycle 开发证据见[前端验证](../implementation/frontend-validation.md)。本轮不把它们重新标成独立内容质量通过，也不因 loopback 成功宣称真实模型词义、自然度、跨语言或长文覆盖通过。

后续先修复本轮两项确定性缺陷并完成集成验收；若开展真实质量验证，需沿当前参考样本、模型/配置/提示词版本记录并取得相应新的真实调用范围授权。本单不请求或暗含该授权。
