# API-004/005/006/202 造文与固定预设

V=访客、L=本人学习者、A=管理员。CAP-006–011/206/208/216/218；DATA-001/002/005–013/017/203/206–214；PAGE-204/212/216/217。请求和对象类型见 [index](index.md)，完整内容 `Target` 见 [书架契约](identity-library.md)。

## 1. 选词、随机候选及普通选项

<a id="api-004-search"></a>

`GET /api/v1/vocabulary/search?q=&limit=`（**V/L/A**）：共用只读固定词表搜索。关联 CAP-006/218、DATA-001/002/212、PAGE-204/212；DATA-001 已明确所有角色可搜索，管理员用于配置预设，不要求学习者身份、普通造文计划或剩余额度。

- **请求**：q 必填、1–64 个 Unicode 字符、有效 UTF-8；limit 省略或空值默认 10，提供时须为整数且为 1–20。无 body，不要求 CSRF 或 Idempotency-Key；Cookie 身份解析沿公共 GET 中间件。失效会话可能按既有策略回退访客，搜索成功不能作为管理员登录仍有效的证明；后台写接口继续独立鉴权。
- **成功**：200，标准 `data/meta.request_id` 封套；data 为 `{items:[{entry:string}],vocabulary_version:string}`，无匹配时 items=[]，版本仍非空。entry 是词表中的完整规范字符串，保留空格/标点；无 entry_id、释义或私人学习状态。大小写不敏感，前缀优先、包含匹配其次，组内按现有长度及词条顺序；最多 limit 条，无分页 cursor。与管理员选项中的 vocabulary_version 指向同一词表快照。
- **错误**：limit 不能解析为整数返回 400/malformed_request；q 不合法或可解析整数超出 1–20 返回 422/validation_failed；查询/快照读取失败返回 500/internal_error，不能伪造空成功。公共身份服务故障沿既有中间件的 503 Problem，不在本次改变身份降级策略。前端保留已选词及其他配置，失败与无匹配分别显示，查询结果可按当前查询重试。
- **行为**：重复 GET 只读取同一固定词表，不排除已选词或已学词。选择/去重由前端完成，保存/预览仍在各自命令复验合法词条。搜索不调用模型、不扣生成次数、不创建预设/预览/学习记录、不发成长奖励；原会话、访客 Cookie 与请求日志机制保持，不把“业务只读”表述为中间件零写入。管理员仍由既有 analyticsBrowser 跳过浏览器分析身份建立。
- **兼容边界**：BE04 只补齐 A 的权限声明及既有传输边界，不增加端点、响应字段、词典查询或全词表下载。以下随机候选、普通选项/生成继续仅 V/L；管理员仍走预设配置与独立预览，不因可搜索获得个人学习权限。

