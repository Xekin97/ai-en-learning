# AGT consumer-ai-web 2.0.0 采用记录

- 编号：`AGT-PROFILE-UPGRADE-2-20261019`
- 状态：CONFIRMED；用户于 2026-10-19 直接要求“升级当前 ai-en 项目的 agt 配置到 consume2.0”。本项目将该简称解析为 `consumer-ai-web@2.0.0`。
- 记录时间：`2026-10-19T02:03:03Z`
- 当前配置：[项目清单](project.yaml)、[角色注册表](agents.yaml)、[工作流状态](../workflow/state.yaml)。

## 锁定来源与恢复

| 项目 | 升级前 | 升级后 |
|---|---|---|
| Profile | `consumer-ai-web@1.0.0` | `consumer-ai-web@2.0.0` |
| 基座 Git revision | `b5badf88cd7194400c3d4d0e9395e7c98490dc26` | `91d98055ec49c877cc03473e479bcc6a9f371af6` |
| Profile SHA-256 | `9d9258ebc8cba13f5df2f8289fa81e973e60af9f10e5ca126fd83482aa0c050f` | `a5c2384b20727264713c901ed8da7a1199e653591cd21d5ea924930c53e4dc8e` |

基座仓库仍为 `../agt-coding-v2`，来源路径为 `profiles/consumer-ai-web/PROFILE.yaml`。采用 2.0.0 的发布提交 `91d9805`；迁移时基座 HEAD 为 `4bccd6eb453c271b85c6e4ca0363e13ecf71eee4`，其中 Profile 已是 2.1.0，不能直接把其工作树文件当作本项目版本。项目保存[原字节快照](profiles/consumer-ai-web/PROFILE.yaml)，摘要与锁定提交一致。

从产品根目录按锁定 revision 读取基座契约、角色、Skill 和模板，例如：

```sh
git -C ../agt-coding-v2 show 91d98055ec49c877cc03473e479bcc6a9f371af6:core/role-contract.md
git -C ../agt-coding-v2 show 91d98055ec49c877cc03473e479bcc6a9f371af6:core/design-delivery.md
git -C ../agt-coding-v2 show 91d98055ec49c877cc03473e479bcc6a9f371af6:.agents/skills/agt-uiux-design/SKILL.md
```

需要运行基座工具时将该 revision 用 `git archive` 解包到临时目录，在该目录运行；保持共享基座工作树不变。Profile 的角色/Skill/模板路径相对于该基座版本，不能相对于产品快照目录解析。

2026-10-19 用户随后明确要求补上下文收尾及 AGT 机制，已叠加采用[上下文维护修订](context-maintenance-adoption.json)。按该清单校验 patch SHA 和逐文件摘要，将同目录 `context-maintenance-v1.patch` 应用到上述锁定版本后读取契约。该补丁仅修改六份整理相关契约/模板，Profile 仍为 2.0.0，不使用基座 HEAD 的2.1可选工作流。应用示例：在解包的基座目录运行 `git apply /绝对产品路径/.planning/agt/context-maintenance-v1.patch`；先用 `git apply --check` 核对。

用户随后要求提供类似 `gsd-quick` 的更细开发粒度，已增量采用 [AGT Quick](quick-tasks-adoption.json)，入口配置为 [quick-tasks.json](quick-tasks.json)。恢复顺序是锁定 revision → `context-maintenance-v1.patch` → `quick-tasks-v1.patch`；每一步先校验清单中的 SHA，再在解包目录执行 `git apply --check` 和 `git apply`，核对逐文件补丁后摘要。第二份补丁以第一份已应用为前提，新增 Quick Skill、协议、模板及工具，并补充有界任务的角色/工作流例外；不读取 sibling HEAD 来替代这条版本链。

随后从该解包基座读取 `.agents/skills/agt-quick/SKILL.md`，并运行 `node <解包基座>/adapters/quick/agt-quick.mjs list --project <产品绝对路径>`。明确的小任务可直接使用 Quick，M002 继续保持完成；任务记录位于 `.planning/quick/`，首次任务才创建目录。新里程碑、重要新决定、人工接受及提交发布各自遵循已有授权。Quick 默认使用当前会话，不改模型锁或自动调用阶段模型启动器。

用户进一步指出 Quick 必须把产品、设计、技术方案变化回落到文档群，当前采用范围已包含影响评估、任务内责任角色、正式正文回写与收尾检查。每项受影响正文有责任任务及上游依赖；由已授权 agent 或明确记录的串行责任执行处理，保留原版本与决定来源。仅写 Quick 摘要不能替代正式文档，缺失或过期回执会阻止验收/收尾；串行处理不算独立 QA。此扩展仍不改变 M002 的原审批与完成状态。

