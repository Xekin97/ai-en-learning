# M002-BI-CR313-01 命令与结果

日期：2026-10-16。数据库仅 `ww-cr313-impl-129` / `127.0.0.1:51223`，每个 fixture 建立并清理随机数据库；凭据与URL均为 synthetic。

## 最终通过

```text
go test ./...
PASS, exit 0（全部包；httpapi 0.561s，portability 0.619s）

go vet ./...
PASS, exit 0

go build ./cmd/...
PASS, exit 0

git diff --check
PASS, exit 0

TEST_DATABASE_URL=<isolated> go test -tags=integration ./internal/platform/postgres -count=1
PASS, exit 0, 9.108s

TEST_DATABASE_URL=<isolated> go test -tags=integration ./internal/portability -count=1
PASS, exit 0；接收修正前7.546s，修正后11.150s

TEST_DATABASE_URL=<isolated> go test -tags=integration ./internal/admin -count=1
PASS, exit 0, 10.467s

TEST_DATABASE_URL=<isolated> go test -tags=integration ./internal/generation -count=1
PASS, exit 0, 9.269s

TEST_DATABASE_URL=<isolated> go test -tags=integration ./internal/growth -count=1
PASS, exit 0, 22.656s

TEST_DATABASE_URL=<isolated> go test -tags=integration ./internal/entitlement -count=1
PASS, exit 0, 5.091s

TEST_DATABASE_URL=<isolated> go test -tags=integration ./internal/httpapi -count=1
PASS, exit 0, 166.422s

TEST_DATABASE_URL=<isolated> go test -tags=integration ./internal/httpapi -run 'TestConfigPortabilityHTTPAdminCSRFAndSecretBoundary|TestCR313Sensitive' -count=1
PASS, exit 0, 1.438s

TEST_DATABASE_URL=<isolated> go test -tags=integration ./internal/portability -run 'TestPlanCommitRejectsChangedHistoricalImpactSnapshot|TestRawFileFingerprintAuthorizationAndRetentionBarriers' -count=1
PASS, exit 0, 1.509s
```

接收修正后的实际 stdout 原文件：

- [affected-unit-r2.stdout](affected-unit-r2.stdout)
- [portability-integration-r2.stdout](portability-integration-r2.stdout)
- [http-focused-r2.stdout](http-focused-r2.stdout)

对应修正后HTTP命令为：

```text
TEST_DATABASE_URL=<isolated> go test -tags=integration ./internal/httpapi -run 'TestConfigPortabilityHTTPAdminCSRFAndSecretBoundary|TestPortabilityKDFGateCapacityRateAndRelease|TestPortabilityUnknownResponseUsesRecoverySemantics' -count=1
PASS, exit 0, 1.573s
```

## 首次失败与修复

1. 初始 PG18 migration/integration 暴露 `jsonb_object_length` 不存在、旧约束名断言、fixture缺成长基础行、误用不存在的 inventory 状态列、achievement `experience=0` 被 omitempty、receipt CHECK 的 SQL NULL 三值穿透。分别改为 key presence/精确类型约束、活动生成列约束、显式 required zero Marshal、正确历史列与完整终态组合后，platform/postgres 与 portability 全集通过。
2. 首次 runtime 合集失败的共同原因为 credential security-definer admin 守卫把 `CredentialStore.Put(expected=nil)` 的内部 synthetic 初始化也拒绝。按 BE501-03 区分：write/update 保留函数内 config FOR UPDATE + active admin + active target/source；replace 仅管理 CAS (`expected != nil`) 验 admin，内部 Put 保留且仍拒 retired legacy provider。
3. 修正后 admin 仍有4个旧测试用 learner UUID 充当 admin service audit actor。测试改为新建专用 synthetic admin，同时在 credential CAS 测试保留并新增 learner 被拒绝断言；admin full integration 通过。
4. HTTP source-incomplete 初测返回503，因为 fixture 没有 checkin rule，读取在形成合法但不完整 export 前已失败。补 synthetic checkin 后再删除 level，准确命中 `ErrSourceIncomplete`，HTTP定向与完整全集通过。
5. full generation 曾有旧 `TestM003CurrentSchemaDefaultsAndBoundaries` 硬编码 latest migration 0017；更新为当前空库 0018 后 generation full integration 通过。
6. 接收复查发现 `readItems` 在主rows未关闭时查询model_trial附属模型，同一tx可能connection busy；改为先完整读完并关闭主rows，再逐item读取附属模型。四kind完整生命周期集成通过。
7. 接收复查发现缺current checkin时 `pgx.ErrNoRows` 被映射503；现在明确转 `ErrSourceIncomplete`，空growth与有checkin但缺level两种HTTP均返回422。
8. Resolve在pool.Begin失败曾落普通service_unavailable；现在返回ErrUnknown，并以关闭本fixture pool验证service语义、HTTP 503 `outcome_unknown` 与 `Retry-After:2`。同CursorKey重建Service的resolve也已实际验证。

未删除/跳过断言，没有把上述首次失败记为PASS；0真实 provider 调用。

