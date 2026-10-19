---
id: API-303
version: M003-BE-07
status: awaiting_user_review
milestone: M003
---

# 管理计划内容服务

CAP-303、DATA-301、PAGE-208、AC-304/305/306/314；UIA-M003-304–306；全部admin-only，普通身份403。本文`Plan=visitor|basic|pro|plus`。路径省略 `/api/v1`；[M002 API-103](../../../M002/technical/api/administration.md) 未变字段/传输规则保留。所有配置写入与impact POST做原CSRF、严格字段预检；不调用模型、不扣额度。

## 完整读取与单计划修改

`GET /admin/groups` →200 `{items:Group[4],revision:string,native_correction_policy:NativePolicy}`，稳定顺序visitor/basic/pro/plus。Group完整字段：

```text
{code:visitor|basic|pro|plus,priority:int,rolling_24h_limit:int|null,max_entries:int,
 allowed_lengths:Length[],models:[{id:string,display_name:string,enabled:bool}],
 content_review_enabled:bool,content_repair_limit:int[0,99]}
```

基础校验恒包含；NativePolicy严格类型见API-301，由后端m003-native-policy-v1常量提供max_calls=2/scope=logical_request/ editable=false。管理页读此字段显示真实系统预算，不从fixture或计划N猜；无可写native_validation/native_correction_policy/max_calls字段，直调附加这些字段按未知字段拒绝。revision是原全局签名版本，不传内部数值。NULL quota=不限，0=禁计划次数；模型卡/extra例外沿原规则。

`POST /admin/groups/{code}/impact-preview` 与 `PUT /admin/groups/{code}` **同一完整请求类型**：

```json
{"expected_revision":"opaque-current","priority":20,"rolling_24h_limit":20,"max_entries":12,"allowed_lengths":["short","medium"],"model_ids":["model-id"],"content_review_enabled":false,"content_repair_limit":0}
```

新两字段必填且严格bool/整数非null；visitor/basic只false/0，pro/plus只false/0或true/整数1–99；Pro/Plus独立保存、初始均1；缺字段、true/0、false/非0、100、负数、小数均422 validation_failed，field_errors用JSON Pointer `/content_review_enabled`、`/content_repair_limit`。原max_entries≥1、priority≥0且全计划唯一、quota null或非负整数、有效model_ids、受支持length约束保持。未知计划404；重复priority为409 duplicate_priority。无模型/无长度/0 quota仍是警告可保存，不因服务开关改变约束。

impact 200完整data（在一个配置共享锁快照下产生）：

```text
{revision:string,base_users:int,active_trial_users:int,priority_changed:bool,
 may_change_effective_plan:bool,loses_all_models:bool,
 content_service_change:{before:{content_review_enabled:bool,content_repair_limit:int[0,99]},
 after:{content_review_enabled:bool,content_repair_limit:int[0,99]}},
 applies_to:"new_requests",in_flight_policy:"accepted_snapshot",
 usage_reset:false,trial_dates_changed:false,native_correction_policy:NativePolicy,
 warnings:("content_service_removed"|"no_models"|"no_lengths"|"zero_plan_quota"|"effective_plan_may_change")[]}
```

warnings去重，按上表枚举顺序输出。content_service_removed仅true→false；no_models按实际无启用且未移除的计划模型，no_lengths按空数组；zero_plan_quota仅limit=0；effective_plan_may_change取may_change_effective_plan。原base_users是此基础计划账号数，active_trial_users是有效目标试用人数，不承诺两者不重叠、不是精确“此次失去增强人数”；visitor人数仍按现有可统计主体口径，不编造人数。前端显示计划中文名来自code本地文案，before/after来自响应；关闭警告文案依design/copy.json，明确只影响新请求。优先级导致有效计划变更时提醒可能获得/失去增强，不用单计划开关猜每人结果。

PUT 200仍 `{group:Group,revision:string,native_correction_policy:NativePolicy}`。配置排他锁→校验expected_revision→再次完整校验→原计划/模型/长度及新字段一次事务→AdvanceConfiguration一次；成功后读新值。响应不假定客户端已经点过预览；直接API也完整校验，无新“预览凭据”存储。UI必须对当前本地草稿先impact再确认，预览后任何字段编辑即失效，发送PUT须与预览规范化body完全相同。取消修改不请求PUT。

