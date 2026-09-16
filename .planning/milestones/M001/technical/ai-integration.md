---
milestone: M001
stage: technical-design
role: backend-architect/base
agent_name: backend-alex
status: ready_for_scoped_gate
date: 2026-09-16
current_change: R10-ARCHITECTURE-SYNC
current_change_status: ready_for_scoped_gate
confirmed_scope: [USER-INLINE-MAPPING-115, USER-UAT-ACCOUNT-129, CR-042-RETENTION]
decisions:
  - DEC-026
  - DEC-027
  - DEC-029
  - DEC-032
  - DEC-035
  - DEC-036
---

# M001 AI 集成设计

> r10 已实施并经 QA132 定向验证，当前候选已通过用户 UAT；本轮仅补齐已批准的[有限纠正／续写说明](#r10-corrections)。CR042 的采集与留存规则沿[后端 §10](./backend.md#generation-evidence-042)，实施与验收以[当前 QA 报告](../verification/report.md)为准。同步前原文已[冻结](./archive/pre-m001-closeout-136.json)，原词释义、公开 API、数据库与前端表现不变。

## 1. 目标与边界

M001 只接入 OpenRouter，但业务层不暴露 OpenRouter 的请求格式、流事件名称或错误码。浏览器、额度、存储和复习模块只依赖供应商无关的生成契约。未来增加 OpenAI API 或其他中转平台时，通过新增适配器接入；是否能复用当前的“原生结构化流”方案，由新平台能力决定。

M001 的生成输入只有以下四项：模型、释义语言、场景、长度，以及从服务端词库选出的目标词条。用户不能提交自由 prompt、系统指令、消息数组、温度、token 上限、供应商路由参数或任意扩展字段。HTTP 解码器必须拒绝未知字段、重复字段和尾随内容。

DEC-035 的短文同词匿名分组不是 AI 输出字段，也不改变 Prompt、JSON Schema 或校验器版本。它是 Review 模块在读取已验证 `passage_occurrences` 后构造的安全投影；模型和供应商适配器均不知道 `group_key`、颜色或纹理。

## 2. 供应商无关领域契约

### 2.1 输入

`GenerationSpec` 由服务端在权限校验后构造：

| 字段 | 含义 | 来源 |
|---|---|---|
| `run_id` | 本次生成运行标识 | 服务端 |
| `actor_id` | 访客或账号主体 | 会话 |
| `model_id` | 已授权且启用的模型 | 组别策略 |
| `meaning_language` | `zh`、`en` 或 `ja` | 严格枚举 |
| `scenario` | `discussion`、`story`、`business` 或 `news` | 严格枚举 |
| `length_code` | `short`、`medium`、`long` 或 `xlong` | 组别策略 |
| `minimum_words` | 所选长度的词数下限 | 服务端配置 |
| `entries` | 1..组别上限个规范词条 | 固定词库 |
| `prompt_version` | 模板与校验规则版本 | 服务端发布物 |

### 2.2 流输出

适配器向应用层只产生以下事件：

- `PassageDelta(text)`：已经安全解码且已移除原词标注、属于 `passage` 字段的新增干净文本；不允许前端收到标记后再回删。
- `ProviderUsage(input_tokens, output_tokens, cost)`：若供应商返回则记录；不作为业务成功条件。
- `ProviderCompleted(raw_candidate)`：完整结构化候选对象。
- `ProviderFailed(category, retryable, diagnostic)`：归一化后的供应商失败。

应用层只将 `PassageDelta` 转发给浏览器。标签、释义、短语和位置等内容必须等完整候选通过校验后一次性下发，避免用户看到随后会被拒绝的结构化结果。

### 2.3 归一化错误分类

| 分类 | 示例 | 用户结果 |
|---|---|---|
| `authentication` | API key 无效 | 失败并返还额度 |
| `authorization` | 模型或供应商不可用 | 失败并返还额度 |
| `rate_limited` | 上游 429 | 失败并返还额度，可稍后重试 |
| `provider_unavailable` | 上游 5xx、连接失败 | 失败并返还额度，可稍后重试 |
| `protocol_error` | 非法 SSE、非法 JSON | 失败并返还额度 |
| `schema_error` | 不符合输出 schema | 失败并返还额度 |
| `content_invalid` | 未覆盖词条、长度不足、位置错误 | 失败并返还额度 |
| `cancelled_by_user` | 主动取消 | 取消且不返还额度 |

错误诊断只写入受控日志，不把供应商响应体、prompt、API key、内部模型标识或堆栈返回浏览器。

## 3. M001 OpenRouter 适配器

### 3.1 调用约束

适配器调用 OpenRouter Chat Completions 接口，并固定：

- `stream: true`；
- `response_format.type: json_schema`，使用严格 schema；
- 精确指定管理员配置的一个模型，不做跨模型回退；
- 要求所选路由支持请求参数，避免结构化输出参数被静默忽略；
- 禁止允许数据训练的上游路由；
- 不接受浏览器传入任何 OpenRouter 参数。

供应商路由沿管理员所选模型与现行适配器配置，不增加跨模型回退。传输失败不自动重发；同一生成内的内容纠正／续写仅按下节执行。用户收到最终失败后可主动发起新的生成。

<a id="r10-corrections"></a>
### 3.1.1 r10 有限纠正与续写（已实现行为）

确认来源为 [TRANSITION-M001-135](../reviews/stream-failure-capture-gates.md) 所接收的 r10 规则及本次用户“收尾吧，收尾之后整理 commit 提交两边（agt 和 项目）的代码”。此处同步现有行为，不引入新设计或模型预算。当前 prompt 为 `m001-v5-r10`；schema、validator 与词法资产沿现行实现。

- **共享上限**：一次初始生成后，内容纠正和长度／覆盖续写合计最多两次额外调用，即每 run 最多三次调用；同一模型、原始输入及取消 context 不变。能力探针不走此纠正循环。初次接收、网络、HTTP、协议或 JSON 解析失败直接交既有失败结算，不以通用重试救回。
- **纠正条件**：只有完整候选进入校验后，已分类且可纠正的正文标注、hint、原词释义或标签错误才进入定向纠正；标注语法必须仍能还原干净正文。精确规则由 `correctable` 枚举，不能将所有校验失败推为可修复。正文纠正只能改标注，必须逐字保持已经展示的干净正文；hint／释义只替换定位到的原词字段，标签只替换标签，其他资源保留。纠正流不重复发送浏览器正文。
- **续写条件**：先通过允许暂缺长度／正文覆盖的结构与关系检查，且没有优先需要纠正的标注错误，再针对词数不足或目标未覆盖请求新段落。服务端以两个换行追加，保留原正文、释义和 hint，更新全文主题标签；续写响应的 targets 必须为空。只有新增的干净段落进入原 SSE 流，不重写此前预览，不降低字数／全目标覆盖要求。
- **严格终验**：每次合并后仍按原 schema、独立词形关系、全目标／全部重复位置与原词释义规则验证；最终成功前完整校验。正文被改写的纠正候选拒收；若尚有剩余次数，可反馈该原因再尝试，仍受共享两次上限约束。共享两次机会用完后仍不合格，或遇到其他不可恢复失败，走原失败终态，不能把部分正文变为可保存草稿。
- **计量、取消与前端**：所有上游尝试属于同一 run，只有一次业务额度预占和一次数据库终态结算。上游调用成本与业务次数分别理解；取消停止后续尝试，主动取消沿既有计费，系统失败沿退款／后台恢复规则。成功后才能发 validated 并保存；公开 SSE 事件、UI 状态与退款 true/false 的前端表现保持现状。
- **证据与限制**：[QA132](../verification/evidence/closeout-132/qa.json) 的八条合成链路覆盖成功、两次纠正、续写、耗尽、取消、离开、JSON 失败及退款恢复；[当前 AI 评测](../verification/ai-evaluation.md)保留真实小样本及失败原因。采集多次回复以 model_end 分段；现有单回复离线 replay 不能直接回放整包。safe 派生、未知标注定位精度和长期 ≥90% 成功率仍未解决／未证明，停止调优不等于豁免。

实现定位：[continuation.go](../../../../backend/internal/ai/continuation.go)、[生成服务](../../../../backend/internal/generation/service.go)。追踪：CAP-008/009/010 → API-005/006 → DATA-010/011/012/013；PAGE-004。正式关闭与已知限制处置沿[收尾记录](../reviews/stream-failure-capture-gates.md)。

### 3.2 严格输出结构

USER-INLINE-MAPPING-115 / v5：所有对象关闭额外字段，target精确三个键；passage和hint_phrase含模型就地标注，只有后端能读取原始标注：

```json
{
  "passage": "They learned(learn) together and kept learning(learn).",
  "tags": ["学习"],
  "targets": [
    {
      "source_entry": "learn",
      "entry_meaning": "学习",
      "hint_phrase": "learning(learn) through shared practice"
    }
  ]
}
```

上例是格式说明，不声称达到短篇词数下限。passage仍为首字段，tags为目标语言1–3个短文标签，targets与输入等长同序，source_entry精确等于规范输入，entry_meaning仍为目标语言1–500 rune原词释义。旧数组/旧释义键/双协议/null/重复key/未知字段/尾随内容拒绝。

详细语法及防护唯一见[CR039 §3](./backend-cr039.md#3-模型内部协议v5替换数组)：每目标每段有有效标注，重复/漏标的已知形式仍独立补扫；自然括注不能全局删除；清理后计算词数、hint长度和全部位置。模型不返回offset、组号、颜色、proof、置信度或单独forms数组。正文和hint去标注后才进入ValidatedBatch/公开DTO/持久化，原始标注不被当作可信关系。

<a id="cr040-prompt"></a>
### 3.3 Prompt 组装

系统 prompt 和任务模板随应用版本发布，使用版本号和摘要标识。模板明确要求：

- 写一篇自然、连贯的英文短文；
- 包含全部目标词，允许合法词形变化；
- 普通正文词不受输入词库限制，目标的合法派生词也不必在冻结输入词库；正文与本项hint的实际形式就地附加(规范原词)，不再独立列数组；
- 满足场景与词数下限，不设置词数上限；
- 短文标签仍基于整篇文章，用目标语言生成；原词释义独立遵循下述专用指令，不共用文章选义规则；
- 给出英文提示短语，但不翻译整句或短语；提示短语允许同一目标以相同或不同合法词形自然出现多次；
- 严格返回 schema，不输出解释或 Markdown。

用户词条、枚举配置和服务端数值以序列化数据块注入，并在 prompt 中声明为“数据而非指令”。不过，真正的防护边界是固定词库、严格 HTTP schema、服务端枚举和适配器固定参数，而不是单靠 prompt 文案。

**释义指令（CR-040）**：替换现有 `userPrompt` 的 “contextual meaning” 和 “part of speech in context” 两项要求；不是在旧要求后追加一段相互冲突的提示。系统/任务模板、schema 描述、能力探针和当前测试模板均不得再要求用文章、场景、提示或派生形式选义。短文仍先输出，释义只在完整校验后下发。

供实现采用的专用指令：

```text
For each source_entry, return one concise entry_meaning in meaning_language.
Define the selected original entry itself, using only that entry and meaning_language as the semantic basis.
Do not choose, narrow, or change its senses or part of speech based on the passage, scenario, hint phrase, passage_forms, hint_forms, or any derived form.
Do not add its role in the passage, plot commentary, grammatical analysis, or explanations beginning with "in this passage".
For polysemous entries, provide concise general meanings without using the passage to select or exclude senses. Do not try to enumerate every dictionary sense.
Brief synonymous explanations may share one string; do not add a fixed sense count. In English, give a definition, not just the entry spelling.
```

产品边界及人工正反例只引用 [原词释义规则](../product/ai-behavior.md#original-entry-meaning)，不把示例写成模型唯一期望文案。不会拆成第二次请求，不将模型输出的派生映射送入另一条释义计算链，也不会引入词典释义查询/缓存。WordNet 继续仅供 CR-039 词法关系核验，不能拿它为模型按文章选择释义。

同一次模型调用仍共享上下文，上述规则不能提供数学意义上的依赖隔离。该残余风险必须在 C40 定向人评中检验；失败时报告原始内容，不以删分号、截尾或关键词黑名单伪造合格结果。

## 4. 流式解析与浏览器协议

OpenRouter SSE 可以把 JSON 字符串任意切块。增量解析器必须：

1. 按 SSE 帧解析供应商事件，不假设一帧对应一个 JSON token；
2. 增量解码 UTF-8、JSON 转义和 Unicode 代理对；
3. 只在确认当前位于顶层 `passage` 字符串时产生 `PassageDelta`；
4. 将完整 JSON 同时缓存在内存中，用于最终解析和校验；
5. 在语法不完整、属性顺序变化、重复属性或尾随对象时判为协议失败；
6. 永不把供应商原始事件直接透传给浏览器。

浏览器看到的是应用自有 SSE 事件：`generation.started`、`passage.delta`、`generation.validated`、`generation.failed` 和 `generation.cancelled`。心跳使用 SSE comment，不建立可恢复游标；页面刷新或断线后不能续传。

由于浏览器可能已经看到随后校验失败的正文，失败事件必须让前端将该预览标记为不可保存，并给出重新生成入口。只有 `generation.validated` 才产生可保存的草稿。

## 5. 确定性校验流水线

所有校验在 AI 调用完成后、生成运行进入 `valid` 终态前执行。任何一步失败都不会部分保存。

### 5.1 结构与基数

- 完整响应只能有一个 JSON 对象，符合严格 schema；
- `targets` 数量和顺序必须与输入词条完全一致；
- 标签数量为 1–3，标签、释义、短语均为非空规范化字符串；
- 字段长度设置防御性资源上限；该上限防止异常响应耗尽内存，不代表用户可见的短文词数上限。

### 5.2 词数与语言

- 正文词数使用版本化的服务端分词算法计算：连续 Unicode 字母或数字构成词，内部撇号与连字符仅在两侧均为字母数字时归入同词；
- 只校验所选长度的词数下限，不设置产品层面的词数上限；
- 正文必须为英文；标签和释义必须符合目标语言。M001 使用脚本分布与允许字符的确定性检查，并通过中英日参考样例测试，避免再调用第二次 AI；
- `meaning_language=en` 时，释义必须为英文释义而不是原词的机械回显。

### 5.3 词形、短语与出现位置

映射规则沿用已批准的 [CR-039 §4–5](./backend-cr039.md#4-独立关系验证)，本次不重开覆盖边界：

- 原词精确关系、经词性/异常对及正向规则验证的屈折、WordNet 3.1 直接词级派生关系分别处理；不使用表面词的 DATA-001 成员资格作判断。
- 不把 WordNet 查到 lemma、同义 synset 或模型自报关系视为正确性证明；不自动放行未知映射、无关同义词或任意多跳词根扩展。
- 验证每个标注紧邻的实际形式关系及本段归属；在去标注后的正文/提示补扫全部已知原词和异形。漏标不留下已知同目标可见位置，错误标注不能被补扫“修复”。
- 每个目标至少一个正文位置和一个提示位置；重复/交错位置全部记录，提示仍只对应一次原词作答。正文跨目标争用/重叠整批失败，不能由模型排序抢占。
- 所有 offset 来自去标注后干净文字的 rune 扫描，surface 为精确干净文字子串；使用 Unicode code point、0 基半开区间。匹配折叠不能改变 offset 坐标源；位置最终复算，排序和非重叠要求不变。
- 本地资源能验证词法关系，不保证全英语覆盖或句中词义正确；unknown 关系仍失败并返还产品额度，不增加第二次在线 AI 校验。

当前模板/逻辑schema为m001-v5，validator为m001-v5-wn31-r1；词法资产与关系算法不变。更新来源元数据不等于真实质量已验证。ValidatedBatch形状仍为当前entry_meaning与occurrence结构，不新增旧数组reader、转换、双读或数据清理；不重校验已验证资源。

### 5.4 原子发布

验证通过后，应用一次性构造不可变候选快照。每个 `ValidatedTarget` 只包含规范词条、`EntryMeaning`（JSON `entry_meaning`）、提示短语、非空 `HintOccurrences []Occurrence` 与非空 `PassageOccurrences []Occurrence`；不再保留单数 `HintSurface`/`HintBlank`。快照同时包含正文、短文标签、词数和校验器版本。随后通过 CAS 将生成运行从 `generating` 更新为 `valid`。CAS 失败说明取消或其他终态已获胜，不得再发布结果。

当前快照 reader/writer 使用同一严格形状，缺少 `entry_meaning` 或包含旧释义键时拒绝，不允许普通 JSON 解码忽略旧键后把空值继续保存。只校验当前快照的结构/必需值及已有位置不变量，不在保存、claim、重启读取或复习时重新调用模型、重新选义或重跑新词法规则。原字符串从生成到保存再到读取保持一致；字段改名不改变已有 CAS、所有权、token 与事务边界。CR040历史字段切换已完成；本次不重开清理或增加reader兼容分支。

安全挖空由已验证 span 构造：按升序 cursor-walk 或按降序切片，逐个保留 text segment 并替换每个 span；不得对 surface 做全局字符串替换。提示短语可从 blank 开始或结束，空 text segment 省略。阶段一即使有多个 blank，也仍只校验一个规范原词答案。

### 5.5 复习匿名分组的下游边界

- `ValidatedTarget.PassageOccurrences` 与正式库中的 `passage_occurrences.target_id` 已完整表达同源关系；不得要求模型增加组号、颜色或目标 ID 输出，也不为 DEC-035 再次调用模型。
- Review 模块按正文 offset 扫描全部 occurrence，并在首次遇到某目标时建立内部组序。该顺序不得来自模型 targets 顺序、用户选词顺序或会话随机词条顺序。
- 学习者只取得当前 passage item 范围内的随机不透明 `group_key`；同一目标全部 occurrence 共享，不同目标不同。键不参与 AI 校验、保存、答案比较、计量或模型兼容性判断。
- 生成结果与批次详情仍可按其原有学习资源用途展示词条和表面形式；“不泄露原词”的限制专门适用于复习题面安全投影，不能误删正式学习记录内容。

## 6. 模型兼容性与管理员操作

新增模型默认禁用。管理员启用前，后端执行：

1. 从 OpenRouter 模型目录读取该模型是否声明支持结构化输出；
2. 用不计用户额度的最小固定样例执行一次真实的流式结构化调用；
3. 验证流式正文提取、最终 schema、同 surface 重复位置、不同合法词形位置和安全多挖空均成功；
4. 记录兼容性检查时间、模板版本和结果后才允许启用。

编辑已启用模型的供应商模型标识会先自动禁用，必须重新检查。发布前以所有已启用模型 × 三种释义语言 × 四种场景 × 四种长度跑兼容性矩阵；耗时较长的矩阵属于发布验证，不在管理员每次启用的同步请求中执行。

当前同一次探针保留learn重复/异形提示与vulnerable/vulnerability，改成就地标注和v5 schema；原词释义指令及词法verifier不变，同时验证流式clean text一致。这里的模型“兼容性检查”是当前供应商能力验证，不是旧版数据/客户端兼容。不得在启动/升级时自动触发调用、重置 key 或停用用户模型；既有v4证据不证明v5合格。后续需经授权取得当前协议证据；本轮只交付 §10.1 的定向验证输入，不自动执行上面的全配置矩阵。

若没有配置全局凭证、没有启用模型，或当前组没有可用模型，生成接口在开始流式响应前返回稳定的配置错误，不扣额度。

## 7. 取消、失败与额度结算

- 额度在调用供应商前通过数据库事务预占；
- 用户主动取消通过独立接口触发，CAS 抢占终态并保留扣费；
- 浏览器断线只取消下游写入，不等同于用户主动取消；后端应立即取消上游请求，CAS 为系统失败并返还额度；
- 供应商错误、解析错误、校验错误、服务端关闭均返还额度；
- 同一运行不切换模型、不重发传输失败请求；[r10 内容纠正／续写](#r10-corrections)共享最多两次额外调用，仍只做一次业务结算；
- 运行终态与额度结算在同一事务中完成，重复取消或迟到的供应商完成事件只能读到既有终态。

AI HTTP 客户端设置连接、TLS、响应头和空闲读取超时，但不设置总生成时长上限。SSE 每 15 秒发送注释心跳；只要持续有有效数据或心跳，长文本生成可继续。

## 8. 隐私、安全与可观测性

CR042的唯一详细方案为[后端§10](./backend.md#generation-evidence-042)：用户已采用专用账号最近50次/最长24小时留存，正文原文在业务解析之前进入隔离证据通道；成功、失败和取消均关联阶段、版本和结算事实。普通日志禁记内容的规则不变。Observer不更改Prompt、schema、领域DTO、规则次序或失败判定，不再并存旧单条采样模式；当前实施、专项验证和本地启用已由 QA132／134 接收；这不授权重新部署或追加采样。

OpenRouter接收器需观察而非猜测实际终止元数据；安全提取的model_text支持共用生产解析/校验的离线回放。提供方坏外壳、未收到、截断、脱敏或版本缺失均明确限制，不把部分内容称为完整回放。各字段、资源/隐私边界和验收只在后端§10维护，以下通用规则继续适用。

- OpenRouter key 使用应用层 AES-GCM 信封加密保存；密钥来自部署环境，日志永不打印明文或解密后的值；
- 日志默认只记录 `run_id`、内部模型记录 ID、prompt 版本、校验阶段、持续时间、归一化错误类别和 token/cost 数值；Review 日志不得记录 `group_key`；
- 不记录完整 prompt、正文、释义、提示短语、Cookie、CSRF token 或能力 token；临时排障采样必须显式开启、限时并脱敏；
- 指标至少包含生成请求数、首段延迟、总时长、主动取消、被动断线、供应商失败、schema 失败、内容校验失败、返还额度、模型兼容性检查结果和提示 occurrence 数量直方图；校验原因只使用 `hint_occurrence_missing`、`hint_occurrence_overlap`、`passage_occurrence_collision` 等低基数枚举，不以词条/surface/短语作 label；
- 对结构化输出异常率、失败率、长时间无数据连接和同一模型连续失败设置告警；
- 上游请求选择禁止训练数据路由，并仅发送完成任务所需的目标词与配置。

## 9. 扩展其他模型平台

未来平台接入必须实现相同的领域接口和错误分类。平台能力分为三档：

| 能力 | 接入策略 |
|---|---|
| 原生严格结构化流 | 直接新增适配器，可复用当前体验 |
| 只支持文本流或非严格结构化输出 | 需新技术决策，评估增量正文与最终结构的两阶段方案 |
| 不支持流式输出 | 不满足当前生成体验，除非产品批准体验降级 |

新增平台可能需要调整模型与凭证表，因为 M001 数据模型明确以 OpenRouter 为中心；具体范围另行设计。本节不预先批准向后兼容，任何旧版支持都须遵守 USER-COMPAT-001 专项告知/决定。供应商扩展保持领域边界，不因平台差异直接污染浏览器 API、生成状态机、额度和学习模块。

## 10. AI 验证清单

以下为既有全局验证基线，不是全量执行授权。本次只按[CR039 §11](./backend-cr039.md#11-定向验收不是已通过结果)验证就地标注受影响链路，并保留§10.1原词释义保护；无真实模型预算。

- 用随机字节边界拆分 SSE 与 JSON，验证正文增量拼接等于最终 `passage`；
- 覆盖 JSON 转义、emoji、日文、代理对和网络半包；
- 覆盖规则词形、不规则词形、大小写、词边界、同一 surface 出现多次、不同合法词形同时出现、多词词条、短语首尾命中、碰撞和重叠；
- 覆盖三种目标语言、四场景、四长度和多目标词；
- 证明 schema、语义或位置失败时不会产生可保存草稿且额度返还；
- 证明主动取消、被动断线与迟到完成事件只产生一个终态；
- 证明未知 HTTP 字段和夹带 prompt 的请求在调用供应商前被拒绝；
- 对每个已启用模型保存兼容性检查证据，并在发布前跑完整矩阵。
- 证明生成结果和批次详情只返回复数安全位置，阶段一把全部提示位置挖空但只接受一个原词答案；任何复习响应、日志或指标都不能还原被挖文本。
- 证明匿名同词关系只由已验证 `passage_occurrences` 下游派生，不改变 AI schema/prompt/validator 版本，也不产生额外模型调用；同词多形态与多目标交错样本能稳定形成正确等价关系。

<a id="cr040-verification"></a>
### 10.1 CR-040 定向技术验收输入

这里只定义后续验证方式，尚无新测试结果。C40 的产品条件以 [AI 行为 §9.1](../product/ai-behavior.md#cr040-acceptance) 为准。

| 产品条件 | 自动化证据（后续实现/QA） | 人工内容证据（另行授权真实调用） |
| --- | --- | --- |
| C40-01/02/03 | 提示词断言覆盖中英日与场景组合，移除原有语境选义指令；固定 fixture 换文章/形式不改变预置原词释义，分号原样保留。fixture 只能证明数据处理，不证明模型独立性。 | 覆盖三种释义语言；同一原词/语言更换场景和正文形式，检查解释对象/词性不被文章带偏，不要求逐字相同。多义词不按文章排除义项。 |
| C40-03/05 | vulnerable/vulnerability、alleviate、同目标重复/异形和多目标交错样本验证 mapping/offset/全部挖空不变；阶段一原词、阶段二实际表面形式答案保持。 | 核对 vulnerable 不被定义为派生名词，简洁近义释义不被截断；短文自然度、文章 tag 与无整文/短语翻译保持。 |
| C40-04 | 当前形状的 raw candidate → validated → SSE → 草稿 → save/claim → DB → learner/admin detail → spelling item/下一题，全链路字符串相等；含保存重试、重启、事务失败和现有权限检查。 | 对同一批次核对所留模型原始样本与实际展示/复习；界面不得偷偷截尾或追加用途。 |
| C40-06 | 严格 schema 覆盖仅新键合法，旧键/双键/缺失/null/非字符串失败；必需字段与大小/语言规则仍生效。完整 SSE 前不发布 targets，系统失败退款、主动取消不退款，均不新增模型调用。 | 结构 PASS 和语言质量结论分栏记录；未调用的模型/配置标未测，不沿用 v3 或历史 UAT 的接受。 |

定向样本优先复用用户提供的两组词和已有 CR-039 的重复/派生样例；多义原词用固定输入词库中的条目。真实采样时记录脱敏的原始结果、配置、模型、模板/schema/validator/资产标识和人工判定，保留不合格样本；具体模型、调用数量/预算和本地暂存位置先确认。本设计不设新的 30 秒总时限、不进行自动重试/多模型补救。脚本字符分布、长度和词法校验仅证明各自的确定性条件，不新增在线语义自动拒绝或退款机制。
