---
milestone: M001
stage: technical-design
role: backend-architect/base
agent_name: backend-alex
status: awaiting_user_review
date: 2026-09-05
contract_version: v1.4
change_requests: [CR-033]
---

# CR-033 用户详情只读额度：后端增量设计

## 1. 授权与结论

CONFIRMED：[TRANSITION-M001-061](../reviews/technical-frontend-cr029-cr032-approval.md) 批准补齐 PAGE-103 用户详情所需的最小只读额度契约。本文件的具体字段、查询和兼容方案仍为 PROPOSED，等待用户审阅；没有修改生产代码、数据库或 UI 稿。

推荐在 API-103 的 `AdminUserDetailDto` 内新增必填 `generation_quota`，只提供有限剩余 / 无限 / 管理员不适用三个分支。GET 用户详情和 PUT 换组的 `data.user` 使用同一投影；用户搜索列表和只读批次不增加此字段。完整 HTTP 定义位于 [API 契约第 12 节](./api/index.md)。

不新增接口、表、索引、缓存、后台任务、环境变量、运行副本或模型调用。保持 [DEC-008](../decisions/DEC-008.md) 的滚动 24 小时、失败退款与换组重置规则；不提供事件/成本报表、额度调整命令或代用户生成。

## 2. 追踪与输入证据

| 现有范围 | 用例 / 模块 | 数据与接口 |
| --- | --- | --- |
| PAGE-103，CAP-104 | 查看账号详情；admin 聚合、entitlement 额度语义、HTTP 显式投影 | DATA-003/006/009；API-103 GET 用户详情 |
| PAGE-103，CAP-105 | 换组后返回同事务详情快照 | DATA-003/006/009；API-103 PUT group |
| CAP-007/008/009 | 既有额度事实与生成强制校验；仅作为口径来源 | API-004/005；不扩展其请求/响应 |
| CAP-107/021 | 只读资料与本地化边界不变 | DATA-012/013/018；批次 API 与材料不变 |

已核对：

- [产品页面](../product/pages/index.md)、[能力](../product/abilities.md)、[数据资产](../product/data-assets.md)、DEC-008/011 与原型 `renderAdminUserDetail` 的“可用次数”。该字段表示剩余次数，不是计划上限。
- [数据库方案](./database.md) §5.2/5.3/5.5、§8 索引和 T2/T3/T6：现有账号重置时间、组上限、运行计费标记即可计算；无新持久化数据。
- `backend/db/migrations/0002_core_tables.sql` 已有 `accounts.group_code/quota_reset_at`、`entitlement_groups.rolling_quota_limit`、`generation_runs.account_id/started_at/quota_charged` 和 `generation_runs_account_quota_idx`。
- `backend/db/queries/entitlement.sql`、`internal/entitlement/service.go` 与 `internal/generation/service.go` 已按账号、计费标记、滚动窗口及重置时间计数；不能改用 `credited_account_id` 或累计成功数。
- 当前 `admin.GetUser` 单条 SELECT 读取身份与库计数，无额度；`ChangeUserGroup` 为独立 UPDATE 后调用 GetUser，缺少返回快照的同事务边界。
- `httpapi.adminUserDetailDTO/mapAdminUserDetail` 显式白名单；GET 和换组共用。搜索、批次 handler 不能因重用 GetUser 获得不必要的额度依赖。
- 前端 `adminUserDetailSchema` 为 strict union，GET 与换组共用；新增字段不是对现行客户端透明兼容。

## 3. 取舍

| 方案 | 收益 | 代价 / 风险 | 建议 |
| --- | --- | --- | --- |
| 详情内最小额度投影 | 一次读取保持身份/方案/剩余一致；复用现有加载和错误状态 | 严格 schema 需配套更新 | 采用 |
| 新建独立 quota GET | 现有详情 DTO 不变 | 新端点/额外请求，方案与额度跨请求竞态，增加前端状态 | 本轮不采用 |
| 直接复用完整 API-004 Options/Quota | 表面上减少代码 | Options 会读取模型/凭据和当前主体；完整 quota 含不需要的 limit/refreshes_at，扩大投影 | 不采用 |
| 前端按组上限估算 | 无后端改动 | 不知道已用量、退款和重置，不能得到真实剩余 | 不可行 |

复用的是计量口径及必要纯计算，不是模拟一个学习者会话后调用 Options。额度不是生成可用性：无模型、无长度、凭据缺失或正在生成时仍可正确返回剩余次数，不据此承诺可立即生成。

