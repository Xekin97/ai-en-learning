---
milestone: M001
stage: implementation
role: frontend-implementer/base
agent_name: frontend-claire
status: complete
date: 2026-09-04
changes: [CR-022, CR-023]
---

# CR-023 前端返工工作区计划

## 是否需要并行

- 任务之间是否真正独立：否。路由元数据、PAGE-103 controller 的滚动恢复和同一浏览器回归属于一个交互时序。
- 并行带来的收益：很低；修复仅涉及一个页面路由合同及其既有 E2E。
- 共享文件和冲突风险：当前仓库没有 Git HEAD，所有项目文件仍未跟踪，无法建立可验证的 worktree 基线。
- 结论：使用单工作区串行实现，不创建 Git worktree。

## 文件责任边界

| 任务 | 文件 | 依赖 | 负责人 |
| --- | --- | --- | --- |
| 限定详情返回滚动行为 | `frontend/app/pages/admin/users/index.vue` | Nuxt 4 `scrollToTop(to, from)` 路由合同 | frontend-claire |
| 三页、窄视口、非零滚动往返回归 | `frontend/tests/e2e/application-smoke.spec.ts` | 既有合同一致 mock 与 PAGE-103 测试 | frontend-claire |
| 验证和交接 | implementation 文档、CR-022/023 | 前两项通过 | frontend-claire |

## 实施约束

1. 只在 `from=/admin/users/:userId` 且 `to=/admin/users?focus=...` 时禁止 Nuxt 默认置顶。
2. 普通进入用户页、直接刷新、新搜索和其他管理员导航维持框架默认滚动。
3. 不修改 API、store、DTO、cursor、列表顺序、响应式 CSS或批准原型。
4. E2E 必须先加载三页，在 390px 窄视口形成非零 scrollY，并同时断言结果、焦点、滚动和可见性。

## 清理条件

本轮没有额外 worktree。实现通过格式、lint、边界、类型、单元、定向浏览器和构建后才能提交交接。
