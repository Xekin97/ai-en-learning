---
milestone: M001
stage: implementation
role: frontend-implementer/base
agent_name: frontend-claire
task: CR037-03
date: 2026-09-07
---

# CR037-03 前端实现工作区计划

## 是否需要并行

- 任务之间是否真正独立：否。账号状态、账号页渲染与同一错误态的单元/E2E验证属于一个原子改动。
- 并行带来的收益：很低；并行编辑同一 store 与页面会增加状态语义冲突。
- 共享文件和冲突风险：`account.ts` 与 `account.vue` 必须同步；测试直接依赖两者。
- 结论：单工作区，不创建 Git worktree，不派生其他实现代理。

## 文件责任边界

| 工作项 | 文件 | 依赖 | 负责人语义名 |
|---|---|---|---|
| 密码错误状态隔离 | `frontend/app/runtime/stores/account.ts` | 既有 AppFailure / normalizeFailure | frontend-claire |
| dialog 内渲染与清理 | `frontend/app/pages/account.vue` | 密码错误状态 | frontend-claire |
| RED→GREEN 状态/组件回归 | `frontend/tests/unit/account-password-error.test.ts`、批准的既有单元文件 | 上述实现 | frontend-claire |
| Mock 浏览器回归 | `frontend/tests/e2e/cr037-auth-account.spec.ts`、`frontend/tests/e2e/mock-backend.mjs`（仅需要时） | 同源 DTO→mapper→store→render | frontend-claire |
| 真实候选关联验证与交付证据 | `evidence/cr037-084`、本轮 validation / handoff 增量 | CR038固定后端候选 | frontend-claire |

## 实现追踪

- PAGE-009 / CAP-004 / CAP-021 / DATA-003、DATA-004 / API-003。
- `Problem DTO → problem mapper → AppFailure → account passwordFailure → dialog AppError`。
- 页面加载/注销错误继续使用既有 `failure`，不得被密码提交开始、成功、取消或重开清除。

## 合并与检查

1. 先提交失败测试并保留首次 RED；再实现 store 与页面；最后补浏览器断言。
2. 运行定点单元、完整单元、format check、lint、依赖边界、typecheck、完整 Mock E2E、Docker build。
3. 使用 CR038 固定 backend image 和本轮固定 frontend image 在专用 `ww-dev-084` 隔离栈验证；只使用合成账号。
4. 不做 Git commit/merge/reset；不修改 workflow、agents、history、CR 状态、设计或 UAT6001。

## 清理条件

只移除带本轮精确 `ww-dev-084` 标记的临时容器、网络与可重建数据库；保留候选镜像和全部证据。清理前后核对 UAT6001 容器身份与端口。
