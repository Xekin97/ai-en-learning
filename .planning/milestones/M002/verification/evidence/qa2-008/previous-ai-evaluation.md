---
milestone: M002
stage: verification
role: quality/base
agent_name: qa-quinn
version: M002-QA-07
status: deterministic_integration_only
date: 2026-09-23
---

# AI 验证范围

QA07真实AI调用0，本地确定性provider共34次：library24（1兼容探针、23次真实生成/收录），generation10（含故意失败、取消、中断、成功、过期原卡退款）。详见[书架结果](evidence/qa2-007/library-results.json)与[生成结果](evidence/qa2-007/generation-results.json)。不把调用数或预期失败换算为自然语言质量成功率。

provider仅loopback38082，固定样文/结构与失败模式见library.mjs、generation.mjs。真实服务执行结构验证、额度、收录、签到与退款；token仅脚本内存使用，私有env不进入证据。QA06旧36次调用与原始失败独立保存在[原文](evidence/qa2-007/previous-ai-evaluation.md)，不混入本轮计数。

G01–07从真实生成产生取消/校验失败/断流/有效放弃，CR013原save错误语义现均409 state_conflict，原扣次/退款/签到保持。G08验证404隐私/删除及保存幂等，G09回拨临时持久草稿时间验证410，G10回拨临时卡余额期限验证在途失败退原卡但不复活。后两项不等于真实跨时点运行，直接Go断流也不冒充生产代理可靠性。

AI-QUALITY-90仍unverified；[一期评估](../../M001/verification/ai-evaluation.md)、CR039-L1、CR042-L1保留。真实模型质量批测仍需对应授权及样本/模型/提示词版本，本轮不扩大授权。CR014/015属于书架前端交互，不影响本文件的模型质量结论。
