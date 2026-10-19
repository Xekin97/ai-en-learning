---
milestone: M002
stage: technical-design
role: frontend-architect/base
agent_name: frontend-bob
version: M002-FE-CR313-01
status: awaiting_user_review
date: 2026-10-15
requested_model: gpt-6-astra
requested_effort: high
actual_model: unknown
scope: CR-313 / TECH-503
---

# CR313 前端技术设计

本稿完成 TECH-503 的前端设计接收并提交待审；**PROPOSED** 的模块、状态与验证选择尚非实现批准。四类别沿原管理台入口，浏览器仅上传原文件/口令，服务端校验与加密；提交后只依后端终态判断结果。原作者已补齐生产动态反馈与预览notice类型，见 FE501-08；这些窄补充随本稿一并待审，不重开已批准的 API 参数或业务范围。

## FE501-01 输入、授权与选型

- **CONFIRMED 输入**：[产品09R1](../../product/config-portability.md)、[UI33R3](../../design/config-portability/design-spec.md)、[DB01](database.md)、[BE01](backend.md)与[API合同](api.md)。产品/UI/DB 原件提交时的待审文本分别由有效接收覆盖；[128授权](../../reviews/evidence/cr313-frontend-entry-128/authorization.json)接受 BE01 并激活 frontend-bob，当前 single / M002 / technical-design，注册身份一致；模型锁/Profile 不迁移，actual_model unknown。
- 固定四类别全替换、四计划、必填不能补 false/0、本包每连接 Key（包括停用/零模型连接）、跨类依赖整次拒绝、成就不同身份同类型同门槛整次拒绝、不复制用户运行历史，均按上游。无人工映射、目标 Key 复用、补 Key、自动 provider 验证、AI 修复或旧库迁移。
- 继续现 Nuxt/Vue/TypeScript、Zod、应用 port/repository、Nuxt 作用域状态和 i18n。管理页已有 SSR/page-loader，保留初始安全读取；文件、口令、Blob、恢复槽仅 mounted 后客户端交互，不进 SSR payload。新建纯 CSR 应用或让 SSR 保存上传包均无必要。不加状态库、上传平台、Web Worker、队列或加密库。
- 部署沿现Nuxt构建/同源API代理与no-store配置；未来实施须与BE01五接口同版本集成，先在隔离环境验证，缺接口时显示既有失败反馈，不回退到逐项保存。客户端产物不带fixture/`.planning`访问/秘密；本轮不执行构建、部署或改变UAT服务。
- 正式源码为 [formal/boot.js](../../design/config-portability/formal/boot.js)、[enhancer.js](../../design/config-portability/formal/enhancer.js)、[controller.js](../../design/config-portability/controller.js)，继承 vendor 的模型/计划和 operations/admin 模块。生产不移植 demo 定时器、MutationObserver/base URL 补丁、portState 或 sample fixture；转换其已批准布局、文案和可观察交互。原型不替代正式稿。

## FE501-02 路由、区域、组件与接点

下列新文件名为实施建议，不是本轮已写源码。路径基于 `frontend/app/`；实际输入哈希见 [source-manifest](evidence/frontend/source-manifest.json)。

| PAGE / CAP / DATA | 正式区域 → 生产路由/宿主 | 组件、应用模型与 API |
|---|---|---|
| PAGE-501 / CAP-501～504 / DATA-501,505,506 | formal models `.page-head .actions`，原 `.generic-provider-list`/`#admin-model` 保留 → `pages/admin/models.vue` `/admin/models`，原添加服务商前插两个次级按钮 | `ConfigPortabilityActions` → category=models；`ConfigPortabilityDialog`，PreviewModel/ResultModel；API-501～505。完成后 `admin.loadModelProviders()`，使模型列表/revision 重新读取 |
| PAGE-502 / CAP-501～503 / DATA-502,505,506 | formal plans 页头优先级按钮之前；横向 tabs、`#service-settings`、优先级字段保持 → `pages/admin/plans.vue` `/admin/plans` | category=plans 恒定，不取 selected plan；刷新 `admin.loadGroups()` 与其模型依赖读取，保留选中 tab；API-501～505，四计划整包 |
| PAGE-503 / CAP-501～503 / DATA-503,505,506 | formal operations 页头 + itemsettings → `pages/admin/growth.vue` `/admin/growth` 的现 `.section-head` | 每次 open 读取实际 `tab === itemsettings` 才传 items；刷新 `items.load()`，保留 `ItemDefinitions.vue` 的筛选/编辑/引用逻辑；API-501～505 |
| PAGE-504 / CAP-501～503 / DATA-504,505,506 | formal operations 页头 + signsettings/levelsettings/achievementsettings → 同 `/admin/growth` | 三 tab 均传 growth；覆盖签到/掌握经验/等级/四类成就全集，与 kind 筛选无关；刷新 `growth.load()`，对应 `CheckinSettings.vue`/`TierEditor.vue`；API-501～505 |