## 4. 投影与计算不变量

`generation_quota` 为下列严格联合，不返回其他子字段：

- 学习者有限：`{"kind":"limited","remaining":2}`；remaining 为非负整数，可为 0。
- 学习者无限：`{"kind":"unlimited","remaining":null}`。
- 管理员：`null`，表示不适用，不表示无限，也不是加载失败。

有限分支内部计算：

```text
T = 当前详情 SELECT 的固定数据库时间
lowerBound = max(T - 24 hours, account.quota_reset_at)
used = count(generation_runs WHERE account_id = targetUserId
             AND quota_charged = true AND started_at >= lowerBound)
remaining = max(currentGroupLimit - used, 0)
```

- 按既有 DBA 契约保留 `>=`：恰好位于下界的记录仍计数，超过 24 小时后才自然退出；不改为日历日、客户端时区或自选时间段。
- 使用读取时的当前组上限，不使用某次运行保存的 `quota_limit_snapshot`。组策略降额可能使 used 大于 limit，此时返回 0 而非负值；增加上限不重置已有用量。
- limit 为 0 返回 limited/0；limit 为 SQL NULL 且确有合法组行时才返回 unlimited/null。LEFT JOIN 没找到学习者组行属于数据错误，不能误判不限。
- 统计已经提交且 `quota_charged=true` 的 active/valid/user_cancelled；成功后保存、废弃或删除批次不回退额度。退款后 `quota_charged=false` 的失败不计数。
- 访客承接可能影响 `credited_account_id` 与累计统计，但不把访客的滚动计费转移到账号；其他账号记录也不能计入。
- used 使用 PostgreSQL bigint / Go int64，先钳制再安全转换，不能沿用 `count(*)::integer` 对高用量作窄化；remaining 不超过当前 integer 组上限。
- 无限/管理员分支不需要扫描账号历史；不读取 active 状态、模型授权、凭据、正文或供应商，避免把生成配置故障变成用户详情故障。
- 这是一次读取快照，后续生成、退款、组策略变化和窗口推进可以改变下一次响应。没有实时订阅、自动轮询、恢复倒计时或额度保留承诺。

## 5. 查询、事务与失败处理

### 5.1 普通详情读取

由 admin 用例通过 app pool 执行**一条只读 SELECT**：账号、组策略、学习批次数和受限的额度聚合在同一查询快照中取得。使用相关子查询/LATERAL 等等价方式避免将批次和运行先 JOIN 后重复计数；限定目标账号与已批准部分索引谓词，不读取/传出事件行。

T 使用同一 SQL 的 `statement_timestamp()`，不能在多个 WHERE/聚合处反复调用会变化的 `clock_timestamp()`；查询参数只含服务端解析的目标 ID，不接受浏览器传入 limit/reset/time/used。该选择保持既有 READ COMMITTED 和计量不变量，不新增锁或隔离级别。

