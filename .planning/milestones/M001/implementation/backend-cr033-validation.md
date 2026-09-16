---
milestone: M001
stage: implementation
role: backend-implementer/base
agent_name: backend-ethan
status: awaiting_user_review
date: 2026-09-05
contract_version: v1.4
change_requests: [CR-033]
---

# CR-033 后端实现与开发验证

## 结论与范围

后端开发期 PASS。API-103 GET 用户详情与 PUT 换组的完整 user 均已加入真实 generation_quota；未修改搜索 summary、批次、API-004、复习或 SSE 契约。换组按账号锁、更新、同事务投影、提交的顺序返回；失败不返回半份 user，不自动重放提交。

依据：[TRANSITION-M001-063](../reviews/technical-frontend-cr033-approval.md)、[后端批准](../reviews/technical-backend-cr033-approval.md)、[后端方案](../technical/backend-cr033.md)、[API v1.4](../technical/api/index.md)、[前端同步](../technical/frontend-cr033.md)。追踪 PAGE-103 / CAP-104/105 / DATA-003/006/009；CAP-107 只读资料仍沿既有权限。

这是后端角色交付，不是独立 QA、前端适配或 UAT 通过。CR-029–033 均保持 open。

## 实现文件与边界

- [admin/service.go](../../../../backend/internal/admin/service.go)：GetUser 共用详情查询，换组使用显式 READ COMMITTED 事务；RequireUser 为批次路由提供窄存在性读取。
- [admin/user_detail.go](../../../../backend/internal/admin/user_detail.go)：单语句快照、严格角色/额度投影、int64 用量钳制、完整换组事务与取消后的有界回滚。
- [httpapi/admin_handlers.go](../../../../backend/internal/httpapi/admin_handlers.go)：GET/PUT 共用显式详情 mapper；generation_quota 及 remaining 不使用 omitempty，admin/null 和 unlimited/null 均保留；批次不再执行额度聚合。
- 新增 [纯函数/事务单测](../../../../backend/internal/admin/user_detail_test.go)、[数据库专项](../../../../backend/internal/admin/user_detail_integration_test.go)、[HTTP 专项](../../../../backend/internal/httpapi/admin_quota_integration_test.go)、[v1.4 契约与负向测试](../../../../backend/internal/httpapi/contract_v14_test.go)。
- [raw fixtures 清单](../../../../backend/testdata/contracts/v1.4/manifest.json)：7 个完整 JSON envelope，含 GET 有限/0/无限/admin 与 PUT 有限/0/无限；两个合成用户身份。逐文件 SHA-256 由单测校验，并比较实际 mapper/envelope 输出；前端应原样同步到自身 build context。
- [backend README](../../../../backend/README.md) 已同步版本、隔离测试与配套发布约束。

只使用现有 app 数据、组策略和计费标记。不读取供应商配置/正文/计量明细，不新增 SQL 迁移、索引、依赖、环境变量或业务端点。计费下界固定为 max(statement_timestamp()−24 hours, quota_reset_at)，保持 >=；有限/0、无限与管理员不适用分别处理。

## 开发验证

以下 Go 命令在 backend/ 工作目录、固定镜像 golang@sha256:e8c859f5632dcfde7b32d2012b4351728f6437930887c2f6a91ea242459e5514 执行；没有采用主机 Go 1.27。使用已有模块/构建缓存，不修改 go.mod/go.sum。

| 检查 | 结果 |
| --- | --- |
| gofmt -w 后对本轮 7 个 Go 文件执行 gofmt -l | PASS，无未格式化输出 |
| go test -race -count=1 ./... | PASS，非缓存全量单测 |
| go vet -tags=integration ./... | PASS，无诊断 |
| go mod verify | PASS，all modules verified |
| go test -race -count=1 -tags=integration ./... | PASS，含新 admin/HTTP 专项及原 HTTP E2E、搜索 cursor v2、迁移/复习/AI 替身回归 |
| go test -tags=integration ./internal/admin -run TestAdminQuota -v | PASS，数据库/并发/查询计划专项 |
| docker build -t wordweave-backend:cr033-check backend | PASS，独立 build context、多阶段构建两个 Go 二进制 |
| 镜像配置核对 | 用户 nonroot:nonroot；最终镜像 sha256:e8c4ee91a7c3265cda8c496ccc8fb485328d95b6c1662eaf2502011ce5d005a5 |

最终无缓存 integration/race 中 admin 包 5.535s、httpapi 包 13.323s、postgres 包 2.175s；所有包成功退出。未运行 liveintegration 标签、真实 OpenRouter 或生产镜像切换；没有把构建成功称作实际 UAT 部署成功。

复现隔离执行形态（先准备专用 PostgreSQL，勿指向 UAT/生产；测试账号需 CREATE DATABASE 权限）：

```sh
docker run --rm -v /absolute/project/backend:/src -w /src \
  --network <test-network> -e TEST_DATABASE_URL \
  -v wordweave-go-mod-cache:/go/pkg/mod \
  -v wordweave-go-build:/root/.cache/go-build \
  golang@sha256:e8c859f5632dcfde7b32d2012b4351728f6437930887c2f6a91ea242459e5514 \
  go test -race -count=1 -tags=integration ./...
```