模型/计划现 `page-head` 与成长现 `section-head` 是代码定位差异，不授权重排页面。复用原 admin layout/sidebar 和 locale 导航；R2 的结果要求对应真实 `/admin/*` 链接、刷新和前进后退，不能在产品生成 `/formal/` 路由。入口打开后 category 是该操作不可变上下文；切 tab/换路由只影响下次新操作，不改变在途请求类别。只有这三路由的四区域有入口，用户/预设/公告不增加按钮。

最小模块边界：

| 层 | 建议接点 / 职责 |
|---|---|
| 应用模型/port | 新 `application/admin/config-portability.ts`：Category、PreviewModel、ChangeModel、DependencyModel、EffectModel、ResultModel、SafeCurrentModel、PortabilityFailure、五动作 port；与现 `configuration.ts` 并列，不能把整包调用变成 previewGroup/removeModel 循环 |
| schema / mapper | 新 `infrastructure/http/schemas/config-portability.ts` 与 `mappers/config-portability-mapper.ts`：严格 HTTP DTO 校验、字段/空值/枚举/关系验证、snake_case→camelCase、安全字段值映射；DTO 仅在 infrastructure 内 |
| repository | 新 `repositories/config-portability-repository.ts`，接 `RawHttpTransport`/`TokenVault`；在 `api-repository.ts` 的组合处和 `application/shared/ports.ts` 接入五动作；现 client/server plugin 注入继续复用 |
| 操作状态 | 新 `runtime/stores/config-portability.ts`：意图动作、epoch/请求号、pending、确认、终态与安全选择器；秘密另置每 Nuxt app 的客户端内存闭包，不能放 `useState`/Pinia/devtools 可序列化状态 |
| 恢复/文件适配 | 新 `runtime/session/config-portability-recovery.ts`：sessionStorage 读写、身份作用域、到期与清除；局部 File→字节/base64、Blob 下载帮助函数，不成为通用文件平台 |
| 呈现 | 新 `presentation/components/admin/ConfigPortabilityActions.vue`、`ConfigPortabilityDialog.vue`，必要的局部 changes 列表；新 `presentation/admin/config-portability-presenter.ts` 把安全应用模型转文案参数/分组，组件仅意图事件和渲染模型 |

数据方向固定：`HTTP DTO → Zod runtime schema → mapper → application model/state → selector/presenter → Vue`。组件不 fetch、不导入 schema/DTO、不读取原始 response/context，也不把原对象存状态。当前 `admin-configuration-repository.ts` 的 port 模式可以复用；`groupDraftBody`、`itemDefinitionBody`、`rewardBody` 的默认/trim/条件补值逻辑不能用来重写原上传文件。API-505 的安全文件配置缺少现列表模型的 everIssued/referenceCount/createdAt 等字段，必须专有 SafeCurrentModel，不伪造这些字段塞进原列表。

## FE501-03 五接口、DTO 与字段边界

所有动作同源 `/api/v1/admin/config-portability`，category 严格白名单；POST JSON、当前 `X-CSRF-Token` 与 same-origin cookie。预览也须安全写入中间件要求，不以“无配置写入”省略 CSRF。先取得当前有效安全上下文，再发请求；401/403 走已存在 session 反馈，禁止隐式重放 imports。

| API | 精确输入 / 返回接收 | 应用模型及动作 |
|---|---|---|
| API-501 `POST /{category}/exports` | `{include_credentials:false}`；仅 models 的 true 带 `passphrase,passphrase_confirmation`；false 必须省略二字段。200 是原始文件字节，非 success envelope；验证 Content-Type/安全 attachment 文件名、完整读取后才下载 | ExportFile `{blob,safeFilename}` 为短期客户端资源。禁止从当前分页/筛选自行拼包；失败不生成部分下载 |
| API-502 `POST /{category}/previews` | `{file_base64,passphrase?}`；标准 base64 含 padding，原文件字节；普通包不传口令。200 严格 envelope `{data,meta:{request_id}}` | `category,schemaVersion,canCommit,operationId,previewToken,baselineRevision,createdAt,commitNotAfter,retainUntil,counts,changes,blockers,effects,warnings,defaultsApplied` 全部映射；票据放私有恢复上下文，不给展示组件 |
| API-503 `POST /{category}/imports` | 同一原字节 `file_base64`、原 `preview_token,operation_id`、`confirmed:true`、仅加密带原口令；先持久化恢复槽、再 send | 200 仍须解析 `status=applied|not_applied`；仅 applied 可成功。结果字段完整映射 `operationId,category,status,reasonCode,baselineRevision,resultRevision,currentRevision,superseded,counts,effectiveDay,resolvedAt,commitNotAfter,retainUntil` |
| API-504 `POST /{category}/operations/{operation_id}/resolve` | body 仅 `{preview_token}`，仍 CSRF；它可能写 not_applied 屏障，不改为 GET | 同 ResultModel；503 outcome_unknown/Retry-After:2 保持未知，410 到期、403 token 无效均非未应用；可在提交截止后结果截止前 resolve |
| API-505 `GET /{category}/current` | 无 body/query/分页；200 `{data:{category,revision,read_at,configuration},meta}` | SafeCurrentModel：完整安全 FILE502，models 无 Key，growth 全 current/pending；仅此刻快照，不能据此给旧 operation 判成功。413 不显示残缺全量 |

