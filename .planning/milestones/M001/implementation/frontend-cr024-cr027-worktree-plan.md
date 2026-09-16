# CR-024～027 前端实现 Worktree 计划

## 是否需要并行

- 任务之间是否真正独立：页面不同，但共享中英文词典、通用 Notice、主题 CSS、Playwright mock 和截图基线。
- 并行带来的收益：有限；共享文件的合并与复测成本高于页面编辑收益。
- 共享文件和冲突风险：`frontend/i18n/locales/*`、`application.css`、E2E mock 与测试文件均会交叉修改。
- 结论：单工作区顺序实现，不创建 Git worktree；仓库尚无首个 commit，也不具备安全 worktree 基线。

## 文件责任边界

| 顺序 | 范围 | 主要文件 | 依赖 | 负责人语义名 |
| --- | --- | --- | --- | --- |
| 1 | CR-024 管理端文案/投影 | locales、admin users presenter、admin pages | 批准原型 i18n | frontend-claire |
| 2 | CR-025 认证门/错误 notice | AuthGate、AppError、CSS、login | 通用视觉 token | frontend-claire |
| 3 | CR-026 Library 状态 | library presenter/store/page、CSS | LearningSummary/Batch application model | frontend-claire |
| 4 | CR-027 Review summary | review presenter/store/page、CSS | ReviewSession application model/API-008 | frontend-claire |
| 5 | 回归测试 | unit、E2E、mock backend | 上述全部 | frontend-claire |

## 合并与检查

1. 每个范围完成后先运行相邻 unit/targeted E2E；
2. 公共 i18n/CSS 最后统一格式化并做双语、390/1440px 对照；
3. 完整 typecheck、lint、boundary、unit、E2E、build 通过后才更新交接；
4. 不改变 API DTO、后端合同或批准设计，不覆盖用户已有无关修改。

## 清理条件

本轮不创建额外 worktree，无清理动作。

## 执行结果

- 按计划完成单工作区顺序实现，没有发生公共 i18n/CSS 冲突。
- 11 files / 44 unit tests、desktop/mobile 38 E2E、Node 24 build 全部通过。
- 最新前端已部署到 6001，等待用户评审后移交 independent verification。
