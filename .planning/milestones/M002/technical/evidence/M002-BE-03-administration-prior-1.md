# 管理 API-101/102/103/206/207/208

全部路径 `/api/v1/admin`、仅认证管理员A，修改需CSRF。普通L403、访客401；不提供代学习/代领取/修改短文。八模块为概览、数据分析、模型管理、计划管理、用户管理、成长运营、首页预设、独立消息管理。概览/分析另见 [analytics](analytics.md)。配置修改统一expected_revision，冲突409保留表单，成功200回完整当前对象及新revision。除 API-206 等级/同类成就整表读取外，列表默认20最大100，公共规则见 [index](index.md)。

## 1. API-101 凭据与模型

`Credential={configured:bool,masked_hint:string|null,updated_at:Time|null}`。未配置后两值null，永不返回原文/可复用密文。

| Method / 路径 | 请求 | 成功 |
|---|---|---|
| GET /openrouter-credential | 无 | 200 `{credential:Credential,revision}` |
| PUT /openrouter-credential | `{api_key:string,confirmed:true,expected_revision}` | 200同GET，原有只读连通性验证后加密替换；空值不等于删除 |
| GET /models | cursor/limit，`status?:enabled\|disabled\|retired` | 200 `{items:AdminModel[],revision}`，created_at ASC,id ASC |
| POST /models | `{display_name,description?:string\|null,openrouter_model_id}` | 201 `{model:AdminModel,revision}`，默认disabled |
| PATCH /models/{id} | `{expected_revision,display_name?,description?:string\|null,openrouter_model_id?}` 至少一实际字段 | 200 `{model,revision}`；改provider ID自动disable |
| POST /models/{id}/enable | `{expected_revision}` | 200 `{model,revision}`；现有最小真实流兼容性探针通过才enable |
| POST /models/{id}/disable | `{expected_revision}` | 200 `{model,revision}`；只阻止新请求，非正式下架 |
| GET /models/{id}/removal-impact | 无 | 200 `RemovalImpact` |
| DELETE /models/{id} | `{expected_revision,confirmation_token,confirmed:true}` | 200 `{model,affected_groups:PlanCode[],revision}`；领域正式移除，不物理删历史身份 |

`AdminModel={id,display_name,description:string|null,openrouter_model_id,enabled:bool,retired_at:Time|null,assigned_group_codes:PlanCode[],created_at,updated_at}`；PlanCode含visitor，关联固定顺序visitor/basic/pro/plus。retired后不能编辑providerID或重新enable，422 model_retired；同供应商新建为新ID不恢复旧卡权限。enabled探针缺凭据/目录不支持/流校验失败422 model_incompatible，不把失败当成功；探针不计用户次数，不进学习分析。

`RemovalImpact={model:AdminModel,affected_groups:[{code,remaining_enabled_models:int}],affected_presets:int,affected_item_definitions:int,affected_owned_cards:int,confirmation_token,revision}`。不列个人身份/短文。token5分钟签名绑定模型、配置revision和受影响配置集合；库存数量为当时提示快照，不必因新库存变化永久阻塞下架。执行重读配置影响；集合改变409 impact_changed；确认成功清group_models、retired_at不可逆，保留历史快照并启动卡资格补判。无剩余计划模型也可确认，但结果明确0；有效模型卡可继续满足普通造文模型权限。新请求排除retired，在途按开始配置结算。

数据库名称/providerID的在用唯一性冲突409 model_conflict；描述null可清空，其他必填trim非空。兼容性网络探针必须在长事务外，最后短事务重新核验配置revision与模型状态再启用；过期结果不能覆盖管理员中途更改。

## 2. API-102 固定基础计划

`Group={code:PlanCode,priority:int,rolling_24h_limit:int|null,max_entries:int,allowed_lengths:Length[],models:[{id,display_name,enabled:bool}]}`。

