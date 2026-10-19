---
milestone: M003
stage: verification
review_status: PASS
decision_id: TRANSITION-M003-061
suggested_path: .planning/milestones/M002-legacy-M003/reviews/qa-fix-gate-060.md
---

# QA 缺陷返修门禁（control-060）

## 检查结果

| 条件 | 结果 | 证据 |
|---|---|---|
| 当前状态与回退路径 | PASS | 当前 `verification / gatekeeper-owen`；锁定 Profile 允许 `verification → implementation`。 |
| 目标身份 | PASS | `backend-implementer/base / backend-ethan` 已注册、语义名校验通过且唯一。 |
| 缺陷范围与授权 | PASS | `USER-M003-QA-NEXT` 明确授权已批准范围内缺陷修复与复验；CR304、CR305 均为实现偏差，无新增业务或设计决定。 |
| QA 原件与冻结 | PASS | QA 五件套存在，状态均为 `blocked_on_implementation_fixes`；首轮失败、方法更正、隔离栈清理及 pre-fix 保护记录可恢复。 |
| CR 路由 | PASS | CR304 仅路由 `backend-ethan`；CR305 保持 `frontend-claire` 的后续同阶段定向修复，不能在本次一并激活。 |
| 非阻塞边界 | PASS | QA 已清理独占隔离栈；真实模型/费用/容量、UAT、部署、迁移均未获接受且不构成本次定向返修的新增门槛。 |

原始产物：[`CR-304`](/Users/xekinzhuo/Desktop/xekin_develop/ai-en-learning-development/ai-en-learning/.planning/milestones/M002-legacy-M003/changes/CR-304.md)、[`CR-305`](/Users/xekinzhuo/Desktop/xekin_develop/ai-en-learning-development/ai-en-learning/.planning/milestones/M002-legacy-M003/changes/CR-305.md)、[`QA 覆盖矩阵`](/Users/xekinzhuo/Desktop/xekin_develop/ai-en-learning-development/ai-en-learning/.planning/milestones/M002-legacy-M003/verification/coverage-matrix.md)、[`QA 报告`](/Users/xekinzhuo/Desktop/xekin_develop/ai-en-learning-development/ai-en-learning/.planning/milestones/M002-legacy-M003/verification/report.md)、[`QA 交接`](/Users/xekinzhuo/Desktop/xekin_develop/ai-en-learning-development/ai-en-learning/.planning/milestones/M002-legacy-M003/handoffs/verification.md)、[`修复前完整性记录`](/Users/xekinzhuo/Desktop/xekin_develop/ai-en-learning-development/ai-en-learning/.planning/milestones/M002-legacy-M003/reviews/evidence/qa-start-059/pre-fix-integrity.json)。

## 精确目标状态

```yaml
operation: recover-or-rollback
decision_id: TRANSITION-M003-061
from: verification
to: implementation
active_role: backend-implementer/base
active_agent: backend-ethan
status: active

current_handoff: .planning/milestones/M002-legacy-M003/handoffs/backend-implementation.md
required_artifacts:
  - .planning/milestones/M002-legacy-M003/implementation/backend-validation.md
  - .planning/milestones/M002-legacy-M003/implementation/frontend-validation.md
  - .planning/milestones/M002-legacy-M003/handoffs/backend-implementation.md
  - .planning/milestones/M002-legacy-M003/handoffs/frontend-implementation.md
allowed_transitions:
  - verification
  - product-planning
  - uiux-design
  - technical-design

repair_scope:
  CR-304:
    owner: backend-ethan
    status: reopened_for_targeted_implementation_fix
  CR-305:
    owner: frontend-claire
    status: queued_for_same_stage_targeted_fix_after_CR304

preserve:
  verification_work: blocked_on_implementation_fixes
  verification_artifacts: M003-QA-01 frozen_failure_and_method_records
  technical_approval: M003-TECH-03 accepted_for_implementation
  open_change_requests: [CR-302, CR-304, CR-305]
  retained_open_items: [CR039-L1, CR042-L1, AI-QUALITY-90, W01, QA26-MINIMAX]
```

## 边界

本次只回退并启用 `backend-ethan` 修复 CR304；不启动 `frontend-claire`，不实施 CR305，不重开设计，不进入 QA 复验或 UAT。修复提交后须先经独立同阶段接收，再由后续门禁返回 `qa-quinn` 执行矩阵中的两项定向复验。