PostgreSQL 的普通 SELECT 在 READ COMMITTED 下使用语句快照，不同 SELECT 可以看见不同提交，因此这里不用“先读账号、再读组、再数额度”的多次无锁查询。[PostgreSQL 18 事务隔离](https://www.postgresql.org/docs/18/transaction-iso.html#XACT-READ-COMMITTED)

`statement_timestamp()` 在语句内稳定，`clock_timestamp()` 可在同一语句内变化；使用真实 `24 hours`，不换成跨夏令时可能不同的 `1 day`。[PostgreSQL 18 时间函数](https://www.postgresql.org/docs/18/functions-datetime.html#FUNCTIONS-DATETIME-CURRENT)

并发换组、退款或生成开始与 GET 重叠时，可以观察修改前或修改后的完整快照，不保证“发到浏览器时最新”，但不能混成新 plan_code + 旧组额度。并发删除前可返回授权快照，删除提交后新 GET 返回 404，不保留缓存。

### 5.2 换组返回

沿用 DBA T6 的账号锁和重置规则；具体实现需改为：

1. 开启短 READ COMMITTED 事务，以目标学习者账号为首个锁定对象，复核允许的 basic/pro/plus 目标。
2. 在该事务内更新 group_code 与 `quota_reset_at=clock_timestamp()`；不重写历史 run 快照、内容或累计事实。
3. 保持账号行锁，以**同一 tx** 调用上述详情投影查询，取得新方案与新重置基线对应的 `generation_quota`。锁、更新、读取是按序的独立 SQL 调用，避免数据修改 CTE 中读取旧行或 BEGIN 时间替代读取时间。
4. Commit 成功后才发送 `200 {data:{user,quota_reset:true},meta}`；查询失败回滚换组，不能保存新组却返回缺额度的半成功对象。

不是先提交再调用 pool.GetUser；同一目标的新生成必须等待账号锁，不能抢在本次返回快照读取之前占用新窗口。组配置本身并发更新时，以详情 SELECT 读到的完整组策略为准，不跨表拼凑多个读取时刻。

保持既有换组权限与请求语义，不增加单独“重置额度”按钮/端点。换组不是网络层可无脑重放的动作；提交结果不明或响应丢失时，先 GET 重新确认当前状态，不自动重发 PUT 再次重置。明确未提交且符合既有 40P01/40001 策略时才有限重试整个事务。

### 5.3 错误、超时与安全

- 管理端中间件先确认会话/角色：未登录 401 `authentication_required`，学习者 403 `forbidden`；鉴权失败不能先查目标是否存在。
- 管理员查看不存在/格式非法 ID 为 404 `not_found`；只读接口无需 CSRF，换组继续使用既有 Origin/CSRF 与严格请求校验。
- 依照现行 admin handler，数据库/投影失败返回 500 `internal_error` 的安全 Problem；此处补齐该响应记录，不发明 quota 专属错误或复用模型故障码。取消传播到数据库；连接已断开不再伪造成功响应。
- 合法零剩余仍是 200 limited/0，不返回 429；无限/不适用不掩盖实际数据库故障。失败不返回部分 `user`、旧缓存、默认 Unlimited 或客户端估算值。
- GET 不改变目标账号的 reset、计费、累计或内容；认证中间件已有会话续期行为不受影响。只使用 app pool，不读取 AI pool、密钥，也不允许目标用户身份替换当前管理员调用者。
- 保持 no-store。日志仅现有路由模板、request_id、结果类别和耗时，不写目标用户名/额度/事件/正文/令牌；不新建持久审计或高基数指标。

## 6. 实现与前端交接边界

| 责任 | 计划修改 |
| --- | --- |
| backend-ethan：查询与聚合 | `internal/admin/service.go` 的 GetUser/ChangeUserGroup；单条详情 SELECT 的共享 queryer 支持 pool/tx；按需把查询放入既有 SQL/sqlc 边界，不生成迁移 |
| backend-ethan：额度纯投影 | admin/entitlement 内部精简类型和纯函数，输入 role/current limit/used；不调用 Entitlement.Options，不复制供应商依赖 |
| backend-ethan：HTTP | `internal/httpapi/admin_handlers.go` 的 detail DTO/显式 mapper；GET、换组共用新增字段，summary mapper 保持不变 |
| backend-ethan：防旁路开销 | 批次列表/详情现用 GetUser 作存在性检查，应改为窄的存在/角色校验；不在这些路径、搜索逐行计算额度 |
| backend-ethan：测试 | admin 单测、PostgreSQL 集成、HTTP raw fixture/权限/负向测试；fixture 进入 v1.4 清单 |
| frontend-bob：后续设计同步 | 将 generation_quota 显式映射为应用 generationQuota 三分支；GET/换组 schema 一起更新；null 仅映射 not-applicable；零、无限、失败不混淆 |
| frontend-claire：批准后实施 | DTO → mapper → 用户状态 → presenter；当前页面 ViewModel 展示真实剩余，换组完成替换同一用户投影并使旧请求失效；不直接渲染原 DTO |

具体前端文件与视觉文案仍由已批准 [CR-029–032 方案](./frontend-cr029-cr032.md) 及 frontend-bob 的后续同步决定。本角色不改前端文件，也不借此新增额度独立加载卡片或交互。

## 7. 版本、部署与回滚

- API 文档修订为 v1.4，公开路径仍是 `/api/v1`。只扩展 API-103 的 AdminUserDetailDto（GET 详情与 PUT group.user）；API-004、搜索 summary、分页/cursor、批次、review、SSE 不变。
- 现行 frontend strict schema 会拒绝额外字段；新 schema 若要求该字段，也会拒绝旧后端。不能把 JSON 新增字段误称为对当前客户端兼容。
- 采用既有同一提交/锁定镜像的配套版本：隔离环境验证新 backend + 新 frontend（SSR 与浏览器），本地 UAT 也不得只替换一端；正式切换使用受控维护窗口，保持单 backend 副本。无需新环境变量或 Nginx 业务路径。
- 已打开的旧浏览器页面不会因新镜像发布自动升级。发布通知/现有重载流程必须让管理页面刷新后再继续；不能靠 schema 宽松兼容或伪造字段掩盖旧 bundle。
- 回滚需成对回到相容版本，至少仍支持 v1.3 的多 hint occurrence/匿名分组；回到不含额度的旧版本会重新打开 CR-033，不能视为最终验收版本。禁止新前端对旧后端降级为“不限”。
- 无新 schema/data migration，不重跑旧 0005/0006，不扩大数据库权限；不改 `deployment.md` 的其他已批准流程。若实现证实需要新索引或新数据列，先提交范围请求。

## 8. 可执行验收清单（尚未执行）

fixture 由后端开发提供完整 `{data,meta}` 原始 JSON，前端复用同一文件/摘要。此处定义测试输入与预期，不能将文档示例当运行结果。

| 编号 | 场景 | 预期 |
| --- | --- | --- |
| Q01 | 有限上限 5，当前窗口计费 3 | limited/2 |
| Q02 | 上限 5、计费 5；再测策略降为 2 但计费 5 | 两者 limited/0，不为负、不报 429 |
| Q03 | 上限 0；有/无历史 | limited/0 |
| Q04 | 上限 NULL，有/无历史；models/lengths/credential 未配置 | unlimited/null；读取不访问 AI，且不承诺可生成 |
| Q05 | 目标管理员；目标学习者的组行异常 | 前者 generation_quota=null；后者 500，不把 LEFT JOIN NULL 当不限 |
| Q06 | lowerBound 前、恰好相等、后一个微秒；跨 UTC/非 UTC、夏令时 | 保留 DBA 的 >=，24 小时口径一致；测试固定内部时刻，不提供公网时钟参数 |
| Q07 | active、valid、user_cancelled；各种已退款失败 | 前三按 charged 计数，退款不计；预检无 run 不计 |
| Q08 | 保存/废弃/删除批次、另一账号运行、访客 claim 归集 | 不按库量/credited_account_id 计滚动用量，不串主体 |
| Q09 | 换 basic/pro/plus，有旧运行和历史 | 新组/reset/剩余同快照，旧历史不回写；旧 active 在换组后结算仍不进入新窗口 |
| Q10 | 两个换组并发、换组与新生成、GET 与策略/退款/删除交错 | T6 账号锁顺序；GET 完整前/后快照；换组响应不混入他次组变更；删后新 GET 404 |
| Q11 | 详情查询失败、PUT 读投影失败、commit/网络结果不明、请求取消 | 无半成功默认额度；可确认失败回滚；未知提交先 GET 不自动 PUT |
| Q12 | visitor/learner/admin × 有效/缺失/非法 user ID | 先鉴权，401/403/404/200；零剩余可查看 |
| Q13 | 原始 DTO 三分支与非法 extra/缺字段/负数/小数/null/角色组合 | learner 不允许 quota=null；admin 只允许 null；unlimited 必须 remaining=null；strict schema 正负例通过 |
| Q14 | 响应/日志负向扫描与数据库前后快照 | 无事件、reset 时间、额度上限、密钥、正文等额外数据；GET 不改变目标业务状态 |
| Q15 | 单详情高历史量查询与无限/管理员；批次/搜索请求 | 使用既有 account quota 索引，无全库/N+1/AI 访问；记录代表性 EXPLAIN，不凭无数据规模新增索引 |
| Q16 | 新旧 backend/frontend 组合、用户换组后旧 GET 迟到 | v1.4 配套两端正常；不兼容组合明确失败而非错误不限；旧请求不能覆盖换组结果 |

每个 fixture 至少包含两个不同账号防串数据。API-004 与新投影在同一静止数据/固定时刻对 limited remaining 做一致性对照；不要求分开请求在并发变化或窗口边界时永远相等。回归保留用户搜索三元分页、group code 映射、密码重置、只读批次、多位置提示与复习匿名分组。

## 9. 交付状态

本设计补齐了 CR-033 的契约草案、查询/事务与验证责任，不关闭 CR。未进行数据库查询计划/并发运行测试，没有独立 QA 或 UAT 通过声明。

无新增未决产品/UI/数据库选择；待用户批准具体技术方案。批准后建议由守门器在 technical-design 内激活 frontend-bob，只同步 v1.4 字段/错误/fixture 与发布组合，再提交技术阶段后续门禁；本角色不自动切换。
