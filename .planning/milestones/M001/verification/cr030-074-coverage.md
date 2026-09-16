---
milestone: M001
stage: verification
role: quality/base
agent_name: qa-quinn
status: awaiting_user_review
date: 2026-09-06
verification_round: TRANSITION-M001-074
verdict: fail_rework_required
---

# 第074轮独立覆盖矩阵

当前总体FAIL；[报告](./cr030-074-report.md)给出全部原始结果归因、限制和证据。本表不把上轮或开发检查重新计数。

| 追踪 | 本轮可观察场景 | 结论 / 证据 |
| --- | --- | --- |
| PAGE103 / CAP104、021 / API103 / DATA003、018 / R072-01 | 中英文首次500、完整说明、重试保留查询 | PASS；users-matrix-neutral、users-supplemental |
| PAGE103 / R072-02 | 双引擎×双语×8宽度×2高度，初始/无结果/加载/失败 | PASS（Users局部几何/文案）；共享语言控件单列基线差异 |
| PAGE103 / CAP104 / API103 | 45条三页、精确tier、trim/case、SQL顺序、非法/跨查询/跨admin游标、追加错误、终页、离页迟到 | PASS；api、users-edge、users-supplemental |
| PAGE103 / CAP104、107 / DATA003、006 | 40行返回焦点/滚动、详情再搜索、正常详情文案和日期 | PASS；flows、visual |
| PAGE103 / 响应式2.3/2.4 | 32字符列表与详情、320/390/720/1440、双引擎双语 | PARTIAL/FAIL：列表通过，详情溢出；CR030-R074-01 |
| PAGE103 / CAP107 / API103 / DATA006 | 正确用户/多批次短长文、modal/深链/旧URL/历史、失败/404/重试/关闭迟到、只读/焦点 | PASS；visual、flows、users-supplemental |
| PAGE103 / CAP105、106 / API103 / DATA003、009、012、013 | 有限/0/不限/admin、配额reset、真实group PUT、改密204/旧会话401、丢响应只GET对账 | PASS；api、users-supplemental、lost-response |
| PAGE001/007/009 / CAP001、003–005、017、020 | 首页Review、日期同高、注销文案和颜色 | PASS；visual |
| PAGE002/003/005–009 / CAP001–005、021 / DATA018 | 五类原地访客引导、认证返回、无私有数据/自动创建、wrong password、locale/注销 | PASS；visual、flows（误前提由users-edge补验）、review-regression |
| PAGE007 / CAP017、020 / API008 / DATA006、014、015 | 旧记录/空/全暂停、日期恢复、上海边界、失败/迟到/422、创建与恢复、两断点侧布局 | PASS；range-flows、range-matrix |
| PAGE101/102 / CAP101–103 / API101、102 | Models/Plans标题、副标题、Guest、模型状态/编辑/引用、Add/Edit/Key文案样式、保存 | PASS；regression-final、models-list-corrected |
| PAGE102 / CAP102、021 | 模型/篇幅标题实际间距、对齐 | PARTIAL/FAIL：模型gap8正确；篇幅gap0应8、legend文字+2px；CR035 |
| PAGE005 / CAP014、015、022 / DATA006、012 | 六统计标签/视觉与无数据态 | PASS；regression-final、shared-style；不是全统计生命周期重测 |
| PAGE008 / CAP018–020 / DATA014、015 | 重复提示全挖、三个词形、同源颜色稳定、错误纠正/无重叠、单篇/日期成功总结 | PASS；review-regression；多目标跳过/200%沿用历史，本轮未重跑 |
| 相关页面 / 可访问性 | Chromium/WebKit reader键盘圈定、ESC/焦点恢复、作用域Axe、浏览器错误 | 已执行范围PASS；不是人工读屏或全面WCAG认证 |
| API103 / 性能 | 本地20次GET p95低于1秒 | PASS局部检查；无公网SLA/压力结论 |
| AI真实模型质量/兼容 | 本轮0供应商调用、0凭证，合成11批材料 | NOT VERIFIED，发布BLOCKED |

所有新脚本/原始数据见[证据目录计划](./evidence/cr030-074/PLAN.md)。当前开放CR029–035，工作流控制面仍记录029–034，待守门器同步；QA未自行变更状态。
