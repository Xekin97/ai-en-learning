---
milestone: M002
stage: implementation
role: frontend-implementer/base
agent_name: frontend-claire
version: M002-FI-CR313-01
status: complete
date: 2026-10-16
---

# CR313 前端实施计划

## 已确认基础

- 当前授权：`TRANSITION-M002-130`，active state 为 `M002 / implementation / frontend-claire`。
- 批准输入：M002-PRODUCT-09-R1、M002-UI-33-R3、TA1、M002-FE-CR313-01、FE313-B1、M002-BI-CR313-01。
- 边界：只实现 models/plans/items/growth 四类整类导入导出；不增加用户、预设、公告或历史迁移入口，不改后端及批准产物。
- 无会改变实施边界的未确认解释。

## 当前任务与验收

| ID | 任务 | 输入/依赖 | 完成条件 | 状态 |
|---|---|---|---|---|
| FI313-01 | 应用模型、严格 DTO schema、mapper、五接口 repository | API-501～505、FE501-02/03/05 | DTO 不越过 infrastructure；presence/null/0/false/empty 与联合关系有单测 | 完成 |
| FI313-02 | 客户端操作状态、秘密闭包、恢复槽与竞态门禁 | FE501-04/05 | 提交前存槽、imports 不自动重放、迟到响应不污染、logout 清理 | 完成 |
| FI313-03 | 共享 modal 与四入口 UI | UI33R3、TA1、FE501-06 | 真 modal、焦点/Escape/禁关闭、动态文案、四入口和原宿主行为保留 | 完成 |
| FI313-04 | 开发验证和真实隔离集成 | FE501-07、BI01 | scoped unit/boundary/type/lint/build/browser/API 检查留存原始输出 | 完成；4176未监听，改用独立43132只读 formal 服务完成8/8运行时对照 |
| FI313-05 | 收敛报告与交接 | role-handoff 模板 | 准确列出通过、未执行、边界和下一动作 | 完成 |

## 是否需要并行

- 模块间共享 application model、store、modal 与 contract fixture，接口并不独立。
- 并行收益低，冲突风险高；本轮由 frontend-claire 在当前脏工作区单独集成，不创建 helper 或 Git worktree。

## 实施顺序

1. 建立 contract/schema/mapper/repository 与单测。
2. 建立私有操作状态、恢复适配及单测。
3. 完成代表性 models modal 并核对，再接 plans/items/growth 四入口。
4. 修正共享 AppDialog 的局部关闭控制并回归计划优先级 modal。
5. 运行 scoped 静态、unit、build、browser 与隔离 API 集成检查；修复范围内缺陷。

## 合并与清理

- 不创建分支、worktree、commit 或 push；保留所有既有脏改动。
- 只清理由本轮启动的独立服务、临时数据库和临时输出；原 UAT3015、4174/4175/4176 不触碰。
