---
milestone: M001
stage: technical-design
role: backend-architect/base
agent_name: backend-alex
status: ready_for_scoped_gate
date: 2026-09-09
change_request: CR-039
confirmed_scope: [USER-INLINE-MAPPING-115]
public_api_version: v1.5
proposed_prompt_version: m001-v5
proposed_validator_version: m001-v5-wn31-r1
---

# CR-039：就地原词标注、独立验证与干净文本定位

## 1. 确认闭环与范围

[用户确认](../verification/stream-failure-diagnosis.md#inline-source-annotation)与[115接收](../reviews/stream-failure-capture-gates.md)：正文和hint用实际形式(原词)，后端提取；流式及最终展示不显示标注。原词释义、独立关系证明、全部目标/重复位置、同词分组与两阶段答案不变。未采用的数组剔除假设不实施；不引入旧数组兼容、第二次调用或自动重试。

本方案为已确认方向的技术落实，不新增产品选项、词库限制、收费服务或UI变化。原数组方案及当时验证保存在[修订前完整快照](./archive/pre-inline-mapping-115.json)，稳定C39编号继续使用。§4保留原已批准词法规则及其当时资料来源；本次不重新选型/下载/更新资源。旧文档的兼容建议已由USER-COMPAT-001撤销，不再作为实现任务。

实际样本seed/read的hint数组多报导致失败；新表达把关系放到使用位置，消除单独维护分段数组这一错误来源，但不能保证所有模型遵循格式或词法关系全部可验证。不是对真实失败率的测试结论。

## 2. 责任与数据流

| 环节 | 本次职责 | 追踪 |
| --- | --- | --- |
| OpenRouter adapter | v5 prompt/schema、严格Candidate解码；只向应用层发去标注后的passage增量 | CAP-008/009，API-005，DATA-010/011 |
| annotation parser / Validator | 提取不可信source标注，验证紧邻surface的词法关系，再在干净文字上补扫全部位置 | CAP-008/009，DATA-011 |
| Generation / Learning | 既有CAS、当前快照、save/claim及原词释义直通，字段和事务不改 | CAP-010/011/014，API-006/007，DATA-012/013/017 |
| Review | 只读现有可信occurrences；阶段一原词、阶段二实际surface、全部位置挖空及匿名组不变 | CAP-018/019，API-008，DATA-013/014/015 |

原始Candidate的正文/提示保留模型标注直到Validator处理；流式回调单独使用同一语法的清理器，不把原始Candidate传给浏览器。最终ValidatedBatch只含干净文字、原词释义和可信位置。无新持久化实体、公开字段或前端解析器。

<a id="3-模型内部协议v3-草案"></a>
## 3. 模型内部协议（v5，替换数组）

逻辑示例（用于结构说明，不声称达到short词数下限）：

```json
{
  "passage": "She bought grapes(grape) and shared a grape(grape).",
  "tags": ["生活"],
  "targets": [
    {
      "source_entry": "grape",
      "entry_meaning": "葡萄",
      "hint_phrase": "fresh grapes(grape)"
    }
  ]
}
```

### 3.1 Schema与提示词

- 顶层passage/tags/targets、passage首字段；每target精确三个键source_entry/entry_meaning/hint_phrase。旧passage_forms/hint_forms、旧释义键、双协议、额外字段/null/重复key/尾随JSON均拒绝，不设降级分支。
- targets仍与输入等长同序、source_entry精确等于服务器规范输入。marker内也引用规范输入，而不是lemma猜测、ID、同义词或模型自报置信度。
- 正文/本项hint中的目标实际形式紧接ASCII括号原词；原词未变化时也标，如grape(grape)。提示自然搭配，不输出词典式作用说明或翻译。不得在entry_meaning/tags中夹带标注。
- Prompt要求标记所有目标使用位置；服务端仍独立补扫已知漏标位置，避免把模型漏标变成复习答案泄露。每个目标的正文与自己的hint至少有一项有效声明，沿原“每段非空映射”要求；全部未标注不是旧协议fallback。
- 释义模板只按输入词与目标语言解释，不依赖文章、场景、标注或派生；保留多义和分号，不能截尾或自动二次重写。
- 保留16MiB整个候选防护。内容限制按去标注后的文字计算：正文2,000,000 rune、hint500 rune；为标注预留原始字符串容积，hint schema上限为500×(128+3)=65,500 rune，正文raw受现有总候选防护。不是新增产品词数上限。词数只计clean passage。

### 3.2 语法与普通括号

- 协议标记为紧贴词尾的`surface(source_entry)`；ASCII括号内source必须是本次输入之一，且无首尾空白。多词输入原样放入括号，例如`coups d'etat(coup d'etat)`。
- 紧贴词尾的括号位置保留给映射；不能把不认识的source、嵌套标记或错误结构当普通文字放行。正常括注使用常规空格，如`grapes(grape) (fresh fruit)`，显示`grapes (fresh fruit)`；普通括注中仍可含合法标记。
- 不能全局删掉所有括号；普通括注保留。解析使用括号状态/分组处理，未闭合或含歧义的标记失败，不输出待定标注字符。使用源词作为正常括注而又与标记无法区分时，不擅自猜测修复。
- 提取marker在clean text中的词尾位置。实际surface从该位置向前匹配该原词的已知合法完整形式，按现有词边界/最长多词形式规则验证；只有紧邻匹配才成立，不能从正文另一处借用正确形式。无法找到已知紧邻形式时，保留unknown/rejected分类而不是只删括号继续。
- hint中的声明只能归属本hint的source_entry；其他目标不能冒充本hint覆盖。正文则按marker原词归属。所有已知位置仍独立扫描，模型不能凭不同标注覆盖既有跨目标冲突检查。
- 标记移除后接续字符可能改变词边界，必须在完整clean text上核对已声明span与扫描结果，不接受`grapes(grape)vine`这种借去标注拼出词内命中。

### 3.3 流式清理与最终一致性

- 保留现有增量JSON解码及UTF-16代理对/UTF-8半包保护。在回调onPassageDelta之前增加标注状态机；不能先发原始文本再由前端修补。
- 可以立即发送已确定的正文文字；遇到括号待定组则缓冲到可判定。标记组丢弃、普通括注输出清理后的原文；分块位于左括号、原词任意字符、右括号或JSON转义时均不得闪现标注。
- 清理器与最终解析共用同一语法实现/基础函数。完成时验证累计已发clean passage与最终clean passage一致；不能依靠字符串替换或重新排版让两者不同。
- 未闭合组、畸形结构、上游截断、取消不flush待定原文；沿既有失败/取消路径结束，无部分草稿。缓冲有现有候选容量防护，处理长内容检查context；不新增30秒总生成时限。
- Hint不新增流事件，仍在完整校验后随generation.validated发布。其他将来的Provider必须实现同一干净增量契约；本次不接入新平台。

## 4. 独立关系验证

### 4.1 只读资源与可复现性

建议在 `backend/assets/lexicon/` 提交构建期生成的压缩词法资产、manifest 和许可声明，与应用一同发布。该目录与冻结 `backend/assets/vocabulary/` 分离，不更改词库/词表查询/DB词表权限。运行和正常 Docker build 不联网下载，不启动 Python/NLP 服务。

建议数据源为 [Princeton 官方 3.1 字典包](https://wordnetcode.princeton.edu/wn3.1.dict.tar.gz)。本次取得 16,358,468 字节，SHA-256 `3f7d8be8ef6ecc7167d39b10d66954ec734280b5bdcd57f7d9eafe429d11c22a`。这只是本次观测摘要，不是发布方签名；构建器锁定来源、摘要、parser 版本和生成资产摘要，任何变化需重新审阅。

只转换词条/词性、词级派生边及异常词形；保留定位证据（POS、synset offset、source/target word index），不引入整套词典例句或词义展示功能。Princeton 已停止继续开发，不能宣称该资源覆盖不断新增的英语用法。[项目现状](https://wordnet.princeton.edu/)

许可允许按条款使用和分发，但须保留版权/许可/免责声明与署名。该字典压缩包的列表未见独立 LICENSE；构建器需从 index/data 的许可证头完整保留声明，再附官方来源说明，不因目录里没有 LICENSE 就省略许可证。[许可](https://wordnet.princeton.edu/license-and-commercial-use)、[文件格式](https://wordnet.princeton.edu/documentation/wndb5wn)

### 4.2 接受关系的证据

每对 `(entry, surface)` 按以下顺序判断；不得查询 surface 是否属于 DATA-001：

1. **原词**：按既有不区分英文大小写规则相同，直接成立。即使目标不在 WordNet 中，也不能拒绝合法的冻结输入原词。
2. **屈折**：优先复用经回归验证的本地不规则形式，并用 WordNet POS/异常对与正向形态规则证明其变化。规则按名词/动词分别执行，不能对只有形容词词性的 vulnerable 生成 `vulnerabled/vulnerabling`。多词项沿用明确异常对，如 `coup d'etat → coups d'etat`，不把任意单词替换扩展为短语同义转换。
3. **直接派生**：原词词位与候选的词位之间存在 WordNet **词级** `+` 边；允许查询已记录边的两个方向。可在候选端继续应用有证据的屈折，因此 `vulnerable → vulnerability → vulnerabilities` 合法。副词/形容词之间的 `\` 只在源是副词、目标是形容词的文档语义下作为直接派生，不接受形容词到名词的普通 pertainym 作为派生证据。
4. 输入本身是屈折形式时，可以经同一可靠屈折过程解析源词位；不得只从拼写相似强制取第一个 lemma。若多个合法分析只关联同一输入目标，记录集合；若引起目标间归属冲突则按 §5 失败。
5. 不查同义 synset、上下位、`&` 相似、`!` 反义或任意多跳图来证明覆盖；不以编辑距离、公共前缀/词根或模型解释作兜底。形态链最多一次派生边，外加源/目的的屈折；普通反义/否定前缀不能靠拼接放行。

WordNet 的词级关系由 source/target word index 指向特定词，不能把同一 synset 中所有同义词扩成等价映射。[词法关系](https://wordnet.princeton.edu/documentation/wninput5wn)、[指针格式](https://wordnet.princeton.edu/documentation/wndb5wn)

### 4.3 屈折规则的安全边界

不能直接把 WordNet Morphy 的“能还原成某个词”作为正确拼写证明：官方说明它能把非词也还原到词。要求候选通过正向规则回算/异常对检查，并按词性执行；已知不规则项以已审阅异常集合优先，不能用通用后缀重新放行 `readed/childs`。[Morphy 与局限](https://wordnet.princeton.edu/documentation/morphy7wn)

实现应把 v2 中一套无词性后缀规则拆成名词复数、动词第三人称、过去式和分词规则；保留有依据的双写/例外，不把它推广成任意 CVC 双写。规则至少覆盖 `agree/agreed/agreeing`、`die/dying`、`prefer/preferred`，并拒绝 `agreeed/prefered`。比较级/最高级先接受异常对或明确可验证形式，不能假设所有形容词均可直接加 er/est。

对没有 WordNet 词性的条目，仍接受原词和已有审阅异常对；新的规则式/派生式声明若缺乏证据，返回 unknown，不临时发起 AI 判断。版本化手工异常可作为未来维护补充，但不是本次预先让 AI 生成全词库白名单。

### 4.4 保证范围

独立证明的是“词法资料/规则支持该关系”，不是“该句用法、词义和语法完全正确”。多义词可能有合法关系却用错语境；未知新词也可能英语正确但资源缺失。两者分别需要定向质量评阅和将来词法资源维护。

仅在目标关系校验时使用词法资源。对普通正文 token 查不到词法信息不报错；对已声明候选关系查不到依据则拒绝该批。此覆盖边界需用户批准，不能通过 unknown 一律接受来隐藏缺口。


## 5. 出现位置、漏报和冲突

独立词法规则、补扫和归属不变，坐标源由“模型原文”明确为“仅移除标记后的干净正文/提示”：

1. 解析出的每个声明必须有紧邻、完整且可独立证明关系的实际形式；错误声明使整批失败，不剔除它来换取通过。
2. 在clean passage和每项clean hint分别扫描原词与全部已知屈折/直接派生。模型重复标记不重复计位置，漏标的已知形式仍挖空；至少一个有效声明及至少一个实际位置才能满足各段覆盖。
3. rune/code point、0基半开区间、大小写不改写原文、组合字符/词边界、多词完整匹配、最长同目标嵌套形式和稳定排序沿当前实现。
4. 全部目标扫描后统一检查正文跨目标重叠，不能由标注抢占。提示坐标独立，全部本目标位置挖空；复习仍一个原词答案，不增加题数。
5. 最终复算surface等于clean text子串。正文和hint去标注以外的拼写、空白、标点不改写；不能把源词括注算入词数、存储或复习题面。

## 6. 保存、API和事务

保持公开API v1.5及ValidatedBatch当前形状：Entry、EntryMeaning、HintPhrase、HintOccurrences、PassageOccurrences。模型标注及内部声明只在内存中，普通日志/草稿/正式表/公开DTO不新增其字段。current-only快照读写不增加旧格式路径；既有validator_version是来源元数据，不用新算法重算已验证记录。

代码依赖已只读核对：generation.CompleteValid → ValidateSnapshot/json.Marshal，learning.createBatch → DecodeSnapshot/occurrence表，review → 保存的文字与位置。模型候选数组没有持久化消费者。因此不需要SQL、前端DTO或UI改动，不启动先前的一次性数据清理，也不重新验证不相关全站内容。实际保存/复习链路须在隔离环境实测，不能以此分析替代测试。

T2/T3/T4/T5、CSRF/Origin、组模型/额度/词库预检、单活跃生成、取消CAS与产品额度结算保持。系统失败退款且无草稿；主动取消不退；有效结果正常计数。不新增自动重试、供应商切换或模型费用退款承诺。

## 7. 错误和可观测性

| 问题 | 内部低基数原因 | 对外 |
| --- | --- | --- |
| 旧数组/额外字段/null/重复key等 | schema_error | 沿既有结构失败，不保存、退额度 |
| 未闭合/嵌套非法/原词标识错误的标记 | annotation_syntax_invalid / annotation_source_unknown | 既有schema/protocol或content失败类别，不回传原文 |
| 正文/本hint没有有效标注 | passage_annotation_missing / hint_annotation_missing | content_validation_failed、退额度 |
| 标注与本hint目标不一致 | annotation_target_mismatch | content_validation_failed、退额度 |
| 紧邻词形关系未知/不成立、词边界不匹配 | mapping_relation_unknown / mapping_relation_rejected / mapping_surface_absent | content_validation_failed、退额度 |
| 目标缺失或跨目标冲突 | 现有passage_target_missing / hint_occurrence_missing / passage_occurrence_collision | 原行为不变 |

错误对象只含reason和target ordinal；不得把原词、surface、候选片段或prompt拼入日志/错误。用户界面错误文案不新增技术术语。当前114捕获已消费、原文已删除；不续期/重启采集，不额外保留失败正文。本次纯离线测试不得挂真实票据/密钥。

## 8. 版本、部署与恢复

prompt/schema m001-v5，validator m001-v5-wn31-r1；词法资产及其关系算法不更新。常规生成与管理员探针同一协议：learn提示包含learning/learned/learning就地标注；vulnerable正文使用vulnerability(vulnerable)。探针仍一次显式调用，不在启动/升级时自动执行或重置用户模型。

无旧数组解析器、无版本双读、无重算历史数据、无迁移/清库。保存形状不变是复用现有当前合同，不新增历史兼容代码或承诺；不能拿v4真实样本充当v5质量证据。普通部署不动模型/分配/凭据，也不调用模型。

实际替换UAT后端需另核授权和在途请求；先完成开发/QA，明确精确镜像与恢复办法再部署，前端/nginx/PG不因本变更重建。失败时停止新候选发布，保留数据；不以回滚理由运行旧数组fallback。真实生成质量和新版模型探针仍需单独样本/预算授权。

## 9. 资源与性能

复用只读词法索引，禁止逐目标遍历整个词典或预生成全词库映射。解析检查context，避免对每个标记重新扫描完整短文；保留原16MiB资源防护和clean长度规则。流式逐块测试除正确性外检查长待定括号、超限、取消与长文本耗时。不得以测试工具超时新增产品总生成时限。

## 10. 实现切片（backend-ethan）

1. internal/ai：移除Candidate两个数组字段，v5 prompt/schema/严格解码/探针一致；增加共用标注解析/流式清理，Validator在clean text上验证与定位。
2. 更新相关开发fixture与单测，包括原词/异形/多词、错误标记、旧数组拒绝、JSON/SSE任意切块及Unicode；不增加生产兼容辅助转换器。
3. 定向HTTP/保存/复习/CAS与失败结算验证，诊断测试仅随Candidate变更维护、不得启用真实捕获；普通构建/诊断构建均可编译。
4. 单工作区顺序实施，契约与fixture强耦合，不拆并行worktree；保留所有用户未提交文件。交付当前开发报告与交接，后续QA按不同层级补验证，不机械重复全部单测。

## 11. 定向验收（不是已通过结果）

| ID | 当前协议预期 |
| --- | --- |
| C39-01/02/03 | 输入词库仍只限制选词；正文普通词不受词库约束，vulnerable/vulnerability合法关系保留 |
| C39-04/05/06 | 原词、屈折、直接派生、多词和不规则边界沿已批准词法资产；伪造/无关/错拼不能凭标记放行 |
| C39-07 | 三字段target严格结构；旧数组/双协议/缺失/null/重复key拒绝；每目标每段有效标记非空 |
| C39-08/09 | 重复/大小写/漏标已知形式全量补扫；错source、错误紧邻形式或串hint不能被补扫掩盖 |
| C39-10/11 | 全目标归属冲突保持；emoji/组合字符/非ASCII标点/多词位置对应clean text，可逐个复算 |
| C39-12 | SSE/JSON任意分块累计clean delta等于最终clean passage，标注从不发出；普通括注保留；半标记/截断不flush |
| C39-13 | 失败/主动取消/断线/迟到完成单终态与额度不变，零自动重试 |
| C39-14/15 | 当前形状生成→save/claim→详情→原词/短文复习；全部hint位置及匿名组不变，不测试或承诺旧数组兼容 |
| C39-16/17 | 普通/诊断构建、固定探针stub共用v5；原始标记/候选/答案不进入公开DTO、日志或持久化 |
| C39-18 | 长文本/待定括号/容量/取消测量；真实语言质量与确定性结构单列，未知关系不放宽 |

CR-040的原词释义三语言断言和直通复用既有fixture；本文不授权全模型矩阵或真实调用。此前24项QA-only数组剔除检查属于未采用假设，不能算作上述测试。

## 12. 交付

当前只完成技术设计及代码依赖核对；没有修改代码、执行应用测试/数据库/模型或部署。无新增需要用户选择的产品取舍；下一门可按USER-HANDOFF-CONTINUOUS-001接收backend-alex原件并交backend-ethan实现。实施若发现自然括注/多词边界无法满足本方案，应报告真实冲突，不静默删文本或放宽校验。CR039/040及新协议质量仍未验收。