Result关系校验：applied的reason_code=null，superseded必须等于current_revision与result_revision不等；not_applied的baseline_revision=result_revision、counts四项均0、effective_day=null，reason_code仅preview_expired/revision_changed/impact_changed/dependency_changed/resolved_before_commit/transaction_rolled_back。结果operation/category与请求票据一致；不以HTTP status代替该判别联合类型。

Preview 关系校验：can_commit=true 时 operation_id/preview_token/commit_not_after/retain_until 非空，阻止时均 null；时间 UTC RFC3339，5 分钟提交窗口，retain_until=commit_not_after+24h。revision 只作不透明字符串，不能数字加减。ID 为合同 UUID/固定码，不把 label 当身份。未知字段、错误类型/枚举、缺字段、互相矛盾关系拒收，raw parse error 不记入日志或 UI；imports 已发时即使是 200 畸形响应也进入 unknown。

Change 全字段映射：`action=added|updated|removed|unchanged`、`kind=connection|model|plan|item|checkin|mastery|level|achievement`、`identity,label,fields[{field,before,after}],credential_action`。identity 保留 UUID/计划码/current-intent/mastery/level:N；field 仅 FILE502 已知 JSON Pointer，before/after 按该字段类型校验，新/删一侧可 null，不能把它和额度业务 null 混成缺值。credentialAction 连接仅 replace_from_package/none，非连接 null；每条含 Key 的连接 updated，不推断 Key 相等。API 排序 removed→added→updated→unchanged 保留在模型；展示预览按 UI 的新增→更新→移出并保留不变计数，确认改移出→新增→更新并默认展开移出。不得按 DOM 表行数重算 counts；未改变项完整保留模型，不把设计样例当数量。

DependencyBlock 全字段映射：`code,source_category,source_kind,source_identity,source_label,target:{kind,identity,label},field` → 安全来源/目标行。sourceCategory=plans/presets/items/growth/target_history；target_history 的 sourceIdentity=null，不建立用户链接。code=missing_reference/active_reference/ever_issued/identity_conflict/reward_unavailable。局部锚点由内部序号生成，引用安全身份展示为文本；可以定位本 modal 内行，不凭 API 缺少的 URL 编造跨页编辑深链接。阻止时即使有完整 changes 也不能继续确认。

Effects 全部保留：baseUsers、activeTrialUsers、modelCardInstances、achievedAwards、claimedAwards（整数，不适用0）；mayChangeEffectivePlan、mayDowngrade；usageReset=false、trialDatesChanged=false、historyPreserved=true、inFlightPolicy=accepted_snapshot；checkinSource=pending/current/null、targetLearningDay/checkinEffectiveDay=date/null、masteryApplies=new_events/null。日期按服务端提供的学习日显示北京时间，不用浏览器本地午夜推算。wire字段 `warnings/defaults_applied` 映射为warnings/defaultsApplied，依据原作者 [FE313-B1补充](evidence/backend/FE313-B1-clarification.md) 严格接收两个必填数组：每条恰含必填code/item_ref/field。ItemRef为{kind,identity}，非null时按二者精确匹配同响应Change（含unchanged），label从该Change取；warnings可类别级ref=null且field=null，或对象级field=null；defaults必须ref和field非null。field为相对该对象的FILE502已知Pointer，无api_key、custom_parameters任意子键或源数组索引。code匹配`^[a-z][a-z0-9_]{0,63}$`，已知词表 name_generated/optional_value_cleared/reward_quantity_zero/checkin_current_selected/language_fallback/plan_no_models/plan_no_lengths/category_cleared/effective_plan_may_change/level_may_downgrade；其合法字段组合逐条照补充验证。合法未知code用准确通用提示，不裸展示code、不拒绝其余合法预览，不推断默认值或解除blocker。缺键/非法null/未匹配引用/非法Pointer仍合同错误；notice不额外计入changes，不把显式false/0/null/空数组当自动补值。该窄补充随本稿待审，未覆盖冻结BE01。

FILE501/502 不在浏览器再实现服务端导入校验/解密。浏览器只作文件大小、可识别外层模式和口令输入检查，全部真实性由服务端判定；外层格式未知/畸形仍走安全错误，不能先生成可确认预览。API-505 和 Change 的 schema 必须遵守四类完整字段和 presence：

