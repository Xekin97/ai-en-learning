---
milestone: M001
stage: implementation
role: frontend-implementer/base
agent_name: frontend-claire
status: complete
date: 2026-09-04
changes: [CR-022, CR-023]
---

# CR-023 第二轮前端返工工作区计划

## 是否需要并行

- 任务之间是否真正独立：否。滚动恢复 helper、PAGE-103 controller、真实长度 mock 与同一 E2E 矩阵属于一个交互合同。
- 并行带来的收益：很低；生产变更只有一次滚动/焦点原子恢复。
- 共享文件和冲突风险：仓库没有 Git HEAD，所有项目文件仍未跟踪，无法建立可验证的 worktree 基线。
- 结论：使用单工作区串行实现，不创建 Git worktree。

## 文件责任边界

| 任务 | 文件 | 依赖 | 负责人 |
| --- | --- | --- | --- |
| 即时恢复并禁止聚焦二次滚动 | `frontend/app/presentation/controllers/admin-user-search.ts` | PAGE-103 已保存 navigation state | frontend-claire |
| 恢复原子行为单元回归 | `frontend/tests/unit/admin-user-position.test.ts` | presentation helper | frontend-claire |
| 46 行三页 mock 与四视口回归 | `frontend/tests/e2e/mock-backend.mjs`、`application-smoke.spec.ts` | API-103 已批准分页 DTO | frontend-claire |
| 真实链路验证和交接 | implementation 文档、CR-022/023 | 前三项通过 | frontend-claire |

## 根因与约束

1. 全局批准样式包含 `html { scroll-behavior: smooth }`；原 `window.scrollTo({ top })` 因此启动长距离动画，350–500ms 后仍未到达源位置。
2. 返回恢复必须显式即时完成，并通过 `focus({ preventScroll: true })` 防止焦点再改变视口。
3. 只改变 PAGE-103 详情返回路径；普通链接、搜索、分页焦点和全局平滑滚动不变。
4. 不修改 API、store、DTO、cursor、列表顺序、响应式 CSS 或批准原型。
5. 开发回归必须覆盖 46 行三页及 390×320、390×844、1440×600、1440×1000，scrollY 误差不超过 2px。

## 清理条件

本轮没有额外 worktree。实现通过格式、lint、边界、类型、单元、定向浏览器、完整浏览器与生产构建后才可提交交接。

结果：上述门禁全部通过；最新 UAT 镜像的真实四视口矩阵为 4/4、综合专项为 5/5。
