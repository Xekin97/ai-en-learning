# CR313 backend 源差异

基准：`reviews/evidence/cr313-implementation-entry-129/backend-before.json` / `backend-before.tar.gz`。统计排除未纳入基准且不属本角色的 ignored `backend/.env`。

```text
45 files changed, 5408 insertions(+), 108 deletions(-)
0 deleted files
```

## 新增

- `backend/db/migrations/0018_m002_config_portability.sql`
- `backend/internal/portability/{types,file,service,preview,commit}.go`
- `backend/internal/portability/{file,preview,portability_integration}_test.go`
- `backend/internal/httpapi/config_portability_handlers.go`
- `backend/internal/httpapi/config_portability_handlers_test.go`
- `backend/internal/httpapi/config_portability_integration_test.go`
- `backend/internal/admin/provider_retirement_integration_test.go`
- `backend/internal/entitlement/provider_retirement_integration_test.go`
- `backend/internal/generation/provider_retirement_integration_test.go`
- `backend/internal/growth/retirement_integration_test.go`
- `backend/internal/httpapi/middleware_redaction_test.go`

## 修改

- DB/query/generated：`db/queries/entitlement.sql`、`internal/dbgen/entitlement.sql.go`、`internal/platform/postgres/{migrate,m002_integration_test,m003_migration_integration_test}.go`
- admin/AI：`internal/admin/{m002_integration_test,model_batch,model_connections,model_connections_integration_test,model_providers,model_providers_integration_test,models,user_detail}.go`、`internal/ai/connections.go`
- runtime：`internal/entitlement/service.go`、`internal/generation/{service,preset_catalog,preset_preview,presets,m003_migration_integration_test}.go`、`internal/growth/{levels,achievements,awards,settlement,operations}.go`
- HTTP/startup/maintenance：`internal/httpapi/{server,middleware}.go`、`internal/maintenance/maintenance.go`

没有修改 frontend、批准产品/设计/技术真源、workflow state/history、UAT服务或真实环境配置。

