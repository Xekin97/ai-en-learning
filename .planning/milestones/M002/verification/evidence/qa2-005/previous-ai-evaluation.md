---
milestone: M002
stage: verification
role: quality/base
agent_name: qa-quinn
version: M002-QA-04
status: deterministic_integration_only
date: 2026-09-21
---

# AI 验证范围

QA04没有真实AI或loopback provider调用。AI-QUALITY-90仍为unverified，不能从本轮下架卡、补签、分析计算推出真实生成质量或≥90%成功率。当前真实调用授权范围不变；[一期评估](../../M001/verification/ai-evaluation.md)、CR039-L1、CR042-L1继续保留。

此前确定性生成样本、参考文本与SSE证据沿 [QA03版原文](evidence/qa2-004/previous-ai-evaluation.md)：使用loopback的learn及三处词形，验证持久化、claim、复习、注销等集成，并非真实LLM质量样本。QA03准备累计8次本地调用、QA02为4次；本轮新增均为0，不把历史调用重复计入。

QA04为核算分析失败率直接在一次性数据库设置2成功、2失败、1取消、1进行中的历史逻辑run事实，见[分析夹具脚本](evidence/qa2-004/analytics.mjs)。T12的50%仅证明指标分母和聚合，不等于6次实际模型生成、50%真实质量或供应商可靠性。浏览器访问事件通过真实API，分钟任务实际聚合，二者与生成事实夹具分开记录。

CR009引用保留修复已独立通过；新增CR010是30天趋势图的响应式缺陷，与模型输出无关。[报告](report.md)和[矩阵](coverage-matrix.md)记录当前独立范围。供应商超时、取消/退款和畸形输出的匹配开发证据继续复用，不称作本轮独立质量通过。

后续完成确定性集成与布局验收；若开展真实质量批测，须明确样本、模型/配置/提示词版本和新的调用范围授权。本文件不请求或暗含该授权，也不改变二期产品标准。