| 数据 | 前端必须保留的字段语义 |
|---|---|
| models | connections[].id/protocol/base_url/name/models，模型 id/provider_model_id/display_name/description/max_output_tokens/output_mode/enabled/custom_parameters；可选 null 不补旧值，max_output_tokens 省略/空表示未设置，不是供应商无限；仅安全配置字段可返回，api_key/密文/凭据掩码不进入预览/当前模型 |
| plans | plans 恰 visitor/basic/pro/plus；priority、rolling_24h_limit（必出现且 null=不限、0=无次数）、max_entries、allowed_lengths、model_ids、content_review_enabled、content_repair_limit；空数组保留，关闭 false+0 不用 truthy 判断 |
| items | id/kind/name/description/exchange_price/activation_ttl_seconds/listed/effect；双语单语言缺省清空且另一语言回退，说明至少一语言；effect.kind 及条件 extra_count/model_ids/trial_seconds/retirement_points/target_plan_code 按类型，不用现编辑默认补齐 |
| growth | mastery_experience；checkin.current 完整四 Amount 与 pending 可省略/null；levels 的 source_id 仅来源、level_number 是匹配键、min_experience/reward_enabled/reward；四 achievements 集合完整，每项 id/kind/threshold/enabled/name/title/description/reward；reward.points、experience（成就）、item_definition_id、item_count 遵守条件表。无道具 quantity 省略或0，不擅补1 |

Amount 永远保留规范十进制字符串，显示/比较不用 Number；其他整数以 schema int/range 检查；JSON时长还须满足API按目标时间计算的9999年可表示性上限，不能以取整或截断接受非法值。双语可选语义在专用 mapper 消化，不复用要求两键的旧 schema；不做 AI 翻译。源 source/references.label/source_id 只是说明，不能作为目标 revision/身份修复依据。

## FE501-04 操作状态、竞态与恢复

每 Nuxt app 只有一个当前 modal/活动操作；四入口共用它，不共用类别可变变量。安全状态含 category、phase、requestSequence、sessionEpoch、preview/result、ack；私有闭包持原 File/bytes/base64、口令、AbortController、票据。一次动作捕获 `{epoch,sequence,category,operationId}`，响应只有全部仍匹配才允许写状态。异步文件读取、旧预览、迟到导出和权限变化后的响应同样受此门禁约束。

| 状态 | 允许动作 / 转移 / 清理 |
|---|---|
| idle / export | 打开时固定当前真实类别；export 默认无 Key。加密复选仅 models 可见；改变选择清口令，取消清表单。准备导出只调用 API-501，pending期间禁重复准备，取消仅中止读取并释放秘密；读取完且身份仍有效才下载；不能用设计 `export.ready` 演示文案作真实成功 |
| file / decrypt | File.size≤8 MiB 才读取，先检查大小不分配完整大包；不靠扩展名判加密。只读取外层是否 FILE501 加密来决定口令输入；不展示内部原始 JSON。换文件立即废弃票据、ack 与旧秘密，增加请求号；普通包省略 passphrase；必要时进入 decrypt |
| reading | API-502 中，按批准 I503/I508 禁止 modal 关闭/Escape；路由离开/权限变化仍取消等待并清秘密。取消网络只代表本地停止，预览无配置写入。完成仅当前请求可进入 preview/blocked/error；没有 token 不能确认 |
| preview / confirm | 展示完整计数/逐项变化/依赖/生效信息；confirmed UI 初始 false。返回预览不提交；确认页移出默认展开。任一文件、口令、类别、预览版本变化或已知目标 revision 变化废弃 ack/token。取消关闭清 File/口令/票据。确认期限到时禁止发 imports，要求重新预览，不把本地钟当服务端权限 |
| submitting | 在任何 await 之前同步置 pending，禁重复、关闭、Escape、站内导航；提交按钮与关闭按钮实际 disabled，不只点击无效。原 File/口令仅为本次 send 保留，发出后释放应用引用，不自动重试 POST。HTTP200 applied→success；not_applied→notApplied；任何不能获得可信终态的网络/超时/5xx/畸形响应→unknown |
| unknown / resolving | 只提供批准的“查询本次结果”“读取当前配置”；同ID resolve 串行一次，Retry-After 内禁重复查询，允许随后人工再次查询；不新增后台无限轮询。resolve 先到可写 not_applied，故只对 dispatched 操作或明确中断恢复调用，不拿未提交预览试探结果 |
| success / notApplied | applied 成功事实按回执，宿主重新读取，superseded=true 仍是曾成功但当前已有后改；刷新失败不改成导入失败，也不拿旧草稿覆盖。not_applied counts=0，不渲染 success。重新操作须 File/口令重选、新预览、新确认；旧 token 不再提交 |
| resultExpired / tokenInvalid | 410 或 recovery_token_invalid 仅说明不能判定，不显示已回滚。保留当前未知事实并允许 API-505；明确新操作必须独立新预览，不是自动恢复。无原 token 同样不能猜测结果 |
| blocked / error | 所有字段/依赖失败整批阻止。更换文件/重新预览重建上下文，不在线补 Key/自动修正文件/绕过失败项 |

