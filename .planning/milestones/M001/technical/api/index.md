---
milestone: M001
stage: technical-design
role: backend-architect/base
agent_name: backend-alex
status: awaiting_user_review
date: 2026-09-08
contract_version: v1.5
revision: CR-040
confirmed_scope: [CR040-NAMING]
decisions: [DEC-025, DEC-026, DEC-027, DEC-028, DEC-029, DEC-030, DEC-031, DEC-032, DEC-033, DEC-034, DEC-035]
---

# M001 HTTP API 契约

> v1.5 是 CR-040 的待审合同修订，范围依据 [101 产品批准](../../reviews/product-cr040-technical-revision-approval.md)和用户已同意的 [CR040-NAMING](../backend.md#cr040-scope-confirmation)。只替换释义键及语义，不新增路由、请求字段或旧格式兼容。DBA/前端尚待有限同步；文档更新不代表代码、存量数据或部署已完成。修订前原文见[技术快照](../archive/pre-cr040-design.json)。

## 1. 全局约定

### 1.1 传输与版本

- 产品 API 前缀为 `/api/v1`；健康检查不带该前缀。
- 同源 HTTPS 部署，不开放跨域 Cookie API；写操作检查 `Origin`/`Sec-Fetch-Site`。M001 由 Nginx、未来由等价 Ingress 把 `/api/v1/**` 直接路由到 Go，把页面与 `/_nuxt/**` 路由到 Nuxt；代理层不得改变本契约 path、body、Cookie 或 SSE event。
- 普通请求与响应使用 `application/json; charset=utf-8`。
- 流式生成使用一次 `POST` 建立 `text/event-stream; charset=utf-8` 响应。
- JSON 字段使用 `snake_case`，时间使用带时区的 RFC 3339，日期使用 `YYYY-MM-DD`。
- 请求对象必须拒绝未知字段、重复字段、类型强制转换、非有限数字和尾随 JSON。
- 内部数据库 ID 使用不可枚举随机标识；所有权仍须逐请求校验，随机 ID 不是授权机制。
- v1.2 依据 DEC-032 把提示位置从单数改为复数安全数组；v1.3 依据 DEC-035 为阶段二每个 passage blank 增加必填、题目级匿名 `group_key`。CR-021 补齐 API-103 的精确匹配置顶和三元 cursor 语义。v1.4 依据 CR-033 扩展 AdminUserDetailDto 的只读额度，公开路径仍为 `/api/v1`；CR-040 的 v1.5 将释义字段统一为 `entry_meaning`，后端、SSR 和客户端共同以当前 fixture 为真源。v1.5 只是本项目未发布阶段的合同标识，不增加版本协商，不提供旧字段支持。

### 1.2 认证、CSRF 与能力令牌

浏览器认证使用 `__Host-ww_session` HttpOnly Cookie。没有账号会话时，首次访问 bootstrap 或造文 API 可建立独立访客 Cookie。Cookie 属性为 `Secure; HttpOnly; SameSite=Lax; Path=/`，不设置 `Domain`。

除只读 bootstrap 和健康检查外，所有有副作用请求（包括登录与注册）均要求：

```http
X-CSRF-Token: <当前会话的 CSRF token>
```

生成草稿、访客承接和复习尝试另使用作用域能力令牌：

- `X-Generation-Token`：只允许操作一个当前生成或草稿；
- `X-Claim-Token`：只允许当前认证账号消费一个访客承接；
- `X-Review-Attempt-Token`：只允许提交一个当前批次的临时复习动作。

服务端只保存令牌摘要。令牌不可放入 URL、日志或分析事件。CSRF token 不是认证凭据，能力令牌也不能代替主体所有权检查。

### 1.3 通用成功封装

普通 JSON 成功响应采用：

```json
{
  "data": {},
  "meta": {
    "request_id": "req_..."
  }
}
```

除 `204 No Content`、SSE、健康检查和 Prometheus 文本外，**每一个**普通 JSON 成功响应都必须使用上述 `{data, meta}` 封装；本文后续若写“返回某投影”，均指把该投影放入 `data`，不存在裸成功对象例外。`data` 始终是对象，不以顶层数组替代。

删除、退出、改密、重置密码等不需要响应数据的成功操作使用 `204 No Content`，响应体必须为空且不附带 `Content-Type`。创建接口使用 `201`，语义幂等复用既有资源时可使用 `200`；两者的成功 DTO 必须完全相同。

所有 keyset 列表统一使用：

```json
{
  "data": {"items": []},
  "meta": {
    "request_id": "req_...",
    "next_cursor": null,
    "has_more": false
  }
}
```

- `next_cursor` 为 `string | null`，`has_more` 为 boolean；`has_more=false` 当且仅当 `next_cursor=null`。
- 空的第一页和最后一页均返回 `next_cursor=null, has_more=false`；非末页两者分别为非空字符串和 `true`。
- cursor 是带签名的不透明值，绑定当前 endpoint、主体、排序和筛选条件；切换筛选条件后不得复用，客户端不得解析或自行生成。
- `limit` 只决定本页最大条数，不进入响应；`items` 可以少于 `limit`。

### 1.4 稳定公共枚举与本地化

- 客户端可见方案统一使用 `plan_code: "basic" | "pro" | "plus" | null`。学习者必为前三者之一；访客和管理员为 `null`。
- 管理端固定组使用 `code: "visitor" | "basic" | "pro" | "plus"`。数据库内部的 `registered` 不进入 HTTP 契约。
- API 不返回方案显示名称，也不按 `ui_locale` 翻译方案。前端以稳定 code 在 presentation 层本地化为“基础版 / Pro / Plus”等文案，不得从显示字符串反推组别。
- `description`、`ui_locale`、时间和其他可空字段必须显式返回 `null`，不得用字段缺失表示空值；严格联合中不属于当前分支的字段则必须省略。

### 1.5 错误契约

开始流式响应前，错误使用 `application/problem+json`：

```json
{
  "type": "https://wordweave.example/problems/validation",
  "title": "Request could not be accepted",
  "status": 422,
  "code": "validation_failed",
  "detail": "One or more fields need attention.",
  "request_id": "req_...",
  "field_errors": [
    {"field": "username", "code": "invalid_format"}
  ]
}
```

`detail` 是可本地化的安全文案，客户端主要依赖稳定 `code`。认证失败统一使用 `invalid_credentials`，不得透露用户名是否存在。生产响应不包含 SQL、堆栈、供应商响应体、内部组 ID、原始模型 ID 或密钥状态细节。

常用状态：

| HTTP | 稳定 code | 含义 |
|---|---|---|
| 400 | `malformed_request` | JSON、枚举或协议格式非法 |
| 401 | `authentication_required` / `invalid_credentials` | 未登录或登录失败 |
| 403 | `forbidden` / `csrf_failed` | 角色、所有权或 CSRF 不满足 |
| 404 | `not_found` | 对象不存在或不属于当前主体 |
| 409 | `conflict` / `generation_in_progress` | 并发状态冲突 |
| 410 | `capability_expired` | 草稿、claim 或 attempt 已失效 |
| 422 | `validation_failed` | 字段规则不满足 |
| 429 | `quota_exhausted` / `rate_limited` | 组额度或防滥用限制 |
| 503 | `generation_unavailable` | 缺少凭证、可用模型或上游不可用 |

### 1.6 缓存与隐私

认证、生成、学习、复习和管理响应使用 `Cache-Control: no-store`。词表搜索与静态生成枚举可使用私有短缓存并带版本 ETag，但模型授权与额度投影不得被共享缓存。访客与学习者响应不返回 `owner_id`、角色权限位、内部组 ID、OpenRouter 模型 ID、供应商路由、成本或数据库版本；管理员只有 API-101 的模型管理成功 DTO 可以读取配置所必需的原始 OpenRouter 模型 ID。


<a id="cr040-entry-meaning"></a>
### 1.7 CR-040 原词释义字段

`entry_meaning` 是必填、非 null 的字符串，1–500 个 Unicode code point、无首尾空白，使用该批次的 `meaning_language`。新生成内容的语义严格遵循 [原词释义规则](../../product/ai-behavior.md#original-entry-meaning)；文章、场景、提示短语、派生映射不能决定其词义。界面语言切换不翻译或改写此内容。

| 返回位置 | 字段位置 / 不变边界 |
| --- | --- |
| API-005 `generation.validated` | `result.targets[].entry_meaning`；`passage.delta` 不携带释义。 |
| API-007 学习者批次详情 | `data.batch.targets[].entry_meaning`；列表/统计没有该字段，不因此新增。 |
| API-008 attempt 初始 item 与 action 返回的下一 item | spelling 分支的 `item.entry_meaning`；passage_cloze、完成结果不增加释义、原词或答案字段。 |
| API-103 管理员只读批次详情 | 复用 API-007 批次详情中的同一字段；用户列表和用户详情额度不变。 |
| API-006 保存/访客承接 | 外部请求和成功响应不变，只在内部将同一份释义持久化，不重新生成或计算。 |

当前投影精确替换旧键 `contextual_meaning`；不返回新旧双键、不设 alias/fallback、空字符串默认值或新旧协商参数。前端 strict schema 拒绝含旧键、缺少新键、双键、null 或类型不符的结果，通过既有协议错误状态处理，不渲染原始 DTO 或显示空释义。模型 Candidate/持久化快照的严格校验见 [AI 专项](../ai-integration.md)。

释义原字符串在生成、保存、学习查看、管理员查看和复习之间保持一致；不截分号、不附加用途提示。已有内容不因改名而被重新释义或伪装成 CR-040 合格样本；其字段/数据切换须由 DBA 先定案。新旧字段不同时服务。当前请求权限、CSRF、所有权、token、幂等、分页、CAS、计量和错误码全部不变；不引入在线语义判错/退款接口。

本次不设计跨旧镜像回滚或旧客户端支持；配套部署/数据保留界限见[后端发布边界](../backend.md#cr040-rollout)，实际执行需另行批准。

## 2. API-001 启动与界面语言

### GET `/api/v1/bootstrap`

建立或续用浏览器主体，并返回前端启动所需的最小投影。首次没有任何 Cookie 时可设置访客 Cookie。

响应 `200`：

```json
{
  "data": {
    "actor": {
      "kind": "visitor",
      "username": null,
      "role": null,
      "plan_code": null
    },
    "ui_locale": null,
    "supported_ui_locales": ["zh-CN", "en-US"],
    "csrf_token": "..."
  },
  "meta": {"request_id": "req_..."}
}
```

`actor` 是严格联合：`kind=visitor` 时其余三项均为 `null`；`kind=account` 时 `username` 非空、`role` 为 `learner | admin`，学习者的 `plan_code` 非空，管理员的 `plan_code=null`。`ui_locale=null` 表示访客应由浏览器本地偏好与 `Accept-Language` 决定，不会把访客语言存进数据库。认证账号返回账号偏好；账号偏好为空时，客户端提交当前有效语言至下述接口完成一次合并。`actor.role` 供路由跳转使用，不作为前端自行授权的依据。

### PUT `/api/v1/me/ui-locale`

仅认证账号。请求：

```json
{"ui_locale": "zh-CN"}
```

响应 `200`：

```json
{
  "data": {"ui_locale": "zh-CN"},
  "meta": {"request_id": "req_..."}
}
```

访客切换只写浏览器本地存储，不调用此接口。切换语言不得改变生成配置或当前复习 attempt。

## 3. API-002 注册、登录与退出

### POST `/api/v1/auth/register`

仅访客。请求：

```json
{
  "username": "reader_01",
  "password": "correct horse battery staple",
  "password_confirmation": "correct horse battery staple",
  "ui_locale": "zh-CN"
}
```

规则：用户名为 3–32 个 ASCII 字母、数字或下划线，忽略大小写唯一且注册后不可改；密码为 8–128 个字符。成功创建正式账号组学习者、轮换会话 Cookie，并返回 `201`：

```json
{
  "data": {
    "actor": {"kind": "account", "username": "reader_01", "role": "learner", "plan_code": "basic"},
    "ui_locale": "zh-CN",
    "csrf_token": "new-token"
  },
  "meta": {"request_id": "req_..."}
}
```

用户名占用使用 `409 username_unavailable`。API 不接收邮箱、手机、年龄、角色或组别。

### POST `/api/v1/auth/login`

请求：

```json
{"username": "reader_01", "password": "...", "browser_ui_locale": "en-US"}
```

成功轮换会话 Cookie，返回 `200` 和与注册相同的 actor 投影。账号已有语言偏好时响应账号值；为空时采用并保存 `browser_ui_locale`。管理员返回 `role=admin`，前端进入管理员区。失败统一为 `401 invalid_credentials`。

### POST `/api/v1/auth/logout`

认证账号请求，删除当前会话并清除会话 Cookie，响应 `204`。其他设备会话不受影响；浏览器本地界面语言由前端保留。

## 4. API-003 本人账号生命周期

### GET `/api/v1/me/account`

学习者响应 `200`：

```json
{
  "data": {
    "username": "reader_01",
    "plan_code": "basic",
    "ui_locale": "zh-CN"
  },
  "meta": {"request_id": "req_..."}
}
```

`username`、`plan_code`、`ui_locale` 均必填且非空；管理员账号设置在 M001 只提供退出，不调用学习者数据接口。

### PUT `/api/v1/me/password`

学习者请求：

```json
{
  "current_password": "...",
  "new_password": "...",
  "new_password_confirmation": "..."
}
```

成功保留当前会话、使其他账号会话失效并返回 `204`。当前密码错误使用通用字段错误，不返回凭据细节。

### DELETE `/api/v1/me/account`

学习者请求：

```json
{"current_password": "...", "confirmed": true}
```

成功永久级联删除账号数据、清除当前 Cookie 并返回 `204`。不提供撤销、导出或宽限期。`confirmed` 不是安全边界，但用于防止客户端误调用；密码复核才是本人确认。

## 5. API-004 词表与造文选项

### GET `/api/v1/vocabulary/search?q={prefix-or-term}&limit={n}`

访客和学习者可用。`q` 必须为 1–64 个字符，`limit` 默认 10、最大 20。响应只返回词表完整词条：

```json
{
  "data": {
    "items": [
      {"entry": "learn"},
      {"entry": "learner"}
    ],
    "vocabulary_version": "sha256:..."
  },
  "meta": {"request_id": "req_..."}
}
```

搜索忽略英文大小写，前缀结果可优先；生成时仍以服务端精确词条复核。接口不支持任意词的翻译或入库。

### GET `/api/v1/generation-options`

按当前访客/学习者组返回可选项和当前额度投影：

```json
{
  "data": {
    "models": [
      {"id": "mdl_...", "name": "Swift", "description": "Fast everyday generation"}
    ],
    "meaning_languages": ["zh", "en", "ja"],
    "scenarios": ["discussion", "story", "business", "news"],
    "lengths": ["short", "medium"],
    "max_entries": 5,
    "availability": {"can_generate": true, "reason": null},
    "quota": {"kind": "limited", "limit": 5, "remaining": 2, "window_hours": 24, "refreshes_at": "2026-08-30T09:15:00+08:00"}
  },
  "meta": {"request_id": "req_..."}
}
```

`quota` 是严格联合：

- 有限额度：`kind=limited`，`limit` 为大于等于 0 的整数，`remaining` 为 `0..limit`，`window_hours=24`。窗口内存在计费事件时，`refreshes_at` 返回最早恢复一次额度的 RFC 3339 时间；没有事件或 `limit=0` 时为 `null`。
- 无限额度：`kind=unlimited`，`limit=null`、`remaining=null`、`window_hours=24`、`refreshes_at=null`。
- `limit=0` 表示管理员配置为禁止生成，不会自然恢复；它不是“额度已用完”。

`availability.reason` 为严格枚举 `credential_missing | no_models | no_lengths | quota_disabled | quota_exhausted | generation_in_progress | null`；`can_generate=true` 当且仅当 `reason=null`。多个阻塞同时存在时按上述枚举顺序返回第一个，使服务端和客户端 Mock 得到同一结果。该字段只提供稳定原因，不泄露组别、密钥、供应商或内部配置。

接口不返回组别代码、原始模型 ID、供应商或各长度内部词数下限。`refreshes_at` 是滚动窗口预测时间，不代表固定日历重置。

## 6. API-005 流式生成与取消

### POST `/api/v1/generations/stream`

访客和学习者可用。请求对象仅允许：

```json
{
  "model_id": "mdl_...",
  "meaning_language": "zh",
  "scenario": "story",
  "length": "medium",
  "entries": ["learn", "weave"]
}
```

`entries` 保持用户选择顺序、不得重复，且每项必须精确存在于冻结词表。服务端验证模型和长度属于当前组、数量不超过组上限、当前主体没有活跃生成、有可用凭证且额度充足。`prompt`、`messages`、`temperature`、`max_tokens`、供应商参数或任何未知字段都会在调用 AI 前被拒绝。

预检失败返回普通 Problem JSON，且不建立 SSE、不占额度。预占成功后响应：

```http
Content-Type: text/event-stream; charset=utf-8
Cache-Control: no-store
X-Accel-Buffering: no
```

事件格式：

```text
event: generation.started
data: {"run_id":"gen_...","generation_token":"..."}

event: passage.delta
data: {"text":"Once upon "}

: heartbeat

event: generation.validated
data: {"run_id":"gen_...","result":{"passage":"Once upon a time, learning helped a team.","tags":["成长"],"targets":[{"entry":"learn","entry_meaning":"学习","hint_phrase":"learning through shared learning","hint_blanks":[{"start":0,"end":8},{"start":24,"end":32}],"occurrences":[{"surface":"learning","start":18,"end":26}]}]}}

```

所有位置为 Unicode code point 的 0-based 半开区间。每个 target 的 `hint_blanks` 与 `occurrences` 均为非空、按 `start,end` 升序且内部不重叠；`hint_blanks` 不含 surface。`generation.validated` 是唯一表示结果可保存的事件；标签属于整篇短文。服务端随后关闭流。

失败终态：

```text
event: generation.failed
data: {"code":"content_validation_failed","quota_refunded":true,"retryable":true,"request_id":"req_..."}

```

主动取消终态：

CR-041（[内部恢复规则](../backend.md#refund-recovery-041)）：失败事件的`quota_refunded`为必需boolean。true仅表示数据库已确认退还；false表示尚未确认，后端继续结算恢复，不表示改变系统失败应退款的政策。不新增前端可见状态或消息；同一code/retryable在两种值下保持相同失败呈现。前端传输schema同步接收boolean，不能把false当作非法事件。后台恢复不另发SSE，不要求前端轮询，不改变取消事件的false。取消/成功CAS已获胜则返回其对应既有终态，不能发送虚假“已退还”失败。

```text
event: generation.cancelled
data: {"quota_refunded":false}

```

SSE 不提供答案式内部校验细节、供应商事件、原始响应或成本。事件 `id` 仅用于当前连接诊断；服务端不实现 `Last-Event-ID` 回放。页面刷新、离开或网络断线使当前结果失效，系统失败返还额度。

### POST `/api/v1/generations/{run_id}/cancel`

请求需 CSRF 与 `X-Generation-Token`，body 为 `{}`。接口幂等地请求主动取消：

- 取消赢得终态：`200`，`data.status=cancelled, quota_refunded=false`；
- 已经有效完成：`200`，`data.status=valid, quota_refunded=false`；
- 已经系统失败：`200`，`data.status=failed, quota_refunded=true`；
- token、主体或运行不匹配：`404`，避免对象枚举。

前三种成功均使用：

```json
{
  "data": {"status": "cancelled", "quota_refunded": false},
  "meta": {"request_id": "req_..."}
}
```

`status` 是 `cancelled | valid | failed` 严格枚举；同一终态重复请求返回完全相同的 `data`。

只有该显式接口代表用户主动取消；客户端连接消失不得被解释为主动取消。

## 7. API-006 保存、放弃与访客承接

### POST `/api/v1/generations/{run_id}/save`

仅学习者，需 `X-Generation-Token`，body `{}`。仅可保存当前主体完整有效且未处置草稿。响应 `201`；网络重试返回同一个批次并可使用 `200`：

```json
{"data":{"batch_id":"bat_...","saved_at":"2026-08-29T10:30:00+08:00"},"meta":{"request_id":"req_..."}}
```

整批正文、标签、目标资源与出现位置原子写入；不得部分保存。

### POST `/api/v1/generations/{run_id}/discard`

访客或学习者，需 `X-Generation-Token`，body `{}`。删除临时草稿并返回 `204`。有效生成的计量事实保留；放弃后不能恢复。

### POST `/api/v1/generations/{run_id}/visitor-claim`

仅访客在点击“保存”时调用，需 `X-Generation-Token`，body `{}`。成功返回一次性原文 claim：

```json
{
  "data": {"claim_token": "...", "expires_at": "2026-08-29T11:00:00+08:00"},
  "meta": {"request_id": "req_..."}
}
```

浏览器只在当前页面内存保存 token；默认有效 30 分钟，刷新、关闭、离开或放弃时产品视为丢失。重复点击在同一页面需复用原 token，服务端不返回曾遗失的 token。

### POST `/api/v1/visitor-claims/consume`

仅刚完成登录或注册的学习者，需 `X-Claim-Token`、CSRF，body `{}`。原子创建当前账号批次并消费 claim：

```json
{"data":{"batch_id":"bat_...","claimed":true},"meta":{"request_id":"req_..."}}
```

重复提交同一已消费 token 返回同一批次，不重复增加统计。不得把结果绑定给 token 首次消费账号之外的账号。沿用访客生成内容与计量，不按登录后组重新校验，也不再次调用模型。

## 8. API-007 学习统计与学习库

以下接口仅学习者本人可用。

### GET `/api/v1/me/learning-summary`

返回实时派生的全量统计：

```json
{
  "data": {
    "generation_count": 18,
    "unique_learned_entries": 42,
    "participating_batches": 7,
    "paused_batches": 2,
    "successful_review_count": 11,
    "batches_ever_reviewed_successfully": 5
  },
  "meta": {"request_id": "req_..."}
}
```

不支持日期筛选；累计生成包含有效后保存/放弃、主动取消和后来删除批次对应的计量，不包含已退款失败。

### GET `/api/v1/me/batches?entry={exact_entry}&cursor={cursor}&limit={n}`

按 `saved_at,id` 从旧到新返回当前非删除批次。`limit` 默认 20、最大 100。`entry` 可省略；提供时必须是词表中的完整词条并只做精确词条搜索。

响应 `200`：

```json
{
  "data": {
    "items": [
      {
        "id": "bat_...",
        "saved_at": "2026-08-10T09:00:00+08:00",
        "passage_preview": "Once upon a time...",
        "tags": ["成长"],
        "entries": ["learn", "weave"],
        "model": {"name": "Swift"},
        "meaning_language": "zh",
        "scenario": "story",
        "length": "medium",
        "participates_in_range_review": true,
        "single_batch_review": {"action": "start", "session_id": null}
      }
    ]
  },
  "meta": {"request_id": "req_...", "next_cursor": "cur_...", "has_more": true}
}
```

`tags` 为 1–3 个短文级字符串，`entries` 按原输入顺序，`model.name` 为保存时快照。`passage_preview` 是从正文起始处按 Unicode code point 安全截取的非空纯文本，不含 HTML；它只用于列表，不能代替详情正文。

`single_batch_review` 是严格联合：`action=start` 时 `session_id=null`；`action=resume` 时 `session_id` 为非空 review session ID。完成后再次进入恢复为 `start`。除该字段外，其余字段命名为可复用的 `BatchSummaryDto`；管理员只读列表复用 `BatchSummaryDto`，不返回学习者操作字段 `single_batch_review`。

### GET `/api/v1/me/batches/{batch_id}`

响应 `200` 返回可复用的 `BatchDetailDto`：

```json
{
  "data": {
    "batch": {
      "id": "bat_...",
      "saved_at": "2026-08-10T09:00:00+08:00",
      "configuration": {
        "model": {"name": "Swift"},
        "meaning_language": "zh",
        "scenario": "story",
        "length": "medium"
      },
      "participates_in_range_review": true,
      "passage": "Once upon a time, learning helped a community weave ideas together.",
      "tags": ["成长", "协作"],
      "targets": [
        {
          "entry": "learn",
          "entry_meaning": "学习",
          "hint_phrase": "learning through shared learning",
          "hint_blanks": [
            {"start": 0, "end": 8},
            {"start": 24, "end": 32}
          ],
          "occurrences": [
            {"surface": "learning", "start": 18, "end": 26}
          ]
        }
      ],
      "review_summary": {
        "completed_count": 3,
        "successful_count": 2,
        "last_completed_at": "2026-08-28T12:00:00+08:00"
      }
    }
  },
  "meta": {"request_id": "req_..."}
}
```

- `meaning_language` 为 `zh | en | ja`，`scenario` 为 `discussion | story | business | news`，`length` 为 `short | medium | long | xlong`。
- `targets` 非空且按原输入顺序；`hint_blanks` 与 `occurrences` 对每个 target 均非空并按 `start,end` 升序，各数组内部不得重叠。
- `hint_blanks` 与 `occurrences` 的位置均为 Unicode code point 的 0-based 半开区间，必须在对应字符串内有效。`hint_blanks` 不返回 surface；客户端可用这些区间从只读提示短语构造展示高亮，但不能自行重算或持久化位置。
- `review_summary.completed_count`、`successful_count` 为大于等于 0 的整数且后者不大于前者；尚未完成过复习时 `last_completed_at=null`。
- 本 DTO 是学习者本人和管理员只读批次详情的唯一内容投影。接口不返回 owner、原始供应商模型 ID、prompt、成本、组内部代码或复习 attempt/答案。

### PATCH `/api/v1/me/batches/{batch_id}`

只允许：

```json
{"participates_in_range_review": false}
```

响应 `200`：

```json
{
  "data": {"batch_id": "bat_...", "participates_in_range_review": false},
  "meta": {"request_id": "req_..."}
}
```

该值只影响以后创建的日期范围会话；不阻止单批复习，也不改写已创建会话。相同布尔值重复提交返回相同 `data`。

### DELETE `/api/v1/me/batches/{batch_id}`

永久删除本人批次及目标、位置和关联复习结果，响应 `204`。生成计量不回退。请求必须来自确认对话框，但服务器仍以会话、CSRF 和所有权为安全边界。

## 9. API-008 复习范围、会话与作答

### GET `/api/v1/me/review-range/preview?start_date=2026-08-23&end_date=2026-08-29&timezone=Asia%2FHong_Kong`

起止日期均包含；`timezone` 必须是服务端时区数据库中的 IANA 名称。只统计当前勾选参与日期范围复习且 `saved_at` 落在本地日期范围的批次。

响应：

```json
{"data":{"batch_count":4,"entry_count":17,"empty":false},"meta":{"request_id":"req_..."}}
```

`batch_count`、`entry_count` 为大于等于 0 的整数；`empty=true` 当且仅当两者均为 0。preview 只描述当前输入范围，不负责返回或替换既有会话。

### GET `/api/v1/me/review-sessions/active-range`

供 PAGE-007 在 SSR、刷新或直接访问时发现当前唯一未完成日期范围会话；单批次会话永远不会出现在此接口。响应 `200`，没有未完成范围会话时显式返回 `session=null`：

```json
{
  "data": {"session": null},
  "meta": {"request_id": "req_..."}
}
```

存在时：

```json
{
  "data": {
    "session": {
      "session_id": "rev_...",
      "mode": "range",
      "status": "active",
      "date_range": {
        "start_date": "2026-08-23",
        "end_date": "2026-08-29",
        "timezone": "Asia/Hong_Kong"
      },
      "progress": {
        "completed_batches": 2,
        "total_batches": 4,
        "successful_batches": 1,
        "unsuccessful_batches": 1
      }
    }
  },
  "meta": {"request_id": "req_..."}
}
```

`completed_batches = successful_batches + unsuccessful_batches` 且不大于 `total_batches`。该接口不返回当前题目、批次正文、词条、答案或 attempt 信息。

### POST `/api/v1/me/review-sessions`

严格的互斥联合请求，不能混合字段：

```json
{"mode":"range","start_date":"2026-08-23","end_date":"2026-08-29","timezone":"Asia/Hong_Kong"}
```

或：

```json
{"mode":"single_batch","batch_id":"bat_..."}
```

日期范围模式若存在未完成的范围会话，返回该会话供恢复，不重新按新范围创建；用户在前端明确结束/完成现有会话后才可新建。单批模式对同一批次已有未完成会话时返回既有会话，否则创建新会话。响应 `201` 或复用时 `200`：

```json
{
  "data": {
    "session_id": "rev_...",
    "mode": "single_batch",
    "status": "active",
    "reused": false,
    "date_range": null,
    "progress": {
      "completed_batches": 0,
      "total_batches": 1,
      "successful_batches": 0,
      "unsuccessful_batches": 0
    },
    "current_batch": {
      "batch_id": "bat_...",
      "saved_at": "2026-08-10T09:00:00+08:00",
      "scenario": "story"
    }
  },
  "meta": {"request_id": "req_..."}
}
```

`mode` 为 `range | single_batch`。`mode=range` 时 `date_range` 必须为非空对象；`mode=single_batch` 时必须为 `null`。创建或复用结果必为 `status=active` 且 `current_batch` 非空。`reused=true` 表示返回数据库唯一约束决定的既有未完成会话。创建时，批次顺序和每批词条顺序均由服务端安全随机打乱并永久固定。学习库展示顺序仍为从旧到新，两者互不影响。

### GET `/api/v1/me/review-sessions/{session_id}`

响应 `200`：

```json
{
  "data": {
    "session": {
      "session_id": "rev_...",
      "mode": "range",
      "status": "active",
      "date_range": {
        "start_date": "2026-08-23",
        "end_date": "2026-08-29",
        "timezone": "Asia/Hong_Kong"
      },
      "progress": {
        "completed_batches": 2,
        "total_batches": 4,
        "successful_batches": 1,
        "unsuccessful_batches": 1
      },
      "current_batch": {
        "batch_id": "bat_...",
        "saved_at": "2026-08-10T09:00:00+08:00",
        "scenario": "story"
      },
      "summary": null
    }
  },
  "meta": {"request_id": "req_..."}
}
```

这是 `ReviewSessionDto`。严格规则：

- `mode=range` 时 `date_range` 非空；`mode=single_batch` 时为 `null`。
- `status=active` 时 `current_batch` 非空且 `summary=null`。
- `status=completed` 时 `current_batch=null`，`summary` 非空：`{"total_batches":4,"successful_batches":3,"unsuccessful_batches":1,"skipped_batches":1}`；四项均为非负整数，成功与未成功之和等于总数，`skipped_batches` 不大于未成功数。
- `current_batch` 只是安全显示投影；不得附带 passage、entries、targets、提示、出现位置或任何答案。

### POST `/api/v1/me/review-sessions/{session_id}/attempts`

为当前未完成批次开始或重新开始临时 attempt，body `{}`。页面刷新、中断或 attempt 闲置超过 2 小时后，旧 attempt 失效；再次调用从该批次阶段一第一题开始。已完成批次不会重做。

响应 `201`：

```json
{
  "data": {
    "attempt_id": "att_...",
    "attempt_token": "...",
    "item": {
      "stage": "spelling",
      "item_id": "itm_...",
      "entry_meaning": "学习",
      "hint": {
        "segments": [
          {"kind":"blank","length_hint":8},
          {"kind":"text","text":" through shared "},
          {"kind":"blank","length_hint":8}
        ]
      }
    },
    "progress": {"stage": "spelling", "item_number": 1, "items_in_stage": 2}
  },
  "meta": {"request_id": "req_..."}
}
```

`item` 是严格的 `ReviewItemDto` 联合：

- `stage=spelling`：必须且只能包含 `stage`、`item_id`、`entry_meaning`、`hint`。`hint.segments` 为非空数组；是否显示提示只由当前页面开关控制，API 不维护显示状态。
- spelling hint segment 只能是 `{"kind":"text","text":"..."}` 或 `{"kind":"blank","length_hint":8}`。text 非空且不含任一被挖文本；blank 至少一个，所有合法提示 occurrence 各对应一个 blank，且均不含 `text`、entry、surface、offset 或 answer。`length_hint` 使用固定布局值，不表示真实答案长度。
- `stage=passage_cloze`：必须且只能包含 `stage`、`item_id`、`passage_segments`。segment 只能是 `{"kind":"text","text":"..."}` 或 `{"kind":"blank","blank_id":"blank_...","group_key":"grp_..."}`；数组至少含一个 blank。
- `blank_id` 在当前 item 内唯一并只标识一个 occurrence；`group_key` 在当前 passage item 内标识同源等价关系，同一原始词条的所有相同/不同词形必须相同，不同原始词条必须不同。M001 的 `group_key` 格式为 `^grp_[A-Za-z0-9_-]{22}$`，来自 16 字节 CSPRNG；它不编码答案、答案长度、内部 target ID、选词顺序或正文组序，也不是授权 token。
- `group_key` 只存在于 passage blank segment；text segment 与 spelling blank 不得携带。它在当前 attempt 的 answer/retry 与语言切换期间保持，重新开始 attempt 时允许变化。客户端用它建立视图分组，不得将它放入 action body、URL、持久化存储、日志或分析事件。
- `progress.stage` 必须等于 `item.stage`，`item_number` 从 1 开始且不大于 `items_in_stage`。passage_cloze 在 M001 是单个整篇 item，因此两者均为 1。

提示开关由前端控制显示；API 可提供多处挖空的短语，但永远不提供被挖空文本。多个 blank 仍属于一个 spelling item，界面只有一个输入，action 也只提交一个 `answer` 字符串。服务端必须从已验证且有序的全部提示 span 构造 segments，不得按 surface 全局替换；`length_hint` 是固定布局提示，不是答案长度保证。

### POST `/api/v1/me/review-attempts/{attempt_id}/actions`

需 `X-Review-Attempt-Token`。每次交互带当前 attempt 内唯一 `action_id` 以安全重试。阶段一提交当前词条：

```json
{
  "action_id": "act_...",
  "item_id": "itm_...",
  "action": "answer",
  "answer": "learn"
}
```

阶段二的 `item` 是整篇短文，`passage_segments` 中每个空只含不可推导答案的 `blank_id`。检查时一次提交页面上的全部空：

```json
{
  "action_id": "act_...",
  "item_id": "itm_passage",
  "action": "answer",
  "answers": [
    {"blank_id": "blank_1", "answer": "learning"},
    {"blank_id": "blank_2", "answer": "weaves"}
  ]
}
```

两个阶段都可以跳过当前题/阶段：

```json
{"action_id":"act_...","item_id":"itm_...","action":"skip"}
```

比较规则为去除首尾空白并忽略英文大小写。答错时保持同一题；阶段二只额外返回错误 blank ID 供前端聚焦，不返回正确值。跳过会推进且不显示答案。阶段一全部推进后进入 `passage_cloze`，所有已记录目标 surface 均成为独立空。任何响应都不得包含原词答案、被挖空 surface、完整未挖空短语或完整未挖空短文。

action 成功响应以 `outcome` 组成严格联合；不同分支未列出的字段必须省略，不得用一组大量 nullable 字段代替。

答错并留在当前题，响应 `200`：

```json
{
  "data": {
    "outcome": "retry",
    "result": "incorrect",
    "item": {
      "stage": "passage_cloze",
      "item_id": "itm_passage",
      "passage_segments": [
        {"kind": "text", "text": "Once upon a time, "},
        {"kind": "blank", "blank_id": "blank_1", "group_key": "grp_k7m2..."},
        {"kind": "text", "text": " helped a team "},
        {"kind": "blank", "blank_id": "blank_2", "group_key": "grp_p4q8..."},
        {"kind": "text", "text": " ideas; later, they "},
        {"kind": "blank", "blank_id": "blank_3", "group_key": "grp_k7m2..."},
        {"kind": "text", "text": " again."}
      ]
    },
    "progress": {"stage": "passage_cloze", "item_number": 1, "items_in_stage": 1},
    "incorrect_blank_ids": ["blank_1"]
  },
  "meta": {"request_id": "req_..."}
}
```

示例中的 `blank_1` 与 `blank_3` 同源，`blank_2` 属于另一目标；随机 key 的字面值没有顺序或答案含义。spelling 答错时 `item.stage=spelling` 且 `incorrect_blank_ids=null`；passage_cloze 答错时该数组非空、只包含当前 item 的 blank ID。retry 返回的 passage item 必须复用首次下发的全部 `blank_id` 与 `group_key`，不得因判错重新生成分组。

答对或跳过后仍有下一题/下一阶段：

```json
{
  "data": {
    "outcome": "advanced",
    "result": "correct",
    "item": {
      "stage": "spelling",
      "item_id": "itm_next",
      "entry_meaning": "编织",
      "hint": {"segments": [{"kind":"text","text":"ideas "},{"kind":"blank","length_hint":6},{"kind":"text","text":" together"}]}
    },
    "progress": {"stage": "spelling", "item_number": 2, "items_in_stage": 2}
  },
  "meta": {"request_id": "req_..."}
}
```

`result` 为 `correct | skipped`。`item` 是推进后的下一题，因此可以从最后一个 spelling item 切换为 passage_cloze item。

当前批次完成但日期范围会话仍有下一批：

```json
{
  "data": {
    "outcome": "batch_completed",
    "batch_result": {"batch_id":"bat_...","successful":false,"error_count":1,"skip_count":1},
    "session_progress": {"completed_batches":2,"total_batches":4,"successful_batches":1,"unsuccessful_batches":1},
    "next_batch": {"batch_id":"bat_next","saved_at":"2026-08-11T09:00:00+08:00","scenario":"business"}
  },
  "meta": {"request_id": "req_..."}
}
```

最后一个批次完成：

```json
{
  "data": {
    "outcome": "session_completed",
    "batch_result": {"batch_id":"bat_...","successful":true,"error_count":0,"skip_count":0},
    "session_progress": {"completed_batches":4,"total_batches":4,"successful_batches":3,"unsuccessful_batches":1},
    "next_batch": null,
    "session_summary": {"total_batches":4,"successful_batches":3,"unsuccessful_batches":1,"skipped_batches":1}
  },
  "meta": {"request_id": "req_..."}
}
```

`batch_result.error_count`、`skip_count` 为非负整数；`successful=true` 必须 `skip_count=0`，但允许 `error_count>0` 后改正。批次完成时服务端在短事务内写入唯一结果。`action_id` 重复提交返回首次状态码和完整 DTO，不重复推进或计数。所有题目游标和正确答案只在服务端临时 attempt 状态中；客户端不能指定下一题或阶段。

## 10. API-101 OpenRouter 凭证与模型

以下接口仅管理员可用。

### GET `/api/v1/admin/openrouter-credential`

响应 `200`：

```json
{
  "data": {
    "configured": true,
    "masked_hint": "...9xK2",
    "updated_at": "2026-08-30T09:15:00+08:00"
  },
  "meta": {"request_id": "req_..."}
}
```

未配置时 `configured=false`、`masked_hint=null`、`updated_at=null`。绝不返回密钥原文或可复用密文。

### PUT `/api/v1/admin/openrouter-credential`

请求 `{ "api_key": "...", "confirmed": true }`。后端使用独立主密钥加密，做最小只读连通性验证后原子替换。响应 `200` 使用与 GET 相同的三字段 `data` 投影。空字符串不会被解释为删除；M001 不提供删除凭证接口，可通过替换失效密钥并在模型层禁用生成。

### GET `/api/v1/admin/models`

Query 为 `cursor` 与 `limit`；`limit` 默认 20、最大 100。按 `created_at,id` 从旧到新，响应 `200`：

```json
{
  "data": {
    "items": [
      {
        "id": "mdl_...",
        "display_name": "Swift",
        "description": "Fast everyday generation",
        "openrouter_model_id": "provider/model",
        "enabled": true,
        "assigned_group_codes": ["visitor", "basic"],
        "created_at": "2026-08-20T09:00:00+08:00",
        "updated_at": "2026-08-30T09:15:00+08:00"
      }
    ]
  },
  "meta": {"request_id":"req_...","next_cursor":null,"has_more":false}
}
```

这是 `AdminModelDto`。`description` 为 `string | null`；`assigned_group_codes` 去重并固定按 `visitor,basic,pro,plus` 排序。模型兼容性检查是 enable command 的前置行为：检查失败返回 Problem 且保持 `enabled=false`，M001 不另造无法由已批准数据库稳定保存的兼容性历史字段。

### POST `/api/v1/admin/models`

请求：

```json
{
  "display_name": "Swift",
  "description": "Fast everyday generation",
  "openrouter_model_id": "provider/model"
}
```

`description` 可省略或显式为 `null`。创建后默认禁用，响应 `201`：`data={"model": AdminModelDto}`，其 `enabled=false`、`assigned_group_codes=[]`。名称和模型 ID 均按数据库约束保证唯一性。

### PATCH `/api/v1/admin/models/{model_id}`

只接受 `display_name?: string`、`description?: string | null`、`openrouter_model_id?: string`，至少出现一项；省略表示保持不变，只有 description 允许显式 `null`。响应 `200` 为 `data={"model": AdminModelDto}`。变更 `openrouter_model_id` 时自动禁用；历史批次显示快照不受影响。

### POST `/api/v1/admin/models/{model_id}/enable`

body `{}`。同步执行最小真实结构化流兼容性检查；成功后启用，响应 `200` 为 `data={"model": AdminModelDto}` 且 `enabled=true`。缺少密钥、模型目录不声明结构化输出、样例流或校验失败时返回 `422 model_incompatible`，保持禁用且不返回成功 DTO。

### POST `/api/v1/admin/models/{model_id}/disable`

body `{}`。幂等停用新生成使用，响应 `200` 为 `data={"model": AdminModelDto}` 且 `enabled=false`；已经开始的生成按运行快照继续，历史批次保留。

## 11. API-102 固定组策略

### GET `/api/v1/admin/groups`

响应 `200`，固定顺序为 `visitor,basic,pro,plus`：

```json
{
  "data": {
    "items": [
      {
        "code": "basic",
        "rolling_24h_limit": 20,
        "max_entries": 5,
        "allowed_lengths": ["short", "medium", "long"],
        "models": [
          {"id": "mdl_...", "display_name": "Swift", "enabled": true}
        ]
      }
    ]
  },
  "meta": {"request_id": "req_..."}
}
```

`rolling_24h_limit` 为非负整数或 `null`；`allowed_lengths` 去重并按 `short,medium,long,xlong` 排序；`models` 按 `display_name,id` 排序且只含安全管理引用。组显示名称由前端根据稳定 `code` 本地化。M001 不支持增删或改名。

### PUT `/api/v1/admin/groups/{group_code}`

请求为完整替换：

```json
{
  "rolling_24h_limit": null,
  "max_entries": 5,
  "allowed_lengths": ["short", "medium", "long"],
  "model_ids": ["mdl_..."]
}
```

`rolling_24h_limit=null` 表示不限制，0 表示禁止生成，正整数表示限制。`max_entries` 必须为正整数，长度不可重复，模型必须存在；允许暂时配置为空模型集合或空长度集合，届时该组用户生成前得到配置错误。更新只影响新生成，运行中任务与历史快照不变。

成功响应 `200` 为 `data={"group": GroupAdminDto}`，其中投影结构与 GET `items[]` 完全相同；`model_ids` 即使顺序不同也按服务器稳定顺序投影。`group_code` 必须为 `visitor | basic | pro | plus`，其他值返回 404。

## 12. API-103 用户管理与只读学习内容

### GET `/api/v1/admin/users?username={query}&cursor={cursor}&limit={n}`

按用户名大小写不敏感搜索账号；服务端先 trim 查询并得到 `normalized_query=lower(query)`。`limit` 默认 20、最大 100。响应 `200`：

```json
{
  "data": {
    "items": [
      {
        "id": "usr_...",
        "username": "reader_01",
        "role": "learner",
        "plan_code": "basic",
        "status": "active",
        "created_at": "2026-08-10T09:00:00+08:00"
      }
    ]
  },
  "meta": {"request_id":"req_...","next_cursor":"cur_...","has_more":true}
}
```

`role=learner` 时 `plan_code` 必为 `basic | pro | plus`；`role=admin` 时为 `null`。M001 只有 `status=active`，保留该稳定字段用于界面状态而不推断未来停用能力。不可按学习内容、密码或密钥搜索。

排序与分页是 API-103 的服务端合同：

1. 非空查询下，`lower(username)=normalized_query` 的账号为 `match_tier=0`；其他包含匹配为 `match_tier=1`。空查询没有精确 tier。
2. 总顺序固定为 `(match_tier ASC, lower(username) ASC, id ASC)`，即精确匹配至多一项且始终置顶，其余账号忽略大小写升序。客户端不得按页重排。
3. `next_cursor` 仍是客户端不可解析的不透明字符串；其签名载荷由服务端内部保存 `version=2`、末项 `match_tier`、规范化用户名和 ID。下一页使用同一三元组的严格大于条件。
4. cursor scope 绑定 API-103、当前管理员主体、`version=2` 和 `normalized_query`。改变查询、跨管理员复用、篡改、字段缺失、tier 不为 0/1、用户名未规范化、ID 非法或旧二元 cursor 均返回 `422 validation_failed`，`field_errors=[{"field":"cursor","code":"invalid"}]`；不得将缺失 tier 默认为 0。
5. cursor 无快照语义。静态数据集逐页拼接不得重复或遗漏；分页期间新建/删除账号时，后续页反映读取时数据，新排序键位于已消费 cursor 之前的新账号不保证出现在本次遍历。用户名不可变，因此既有账号不会因更新跨页移动。

CR-021 不改变 `items[]` 字段、`meta` 结构、状态码成功分支或前端应用模型。旧 cursor 只存在于短期页面状态，收到上述 `cursor invalid` 后调用方应保留查询值、清除本地 cursor 和已有分页结果，并从第一页重新搜索；不得自动循环重试同一旧 cursor。

### GET `/api/v1/admin/users/{user_id}`

关联 PAGE-103 / CAP-104 / DATA-003/006/009。仅当前认证管理员可查看指定账号；沿用现有 user_id 格式，无请求体、无需 CSRF，不新增额度筛选 query。浏览器不得指定组、用量、额度上限、重置时间或读取时刻。

响应 `200`：

```json
{
  "data": {
    "user": {
      "id": "usr_...",
      "username": "reader_01",
      "role": "learner",
      "plan_code": "basic",
      "status": "active",
      "ui_locale": "zh-CN",
      "created_at": "2026-08-10T09:00:00+08:00",
      "learning_batch_count": 7,
      "generation_quota": {"kind": "limited", "remaining": 2}
    }
  },
  "meta": {"request_id": "req_..."}
}
```

`ui_locale` 为 `zh-CN | en-US | null`；初始管理员可能为 `null`。`learning_batch_count` 为非负整数。接口不返回密码哈希、会话、额度事件或私密能力 token。

#### AdminUserDetailDto 的 generation_quota（v1.4）

该字段始终存在，精确采用下表之一；额度对象仅有 `kind` 和 `remaining` 两个必填键：

| 目标用户 / 当前策略 | generation_quota | 字段规则 |
| --- | --- | --- |
| learner，有限额度 | `{"kind":"limited","remaining":2}` | remaining 为整数，0 ≤ remaining ≤ 当前组上限 |
| learner，无限额度 | `{"kind":"unlimited","remaining":null}` | remaining 必须显式为 null，不能为 0、-1 或字符串 |
| admin | `null` | 不适用；plan_code 仍为 null；不能解释成 Unlimited |

learner 不允许 generation_quota=null；admin 不允许返回额度对象。字段缺失、负数、小数、错误分支或多余属性均为契约不匹配，前端不得降级为“不限”。零上限与有限用尽都返回 limited/0：这里仅展示可用次数，不新增禁用原因提示。

计算与时效：

- 本次只读 SELECT 固定数据库时刻 T，读取同一快照的账号、当前组策略和计费事实。
- used 只数目标 account_id 且 quota_charged=true、started_at ≥ max(T−24 hours, quota_reset_at) 的运行；有限 remaining=max(当前组上限−used,0)。遵循现行 DBA 的包含下界规则，不改日历日或时区算法。
- active 暂占、成功和用户取消按计费标记计入；失败退款不计。保存/废弃/删除批次不回退额度；访客承接归入累计统计不增加账号滚动用量。
- 组上限调整立即影响下一读取；降低上限后用量超限仍返回 0。换组重置基线遵守下述 PUT 合同。管理员不计，只有合法组的 SQL NULL 上限才表示不限；组数据异常不是不限。
- 快照不是额度预留；读取后可能因时间、生成或退款变化。不会因无模型/凭据、正在生成或零剩余而禁止查看用户，且不返回 can_generate、limit、window_hours、refreshes_at、quota_reset_at、used、事件或供应商信息。

管理员详情示例（不适用分支）：

```json
{
  "data": {
    "user": {
      "id": "usr_admin_...",
      "username": "admin_01",
      "role": "admin",
      "plan_code": null,
      "status": "active",
      "ui_locale": null,
      "created_at": "2026-08-10T09:00:00+08:00",
      "learning_batch_count": 0,
      "generation_quota": null
    }
  },
  "meta": {"request_id": "req_..."}
}
```

GET 为业务只读、可安全重试的快照查询；重复读取不重置/消耗/返还额度，数值可以随数据变化。保留 Cache-Control: no-store，不新增共享缓存或后台轮询。普通详情查询不增加账号行锁。

| HTTP / code | 触发条件 | 调用方处理 |
| --- | --- | --- |
| 401 authentication_required | 无有效管理员账号会话/访客 | 清理私有状态，沿现有认证流程 |
| 403 forbidden | 已登录学习者访问管理接口 | 拒绝；不能尝试目标账号模拟身份 |
| 404 not_found | 管理员请求非法、不存在或已注销的账号 ID | 原有安全不可用状态 |
| 500 internal_error | 数据库/详情投影失败 | 现有安全失败状态，可重试 GET；不使用旧/默认额度 |

鉴权先于目标读取。失败只返回既有 Problem envelope，不返回部分 user；不会因目标 remaining=0 返回 429。`internal_error` 沿用当前管理 handler 的安全错误，不以生成配置或供应商错误代替。

### PUT `/api/v1/admin/users/{user_id}/group`

仅学习者可换至 `basic`、`pro` 或 `plus`：

```json
{"group_code":"pro","confirmed":true}
```

成功后滚动额度基线立即重置，历史累计生成与学习内容不变。管理员不能把用户改成管理员，也不能调整自己的角色。

响应 `200`：

```json
{
  "data": {
    "user": {
      "id": "usr_...",
      "username": "reader_01",
      "role": "learner",
      "plan_code": "pro",
      "status": "active",
      "ui_locale": "zh-CN",
      "created_at": "2026-08-10T09:00:00+08:00",
      "learning_batch_count": 7,
      "generation_quota": {"kind": "unlimited", "remaining": null}
    },
    "quota_reset": true
  },
  "meta": {"request_id": "req_..."}
}
```

`user` 复用 GET 详情的完整 `AdminUserDetailDto`；`quota_reset` 在成功分支恒为 `true`，使客户端不从时间或显示文案推断副作用。

上例假设目标 Pro 当前无限；若新组有限且上限为 N，事务内返回 limited/N（N=0 时为 0）。不能按 basic/pro/plus 名字固定推断额度，始终读取真实组策略。

v1.4 返回一致性：锁定目标学习者、更新组与 quota_reset_at、读取新的完整详情在同一短事务完成；详情读取与提交成功后才发送 200。使用同一事务对象读取，禁止提交后再用 pool 发独立 GetUser；查询失败回滚，不出现新组已写但额度字段缺失的半成功对象。T2 新生成复用账号锁，不能在本次更新到投影之间占用新窗口；响应仅代表该事务快照，不能承诺收包后额度未变。

请求、允许组、Origin/CSRF、严格校验与现有失败码不变；不新增额度写字段或独立重置端点。提交或网络结果不明时先 GET 对账，不自动重放 PUT 再次重置。明确回滚且满足原重试策略时才重试整个事务。

当前合同要求：CR-033 引入的 GET 和 PUT `user.generation_quota` 仍同时保留；CR-040 不改变其形状或计量。前后端遵循 v1.5 的配套合同，不承诺旧字段读取。搜索 AdminUserSummaryDto、cursor v2 与 API-004 不变，不提供 `/quota` 新路由；批次详情的释义字段按 §1.7 改名。

### PUT `/api/v1/admin/users/{user_id}/password`

```json
{"new_password":"...","new_password_confirmation":"...","confirmed":true}
```

成功直接设置新密码并删除目标账号全部现有会话，响应 `204`。不是临时密码，不提供原密码或下次强制改密标记。

### GET `/api/v1/admin/users/{user_id}/batches?cursor={cursor}&limit={n}`

按 `saved_at,id` 从旧到新，`limit` 默认 20、最大 100。响应使用全局分页封装，`data.items` 为 API-007 定义的 `BatchSummaryDto`，**不包含** `single_batch_review` 或任何学习者操作字段。

### GET `/api/v1/admin/users/{user_id}/batches/{batch_id}`

响应 `200` 完整复用 API-007 的 `{ "data": {"batch": BatchDetailDto}, "meta": ... }`，字段、可空性和 occurrence 规则完全相同。管理员接口不提供 PATCH、DELETE、保存、复习或冒充入口；详情可以显示短文与资源，但不显示账号认证、供应商密钥、成本、owner 或 learner action。

## 13. API-900 运行状态

### GET `/health/live`

进程事件循环可响应即返回 `200`；不探测数据库或 OpenRouter，避免依赖故障导致重启风暴。

### GET `/health/ready`

只有配置解析完成、词表快照校验通过、数据库可查询、迁移版本匹配且实例未进入停止流程时返回 `200`。OpenRouter 不作为全局 readiness 条件，否则上游波动会让登录和学习记录一并下线。

### GET `/internal/metrics`

只在内部监听地址或受平台鉴权的路径暴露 Prometheus 文本指标；Nginx 与未来 Ingress 都不得为该路径配置公网 upstream。指标标签不得包含用户名、词条、正文、run ID、批次 ID 或供应商错误原文。

## 14. 并发、幂等与生命周期摘要

| 操作 | 并发/幂等规则 |
|---|---|
| 注册 | 数据库大小写唯一约束决定唯一赢家 |
| 开始生成 | 每主体最多一个 active run；预检与额度占用串行化 |
| 取消/完成/失败 | 运行终态 CAS，只允许一个赢家 |
| 保存 | `generation_run_id` 唯一，重试返回同一批次 |
| 放弃 | 对既有 abandoned 状态幂等返回成功 |
| claim 消费 | token + 唯一约束，重复返回同一批次 |
| 换组 | 锁定账号并更新额度重置时间；运行中快照不变 |
| 创建复习会话 | 部分唯一约束避免重复 active 会话 |
| 复习 action | attempt 内 `action_id` 去重，重复返回首次投影 |
| 删除批次/注销 | 成功后重复访问使用 404，不伪造成功对象 |

临时生命周期默认值：生成草稿与 active visitor claim 为 30 分钟；已消费 claim 记录保留 24 小时供网络重试；review attempt 闲置 2 小时失效；访客身份在最后活动 30 天后可清理，但任何清理都不得早于滚动 24 小时额度窗口及安全时钟余量。

## 15. 契约验收

1. 每个 CAP 在 [backend.md](../backend.md) 中映射到本契约 API 和数据库 DATA。
2. 所有写接口对未知字段、CSRF、角色和对象所有权都有自动契约测试。
3. 流开始前错误是 Problem JSON；流开始后只有稳定 SSE 终态，代理缓冲被关闭。
4. 任何复习响应、错误或日志都不显示被挖空答案，跳过也不显示。
5. 学习库从旧到新；复习批次与词条顺序在创建时随机且固定。
6. 管理员能配置密钥、模型、组、用户组和密码，但不能修改或删除用户学习内容。
7. 访客生成可承接一次；刷新/关闭导致 token 丢失符合产品边界。
8. OpenRouter 原始协议仅存在于 AI 适配器，浏览器契约不会因未来新增模型平台而改变。
9. 所有普通 JSON success fixture 必须验证 `{data,meta}`，所有 keyset 列表必须验证 `next_cursor/has_more` 不变量；不允许 handler 临时返回裸对象。
10. API-001/003/004/005/007/008/101/102/103 的成功 DTO 以本文件 v1.5 为唯一真源，后端 contract fixture 与前端 raw DTO fixture 必须逐字段一致；本次只替换 §1.7 的释义字段，既有 API-103 详情额度不改。API-005/007 仍只允许 `hint_blanks`，不得出现旧 `hint_blank`。
11. 复习严格联合的每个分支都执行负向字段断言：不得出现 `source_entry`、surface、answer、完整未挖空短语/短文或任何可还原答案的扩展字段。
12. API-008 必须覆盖一个提示短语含一个或多个 blank segment 的 fixture；无论 blank 数量，spelling item 只有一个答案输入与一次 answer/skip action。
13. Nginx 与未来 Ingress 必须复用同一代理合同测试：`/api/v1`/`/health` 直达 Go，页面/asset 到 Nitro，`/internal/metrics` 不公开，POST SSE 不缓冲且断开能传播；代理切换不构成 API 版本变化。
14. API-008 阶段二 fixture 必须覆盖同词单次出现、多次相同词形、多次不同词形和多个目标交错：每个 blank 同时具有 `blank_id + group_key`，同源键相同、异源键不同；retry 键不变，新 attempt 可变；action 对额外 `group_key` 字段严格拒绝。
15. API-103 必须在同一静态 fixture 中构造精确账号、字典序更早的包含账号和至少三页结果，验证精确项第一、其余 `(lower(username),id)` 严格递增、跨页无重复/遗漏、`next_cursor/has_more` 不变量，以及大小写不同查询得到同一顺序。
16. API-103 的旧二元、跨查询、跨管理员、篡改、缺字段、非法 tier、非规范用户名和非法 ID cursor 均返回统一的 `422 cursor invalid`；测试和日志不得输出 cursor 载荷、用户名查询或签名材料。
17. CR-033 覆盖有限/用尽/零上限/无限/admin 不适用、24 小时及重置边界、active 暂占/失败退款、claim 不转移滚动计费、降额超用归零和无 AI 配置读取；GET 与 PUT user 的 generation_quota 均严格符合角色分支，响应不含事件明细或其他额度字段。
18. 换组与返回投影同事务，GET 同语句快照；覆盖换组/生成/退款/删除并发、读取失败回滚、提交结果不明后的 GET 对账、无授权不读目标、无 N+1/凭据依赖及当前前后端合同配套；CR-040 不重跑全部 CR-033 场景。完整固定场景见 [CR-033 验收清单](../backend-cr033.md)。

19. CR-040 定向检查所有 §1.7 投影只含 `entry_meaning`，spelling 下一题不能遗漏；保存/claim/read/review/admin 内容一致，旧键/双键不降级。结构与语言质量分别按 [C40 定向技术验收](../ai-integration.md#cr040-verification)记录，本轮不新增全站回归。
