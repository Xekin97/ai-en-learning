---
milestone: M001
stage: verification
review_status: functional_uat_accepted_ai_quality_authorized
decision_id: TRANSITION-M001-088
agent_name: gatekeeper-owen
date: 2026-09-07
---

# 功能UAT通过；真实模型造文质量专项

CONFIRMED：用户明确表示“UAT 测试结果通过”，要求配置此前提供的测试OpenRouter Key与模型，并明确本阶段核心为造文质量，避免重复全方位覆盖测试。

当前与下一角色均为verification / quality/base / qa-quinn；从awaiting_user_review回到active，只开展本次限定专项。功能UAT086记user_accepted=true，不完成里程碑、不批准生产发布。

## 原始交付与门检

[UAT086交接](../verification/uat-086-handoff.md)、[087门](./verification-uat-086-handoff-approval.md)、[QA085](../verification/cr037-cr038-085-report.md)、[AI已知边界](../verification/ai-evaluation.md)。Profile与语义角色一致，五项必需质量产物齐全，开放CR为空；用户对既有功能的接受已明确。旧083连续授权仍保持已耗尽，不借本次恢复整个旧流程。

## 新授权与限制

- 配置用户指定 `deepseek/deepseek-v4-flash-0731` 和此前测试Key，仅服务端加密保存；不复述/写入源码、日志、报告或命令参数，不把Key发给无关端点。密钥通过无回显stdin送入配置进程。
- 已只读确认当前providerBase为 `http://host.docker.internal:6002/v1`，进程是既有 `mock-openrouter.mjs`。允许为本地UAT真实调用改为 `https://openrouter.ai/api/v1`，保留实际运行参数，仅重建同固定镜像的backend并重载既有Nginx；备份、无active生成检查、不迁移/不改源码/不重建DB与frontend。
- 用正式管理员API配置凭据、创建或复用精确指定模型、正常兼容性探针后启用，不能跳过验证或改用另一模型。最多一次启用探针与四次代表造文调用；不自动重试，不跑3×4×4矩阵。出现鉴权/余额/兼容阻塞时据实停止，不另换Key/model或绕过守卫。
- INFERRED最小开放范围：将新模型加入正式账号basic组；保持额度、词数上限、长度策略及其他组不变，不自动向访客开放真实消费。确认旧 `provider/integration` 是模拟模型时可停用但不删除，避免它被展示为真实可用；其他真实模型状态不可改。
- 仅测造文质量与必要的真实链路可用性：自然度、语法、连贯、场景、目标词与词形、情境释义、提示短语、短文标签、语言与篇幅。4个代表样本覆盖中英日和四场景，使用当前组允许长度，不为覆盖而扩大权益。
- 保存完整有效短文/释义/短语/标签与输入到本轮JSON和可读Markdown，方便用户人工检查。不得将测试样本混入已有用户复习库；可以创建明确标识的专用质量账号保留本轮样本，交付说明账号及新增数据。
- 不跑unit/lint/build/全站UI/权限/账号/复习回归，不重开已通过CR。发现问题只报告证据与责任，不擅改prompt、validator、产品、设计、API或实现。
- 结论为有限样本质量判断，不声明统计稳定性或发布通过；既有发布矩阵/真机等未覆盖项保持说明，不把本次范围缩减反写为旧标准已全通过。
- 本次任务结束在配置状态、质量原始样本与专项报告交付；不自动启动返工或发布。

实施任务包：`.planning/agt/tasks/ai-quality-088.json`。按已启用模型路由，密钥与独立质量判断为high / strong；复用qa-quinn的显式Sol High任务，requested与actual证据分开记录。

## 执行澄清：测试工具等待时间（2026-09-07T06:27:28Z）

用户补充：“从我之前测试来看 30s 是不太够的，接口生成会慢至1~2分钟”。首次启用请求被QA客户端默认30000ms超时中断，不能将其记作模型不兼容或产品响应时限。

- 仅将QA工具等待时间调整为300000ms；不修改产品源码、服务超时或生成协议。
- 先只读确认首次请求状态，禁止与仍在处理的请求重复调用。若后台已成功启用，保持原四篇样本方案；若确认仅因QA客户端中断且模型仍未启用，允许一次明确恢复启用检查，使用现有加密凭据，不再读取Key原文。
- 总推理请求上限仍为5。若发生恢复探针，按“首次中断1 + 恢复探针1 + 3篇样本”执行；优先三种释义语言及不同篇幅、场景，未覆盖第四场景如实保留，不额外补矩阵。
- 真实鉴权、余额、上游或结构兼容失败仍停止；不自动重试或绕过验证。保留首次QA方法错误的脱敏记录，异常只允许受控类别、路径和超时值，不持久化请求Cookie/CSRF等敏感头。

## 用户补充的必测词组

用户随后指定两组：①Alleviate, Undermine, Facilitate, Deteriorate, Perceive；②Sustainable, Prevalent, Vulnerable, Ambiguous, Coherent。

这两组替换原代表样本，不增加推理总预算。仅规范化大小写并先查冻结词库；正文每篇覆盖对应全部五词，但不限制出现顺序或自然词形。第一组优先中文释义/讨论/中篇；第二组优先英文释义/新闻/长篇，遵循现有basic组长度权益。新闻样本为AI语言学习示例，不作为真实新闻。第三篇若可执行则采用单词对照/日文释义/故事/短篇；未覆盖的场景、篇幅继续如实说明。

独立样本执行澄清：正常兼容性检查通过后，某篇`content_validation_failed`不取消余下不同输入的既定样本。保留失败、不重试同一输入，按原总上限继续用户第二组及第三篇；真实鉴权/余额/服务普遍不可用才停止。不可见的原始释义不得仅据服务端校验分类推定为模型翻译错误。