**恢复槽**：提交发送前一次 sessionStorage.setItem，内容仅 API 指定 `{operation_id,category,preview_token,commit_not_after,retain_until}` 与本地 `dispatched` 标志，键以当前已验证管理员 actor.id 作用域隔离（不再存用户资料）。必须在 send 前写完；若写入失败，禁止本次发送，不能承诺刷新可恢复。标志含义为“准备派发，可能已发送”，不是服务器已收到；写槽后 send 前崩溃，恢复 resolve 可安全确定 not_applied。读取槽也做严格白名单/大小/时间校验，不信任修改过的浏览器存储。预览票据不长期保存，只有派发操作可占用恢复槽。

同 tab 刷新，先 bootstrap 验当前管理员与 CSRF，再恢复槽并进入 unknown；只 resolve，无 File/口令重新上传。不同管理员/显式 logout 删除对应恢复槽，任何会话 epoch 变化均清秘密/安全预览与中断网络；暂时401/403只保留原管理员命名槽，禁止当前无权限访问/展示其操作，重新验证同管理员后才可 resolve。撤权不把晚响应重新写回。显式登出即使网络失败也应先销毁本地秘密；不得以本地清理表示服务端回滚。

仅 sessionStorage 支持当前 tab 刷新，关闭 tab 不承诺恢复。另 tab 可能独立操作，由服务端 revision/影响摘要解决冲突；不建 BroadcastChannel/跨 tab 锁或自动接管。当前 tab 尚有未确定操作时再次打开任何类别先呈现待确认操作，禁止覆盖恢复槽；管理员看过当前快照后发起新的明确操作必须走新预览/确认，旧操作不能被静默重放。终态被用户关闭后清槽；到期/tokenInvalid 先保留到显示边界并关闭，再清槽。无票据即不承诺历史结果恢复。

站内离开：确认前清秘密与预览；reading 允许路由卸载清理但 modal 内仍不提供关闭；submitting 使用现路由守卫阻止站内导航，浏览器强制刷新/关页只能保留恢复槽，Abort/unload 不等于回滚。若页面已离开，迟到终态不能重新打开旧 modal；回到后台后从槽判定。关闭 unknown 仅隐藏界面，保留恢复槽，回到任一入口继续判定。

超时：后端 BE501-02 已定义提交总上限15s；前端可设30s本地等待上限（PROPOSED，非服务器取消），到时 submitting→unknown，resolve 失败仍保持 unknown。createdAt/commitNotAfter 用服务端差值+单调经过时间估计显示，本地时间只提前禁止陈旧确认，服务端锁后复验是最终准绳。04:00跨日、相关历史增加即使计数相同也可能 not_applied；不自行比较公开 effects 数量判定预览仍有效。

## FE501-05 失败映射与秘密生命周期

不直接使用现 problem-mapper 把 context 丢掉的通用路径：局部 repository 在 `problemSchema` 后验证 portability context，输出 `PortabilityFailure {code,status,requestId,fieldIssues,items,errorsTruncated,outcome,retryAfterSeconds}`。fieldIssues 保存数组顺序/重复定位，不压成单键对象覆盖多条错误。安全 presenter 才把已批准模板键与参数组成显示，不能渲染服务器 title/detail/raw Zod issue。

| HTTP / code | 必须保留的语义与动作 |
|---|---|
| 400 malformed_request / invalid_json；422 category_mismatch / unsupported_format / validation_failed | 更换/修正原文件；不改类别、不补值。按 JSON Pointer+required/null_not_allowed/object_required/out_of_range/duplicate_id/duplicate_threshold/immutable_field/invalid_reference/protected_field/unsupported_character 定位；未知字段 code 用已有通用错误区域，不猜含义 |
| 422 credentials_required / decryption_failed / source_configuration_incomplete | 缺 Key 定位安全连接，回源重新导出；wrongPassword 现文案覆盖错口令/损坏，不细分认证原因。源配置不完整没有导出文件；不自动探测provider |
| 401 authentication_required；403 forbidden / csrf_failed | 复用 session 认证反馈，清秘密，原 dispatched 操作保留未知；恢复安全上下文后只 resolve，不透明重试 imports |
| 403 recovery_token_invalid；410 result_expired | 无法证明结果，走当前快照；专门边界反馈取TA1结果键，不套“目标配置变更” |
| 404 not_found；409 operation_conflict | 不透露他人回执；停止当前提交，409只以原槽token/ID判定，不能生成新ID重试 |
| 413 payload_too_large / preview_too_large | 无可提交token，既不截断预览也不拆包分批；沿错误区域给资源边界，复用TA1 import.fileLimit |
| 429 portability_busy | 读取 Retry-After 秒数，禁重复请求到时；导出/预览可显式重试；imports已派发仍先resolve，不利用通用 retryable=true 自动重发 |
| 503 service_unavailable / outcome_unknown；网络/客户端超时 | 提交前请求失败可回文件/导出；派发后保持 unknown，只resolve/current。Retry-After不是后台任务进度 |

problem.context 只接受 `{category,items:[{identity,label,field,code}],errors_truncated}` 或 `{operation_id,outcome:"unknown"}`；不输出原值、SQL或不受控对象键。字段路径只允许 schema 键/数组索引，custom_parameters 未知键显示容器定位。errors_truncated=true 只表示最多200条，修复后重预览，不能当作已列完错误。API不存在专门 `params` 字段：文案 params 从已校验字段/上下文、counts/effects 安全派生，不发明后端 params。