- `GET /groups` →200 `{items:Group[],revision}`，四计划固定顺序。
- `POST /groups/{code}/impact-preview` body `{expected_revision,priority,rolling_24h_limit,max_entries,allowed_lengths,model_ids}` →200 `{base_users:int,active_trial_users:int,priority_changed:bool,may_change_effective_plan:bool,loses_all_models:bool,revision}`，只读估计，不能宣称数量锁定。
- `PUT /groups/{code}` body同preview →200 `{group:Group,revision}`。全替换，优先级唯一；rolling null无限、0无计划次数、正数有限；max_entries正整数（无额外产品上限）；模型必须现存非retired，可暂未启用；长度去重排序，空模型/长度允许但有警示。不增删改名。
- `POST /groups/priority-impact` body `{expected_revision,priorities:[{code,priority}]}` →200 `{affected_base_users:int,affected_trial_users:int,revision}`；完整四计划、不重复code/priority。
- `PUT /groups/priorities` 同body →200 `{items:Group[],revision}`；四档交换优先级同事务使用DB延迟唯一校验，避免用户无法交换两个值。未改其他权益。路由注册优先固定priorities于动态code。

改计划配置影响新请求且trial实时跟随；不重置任何用户base/trial已用，不修改卡期限。提高base/改优先级可能覆盖仍计时trial，同目标取base计量；不逐项拼最大值。invalid priority422 duplicate_priority；其他非法422validation。数据读取/写配置不执行AI、不处理生产样本。

## 3. API-103 用户管理完整继承

`UserSummary={id,username,role:"learner"|"admin",plan_code:Plan|null,status:"active",created_at}`，admin.plan_code=null。`GET /users?username=&cursor=&limit=` →200 `{items:UserSummary[]}`。trim/lower query；排序精确匹配tier0→其余包含tier1，再lower(username),id ASC。cursor沿v2绑定query、管理员和三排序键；空/非法/旧游标422，不能前端每页再排序。

`UserDetail`保留summary全部字段，加 `{ui_locale:Locale|null,nickname:string|null,gender:"male"|"female"|null,last_login_at:Time|null,last_learning_at:Time|null,learning_batch_count:int,generation_quota:{kind:"limited"|"unlimited",remaining:int|null}|null,growth:{level_number:int,points:Amount,experience:Amount,mastered_total:int,saved_total:int}|null,base_revision:string|null,effective_plan_code:Plan|null}`。

- L对象generation_quota始终非空；只显示生效计划可用次数，extra和trial分项通过下面benefits，不把extra混进limit；unlimited remaining=null，有限remaining≥0。admin quota/growth/base_revision/effective_plan全null，不当无限。
- `GET /users/{id}` →200 `{user:UserDetail}`，读取同一数据库快照，无额外扣额；不存在404、数据库失败500，不用0或Unlimited掩盖错误。
- `GET /users/{id}/benefits` →200 `{base_plan:{code,quota:PlanQuota},trial:{code,ends_at,quota:PlanQuota}|null,effective_origin:"base"|"trial",extra_quota:{remaining,earliest_expires_at}}`，仅目标L；为管理员准确解释调整影响，不提供代启用。base/trial quota分别按原来源用量投影。
- `PUT /users/{id}/group` body `{group_code:Plan,confirmed:true,expected_base_revision}` →200 `{user:UserDetail,quota_reset:true}`。同目标计划也代表一次明确人工重置；只把目标plan/base epoch+1和reset_at，trial/卡/奖励不动。事务内生成响应，提交后不再pool独立查询。stale revision409 base_plan_changed，先GET对账；重试不能再次重置。不改角色、不能把学习者变admin。
- `PUT /users/{id}/password` body `{new_password,new_password_confirmation,confirmed:true}` →204。密码8–128，直接设置并注销目标全部会话；无原密码/强制改密标记/通知发送。保留原管理目标限制，不接受role/group混入。
- `GET /users/{id}/batches?cursor=&limit=` →200 `{items:BatchSummary[]}`（[书架DTO](identity-library.md)，无single_batch_review操作字段），saved_at ASC,id ASC。
- `GET /users/{id}/batches/{batch_id}` →200 `{batch:BatchDetail}`，只读当前标题与完整资源，target必须属于此用户；没有PATCH/DELETE/复习代操作。
- `GET /users/{id}/points-ledger?cursor=&limit=` →200同个人流水，补发来源可含 `{admin_username:string|null}`（管理员注销后null），不显示秘密/学习内容。
- `POST /users/{id}/point-grants` body `{points:Amount,reason:string}`+Idempotency-Key →200 `{receipt:SettlementReceipt}`。points>0；reason为1–200字符管理说明，纯文本，不包含密码。只允许补发，无负数/撤回/直接设置余额接口；目标非L422，余额/账本同事务，不影响经验/等级。

