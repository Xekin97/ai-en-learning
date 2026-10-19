---
milestone: M003
stage: verification
role: quality/base
agent_name: qa-quinn
status: completed
version: M003-QA-07-CR311-312-SCOPE-CORRECTED
result: functional_pass
model_quality_result: out_of_scope
date: 2026-10-14
---

# M003 AI 功能验证范围

## QA 边界

依据 [`USER-QA-MODEL-QUALITY-BOUNDARY-20261012`](../../../agt/qa-scope-policy.md)，QA 核对 AI 功能链的参数、调用、结构、机械校验、编排、终态、额度与保存行为。文章的故事性、自然用词、文学质量、语义逻辑和模型审稿准确率均为 **OUT OF SCOPE**，不写QA质量PASS或FAIL，也不因模型语义漏判触发技术/实现返工。

## 功能结论

### CR-311/312 当前增量

CR-311/312 AI 编排功能 **PASS**：当前 Go + 新 PG18 + 确定性本地 provider 的 ordinary 与 Q02 流证明公开 `m003-stream-v6`、持久化 `m003-content-v5`、真实 activity、draft replace/discard/restore、body-complete 非 final、完整 Result 与 provider 调用 ledger；实际捕获的五词 v6 流也由当前 Nuxt 以完全匹配请求重放并消费。证据见 [`cr311-312-qa/api-results.json`](evidence/cr311-312-qa/api-results.json) 与 [`cr311-312-qa/actual-replay-results.json`](evidence/cr311-312-qa/actual-replay-results.json)。

本增量没有调用真实 provider，也没有形成新的模型质量、文章质量或审稿准确率结论；synthetic 内容只用于机械合同、时序、恢复和 UI 行为。

### CR-306 历史功能基线

CR-306 AI功能 **PASS**：

- 两次请求均使用唯一授权 `deepseek/deepseek-v4-flash-0731`，安全快照为 `json_schema / openrouter_require_parameters / {"reasoning":{"enabled":false}}`。
- R1游客执行planning1+generation1，得到 `basic V1`；R2 Pro执行planning1+generation1+fixed_edit1+content_review1，得到合法 `review_passed V2`。模型返回 `pass` 后未触发content repair，产品按该合法结果正确执行。
- 两次均通过原生结构/目标覆盖/标注校验，五个学习字段齐全，DB终态valid、`can_save=true`、各消费一次额度；usage/cost与prompt version均已记录。
- 确定性替身另证明N0/N2、两轮content repair上限、Q02、围栏plan、heartbeat/cancel与同run参数快照。

| 样本 | stages | 终态 | quota | usage | cost |
|---|---|---|---|---|---|
| R1 visitor | planning, generation | basic V1 | 100→99 | in3531 / out788 | 0.00068306 credits |
| R2 pro | planning, generation, fixed_edit, content_review | review_passed V2 | 97→96 | in8135 / out1449 | 0.001070272 credits |

## 历史模型观察

[`real-evaluation.md`](evidence/cr306-qa/real-evaluation.md) 是用户边界纠正前形成的历史文章评阅，保持原样以维护证据链。它不再是当前QA结论来源。CR-308已重分类为模型能力观察：不阻塞CR-306功能QA、不要求backend-alex修改prompt/合同/模型，也不声称语义漏判已修复。

`AI-QUALITY-90`及审稿准确率需要另行模型评测；本轮没有新增调用、质量批次或成功率推断。
