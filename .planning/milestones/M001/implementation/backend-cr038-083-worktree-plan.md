# CR038 后端实现工作区计划（DEV083）

## 是否需要并行

- 任务之间是否真正独立：本轮只有共享 `writeNoContent` helper、定点单元测试、HTTP/PostgreSQL 集成回归与证据文档，修改面窄且相互依赖。
- 并行带来的收益：没有可抵消共享 helper、测试夹具和最终证据串行依赖的收益。
- 共享文件和冲突风险：仓库没有初始 commit，大部分文件未跟踪，且主会话正在维护控制面；建立 Git worktree 没有安全基线。
- 结论：由唯一活动实现身份 `backend-ethan` 在现有单工作区完成，不创建分支/worktree，不提交或重置 Git。

## 文件责任边界

- 仅写任务包 `.planning/agt/tasks/cr038-backend-083.json` 的 `write_scope`。
- 后端行为只改 `backend/internal/httpapi/response.go`；测试只改/新增任务包列出的两个测试文件。
- 主验证与交接保留旧正文，仅追加 CR038 当前增量。
- 不改 API、密码策略、会话事务、数据库、前端、workflow state、agent registry、CR 状态或 UAT6001。

## 追踪

- CAP-004 / PAGE-009 / API-003 / DATA-003、DATA-004：自助改密 204。
- 共享回归：API-002 退出；API-003 注销；API-006 放弃生成；API-007 删除学习批次并级联移除相关复习会话；API-103 管理员重置密码。
- API v1.4 §1.3、§1.6：204 必须空体、无 `Content-Type`，认证/学习/管理响应使用 `Cache-Control: no-store`。

## 验证与清理

1. 先新增失败测试并保留 RED 原始输出。
2. 最小修改 helper，运行定点测试、gofmt 检查、`go vet ./...`、`go test -race ./...`、`go test -race -tags=integration ./...`。
3. 集成测试只连接 DEV083 新建的 `ww-dev-083` tmpfs PostgreSQL，并只写合成数据；不启用 `liveintegration`、不读取历史凭据。
4. 构建并保留 `wordweave-backend:cr038-083` 候选镜像及不可变 image ID；清理 DEV083 可重建容器、网络和临时数据，保留测试日志和报告。
5. 清理前后精确核对 `wordweave_uat-*` 容器身份、镜像与启动时间不变。

## 合并检查

- 差异只在 write scope，旧正文和失败证据保留。
- 所有适用开发期检查通过；测试失败不通过删除测试、降低断言或改用真实业务数据规避。
- 候选只供后续独立 QA；本角色不关闭 CR038、不切阶段、不声称 QA/UAT PASS。
