---
milestone: M001
stage: implementation
role: frontend-implementer/base
agent_name: frontend-claire
status: active
date: 2026-09-06
scope_authorization: TRANSITION-M001-068
---

# CR-034 单工作区实施计划

## 是否并行

采用单工作区。产品仓库尚无HEAD提交，全部既有文件均视为用户工作；不创建提交、worktree或执行清理。状态、controller、VM、组件与测试有直接依赖，共享locale/CSS容易冲突，本轮不派生子角色。

## 责任与顺序

| 任务 | 路径（相对frontend/） | 负责人 | 依赖 |
| --- | --- | --- | --- |
| 日期范围状态与请求生命周期 | app/application/review/range-setup.ts、app/runtime/stores/review-setup.ts | frontend-claire | 已批准API-008、CR-034方案 |
| 控制器/渲染/稳定表单 | app/presentation/controllers/review-setup.ts、presentation/review/review-setup-presenter.ts、presentation/components/review/ReviewRangeSetup.vue、pages/review/index.vue | frontend-claire | 状态与VM |
| 移除旧setup入口、精确文案/样式 | runtime/stores/review.ts、assets/css/application.css、i18n/locales/*.json、reader presenter | frontend-claire | 新setup完整替代 |
| 开发验证 | tests/unit、tests/e2e、tests/integration、本轮implementation/evidence | frontend-claire | 上述实现 |

不改产品、批准原型、技术/API、后端、数据库、nginx、锁文件、workflow/registry/history或独立质量证据。CR进度可追加，保持open。

## 检查与合并

本轮无分支合并。先状态/契约与单元，再UI与浏览器，随后固定Node24镜像构建和隔离真实后端验证；记录实际命令与失败，不能用设计自检代替生产验证。生产数据和6001 UAT不操作，既有6010设计服务只读使用。测试服务器仅用检查后空闲端口；只清理本轮创建且已验证身份的临时资源，不清理用户工作树。

## 批准与边界

[068批准](../reviews/technical-frontend-cr034-approval.md)、[前端增量](../technical/frontend-cr034.md)、[设计合同](../design/cr034-interaction-contract.md)。本轮完成后交用户审阅与独立复验，不自行迁移。