File/字节/base64/口令仅客户端内存：口令不 trim、不正规化，按 Unicode scalar 数12～128、UTF-8≤512字节、非全空白、无U+0000、拒孤立代理项；不拿 HTML minlength 的UTF-16长度作唯一校验。导出二次输入原样完全一致。预览到确认须保留同原File与口令以重传；任一改变重预览，失败退出/取消/提交派发完成/权限变化/卸载均释放，输入 value 清空。只在发送阶段生成 base64，避免多份长字符串长期引用；原 File 保留字节来源，不 JSON stringify 重写包。前端不生成 AES/Argon2 Key、不解密内包、不保存 api_key，用户口令/文件不进 URL、日志、analytics、SSR、localStorage、IndexedDB或测试快照。JS/浏览器无法证明物理内存擦除，文档不承诺零残留。

下载只接受完整成功响应；通过局部 Blob 适配器校验固定安全 basename 后创建 object URL、触发下载并在浏览器接管后 revoke，取消/卸载亦清理；不得把包全文交 JSON logger。服务端 no-store 与现 Nuxt private,no-store 保持；不加 Service Worker缓存。safeFilename 不能用管理员输入/口令，Content-Disposition异常则停止下载而非猜成合法包。浏览器保存的下载副本由管理员自行保管，前端不声称可召回。

## FE501-06 文案、样式、资源与旧交互保真

准确来源是 [原copy.json](../../design/config-portability/copy.json) 加 [TA1动态文案](../../design/config-portability/technical-alignment/copy.json)/[设计补充](../../design/config-portability/technical-alignment/design-addendum.md)、[theme.css](../../design/config-portability/theme.css)、[responsive-accessibility](../../design/config-portability/responsive-accessibility.md)，宿主页继续原 M002/M003 已批准资源。沿现 `frontend/scripts/sync-design.mjs` 的生成方式为 CR313 建独立 `m002` 下的局部文案命名空间，记录源hash，不能覆盖同名原 `common/plan` 等键；`use-design-copy.ts` 映射继续复用或局部适配，不手工同义改写。样例数据不是生产文案；禁止把完整 copy 覆盖旧导航/页面文本。TA1只覆盖其列出的局部键；合并时先跨static/templates删除被替代旧键再加入TA1同名模板，尤其import.fileSelected/preview.credentials/error.category/error.missingKey/error.required，防止旧static优先遮蔽新template。导出动态文本用export.downloadStarted，不复用演示export.ready；meta只作来源说明不编译为界面键。

| modal 区域/控件/状态 | 准确来源键（中英同后缀）/数据参数 |
|---|---|
| 页头两按钮 | portability.import/export/actionsLabel，正式 `.cr313-actions` 与原 action 顺序 |
| export 复选及口令 | portability.completeScope、export.keyless/includeKeys/includeKeysHelp/password/passwordConfirm/passwordHelp/passwordMismatch/prepare/prepareEncrypted；只 models 显示 Key 选项 |
| file/decrypt/reading | import.title/titlePlans/titleItems/titleGrowth、scopeWarning/choose/noWrite/password/passwordHelp/validate/reading，field.*。真实文件按钮复用 import.choose，禁止 import.demoFile；fileSelected/preview.encryptedFileMeta取TA1动态模板；解密前不显示条目数 |
| preview/confirm | preview.title/valid/add/update/remove/unchanged、templates.preview.summary（added→add等）；changes.*、preview.{category}Effect/notProviderVerified；confirm.title/ack/replace；日期模板growth.effective取checkinEffectiveDay |
| success/unknown | result.success*、successHelp、templates.result.successSummary；result.unknown/unknownHelp/check/read。成功数量只取回执，不用旧preview；未知绝不走controller演示的read-current→success |
| error/blocked | error.title/wrongPassword/dependencyHelp/itemDependency/fixFile/repreview；templates.error.reference 的source/target来自安全模型；error.stale仅用于确有revision/dependency失效，不代表所有not_applied |

Changes 的 before/after 为文本/受控结构，不插 HTML。Pointer→业务字段名优先复用宿主页已批准键；无键时按TA1显示已校验的相对JSON Pointer，不翻译或猜字段标签。占位符必须一一验证、无变量遗留。无新增位图；复用 AppIcon 24px线性图标，controller.icon 的新增 upload/download/shield/file/warning/check 等只作同规范局部 SVG，aria-hidden，不因图标变按钮名称。

样式仅迁入现 assets/css 的CR313作用域（或局部CSS），保持 `#cr313-dialog` 680px桌面宽、100dvh边界、22px圆角、独立body滚动、固定footer；760px下8px边距/48px动作，390px计数两列/确认单列；复用现Token并按来源逐项核对，不重定义 :root/全局按钮/panel。减少动效停止spinner但保留status文案。中文/英文、长身份换行、错误和大量changes都保持footer可达；不为所有条目创建全量截图或新虚拟列表框架。

