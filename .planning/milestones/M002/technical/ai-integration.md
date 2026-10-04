> 当前CR029模型配置与协议以 [通用模型契约](api/model-connections.md) 为准，替代本文旧OpenRouter全局部分，其余功能不变。

---
milestone: M002
stage: technical-design
role: backend-architect/base
agent_name: backend-alex
version: M002-BE-03
status: awaiting_user_review
date: 2026-09-20
---

# M002 AI 集成与验证边界

## 1. 继承基线与本期变化

CR029保留M001 v5/r10词法与内容质量规则；统一协议请求明确附带输出schema，故实际[contract.go](../../../../backend/internal/ai/contract.go)的PromptVersion更新为`m002-v1-r1`，ValidatorVersion仍为`m001-v5-wn31-r2`。诊断指纹覆盖三协议、prompt/JSON Schema模式、首次/探测/续写/纠错请求。新版本不宣称提高了实测质量达标率。完整既有语义见[M001当前AI方案](../../M001/technical/ai-integration.md)。CAP-008/009/010/011/205/216/218/219 → API-005/006/101/202/208/209 → DATA-007–014/211–214。

本期三个调用入口复用同一个GenerationSpec→OpenRouter→增量去标注→校验/有限纠正→ValidatedBatch管线：

| 入口 | 配置与计量 | 完成落点 |
|---|---|---|
| 普通V/L | 生效计划非模型限制、plan+model卡授权；计划→extra/访客额度 | 用户run/draft；L有效学习与签到 |
| 固定预设V/L | 完整已发布版本配置例外、不可篡改；仍扣本人/访客次数 | 同用户run/draft，后续原save/claim |
| 管理员预览A | 平台全部已支持配置，不套用户计划，不限业务次数 | 独立preview run+有效preview+用量；不学习、不奖励、不污染转化 |

浏览预设、打开工作台、改标题、领奖或复习均不调用AI。样文不能直接变成用户生成；不建模型结果缓存。提示词相同可能利用供应商既有缓存，但不承诺命中率/节省比例，不新增缓存提示或路由改动。

## 2. 内部接口与调用范围

现有`ai.Provider.Open(ctx,GenerationSpec) -> Stream`和`CheckCompatibility`保留供应商隔离。spec仅含服务端run/model/providerModelID、固定language/scenario/length/minimum_words、有序词条和版本；用户不可提供prompt/messages/provider参数。入口policy负责授权后再交Runner，Runner不懂积分、级别或浏览器导航。

为满足DATA-214，适配器增加类型化Usage观察回调（或等价返回元信息，实施中统一一条，不并存两种）：`CallUsage{call_no,provider_request_id?,input_tokens?,output_tokens?,cost_amount?,cost_unit?,status}`。旧Stream.Receive仅返回Candidate不足以覆盖终止后的usage帧；接收器必须消费完整终态/usage，再结束Receive，不以首个finish_reason立刻退出。元信息不进入Candidate/schema/prompt/公开用户SSE。

业务Runner为每逻辑run分配递增call_no，初始1、纠正/续写2/3；唯一(run,call_no)更新一次用量。调用开始登记unknown占位，末帧到达补字段；崩溃/取消未收到usage保留unknown，不按模型价目推算，不把未知写0。当前 DB-03 沿用原用量表定义，没有声明 ai_call_usage.completed_at 为 NOT NULL；保留 BE-01 的生命周期细化：在途NULL、终止填完成时间，恢复遇到unknown不伪造token/cost。不另加调用平台或个人数据字段，DDL实施时与DBA约束核对。业务用户额度仍每run一次。