用户随后要求补齐 Quick 的上下文语义整理与归档。当前 Quick 补丁同时包含：责任正文收敛 → `compact` 整理回执 → `finish` 必需检查；默认 `show/resume` 返回精简视图，显式 `--history` 展开历史。原件按版本/摘要追溯，重复整理相同输入不改写；内容、证据或责任回执变化使整理失效。独立接续试验未执行时单列 NOT_RUN，不以静态通过冒充实际效果。补丁顺序和 Profile 锁保持上述版本链。

2026-10-21 用户要求清理 ai-en 测试截图并调整 AGT 规则，Q007 增量采用[证据留存补丁](evidence-retention-adoption.json)。**完整恢复顺序现为锁定 revision → `context-maintenance-v1.patch` → `quick-tasks-v1.patch` → `evidence-retention-v1.patch`**；最后一份补丁的 SHA、前置版本和四份文件摘要均在采用清单中，仍须逐步 `git apply --check`、应用并校验。该补丁只区分临时图片、未决证据、必要正式证据和可按版本恢复的历史图片，替代先前“全部测试图片永久留在工作树”的宽泛解释；不会修改 Quick 原始记录的完整性要求。产品 Profile 2.0、模型锁和当前 M003 阶段保持原样，清理不覆盖此前审批或未验证结论。历史图片定位见[恢复入口](../milestones/M002/verification/screenshot-archive.md)。本段及采用清单记录该增量规则，不使用 sibling HEAD 替代锁定来源链。

升级前产品提交为 `ce42e8726f7cf765a37afb574fe46f15b5d47f62`，本次涉及的五份已有文件在写入前均与该提交逐字节一致。原 `INIT-PROFILE-001` 选择、控制面及 README 可通过 `git show <产品提交>:<路径>` 恢复；旧 Profile 可从旧基座 revision 恢复。原关闭证据中的 1.0.0 快照保留作历史依据。回退时仅恢复本次锁定字段和入口，并追加配置回退记录，保留后续工作及历史事件。

## 差异与采用范围

Profile 的结构版本仍为 `schema_version: 1`，角色、阶段、角色顺序、迁移规则与 AI 契约保持一致。唯一新增的必需路径属于 `uiux-design`：

- `.planning/milestones/{milestone}/design/design-spec.md`：可定位的设计入口、批准范围、资源/状态与验收映射。
- `.planning/milestones/{milestone}/design/copy.json`：共享固定文案与动态模板，顶层 `static`、`templates` 均为键到字符串的映射。

同时采用锁定基座中共同契约、角色、Skill 与模板的上下文读取、需求确认、文档整理和设计交付规则。设计由 UI/UX 维护唯一来源，前端架构记录接收映射，前端实现复用文案/资源并自检，QA 按批准范围验证；使用既有交接、覆盖矩阵和报告。模型调度仍沿用[已启用的 v1 锁](model-routing-v1.lock.json)及[原采用决定](model-routing-adoption-001.md)，不以基座默认策略替换它。

生效范围为本次升级后的已授权工作。M001、M002 的已完成阶段仍按原批准记录解释；本次不会追溯重验、重写设计或重开里程碑。若后续任务涉及设计交付，责任角色按 2.0 契约核对并补齐受影响范围；新里程碑仍须用户明确授权。

| 现有产物 | 迁移核对 | 后续处理 |
|---|---|---|
| M001 顶层设计规格、文案 | 两个新增路径均缺失；M001 已按 1.0 完成 | 保留旧验收；后续明确涉及该设计时，由 UI/UX 按批准任务补齐受影响范围 |
| [M002 设计规格](../milestones/M002/design/design-spec.md)、[文案](../milestones/M002/design/copy.json) | 两个路径已存在，文案 JSON 结构符合新契约 | 本次只核对存在性与结构；设计内容、工程复用及视觉一致性沿原证据，不冒充重新验收 |

M002 保持 `milestone-complete / complete`，无活动角色；`last_transition` 仍是 `TRANSITION-M002-146`。历史仅新增独立的 `configuration_changes` 配置采用事件，既有阶段迁移正文保留。

[项目 QA 职责边界](qa-scope-policy.md)、现有兼容/删除政策、保留事项和里程碑授权约束继续有效。QA 仍只验证功能和实现，文章质量、模型语义漏判不纳入 QA。本次不采用 2.1 的需求并行配置，不改变模型路由锁、业务代码、运行服务或部署。

## 校验

目标 revision 的原版 Profile 校验器通过。系统 Ruby 2.6 不支持校验器使用的 `filter_map`；改用已安装的 Homebrew Ruby 3.4.1 运行，无需修改校验器或全局配置。

迁移完成检查包括：Profile 快照/摘要/版本一致，四份控制 YAML 可解析且锁定一致，角色与终止状态符合 Profile，既有状态、政策、角色元数据与历史迁移保留，新增引用可达。配置升级不涉及产品运行行为，无需重跑应用构建或全站 UAT。