## 冲突、异常与优先级批量

impact/PUT的409 revision_conflict沿Problem，`context={current_revision:string}`；不混合保存。前端保留本地未保存输入→GET读取服务端最新四计划→并排核对→用户保留本地修改后用最新revision重新impact→再次确认PUT。不能把current_revision自动塞进旧PUT重试。原body malformed=400、非法字段422、CSRF403、数据库暂不可用503/500；失败不抹本地输入。PUT响应丢失先GET重读；若值已匹配可以显示当前已保存配置，但不虚构原请求成功回执，不再次推进revision。

`POST /admin/groups/priority-impact`、`PUT /admin/groups/priorities`仍用 `{expected_revision:string,priorities:[{code:Plan,priority:int}]}` 恰好四行、唯一code/priority、int≥0。不得带内容字段；只改priority，不重置额度或试用时间。

priority-impact 200在原 `{affected_base_users:int,affected_trial_users:int,revision:string}` 增加：

```text
{content_service_by_plan:[{code:Plan,content_review_enabled:bool,content_repair_limit:int[0,99]}],
 may_change_content_service:bool,applies_to:"new_requests",in_flight_policy:"accepted_snapshot",
 usage_reset:false,trial_dates_changed:false,native_correction_policy:NativePolicy}
```

content_service_by_plan固定四行从同一配置快照读取；may_change_content_service用原已有基础/试用优先级前后胜出逻辑，检查是否存在赢家变化且两个计划服务配对不同的有效试用账号（EXISTS，非逐用户报表）。false不能推导“有效计划没变”；人数仍是现有受影响基础/试用计数，不是增强净增/净减。PUT成功仍 `{items:Group[4],revision,native_correction_policy:NativePolicy}`，含新字段；冲突和预览失效处理同单计划。

关闭成功后新GET generation-options及公开预设详情都从实时有效计划投影false/0，所有用户权益摘要同步显示不含增强；已有run的started快照不变。管理前端不得硬编码pro/plus永含增强。初始化只依DB3-02一次迁移，不在HTTP启动/读取中重seed。

数字0与关闭联动，1–99与开启联动；重新开启建议置1，用户可继续修改。预览before/after中的N按实际整数显示，不固定“最多1次”；基础策略总保持同一个只读NativePolicy。N=99只做配置保存/读取/边界验证，不触发99轮模拟；流程执行测试最多2轮，运行时按受理N及统一deadline控制。

BE05重发管理API，字段/校验/影响预览结构不变。增强开关的业务含义按PRODUCT07包含固定编辑/审稿/条件返修；N0关闭整个增强段，但共同规划继续。管理关闭提示不得再说“只生成一次调用”；普通正常2次、增强正常4次，业务仍一次。USER-M003-STREAM-FIRST去除用户生成页轮次呈现，不删除本页0–99配置、基础2次只读策略或后台统计。

BE05-R1仅随七份契约统一版本重发；本管理API结构、配置、预算与计费不变。规划持续显示的定向修订见API-302，后台预览同规则。

BE06容量为部署参数，不新增计划字段/管理页配置：原0–99、系统基础策略及impact保持；计划读取/保存不占生成槽。只有会调用模型的preview/探测使用容量Gate，规则见API-302/API-304与BE6-CAPACITY。

<a id="api-306"></a>
## API-306 每模型自定义请求参数（CR-306 / PRODUCT09）

CAP-306 / DATA-306 / PAGE-208 / AC-317–319、322；继承[M002服务商聚合](../../../M002/technical/api/model-connections.md)。本节是字段/校验唯一真源；USER-M003-CUSTOM-PARAMETERS取代未提交的推理模式/强度及目录方案。**不新增端点、能力目录、动态参数选项或平台支持性预校验。** 所有管理API仍admin-only、session/CSRF；公开用户不能写入此对象。

### DTO、读取与原子保存