OpenRouter官方说明usage随最后SSE消息提供，cost是平台扣费值、单位credits；这里存`openrouter_credits`并原样展示单位，不未经换算硬写美元。[官方用量说明](https://openrouter.ai/docs/cookbook/administration/usage-accounting)。完整帧若未知则显式null；提供方成本与用户产品次数是两种计量，不相互替代。

## 3. 模型参数与严格内容

继续固定stream=true、严格json_schema、精确一个配置模型、require_parameters、禁止训练路由；不新增跨模型fallback/自由路由。模型目录支持声明和实际探针共同决定可启用，供应商支持结构化输出不替代服务端词形/位置验证。[OpenRouter结构化输出说明](https://openrouter.ai/docs/guides/features/structured-outputs)。

模型内部响应只有：

```json
{"passage":"They learned(learn) together.","tags":["学习"],"targets":[{"source_entry":"learn","entry_meaning":"学习","hint_phrase":"learning(learn) through shared practice"}]}
```

格式示例，不满足短篇下限。顶层passage先输出；targets与输入等长同序，恰source_entry/entry_meaning/hint_phrase三键；未知字段/重复键/尾随/旧数组/空必需值失败。无offset/group/color/模型自证关系。公开结果去掉标注，后端计算Unicode code point 0基半开位置，所有重复/不同合法形式全覆盖，不把完整模型JSON直接透传。

英文短文与提示保持原内容规则；释义是原始词条的通用释义，只按entry+meaning_language，不按文章选义/派生形式缩窄，不引入词典API/第二次释义模型链。tags1–3目标语言短文级标签。只设正文词数下限，不设产品字数上限；现有16MiB候选传输防御值不代表正文最大词数。固定输入词库限制选词，不限制合法派生surface或普通正文词。

词形验证沿WordNet3.1直接词级关系、独立屈折规则与既有严格未知拒绝；不把模型自报、同义词、多跳词根或surface在词库当证明。清理后逐段复算全部span、全目标/重复覆盖、不重叠。保存/claim/读取已验证资源不再AI、不重新选义、不以新规则重校验历史内容。

## 4. 有限纠正、续写与SSE

每run初始一次加最多两次额外调用，纠正/续写共用预算；相同模型/原输入/context，probe不走循环。网络、HTTP、SSE协议、JSON解析错误直接失败，不做通用重试。仅完整候选中已分类可修正错误进入定向纠正；只改定位到的标注/hint/释义/tags，已经公开的干净正文不得改写，纠正不重复发正文。

结构关系通过但长度/覆盖不足时沿r10追加新段；服务端双换行追加，旧正文/词义/hint保留、更新tags，续写targets必须为空。每次合并完整终验，共享次数耗尽就失败，不用放宽校验救回。取消停止后续调用；所有call仍一个逻辑生成和一次业务扣额。

接收器处理任意UTF-8/JSON转义/SSE分帧，只在顶层passage字符串转发干净增量；心跳comment与usage帧不作为正文或第二次终态。OpenRouter流中错误可能在HTTP200后以error帧出现，不能当成功；最后usage帧可能重复finish_reason，不能重复结算。[官方流协议](https://openrouter.ai/docs/api_reference/streaming)。

应用事件仅API-005 started/delta/validated/failed/cancelled，预览使用独立preview终态；no-store、Nginx关缓冲、无Last-Event-ID回放。用户取消由专用接口确定；断流、服务停机、模型错误、校验失败退款，主动取消不退。取消上游连接不保证供应商停止所有计费，真实用量可能unknown，不伪称AI调用免费。

## 5. 权限快照、结算和隐私

数据库预检锁内确定run配置、模型身份和真实charge来源，释放锁才请求供应商。预设版本在开始时固定，模型停用/正式下架或权益到期只阻新请求，不改变在途已授权基线。valid后一个app事务提交draft/charge/学习签到成长/分析；预览则提交preview与独立用量。失败恢复必须查charge/原extra，不能只更新旧quota_charged标志。

用量写入失败不自动再调用模型；在开始记录已持久的情况下，终态事务无法确认不发布完整成功，按原CAS恢复；上游实际成本可能无法追回，平台业务失败退款仍执行。用户run与preview run的用量FK互斥，不能捏造管理员learner或无扣额有效user run绕现有CHECK。

普通日志不存prompt、正文、释义、提示、回答或token。CR042仅沿原专用账号最近50次/最长24h有界私有取证，不将管理员预览或所有用户加入，不输出到平台分析。分析明细90天仅记录固定事实；AI原文不是分析payload。密钥仍AES-GCM信封加密/独立部署主密钥、日志永不解密输出。

## 6. 验证、上线与未解决限制

先fake provider覆盖三入口共用校验、流任意分块、多call usage、usage缺失/重复、取消/断连、下架在途、失败原来源退款、预览发布版本竞争；对应BE2-V06/07/16及DB2-V。Goldens使用现有v5/r10和C40原词释义样例，保留不合格样本，不改expected值掩盖失效。

管理员显式启用模型仍只一次最小真实探针，在外部请求后重新核对模型revision；部署/启动不自动调用所有模型。不将本次设计/用户“下一步”解释为真实采样预算。真实质量评估须明确模型/次数/预算后单独执行，不能用静态schema/race测试声称语义质量≥90%。

保留 [CR039-L1](../../M001/changes/CR-039.md#retained-limitations) safe→safety/safely被拒绝及safer未验证；[CR042-L1](../../M001/verification/CR-042-generation-evidence.md#retained-limitations)未知标注反馈/单回复replay限制；[AI-QUALITY-90](../../M001/verification/ai-evaluation.md)未验证。本期不顺带扩大词法支持、诊断平台或在线语义拒绝机制。

BE-01 已完成的代码/官方文档核对证据保留；BE-03 只同步数据库版本与交接状态，AI 调用策略、依赖和验证边界沿 BE-02 不变。本轮未请求供应商、未安装依赖、未测模型质量。CR-003 设计接收已由 012 关闭；[CR-004](../changes/CR-004.md) 的管理员选项属于只读接口补齐，不新增 AI 调用。工程实现仍须等完整技术交接获批。
