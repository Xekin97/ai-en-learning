# CR-304 实现修复证据

日期：2026-10-12  
状态：实现修复完成，等待独立 QA；CR-304 保持 open。

## 变更与原因

- `backend/internal/httpapi/generation_handlers.go`：新增共用 `writeGenerationBusyProblem`，从同一个整数生成 `Retry-After` 与 `context.retry_after_seconds`，并输出 API-302 的统一 title/detail。
- `backend/internal/httpapi/admin_handlers.go`：模型 probe busy 分支改用共用 helper。
- `backend/internal/httpapi/capacity_test.go`：普通生成、预设/后台 preview、模型 probe 三入口校验 503、problem content type、no-store、严格两字段 context，以及 header/body 秒数一致。
- `implementation/backend-validation.md`、`handoffs/backend-implementation.md`：登记 CR-304 修复和待独立 QA 状态。

## 命令结果

| 证据 | 命令 | 结果 |
|---|---|---|
| `00-command-invocation-correction.log` | 首次命令路径纠正记录 | exit 1；未写源文件/测试证据，空目录已删除 |
| `01-targeted-httpapi-tests.log` | 三入口 busy 契约定向单测 | PASS，exit 0 |
| `02-httpapi-unit.log` | `go test -count=1 ./internal/httpapi` | PASS，exit 0 |
| `03-targeted-race.log` | 三入口定向 race | PASS，exit 0 |
| `04-vet.log` | `go vet ./internal/httpapi` | PASS，exit 0 |
| `05-static-and-artifact.log` | gofmt、diff check、归档成员、live hash、旧 TECH03 archive 完整性 | PASS，exit 0 |

`cr304-code.patch` 是相对旧 TECH03 源码 archive 的三文件最小差异。`cr304-source.tar.gz`、`source-sha256.txt` 与 `current-source-receipt.json` 提供五个本轮交付文件的恢复和哈希回执。原 TECH03 100 文件 archive 未修改。
