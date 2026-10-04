# CR029 / F05 服务商与模型契约（当前，UI31）

CAP101/102、PAGE208、DATA007/008。管理员独占，沿现有session/CSRF/配置revision；稳定服务商ID聚合多个模型。无默认模型。原 `models` 分页/单模型 API 保留其他后台引用查询与兼容，当前管理主界面仅使用下述服务商 API，不再经单模型接口复制连接。旧契约在 reviews/evidence/provider-workspace/before.tar.gz。

## 服务商聚合

- `GET /api/v1/admin/model-providers` 返回200 `{data:{items:[{connection:ConnectionDTO,models:AdminModelDTO[]}],revision:string},meta:{request_id}}`。同一配置共享锁快照，按服务商created_at/id、模型created_at/id升序；完整返回所有服务商及旗下未下架模型，不沿用旧模型列表20条分页。空服务商也显示，模型不重复计数；服务商按UUID分组，不能按名称/URL合并。
- `POST /api/v1/admin/model-providers` 新建，`PATCH /api/v1/admin/model-providers/{provider_id}` 编辑聚合。Body 2MiB，`{connection:{name,protocol,base_url,api_key},models:[{id:UUID|null,display_name,description:null|string,provider_model_id,max_output_tokens:null|integer,output_mode:prompt|json_schema,enabled:boolean}],expected_revision:string}`。models最多1000项；新建至少1项且所有id为null，编辑必须包含该服务商所有未下架模型的UUID，新增id=null；已有0项可保存空集合。省略原模型、传入他家/下架/不存在UUID、重复UUID均422。禁止借省略隐式删除，已有移除影响确认流程保持。
- 新建201/编辑200返回 `{data:{provider:{connection:ConnectionDTO,models:AdminModelDTO[]},revision},meta:{request_id}}`，模型顺序按保存后创建时间/ID稳定排序。
- ConnectionDTO={id,name,protocol,base_url,credential_configured,masked_hint}。Model DTO沿现有id/display_name/description/provider_model_id/enabled/retired_at/assigned_group_codes/created_at/updated_at/max_output_tokens/output_mode/connection，不含密钥。显示名称省略/空值时用ID前200Unicode字符；ID原样500字符以内，名称200、说明1000、输出token1..1048576。三协议及BaseURL约束沿下文。
- 修改服务商原位更新连接与凭据，影响旗下模型但保持provider/model UUID及计划/卡/预设引用。同一事务只推进一次配置revision；最终同服务商模型ID或显示名称重复409 model_conflict（名称不区分大小写，跨服务商允许同名），CAS409 revision_conflict，字段422，服务商404，Key缺失422 credential_missing，身份401/403。失败整组回滚；保存0上游调用。
- APIKey留空只允许地址/协议未改变且已配置凭据；换地址/协议须新Key，密钥加密后原位upsert。测试仍显式指定单模型，改连接前测试使用草稿。新建默认停用；启用不自动收费验证。
- 网络结果不明确时禁重复提交，先关闭/刷新确认；409重新加载并按稳定model ID保留本地编辑/新增项，合并远端新增模型，已下架项从编辑集合剔除。不自动删除服务商、不自动合并同名服务商，不扩展整服务商下架功能。

连接测试body与表单连接、modelID、output上限相同，忽略名称/description/启用位；只发一次短文本流式请求，超时30s，token上限256；验证协议终止且有文本。返回{ok:true}；失败沿原problem安全代码映射(auth/rate-limit/unavailable/protocol)。不返回供应商原始错误/响应文本、密钥；不是学习质量证明。测试不保存或扣用户次数。

运行：统一Gateway从模型UUID加载连接，预检内解密并绑定GenerationSpec私有快照，所有纠错/续写复制沿用。Chat `/chat/completions` Bearer+messages；Responses `/responses` Bearer+instructions/input/store:false；Anthropic `/messages` x-api-key+anthropic-version:2023-06-01+system/messages，必需max_tokens缺省4096。Base URL只在拼接资源时忽略末尾斜线，不补/v1。JSON提示与本地严格校验共用；可选json_schema适用于OpenAI两协议，Anthropic采用提示词JSON。三协议将SSE事件映射为文本/用量/终止，继续使用既有标注清理、schema、词形/覆盖验证、取消退款、诊断脱敏。必须收到明确成功终止，长度截断/中途错误/不完整EOF失败。

连接安全：拒绝userinfo/query/fragment、完整接口资源路径和非http(s)；无重定向；默认解析并固定公网IP拨号，禁私网/本地/metadata地址。仅与服务端既有配置完全相同的本地模拟端点（URL精确匹配）可使用私网client；后台表单不能新增例外目标。密钥不进入JSON/trace/log；测试/保存错误仅分类。

用量：三协议reported tokens保留。只有已知OpenRouter官方端点的cost使用既有openrouter_credits；其他服务费用保持unknown，不猜价格或币种。

主要验证：三个协议实际HTTP请求/多块SSE成功，状态/中途错误/EOF截断/取消；密钥隔离与重定向；保存0calls；同名跨连接；旧数据迁移；普通用户无管理权限；生成preflight缺凭据不扣额。

来源：[Responses迁移与参数](https://developers.openai.com/api/docs/guides/migrate-to-responses)、[OpenAI streaming](https://developers.openai.com/api/docs/guides/streaming-responses)、[Anthropic Messages streaming](https://platform.claude.com/docs/en/build-with-claude/streaming)。使用服务商明确配置，不推测modelID或能力。


## CR029-F04 流式探测确认

`model-connection-test`继续指定一个modelID及其连接，发送stream:true。成功必须解析Content-Type为text/event-stream，收到协议对应文本delta和成功终止；普通JSON、伪SSE、空流、仅终止、初始完整文本冒充delta、EOF截断/流中错误均失败。30s截止、256token探测上限、三协议既有鉴权、0用户额度扣减保持。SSE可能被网络合并成一个传输包，不能以TCP包数或首字延迟判定能力；验证的是协议级增量事件和终止。测试不承诺长文质量。前端明确“流式测试通过”，不返回原始响应/密钥。
