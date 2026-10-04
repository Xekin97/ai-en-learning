---
milestone: M002
stage: verification
role: quality/base
agent_name: qa-quinn
version: M002-QA-06
status: deterministic_integration_only
date: 2026-09-22
---

# AI 验证范围

QA06真实AI调用0，本地确定性provider共36次：library24（1兼容探针、23真实生成并收录），generation初轮5，generation-v2轮7。后两组含刻意的HTTP503、半截流、无效结构及有效后放弃，不能将调用数或预期失败视为自然语言质量成功率。详见[书架结果](evidence/qa2-006/library-results.json)、[初轮](evidence/qa2-006/generation-results.json)、[有效计量与协议结果](evidence/qa2-006/generation-v2-results.json)。

所有provider只监听loopback38082。固定样文含learn的learns/learning/learned三个位置，兼容探针再含vulnerable；脚本保留输入夹具和响应逻辑。真实API仍执行结构/覆盖/资源验证、扣次/退款、收录与签到事务；没有调用第三方模型，不保存generation token或私有运行凭据。

G01–06独立覆盖预检、主动取消、提供方打开失败、流后校验失败、Go连接中断、有效后放弃、基础来源与次数卡来源计量。这是确定性业务结算验证，不等同真实提供方可靠性、生产代理断流或模型语义质量。G07发现API006收录错误码契约偏差，独立记录CR013；计量通过未被扩大为整个生成链通过。

AI-QUALITY-90保持unverified；[一期评估](../../M001/verification/ai-evaluation.md)、CR039-L1、CR042-L1保留，历史QA05的6次本地调用见[原文](evidence/qa2-006/previous-ai-evaluation.md)，不混入本轮36次。真实质量批测仍需要对应样本/配置/提示词版本及调用授权，本文件不扩大授权。
