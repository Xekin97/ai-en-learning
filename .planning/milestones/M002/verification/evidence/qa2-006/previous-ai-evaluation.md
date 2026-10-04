---
milestone: M002
stage: verification
role: quality/base
agent_name: qa-quinn
version: M002-QA-05
status: deterministic_integration_only
date: 2026-09-21
---

# AI 验证范围

QA05真实AI调用0，本地确定性provider共6次：业务准备1次兼容探针+3次生成，继承功能准备2次生成。五次实际生成均通过正常校验并收录；用于日期多批复习、唯一掌握、随机词库边界、书架搜索和后台只读库，不是自然语言质量抽样。见[business结果](evidence/qa2-005/business-results.json)和[inherited结果](evidence/qa2-005/inherited-results.json)。

模型只指向loopback38082。参考文本为learn、learns/learning/learned三个位置，沿已用确定性夹具；探针额外包含vulnerable。原样文和provider代码见[business.mjs](evidence/qa2-005/business.mjs)及[inherited.mjs](evidence/qa2-005/inherited.mjs)。不保存能力token、真实供应商密钥或调用真实服务。

图表历史访问事件为合成明细，由实际分钟任务聚合；不能据此判断供应商成功率。QA04本地/真实调用均0，历史结果沿[QA04原文](evidence/qa2-005/previous-ai-evaluation.md)，不计入本轮6次。

AI-QUALITY-90继续unverified，不把上述集成通过当作真实LLM质量≥90%。[一期评估](../../M001/verification/ai-evaluation.md)、CR039-L1、CR042-L1保留。真实模型质量、供应商取消/失败退款等匹配开发证据继续沿用，尚无本轮独立真实供应商结论。

CR010图表已复验；CR011书架大小写搜索与模型输出质量无关。后续若进行真实质量批测，仍须明确样本/配置/提示词版本及相应调用范围；本文件不请求或扩大该授权。
