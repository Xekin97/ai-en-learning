---
milestone: M001
stage: verification
role: quality/base
agent_name: qa-quinn
date: 2026-09-04
result: FAIL
source: user_uat
---

# 用户 UAT 视觉回归复核

## 结论

用户报告的 12 项偏差使此前的 `ready_for_final_uat` 结论失效。批准原型已经覆盖 Users、Plans、Models、访客门、登录错误、Library 正常/空状态以及两类复习总结；除动态业务数据外，不需要重新设计。问题应返回 implementation，按批准原型逐状态修正并重新进行独立视觉验证。

## 逐项归类

| UAT 项 | 页面/能力 | 复核结果 | 责任单 |
| --- | --- | --- | --- |
| 1–2 | PAGE-103 / CAP-104 | Users 结果行的日期、方案标签/值与原型不一致；实现对空 plan 使用 `—`。`visitor` 应显示 `Guest`，但管理员的 `plan_code=null` 不得被误标为 Guest | CR-024 |
| 3–4 | PAGE-102 / CAP-103 | 英文副标题使用 `Set…`，原型为 `Choose…`；实现把 `visitor` 本地化为 `Visitor`，原型为 `Guest` | CR-024 |
| 5–7 | PAGE-101 / CAP-101–102 | 英文副标题、状态、编辑操作、方案引用以及 Add/Edit dialog 的多处文案采用近义替换，没有逐字采用批准原型 | CR-024 |
| 8 | PAGE-005/007 / CAP-021 | 路由已停留原页，但生产专用 `.auth-gate` 改写了原型卡片宽高和版式，因此“有门”不等于“门与设计一致” | CR-025 |
| 9 | PAGE-003 / CAP-003 | `AppError` 只输出裸文本和可选 request id；原型错误 notice 含图标与内容容器，实际错误态出现排版错乱 | CR-025 |
| 10–11 | PAGE-005 / CAP-012 | 六张统计卡需要逐项视觉对照；空库实现仍沿用正常页头，并可能继续展示 0 值统计、搜索与日期复习入口，原型为空库专用页头和单一引导卡 | CR-026 |
| 12 | PAGE-008 / CAP-020、CAP-022 | 实现只更换 eyebrow，标题和按钮仍共用；原型按 `single_batch` / `date_range` 以及成功/待加强分别给出标题、说明和再次复习动作 | CR-027 |

## 直接证据

- 批准文案真源：`design/prototype/i18n.js`。其中 PAGE-101 使用 `Manage your API key…`、`Active / Inactive`、`Edit`；PAGE-102 使用 `Choose…` 与 `Guest`。
- 批准结构真源：`design/prototype/app.js` 的 `renderAuthGate`、`renderAuth`、`renderRecords`、`renderReviewSummary`、`renderAdminModels`、`renderAdminGroups`、`renderAdminUsers` 和 `showModelDialog`。
- 当前 Users 展示：`frontend/app/presentation/admin/admin-user-search-presenter.ts` 使用通用 `Intl dateStyle=medium` 的结果和 `planCode ? … : "—"`。
- 当前访客名称：`frontend/i18n/locales/en-US.json` 把 `enum.group.visitor` 写成 `Visitor`。
- 当前错误结构：`frontend/app/presentation/components/AppError.vue` 未包含批准 notice 的图标和内层容器。
- 当前空库结构：`frontend/app/pages/library/index.vue` 在批次为空时只替换列表区域，页头、summary 与 toolbar 仍走正常分支。
- 当前总结结构：`frontend/app/pages/review/[sessionId].vue` 两类会话共用 `review.finished` 标题、Library/Review 链接，未实现原型的模式专用标题、说明和重新开始动作。

## 自动检查为何漏报

既有 `uat-final-findings.mjs` 只检查“是否存在 AuthGate”、dialog 的字段数量/类型以及少量 computed style；它没有比较完整可见文案、组件层级、空状态互斥内容或总结按钮语义。因此脚本可以 PASS，而人工 UAT 仍能看到明显差异。后续独立验证必须把批准原型逐状态 DOM/截图基线纳入断言，不能继续用元素存在性替代设计一致性。

