# TRANSITION-M003-082 — CR307 前端返修回交 QA 门检

**结论：PASS（仅允许独立 QA 定向复验；不表示 QA 已通过、UAT 已接受或 CR306/CR307 已关闭）。**

当前状态仍为 `implementation / frontend-implementer/base / frontend-claire / active`，与 [081 门检](cr307-fix-entry-gate-081.md) 的受限返修范围一致。前端返修交接、冻结源码及定向开发验证均已提交；原始 QA 失败证据仍被保留，未被覆盖。

| 核查项 | 结论 | 依据 |
|---|---|---|
| 原始独立 QA 失败保留 | 通过 | [CR307](../changes/CR-307.md)、[原 browser FAIL](../verification/evidence/cr306-qa/browser.json) 均保留 `BODY` 焦点逃逸及保存后未回到 opener 的原始失败。 |
| 返修范围受控 | 通过 | [前端实施交接](../handoffs/frontend-implementation.md) 仅覆盖最上层 Tab/Shift+Tab、嵌套 dirty-confirm 返回父框、discard 后双框关闭回焦、保存/refetch 后精确 provider opener 恢复；未变更视觉布局、业务、API 或后端。 |
| 定向开发验证齐备 | 通过，但仅限开发验证 | [frontend-validation](../implementation/frontend-validation.md) 和 [验证摘要](../implementation/evidence/cr307-frontend-fix/verification-summary.json) 记录隔离环境双视口通过、前后向焦点边界、嵌套 keep/discard、保存后重新获取 opener，以及零自动 probe。 |
| 可恢复源码与版本对应 | 通过 | [源码清单](../implementation/evidence/cr307-frontend-fix/source-manifest.json)、[冻结源码包](../implementation/evidence/cr307-frontend-fix/cr307-frontend-source.tar.gz) 及 [root 接收回执](evidence/cr307-qa-return-082/submission-receipt.json) 对应；原始 QA 失败哈希仍受记录保护。 |
| 不受影响验证复用 | 允许 | 原 QA 的 API 21 项与管线 10 项 PASS 可作为不受影响依赖复用；不得把开发验证或既有 API 验证表述为浏览器复验、真实供应商验证或 QA 通过。 |
| 授权与迁移合法性 | 通过 | [081](cr307-fix-entry-gate-081.md) 已限定返修及独立 QA 回交；`USER-M003-CR306-QA-NEXT` 已授权该既定返修/复验链路，无需重复请求同一许可。 |
| 当前阻塞 | 无 | 返修提交与证据足以激活 QA；独立 QA 复验尚未执行，属于下一角色责任，不阻断本单步迁移。 |

## 迁移决定

```yaml
operation: transition-stage
decision_id: TRANSITION-M003-082
result: PASS

from:
  stage: implementation
  role: frontend-implementer/base
  agent: frontend-claire
  status: active

to:
  stage: verification
  role: quality/base
  agent: qa-quinn
  status: active
  current_handoff: .planning/milestones/M002-legacy-M003/handoffs/verification.md
  runtime: /root/qa_quinn_cr306
  requested_model: gpt-5.6-sol/high
  actual_model: unknown

profile_lock: consumer-ai-web@1.0.0
routing_lock: v1
gatekeeper_requested_model: gpt-5.6-terra/medium
gatekeeper_actual_model: unknown

accepted_inputs:
  - .planning/milestones/M002-legacy-M003/handoffs/frontend-implementation.md
  - .planning/milestones/M002-legacy-M003/implementation/frontend-validation.md
  - .planning/milestones/M002-legacy-M003/implementation/evidence/cr307-frontend-fix/source-manifest.json
  - .planning/milestones/M002-legacy-M003/implementation/evidence/cr307-frontend-fix/cr307-frontend-source.tar.gz
  - .planning/milestones/M002-legacy-M003/implementation/evidence/cr307-frontend-fix/verification-summary.json
  - .planning/milestones/M002-legacy-M003/reviews/evidence/cr307-qa-return-082/submission-receipt.json
  - .planning/milestones/M002-legacy-M003/verification/evidence/cr306-qa/browser.json
  - .planning/milestones/M002-legacy-M003/changes/CR-307.md
  - .planning/milestones/M002-legacy-M003/reviews/cr307-fix-entry-gate-081.md
  - USER-M003-CR306-QA-NEXT

status:
  cr306: open
  cr307: open
  qa_passed: false
  uat_accepted: false
```

## QA 接续边界

`qa-quinn` 仅可在新的隔离空 PG 与 `backend:54773` 支持环境中执行定向复验：

1. 在桌面 `1440×900` 与移动端 `390×844` 验证最上层对话框的 Tab/Shift+Tab containment。
2. 验证嵌套 dirty-confirm 的 keep-edit 回到父框，及 discard 后父子框同时关闭时回到精确编辑 opener。
3. 验证保存并重新获取数据后，焦点回到当前、仍连接的精确 provider 编辑 opener。
4. 复用未受影响的 API 21 项和管线 10 项 PASS，不强制全量重跑。

仅在上述焦点复验 PASS 后，才可依 `USER-M003-CR306-QA-NEXT` 进行 AC321 的有界真实验证：已保存的 `OpenRouter deepseek/deepseek-v4-flash-0731`，R1 原游客五词中文 Story/Brief、R2 增强链路，第三次仅限有理由的定向复测；总实跑 `N≤2`，不扩展至质量批次、其他模型、购买、部署、旧库迁移或配置变更。凭据仅可在内存或私密临时环境中使用，不得写入公开证据。

原 UAT 已在本轮开始前停止，不得表述为仍在运行。现有 UAT、旧库、真实配置及原失败证据均应保持不变。