`custom_parameters: JSON object` 是每模型必填、非null字段，初始/清空值`{}`。对象键和值由管理员按目标平台文档填写，合法范围内的扩展直接透传；不是限定reasoning的白名单。例：`{"reasoning":{"enabled":false}}`、`{"temperature":0.4,"top_p":0.9}`、`{"thinking":{"type":"disabled"}}`均可通过本地形状校验，但不保证任何平台接受或实际生效。

原AdminModelDTO增加custom_parameters，聚合GET、单项GET、列表和所有模型保存响应一致。原字段/封套/稳定UUID/排序/密钥遮罩不变。不增加capability/status/模式/effort字段，不在公开模型、生成选项或started RunSnapshot返回自定义对象。

| 既有路径（均省略/api/v1） | 增量位置 |
|---|---|
| GET /admin/model-providers；GET /admin/models、/admin/models/{id} | 每个AdminModelDTO.custom_parameters；完整读取已保存对象，不返回秘密连接数据 |
| POST /admin/model-providers；PATCH /admin/model-providers/{provider_id} | 每个models[i].custom_parameters必填；每模型独立，所有行、连接、凭据和revision原事务原子保存 |
| POST /admin/models；PATCH /admin/models/{id} | 完整ModelInput.custom_parameters必填，同一校验器 |
| POST /admin/models/batch | 每项NewModelInput.custom_parameters必填，共用校验/原子保存 |
| POST /admin/models/{id}/enable、/disable | body保持原expected_revision；enable校验库中对象，disable不因非法对象阻止停用；不发付费测试 |
| POST /admin/model-connection-test | ModelInput新增同一custom_parameters必填；测试冻结本次草稿，不保存；返回仍{ok:true} |

配套前后端升级后缺字段拒绝422，不在HTTP读取缺失时静默填{}；DBA未发布初始化默认{}不等于允许旧客户端漏字段。空编辑框是未完成JSON，不当作{}，UI可给明确“清空为{}”操作。取消不PUT/PATCH、不付费调用。保存只做本地解析/校验/配置CAS，**0模型调用、0目录网络请求**；保存成功文案只表示配置已保存。

语法/尺寸可在事务前校验；原配置排他锁内核对expected_revision→校验完整集合和当前绑定→保存配置/密钥→AdvanceConfiguration一次→读回→commit。一个模型不合法整组回滚，不先保存其他模型。连接/协议/模型ID变化不翻译或删参数，管理员负责按平台修订；参数合法但上游未支持也可保存。原409版本冲突保留本地草稿，按稳定ID重读/合并，再由管理员提交；响应丢失先GET核对，不盲目换revision重试。

### 严格JSON与边界

编辑器值在HTTP中是对象而非字符串。前后端都检查完整RFC8259 JSON、UTF-8、所有层级解码后的重复键、无尾随内容、无NaN/Infinity、字符串转义/代理配对合法；根必须object，子值可object/array/string/number/bool/null。保留原有严格HTTP解码，不能先`JSON.parse`/map decode覆盖重复键后才校验。FE保留原始编辑文本用于错误定位/失败恢复；提交前须用重复键感知解析器检查，后端仍为最终强制门。

规范紧凑UTF-8 JSON对象≤16,384字节（去无意义空白，不改变字符串内容），容器深度≤8，根object深度1，子object/array各+1；空{}深度1。这些是单模型本地配置上界，不是token/费用上限。原单项32KiB、batch256KiB、聚合2MiB HTTP总界保持，聚合大量对象超过总界413，不扩大以允许1000×16KiB。数字只接受有限IEEE754数值，整数须在±(2^53−1)内；后端在数字词法解析时拒绝越界而非先舍入，非整数按JSON双精度往返规范化。字符串/数字/键顺序格式可规范化，读取保持JSON值等价，不保留缩进。不得字符串拼接提供方body。

<a id="api306-compact-bytes"></a>
**两端一致的16KiB计量算法（实施owner澄清）**：本条落实上述“规范紧凑UTF-8”和既有有限双精度/安全整数规则，不改变16,384字节、深度或允许参数范围。先完成原严格解析与语义验证，再按以下规则序列化JSON值并计算UTF-8字节数；不是raw编辑文本、数据库内部大小或HTTP实际转义字节数。

