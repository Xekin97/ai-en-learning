> 当前CR029模型配置与协议以 [通用模型契约](model-connections.md) 为准，替代本文旧OpenRouter全局部分，其余功能不变。

---
id: API-M002
version: M002-BE-04
status: awaiting_user_review
milestone: M002
role: backend-architect/base
agent_name: backend-alex
date: 2026-10-01
---

# M002 Markdown API 契约

本目录是二期 API 权威入口，继承一期能力及已批准 BE03/DB03。原 CR004 契约由 015 批准、016 完成前端接收；原实现/UAT 见 [060](../../reviews/verification-acceptance-060.md)。当前 BE04 按 [066](../../reviews/backend-cr027-entry-066.md) 接收 UI26/FE03 的 CR027，只补 [API004 搜索](generation-presets.md#api-004-search) 的 V/L/A 权限与既有只读边界；新稿待前端接收，不冒用旧批准。PRODUCT05 的 CR026 未决缓存范围不在本版。接口前缀仍为 `/api/v1`，不维护一期旧客户端兼容层，不生成 OpenAPI；HTTP 路径 v1 不恢复旧逐题判定协议。

## 1. 阅读与追踪

| API | 当前契约 | 页面 | 能力 |
|---|---|---|---|
| API-001/002/003/007/201 | [身份、资料、书架](identity-library.md) | PAGE-002/003/005/006/103/205/206 | CAP-001–005/010–016/021/104/107/209/220 |
| API-004/005/006/202 | [生成与预设](generation-presets.md) | PAGE-204/212/216/217 | CAP-006–011/206/208/216/218 |
| API-008 | [复习](review.md) | PAGE-007/008/201/202/203 | CAP-017–020/022/201–204/213 |
| API-203/204/205 | [成长、道具、消息](growth-benefits.md) | PAGE-207/214/215 | CAP-210–216 |
| API-101/102/103/206/207/208 | [后台配置与运营](administration.md) | PAGE-103/208/209/210/211/212 | CAP-101–107/205/210/217/218 |
| API-209/900 | [分析与运行状态](analytics.md) | PAGE-205/213/217/218 | CAP-207/219 |

全量逐项 CAP→用例→API→DATA 对应见 [backend.md §3](../backend.md#3-全量继承与用例追踪)。CAP-018/019 和 DATA-015 是替代索引，不恢复旧即时判对流程。

## 2. 公共传输与类型

- 同源 HTTPS；Nginx 转发 Go `/api`，Nuxt 提供页面。认证使用既有 HttpOnly/Secure/SameSite 会话 Cookie。生产保留 `__Host-ww_session`/访客 Cookie；本地开发沿既有例外。角色 `visitor | learner | admin` 由服务端解析。
- JSON snake_case；严格拒绝未知/重复字段、错误类型、尾随 JSON。所有对象下文未列字段不得擅自添加。`?` 表示可省略，`|null` 才允许 null；未标者必填、非 null。时间为 RFC3339，日期为 YYYY-MM-DD，ID 为不透明字符串。整数不允许小数、负数（明确有符号流水除外）。超出 JS 安全整数的 bigint 金额以十进制字符串传输，下文 `Amount` 统一为 `"0"` 形式，不混用 number。
- 公开计划 `visitor | basic | pro | plus`；账号基础计划不含 visitor。数据库 registered 映射 basic。不得以名字推断优先级或权益；后台只能维护四个既有计划，不能增删改名。
- `Locale=zh-CN|en-US`；`MeaningLanguage=zh|en|ja`；`Scenario=discussion|story|business|news`；`Length=short|medium|long|xlong`。平台支持集合未扩展；Brief 对应 short，Story 对应 story。
- 成功 JSON：`{"data":{...},"meta":{"request_id":"..."}}`。分页再有 `meta.next_cursor:string|null, has_more:bool`；has_more 等价于 cursor 非空。204 无 body/Content-Type。SSE 另按 API-005。
- 公共列表 `limit` 默认20、最大100，签名 keyset cursor 绑定接口、认证主体、规范化筛选与排序；非法 cursor 为422，客户端清空分页从第一页读取。游标不承诺数据快照。特定端点可另定搜索 limit。API-206 等级/同类成就配置按完整表格读取，是不接受 cursor/limit、无分页 meta 的明确例外；不是将所有业务列表取消分页。
- 私有、管理、生成、复习与权益接口 `Cache-Control:no-store`。不得将正文/答案/凭据/能力 token/幂等键写 URL、日志或分析。用户投影不含 owner_id、数据库键、原始供应商模型 ID、prompt 或费用；后台模型配置可见原始模型 ID，管理员预览用量可见费用，是明确授权的管理投影。
- 所有副作用（含登录注册、匿名分析提交）执行现有 Origin/CSRF 校验，`X-CSRF-Token`；签名 token 放专用 header。只读 POST（随机候选、使用效果预览、配置影响预览）也校验 CSRF。GET 不消耗卡或发奖励；个人成长 GET 可同步持久化已达成资格，不发放奖励。
- 前端不得展示后端 message 拼出的业务文案。错误 code 与结构化字段映射 UI22 文案；提交成功后才 toast。未知失败保持可修正输入，不能降级为成功或无限额度。

## 3. 错误、并发与幂等

Problem 使用 `application/problem+json`：`type,title,status,code,detail,request_id,field_errors:[{field,code}]`。detail 是安全摘要；错误分支只按契约可增加 `context`（公开状态/配置版本/冲突动作），不透出 SQL 或供应商正文。

| HTTP | code | 处理 |
|---|---|---|
| 400 | malformed_request | 修正格式，不自动重试 |
| 401 | authentication_required / invalid_credentials | 登录或显示统一凭据错误 |
| 403 | forbidden / csrf_failed | 拒绝；刷新 CSRF 后由用户重试意图 |
| 404 | not_found | 不存在、他人资源或已删除；不透露归属 |
| 409 | state_conflict / revision_conflict / idempotency_conflict / generation_in_progress | 重新读取状态；同键异参不可自动改键重发 |
| 410 | capability_expired | 生成/claim 按原丢失边界处理；复习可重新读取题面换短期 token |
| 422 | validation_failed | 字段级修正；权益业务拒绝见专题 code |
| 413 | payload_too_large | 传输保护拒绝；不截断或把整组保存拆成多笔 |
| 429 | quota_exhausted / rate_limited | 不启动上游；展示真实额度或稍后重试 |
| 500/503 | internal_error / temporarily_unavailable | 写结果未知先查领域状态，避免二次结算 |

其他业务 code 在对应专题中定义。鉴权先于读取目标；普通学习者访问管理端403，读取他人私有对象404。

`Idempotency-Key` 为客户端一次明确意图生成的 UUID，重试保持。用于兑换、补签、领奖、道具启用/退款、管理员补分；scope=认证主体+操作+稳定对象。服务端按 growth_settlements/卡/奖励事实判定唯一，不建通用响应仓库。指纹仅含非敏感类型化参数；同键异参409。交换与补分可以用新键再次合法操作，不设限购；领奖/用卡的对象唯一约束仍防不同键重复。已经成功的请求返回实际结算 receipt，不能按新价格重算；未成功的请求按重试时有效配置检查。

复习提交以 attempt_id 唯一，不持久化答案或答案 hash；重复仅返回最小完成回执。保存以 run、claim 消费以 claim、生成终态以 run CAS 唯一。配置编辑带 `expected_revision`（不透明字符串）比较后写；这是配置总 revision 的公开签名表示，不直接泄漏内部计数。批次标题/attempt 使用各自 revision。发生无关配置变化也可要求刷新，不隐式合并管理员修改。API-206 整组保存复用此机制，一次命令一个事务/一次总 revision；响应丢失后先读当前完整配置，不返回伪造的旧成功回执。其字段错误使用请求 JSON Pointer，数组索引绑定发出时的 changes，见专题。

管理基础计划重置不采用成长账本：请求带 `expected_base_revision`（由当前 base quota epoch/计划签名生成），成功把 epoch 加一；响应丢失先 GET 核对，再决定新的人工重置意图。旧 revision 永不再次重置。所有网络未知结果禁止无条件换幂等键重试。

## 4. 与一期的明确差异

1. 保留所有登录、语言、密码、注销、普通生成/取消/收录/claim、书架六项统计、精确词条搜索、日期及单批会话、凭据/模型/计划/用户管理入口。
2. `/me/review-attempts/{id}/actions` 移除（404）；以题面、整批提交、重来接口替代。前后移动/概览为本机状态，无逐题请求。清除旧2小时内存 attempt 过期即丢草稿的语义。
3. `/me/batches/{id}` 增加标题读写；提交前复习投影不返回标题。学习库仍按 saved_at 从旧到新、不增加标题搜索。
4. 生成选项返回一份生效计划、合并模型授权、计划/额外次数分别显示；可用性不由有模型等同有次数推断。base/trial 分别记账不在前端计算。
5. 管理模型新增正式移除；计划新增唯一优先级与影响预览；用户基础调整保留重置且只重置 base 来源。成长等级动态档位不等于增加基础计划。
6. 加入资料/欢迎、消息、成长/手动奖励、四类卡、固定配置预设与匿名分析。所有历史内容继续可读。

具体端点、DTO、空值与失败边界以专题为准，不能用原型 fixture 补齐缺失字段。前端建立 M002 配套类型/mocks，旧与新 API 不承诺混跑。

## 5. 已接收的 BE-03 差异（历史规则保留）

| 缺口 | 必须采用的契约 | 验证与示例 |
|---|---|---|
| FE2-G01 | API-206 AchievementConfig 的 description:OptionalBilingual 必填但可双空；API-203 description:string|null；名称/称号/说明分别投影 | BE2-V18；[静态示例](../evidence/M002-BE-03-contract-examples.json) 的 description_cases |
| FE2-G02 | API-206 settings 五值一个 PUT；levels/achievements 变化集 PUT；levels 先整组 preview 再带 token 确认；替代旧单项草案 | BE2-V19/20；同文件 settings、level_save、achievement_save、row_error、unknown_commit |
| FE2-G03 | API-202 AdminGenerationOptions 与 can_preview/reason；完整枚举、词表版本、可空 description；无计划/额度字段 | BE2-V21；同文件 admin_options_cases / admin_options_failure |

这些示例是类型和 mock 依据，不是业务种子或实际服务响应。FE2-G01–03 已由 FE02 / 016 接收关闭，不作为本轮待办。

## 6. BE04 / FE3-G01 接收差异

API004 的公共只读搜索明确包含管理员；路径、DTO、10/20候选限制、完整entry及词表版本保持。前端无需新接口即可完成后台 WordPicker；具体权限、失败与状态边界只在[专题](generation-presets.md#api-004-search)维护。后端定向修复 BE4-I01 整数收窄校验，验证 BE4-V01–03，见 [backend §1.5](../backend.md#cr027)。契约接收、实现修复和运行验证分别记录，不因文档澄清宣称 HTTP 已通过。
