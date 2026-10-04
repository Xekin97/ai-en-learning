---
id: M002-CR-015
status: open
milestone: M002
raised_by: qa-quinn
owner_stage: implementation
owner_role: frontend-implementer/base
finding: QA2-F11
severity: P2
date: 2026-09-23
---

# 参与日期复习切换成功后书架统计仍显示旧值

## 批准依据

[UI22书架交互](../design/interactions.md#书架--ui-18)要求参与checkbox成功变化同步统计和日期范围命中。[API007六统计/参与设置](../technical/api/identity-library.md#2-六项统计列表及详情)定义参与/暂停批次数取全库，不随筛选改变。关联CAP012/015、PAGE005、UIA-PAGE-005-LIBRARY18。不是新增实时分析或统计指标。

## 复现与证据

frontend-cr012 / backend-cr013，21篇本人短文，其中20篇参与、1篇暂停。在书架查询LEARN，取消第一篇“参与日期复习”：

1. PATCH返回200、participates_in_range_review=false，checkbox确实取消。
2. 直接GET /me/learning-summary返回participating_batches=19、paused_batches=2；详情GET也返回false。
3. 同一页面仍显示参与20、暂停1，等700ms后不变；主检查J07等待5秒仍显示20。
4. 刷新页面后才显示19、2。其余四项统计不变。

[首次J07](../verification/evidence/qa2-007/library-results.json)、[独立前后投影](../verification/evidence/qa2-007/independent-repro-v2.json)、[英文1440截图](../verification/evidence/qa2-007/v2-participation-en.png)、[中文320截图](../verification/evidence/qa2-007/v2-participation-zh.png)。两个新浏览器上下文结果一致，无运行时错误。

后端响应和持久设置正确，问题定位在前端显示状态。library store的setParticipation更新列表/详情participatesInRangeReview，但未同步summary，是与观察相符的定向线索，不扩大为后台统计服务问题。

## 建议修复与验收

交frontend-claire让已成功参与变更与顶部全库统计保持一致；处理方式由前端在现有架构内确定。按两方向切换、已筛选/未筛选、成功/失败及重复操作检查，保持其他四统计口径和失败恢复；不得用刷新整页作为用户必需步骤。CR014的焦点问题单独验收，两项可同一前端返工处理。

P2，阻塞CAP012/015的即时显示接收。无需新的产品或API决策；QA不修改实现、不切阶段，待守门登记与前端实施后独立复验。