1. 不输出token间空格、缩进、BOM或末尾换行；不裁剪字符串内部空白，不做Unicode NFC/NFD归一化。对象键顺序不影响计量，无须排序或引入完整JCS/签名体系；数组顺序保持。
2. 字符串和键均加双引号；双引号、反斜线分别编码为`\"`、`\\`；控制字符U+0008/0009/000A/000C/000D用`\b/\t/\n/\f/\r`，其余U+0001–001F用小写`\u00xx`（U+0000仍按原规则拒绝）。其他合法Unicode以原字符UTF-8编码，**`<`、`>`、`&`、`/`、U+2028/U+2029不另转义**；emoji用对应4字节UTF-8，不按两个UTF-16单元计。输入`\u003c`与直接`<`代表同字符，计量相同；字面反斜线字符串不误当Unicode转义。
3. 先基于原数字token的十进制系数/指数判断其**数学值**是否为整数，而非看有无`.`/`e`；若是整数，绝对值必须≤9007199254740991，超出即422 number_out_of_range，不先舍入。故`9007199254740992.0`、`9.007199254740992e15`同样拒绝。非整数依现合同转有限IEEE754 binary64；若归一结果成为整数，仍执行同一安全整数界，防止`9007199254740991.5`被存为超界整数后无法往返。普通小数沿现双精度规则，不要求十进制无限精度。
4. 数字序列化采用ECMAScript `JSON.stringify`的最短binary64往返表示：不保留`.0`、原指数拼写或无意义零，`-0`写`0`；例如`1.000e0→1`、`1e-6→0.000001`、`1e-7→1e-7`。布尔/null按JSON小写字面量。FE可在词法/语义验证后用`TextEncoder().encode(JSON.stringify(value)).byteLength`；BE须输出/计算同等表示，不能直接取Go默认`json.Marshal`长度，`SetEscapeHTML(false)`单独使用仍须处理其U+2028/U+2029转义差异。禁止用无上下文的全局替换破坏字面反斜线内容。

