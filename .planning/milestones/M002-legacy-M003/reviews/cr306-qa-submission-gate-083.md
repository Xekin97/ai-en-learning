---
milestone: M003
stage: verification
review_status: PASS_REPORT_ACCEPTED_QA_FAIL
decision_id: REVIEW-M003-083
date: 2026-10-12
---

# CR306 / CR307 QA 最终提交检查

## 控制结论

**PASS：QA 最终报告与证据包完整、可接收。**  
**QA 业务结论：FAIL。** 唯一实质阻塞为 CR-308 的增强审校语义漏判；不得因报告如实记录失败而要求 QA 自行改代码、提示词或隐藏概率质量缺陷。

CR-307 的独立焦点复验已通过，可由 root 机械同步为 `resolved`。CR-306 与 CR-308 保持 `open`。不批准 milestone-complete、用户 UAT、部署或新的 AI 合同。

## 当前状态

- 当前：`verification / quality/base / qa-quinn / active`
- 当前交接：[verification.md](../handoffs/verification.md)
- 锁定：`consumer-ai-web@1.0.0`、routing v1
- QA requested：`gpt-5.6-sol/high`；actual：`unknown`
- Gatekeeper requested：`gpt-5.6-terra/medium`；actual：`unknown`

## 原始产物

- [QA 报告](../verification/report.md)
- [覆盖矩阵](../verification/coverage-matrix.md)
- [AI 评测](../verification/ai-evaluation.md)
- [UAT 清单](../verification/uat.md)
- [QA 交接](../handoffs/verification.md)
- [QA 汇总](../verification/evidence/cr306-qa/qa-summary.json)
- [提交清单](evidence/cr306-qa-submission-083/qa-submission-manifest.json)
- [CR-306](../changes/CR-306.md)、[CR-307](../changes/CR-307.md)、[CR-308](../changes/CR-308.md)

## 条件检查

| 条件 | 结果 | 证据 |
|---|---|---|
| QA 必需产物与交接齐全 | PASS | report、coverage、ai-evaluation、uat、verification handoff 与 submission manifest 均存在并互相指向。 |
| 原失败与修后焦点证据可恢复 | PASS | [browser.json](../verification/evidence/cr306-qa/browser.json) 保留首败；[browser-focus-retest.json](../verification/evidence/cr306-qa/browser-focus-retest.json) 记录 CR307 独立复验 5/5 PASS。 |
| CR307 受限返修验收 | PASS | desktop/mobile 的顶层 Tab/Shift+Tab、嵌套 keep、discard 父子同关与 save/refetch 精确 opener 恢复均通过；不外推为整体 QA 通过。 |
| AC317–320、AC322 确定性覆盖 | PASS | [deterministic-api.json](../verification/evidence/cr306-qa/deterministic-api.json) 21/21、[deterministic-pipeline.json](../verification/evidence/cr306-qa/deterministic-pipeline.json) 10/10；原方法失败记录仍保留。 |
| 授权真实模型边界 | PASS | 仅 `deepseek/deepseek-v4-flash-0731`，`json_schema`、`reasoning.enabled=false`；R1/R2 两个完整业务请求、共六次 provider calls，未执行第三次或其他模型。 |
| 时延、usage 与成本记录 | PASS | R1：scene 7.722s、正文 14.159s、总 21.362s；R2：scene 8.802s、正文 17.536s、总 35.788s。首 word 到达均为 `unknown`，未伪造或补跑。实际 usage/cost 见 [real-r1.json](../verification/evidence/cr306-qa/real-r1.json)、[real-r2.json](../verification/evidence/cr306-qa/real-r2.json)。 |
| AC321 内容质量 | **FAIL / BLOCK** | R2 虽技术完成且内部 `review_passed`，但审校漏判 `juvenile birds` 牵强类比与 `starting retroactively` 不自然搭配；见 [real-evaluation.md](../verification/evidence/cr306-qa/real-evaluation.md) 与 [CR-308](../changes/CR-308.md)。 |
| 失败归因边界 | PASS | Ethan 的只读定位确认 review 接收完整 V2、五词与 scenario，未见截断或解析偏差；当前事实支持指定模型的一次语义漏判，不足以直接要求 implementation 修改已批准 AI 合同。 |
| UAT / 里程碑边界 | PASS | 用户 UAT 未开始；不批准 milestone-complete。`2/2` 技术成功、增强审校分母 `1`、返修 `0/1`、人工明显漏判 `1/1` 均不得外推为质量率。 |

## 允许的机械同步

```yaml
operation: submit-stage
decision_id: REVIEW-M003-083
report_acceptance: PASS
qa_business_result: FAIL
blocking_change_request: CR-308

state_after_root_sync:
  stage: verification
  active_role: quality/base
  active_agent: qa-quinn
  status: awaiting_user_review
  current_handoff: .planning/milestones/M002-legacy-M003/handoffs/verification.md

change_requests:
  CR-306: open
  CR-307: resolved
  CR-308: open

not_approved:
  - milestone-complete
  - user-uat
  - deployment
  - new_ai_contract
  - model_switch
  - added_real_model_spend
  - automatic_stage_transition
```

## 后续受依赖约束的交接

当前保持 verification，等待用户审阅 QA FAIL 及 CR-308。下一实际责任建议为 `technical-design / backend-architect/base / backend-alex`，仅限诊断审校 prompt／payload／版本化评测设计；该建议不构成新设计、代码修改、模型切换、费用授权或自动迁移。