首次 HTTP 专项把“未知字段拒绝”误写为 422；实际与既有 API 通用错误合同一致，为 400/malformed_request。测试已修正为分别断言未知字段 400、业务校验 422 及对应 code，没有修改/放宽接口。早期执行命令的 DSN 未加引号触发 zsh glob，未执行测试；加引号后运行上述验证，最终无未解决失败。

## Q01–Q16 证据归属

| 后端方案场景 | 本轮证据 / 状态 |
| --- | --- |
| Q01–Q03 有限、耗尽、零上限、降额 | PASS：纯函数 + 真实 SQL + HTTP；剩余为 0 仍返回 200，MaxInt64 用量先钳制不溢出 |
| Q04–Q05 无限/admin/异常组 | PASS：无限/admin、空配置与关闭 AI pool 的真实 HTTP 读取；缺组/错误角色纯投影拒绝，不默认无限 |
| Q06 24h/reset 边界 | PASS：-1µs / 相等 / +1µs；UTC、Asia/Shanghai、America/New_York 跨 DST；只在测试 queryer 注入固定时刻，不新增生产参数 |
| Q07 计费/退款 | PASS：active、valid、user_cancelled 计费，四种失败不计；真实 CompleteFailure 退款后重新读取 |
| Q08 归属/保存/删除/claim | PASS：另一账号与访客 credited_account_id 不混计；saved/abandoned 事实；真实创建资料/DELETE 后库数变化而额度不返还 |
| Q09 换组与旧 active | PASS：basic/pro/plus 完整投影、旧快照不改；旧 active 在重置后结算仍不计入新窗口 |
| Q10 并发 | PASS：同账号两次换组锁等待；普通 GET 在未提交换组期间不阻塞且返回完整旧快照；当前组策略更新；真实 generation.Start 等待换组锁，使用新组，随后占用 1 次 |
| Q11 失败/取消 | PASS：事务步骤单测；SQL 投影权限失败回滚；真实延期约束使 commit 失败；注入“提交成功后返回错误”验证不重放及 GET 对账；取消请求不产生成功对象 |
| Q12 权限 | PASS：访客/学习者/管理员 × 有效/缺失/非法 ID，401/403/404；CSRF/Origin、管理员不能换组；有限 0 可查看 |
| Q13 严格投影 | PASS（后端）：7 个 raw fixtures 与 mapper/envelope 一致；缺键/extra/null/负数/小数/字符串/角色错误负例。前端 strict schema 仍待其实现验证 |
| Q14 安全/只读 | PASS（本端）：精确响应白名单、错误不含部分 data/内部表名；重复 GET 不重置/消耗；没有新增日志，既有日志实现未改 |
| Q15 开销 | PASS：见查询计划；撤去 app 对运行表 SELECT 权限后，搜索与只读批次列表/详情仍 200，证明不依赖额度聚合 |
| Q16 前后端配套/迟到 GET | 后端双响应与旧 schema 缺字段负例已覆盖；SSR/browser 状态竞态、配套部署/回滚和旧 tab 刷新仍待 frontend-claire 与 qa-quinn，不宣称整项通过 |

## 查询计划

PostgreSQL 18.6；30,000 条合成运行，目标账号 10,000 条、另一账号 20,000 条；目标近 24h 的计费 100 条，其余超过 24h。正常 ANALYZE 后执行生产同一 SELECT 的 EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)，未强制关闭顺序扫描或新增索引。

首次专项记录：

| 分支 | 执行时间 ms | generation_runs_account_quota_idx loops / rows |
| --- | --- | --- |
| limited | 0.069 | 1 / 100 |
| unlimited | 0.036 | 0 / 0 |
| admin | 0.045 | 0 / 0 |

测试对索引名称及 actual loops 做断言，无限/admin 的计费子计划未执行。数字仅为该开发样本，不是生产 p95/SLA；真实规模应独立复测。

## 环境、差异与交接

- 采用[单工作区计划](./backend-cr033-worktree-plan.md)。178 份基线文件摘要比对只发现 backend 范围变更：3 个既有文件修改，新增 5 个 Go 文件和 8 个 fixture/manifest 文件；无文件删除、Git 提交或 worktree 清理。
- 只创建临时容器 wordweave-cr033-test-db，镜像为 PostgreSQL sha256:b85269e8c6aa961524542eb4dcca44c4aa1deba2cf507e9e28d5ba8f971aeab9；无主机端口、tmpfs 数据。每项集成测试建独立命名库并清理；结束时剩余测试库为 0，容器已停止并自动移除。既有 UAT 容器、数据、端口和开发缓存未动。
- 技术/API/数据库/前端方案均不改写，数据库迁移不变；仅本角色验证/交接、CR-033 进度和待审状态更新。
- frontend-claire 下一步按已批准 CR-029–033 实施，包括共用 strict DTO/mapper、完整 user 更新、错误与迟到请求隔离、精确 UI 和 fixtures 同步。新 backend 不可独立部署到旧 frontend；先隔离配套验证，再走既有发布流程。
- qa-quinn 后续独立验证；前端/独立 QA/UAT 尚未完成。当前停在 implementation / backend-ethan / awaiting_user_review，申请用户审阅并在同阶段交接 frontend-claire。
