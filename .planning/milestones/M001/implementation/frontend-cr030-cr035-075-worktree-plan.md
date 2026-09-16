---
milestone: M001
stage: implementation
role: frontend-implementer/base
agent_name: frontend-claire
status: awaiting_user_review
date: 2026-09-06
---

# 第075轮有限前端返工工作区计划

依据[075批准](../reviews/verification-cr030-cr035-rework-approval.md)、[CR030](../changes/CR-030.md)、[CR035](../changes/CR-035.md)及[QA原始交接](../handoffs/verification.md)。

## 决策

采用单工作区，不创建子代理或Git worktree。两个问题共享application.css，拆分增加样式冲突；仓库尚无HEAD且现有文件均untracked，均视为用户资产，不reset/clean/提交无关文件。

| 工作 | 文件责任 | 依赖与顺序 | 负责人 |
| --- | --- | --- | --- |
| 长名详情换行/收缩、Plans局部legend间距 | frontend/app/assets/css/application.css，必要时仅相关Vue结构 | 批准PAGE103/102；先复现，再局部修复 | frontend-claire |
| 防回归测试 | 新增frontend/tests/e2e/cr030-cr035-075.spec.ts及必要单测 | 契约Mock→既有mapper/state→渲染，不发明API字段 | frontend-claire |
| 真实候选/设计对照 | implementation/evidence/cr030-cr035-075 | 旧固定候选对照，新候选构建，独立临时栈 | frontend-claire |
| 交付 | 本轮报告、frontend-validation、frontend-implementation与CR030/035进展 | 记录所有原始失败与通过、哈希与清理 | frontend-claire |

## 保留边界

不改设计原型/产品/API/后端、词典和全站语言规则；不改变传输/转换/状态/渲染边界。保留32字符合法数据，不用overflow:hidden掩盖页面溢出；保留fieldset/legend，不给已有模型间距叠加8px。QA报告和FAIL、其他CR与工作流控制面均不修改。

## 检查与清理

执行format、lint、依赖边界、typecheck、unit、生产Docker构建、新浏览器用例与全量既有E2E；实际浏览器对照双语、移动/桌面/断点、长短名称、Plans四组/空多模型/保存，保留搜索返回和reader回归。

临时栈仅用ww-dev-075名称和wordweave.dev=075标签、6101本机端口、合成数据库、禁用供应商。6001与既有6010不动。先记录数据与范围哈希，验证标签后仅清理本轮容器/网络；保留结果、脚本及截图。无worktree需要合并或清理。

## 完成记录

只改application.css与新增两份测试；160 unit、110 Mock E2E、1144真实浏览器断言通过。[开发报告](./frontend-cr030-cr035-075-validation.md)及[清理记录](./evidence/cr030-cr035-075/cleanup.json)已提交。未合并/删除worktree、未提交Git、未推进workflow或UAT。
