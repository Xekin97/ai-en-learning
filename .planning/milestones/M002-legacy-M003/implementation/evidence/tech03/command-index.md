# TECH03 命令结果索引

日期：2026-10-10  
数据库命令只连接本轮自建的可丢弃本地 PostgreSQL；日志未记录真实连接或密钥。

| 证据 | 命令/目的 | exit | 结果 |
|---|---|---:|---|
| `baseline-go-test.log` | 实施前后端 unit 基线 | 0 | PASS |
| `01-full-integration-initial-fail.log` | 第一轮 `go test -count=1 -tags=integration ./...` | 1 | 旧夹具缺 v5 Plan/snapshot/usage 事实；原始失败保留 |
| `02-full-integration-second-fail.log` | 第二轮完整 integration | 1 | 两个夹具重复 Plan；原始失败保留 |
| `03-full-integration-final-pass.log` | 第三轮完整 integration | 0 | PASS；HTTP 177.610s |
| `04-enhanced-http-final-pass.log` | 增强生成三分支与增强 preview Gateway+DB 闭环 | 0 | PASS |
| `05-p0-http-final-pass.log` | 受影响 P0 HTTP 矩阵 | 0 | PASS |
| `06-commit-delivery-retest-pass.log` | commit ACK 与终态投递失败复测 | 0 | PASS |
| `07-unit-final.log` | `go test -count=1 ./...` | 0 | PASS |
| `08-race-final.log` | AI/capacity/generation/httpapi/observability 定向 race | 0 | PASS |
| `09-static-final.log` | vet、两个 command build、diff check | 0 | PASS |
| `10-compose-static-final.log` | production overlay 合并/静态断言 | 0 | PASS；未启动或部署 |
| `11-empty-schema-m003-final.log` | M003 当前空库 schema/约束/状态 | 0 | PASS；未做旧库升级 |
| `13-capacity-comment-check.log` | 注释收口后的 capacity 定向单测 | 0（纠正 workdir 后） | PASS；第一次命令因在仓库根而非 Go module 退出 1，已如实记录 |
| `14-test-resource-cleanup.log` | 删除自建 `ww-tech03-pg-055` 并确认不存在 | 0 | PASS |

`source-files.txt`、`source-sha256.txt`、`source-artifact.sha256` 与 `tech03-backend-source.tar.gz` 提供当前授权源码的恢复清单和包。`evidence-manifest.json` 列出本目录除自身外全部证据的 SHA-256 与大小。
