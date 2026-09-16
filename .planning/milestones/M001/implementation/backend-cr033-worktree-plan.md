# CR-033 后端实施工作区与验证计划

- 身份：implementation / backend-implementer/base / backend-ethan；授权 TRANSITION-M001-063。
- 单工作区串行：GetUser、ChangeUserGroup 和两个 HTTP 返回共享代码，任务不独立；仓库 HEAD 尚无初始提交，不能安全建立基线 worktree。不提交、清理或覆盖现有未跟踪文件。
- 责任：仅 backend 的 admin 详情查询/事务/纯投影、HTTP DTO 与批次存在性检查、对应测试/raw fixtures/README；本角色的验证/交接、CR-033 进度与当前待审状态。不修改前端、已批准技术文件、数据库迁移或 UAT 服务。
- 顺序：严格剩余额度投影与共享单 SELECT → 换组同事务返回 → HTTP 双响应与窄存在性读取 → 单测/隔离 PostgreSQL 集成/查询计划 → 命名 v1.4 fixtures → 质量检查与交接。
- 验证：格式、race 单测、vet、模块校验、隔离 PostgreSQL 集成和独立后端镜像构建；沿 Q01–Q16 区分本端证据及待前端/独立测试部分。不调用真实 OpenRouter，不读取历史测试密钥。
- 测试资源：专用临时 PostgreSQL 容器/库，完成后仅清理本轮创建的明确目标。不会运行会修改既有组合环境的 make test-integration/up/migrate，也不会让新后端对旧前端进入 UAT。
- 差异依据：修改前记录 178 份非敏感应用/测试/部署文件摘要；完成后检查变化仅落允许文件。无并行分支、合并或 worktree 清理。
