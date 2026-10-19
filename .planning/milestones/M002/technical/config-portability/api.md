---
milestone: M002
stage: technical-design
role: backend-architect/base
agent_name: backend-alex
version: M002-BE-CR313-01
status: awaiting_user_review
date: 2026-10-15
---

# CR313 文件与 API 合同

本合同是 **PROPOSED 后端选择**；业务以[产品09-R1](../../product/config-portability.md#fields)、数据以已由127接收的[DB01](database.md)为准。[架构](backend.md)定义事务与秘密边界。首版仅Markdown，不生成OpenAPI。以下字段名是生产合同建议，设计原型 portState 不成为生产路由。

## API501-00 通用约定

基路径 `/api/v1/admin/config-portability`；类别仅 `models|plans|items|growth`。API-501 导出、API-502 预览、API-503 提交、API-504 判定结果、API-505 当前安全快照，覆盖 CAP-501～504 / DATA-501～506 / PAGE-501～504。全部要求当前有效管理员会话；复用 requireAdmin、requireSafeWrite 的同源 Origin/Referer、Sec-Fetch-Site、`X-CSRF-Token`，POST只接受 `application/json`。先鉴权再读文件/做KDF；配置锁后再次查账号角色/会话有效期，账号删除或撤权不得输出秘密/提交。无新角色或独立密钥权限。现cookie名及CSRF获取方式不变。

JSON成功外壳 `{ "data": ..., "meta": {"request_id":"req_..."} }`；错误沿现 `application/problem+json`，包含 type/title/status/code/detail/request_id/field_errors/context。所有响应 `Cache-Control: no-store`，下载也如此。时间为UTC RFC3339，学习日为 `YYYY-MM-DD`，业务日界限北京时间04:00。revision为现 `business.Revision(...,"configuration",n)` 不透明字符串，不能做数值加减；文件source revision仅说明来源。

`UUID`为非零标准小写连字符UUID字符串；计划身份固定 `visitor|basic|pro|plus`，basic仅内部映射registered。`Amount`为规范非负十进制字符串，`0`编码为`"0"`，范围0～9223372036854775807，不允许前导零、符号、小数或指数。其他整数为JSON整数，不收字符串、小数/指数；范围按下表。所有对象拒绝未知字段、重复键、非法UTF-8/孤立代理项/U+0000；整包最多32层，custom_parameters另限8层。必填先校验presence及null再解码；不能用Go struct零值或现单项编辑默认补字段。

**边界建议**：解码后文件字节≤8 MiB、加密明文≤5 MiB、POST原始JSON≤12 MiB；全类主要配置项总数≤10000、连接≤1000、每连接模型≤1000；引用集合累计≤50000。超出整次拒绝，不截断导出/替换；这些是传输资源上限，不是新业务数值上限。普通响应/预览安全JSON≤12 MiB；超限 `preview_too_large` 且无token，不能以截断预览取得确认。错误最多200条，`errors_truncated=true`时修复后重预览。不提供分页导出、分页预览或后台上传任务。读取超限前即停止分配。

## FILE501 文件 v1

### 非秘密可编辑 JSON

```json
{"format":"wordweave-config","version":1,"category":"plans","credential_mode":"none","source":{"exported_at":"2026-10-15T10:00:00Z","revision":"opaque"},"data":{"plans":[]}}
```

顶层format/version/category/credential_mode/data必填；source可省略，存在时exported_at/revision可省略或null，非空时分别为有效时间/≤256字符说明，不参与目标版本CAS。除source外无源时间、运行历史、数据库ID映射表、已发放标记、Key掩码。`data`恰为所选类别下节对象。普通JSON可离线编辑，重新上传后所有校验重做；来源文字不可信、不影响权限/身份。不得把源数据中的管理员名字/用户ID加入source。

普通模型包也可查看/编辑，但有任何连接则因缺少本包加密Key而拒绝导入；不接受在普通JSON手工添加明文api_key。错误 `credentials_required` 列连接身份并提示回源配置Key后重新加密导出。唯一无Key可导入模型情况是明确 `connections:[]` 的合法清空：没有需要Key的连接，且跨类依赖检查通过。此例外不是漏Key连接放行。

### 含Key加密包（仅models）

```json
{"format":"wordweave-config-encrypted","version":1,"category":"models","credential_mode":"encrypted","kdf":{"name":"argon2id","version":19,"memory_kib":65536,"iterations":3,"parallelism":4,"salt":"<base64url>"},"cipher":{"name":"AES-256-GCM","nonce":"<base64url>"},"ciphertext":"<base64url>"}
```

所有字段必填，严格白名单。salt是随机16字节，nonce随机12字节，ciphertext为密文后接16字节tag；所有base64url无`=`、必须规范编码。KDF参数只接受上例固定值，先检查再分配/计算，不能接受包指定任意CPU/内存。密文至少16字节，上限5 MiB+16。加密明文是完整FILE501内包（同format/version/category/source/data），其中credential_mode=`included`，每个connection额外必填api_key。`included`只允许出现在成功解密后的内包；外层普通包不能使用它。

AAD不是JSON重编码：固定UTF-8前缀 `wordweave/config-portability/v1\nmodels\nargon2id-v19-m65536-t3-p4\nAES-256-GCM\n` 后拼接16原始salt字节和12原始nonce字节。固定参数、类别、版本先严格校验，再验证tag；内外category/version必须一致。完整配置与Key一同加密，不留明文配置可篡改区域。口令为原样UTF-8，不trim、不作Unicode正规化，12～128 Unicode scalar、≤512字节、不得全空白或含U+0000；导出需二次确认完全一致。AES密钥=Argon2id输出32字节，随机源crypto/rand；每次导出新salt/nonce，不复用数据库信封、主密钥或已有Key作文件口令。

加密包不支持文本编辑密文、局部替换字段、解密下载或在浏览器展开Key；改变配置走原有管理→重新导出。导入服务端解密仅得到内部命令，浏览器永不收到解密内包。解密失败统一 `decryption_failed`（口令错误/认证失败不区分），不给部分字段错误或明文。成功解密不证明Key被provider接受，不做连接测试。参数来源及生命周期见[BE501-03](backend.md#be501-03)。

## FILE502 完整字段映射

下表“必”均不允许缺失/null，除明确注明。可选省略/null/空白不继承目标。条目数组无重复身份，必填集合不等于非空；只在明确列明时可空。后端只返回安全的配置身份和名称；客户端把字符串当文本显示。

### models / DATA-501

`data={connections:[...]}`，connections必填可空。每连接必有 `id:UUID, protocol:string, base_url:string, models:[]`；models必填可空。归属由嵌套父连接唯一确定，不再提供第二个可冲突的connection_id。

| 字段 | 规则 |
|---|---|
| connection.id | 必，可移植身份；目标同UUID且未退役则原位更新，新UUID则按该ID创建；退役连接不复活 |
| protocol / base_url | 必；openai_chat/openai_responses/anthropic_messages；URL≤2048字节，现HTTP(S)无userinfo/query/fragment，无首尾空白，不能以/chat/completions、/responses、/messages结尾 |
| connection.name | 可选string/null，trim后空按主机名生成；提供有效值≤200字符 |
| connection.api_key | 仅加密内包出现且必填；非空/非纯空白≤8192字节，无CR/LF/U+0000；拒绝已知mask形态（星号/圆点/省略号隐藏串）与占位文本“已配置”/“configured”；不trim或改写有效Key；禁用模型/空模型连接亦适用 |
| model.id | 必UUID；目标已有身份不可换连接，不复活retired模型；最终同连接provider_model_id与大小写折叠显示名分别唯一 |
| provider_model_id | 必string，1～500字符，无首尾空白；保留内部字符/大小写 |
| display_name / description | 均可选string/null；前者trim空按model标识前200字符生成，≤200；后者空清除，≤1000字符 |
| max_output_tokens | 可选integer/null，省略清除；有值1～1048576 |
| output_mode / enabled | 必，prompt/json_schema；bool。沿当前协议实现接受这两种模式；不得由默认值补齐 |
| custom_parameters | 必JSON对象，可`{}`；调用现CanonicalCustomParameters：规范化≤16384字节、深度≤8、安全整数与有限浮点、禁止受保护字段；不新增宽松路径 |

普通导出不含api_key、credential_configured、masked_hint。显示名重复等既有唯一规则同样校验，错误定位两项，不能通过生成名称后忽略冲突。

### plans / DATA-502

`data={plans:[...]}` 恰四项；所有字段必填。

| 字段 | 规则 |
|---|---|
| code | visitor/basic/pro/plus各一次；没有可写名称、目标ID |
| priority | integer 0～2147483647，四项唯一 |
| rolling_24h_limit | **必出现**；integer 0～2147483647或明确null=不限；0=无次数 |
| max_entries | integer 1～2147483647 |
| allowed_lengths | array，可空，无重复；short/medium/long/xlong |
| model_ids | UUID array，可空，无重复；精确目标当前模型，沿原计划允许disabled身份但无可用性则显示影响 |
| content_review_enabled / content_repair_limit | bool及integer；关闭false+0；visitor/basic只能此组合，pro/plus开启true+1～99 |

### items / DATA-503

`data={items:[...]}` 必填可空。每项id/kind/name/description/exchange_price/activation_ttl_seconds/listed/effect必填。

| 字段 | 规则 |
|---|---|
| id / kind | UUID；makeup/extra_credit/model_trial/plan_trial；目标同ID不可换kind |
| name / description | 双语对象，各自至少一个语言非空；分别每语言≤200/2000字符；键zh_CN/en_US可省略/null/空白，该语言清空、显示另一语言回退。**本导入适配器不能直接用要求两键出现的现Bilingual.UnmarshalJSON** |
| exchange_price | Amount，允许`"0"` |
| activation_ttl_seconds | 正JSON整数int64，按锁后目标时间验证截止小于9999-12-31T23:59:59Z；无额外业务天数上限 |
| listed | bool，false仍不改变库存/奖励规则 |
| effect | 必对象，必kind且必须等于条目kind；下列条件字段外拒绝未知或冲突非空字段，不保留旧值 |
| makeup effect | 仅`{kind:"makeup"}`；其他类型作用字段可省略或null表示不适用，非null拒绝 |
| extra_credit effect | extra_count必，integer 1～2147483647 |
| model_trial effect | model_ids必非空UUID数组无重复；trial_seconds必正整数且同TTL可表示性；retirement_points必Amount，可0 |
| plan_trial effect | target_plan_code必basic/pro/plus；trial_seconds同上 |

任一类型的其余已知作用字段仅可省略/null，非空值一律拒绝（包括不适用的0/空数组，避免隐藏错误）。模型引用允许目标该道具**原本就有**的退役引用维持；新建/重新加入退役引用拒绝。ever_issued/created_at/reference_count等不能导入。遗漏目标ever_issued=true（即使库存已用完/过期）或任意奖励引用道具整次阻止。

### growth / DATA-504

`data={mastery_experience,checkin:{current,pending?},levels:[],achievements:{checkin_streak:[],review_streak:[],mastered_words:[],saved_passages:[]}}`。

| 字段 | 规则 |
|---|---|
| mastery_experience | 必Amount |
| checkin.current | 必整组对象，base_points/step_points/cap_points/normal_experience均必Amount；cap≥base |
| checkin.pending | 可省略/null=无源待生效版本；存在则必须同上完整四值。无effective_day字段可写；source不携带运行起算时间 |
| levels | 必非空；level_number必integer 1～2147483647，从1连续；`source_id`可选UUID/null，仅来源说明，目标按level_number保留/恢复本地ID，不能用source_id覆盖本地ID |
| level.min_experience / reward_enabled / reward | 必Amount、bool、对象；门槛严格递增；初始等级0、false、无奖励 |
| reward.points | 等级/成就必Amount，关闭也必填 |
| reward.item_definition_id | 可选UUID/null；省略/null清空目标奖励引用 |
| reward.item_count | 有item时必integer 1～2147483647；无item时只可省略或0，null/正数拒绝 |
| achievements四集合 | 四键都必填array，可分别为空；每项id必UUID、kind必等于父集合；不同身份同kind+threshold按DB313-Q01整次拒绝（含退役目标），不按名/门槛合并 |
| threshold / enabled | 必integer 1～9007199254740991；同类最终阈值不重复；bool |
| name / title | 各自必双语对象且至少一语言非空，每语言≤200；语言缺省清空 |
| description | 可选双语对象/null，可双语皆空，每语言≤2000，缺省清空 |
| achievement.reward | 必对象；同等级reward，加必填experience:Amount |

奖励道具须目标存在且现规则可发放（模型卡至少含一个启用未退役模型；下架不等于奖励不可用）。完整文件验证关闭档位，不能因停用跳过。签到采用pending优先，否则current覆盖目标下一学习日意图；当天/历史不改，成长未激活时也不擅自激活。等级/成就同身份恢复沿已接收DB01，保留本地award；移出者退出活动规则并清奖励引用，不抹除达成/领取。

跨类别引用直接使用上述UUID/固定码，不需要用户填目标数据库ID。源文件可选 `references:[{kind,id,label?}]`（顶层，kind=model/item/plan；id为相应UUID/固定码、label≤200可省略），用于准确引用的安全说明，不能携带依赖业务字段；不参与匹配、不自动创建。导出为所有跨类引用给出此列表；手工省略不影响已在data中的精确引用校验。重复(kind,id)拒绝；references中未被data使用的条目拒绝，防止误称有额外隐式写入。

## API-501 分类导出

`POST /{category}/exports`。Body必 `{"include_credentials":false}`；true只可用于models，且必passphrase/passphrase_confirmation满足FILE501；false时口令字段必须省略。不接收分页、筛选、revision或模型子集。

200返回完整文件原始字节（不是success外壳）：`Content-Type: application/json`；Content-Disposition attachment，服务端固定安全名称 `wordweave-{category}-YYYYMMDDTHHMMSSZ.json` 或 `.wwcfg.json`；nosniff/no-store；不得把管理员输入、Key或口令放文件名。全部读/加密/序列化完成且大小通过才发送200，失败不给半份可用文件。若源环境本身缺少本类别必需配置（如无完整当前签到规则），返回422 source_configuration_incomplete，不生成不能表达完整范围的包。重复调用生成新的文件随机数，不写配置/revision/回执。含Key但源缺一条Key返回422 `credentials_required`，定位连接；普通导出不调用CredentialStore秘密读取。

## API-502 文件校验与预览

`POST /{category}/previews`。

```json
{"file_base64":"<标准base64含padding的原文件字节>","passphrase":"仅加密包必填"}
```

file_base64必；外层标准base64规范编码，不传文件路径/URL/文件名。普通文件必须省略passphrase。服务端先检查类别/版本/加密模式再解密、presence、字段、目标映射及依赖。JSON上传复用现中间件，避免multipart临时落盘。所有配置预览无写入，亦不写operation回执。

200 data字段：

| 字段 | 类型/含义 |
|---|---|
| category / schema_version | 枚举 / 1 |
| can_commit | bool，阻止依赖/历史时false |
| operation_id / preview_token | UUID/null、opaque string/null；只有可提交时服务端新建UUIDv4与签名token |
| baseline_revision | opaque目标配置revision |
| created_at / commit_not_after / retain_until | 时间；后两者阻止时null；成功预览5分钟提交窗口，结果窗口截止=提交截止+24小时 |
| counts | added/updated/removed/unchanged四个非负integer |
| changes | 完整Change数组，排序removed→added→updated→unchanged，各组kind/id固定序；确认页移出默认展开 |
| blockers | 完整DependencyBlock数组；无阻止为[] |
| effects | 下表安全影响对象 |
| warnings / defaults_applied | `{code,item_ref,field}`数组；不含原始秘密 |

`Change={action,kind,identity,label,fields,credential_action}`：action四枚举；kind为connection/model/plan/item/checkin/mastery/level/achievement；identity为UUID、计划码、`current-intent`、`mastery`或`level:数字`；label为安全显示文本；fields为`{field,before,after}`数组，field是FILE502相对JSON Pointer，值只允许该字段合法非秘密类型、删除/新增一侧null。禁止api_key、Key指纹、口令及密文出现在fields；模型连接credential_action为`replace_from_package`或`none`，其他为null。含Key提交每连接均标updated（即使非秘密字段相同），不把密钥相等性变成可查询信号。growth checkin按目标下一日意图对比；mastery独立计一项；计数按这些Change记录而不是用户数，前端不得混加表行数。source_id、references.label、source元数据变化不算配置差异。

`DependencyBlock={code,source_category,source_kind,source_identity,source_label,target:{kind,identity,label},field}`：身份仅配置对象，无用户列表；source_category可为plans/presets/items/growth或`target_history`；后者source_identity=null，说明道具发放历史存在，不能返回用户。包括missing_reference/active_reference/ever_issued/identity_conflict/reward_unavailable。拒绝时仍可返回已可靠计算的完整安全差异，但不给token。

`effects`固定键：`base_users`、`active_trial_users`、`model_card_instances`、`achieved_awards`、`claimed_awards`（非负整数，不适用为0）；`may_change_effective_plan`、`may_downgrade`（bool）；`usage_reset:false`、`trial_dates_changed:false`、`history_preserved:true`、`in_flight_policy:"accepted_snapshot"`；`checkin_source:"pending"|"current"|null`、`target_learning_day:date|null`、`checkin_effective_day:date|null`、`mastery_applies:"new_events"|null`。后台摘要涵盖身份和状态，不只散列这些公开计数。文件语法/必填/解密不合格返回400/422，不能返回貌似可应用的半预览。

## API-503 确认整类替换

`POST /{category}/imports`。Body必file_base64、preview_token、operation_id、`confirmed:true`，加密文件必passphrase；普通不得传。必须重传同一文件原字节，无后台保管文件。前端在发送前把 `{operation_id,category,preview_token,commit_not_after,retain_until}` 写入本会话sessionStorage恢复槽并标记dispatched，**不写文件/口令/解密配置**。没有token或confirmed=false返回422。

服务端核对actor/category/ID/文件与规范命令fingerprint；只有现签名票据定义ID，客户端不能自选另一ID。重复同ID同命令回原终态，不重复推进revision；同ID异命令409 operation_conflict。终态优先于预览到期/revision失效，因此成功后重复请求不能被误报未成功。UI提交后不自动重试POST；网络/5xx/中断均转unknown并使用API-504。

合法提交的业务终态200 data：

```json
{"operation_id":"<uuid>","category":"plans","status":"applied","reason_code":null,"baseline_revision":"opaque-before","result_revision":"opaque-after","current_revision":"opaque-now","superseded":false,"counts":{"added":0,"updated":1,"removed":0,"unchanged":3},"effective_day":null,"resolved_at":"2026-10-15T10:00:00Z","commit_not_after":"2026-10-15T10:05:00Z","retain_until":"2026-10-16T10:05:00Z"}
```

status仅applied/not_applied。applied的baseline是实际替换前版本，result是推进一次后版本；current在响应读取时的当前版本，`superseded=(current!=result)`，后续修改不抹去原成功事实。not_applied的baseline/result均为判定时当前版本，counts全0、effective_day=null；reason_code为preview_expired/revision_changed/impact_changed/dependency_changed/resolved_before_commit/transaction_rolled_back中的一个。预览变化不是HTTP成功业务应用，前端必须检查status。记录not_applied屏障commit成功后才可返回该终态；DB无法确认则503 outcome_unknown。

当前配置与回执同事务，只有COMMIT确定成功返回applied；所有校验在写前、延迟约束在提交前检查。失败保留全部历史和未选类别。成功刷新宿主页；若已superseded，用当前revision读新状态并说明之后已有变更。

## API-504 未知结果判定

`POST /{category}/operations/{operation_id}/resolve`，body必 `{"preview_token":"..."}`，不重传文件/口令。该接口会持锁写最小not_applied回执，故**不用GET**。权限、actor绑定和CSRF与提交相同；不存在的他人ID统一404，不泄露回执。

返回200同API-503终态；拿配置排他锁后读到applied就返回applied；无回执且票据合法、仍在结果窗口，则写not_applied后commit，封死同ID所有晚到提交。无回执不是未成功的证据，锁等待超时/DB不可达返回503 outcome_unknown + Retry-After:2。若提交/判定commit自身结果未知，同样重做本判定，唯一ID防重复。可以在5分钟提交期限后但24小时结果窗口内查询。

超过retain_until统一410 result_expired，不从缺回执推断未应用；晚到提交永久拒绝（基于签名截止，不能因清理旧行重新接受）。前端保留“记录已到期，无法确认本次结果”并提供API-505；不得显示not_applied/回滚。重新导入须新预览和管理员新确认，不作为自动恢复。token签名不可验证（如紧急签名key轮换）403 recovery_token_invalid，同样不假定未应用，读取当前配置；正常key轮换须等所有24h+5m票据排空。

## API-505 读取当前配置

`GET /{category}/current`，无body/query/分页；200外壳data `{category,revision,read_at,configuration}`。configuration按FILE502安全字段输出完整当前配置，models剔除api_key且不读密文；growth输出完整current/pending值和当前规则，不输出历史。供unknown页“读取当前配置”，只说明此刻状态，绝不据此推断某次operation成功。返回规模过大整次413，不提供残缺全量。

## API501-ERR 错误与取消恢复

| HTTP / code | 含义与客户端动作 |
|---|---|
| 400 malformed_request / invalid_json | 结构、base64、重复键、未知字段或非法Unicode；重新选择/修正文件，无配置写入 |
| 401 authentication_required / 403 forbidden / csrf_failed | 重新登录/取CSRF；保留非秘密恢复槽，不自动重发提交 |
| 403 recovery_token_invalid | 无法验证恢复票据，不宣称未执行；读取当前配置 |
| 404 not_found | 类别/操作无权限或不存在，不泄露他人信息 |
| 413 payload_too_large / preview_too_large | 完整性无法在资源界限保证，无可提交token；不能分批替换冒充整类 |
| 422 category_mismatch / unsupported_format / validation_failed | field_errors为JSON Pointer+稳定字段code；不自动改类别/补字段 |
| 422 credentials_required / decryption_failed | 重新加密导出/核对口令；绝无补Key/目标Key复用/禁用放行 |
| 409 operation_conflict | 同ID请求不一致；停止该提交，原operation仍用原token查结果 |
| 429 portability_busy | 单管理员每分钟10次KDF准入、进程最多2个KDF并发，Retry-After秒数；不形成任务队列 |
| 503 service_unavailable / outcome_unknown | 尚无确定终态；提交一旦发送，持续unknown并查结果 |
| 410 result_expired | 结果窗口到期，读当前配置；不能假定未应用或盲目重放 |

字段code含required/null_not_allowed/object_required/out_of_range/duplicate_id/duplicate_threshold/immutable_field/invalid_reference/protected_field/unsupported_character。problem.context只允许 `{category,items:[{identity,label,field,code}],errors_truncated}` 或 `{operation_id,outcome:"unknown"}`；不回显原值、自定义对象键中的任意秘密或SQL报错。无效identity用数组索引/安全占位定位。字段Pointer仅允许已知schema键及数组索引；custom_parameters未知键错误可定位到其容器，不回显攻击者把Key放入键名的内容。

预览前/确认前取消仅释放本地File、口令和token，不需要取消API。reading取消网络并不写配置。submitting禁止关闭与重复；浏览器强制离开/Abort不等于回滚。恢复后先判定原ID；applied刷新，not_applied允许重选文件重预览，unknown只查结果/读当前，expired只读当前并说明边界。sessionStorage支持刷新/当前tab恢复，关闭tab后不承诺自动恢复；禁止将文件/口令写localStorage/IndexedDB/URL/遥测。登出清秘密及恢复槽；没有原token时不得猜测结果，管理员可读取当前配置后发起新的明确操作。
