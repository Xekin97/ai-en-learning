# WordWeave 模型路由启用记录

- 编号：AGT-MODEL-ROUTING-001
- 状态：CONFIRMED
- 日期：2026-09-07
- 策略：codex-balanced@1.0.0
- [不可覆盖的 v1 模型锁](./model-routing-v1.lock.json)
- [来源摘要与启用验证](./model-routing-adoption-001.json)

## 用户批准

用户明确回复：“启用吧，然后继续原先的进度”。本记录启用上一轮已实现的可选模型路由；原项目进度的有限返工另见[082门检](../milestones/M001/reviews/verification-cr037-cr038-rework-approval.md)。

## 生效范围

从本次启用后的角色启动和任务分配起，完整读取基座 core/model-routing.md，并显式使用本锁。绑定为：frontier = GPT-6 Astra / high，strong = GPT-5.6 Sol / high，balanced = GPT-5.6 Terra / medium，economy = GPT-5.6 Luna / medium；纯测试命令交工具。任务类别、风险下限和有证据失败次数共同决定选择；模型档位不改变职责或验收标准。

现有 consumer-ai-web@1.0.0 及其 SHA、agt_base.git_revision 保持不变。当前适配器与共同契约改动尚未提交到基座锁定 revision，故明确采用本地工作树叠加版本，具体文件 SHA 记录于 JSON；这不是 Profile 迁移，不采纳或覆盖不相关工作树修改。文件发生变化需重新核对来源与兼容性，不能称其为旧 git revision 内的内容。

## 本次验证与实际运行

- 当前 Codex CLI 0.153.4；model/list 实时发现成功，四档模型与 effort 均可用。此元数据接口的字段依据 [OpenAI Docs](https://learn.chatgpt.com/docs/app-server#list-models-modellist)。
- 版本化锁生成成功；check-updates 无策略/CLI/模型能力差异或阻塞。
- CR038 涉及密码端点/共享缓存响应规则，至少 high；coding 解析为 gpt-5.6-sol / high。CR037-03 后续也按密码错误/会话关联的 high 风险处理，不能只因改动少降为普通任务。
- 解析结果是 requested_model；actual_model = not_observed。本轮没有运行 codex exec --run，没有创建模型推理 turn，也未自动派生子代理或改动当前 App 聊天的模型。
- 后续经适配器 launch（显式传入本锁及有边界的任务包）开启新 CLI 任务；默认 dry-run。在 App 内工作时，由支持模型覆写且已获委派授权的宿主执行，或由用户手动选择，不假称自动热切换。

## 模型更新与权限

每次 launch / check-updates 实时检查当前清单；失效即阻塞，不静默回退、不自动改成 latest。新增/升级模型经过官方核实、代表任务评估与用户确认后生成 v2 锁，保留 v1。未启用后台轮询、全局预算/用量收集，也不宣称已测得节省比例。

本次没有修改全局 Codex 配置、产品 OpenRouter 模型或密钥、业务源码、设计/API、UAT6001 环境。模型路由采用不是部署、阶段自动批准或发布授权。
