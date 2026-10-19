# M003 CR311/312 后端开发验证

## 当前结论（2026-10-14）

backend-ethan 已按 BE08、API302 v6、API004、AI3-05、DATA307/CAP307 与 AC323–328 完成 CR311/312 后端实施和开发验证，建议进入 `awaiting_user_review` 后的独立复核。CR311/312 均保持 open；本结论不是 QA、真实 UAT、真实模型质量、费用、生产容量或部署通过。

### CR311

- Search 与 Random 共用唯一、不可变的 41 项小写精确目录；匹配时大小写无关，SQL 谓词位于排序、随机和 LIMIT 之前。没有长度、词干或子串规则；`art`、`go`、`theater`、`another` 保持候选。
- 筛选只影响新 Search/Random 候选。旧已选 `the`、Resolve、预设、历史批次、生成输入和 m001 词表 hash 均未改变；没有删除词、改 API shape 或新增迁移。
- 隔离 PostgreSQL 18 集成测试遍历全部 41 项及其大写查询，并直接执行生产 `randomCandidateSQL`（仅去掉末尾随机排序/单行限制以枚举资格），与完整 m001 目录减去精确阻止集及真实 Search 结果交叉核对。`q=the,limit=2` 证明过滤不造成 LIMIT 饥饿。

### CR312

- 公共 wire 已切到 `m003-stream-v6`；持久 pipeline 仍为 `m003-content-v5`，policy、snapshot、同模型、调用/请求时限、额度和结算规则保持。普通生成与 preview 都发送连续 seq 的真实 `activity`、`draft`、`edit`；Review 仍为私有事实。
- activity 只来自请求实际发送后的 invocation observer。Plan/Writer/FixedEdit/Rewrite/Review 分别映射批准状态；fixed/rewrite 后的原生 continuation 会从 improving 切回 writing。字段/标注纠错不创建公共 draft，也不完成公共 passage。
- passage extractor 在安全 delta 交给消费者后才发唯一 close 通知；正常 Close、error、cancel、provider EOF 或 adapter 成功返回均不能伪造 body close。跨 chunk 的 `<` 加字母、`/`、`!`、`?` 标记前缀在公开前拒绝，普通比较符保持有效。`body_complete` 只表示 passage JSON string 安全闭合，不表示完整 candidate 已验证或可保存。
- 首稿继续使用 50ms/128 码点合并目标、每 edit 最多 2048 码点及 16KiB 安全待发缓冲。换稿以段引用和累计 offset 线性扫描新增字符：完整段才分片并发布，首片删除对应完整旧段，旧尾到 body_complete 才删除。长 Unicode 段不新增 16KiB 拒绝；append 终态只 join 一次并重建“分隔符归左”的段索引，供同 V 续写后的 V+1 返修使用。空/纯空白前稿的 continuation 从 paragraph 0 开始。同步 ack 保持 0/1 队列背压，满足 BE08 的 8 事件/64KiB 上界。
- draft 覆盖 initial/replace/append/restore、paragraph_complete/body_complete/discard；空首稿后 fixed 仍为 replace。错误、取消与 Q02 回退保留 rev 单调、丢弃当前 attempt、恢复 lastValid；没有 per-token/paragraph DB 写、MQ、CRDT、replay 或持久草稿。

### 最终验证

| 检查 | 结果 | 证据 |
|---|---:|---|
| 受影响 AI/generation/vocabulary/httpapi 单元 | PASS | [`01-focused-unit.log`](evidence/cr311-312-backend/01-focused-unit.log) |
| CR311 全目录、大小写、LIMIT、生产 Random SQL、旧目标/hash；隔离 PG18 + race | PASS | [`02-cr311-integration.log`](evidence/cr311-312-backend/02-cr311-integration.log) |
| generation/preview v6 seq、真实 activity、draft/body/validated 顺序、Review 私有；隔离 PG18 + race | PASS | [`03-http-v6-integration.log`](evidence/cr311-312-backend/03-http-v6-integration.log) |
| continuation/correction/cancel/disconnect/open/silent/slow stream；隔离 PG18 + race | PASS | [`04-continuation-boundary-integration.log`](evidence/cr311-312-backend/04-continuation-boundary-integration.log) |
| `GOTOOLCHAIN=go1.26.7 go test -race -timeout 180s ./...` | PASS | [`05-full-race.log`](evidence/cr311-312-backend/05-full-race.log) |
| 最终 paragraph-0 修正的 generation race/vet | PASS | [`09-final-generation-delta.log`](evidence/cr311-312-backend/09-final-generation-delta.log) |
| sqlc generate、`go vet ./...`、`go build ./cmd/...`、格式/diff | PASS | [`06-static-build-generate.log`](evidence/cr311-312-backend/06-static-build-generate.log) |
| 临时 PostgreSQL 18 停止、目录删除、端口释放 | PASS | [`07-resource-cleanup.log`](evidence/cr311-312-backend/07-resource-cleanup.log) |
| 804 个保护文件哈希 | 0 changed / 0 missing | [`08-protected-files.log`](evidence/cr311-312-backend/08-protected-files.log) |

原始命令索引、失败修正记录、恢复包和逐文件 SHA-256 位于 [`evidence/cr311-312-backend`](evidence/cr311-312-backend/)。task-start 对已 dirty/untracked 源码没有精确 byte snapshot；[`baseline.json`](evidence/cr311-312-backend/baseline.json) 明确记录此限制，root 恢复的 UAT003 archive 仅作为历史基线，源码清单逐路径标注基线质量，不把 HEAD/status 冒充 task-start before。

本轮未调用真实 provider，未读取真实密钥，未迁移任何既有数据库，未重启/刷新/重置 UAT3015 或 3013/3014/4174，也未修改前端、批准产品/技术/设计输入、迁移或控制面。开发替身结果不刷新用户 UAT；文章质量和模型漏判不在本后端开发结论内。

## 历史索引

CR306/TECH03 旧版完整验证正文已冻结在 [`implementation-entry-101/before.tar.gz`](../reviews/evidence/cr311-312-implementation-entry-101/before.tar.gz)；对应原始证据仍位于 [`evidence/cr306-backend`](evidence/cr306-backend/) 与 [`evidence/tech03`](evidence/tech03/)。这些历史记录不构成当前 open 项或待处理状态。