**Modal 接点**：现 `AppDialog.vue` 已 showModal、Teleport、焦点循环、returnFocus/bodyKey/shown；复用其机制，CR313局部补 closeDisabled（含关闭按钮disabled及cancel/backdrop守卫）所需最小能力。若共享 prop 扩展，默认行为保持并仅回归受影响旧modal。状态变更后焦点进入关闭按钮或错误/结果标题；reading/submitting无可交互按钮时让标题/状态容器 tabindex=-1可聚焦。opener卸载时回到当前页头可聚焦标题，不重新访问旧DOM。

计划优先级现 `plans.vue` 已经使用 AppDialog，**保留真实 top-layer**，不拷贝 vendor `<dialog open>`。R3要求初始第一输入、预览后影响说明获焦、同轮四输入保留、取消/Escape/保存回入口、遮罩点击不关；现共享 AppDialog 的backdrop会 emit close，须在计划局部区分close原因/禁止该backdrop关闭，不能全局改变模型/道具既有行为。CR313和原编辑modal互斥打开，不能用全局z-index掩盖失焦。KeepAlive的成长草稿在成功重新读取后按新的revision失效/重载，不能把旧缓存draft自动保存回去；仅当前类别相关草稿刷新，原独立编辑行为保留。

## FE501-07 定向验证计划（全部待实施）

复用现 Zod/Vitest、`tests/unit/admin-preview-lifecycle.test.ts`、`strict-contracts.test.ts`、`m002-admin-contracts.test.ts`、`tests/e2e/mock-backend.mjs` 与 `m002-admin-fixture.mjs`/growth fixture。在现 mock 路由加五接口的合同 fixture，不另建mock服务平台；fixture使用虚构身份、合成文件/口令，不写真实Key。mock能返回HTTP200 not_applied、503、410及延迟/丢响应，断言请求次数和顺序；不能以mock证明数据库原子性/密码正确/真实UAT通过。

| 验证组 | AC / UIA | 输入→预期与方法 |
|---|---|---|
| FE-V1 身份/范围 | AC-501/502/512；UIA-501/502/513/514 | 四入口实际路由/四tab/语言前进后退；用户/预设/公告无入口；导出body无分页参数、默认无passphrase；权限切换迟到响应不展示。unit门禁+contract请求+定向浏览器 |
| FE-V2 文件与秘密 | AC-502/503/510/513；UIA-502/503/508 | 8MiB边界、UTF-8/scalar 11/12/128/129含emoji与孤立代理项、全空白/NUL、确认不一致；普通包省略口令、密文不在浏览器解密；缺任一连接Key即blocked无补填。检查storage/URL/日志/SSR无材料，Blob创建/revoke计数；provider请求为0 |
| FE-V3 映射与完整替换 | AC-504/505/513/514；UIA-504/505 | 四计划explicit null/0/false/empty/missing、Amount精度、单语清空、模型optional清空、奖励条件、pending/current。schema/mapper表驱动；changes分组与counts不混算，移出默认展开；成对验证合法值与缺字段，不能用实现反向生成期望 |
| FE-V4 依赖/历史 | AC-506/507/511/512；UIA-506/507 | target_history null身份、跨类引用、同名不同UUID/成就身份冲突、道具ever_issued、成长来源/目标日/奖励历史摘要；预览不发imports，无自动解绑/映射/发奖；contract+错误定位浏览器 |
| FE-V5 确认/并发 | AC-508；UIA-509/510 | 双击仅一次imports、换文件/口令/类别旧响应忽略、基线/影响/04:00变化、5min到期；HTTP200各not_applied reason均不成功。unit状态时序+mock注入 |
| FE-V6 恢复/超时 | AC-509；UIA-510 | write槽→send前崩溃、提交成功丢响应、resolve先于迟到提交、503 Retry-After、刷新同管理员、不同管理员、logout、tab关闭无恢复、sessionStorage失败、过24h结果窗口、token失效、current不能证明成功、superseded后刷新失败。检查imports绝不自动重发；真实事务由BE-V7证明 |
| FE-V7 视觉/键盘回归 | AC-504/509；UIA-511/512/515 | 1440×950中文与390×844英文：模型含Key导出、长确认/错误，body滚动footer可达、目标≥44px/移动48px、无页面横向溢出；Tab/Escape/禁关闭/返回焦点/reduced-motion。优先级37/41输入在预览后保留、:modal和背景阻断、遮罩不关；原模型/道具编辑+计划返修+成长tabs保持 |
| FE-V8 依赖边界 | AC-501/503/508/512 | 架构检查页面/组件无fetch/DTO导入、状态不依赖presentation、秘密不进useState或SSR；错误上下文不丢且不回显原值，异常200提交转unknown。运行定向unit/contract，不为本需求全站扩测 |

