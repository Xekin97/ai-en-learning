# CR-028 工作区计划

- 负责人 frontend-claire；单工作区顺序实现。只有登录页编排与其浏览器回归，不能独立拆分，无需 worktree。
- 文件责任：frontend/app/pages/login.vue；frontend/tests/e2e/application-smoke.spec.ts。
- 上游：design/interactions.md 的账号偏好优先；API-002 登录响应；PAGE-003 / CAP-003 / DATA-018。
- 顺序：登录写入应用 session 后、任何导航/承接前，调用现有语言应用动作；增加两种身份/双向语言覆盖；运行定向浏览器与生产构建验证。
- 不修改 DTO、mapper、store、后端或批准设计；不清理其他工作区内容。
