---
milestone: M001
stage: implementation
role: frontend-implementer/base
agent_name: frontend-claire
status: awaiting_user_review
date: 2026-09-05
change_requests: [CR-024]
---

# CR-024 残余返工 Worktree 计划

## 是否需要并行

- 任务之间是否真正独立：否。三项修复共同影响管理员壳层、Models/Plans 本地化和同一个管理端浏览器回归。
- 并行带来的收益：极低，修改量只有两个词典值、一个输入类名、一条局部样式及对应测试。
- 共享文件和冲突风险：拆分会同时触碰 `application-smoke.spec.ts`，并增加无意义的合并顺序与基线漂移风险。
- 结论：单工作区顺序实现，不创建 Git worktree。

## 文件责任边界

| 任务 | 文件责任边界 | 依赖 | 负责人语义名 |
| --- | --- | --- | --- |
| 精确英文文案 | `frontend/i18n/locales/en-US.json` | 批准原型 `i18n.js` | frontend-claire |
| Model ID input surface | `frontend/app/pages/admin/models.vue`、`frontend/app/assets/css/theme.css` | 批准 input token 与 mono 字体规则 | frontend-claire |
| 定向回归 | `frontend/tests/unit/admin-approved-copy.test.ts`、`frontend/tests/e2e/application-smoke.spec.ts` | 上述实现完成 | frontend-claire |

## 合并顺序

1. 更新文案和局部输入类；
2. 增加精确 unit/E2E 断言；
3. 运行 format、typecheck、lint、boundary、unit、定向双视口 E2E 和 build；
4. 更新前端验证与交接产物。

## 合并检查

- 不修改 API、DTO、store、presenter 或业务行为；
- 原始模型 ID 继续使用 mono 字体，但输入表面与普通 raised input 完全一致；
- 中英文与 desktop/mobile 均覆盖 Add/Edit model；
- CR-025～027 不被重开。

## 清理条件

本轮未创建额外 worktree，无清理动作。

## 2026-09-05 间距补充

TRANSITION-M001-055 的 PAGE-101 弹窗间距由 frontend-claire 在同一工作区顺序处理；新增责任文件 `frontend/app/assets/css/application.css`，继续拥有 Models 页面及原定向 E2E。三处紧密耦合，无并行收益；不改批准设计、API 或其他弹窗。
