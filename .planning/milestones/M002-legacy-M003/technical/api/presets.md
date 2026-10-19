---
id: API-304
version: M003-BE-08
status: awaiting_user_review
milestone: M003
---

# 预设、独立预览与模式绑定

CAP-304/305、DATA-302–304、PAGE-212/216/217、AC-309/310/313/314、UIA-M003-307。继承 [M002 API-202](../../../M002/technical/api/generation-presets.md#5-管理员预览边界)，以下为完整增量；路径省略 `/api/v1`。PlanPreviewItem/Result/NativePolicy/ContentService/ValidContentOutcome/CompletionNotice见 [API-301/302](generation.md)。

## 公开用户生成

`GET /presets/{id}` 原data增加 `effective_plan,configuration_revision,content_service,native_correction_policy`，类型同API-301，同锁读取；与preset/quota/extra_quota/can_start/block_reason并存。目录GET只读已发布样文，不返回后台mode或让样文生成方式决定读者权益。

`POST /presets/{id}/generations/stream` V/L仍仅 `{published_version:string}`。受理内容N取本人当前有效计划；固定配置例外仅原模型/词数/长度，不赠内容审校。普通与用户预设共用API-302事件、snapshot、状态核对/取消/保存/claim、Q02和两个预算，entry_kind=preset。版本改变409 preset_changed、未发布/下架404 preset_unavailable、模型失效422、次数不足429；均无提供方调用。

## 后台模式先保存再预览

`GET /admin/generation-options` 保留原model/词表/语言/场景/长度/can_preview等完整字段，新增 `preview_content_modes:["basic","enhanced"],default_preview_content_mode:"basic",preview_content_repair_limit:1,native_correction_policy:NativePolicy`。两mode均独立规划→writer；基础mode N=0（不编辑/审稿）、增强mode N=1（必经固定编辑＋审稿/最多1次条件返修），由服务端独立策略提供；不读取/模拟Pro或Plus的N，不新增预览计划/次数选择器。

`POST /admin/presets` 请求 `{title:string,configuration:PresetConfigurationInput,preview_content_mode:basic|enhanced}`；PUT `/admin/presets/{id}`同类型另必填expected_revision。mode必填非null、非法422；configuration内部和config_hash算法不变，模式不进入公开配置。客户端传内容次数/系统预算或其它额外字段拒绝。

GET单项和POST/PUT/publish原封套仍 `{preset:AdminPreset,revision:string}`。AdminPreset新增 `preview_content_mode:basic|enhanced`；非null的preview新增 `preview_content_mode,final_content_version:int[1,3]|null,content_outcome:ValidContentOutcome|null,completion_notice:CompletionNotice`；原Result/usage/run等字段保持。AdminPreset.published非null时同增后三个终态字段，仅管理员投影，用于重新打开已发布样文时保留未完成提示；公共Published/PublicPreset结构不增加后台信息。历史policy=NULL的旧preview版本/outcome均null、notice=null，不假造审稿通过；新v1 valid必须具体值，不能null。列表若返回这些管理对象采用相同schema。

mode/生成参数变化创建新不可变draft_version、preview=null、draft_state=needs_preview。仅紧邻草稿生成参数和mode都相同的纯标题修改可以继承preview及其notice；切回旧mode也不能自动复用历史preview。UI本地变更立即使ready失效，先保存再预览；旧公开版本不变。

`POST /admin/presets/{id}/previews/stream` admin-only/CSRF严格body：

```json
{"draft_version":"current-version-id","preview_content_mode":"enhanced"}
```

StartPreview核对当前draft_version、已保存mode与请求mode；不匹配409 revision_conflict及context.current_revision，需重读，不允许请求覆盖保存mode。preview run记录数字revision及基础false/0或增强true/1，基础技术预算仍全请求2。无用户plan_origin/charge/签到。每次显式启动可独立创建run；并发成功只允许匹配版本且空preview_id的完成者填关联，其他valid不覆盖样文。

## 预览流、终态与核对

BE06：用户预设和后台basic/enhanced preview均受同一个生成容量Gate，preview子上限不是额外槽；503 generation_busy/Retry-After及完整Problem严格复用 [API-302受理前拒绝](generation.md#api-302-受理前忙碌拒绝be06)。忙碌不产生preview_run、provider或用户charge，不改变已保存草稿/旧有效预览，不自动开始下一次预览；输入/版本保持供用户显式再试。preview.validated之后仍核对当前draft/mode/run关联才可发布。读取、保存预设、发布/取消/status不占生成槽。

与API-302同一pipeline、先started再Open、所有mode真实规划plan_item→首稿；增强固定编辑/条件重写/续写真实edit增量及最终整包交付、seq/版本与唯一终态规则；这里N固定0或1，basic最终版本1、增强最多3（首稿1/编辑2/条件返修3）。内部审稿/返修不公开为阶段；管理员仍看实际mode/独立用量。预览使用以下命名和完整字段，不混用用户token/扣额：

| event | 完整data |
|---|---|
| preview.started | `{seq:int,contract_version:"m003-stream-v6",stream_id:string,preview_run_id:string,preview_token:string,draft_version:string,preview_content_mode:basic|enhanced,content_service:ContentService,native_correction_policy:NativePolicy}` |
| preview.progress | `{seq:int,phase:planning|composing|finalizing}` |
| preview.plan_item | `{seq:int,plan_id:string,meaning_language:zh|en|ja,item:PlanPreviewItem}` |
| preview.activity | `{seq:int,activity:writing|improving}` |
| preview.draft | `DraftEvent`，完整union及语义同[CR312-wire](generation.md#cr312-wire) |
| preview.edit | `{seq:int,draft_id:string,content_version:V,base_rev:int,rev:int,at:int,delete_count:int,insert:string,source:provider|retained}` |
| preview.validated | `{seq:int,preview_run_id:string,draft_version:string,preview_content_mode:basic|enhanced,final_content_version:int[1,3],result:Result,content_outcome:ValidContentOutcome,completion_notice:CompletionNotice,usage:UsageSummary}` |
| preview.failed | `{seq:int,code:FailureCode,retryable:bool,request_id:string}` |
| preview.cancelled | `{seq:int}` |
| preview.settlement_pending | `{seq:int,code:"settlement_unconfirmed",request_id:string}` |

这里V在basic时仅1、enhanced时1..3；同业务V的基础续写可有多个draft_id。edit的revision/区间/晚帧/恢复与API-302完全同义，所有草稿只读，不产生发布资格。

BE05-R1同API-302的规划保留规则适用于basic和enhanced：规划与正文持续同时显示，经过编辑/返修/retained以及pending/EOF；只有preview.validated或status valid完整Result才移除规划，失败/取消/新请求清临时状态。仍须另核当前草稿关联才有发布资格，显示保留不增wire字段或后台存储。

preview ContentService.content_review_enabled配对必须与mode一致，N只有0/1；basic最终basic/notice=null，增强结果可为另外四种valid outcome；service_incomplete notice必须content_review_incomplete。无quota_refunded，因为无用户charge。Q02有有效包时带提示交付；无有效包/客户端断连/取消/DB未知等按同一例外规则，不能把preview写入异常直接伪报failed或valid。API中的outcome不是独立质量结论。

历史v5管理员增强真实增量/换稿例见 [preview-enhanced.json](../fixtures/stream-v5/preview-enhanced.json)和[basic例](../fixtures/stream-v5/preview-basic.json)。与API-302同一展示白名单及状态机；没有用户quota_refunded/can_save字段，发布资格必须另读当前AdminPreset核对。

valid仅证明该run已成功，未必仍是当前draft或关联成功。前端收valid后GET当前AdminPreset，draft_version/mode/preview_run_id匹配且完整payload可用才ready；旧mode晚完成不能解锁新草稿。service_incomplete提示在流、GET恢复、ready和发布确认中保持，不在ready时抹掉。

`POST /admin/preset-previews/{preview_id}/cancel` 原X-Preview-Token/{}→200 `{status:valid|failed|cancelled}`，未确认503 settlement_unconfirmed；仅requested_by同一管理员token，不可跨管理员取消。

`GET /admin/preset-previews/{preview_id}/status` 同身份/token，200：

```text
{contract_version:"m003-stream-v6",preview_run_id:string,status:active|valid|failed|cancelled,draft_version:string,
 preview_content_mode:basic|enhanced,final_content_version:int[1,3]|null,result:Result|null,
 content_outcome:ValidContentOutcome|failed|cancelled|null,completion_notice:CompletionNotice,usage:UsageSummary}
```

active不返回临时phase/草稿或stream_id/draft_id，outcome/version/result=null；failed/cancelled outcome同status、version/result=null；valid从run读最终版本/outcome并稳定导notice，仍保留payload时result完整。旧非引用preview按TTL清理后result=null，不重建、不允许发布；notice不因payload缺失变成通过。404/410/503及1小时终态token窗口、最多10秒短核对遵API-302；不新增刷新token恢复/流续接/后台调用。

UsageSummary=`{logical_runs:int,provider_calls:int,input_tokens:int|null,output_tokens:int|null,cost:{amount:string,unit:string}|null,unknown_calls:int,invocation_unknown_calls:int,not_invoked_calls:int}`。provider_calls仅provider_invoked=true；unknown_calls是用量不完整观察行数，不等于发送未知；invocation_unknown_calls=NULL，not_invoked_calls=false。三者不能错误相加为实际调用总数；没有报告费用仍null。历史legacy发送未知单列，不补true。原管理员预览用量查询同步同投影，preview失败/取消/未完成交付也可有真实费用，全部与用户额度分离。

## 手动发布

`POST /admin/presets/{id}/publish` 保持 `{expected_revision,draft_version}`，不增加“自称审稿通过”/覆盖mode/内容上限字段。配置排他锁与预设行锁内校验revision、当前draft、mode/config_hash/configuration、关联run valid、final_content_version及完整payload；limit_finalized和service_incomplete均可人工发布。后者UI在确认时明确展示持续notice，API成功的AdminPreset响应同样保留；无需另建确认凭据或自动发布任务。

无对应完整有效预览422 preview_required，版本冲突409、非管理员403；失败/pending/取消/片段不可发布，不改published_version/listed。成功保持原 `{preset,revision}`，响应丢失先GET，不盲换revision重试。后台增强固定1和故障交付不授予用户内容权益，用户新请求继续本人N。旧线上版本保持至手动发布成功。

<a id="api-306-preview"></a>
## CR-306 自定义参数与现有完整预览

用户预设及后台basic/enhanced统一继承[CR-306受理/失败](generation.md#api-306-generation)、[API-306](administration.md#api-306)。请求不增custom字段，受理取已保存模型的custom_parameters/输出模式/token深快照；后台mode/version绑定和普通本人权益不变。管理员改模型参数只影响下一请求，不污染在途preview。

预览前本地配置非法：无preview_run的503 generation_unavailable/context.accepted=false，无用户charge，不提示退款。受理后参数遭上游400/422拒绝：preview.failed/protocol_error或符合Q02的service_incomplete；reasoning-only达到原180秒为generation_timeout，无有效稿不可ready/publish。未知结算、cancel与usage未知沿原规则。

已有有效preview仍是当时配置的历史结果，保留原完整包、draft/mode关联及手动发布资格，不自动删除/生成。它不能证明新模型参数已测试；验证当前配置须在现PAGE212显式发起新完整预览。basic/enhanced各自验证其业务链路，连接短OK不替代，不加专用测试页、自动调用或自动发布。新视觉原型应复用现页显示保存与调用区别，公开预设不新增参数编辑器。


## CR-312 / BE08 协调接收

普通预设生成使用generation命名；管理员预览使用preview命名，activity/draft/edit负载与API302唯一合同相同，started/validated/failed/cancelled/pending/status仍按本文件的管理员字段，不混用run token/扣次。当前v6完整预览输入见[有限fixtures](../fixtures/cr311-312/index.json)。body_complete不能开放发布；Q02仍先恢复lastValid再数据库确认，预览mode/version/CAS与授权不变。源pipeline保持m003-content-v5，status contract_version随公开协议升v6，不保存stream版本到数据库。用户既有锁定预设词条不受CR311新候选资格追溯拒绝。