<a id="api-206-growth-config"></a>

## 4. API-206 成长配置（BE-03 / CR-004）

范围 DATA-206–211，CAP-214/217，PAGE-210/214；接收 [DB-03 §6.3/6.4](../database.md#6-成长账本签到与手动奖励) 的 DB2-R10/11、DB2-T15/16。四类成就固定，成长档位动态；下列三个表单命令各对应 UI22 的一次保存，不跨页面合并，不由前端循环调用单档写接口。

### 类型与说明语言

`Bilingual={zh_CN:string|null,en_US:string|null}`，两个键必填；名称/称号至少一种非空。`OptionalBilingual` 键与类型相同，但两种均 null 合法。成就名称/称号每语言最多 200 Unicode code points，说明每语言最多 2000；超长整笔拒绝、不截断，均为纯文本，不解析 HTML/Markdown、不翻译。名字/称号 trim 后空归 null；说明仅纯空白归 null，其他原文保留。既有道具和通知约束仍见各自段落，不将可空说明规则泛化为名称可空。

`AchievementKind=checkin_streak|review_streak|mastered_words|saved_passages`。
`RewardInput={points:Amount,item_definition_id:string|null,item_count:int}`；item_definition_id=null 时 item_count=0，否则>0。每档仅一种可多份卡定义；成就再加 experience:Amount，不扩展为多种奖品数组。

```text
CheckinValues={base_points:Amount,step_points:Amount,cap_points:Amount,normal_experience:Amount}
CheckinRule={effective_day:Date,...CheckinValues}
GrowthSettings={learning_day:Date,mastery_experience:Amount,growth_started_at:Time|null,
 current:CheckinRule|null,pending:CheckinRule|null,revision:string}
GrowthSettingsInput={mastery_experience:Amount,...CheckinValues,expected_revision:string}

LevelInput={level_number:int,min_experience:Amount,reward_enabled:bool,reward:RewardInput}
LevelConfig={id:string,...LevelInput}
LevelChange={client_key:string,id:string|null,value:LevelInput}
LevelChanges={expected_revision:string,changes:LevelChange[]}
LevelConfiguration={items:LevelConfig[],revision:string}
LevelSave={...LevelChanges,confirmation_token:string,confirmed:true}
LevelImpact={may_downgrade:bool,affected_users:int,rewards_use_latest_config:true,
 confirmation_token:string,expires_at:Time,revision:string}
SavedRow={client_key:string,id:string}
LevelSaved={configuration:LevelConfiguration,saved_rows:SavedRow[]}

AchievementFields={threshold:int,enabled:bool,name:Bilingual,title:Bilingual,
 description:OptionalBilingual,reward:{...RewardInput,experience:Amount}}
AchievementInput={kind:AchievementKind,...AchievementFields}
AchievementConfig={id:string,...AchievementInput}
AchievementChange={client_key:string,id:string|null,value:AchievementFields}
AchievementChanges={kind:AchievementKind,expected_revision:string,changes:AchievementChange[]}
AchievementConfiguration={kind:AchievementKind,items:AchievementConfig[],revision:string}
AchievementSaved={configuration:AchievementConfiguration,saved_rows:SavedRow[]}
```

以上 `...Type` 为明确字段展开，不允许任意额外键。Amount 沿公共十进制字符串规则，范围 0..9223372036854775807；level_number/item_count 范围 1..2147483647（无卡时 item_count=0），threshold 范围 1..9007199254740991，均为 JSON 整数，不允许小数。名称映射 `name_zh/en`，称号映射 `title_zh/en`，说明映射 `description_zh/en`；description 对象不可省略或设整体 null，清空需显式传两个 null。管理 GET 保留实际两语言槽，禁止用回退值填充缺译槽后保存；个人投影见 API-203。

### 路径与一次保存

下表均为 A，写及只读 POST 需 CSRF；全局 expected_revision 比较规则见 index。签名 revision 不由前端递增或解码。

| Method / 路径 | 请求 | 成功 data |
|---|---|---|
| GET /growth/settings | 无 | 200 `GrowthSettings` |
| PUT /growth/settings | `GrowthSettingsInput` | 200 `GrowthSettings`，五值同一事务 |
| GET /growth/levels | 无 | 200 `LevelConfiguration`，全量，level_number ASC |
| POST /growth/levels/impact-preview | `LevelChanges` | 200 `LevelImpact`，同一最终集合的只读预览 |
| PUT /growth/levels | `LevelSave` | 200 `LevelSaved`，多档新增/修改一次提交 |
| GET /growth/achievements | `kind:AchievementKind` 必填 query | 200 `AchievementConfiguration`，该类全量，threshold ASC,id ASC |
| PUT /growth/achievements | `AchievementChanges` | 200 `AchievementSaved`，当前同类多档一次提交 |

这两份配置列表是公共分页规则的明确例外：**不接受 cursor/limit**，不返回分页 meta；按一种成就类型分组，当前设计已有完整表格，搜索在完整表格内筛选。无固定档数上限；后续若实测规模需要分页，另明确同 revision 续页契约，不能本期留下混版本页。空表返回 items=[]，服务端可在同一 changes 中新增初始等级和多个高档。transport body 超限返回 413 payload_too_large，绝不拆成多笔悄悄提交。

BE-02 草案的单项 `PUT /growth/checkin-rule`、`GET /growth/checkin-rule`、单档 `POST /growth/levels` / `PUT /growth/levels/{id}`、单档 `POST /growth/achievements` / `PUT /growth/achievements/{id}`不再作为 M002 契约提供，调用返回404；不是已上线接口兼容迁移。现有等级 impact-preview 路径保留，body 改为完整变化集；拒绝旧单档 body。没有硬删除等级/成就接口。

**签到五值**：cap>=base，积分/经验非负。读取优先展示 pending 供编辑，没有 pending 则用 current；未完成运营初始化时 current=null、growth_started_at=null 如实返回，不填原型种子。PUT 在配置排它锁内校验 revision，拿锁后一次确定 learning_day，同时写 mastery_experience 与 effective_day=learning_day+1 的 pending。mastery 提交后用于新的首次掌握，签到四值仍下一学习日生效；同未来日更新同一 pending，不改历史/已领经验/activated_at。任何一项失败五值均不变。成功返回当前和 pending，不冒充五值已经同时对今天生效。

**等级/成就变化集**：changes 非空；client_key 为客户端为本次编辑行生成的 UUID，整个请求唯一，重排/预览/确认保持同一值。已有行 id 非空且属于目标集合，新行 id=null，由服务端在提交事务生成 id。保存返回 saved_rows，恰好覆盖本次 changes，顺序与请求一致；随后以 configuration 全量结果更新表格并绑定新档 id。client_key 不入数据库/日志，不代替领域 id 或幂等键。

服务端读取全部现有配置后合并 changes，一次校验最终集合。未提交、搜索隐藏的行保留并参与校验；客户端不能按当前可见行全量覆盖。已有 level_number/kind 不可变，新增等级在原最高等级之后连续编号；合并结果从 1 开始连续，门槛随级数严格递增，最初门槛 0、reward_enabled=false、points="0"、item=null/count=0。成就 threshold>0 且同 kind 不重复，奖励非负；内容弹窗只改外层草稿，description/name/title 随门槛、启用与奖励一起提交。未知/重复 id、跨 kind、重复 client_key、无效引用整组拒绝。

使用同一个配置排它锁与最终集合校验；只更新原 id 行、插入新档，不删后重建、不重建个人 award。按 DB §6.4 仅延迟两处门槛 UNIQUE，写完恢复 IMMEDIATE 强制检查；合法 `[0,100,200]→[0,200,300]` 不因中间值撞旧门槛失败。全局 revision 每次接受的保存仅增加一次，同事务登记资格重算目标与游标，个人读取/领奖同步兜底。提交前生成完整返回投影，确认 COMMIT 后才回200。资格重算不持全局锁扫描所有用户，不自动发积分/经验/卡。

**等级确认**：点击表格保存，先用同一 LevelChanges 取得 impact-preview，再显示批准的确认弹窗。预览在一致配置快照中校验最终集合；affected_users 是预览时当前等级会改变的账户数，may_downgrade 表示其中存在降低，不承诺用户进度在确认前冻结。计算全用户影响时用只读一致快照，不能长持配置排它锁；响应前复核配置 revision，已变则409。返回5分钟签名 token，绑定管理员/会话、操作、expected_revision 及规范化后的完整 changes（包含 client_key、id、全部字段；按 client_key 稳定排序，不含确认字段）。保存需 confirmed=true 与 token；修改任一行必须重新预览确认。用户进度变化不单独使 token 失效，保存和之后个人判定仍用最新经验；预览不会保存草稿或发奖。

有效但商城未上架的卡可引用，失效奖品定位到该行 reward 字段；当前已领快照和已得称号不改，未领用最新配置，停用/降级仅按既有规则暂停资格。等级体验权益与成长等级完全分开。

### 失败、并发与确定重读

| HTTP / code | 触发与结构 | 客户端处理 |
|---|---|---|
| 400 malformed_request | 未知/重复字段、错类型、旧单档 body、非法 JSON | 保留表单，修正客户端请求，不自动重试 |
| 401/403 | 未登录/非管理员/CSRF，公共 Problem | 不读取或修改配置 |
| 409 revision_conflict | expected_revision 失效；`context={current_revision:string}`，只含当前配置版本 | GET 完整当前表单，保留本次草稿供对比；不得自动套新 revision 重发 |
| 409 impact_changed | 等级 token 与当前请求/管理员/会话不符，无额外 context | 重新预览确认，配置未写入 |
| 409 preview_stale | token 过期或无效，无额外 context | 重新预览确认，配置未写入 |
| 422 validation_failed | 全组字段/集合校验失败；field_errors 用请求 JSON Pointer，见下文 | 按本次提交数组及 client_key 定位行，全部保留供修正 |
| 413 payload_too_large | 超过传输防御限制，未写入 | 提示失败并保留草稿，不自动逐行拆单 |
| 500/503 internal_error/temporarily_unavailable | 内部失败，可能无法确定 COMMIT，公共 Problem | 重新 GET 完整配置及 revision 核对，不声称失败必已回滚 |

field_errors 的 field 从请求根开始，例如 `/changes/1/value/threshold`；数组索引指发送时的 changes，前端保存该次请求映射，不按当前筛选后的行号定位。设置页是 `/cap_points` 等。合法 JSON 的多处错误尽量一起返回；同一已有 id 重复在涉及行的 `/changes/i/id` 标 duplicate_id；跨类/未知 id 标 invalid_reference；duplicate_client_key、duplicate_threshold、non_increasing_threshold、immutable_field、out_of_range、too_long、required、reward_unavailable 均为字段 code，不需要新增顶层业务 code。最终集合与未提交行冲突时定位本次引入冲突的行；整组错误定位 `/changes`。合法 bool 但 confirmed!=true 定位 `/confirmed`、code=required；不将 token 原文写错误。

示例：一次提交第2行门槛与未修改档重复，Problem 顶层 code 为 validation_failed，`field_errors=[{field:"/changes/1/value/threshold",code:"duplicate_threshold"}]`；没有任何一行、说明或 revision 落库。两个管理员同版本保存至多一个成功。

这三个保存命令使用 expected_revision，不使用 Idempotency-Key，不建通用响应缓存。成功但响应丢失后，同 revision 重放被409拒绝，不重复新增档；重新 GET 只表示当前状态，不证明某次旧请求成功，也不能忽略别的管理员后续修改。已确认回滚可按原 revision 重试；未知结果必须先读。GET 用一个 SQL 语句快照或短配置共享锁获得整份投影，禁止拼接半份旧/新配置。

### 道具定义管理

`ItemInput={kind:ItemKind,name:Bilingual,description:Bilingual,exchange_price:Amount,activation_ttl_seconds:int,effect:EffectInput}`。

```text
EffectInput={kind:"makeup"}
 | {kind:"extra_credit",extra_count:int}
 | {kind:"model_trial",model_ids:string[],trial_seconds:int,retirement_points:Amount}
 | {kind:"plan_trial",target_plan_code:Plan,trial_seconds:int}
```

kind与effect.kind一致；有效期限/时长/次数>0，价格/下架积分≥0；模型集合非空去重存在，不能新引用正式retired模型；plan只能existing basic/pro/plus（能否被用户启用由当时优先级决定）。模型卡不接受extra_count；plan卡不接受模型/次数/词数。

`ItemConfig`=ItemInput加`{id,listed:bool,ever_issued:bool,reference_count:int,created_at,updated_at}`。

| Method / 路径 | 请求 | 成功 |
|---|---|---|
| GET /growth/items | `q?:string,kind?:ItemKind,listed?:bool,cursor,limit` | 200 `{items:ItemConfig[],revision}`，双语名称包含匹配，created_at DESC,id ASC |
| POST /growth/items | ItemInput，禁止listed字段 | 201 `{item:ItemConfig,revision}`，listed恒false |
| GET /growth/items/{id} | 无 | 200 `{item:ItemConfig,revision}` |
| PUT /growth/items/{id} | ItemInput+expected_revision | 200 `{item,revision}`，kind immutable，变化422 item_type_immutable |
| PUT /growth/items/{id}/listing | `{listed:bool,expected_revision}` | 200 `{item,revision}`；只变兑换状态 |
| GET /growth/items/{id}/references | cursor/limit | 200 `{ever_issued:bool,items:[{kind:"level"\|"achievement",id,name:string,enabled:bool}]}`；kind/id ASC |
| DELETE /growth/items/{id} | `{expected_revision,confirmed:true}` | 204，仅ever_issued=false且无引用，否则409 item_has_history/item_in_use |

已发作用/启用期限/模型集/时长不回写；retirement_points是立即生效例外。plan卡身份+时长快照，实际plan权益读最新。商城上下架不终止现有体验，也不阻止有效奖励发放。删除和发卡/奖励引用竞争由DB配置锁+FK+ever_issued保证，不能删掉“全部已过期”但有历史定义。

## 5. API-207 独立消息管理

`NoticeInput={title:Bilingual,body_markdown:Bilingual,visible:bool,remind:bool}`，至少一个语言完整title+body非空，按整套语言回退；body技术上限每语言64KiB UTF-8，title200 code points。后台原文仅A，存Markdown；用户安全HTML见API-205。独立双语标题沿 UI22，已接收获批 [DB-02 §4.3](../database.md#43-平台通知)，对应 [CR-003](../../changes/CR-003.md) / DB2-R09，不能从正文取首行代替。

title.zh_CN/en_US 分别映射 title_zh/en，body_markdown.zh_CN/en_US 分别映射 body_zh/en；标题按纯文本保存，Markdown 非空时保留原排版，空白字段归 null。至少一个同语言标题和正文完整，服务层先校验、数据库完整语言对 CHECK 兜底；另一语言仅填一个字段允许保存，用户端视为缺少该语言完整翻译。只有中标题+英正文、两语言均不完整或全空时422 validation_failed，字段提示定位 title/body_markdown 的缺项，不能交叉拼成完整对。前端保留输入供修正。

- `GET /notices?cursor=&limit=` →200 `{items:AdminNotice[],revision}`，published_at DESC,id ASC。
- `POST /notices` NoticeInput →201 `{notice:AdminNotice,revision}`。
- `GET /notices/{id}` →200 `{notice:AdminNotice,revision}`。
- `PUT /notices/{id}` NoticeInput+expected_revision →200同GET。开关可组合，visible=false即使remind=true也不对用户返回。
- `POST /notices/preview` `{body_markdown:string}` →200 `{body_html:string}`；与用户端同render/sanitize，预览不存/不发布。

`AdminNotice`=NoticeInput加`{id,published_at,updated_at}`。保存时在配置锁/revision 校验下将标题、正文和开关作为一份更新，冲突409 revision_conflict、任一验证失败均不部分保存；重复未知结果先 GET 核对再决定新的编辑意图。published_at由服务端创建时确定，编辑标题/正文/开关不伪造新发布排序。没有个人消息、已读关系、发送邮件，也不增加未批准的单独删除功能；隐藏满足停止显示。

验收 BE2-V12 / DB2-V19：中文完整、英文完整、双语完整均成功；另一语言不完整时原文可往返但用户投影整套回退；跨语言拼凑和空值拒绝；同时编辑冲突无半份更新。Markdown 预览只验证渲染，不保存标题或绕过整份 NoticeInput 校验。

## 6. API-208 热门预设管理

`PresetInput={title:string,configuration:{model_id,entries:string[],meaning_language,scenario,length}}`，无description/双标题。title trim非空≤200 code points，entries非空合法规范词去重，所有平台支持配置可选，无访客计划上限；配置中无prompt或provider字段。

`AdminPreset={id,draft_version:string,published_version:string|null,listed:bool,title:string,configuration:PresetConfiguration,draft_state:"needs_preview"|"preview_ready",has_unpublished_changes:bool,preview:{preview_run_id,completed_at,result:ValidatedResult,usage:UsageSummary}|null,published:{title,configuration,sample:ValidatedResult,version_created_at}|null}`；draft引用完整当前配置，published是线上独立快照；new draft不改变线上。PresetConfiguration和ValidatedResult见 [生成契约](generation-presets.md)。

| Method / 路径 | 请求 | 成功 |
|---|---|---|
| GET /presets | cursor/limit | 200 `{items:AdminPreset[],revision}`，updated_at DESC,id ASC |
| POST /presets | PresetInput | 201 `{preset:AdminPreset,revision}`，草稿/未上架 |
| GET /presets/{id} | 无 | 200 `{preset,revision}` |
| PUT /presets/{id} | PresetInput+expected_revision | 200 `{preset,revision}`，创建不可变新draft version |
| POST /presets/{id}/previews/stream | `{draft_version}` | API-202 preview SSE，无quota |
| POST /presets/{id}/publish | `{draft_version,expected_revision,confirmed:true}` | 200 `{preset,revision}`，完整成功preview匹配才切线上 |
| POST /presets/{id}/unpublish | `{expected_revision,confirmed:true}` | 200 `{preset,revision}`，listed=false，保留草稿/版本 |
| GET /preset-preview-usage | `start_date,end_date,cursor,limit` | 200 `{summary:UsageSummary,items:PreviewUsage[]}`，started_at DESC,id ASC |

preview cancel与/admin/generation-options见API-202；路由属于A。无预设物理删除入口（当前产品仅下架）；旧已开始run配置独立保留按生成生命周期清理，不因草稿GC失败。

`UsageSummary={logical_runs:int,provider_calls:int,input_tokens:int|null,output_tokens:int|null,cost:{amount:string,unit:"openrouter_credits"}|null,unknown_calls:int}`；金额十进制文本、明确供应商报告单位，未知null，不未经换算标美元。只要总和含未知，summary对应总值null，items保留已知各项，不用0补齐。`PreviewUsage={preview_run_id,preset_id:string|null,draft_version:string|null,status:"active"|"valid"|"failed"|"cancelled",started_at,completed_at:Time|null,usage:UsageSummary}`，单逻辑run的logical_runs=1。provider_calls包括同run内部纠正/续写，每call只能记一次。管理员预览不计用户生成篇数、转化或签到。

发布事务核验draft版本、preview有效/配置摘要一致和模型仍启用；标题-only可复用原preview，词条/model/语言/scene/length任一改动须重做，422 preview_required；失效引用422 preset_unavailable；版本变化409 revision_conflict。成功线上标题/完整样文/配置一起切换，失败原线上保持。保存草稿/预览成功均不会自动上线。

## 7. 管理验证

BE2-V01/07/09/10/12/13：模型完整CRUD中的正式移除、无模型计划、固定四计划全权益与优先级交换、用户搜索cursor v2/密码/只读库、base重置trial不动、正数补发幂等、动态第5档以上、类型字段注入拒绝、发过卡不可删、奖品引用竞争、隐藏提醒、发布前后原子一致、未知用量明确null。自动审批/阶段切换不属于这些管理API。

BE2-V18–20 / DB2-V20–23：说明空值/双语回退及纯文本往返；签到五值、同类多档全成全败；等级预览绑定整组；两管理员/领奖/配置变动与 COMMIT 不明；旧单档草案请求拒绝。以上均为后续实施验收，本次仅契约静态检查。