原语序列化参照[RFC8785 §3.2.1–3.2.2](https://www.rfc-editor.org/rfc/rfc8785.html#section-3.2.2)对ECMAScript行为的定义；这里只统一计量，不新增RFC的整体排序/散列要求。共享明确向量见[compact-byte-vectors.json](../fixtures/cr306/compact-byte-vectors.json)。提供方/HTTP为等值JSON做额外安全转义不改变本字段计量，实际HTTP总body限制仍独立执行。

**JSONB无损存储边界（CR306-DB owner澄清）**：所有层级解码后的对象键或字符串值包含U+0000（包括合法JSON转义`\u0000`）时，在入库/上游调用前拒绝422 `validation_failed`，field code=`unsupported_character`；不替换、删除或截断字符，不先交JSONB让它报数据库错误。字符串值错误指向该字段；键名本身含U+0000时指向最近可安全表达的父对象JSON Pointer，不在错误中回显非法键或值。错误保留本地编辑、整组0保存/0调用；其他合法Unicode与既有UTF-8、代理配对规则保持。字面反斜线加`u0000`（JSON写作`"\\u0000"`，解码后非NUL）不因此拒绝。

### 受保护字段与唯一合并规则

生成器先建立本任务的完整受控body，随后把已验证custom_parameters的**顶层不相交键**加入一个新对象；嵌套值原样复制，不深层合并、不改名、不自动包extra_body、不按平台翻译。任何顶层键已在受控body中存在，哪怕值相同也拒绝，不以“先/后覆盖”决定赢家。以下保留名单在保存、probe和受理检查，**即使当前协议/prompt模式未生成该键也禁止**，避免通过换协议/阶段绕过。

| 顶层保留键（跨三协议统一） | 原因 |
|---|---|
| model, models, route, router, provider, model_id, provider_model_id | 目标模型、路由与供应商策略由现配置/业务控制；不增加fallback或换模型 |
| messages, input, instructions, system, prompt, conversation, previous_response_id | 所有业务消息/历史和任务输入归服务端 |
| stream, stream_options, background, async, store, include | 流/异步/存储及额外响应内容归现协议，不能开后台/存储/私有推理输出 |
| response_format, text, output_format, output_config, schema, json_schema, structured_outputs | 业务输出schema、格式与strict不能被参数降级；即使output_mode=prompt也保留 |
| max_tokens, max_output_tokens, max_completion_tokens, max_new_tokens, output_mode | 现有最大输出token和结构化选项是唯一权威；冲突必须删JSON字段后改原控件 |
| tools, tool_choice, functions, function_call, parallel_tool_calls, plugins, n, best_of | 业务不执行工具/插件/多候选，不借扩展额外调用或修复输出 |
| extra_body, body, request, request_body, payload, query, extra_query | 禁包装层绕过保护或另造HTTP请求 |

以上匹配使用键名小写并去`_`/`-`的比较形式（如`maxOutputTokens`也命中），实际允许键保持原样发送，不替管理员纠正拼写。全树任何层级另禁`api_key, authorization, headers, extra_headers, base_url, api_base, endpoint, url, api_version, access_token, bearer_token, secret`及`__proto__, prototype, constructor`（同样归一匹配）；参数不能承载凭据、URL或HTTP头。错误只回字段路径/分类，不回提交值。未知其他扩展允许：例如reasoning.max_tokens是原生推理子预算、非总输出字段，可以透传；其关系/支持性由平台校验，服务端不自动提高原总输出上限。若新平台把受控业务能力藏进未知扩展，本轮不宣称通用沙箱；在接入测试发现时补受保护别名，不以HTTP200证明无副作用。此功能是受信任管理员配置，不向学习者开放任意provider body。

### 错误、权限与测试

| 错误码 / HTTP | 条件与客户端处理 |
|---|---|
| invalid_json / 400 | 外层或对象JSON语法/重复键/尾随非法；安全field_errors指custom_parameters区域及可定位path，保留原文，不送上游 |
| validation_failed / 422 | 必填、根非object/null、数值/深度/单对象大小非法或U+0000不能无损存储；field code为required/object_required/number_out_of_range/too_deep/too_large/unsupported_character |
| custom_parameter_conflict / 422 | 命中保留字段或与受控body相交；field code protected_field或controlled_field_conflict，JSON Pointer到具体键；相同值也冲突 |
| request_too_large / 413 | 既有HTTP总body上界，沿原Problem，保留本地编辑 |
| revision_conflict / 409 | context={current_revision:string}；沿原聚合核对，不自动覆盖 |
| model_request_rejected / 422（仅显式probe） | 上游HTTP400/422明确拒绝本次请求；context={upstream_status:400或422}；提示检查该平台参数及固定256token短测试限制，不假定具体字段有错，不回原始上游文本 |
| 既有model_connection_auth/protocol/unavailable/rate_limited | 其余probe按原身份/协议/网络/限流分类；明确不能证明参数效果，不静默移除再试 |

field_errors仍`{field:string,code:string}[]`；field采用JSON Pointer，例如`/models/0/custom_parameters/max_tokens`、`/custom_parameters/reasoning`，转义`~`/`/`。invalid_json发生在HTTP解码前无法可靠定位时指整个对象/空字段，不伪造行列。统一Problem封套沿API索引；无键值/上游错误正文/秘密。401/403优先鉴权，任何未授权配置不得进入provider。

probe仍一次≤30秒短流、输出上限256，0业务次数、共用容量Gate；用同份自定义对象及同一浅合并校验，所有协议完全相同规则。probe只短文本，不附完整业务schema，所以“流式连接测试通过”不证明输出结构或完整链路；reasoning budget高于probe额度可能遭上游拒绝，不为通过测试自动提高额度/删参数。改JSON/连接/token/output_mode后前端清本地本配置测试状态；旧结果标历史，不建新的服务端认证记录。参数实际被忽略仍可能返回OK，不能据此写“推理已关闭”。完整业务仍用现预设基础/增强预览及普通生成。