设计证据按原版复用：[R2导航](../../design/config-portability/evidence/M002-UI-33-R2-navigation.json)7项、[R3 modal](../../design/config-portability/evidence/M002-UI-33-R3-priority-modal.json)12项及门禁已冻结106-file设计manifest。它们证明原件设计，不证明生产Vue；本轮未重跑浏览器。未来只选上述代表视觉区域，预计保存6张、送模最多4张，失败/无法判断时按同AC补图；普通成功行为用结构/请求/焦点断言。若共享modal改动，回归模型/道具/优先级三相关使用处，不扩大到全站。

所有 AC-501～514 均有对应组，后端事务/历史/密码仍按 BE-V1～V8/DB501-V1～V8，前端不能以显示文字替代验证。真实UAT继续用户原要求；mock只是合同/浏览器测试设计，无文章质量/模型漏判评分。本轮只静态文档链接、稳定ID、hash、旧正文比对，未执行unit/build/浏览器/DB/provider或服务启停。

## FE501-08 最小上游接收缺口与完成边界

本轮发现的四项窄来源缺口均已由原责任角色补齐并完成设计接收，**当前无实际阻塞**。下列补充仍是随M002-FE-CR313-01一并待审的输入，不借UI33R3/BE01已批准状态追认新增内容；它们不改冻结106文件/BE01六文件、布局、页面、入口、API行为或已确认产品规则。

| ID / 原缺口 | 原作者来源与本稿接收结果 |
|---|---|
| FE313-U1 固定样例无法生产泛化 | designer-tony [TA1文案](../../design/config-portability/technical-alignment/copy.json)与[addendum U1](../../design/config-portability/technical-alignment/design-addendum.md)：import.fileSelected(filename)空名称回退、encryptedFileMeta(category,version)不显示解密前项数、preview.credentials(count)取changes中connection+replace_from_package数量；error.category取已解码四类别名，missingKey/required的item取安全label→合法identity→index、field取既有业务标签→校验Pointer、reason仅十个准确错误键。Change值按类型保留false/0/空数组/空字符串，额度null单独无限，其余可选null未设置，新增移出缺失侧独立；真实导出只声明downloadStarted，不声称文件落盘 |
| FE313-U2 未应用/到期/当前快照等终态反馈 | TA1 result.notApplied/notAppliedHelp/startNewPreview；expired/expiredHelp、tokenInvalid/tokenInvalidHelp、current/currentHelp(readAt,category)、superseded、refreshFailed/retryRefresh。HTTP200 not_applied不显示成功计数；current追加原unknown/expired/tokenInvalid body的change-details，不能改变操作事实。unknown+有效token保留check；到期/票据失效去掉check，只读当前与关闭；applied刷新失败只重读宿主，不重发imports。按钮与焦点定位按addendum U2，不新增页面 |
| FE313-U3 现位置缺精确技术边界 | TA1 passwordHelp/passwordInvalid、import.fileLimit、confirm.deadline(deadline,retainUntil)/previewExpired、result.lookupWindow(retainUntil)，分别原password help、file/noWrite、ack上方、unknown body呈现。期限取服务端UTC再按语言格式化并明确时区；本地到时禁确认，服务器最终判断。12～128 scalar/512byte/8MiB/5min/24h不再向用户重问范围；storage不可用复用原通用alert且禁派发 |
| FE313-B1 notice类型不完整 | backend-alex [原作者类型补充](evidence/backend/FE313-B1-clarification.md)：FE501-03按ItemRef精确匹配、null、Pointer和可扩展code严格收敛；TA1将10个已知code对应notice.*，未知合法code用notice.unknown，itemField/item/category包装只使用已验证定位。schema设计缺口解除，不增加必填业务/默认/阻止条件 |

可直接复用的原文案继续不变：error.wrongPassword、error.title/fixFile/dependencyHelp、result.unknown/unknownHelp/check/read、successSummary、preview.summary、error.reference、growth.effective；认证/CSRF/一般网络失败仍用既有AppError/session反馈。TA1 current快照不新加独立路由，文件选择直接复用import.choose，演示字符串/fixture仍不进入生产。

FE-V3补充验证TA1覆盖合并后无旧static遮蔽、全部中英模板参数一致、已知notice合法组合、unknown合法code通用呈现、引用缺失/跨kind错配/非法Pointer拒收。FE-V6补充各U2标题/按钮与result事实对应；FE-V7在原1440中文/390英文代表场景加入长filename/Pointer/期限与current快照body/footer可达。补充原作者仅做静态检查，**没有新的浏览器/API功能通过证据**；冻结R2/R3证据只复用原布局/导航/modal范围。

交付条件为scoped前端方案/交接、canonical前缀、四文件hash及旧正文逐字保留、补充输入hash和静态追踪。此条件现已满足，整份方案与三个补充文件待审；不自行批准、进入实现或关闭CR。CR313保持open，M002不收尾，发音UI32仍待审；CR039-L1/CR042-L1/AI-QUALITY-90/W01/QA26-MINIMAX原状态保持。下一步由用户审阅本稿及原作者补充，按原门禁接续实现；没有剩余技术来源澄清或新的业务问题。