BE4-V01–03 为本次定向验证入口，见 [后端方案](../backend.md#cr027)。

`POST /api/v1/vocabulary/random`（V/L）：`{selected_entries:string[]}`，按当前普通工具台词数上限复核规范词条、去重。200 `{entry:string|null,reason:"limit_reached"|"no_candidates"|null}`。尚有名额但无候选返回no_candidates；成功entry非空且reason=null。不增加学习记录/掌握/额度；重复点击可以得到不同候选，不是幂等写。L排除本人当前库含的lexeme，V只排除已选；不以masteries排除，别人库无影响。该接口不用于锁定预设台。

`GET /api/v1/generation-options`（V/L）→200：

```text
{
 models:[{id,name,description:string|null,access:{from_plan:bool,card_ends_at:Time|null}}],
 meaning_languages:MeaningLanguage[],scenarios:Scenario[],lengths:Length[],max_entries:int,
 effective_plan:{code:Plan|"visitor",origin:"base"|"trial"|"visitor",trial_ends_at:Time|null},
 quota:PlanQuota,extra_quota:{remaining:int,earliest_expires_at:Time|null},
 availability:{can_generate:bool,reason:GenerationBlock|null}
}
PlanQuota={kind:"limited",limit:int,remaining:int,window_hours:24,refreshes_at:Time|null}
       | {kind:"unlimited",limit:null,remaining:null,window_hours:24,refreshes_at:null}
GenerationBlock=credential_missing|no_models|no_lengths|quota_disabled|quota_exhausted|generation_in_progress
```

模型集合=一份生效计划+有效模型卡，再去掉禁用/正式下架模型；card_ends_at仅卡的最晚有效结束，计划不折算时长。非模型约束全取该生效计划。默认story/short只在允许集合内使用，模型/释义语言仍显式选；无short时按UI22显示“请选择”，用户选择合法长度前阻止生成，不自动改选。

plan.remaining只计该 `(owner,plan,base|trial,epoch)` 滚动24小时的reserved/consumed，有限剩余下限0；refreshes_at为最早恢复一个额度时间（从对应收费时间24小时后），无事件/limit0则null。base/trial同计划时取base，trial用量/到期不改。extra_quota只含已启用未过期剩余，访客为0/null。

可用原因按上方枚举从左到右首个成立：quota_disabled仅plan.limit=0且extra=0，quota_exhausted仅有限计划已用尽且extra=0。计划0额度但有extra仍可生成；有模型卡但没次数仍拒绝。无限计划不消耗extra。models/limits/availability是读时快照，不保证提交时未变。普通选项不返回原始provider model ID/内部长度词数下限。

## 2. 普通生成与 SSE

`POST /api/v1/generations/stream`（V/L），body严格：

```json
{"model_id":"mdl_...","meaning_language":"zh","scenario":"story","length":"short","entries":["learn","weave"]}
```

entries非空、不重复、保持输入顺序；精确规范词条。检查当前主体、凭据、启用模型、权限、合法长度/语言/场景、词数上限、活跃生成和可用次数。禁止自由prompt/messages/temperature/max_tokens/供应商字段。校验失败普通Problem，不SSE、不扣次、不调用。

配置共享锁→主体锁→预占run/真实charge来源，成功后释放事务再调用AI。每主体最多一条active用户生成，普通与预设共享该限制。计划额度优先，再取extra最早到期，稳定ID破同到期平局；同一run只占一次。

HTTP200 SSE，headers `Content-Type:text/event-stream; charset=utf-8, Cache-Control:no-store, X-Accel-Buffering:no`，POST fetch读取；事件：

```text
event: generation.started
data: {"run_id":"gen_...","generation_token":"..."}

event: passage.delta
data: {"text":"They learned together."}

event: generation.validated
data: {"run_id":"gen_...","result":{"passage":"They learned together.","tags":["学习"],"targets":[{"entry":"learn","entry_meaning":"学习","hint_phrase":"learning through practice","hint_blanks":[{"start":0,"end":8}],"occurrences":[{"surface":"learned","start":5,"end":12}]}]}}

event: generation.failed
data: {"code":"content_validation_failed","quota_refunded":true,"retryable":true,"request_id":"..."}

event: generation.cancelled
data: {"quota_refunded":false}
```

示例正文仅说明格式，不是满足短篇下限的样文。validated/failed/cancelled三者只出现一个终态；`: heartbeat`为comment。result全部通过现有r10校验才发布，标签1–3，Target span规则同书架。只有validated可以收录；原始标注、供应商流、成本/内部诊断不透传。没有 Last-Event-ID恢复、断流续接、部分结果保存。新页面不恢复离开时的生成草稿。

有效完成事务包含charge consumed、valid draft、本人有效学习/自动签到/成长与分析；用户未收录也可签到。系统/供应商/协议/内容/连接中断失败：原来源退款，charge refunded一次；active→valid/cancelled/failed终态CAS唯一。主动取消计次不退。失败结算暂未确认时quota_refunded=false，沿原恢复机制继续核对，前端错误表现不因该值增加新业务状态。extra退款回原卡余额，卡已过期仍过期，不延长或转为计划次数。

`POST /generations/{run_id}/cancel`（V/L），`X-Generation-Token`，`{}`→200 `{status:"cancelled"|"valid"|"failed",quota_refunded:bool}`；终态返回其实际值，正在恢复的failed可以为false，不能虚报退款完成。取消接口才代表主动取消，连接消失不是主动取消。主体/token不匹配404，能力过期410。不自动重发生成请求；一次初始加至多两次内容纠正/续写仍一个run一次扣次，详见 [AI方案](../ai-integration.md)。

## 3. 收录、放弃及访客承接

所有路径前缀 `/api/v1`，除标注外body `{}`、CSRF；run路径需`X-Generation-Token`。

| Method / 路径 | 权限 | 成功 |
|---|---|---|
| POST /generations/{run_id}/save | L | 201 `{batch_id,saved_at,title}`；重复200同一批次 |
| POST /generations/{run_id}/discard | V/L | 204，丢弃有效临时草稿，不退款/撤销签到 |
| POST /generations/{run_id}/visitor-claim | V | 200 `{claim_token,expires_at}`；原文一次性承接，不二次生成 |
| POST /visitor-claims/consume | L，`X-Claim-Token` | 201首次/200重复 `{batch_id,claimed:true,title}`，绑定首次消费账号 |

草稿与claim默认30分钟、已消费claim重试凭据24小时沿现有生命周期；token仅页面内存，不写本机草稿库、URL或日志。保存完整内容资源和默认title原子成功；用户标题=原词顺序连接，不用预设标题。访客claim不重新按账号配置审核、不扣账号次数、不增加第二次全局生成；新收录增加saved_total/激活，签到只认生成valid日与承接同学习日且二期启用后。跨日仍可正常收录但不补签到。

明确删批次后消耗claim记录同事务删除，旧token404，不为了幂等恢复已删内容。数据绑定别的账号404；token过期410；运行非valid或已放弃409。数据库临时失败可重试同run/claim，不换来源身份。成功保存响应丢失也不会重复累计收录/发奖。

## 4. 公开预设和独立工作台（API-202）

V/L可读，不向admin提供用户生成角色模拟。公开按已发布可见版本读取；正文是管理员完整有效样文。

`PresetConfiguration={model:{id,name},entries:string[],meaning_language:MeaningLanguage,scenario:Scenario,length:Length}`。

`PublicPreset={id,title:string,published_version:string,version_created_at:Time,configuration:PresetConfiguration,sample:{passage:string,tags:string[],targets:Target[]},availability:{can_generate:bool,reason:"model_unavailable"|"credential_missing"|"configuration_invalid"|null}}`。

- `GET /api/v1/presets?meaning_language=&cursor=&limit=` →200 `{items:PublicPreset[]}`，meaning_language省略=全部，按发布版本的 created_at DESC,id ASC。完整样文与配置始终来自同一published_version；无description、title_zh/title_en。不截断正文为预览，不按UI语言改释义语言。
- `GET /api/v1/presets/{id}` →200 `{preset:PublicPreset,quota:PlanQuota,extra_quota:{remaining,earliest_expires_at},can_start:bool,block_reason:string|null}`；can_start再组合主体额度和active状态。下架/从未发布404 preset_unavailable；已发布但模型失效仍可显示样文及reason，不给可启动假象。
- `POST /api/v1/presets/{id}/generations/stream` →同 API-005 SSE；body仅 `{published_version:string}`。从服务端版本取所有配置，拒绝客户端覆盖entries/model等。版本已变化409 preset_changed，前端刷新展示后由用户再开始；下架404；引用失效422 preset_unavailable；次数不足429。

预设允许超出当前访客/账号的模型、词数、长度等配置权限，但不免次数。V扣原访客额度，L按当前账号计划→extra，绝不占访客额度。仍校验平台词库/支持枚举/模型实际可用；无任意prompt、自定义场景或新语言。进入/浏览不调用AI，点击开始才预占并生成；保存/claim走同一链。已经开始的run持完整配置快照，之后预设下架/编辑不替换运行内容或误拒保存；新请求用新有效状态。

公开样文不是用户成果，不能用sample接口直接收录/签到，不能用结果缓存替代真实生成。提示词缓存仅按现有平台可能命中，不承诺命中率。

## 5. 管理员预览边界

管理 CRUD 和发布见 [API-208](administration.md#6-api-208-热门预设管理)。FE2-G03 的完整选项契约如下，普通 `generation-options` 的计划/额度对象不能复用成管理员 DTO。

**GET /api/v1/admin/generation-options**：仅 A；无 path/query/body，GET 不要求 CSRF、不调用供应商、不创建 run、不计次数。成功 HTTP200、Cache-Control:no-store，公共 data/meta envelope；data 严格为：

```text
AdminGenerationModel={id:string,name:string,description:string|null}
AdminPreviewBlock="credential_missing"|"no_models"
AdminGenerationOptions={models:AdminGenerationModel[],
 meaning_languages:MeaningLanguage[],scenarios:Scenario[],lengths:Length[],
 vocabulary_version:string,revision:string,
 availability:{can_preview:bool,reason:AdminPreviewBlock|null}}
```

全部键必返，不允许省略或用 null 替代数组。models 是所有 enabled=true 且 retired_at=null 的平台模型，按 created_at ASC,id ASC 稳定排序；安全 id/name/description 映射同既有模型目录。无凭据时仍保留这些模型供配置草稿选择；无启用模型返回 []。description 缺值为 null。绝不返回 openrouter_model_id、密钥/密文/遮罩、prompt、计划 access、max_entries、quota 或额外次数。

枚举数组按平台顺序完整返回：meaning_languages=[zh,en,ja]，scenarios=[discussion,story,business,news]，lengths=[short,medium,long,xlong]；只限已支持集合，不从用户计划裁剪，不开放自定义值。vocabulary_version 是词表搜索使用的同一当前快照标识，非空字符串；revision 为配置总 revision 的不透明签名。词表不可读/枚举服务异常不得伪装成空选项成功；只能以非200 Problem 返回。

读取模型/凭据是否存在及 revision 使用一致配置快照；不解密或回传密钥，也不做连通性探针。can_preview=true 当且仅当凭据已配置且至少一个启用模型；此时 reason=null。缺凭据时 reason=credential_missing 优先于 no_models；凭据存在但 models=[] 时 reason=no_models，can_preview=false。这里判断平台是否可预览，具体所选模型/草稿的有效性仍在开始预览时重新检查，不证明上游此刻可达。无用户配额/generation_in_progress 阻塞，也不承诺无限并发。

| HTTP / code | 条件 | 调用方处理 |
|---|---|---|
| 200 / availability.reason=credential_missing | 未配置凭据，枚举/模型仍可读取 | 保留编辑内容，提示配置凭据后再预览；禁用开始预览，不把次数显示为0 |
| 200 / availability.reason=no_models | 凭据存在，暂无启用模型 | 空模型列表，提示去模型管理启用；不自动改草稿模型 |
| 401 authentication_required / 403 forbidden | 访客/非管理员 | 不返回管理配置 |
| 503 temporarily_unavailable | 数据库/词表/配置读取失败 | 保留已有表单，提供重试；不伪造200空集合或 can_preview=false 当正常配置状态 |
| 500 internal_error | 未预期内部错误 | 通用失败反馈，无凭据/SQL明细 |

前端实际取该 DTO 渲染配置，并以 can_preview/reason 提示。已载入选项不作为提交授权：preview 开始前重新检查凭据、草稿版本和所选模型，失去凭据返回422 credential_missing，所选模型停用/正式移除返回422 model_unavailable，草稿版本冲突409 revision_conflict；都在创建 preview run/调用供应商前拒绝，不自动换模型。GET 读取失败与真正缺凭据两条路径必须分别建 mock。

成功示例（id/revision/version 为合成占位值）：

```json
{"data":{"models":[{"id":"mdl_demo","name":"Demo model","description":null}],"meaning_languages":["zh","en","ja"],"scenarios":["discussion","story","business","news"],"lengths":["short","medium","long","xlong"],"vocabulary_version":"words_demo","revision":"cfg_demo","availability":{"can_preview":true,"reason":null}},"meta":{"request_id":"req_demo"}}
```


`POST /api/v1/admin/presets/{id}/previews/stream` body `{draft_version:string}`；A+CSRF。无学习者次数限制，单独preset_preview_run，开始事件`preview.started={preview_run_id,preview_token}`；正文`passage.delta`；终态`preview.validated={preview_run_id,draft_version,result,usage:UsageSummary}`、`preview.failed={code,retryable,request_id}`、`preview.cancelled={}`。usage见API-208，未知明确null，不是0。无generation_token、没有quota_refunded，不写用户生成/签到/收录/漏斗。

`POST /admin/preset-previews/{id}/cancel`，`X-Preview-Token`、`{}`→200 `{status:"cancelled"|"valid"|"failed"}`；主体范围A、token匹配；已经完成保持终态。成功完整预览原子关联其不可变版本，不自动发布。随后草稿已改则预览仍归原版本，新草稿不得冒用；取消/失败不是发布依据。预览不限次数是无业务配额，不承诺无限并发/上游无费用；现有连接池耗尽返回503，不能悄悄排入未授权异步生成。

验收：BE2-V06/07/10；普通权限和预设例外分别验证，模型已移除/临时禁用不静默替换，同主体普通/预设并发一条run，取消/断流区分、失败原来源退款、游客同日/跨日claim、预览不污染用户统计。

BE2-V21 / FE2-G03：严格对象与空值、完整枚举/词表版本、缺凭据优先、无模型、读取失败503、越权401/403、配置读取不解密/不探针、不占次数，以及选项加载后模型/凭据失效的开始预览拒绝。运行验证仍待实施。
